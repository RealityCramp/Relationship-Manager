import type { ImportResult, ImportedContact, ImportedInteraction } from '../types.ts';
import { categoryForEmail, normalizeEmail, splitName, uniq } from '../util.ts';

/** A minimal message representation — produced by the mbox/eml parser or by the IMAP/Gmail connectors. */
export interface MailMessage {
  id: string;
  from: Address[];
  to: Address[];
  cc: Address[];
  subject: string;
  date: string; // ISO
  inReplyTo: string | null;
  references: string[];
}

export interface Address {
  name: string;
  email: string;
}

const HEADER_END = /\r?\n\r?\n/;

/** Parses an mbox file (Google Takeout, Thunderbird, Apple Mail export) into header-only messages. Bodies are ignored. */
export function parseMbox(text: string): MailMessage[] {
  const chunks = text.split(/^From .*\r?\n/m).filter((c) => c.trim());
  return chunks.map(parseHeadersBlock).filter((m): m is MailMessage => m !== null);
}

/** Parses a single RFC 822 message (.eml). */
export function parseEml(text: string): MailMessage | null {
  return parseHeadersBlock(text);
}

function parseHeadersBlock(raw: string): MailMessage | null {
  const split = raw.search(HEADER_END);
  const headerText = split >= 0 ? raw.slice(0, split) : raw;
  const headers = parseHeaders(headerText);
  const from = parseAddresses(headers.get('from') ?? '');
  if (!from.length && !headers.get('to')) return null;
  const date = parseDate(headers.get('date') ?? '');
  const id = (headers.get('message-id') ?? '').trim() || `generated:${hash(headerText)}`;
  const refs = (headers.get('references') ?? '')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    id: cleanMsgId(id),
    from,
    to: parseAddresses(headers.get('to') ?? ''),
    cc: parseAddresses(headers.get('cc') ?? ''),
    subject: decodeRfc2047(headers.get('subject') ?? '').trim(),
    date,
    inReplyTo: headers.get('in-reply-to') ? cleanMsgId(headers.get('in-reply-to')!.trim().split(/\s+/)[0]) : null,
    references: refs.map(cleanMsgId),
  };
}

function cleanMsgId(s: string): string {
  return s.replace(/^<|>$/g, '');
}

export function parseHeaders(text: string): Map<string, string> {
  const map = new Map<string, string>();
  const unfolded = text.replace(/\r?\n[ \t]+/g, ' ');
  for (const line of unfolded.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (!map.has(key)) map.set(key, value);
  }
  return map;
}

/** Parses "Name <a@b>, c@d, "Last, First" <e@f>" into address objects. */
export function parseAddresses(value: string): Address[] {
  const out: Address[] = [];
  const decoded = decodeRfc2047(value);
  let cur = '';
  let inQuotes = false;
  let depth = 0;
  const flush = () => {
    const s = cur.trim();
    cur = '';
    if (!s) return;
    const m = /^(.*?)<([^>]+)>\s*$/.exec(s);
    if (m) {
      const email = normalizeEmail(m[2]);
      if (email.includes('@')) out.push({ name: m[1].trim().replace(/^"|"$/g, '').trim(), email });
    } else if (s.includes('@')) {
      out.push({ name: '', email: normalizeEmail(s.replace(/^"|"$/g, '')) });
    }
  };
  for (const ch of decoded) {
    if (ch === '"') inQuotes = !inQuotes;
    if (!inQuotes && ch === '<') depth++;
    if (!inQuotes && ch === '>') depth--;
    if (ch === ',' && !inQuotes && depth <= 0) flush();
    else cur += ch;
  }
  flush();
  return out;
}

/** Decodes RFC 2047 encoded words (=?utf-8?B?...?= / =?iso-8859-1?Q?...?=). */
export function decodeRfc2047(s: string): string {
  return s.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, charset: string, enc: string, data: string) => {
    try {
      let bytes: Uint8Array;
      if (enc.toUpperCase() === 'B') {
        const bin = atob(data);
        bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      } else {
        const arr: number[] = [];
        const q = data.replace(/_/g, ' ');
        for (let i = 0; i < q.length; i++) {
          if (q[i] === '=' && /[0-9A-Fa-f]{2}/.test(q.slice(i + 1, i + 3))) {
            arr.push(parseInt(q.slice(i + 1, i + 3), 16));
            i += 2;
          } else arr.push(q.charCodeAt(i));
        }
        bytes = Uint8Array.from(arr);
      }
      return new TextDecoder(charset.toLowerCase().replace(/^utf8$/, 'utf-8')).decode(bytes);
    } catch {
      return data;
    }
  });
}

function parseDate(s: string): string {
  const cleaned = s.replace(/\s*\([^)]*\)\s*$/, '');
  const d = new Date(cleaned);
  return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export interface EmailImportOptions {
  /** The user's own addresses. Messages from these are outbound; everything else is inbound. */
  selfEmails: string[];
  corporateDomains: string[];
  /** When true (default), only people with at least one inbound AND one outbound message become contacts. */
  bidirectionalOnly?: boolean;
  /** Ignore no-reply / notification senders. Default true. */
  skipAutomated?: boolean;
}

const AUTOMATED = /^(no-?reply|noreply|donotreply|do-not-reply|notifications?|mailer-daemon|postmaster|bounce|alerts?|newsletter|info|support|billing|invoice|marketing|hello|team|news|updates?|digest)[@+.-]/i;

/**
 * Turns parsed messages into contacts + interactions, keeping only people you have actually
 * exchanged mail with in both directions (unless bidirectionalOnly=false).
 */
export function buildEmailImport(messages: MailMessage[], opts: EmailImportOptions): ImportResult {
  const self = new Set(opts.selfEmails.map(normalizeEmail).filter(Boolean));
  const bidirectionalOnly = opts.bidirectionalOnly ?? true;
  const skipAutomated = opts.skipAutomated ?? true;
  const warnings: string[] = [];
  if (!self.size) warnings.push('No "my email addresses" configured for this workspace — every message was treated as inbound, so bidirectional detection is disabled.');

  // Thread resolution: a message belongs to the thread of the first reference, its in-reply-to, or itself.
  const threadOf = new Map<string, string>();
  const byId = new Map(messages.map((m) => [m.id, m] as const));
  const resolve = (m: MailMessage, depth = 0): string => {
    if (threadOf.has(m.id)) return threadOf.get(m.id)!;
    let root = m.id;
    const parentId = m.references[0] ?? m.inReplyTo;
    if (parentId && depth < 50) {
      const parent = byId.get(parentId);
      root = parent ? resolve(parent, depth + 1) : parentId;
    }
    threadOf.set(m.id, root);
    return root;
  };

  type Person = { emails: Set<string>; names: Map<string, number>; inbound: number; outbound: number; last: string; first: string };
  const people = new Map<string, Person>();
  const interactions: ImportedInteraction[] = [];
  const person = (email: string) => {
    let p = people.get(email);
    if (!p) {
      p = { emails: new Set([email]), names: new Map(), inbound: 0, outbound: 0, last: '', first: '' };
      people.set(email, p);
    }
    return p;
  };
  const noteName = (p: Person, name: string) => {
    if (!name) return;
    p.names.set(name, (p.names.get(name) ?? 0) + 1);
  };

  for (const m of messages) {
    const sender = m.from[0];
    const outbound = sender ? self.has(sender.email) : false;
    const direction: 'inbound' | 'outbound' = outbound ? 'outbound' : 'inbound';
    const others = outbound
      ? [...m.to, ...m.cc].filter((a) => !self.has(a.email))
      : sender
        ? [sender]
        : [];
    const participants: string[] = [];
    const participantNames: Record<string, string> = {};
    for (const a of others) {
      if (!a.email.includes('@')) continue;
      if (skipAutomated && AUTOMATED.test(a.email)) continue;
      const p = person(a.email);
      noteName(p, a.name);
      if (outbound) p.outbound++;
      else p.inbound++;
      if (!p.first || m.date < p.first) p.first = m.date;
      if (m.date > p.last) p.last = m.date;
      participants.push(a.email);
      if (a.name) participantNames[a.email] = a.name;
    }
    if (!participants.length) continue;
    interactions.push({ participants, participantNames, direction, subject: m.subject, threadId: resolve(m), occurredAt: m.date });
  }

  // Bidirectional check at thread level: the same person must have sent to you and received from you.
  const contacts: ImportedContact[] = [];
  const kept = new Set<string>();
  for (const [email, p] of people) {
    if (bidirectionalOnly && !(p.inbound > 0 && p.outbound > 0)) continue;
    kept.add(email);
    let bestName = '';
    let best = 0;
    for (const [n, c] of p.names) if (c > best) ((best = c), (bestName = n));
    const display = cleanName(bestName) || email.split('@')[0].replace(/[._-]+/g, ' ');
    const split = splitName(display);
    contacts.push({
      source: 'email',
      externalId: email,
      displayName: display,
      firstName: split.firstName,
      lastName: split.lastName,
      emails: [email],
      connectedAt: p.first || undefined,
      categories: [categoryForEmail(email, opts.corporateDomains)],
      notes: `${p.inbound} received · ${p.outbound} sent`,
    });
  }
  const filtered = interactions
    .map((i) => ({ ...i, participants: i.participants.filter((e) => kept.has(e)) }))
    .filter((i) => i.participants.length);
  if (!messages.length) warnings.push('No messages found. Expected an .mbox (e.g. Google Takeout) or .eml file.');
  return { contacts, interactions: filtered, warnings };
}

function cleanName(name: string): string {
  let n = name.replace(/^"|"$/g, '').trim();
  const m = /^([^,]+),\s*(.+)$/.exec(n); // "Last, First" → "First Last"
  if (m) n = `${m[2].trim()} ${m[1].trim()}`;
  n = n.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+via\s+.*$/i, '').trim();
  return uniq(n.split(/\s+/)).join(' ');
}
