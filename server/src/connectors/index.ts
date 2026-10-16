import type { ImportResult, ImportedContact, Provider, Workspace } from '@shared/types.ts';
import { buildEmailImport, parseAddresses, type MailMessage } from '@shared/importers/email.ts';
import { apiUserToContact } from '@shared/importers/x.ts';
import { normalizeEmail } from '@shared/util.ts';
import { fetchImapMessages, testImap } from './imap.ts';
import { HttpError } from '../http.ts';

/** Describes the configuration form for each provider; rendered by the Settings page. */
export interface ProviderSpec {
  provider: Provider;
  name: string;
  description: string;
  docs: string;
  fields: { key: string; label: string; secret?: boolean; placeholder?: string; help?: string; required?: boolean }[];
  /** Which import source a sync feeds. */
  feeds: ('email' | 'contacts' | 'x' | 'facebook' | 'linkedin')[];
}

export const PROVIDERS: ProviderSpec[] = [
  {
    provider: 'imap',
    name: 'Email (IMAP)',
    description: 'Scans your inbox and sent folder for people you actually exchange mail with (both directions). Works with Gmail, Outlook, Fastmail, iCloud and any IMAP server. Use an app password.',
    docs: 'https://support.google.com/accounts/answer/185833',
    fields: [
      { key: 'host', label: 'IMAP host', placeholder: 'imap.gmail.com', required: true },
      { key: 'port', label: 'Port', placeholder: '993' },
      { key: 'user', label: 'Username / email', placeholder: 'you@example.com', required: true },
      { key: 'password', label: 'App password', secret: true, required: true },
      { key: 'days', label: 'Days of history to scan', placeholder: '730' },
    ],
    feeds: ['email'],
  },
  {
    provider: 'google',
    name: 'Google (Gmail + Contacts)',
    description: 'Uses the Gmail API for bidirectional threads and the People API for your contacts. Paste an OAuth access token (scopes gmail.metadata, contacts.readonly) or a refresh token with client credentials.',
    docs: 'https://developers.google.com/gmail/api/guides',
    fields: [
      { key: 'accessToken', label: 'OAuth access token', secret: true, help: 'Short-lived; use the OAuth Playground or your own OAuth app.' },
      { key: 'refreshToken', label: 'Refresh token', secret: true },
      { key: 'clientId', label: 'OAuth client ID' },
      { key: 'clientSecret', label: 'OAuth client secret', secret: true },
      { key: 'query', label: 'Gmail search query', placeholder: 'newer_than:2y -category:promotions' },
    ],
    feeds: ['email', 'contacts'],
  },
  {
    provider: 'microsoft',
    name: 'Microsoft 365 / Outlook',
    description: 'Uses Microsoft Graph (Mail.Read, Contacts.Read) to pull your inbox, sent items and contacts.',
    docs: 'https://learn.microsoft.com/graph/auth-v2-user',
    fields: [
      { key: 'accessToken', label: 'Graph access token', secret: true, required: true },
      { key: 'days', label: 'Days of history', placeholder: '730' },
    ],
    feeds: ['email', 'contacts'],
  },
  {
    provider: 'x',
    name: 'X (Twitter) API',
    description: 'Resolves followers and follows with names and avatars. Needs an API v2 bearer token (free tier works for lookups) and your @username.',
    docs: 'https://developer.x.com/en/docs/x-api',
    fields: [
      { key: 'username', label: 'Your @username', placeholder: 'jack', required: true },
      { key: 'bearerToken', label: 'Bearer token', secret: true, required: true },
      { key: 'maxUsers', label: 'Max accounts per direction', placeholder: '1000' },
    ],
    feeds: ['x'],
  },
  {
    provider: 'facebook',
    name: 'Facebook Graph API',
    description: 'Fetches /me/friends with a user access token. Note: Facebook only returns friends who also use your app; use the JSON download for your full friends list.',
    docs: 'https://developers.facebook.com/docs/graph-api/reference/user/friends/',
    fields: [{ key: 'accessToken', label: 'User access token', secret: true, required: true }],
    feeds: ['facebook'],
  },
  {
    provider: 'linkedin',
    name: 'LinkedIn API',
    description: 'Verifies your LinkedIn profile with an OpenID Connect access token. LinkedIn does not expose your connections list via API — use the Connections.csv export for that.',
    docs: 'https://learn.microsoft.com/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2',
    fields: [
      { key: 'clientId', label: 'Client ID' },
      { key: 'clientSecret', label: 'Client secret', secret: true },
      { key: 'accessToken', label: 'Access token', secret: true, required: true },
    ],
    feeds: ['linkedin'],
  },
];

export const SECRET_KEYS = new Set(PROVIDERS.flatMap((p) => p.fields.filter((f) => f.secret).map((f) => f.key)));

export interface SyncContext {
  ws: Workspace;
  config: Record<string, string>;
  secrets: Record<string, string>;
  log: (msg: string) => void;
}

async function api<T>(url: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { accept: 'application/json', ...(init.token ? { authorization: `Bearer ${init.token}` } : {}), ...(init.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) throw new HttpError(502, `${new URL(url).host} responded ${res.status}: ${text.slice(0, 300)}`);
  return text ? (JSON.parse(text) as T) : ({} as T);
}

/* ---------- test connection ---------- */

export async function testConnection(provider: Provider, config: Record<string, string>, secrets: Record<string, string>): Promise<{ ok: true; detail: string }> {
  switch (provider) {
    case 'imap': {
      const r = await testImap({ host: config.host, port: Number(config.port || 993), user: config.user, password: secrets.password });
      return { ok: true, detail: `Connected. ${r.folders.length} folders: ${r.folders.slice(0, 6).join(', ')}` };
    }
    case 'google': {
      const token = await googleToken(config, secrets);
      const p = await api<{ emailAddress: string; messagesTotal: number }>('https://gmail.googleapis.com/gmail/v1/users/me/profile', { token });
      return { ok: true, detail: `Connected as ${p.emailAddress} (${p.messagesTotal} messages)` };
    }
    case 'microsoft': {
      const me = await api<{ userPrincipalName: string; displayName: string }>('https://graph.microsoft.com/v1.0/me', { token: secrets.accessToken });
      return { ok: true, detail: `Connected as ${me.displayName} <${me.userPrincipalName}>` };
    }
    case 'x': {
      const u = await api<{ data: { id: string; name: string } }>(`https://api.x.com/2/users/by/username/${encodeURIComponent(config.username.replace(/^@/, ''))}`, { token: secrets.bearerToken });
      return { ok: true, detail: `Found ${u.data.name} (id ${u.data.id})` };
    }
    case 'facebook': {
      const me = await api<{ name: string; id: string }>(`https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${encodeURIComponent(secrets.accessToken)}`);
      return { ok: true, detail: `Connected as ${me.name}` };
    }
    case 'linkedin': {
      const me = await api<{ name?: string; email?: string }>('https://api.linkedin.com/v2/userinfo', { token: secrets.accessToken });
      return { ok: true, detail: `Connected as ${me.name ?? me.email ?? 'LinkedIn member'}` };
    }
  }
}

/* ---------- sync ---------- */

export async function syncProvider(provider: Provider, ctx: SyncContext): Promise<{ source: 'email' | 'contacts' | 'x' | 'facebook' | 'linkedin'; result: ImportResult }[]> {
  const emailOpts = { selfEmails: ctx.ws.selfEmails, corporateDomains: ctx.ws.corporateDomains };
  switch (provider) {
    case 'imap': {
      const messages = await fetchImapMessages({ host: ctx.config.host, port: Number(ctx.config.port || 993), user: ctx.config.user, password: ctx.secrets.password, days: Number(ctx.config.days || 730), onProgress: ctx.log });
      const self = [...emailOpts.selfEmails, normalizeEmail(ctx.config.user)];
      return [{ source: 'email', result: buildEmailImport(messages, { ...emailOpts, selfEmails: self }) }];
    }
    case 'google': {
      const token = await googleToken(ctx.config, ctx.secrets);
      const out: { source: 'email' | 'contacts'; result: ImportResult }[] = [];
      const profile = await api<{ emailAddress: string }>('https://gmail.googleapis.com/gmail/v1/users/me/profile', { token });
      const messages = await gmailMessages(token, ctx.config.query || 'newer_than:2y -category:promotions -category:social', ctx.log);
      out.push({ source: 'email', result: buildEmailImport(messages, { ...emailOpts, selfEmails: [...emailOpts.selfEmails, normalizeEmail(profile.emailAddress)] }) });
      try {
        out.push({ source: 'contacts', result: await googleContacts(token) });
      } catch (e) {
        out[0].result.warnings.push(`People API skipped: ${(e as Error).message}`);
      }
      return out;
    }
    case 'microsoft': {
      const token = ctx.secrets.accessToken;
      const messages = await graphMessages(token, Number(ctx.config.days || 730), ctx.log);
      const me = await api<{ mail?: string; userPrincipalName: string }>('https://graph.microsoft.com/v1.0/me', { token });
      const out: { source: 'email' | 'contacts'; result: ImportResult }[] = [{ source: 'email', result: buildEmailImport(messages, { ...emailOpts, selfEmails: [...emailOpts.selfEmails, normalizeEmail(me.mail ?? me.userPrincipalName)] }) }];
      try {
        out.push({ source: 'contacts', result: await graphContacts(token) });
      } catch (e) {
        out[0].result.warnings.push(`Contacts skipped: ${(e as Error).message}`);
      }
      return out;
    }
    case 'x':
      return [{ source: 'x', result: await xFollowers(ctx) }];
    case 'facebook': {
      const contacts: ImportedContact[] = [];
      let url: string | null = `https://graph.facebook.com/v19.0/me/friends?fields=id,name,picture&limit=500&access_token=${encodeURIComponent(ctx.secrets.accessToken)}`;
      while (url) {
        const page: { data: { id: string; name: string; picture?: { data?: { url?: string } } }[]; paging?: { next?: string } } = await api(url);
        for (const f of page.data) contacts.push({ source: 'facebook', externalId: f.id, displayName: f.name, avatarUrl: f.picture?.data?.url, url: `https://facebook.com/${f.id}`, categories: ['personal'] });
        url = page.paging?.next ?? null;
      }
      return [{ source: 'facebook', result: { contacts, interactions: [], warnings: contacts.length ? [] : ['Facebook returned no friends. The Graph API only lists friends who also use your app.'] } }];
    }
    case 'linkedin': {
      const me = await api<{ name?: string; email?: string; picture?: string }>('https://api.linkedin.com/v2/userinfo', { token: ctx.secrets.accessToken });
      return [{ source: 'linkedin', result: { contacts: [], interactions: [], warnings: [`LinkedIn profile verified for ${me.name ?? me.email}. Connections are not available through the API — import Connections.csv instead.`] } }];
    }
  }
}

/* ---------- Google ---------- */

async function googleToken(config: Record<string, string>, secrets: Record<string, string>): Promise<string> {
  if (secrets.refreshToken && config.clientId && secrets.clientSecret) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: secrets.refreshToken, client_id: config.clientId, client_secret: secrets.clientSecret }),
    });
    const data = (await res.json()) as { access_token?: string; error_description?: string };
    if (!data.access_token) throw new HttpError(502, `Google token refresh failed: ${data.error_description ?? res.status}`);
    return data.access_token;
  }
  if (secrets.accessToken) return secrets.accessToken;
  throw new HttpError(400, 'Provide an access token, or a refresh token with client ID and secret');
}

async function gmailMessages(token: string, q: string, log: (m: string) => void): Promise<MailMessage[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await api<{ messages?: { id: string }[]; nextPageToken?: string }>(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=500&q=${encodeURIComponent(q)}${pageToken ? `&pageToken=${pageToken}` : ''}`, { token });
    ids.push(...(page.messages ?? []).map((m) => m.id));
    pageToken = page.nextPageToken;
    log(`Gmail: listed ${ids.length} messages`);
  } while (pageToken && ids.length < 20000);
  const out: MailMessage[] = [];
  const headersWanted = ['From', 'To', 'Cc', 'Subject', 'Date', 'Message-ID', 'In-Reply-To', 'References'];
  let i = 0;
  const worker = async () => {
    while (i < ids.length) {
      const id = ids[i++];
      const m = await api<{ id: string; threadId: string; payload: { headers: { name: string; value: string }[] } }>(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&${headersWanted.map((h) => `metadataHeaders=${h}`).join('&')}`, { token });
      const h = new Map(m.payload.headers.map((x) => [x.name.toLowerCase(), x.value]));
      out.push({
        id: (h.get('message-id') ?? m.id).replace(/^<|>$/g, ''),
        from: parseAddresses(h.get('from') ?? ''),
        to: parseAddresses(h.get('to') ?? ''),
        cc: parseAddresses(h.get('cc') ?? ''),
        subject: h.get('subject') ?? '',
        date: new Date(h.get('date') ?? 0).toISOString(),
        inReplyTo: null,
        references: [`gmail-thread:${m.threadId}`],
      });
      if (out.length % 200 === 0) log(`Gmail: fetched ${out.length}/${ids.length}`);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return out;
}

async function googleContacts(token: string): Promise<ImportResult> {
  const contacts: ImportedContact[] = [];
  let pageToken: string | undefined;
  do {
    const page = await api<{ connections?: Record<string, { value?: string; displayName?: string; givenName?: string; familyName?: string; name?: string; title?: string; url?: string }[]>[]; nextPageToken?: string }>(
      `https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers,organizations,photos&pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ''}`,
      { token },
    );
    for (const p of page.connections ?? []) {
      const name = p.names?.[0];
      const emails = (p.emailAddresses ?? []).map((e) => normalizeEmail(e.value ?? '')).filter(Boolean);
      const display = name?.displayName ?? emails[0];
      if (!display) continue;
      contacts.push({
        source: 'contacts',
        displayName: display,
        firstName: name?.givenName,
        lastName: name?.familyName,
        emails,
        phones: (p.phoneNumbers ?? []).map((x) => x.value ?? '').filter(Boolean),
        company: p.organizations?.[0]?.name,
        title: p.organizations?.[0]?.title,
        avatarUrl: p.photos?.[0]?.url,
        categories: ['personal'],
      });
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return { contacts, interactions: [], warnings: [] };
}

/* ---------- Microsoft Graph ---------- */

async function graphMessages(token: string, days: number, log: (m: string) => void): Promise<MailMessage[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const out: MailMessage[] = [];
  type GMsg = { internetMessageId?: string; id: string; conversationId: string; subject?: string; receivedDateTime: string; from?: { emailAddress: { name?: string; address?: string } }; toRecipients?: { emailAddress: { name?: string; address?: string } }[]; ccRecipients?: { emailAddress: { name?: string; address?: string } }[] };
  const addr = (r?: { emailAddress: { name?: string; address?: string } }[]) => (r ?? []).filter((x) => x.emailAddress.address).map((x) => ({ name: x.emailAddress.name ?? '', email: normalizeEmail(x.emailAddress.address!) }));
  for (const folder of ['inbox', 'sentitems']) {
    let url: string | undefined = `https://graph.microsoft.com/v1.0/me/mailFolders/${folder}/messages?$select=internetMessageId,conversationId,subject,receivedDateTime,from,toRecipients,ccRecipients&$filter=receivedDateTime ge ${since}&$top=500`;
    while (url) {
      const page: { value: GMsg[]; '@odata.nextLink'?: string } = await api(url, { token });
      for (const m of page.value)
        out.push({
          id: (m.internetMessageId ?? m.id).replace(/^<|>$/g, ''),
          from: m.from ? addr([m.from]) : [],
          to: addr(m.toRecipients),
          cc: addr(m.ccRecipients),
          subject: m.subject ?? '',
          date: m.receivedDateTime,
          inReplyTo: null,
          references: [`graph-conv:${m.conversationId}`],
        });
      url = page['@odata.nextLink'];
      log(`Outlook ${folder}: ${out.length} messages`);
      if (out.length > 20000) break;
    }
  }
  return out;
}

async function graphContacts(token: string): Promise<ImportResult> {
  const contacts: ImportedContact[] = [];
  let url: string | undefined = 'https://graph.microsoft.com/v1.0/me/contacts?$top=500';
  while (url) {
    const page: { value: { displayName?: string; givenName?: string; surname?: string; emailAddresses?: { address?: string }[]; mobilePhone?: string; companyName?: string; jobTitle?: string }[]; '@odata.nextLink'?: string } = await api(url, { token });
    for (const c of page.value) {
      const emails = (c.emailAddresses ?? []).map((e) => normalizeEmail(e.address ?? '')).filter(Boolean);
      const display = c.displayName ?? emails[0];
      if (!display) continue;
      contacts.push({ source: 'contacts', displayName: display, firstName: c.givenName, lastName: c.surname, emails, phones: c.mobilePhone ? [c.mobilePhone] : [], company: c.companyName ?? undefined, title: c.jobTitle ?? undefined, categories: ['business'] });
    }
    url = page['@odata.nextLink'];
  }
  return { contacts, interactions: [], warnings: [] };
}

/* ---------- X ---------- */

async function xFollowers(ctx: SyncContext): Promise<ImportResult> {
  const token = ctx.secrets.bearerToken;
  const me = await api<{ data: { id: string } }>(`https://api.x.com/2/users/by/username/${encodeURIComponent(ctx.config.username.replace(/^@/, ''))}`, { token });
  const max = Number(ctx.config.maxUsers || 1000);
  const contacts: ImportedContact[] = [];
  const warnings: string[] = [];
  for (const dir of ['followers', 'following'] as const) {
    let next: string | undefined;
    let n = 0;
    try {
      do {
        const page = await api<{ data?: Record<string, string>[]; meta?: { next_token?: string } }>(`https://api.x.com/2/users/${me.data.id}/${dir}?max_results=1000&user.fields=profile_image_url,description,location${next ? `&pagination_token=${next}` : ''}`, { token });
        for (const u of page.data ?? []) {
          const c = apiUserToContact(u);
          c.tags = [dir === 'followers' ? 'x:follower' : 'x:following'];
          contacts.push(c);
          n++;
        }
        next = page.meta?.next_token;
        ctx.log(`X ${dir}: ${n}`);
      } while (next && n < max);
    } catch (e) {
      warnings.push(`X ${dir}: ${(e as Error).message}`);
    }
  }
  return { contacts, interactions: [], warnings };
}
