import type { Category, Contact, ImportResult, ImportStats, ImportedContact, Source, Workspace } from '@shared/types.ts';
import { CATEGORIES } from '@shared/types.ts';
import { categoryForEmail, clamp, emailDomain, normalizeEmail, normalizeName, uniq } from '@shared/util.ts';
import { now, uuid, type DB, type Row } from './db.ts';
import { ensureTag, rowToContact, selfContact, sourcesFor } from './repo.ts';

const emptyStats = (): ImportStats => ({ parsed: 0, created: 0, merged: 0, skipped: 0, relationships: 0, interactions: 0, warnings: [] });

/**
 * Merges an ImportResult into the workspace:
 *  - de-duplicates against existing contacts (external id → email → handle → exact name)
 *  - recomputes categories, strength and self→contact relationships
 *  - records interactions and derives contact↔contact edges (shared employer, shared email threads)
 */
export function reconcile(db: DB, ws: Workspace, source: Source, result: ImportResult): ImportStats {
  const stats = emptyStats();
  stats.warnings.push(...result.warnings);
  stats.parsed = result.contacts.length;
  const ts = now();
  const self = selfContact(db, ws.id);
  const selfEmails = new Set([...ws.selfEmails, ...(self?.emails ?? [])].map(normalizeEmail));

  const index = new ContactIndex(db, ws.id);
  const touched = new Set<string>();
  const emailToContact = new Map<string, string>();

  const insertSource = db.prepare('INSERT INTO contact_sources (id, contact_id, source, external_id, handle, url, raw, imported_at) VALUES (?,?,?,?,?,?,?,?)');
  const insertContact = db.prepare(
    `INSERT INTO contacts (id, workspace_id, display_name, first_name, last_name, emails, phones, company, title, location, avatar_url, notes, categories, tags, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );

  db.exec('BEGIN');
  try {
    for (const ic of result.contacts) {
      const emails = uniq((ic.emails ?? []).map(normalizeEmail).filter((e) => e.includes('@')));
      if (emails.some((e) => selfEmails.has(e))) {
        stats.skipped++;
        continue;
      }
      const existing = index.find(ic, emails);
      let contactId: string;
      if (existing) {
        contactId = existing.id as string;
        mergeInto(db, existing, ic, emails);
        stats.merged++;
      } else {
        contactId = uuid();
        insertContact.run(
          contactId,
          ws.id,
          ic.displayName,
          ic.firstName ?? '',
          ic.lastName ?? '',
          JSON.stringify(emails),
          JSON.stringify(uniq(ic.phones ?? [])),
          ic.company ?? null,
          ic.title ?? null,
          ic.location ?? null,
          ic.avatarUrl ?? null,
          ic.notes ?? '',
          JSON.stringify(ic.categories ?? []),
          JSON.stringify(ic.tags ?? []),
          ic.connectedAt ?? ts,
          ts,
        );
        index.add(contactId, ic, emails);
        stats.created++;
      }
      const hasSource = (db.prepare('SELECT 1 FROM contact_sources WHERE contact_id = ? AND source = ? AND IFNULL(external_id, \'\') = IFNULL(?, \'\')').get(contactId, ic.source, ic.externalId ?? null) as Row | undefined) !== undefined;
      if (!hasSource) insertSource.run(uuid(), contactId, ic.source, ic.externalId ?? null, ic.handle ?? null, ic.url ?? null, null, ts);
      for (const t of ic.tags ?? []) ensureTag(db, ws.id, t);
      for (const e of emails) emailToContact.set(e, contactId);
      touched.add(contactId);
    }

    // interactions
    const insertInteraction = db.prepare('INSERT OR IGNORE INTO interactions (id, workspace_id, contact_id, channel, direction, subject, thread_id, occurred_at, dedupe_key) VALUES (?,?,?,?,?,?,?,?,?)');
    const threadMembers = new Map<string, Set<string>>();
    for (const it of result.interactions) {
      for (const email of it.participants) {
        const cid = emailToContact.get(normalizeEmail(email)) ?? index.byEmail(normalizeEmail(email));
        if (!cid) continue;
        const key = `${it.threadId}|${it.occurredAt}|${cid}|${it.direction}`;
        const r = insertInteraction.run(uuid(), ws.id, cid, 'email', it.direction, it.subject.slice(0, 500), it.threadId, it.occurredAt, key);
        if (r.changes) stats.interactions++;
        touched.add(cid);
        const set = threadMembers.get(it.threadId) ?? new Set();
        set.add(cid);
        threadMembers.set(it.threadId, set);
      }
    }

    // recompute categories, strength, and edges for everything we touched
    const touchedIds = Array.from(touched);
    recomputeContacts(db, ws, touchedIds);
    stats.relationships += rebuildSelfEdges(db, ws, self?.id ?? null, touchedIds);
    stats.relationships += rebuildEmployerEdges(db, ws);
    stats.relationships += buildThreadEdges(db, ws, threadMembers);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return stats;
}

/* ---------- matching index ---------- */

class ContactIndex {
  private ext = new Map<string, string>();
  private email = new Map<string, string>();
  private handle = new Map<string, string>();
  private name = new Map<string, string>();
  private rows = new Map<string, Row>();

  constructor(
    private db: DB,
    workspaceId: string,
  ) {
    const rows = db.prepare('SELECT * FROM contacts WHERE workspace_id = ? AND merged_into IS NULL AND is_self = 0').all(workspaceId) as Row[];
    const sources = sourcesFor(db, rows.map((r) => r.id as string));
    for (const r of rows) {
      const id = r.id as string;
      this.rows.set(id, r);
      for (const e of JSON.parse(r.emails as string) as string[]) this.email.set(e, id);
      const n = normalizeName(r.display_name as string);
      if (n.split(' ').length >= 2) this.name.set(n, id);
      for (const s of sources.get(id) ?? []) {
        if (s.externalId) this.ext.set(`${s.source}:${s.externalId}`, id);
        if (s.handle) this.handle.set(`${s.source}:${s.handle.toLowerCase()}`, id);
      }
    }
  }

  byEmail(e: string) {
    return this.email.get(e);
  }

  find(ic: ImportedContact, emails: string[]): Row | undefined {
    let id: string | undefined;
    if (ic.externalId) id = this.ext.get(`${ic.source}:${ic.externalId}`);
    if (!id) for (const e of emails) if ((id = this.email.get(e))) break;
    if (!id && ic.handle) id = this.handle.get(`${ic.source}:${ic.handle.toLowerCase()}`);
    if (!id) {
      const n = normalizeName(ic.displayName);
      if (n.split(' ').length >= 2 && !/^x user /.test(n)) id = this.name.get(n);
    }
    return id ? this.rows.get(id) : undefined;
  }

  add(id: string, ic: ImportedContact, emails: string[]) {
    const row: Row = { id, display_name: ic.displayName, emails: JSON.stringify(emails), phones: JSON.stringify(ic.phones ?? []), company: ic.company ?? null, title: ic.title ?? null, location: ic.location ?? null, avatar_url: ic.avatarUrl ?? null, notes: ic.notes ?? '', categories: JSON.stringify(ic.categories ?? []), tags: JSON.stringify(ic.tags ?? []), first_name: ic.firstName ?? '', last_name: ic.lastName ?? '' };
    this.rows.set(id, row);
    if (ic.externalId) this.ext.set(`${ic.source}:${ic.externalId}`, id);
    if (ic.handle) this.handle.set(`${ic.source}:${ic.handle.toLowerCase()}`, id);
    for (const e of emails) this.email.set(e, id);
    const n = normalizeName(ic.displayName);
    if (n.split(' ').length >= 2) this.name.set(n, id);
  }
}

function mergeInto(db: DB, row: Row, ic: ImportedContact, emails: string[]) {
  const id = row.id as string;
  const cur = rowToContact(row);
  const mergedEmails = uniq([...cur.emails, ...emails]);
  const mergedPhones = uniq([...cur.phones, ...(ic.phones ?? [])]);
  const mergedTags = uniq([...cur.tags, ...(ic.tags ?? [])]);
  const mergedCats = uniq([...cur.categories, ...(ic.categories ?? [])]);
  const displayName = /^X user \d+$/.test(cur.displayName) && ic.displayName ? ic.displayName : cur.displayName;
  db.prepare(
    `UPDATE contacts SET display_name = ?, first_name = COALESCE(NULLIF(first_name,''), ?), last_name = COALESCE(NULLIF(last_name,''), ?), emails = ?, phones = ?, company = COALESCE(company, ?), title = COALESCE(title, ?), location = COALESCE(location, ?), avatar_url = COALESCE(avatar_url, ?), notes = CASE WHEN notes = '' THEN ? ELSE notes END, categories = ?, tags = ?, updated_at = ? WHERE id = ?`,
  ).run(displayName, ic.firstName ?? '', ic.lastName ?? '', JSON.stringify(mergedEmails), JSON.stringify(mergedPhones), ic.company ?? null, ic.title ?? null, ic.location ?? null, ic.avatarUrl ?? null, ic.notes ?? '', JSON.stringify(mergedCats), JSON.stringify(mergedTags), now(), id);
  row.emails = JSON.stringify(mergedEmails);
  row.categories = JSON.stringify(mergedCats);
  row.tags = JSON.stringify(mergedTags);
  row.display_name = displayName;
  if (!row.company && ic.company) row.company = ic.company;
}

/* ---------- derived fields ---------- */

export function inferCategories(ws: Workspace, c: Contact): Category[] {
  const cats = new Set<Category>();
  for (const s of c.sources) {
    if (s.source === 'linkedin') cats.add('business');
    if (s.source === 'facebook') cats.add('personal');
    if (s.source === 'x') cats.add('social');
    if (s.source === 'contacts') cats.add(c.emails.length && c.emails.every((e) => categoryForEmail(e, ws.corporateDomains) !== 'personal') ? 'business' : 'personal');
    if (s.source === 'email') for (const e of c.emails) cats.add(categoryForEmail(e, ws.corporateDomains));
  }
  for (const k of c.categories) if (CATEGORIES.includes(k)) cats.add(k);
  const corpNames = ws.corporateDomains.map((d) => d.split('.')[0].toLowerCase());
  if (c.emails.some((e) => ws.corporateDomains.some((d) => emailDomain(e) === d.toLowerCase() || emailDomain(e).endsWith('.' + d.toLowerCase())))) cats.add('corporate');
  if (c.company && corpNames.length && corpNames.some((n) => n.length > 2 && normalizeName(c.company!).split(' ').includes(n))) cats.add('corporate');
  if (cats.has('corporate')) cats.delete('business');
  if (!cats.size) cats.add('personal');
  return CATEGORIES.filter((k) => cats.has(k));
}

export function computeStrength(c: Contact, inbound: number, outbound: number, last: string | null): number {
  const sources = new Set(c.sources.map((s) => s.source)).size;
  const total = inbound + outbound;
  const interactionScore = Math.min(1, Math.log1p(total) / Math.log1p(60));
  const bidirectional = inbound > 0 && outbound > 0 ? 0.12 : 0;
  let recency = 0;
  if (last) {
    const days = (Date.now() - new Date(last).getTime()) / 86400000;
    recency = clamp(1 - days / 730, 0, 1);
  }
  return Number(clamp(0.06 * sources + 0.4 * interactionScore + bidirectional + 0.3 * recency, 0.05, 1).toFixed(3));
}

export function recomputeContacts(db: DB, ws: Workspace, ids: string[]) {
  const update = db.prepare('UPDATE contacts SET categories = ?, strength = ?, interaction_count = ?, last_interaction_at = ?, updated_at = ? WHERE id = ?');
  const counts = db.prepare("SELECT SUM(direction='inbound') as inbound, SUM(direction='outbound') as outbound, MAX(occurred_at) as last FROM interactions WHERE contact_id = ?");
  for (const id of ids) {
    const r = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id) as Row | undefined;
    if (!r || r.is_self) continue;
    const c = rowToContact(r, sourcesFor(db, [id]).get(id) ?? []);
    const cnt = counts.get(id) as Row;
    const inbound = Number(cnt.inbound ?? 0);
    const outbound = Number(cnt.outbound ?? 0);
    const inferred = inferCategories(ws, c);
    const cats = c.categoryOverrides ?? inferred;
    update.run(JSON.stringify(cats), computeStrength({ ...c, categories: cats }, inbound, outbound, (cnt.last as string) ?? null), inbound + outbound, (cnt.last as string) ?? null, now(), id);
  }
}

export function recomputeAll(db: DB, ws: Workspace) {
  const ids = (db.prepare('SELECT id FROM contacts WHERE workspace_id = ? AND merged_into IS NULL AND is_self = 0').all(ws.id) as Row[]).map((r) => r.id as string);
  recomputeContacts(db, ws, ids);
  const self = selfContact(db, ws.id);
  rebuildSelfEdges(db, ws, self?.id ?? null, ids);
  rebuildEmployerEdges(db, ws);
}

const ORIGIN_FOR_CATEGORY: Record<Category, Source[]> = {
  personal: ['facebook', 'contacts', 'email'],
  business: ['linkedin', 'email', 'contacts'],
  corporate: ['email', 'linkedin', 'contacts'],
  social: ['x', 'facebook'],
};

export function rebuildSelfEdges(db: DB, ws: Workspace, selfId: string | null, ids: string[]): number {
  if (!selfId) return 0;
  let n = 0;
  const del = db.prepare("DELETE FROM relationships WHERE workspace_id = ? AND from_contact_id = ? AND to_contact_id = ? AND origin != 'manual'");
  const ins = db.prepare('INSERT OR IGNORE INTO relationships (id, workspace_id, from_contact_id, to_contact_id, kind, strength, origin, created_at) VALUES (?,?,?,?,?,?,?,?)');
  for (const id of ids) {
    const r = db.prepare('SELECT * FROM contacts WHERE id = ? AND merged_into IS NULL AND is_self = 0').get(id) as Row | undefined;
    if (!r) continue;
    const c = rowToContact(r, sourcesFor(db, [id]).get(id) ?? []);
    del.run(ws.id, selfId, id);
    const have = new Set(c.sources.map((s) => s.source));
    for (const k of c.categories) {
      const origin = ORIGIN_FOR_CATEGORY[k].find((s) => have.has(s)) ?? (have.values().next().value as Source | undefined) ?? 'manual';
      const res = ins.run(uuid(), ws.id, selfId, id, k, c.strength, k === 'corporate' && origin !== 'email' ? 'employer' : origin, now());
      n += Number(res.changes);
    }
  }
  return n;
}

/** Star-topology edges between people at the same company (keeps the graph readable for large firms). */
export function rebuildEmployerEdges(db: DB, ws: Workspace): number {
  db.prepare("DELETE FROM relationships WHERE workspace_id = ? AND origin = 'employer' AND from_contact_id != (SELECT id FROM contacts WHERE workspace_id = ? AND is_self = 1 LIMIT 1)").run(ws.id, ws.id);
  const rows = db.prepare("SELECT id, company, strength, categories FROM contacts WHERE workspace_id = ? AND merged_into IS NULL AND is_self = 0 AND company IS NOT NULL AND company != '' ORDER BY strength DESC").all(ws.id) as Row[];
  const byCompany = new Map<string, Row[]>();
  for (const r of rows) {
    const key = normalizeName(r.company as string);
    if (!key) continue;
    const list = byCompany.get(key) ?? [];
    list.push(r);
    byCompany.set(key, list);
  }
  const ins = db.prepare('INSERT OR IGNORE INTO relationships (id, workspace_id, from_contact_id, to_contact_id, kind, strength, origin, created_at) VALUES (?,?,?,?,?,?,?,?)');
  let n = 0;
  for (const list of byCompany.values()) {
    if (list.length < 2) continue;
    const hub = list[0];
    const hubCats = JSON.parse(hub.categories as string) as Category[];
    const kind: Category = hubCats.includes('corporate') ? 'corporate' : 'business';
    for (const other of list.slice(1, 200)) {
      n += Number(ins.run(uuid(), ws.id, hub.id as string, other.id as string, kind, 0.3, 'employer', now()).changes);
    }
  }
  return n;
}

/** People who appear on the same email thread are linked. */
export function buildThreadEdges(db: DB, ws: Workspace, threads: Map<string, Set<string>>): number {
  const ins = db.prepare('INSERT OR IGNORE INTO relationships (id, workspace_id, from_contact_id, to_contact_id, kind, strength, origin, created_at) VALUES (?,?,?,?,?,?,?,?)');
  const catOf = db.prepare('SELECT categories FROM contacts WHERE id = ?');
  let n = 0;
  for (const members of threads.values()) {
    const ids = Array.from(members).slice(0, 8);
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const [a, b] = [ids[i], ids[j]].sort();
        const cats = JSON.parse(((catOf.get(a) as Row | undefined)?.categories as string) ?? '[]') as Category[];
        const kind: Category = cats.includes('corporate') ? 'corporate' : cats.includes('business') ? 'business' : 'personal';
        n += Number(ins.run(uuid(), ws.id, a, b, kind, 0.4, 'email', now()).changes);
      }
  }
  return n;
}

/** Merge contact B into A (keeps A's id). */
export function mergeContacts(db: DB, ws: Workspace, keepId: string, removeId: string) {
  const keep = db.prepare('SELECT * FROM contacts WHERE id = ? AND workspace_id = ?').get(keepId, ws.id) as Row | undefined;
  const remove = db.prepare('SELECT * FROM contacts WHERE id = ? AND workspace_id = ?').get(removeId, ws.id) as Row | undefined;
  if (!keep || !remove || keepId === removeId) return;
  const ic: ImportedContact = {
    source: 'manual',
    displayName: remove.display_name as string,
    firstName: remove.first_name as string,
    lastName: remove.last_name as string,
    emails: JSON.parse(remove.emails as string),
    phones: JSON.parse(remove.phones as string),
    company: (remove.company as string) ?? undefined,
    title: (remove.title as string) ?? undefined,
    location: (remove.location as string) ?? undefined,
    avatarUrl: (remove.avatar_url as string) ?? undefined,
    notes: remove.notes as string,
    categories: JSON.parse(remove.categories as string),
    tags: JSON.parse(remove.tags as string),
  };
  db.exec('BEGIN');
  try {
    mergeInto(db, keep, ic, ic.emails ?? []);
    db.prepare('UPDATE contact_sources SET contact_id = ? WHERE contact_id = ?').run(keepId, removeId);
    db.prepare('UPDATE OR IGNORE interactions SET contact_id = ? WHERE contact_id = ?').run(keepId, removeId);
    db.prepare('DELETE FROM interactions WHERE contact_id = ?').run(removeId);
    db.prepare('DELETE FROM relationships WHERE from_contact_id = ? OR to_contact_id = ?').run(removeId, removeId);
    db.prepare('UPDATE contacts SET merged_into = ?, updated_at = ? WHERE id = ?').run(keepId, now(), removeId);
    recomputeContacts(db, ws, [keepId]);
    const self = selfContact(db, ws.id);
    rebuildSelfEdges(db, ws, self?.id ?? null, [keepId]);
    rebuildEmployerEdges(db, ws);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/** Candidate duplicate pairs: same email, or same normalized name. */
export function findDuplicates(db: DB, workspaceId: string): { a: Contact; b: Contact; reason: string }[] {
  const rows = db.prepare('SELECT * FROM contacts WHERE workspace_id = ? AND merged_into IS NULL AND is_self = 0').all(workspaceId) as Row[];
  const sources = sourcesFor(db, rows.map((r) => r.id as string));
  const contacts = rows.map((r) => rowToContact(r, sources.get(r.id as string) ?? []));
  const seenName = new Map<string, Contact>();
  const seenEmail = new Map<string, Contact>();
  const pairs: { a: Contact; b: Contact; reason: string }[] = [];
  const paired = new Set<string>();
  for (const c of contacts) {
    for (const e of c.emails) {
      const other = seenEmail.get(e);
      if (other && !paired.has(`${other.id}|${c.id}`)) {
        pairs.push({ a: other, b: c, reason: `Same email ${e}` });
        paired.add(`${other.id}|${c.id}`);
      }
      seenEmail.set(e, c);
    }
    const n = normalizeName(c.displayName);
    if (n.split(' ').length >= 2) {
      const other = seenName.get(n);
      if (other && !paired.has(`${other.id}|${c.id}`)) {
        pairs.push({ a: other, b: c, reason: 'Same name' });
        paired.add(`${other.id}|${c.id}`);
      } else seenName.set(n, c);
    }
  }
  return pairs.slice(0, 200);
}
