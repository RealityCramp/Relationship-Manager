/** Minimal, dependency-free RFC 4180 CSV parser. Handles quoted fields, embedded newlines and BOMs. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  if (text.charCodeAt(0) === 0xfeff) i = 1;
  for (; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/**
 * Parse CSV into objects using the first row that looks like a header.
 * LinkedIn exports prepend a "Notes:" preamble, which this skips.
 */
export function parseCsvObjects(text: string, requiredHeader?: string): Record<string, string>[] {
  const rows = parseCsv(text);
  let headerIdx = 0;
  if (requiredHeader) {
    const found = rows.findIndex((r) => r.some((c) => c.trim().toLowerCase() === requiredHeader.toLowerCase()));
    if (found >= 0) headerIdx = found;
  }
  const header = (rows[headerIdx] ?? []).map((h) => h.trim());
  const out: Record<string, string>[] = [];
  for (const r of rows.slice(headerIdx + 1)) {
    const obj: Record<string, string> = {};
    header.forEach((h, idx) => {
      obj[h] = (r[idx] ?? '').trim();
    });
    out.push(obj);
  }
  return out;
}
