import type { ImportResult, Source } from '../types.ts';
import { parseLinkedInConnections } from './linkedin.ts';
import { parseFacebookJson } from './facebook.ts';
import { parseXData } from './x.ts';
import { parseContacts } from './contacts.ts';
import { buildEmailImport, parseEml, parseMbox, type EmailImportOptions } from './email.ts';

export * from './linkedin.ts';
export * from './facebook.ts';
export * from './x.ts';
export * from './contacts.ts';
export * from './email.ts';

export interface ParseFileOptions {
  filename?: string;
  email?: EmailImportOptions;
}

/** Routes a file's text to the right importer. */
export function parseImportFile(source: Source, text: string, opts: ParseFileOptions = {}): ImportResult {
  const filename = opts.filename ?? '';
  switch (source) {
    case 'linkedin':
      return parseLinkedInConnections(text);
    case 'facebook':
      return parseFacebookJson(text);
    case 'x':
      return parseXData(text, filename);
    case 'contacts':
      return parseContacts(text, filename);
    case 'email': {
      const messages = filename.toLowerCase().endsWith('.eml') || !/^From /m.test(text) ? [parseEml(text)].filter((m) => m !== null) : parseMbox(text);
      return buildEmailImport(messages as never, opts.email ?? { selfEmails: [], corporateDomains: [] });
    }
    default:
      return { contacts: [], interactions: [], warnings: [`Unknown source "${source}"`] };
  }
}

/** Guess the source from a file name so the import wizard can pre-select it. */
export function guessSource(filename: string, head: string): Source | null {
  const f = filename.toLowerCase();
  if (f.includes('connections') && f.endsWith('.csv')) return 'linkedin';
  if (f.endsWith('.vcf') || /contacts/.test(f)) return 'contacts';
  if (/follower|following/.test(f) && f.endsWith('.js')) return 'x';
  if (f.endsWith('.mbox') || f.endsWith('.eml')) return 'email';
  if (/friends/.test(f) && f.endsWith('.json')) return 'facebook';
  if (/window\.YTD\./.test(head)) return 'x';
  if (/friends(_v\d+)?"\s*:/.test(head)) return 'facebook';
  if (/^From .*\n/m.test(head) || /^Message-ID:/im.test(head)) return 'email';
  if (/First Name,Last Name,URL/i.test(head)) return 'linkedin';
  if (/^BEGIN:VCARD/im.test(head)) return 'contacts';
  if (/E-mail 1 - Value|Given Name/i.test(head)) return 'contacts';
  return null;
}
