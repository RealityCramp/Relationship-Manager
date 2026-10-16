import { parseCsvObjects } from '../csv.ts';
import type { ImportResult, ImportedContact } from '../types.ts';
import { normalizeEmail } from '../util.ts';

/**
 * Parses LinkedIn's "Connections.csv" (Settings → Data privacy → Get a copy of your data).
 * Columns: First Name, Last Name, URL, Email Address, Company, Position, Connected On.
 * The file begins with a "Notes:" preamble which is skipped.
 */
export function parseLinkedInConnections(text: string): ImportResult {
  const rows = parseCsvObjects(text, 'First Name');
  const contacts: ImportedContact[] = [];
  const warnings: string[] = [];
  for (const r of rows) {
    const first = r['First Name'] ?? '';
    const last = r['Last Name'] ?? '';
    const displayName = `${first} ${last}`.trim();
    if (!displayName) {
      warnings.push('Skipped a row without a name');
      continue;
    }
    const url = r['URL'] || undefined;
    const email = r['Email Address'] ? normalizeEmail(r['Email Address']) : undefined;
    contacts.push({
      source: 'linkedin',
      externalId: url ? url.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, '').replace(/\/$/, '') : undefined,
      handle: url ? url.split('/in/')[1]?.replace(/\/$/, '') : undefined,
      url,
      displayName,
      firstName: first,
      lastName: last,
      emails: email ? [email] : [],
      company: r['Company'] || undefined,
      title: r['Position'] || undefined,
      connectedAt: parseLinkedInDate(r['Connected On']),
      categories: ['business'],
    });
  }
  if (!rows.length) warnings.push('No rows found. Expected LinkedIn Connections.csv with a "First Name" header.');
  return { contacts, interactions: [], warnings };
}

export function parseLinkedInDate(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
