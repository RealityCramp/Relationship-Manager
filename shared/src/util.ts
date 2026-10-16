import type { Category } from './types.ts';

export const FREEMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com', 'outlook.com', 'live.com',
  'msn.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'protonmail.com', 'proton.me', 'pm.me',
  'mail.com', 'gmx.com', 'gmx.de', 'yandex.com', 'zoho.com', 'fastmail.com', 'hey.com', 'comcast.net',
  'att.net', 'verizon.net', 'sbcglobal.net', 'cox.net', 'charter.net', 'earthlink.net',
]);

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase().replace(/^<|>$/g, '');
}

export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1).toLowerCase() : '';
}

export function isFreemail(email: string): boolean {
  return FREEMAIL_DOMAINS.has(emailDomain(email));
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  return digits.startsWith('+') ? digits : digits.replace(/^00/, '+');
}

/** Lower-case, strip diacritics and punctuation — used for fuzzy name matching. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function splitName(displayName: string): { firstName: string; lastName: string } {
  const parts = displayName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

export function uniq<T>(arr: Iterable<T>): T[] {
  return Array.from(new Set(arr));
}

export function categoryForEmail(email: string, corporateDomains: string[]): Category {
  const d = emailDomain(email);
  if (corporateDomains.some((cd) => d === cd.toLowerCase() || d.endsWith('.' + cd.toLowerCase()))) return 'corporate';
  return isFreemail(email) ? 'personal' : 'business';
}

export const CATEGORY_LABEL: Record<Category, string> = {
  personal: 'Personal',
  business: 'Business',
  corporate: 'Corporate',
  social: 'Social',
};

export const CATEGORY_DESCRIPTION: Record<Category, string> = {
  personal: 'Friends, family and people you know outside of work — from Facebook, your address book and personal email.',
  business: 'Professional contacts outside your own company — LinkedIn connections and work email with other organisations.',
  corporate: 'People inside your own organisation, matched by your corporate email domains.',
  social: 'Public and semi-public connections — followers and follows on X and similar networks.',
};

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Deterministic string hash → 32-bit int, for stable colours. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
