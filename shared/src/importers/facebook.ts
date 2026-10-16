import type { ImportResult, ImportedContact } from '../types.ts';

/**
 * Parses Facebook's "Download your information" JSON exports:
 *   friends_and_followers/friends.json  → { friends_v2: [{ name, timestamp }] }
 *   (older)                             → { friends:    [{ name, timestamp }] }
 *   followers.json / following.json     → { followers_v3 / following_v3: [...] }
 * Facebook double-encodes UTF-8 names as Latin-1; `fixMojibake` repairs that.
 */
export function parseFacebookJson(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { contacts: [], interactions: [], warnings: ['Not valid JSON. Expected friends.json from a Facebook data download.'] };
  }
  const contacts: ImportedContact[] = [];
  const warnings: string[] = [];
  const obj = (data ?? {}) as Record<string, unknown>;
  const lists: { key: string; items: unknown[]; tag: string }[] = [];
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (Array.isArray(v)) {
      const tag = key.startsWith('follow') ? key.replace(/_v\d+$/, '') : 'friends';
      lists.push({ key, items: v, tag });
    }
  }
  if (Array.isArray(data)) lists.push({ key: 'root', items: data as unknown[], tag: 'friends' });
  if (!lists.length) warnings.push('No friends list found in this JSON.');
  for (const list of lists) {
    for (const item of list.items) {
      const it = (item ?? {}) as Record<string, unknown>;
      const rawName = typeof it.name === 'string' ? it.name : typeof it.title === 'string' ? it.title : '';
      const name = fixMojibake(rawName).trim();
      if (!name) continue;
      const ts = typeof it.timestamp === 'number' ? new Date(it.timestamp * 1000).toISOString() : undefined;
      const uri = typeof it.uri === 'string' ? it.uri : undefined;
      contacts.push({
        source: 'facebook',
        displayName: name,
        url: uri,
        externalId: uri ? uri.replace(/^https?:\/\/(www\.)?facebook\.com\//, '') : undefined,
        connectedAt: ts,
        categories: list.tag === 'friends' ? ['personal'] : ['social'],
        tags: list.tag === 'friends' ? [] : [`facebook:${list.tag}`],
      });
    }
  }
  return { contacts, interactions: [], warnings };
}

/** Facebook exports UTF-8 bytes re-encoded as Latin-1 ("Ã©" for "é"). Reverse it when it looks like that happened. */
export function fixMojibake(s: string): string {
  if (!/[Â-ô][\u0080-¿]/.test(s)) return s;
  try {
    const bytes = Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return s;
  }
}
