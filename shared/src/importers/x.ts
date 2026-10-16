import { parseCsvObjects } from '../csv.ts';
import type { ImportResult, ImportedContact } from '../types.ts';

/**
 * Parses X (Twitter) data:
 *  1. Archive files data/follower.js and data/following.js:
 *     window.YTD.follower.part0 = [{ "follower": { "accountId": "123", "userLink": "https://twitter.com/intent/user?user_id=123" } }]
 *     These only contain account IDs; the X API connector can resolve them to names later.
 *  2. A CSV export with username / name columns (e.g. from third-party tools).
 *  3. A plain JSON array of { id, username, name, description, profile_image_url } (X API v2 shape).
 */
export function parseXData(text: string, filename = ''): ImportResult {
  const trimmed = text.trimStart();
  const warnings: string[] = [];
  const contacts: ImportedContact[] = [];

  const ytd = /window\.YTD\.(\w+)\.part\d+\s*=\s*/.exec(trimmed);
  if (ytd) {
    const kind = ytd[1]; // follower | following
    const json = trimmed.slice(ytd.index + ytd[0].length).replace(/;\s*$/, '');
    try {
      const arr = JSON.parse(json) as Record<string, Record<string, string>>[];
      for (const entry of arr) {
        const inner = entry[kind] ?? Object.values(entry)[0];
        if (!inner) continue;
        const id = inner.accountId;
        if (!id) continue;
        contacts.push({
          source: 'x',
          externalId: id,
          url: inner.userLink,
          displayName: `X user ${id}`,
          categories: ['social'],
          tags: [kind === 'follower' ? 'x:follower' : 'x:following'],
        });
      }
    } catch {
      warnings.push(`Could not parse ${filename || 'the X archive file'}.`);
    }
    if (contacts.length) warnings.push('X archive files only contain account IDs. Add an X API bearer token in Settings → Integrations to resolve names and avatars.');
    return { contacts, interactions: [], warnings };
  }

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const arr = Array.isArray(parsed) ? parsed : ((parsed as { data?: unknown[] }).data ?? []);
      for (const u of arr as Record<string, string>[]) {
        if (!u.username && !u.name) continue;
        contacts.push(apiUserToContact(u));
      }
      return { contacts, interactions: [], warnings };
    } catch {
      warnings.push('Not valid JSON.');
    }
  }

  const rows = parseCsvObjects(text);
  for (const r of rows) {
    const username = (r['username'] ?? r['Username'] ?? r['handle'] ?? r['screen_name'] ?? r['Handle'] ?? '').replace(/^@/, '');
    const name = r['name'] ?? r['Name'] ?? r['Display Name'] ?? username;
    if (!username && !name) continue;
    contacts.push({
      source: 'x',
      handle: username || undefined,
      externalId: r['id'] ?? r['ID'] ?? username,
      url: username ? `https://x.com/${username}` : undefined,
      displayName: name || `@${username}`,
      location: r['location'] || undefined,
      notes: r['description'] || r['bio'] || undefined,
      categories: ['social'],
    });
  }
  if (!contacts.length) warnings.push('No X accounts found. Expected follower.js / following.js from an X archive, or a CSV with a username column.');
  return { contacts, interactions: [], warnings };
}

export function apiUserToContact(u: Record<string, string>): ImportedContact {
  return {
    source: 'x',
    externalId: u.id,
    handle: u.username,
    url: u.username ? `https://x.com/${u.username}` : undefined,
    displayName: u.name || `@${u.username}`,
    avatarUrl: u.profile_image_url,
    location: u.location || undefined,
    notes: u.description || undefined,
    categories: ['social'],
  };
}
