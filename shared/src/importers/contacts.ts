import { parseCsvObjects } from '../csv.ts';
import type { Category, ImportResult, ImportedContact } from '../types.ts';
import { isFreemail, normalizeEmail, normalizePhone, splitName, uniq } from '../util.ts';

/** Detects vCard vs CSV and dispatches. */
export function parseContacts(text: string, filename = ''): ImportResult {
  if (/^BEGIN:VCARD/im.test(text.trimStart()) || filename.toLowerCase().endsWith('.vcf')) return parseVcf(text);
  return parseContactsCsv(text);
}

/** vCard 2.1 / 3.0 / 4.0 parser covering FN, N, EMAIL, TEL, ORG, TITLE, ADR, URL, PHOTO, NOTE, CATEGORIES. */
export function parseVcf(text: string): ImportResult {
  const contacts: ImportedContact[] = [];
  const warnings: string[] = [];
  // Unfold continuation lines (RFC 6350 §3.2)
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const cards = unfolded.split(/^END:VCARD\s*$/im);
  for (const card of cards) {
    if (!/BEGIN:VCARD/i.test(card)) continue;
    const props: { name: string; params: Record<string, string>; value: string }[] = [];
    for (const line of card.split(/\r?\n/)) {
      const m = /^([A-Za-z0-9-]+)((?:;[^:]*)?):(.*)$/.exec(line);
      if (!m) continue;
      const params: Record<string, string> = {};
      for (const p of m[2].split(';').filter(Boolean)) {
        const [k, v] = p.split('=');
        params[k.toUpperCase()] = (v ?? 'true').toUpperCase();
      }
      props.push({ name: m[1].toUpperCase(), params, value: decodeVcfValue(m[3], params) });
    }
    const get = (n: string) => props.filter((p) => p.name === n);
    let displayName = get('FN')[0]?.value.trim() ?? '';
    const n = get('N')[0]?.value.split(';') ?? [];
    const firstName = n[1]?.trim() ?? '';
    const lastName = n[0]?.trim() ?? '';
    if (!displayName) displayName = `${firstName} ${lastName}`.trim();
    const emails = uniq(get('EMAIL').map((p) => normalizeEmail(p.value)).filter(Boolean));
    const phones = uniq(get('TEL').map((p) => normalizePhone(p.value)).filter(Boolean));
    if (!displayName && !emails.length) {
      warnings.push('Skipped a vCard with no name or email');
      continue;
    }
    const org = get('ORG')[0]?.value.split(';')[0]?.trim();
    const adr = get('ADR')[0]?.value.split(';');
    const location = adr ? adr.slice(3, 7).filter(Boolean).join(', ') : undefined;
    const photo = get('PHOTO')[0];
    const avatarUrl = photo && /^https?:/i.test(photo.value) ? photo.value : undefined;
    const name = displayName || emails[0];
    const split = splitName(name);
    contacts.push({
      source: 'contacts',
      displayName: name,
      firstName: firstName || split.firstName,
      lastName: lastName || split.lastName,
      emails,
      phones,
      company: org || undefined,
      title: get('TITLE')[0]?.value.trim() || undefined,
      location: location || undefined,
      avatarUrl,
      url: get('URL')[0]?.value.trim() || undefined,
      notes: get('NOTE')[0]?.value.trim() || undefined,
      tags: get('CATEGORIES')[0]?.value.split(',').map((s) => s.trim()).filter(Boolean),
      categories: inferContactCategories(emails, org),
    });
  }
  if (!contacts.length) warnings.push('No vCards found.');
  return { contacts, interactions: [], warnings };
}

function decodeVcfValue(v: string, params: Record<string, string>): string {
  let out = v;
  if (params['ENCODING'] === 'QUOTED-PRINTABLE') {
    const bytes: number[] = [];
    out = out.replace(/=\r?\n/g, '');
    for (let i = 0; i < out.length; i++) {
      if (out[i] === '=' && /[0-9A-Fa-f]{2}/.test(out.slice(i + 1, i + 3))) {
        bytes.push(parseInt(out.slice(i + 1, i + 3), 16));
        i += 2;
      } else bytes.push(out.charCodeAt(i));
    }
    try {
      out = new TextDecoder().decode(Uint8Array.from(bytes));
    } catch {
      /* keep raw */
    }
  }
  return out.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

/** Google Contacts (old + 2024 layout), Outlook and generic CSV exports. */
export function parseContactsCsv(text: string): ImportResult {
  const rows = parseCsvObjects(text);
  const contacts: ImportedContact[] = [];
  const warnings: string[] = [];
  const pick = (r: Record<string, string>, keys: string[]) => {
    for (const k of keys) if (r[k]) return r[k];
    return '';
  };
  const collect = (r: Record<string, string>, pattern: RegExp, norm: (s: string) => string) =>
    uniq(
      Object.keys(r)
        .filter((k) => pattern.test(k))
        .flatMap((k) => r[k].split(/\s*:::\s*|\s*;\s*/))
        .map((s) => s.trim())
        .filter(Boolean)
        .map(norm),
    );
  for (const r of rows) {
    const first = pick(r, ['First Name', 'Given Name', 'first_name', 'FirstName']);
    const last = pick(r, ['Last Name', 'Family Name', 'last_name', 'LastName']);
    let displayName = pick(r, ['Name', 'Full Name', 'Display Name', 'name']) || `${first} ${last}`.trim();
    const emails = collect(r, /^(E-?mail( \d+)?( - Value)?|Email Address|Primary Email|Email\d*|E-mail \d - Value)$/i, normalizeEmail);
    const phones = collect(r, /^(Phone( \d+)?( - Value)?|Mobile Phone|Home Phone|Business Phone|Primary Phone|Phone\d*)$/i, normalizePhone);
    if (!displayName && emails.length) displayName = emails[0];
    if (!displayName) continue;
    const company = pick(r, ['Organization 1 - Name', 'Organization Name', 'Company', 'Organization', 'company']);
    const split = splitName(displayName);
    contacts.push({
      source: 'contacts',
      displayName,
      firstName: first || split.firstName,
      lastName: last || split.lastName,
      emails,
      phones,
      company: company || undefined,
      title: pick(r, ['Organization 1 - Title', 'Organization Title', 'Job Title', 'Title']) || undefined,
      location: pick(r, ['Address 1 - City', 'Address 1 - Formatted', 'Home City', 'Business City', 'City', 'Location']) || undefined,
      avatarUrl: pick(r, ['Photo', 'Avatar']) || undefined,
      notes: pick(r, ['Notes', 'Note']) || undefined,
      tags: pick(r, ['Labels', 'Group Membership', 'Categories'])
        .split(/\s*:::\s*|\s*;\s*|\s*,\s*/)
        .map((s) => s.replace(/^\* /, '').trim())
        .filter((s) => s && !/myContacts|starred/i.test(s)),
      categories: inferContactCategories(emails, company),
    });
  }
  if (!contacts.length) warnings.push('No contacts found. Expected a Google Contacts, Outlook or generic CSV with name / email columns, or a .vcf file.');
  return { contacts, interactions: [], warnings };
}

export function inferContactCategories(emails: string[], company?: string): Category[] {
  const cats = new Set<Category>();
  if (emails.some((e) => !isFreemail(e))) cats.add('business');
  if (emails.some((e) => isFreemail(e)) || !emails.length) cats.add('personal');
  if (company && !cats.has('business')) cats.add('business');
  return Array.from(cats);
}
