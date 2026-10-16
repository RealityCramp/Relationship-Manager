import type { Category, Contact, Source } from '@shared/types.ts';
import { CATEGORIES, SOURCES } from '@shared/types.ts';
import { categoryMatrix, hierarchy, monthlyBuckets, sankeyFlows, vennRegions } from '@shared/graph.ts';
import { normalizeEmail, splitName, uniq } from '@shared/util.ts';
import type { Router } from '../http.ts';
import { HttpError, v } from '../http.ts';
import { requireUser } from '../auth.ts';
import { now, uuid, type DB, type Row } from '../db.ts';
import { ensureTag, getContact, graph, listContacts, listTags, requireMembership, rowToInteraction, rowToRelationship, selfContact, sourcesFor, summary } from '../repo.ts';
import { findDuplicates, mergeContacts, rebuildEmployerEdges, rebuildSelfEdges, recomputeContacts } from '../reconcile.ts';

const CHANNELS = ['email', 'meeting', 'call', 'message', 'note'] as const;
const DIRECTIONS = ['inbound', 'outbound', 'mutual'] as const;

export function contactRoutes(r: Router, db: DB) {
  const filters = (ctx: { query: URLSearchParams }) => ({
    category: ctx.query.get('category') ? v.oneOf(ctx.query.get('category'), 'category', CATEGORIES) : undefined,
    source: ctx.query.get('source') ? v.oneOf(ctx.query.get('source'), 'source', SOURCES) : undefined,
    q: ctx.query.get('q') ?? undefined,
    tag: ctx.query.get('tag') ?? undefined,
    company: ctx.query.get('company') ?? undefined,
  });

  r.get('/workspaces/:id/contacts', (ctx) => {
    const ws = requireMembership(db, ctx.params.id, requireUser(ctx));
    const contacts = listContacts(db, ws.id, filters(ctx));
    const limit = Number(ctx.query.get('limit') ?? 0);
    const offset = Number(ctx.query.get('offset') ?? 0);
    return { total: contacts.length, contacts: limit ? contacts.slice(offset, offset + limit) : contacts };
  });

  r.post('/workspaces/:id/contacts', (ctx) => {
    const ws = requireMembership(db, ctx.params.id, requireUser(ctx), 'editor');
    const b = v.obj(ctx.body);
    const displayName = v.str(b.displayName, 'displayName', { min: 1, max: 200 });
    const id = uuid();
    const ts = now();
    const split = splitName(displayName);
    const emails = uniq(v.strArr(b.emails, 'emails').map(normalizeEmail));
    const cats = b.categories !== undefined ? v.strArr(b.categories, 'categories').map((c) => v.oneOf(c, 'category', CATEGORIES)) : ['personal'];
    db.prepare(
      `INSERT INTO contacts (id, workspace_id, display_name, first_name, last_name, emails, phones, company, title, location, avatar_url, notes, categories, category_overrides, tags, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(id, ws.id, displayName, split.firstName, split.lastName, JSON.stringify(emails), JSON.stringify(v.strArr(b.phones, 'phones')), v.str(b.company, 'company', { optional: true }) || null, v.str(b.title, 'title', { optional: true }) || null, v.str(b.location, 'location', { optional: true }) || null, v.str(b.avatarUrl, 'avatarUrl', { optional: true }) || null, v.str(b.notes, 'notes', { optional: true, max: 5000 }), JSON.stringify(cats), JSON.stringify(cats), JSON.stringify(v.strArr(b.tags, 'tags')), ts, ts);
    db.prepare('INSERT INTO contact_sources (id, contact_id, source, imported_at) VALUES (?,?,?,?)').run(uuid(), id, 'manual', ts);
    for (const t of v.strArr(b.tags, 'tags')) ensureTag(db, ws.id, t);
    recomputeContacts(db, ws, [id]);
    rebuildSelfEdges(db, ws, selfContact(db, ws.id)?.id ?? null, [id]);
    rebuildEmployerEdges(db, ws);
    return getContact(db, ws.id, id);
  });

  r.get('/workspaces/:id/contacts/:cid', (ctx) => {
    const ws = requireMembership(db, ctx.params.id, requireUser(ctx));
    const contact = getContact(db, ws.id, ctx.params.cid);
    const interactions = (db.prepare('SELECT * FROM interactions WHERE contact_id = ? ORDER BY occurred_at DESC LIMIT 200').all(contact.id) as Row[]).map(rowToInteraction);
    const rels = (db.prepare('SELECT * FROM relationships WHERE from_contact_id = ? OR to_contact_id = ?').all(contact.id, contact.id) as Row[]).map(rowToRelationship);
    const otherIds = uniq(rels.map((x) => (x.fromContactId === contact.id ? x.toContactId : x.fromContactId)));
    const names = new Map<string, { name: string; company: string | null; isSelf: boolean; categories: Category[] }>();
    for (let i = 0; i < otherIds.length; i += 500) {
      const chunk = otherIds.slice(i, i + 500);
      for (const row of db.prepare(`SELECT id, display_name, company, is_self, categories FROM contacts WHERE id IN (${chunk.map(() => '?').join(',')})`).all(...(chunk as never[])) as Row[])
        names.set(row.id as string, { name: row.display_name as string, company: (row.company as string) ?? null, isSelf: !!row.is_self, categories: JSON.parse(row.categories as string) });
    }
    return {
      contact,
      interactions,
      relationships: rels.map((x) => {
        const otherId = x.fromContactId === contact.id ? x.toContactId : x.fromContactId;
        return { ...x, other: { id: otherId, ...(names.get(otherId) ?? { name: 'Unknown', company: null, isSelf: false, categories: [] }) } };
      }),
      timeline: monthlyBuckets(interactions.map((i) => i.occurredAt), 24),
    };
  });

  r.patch('/workspaces/:id/contacts/:cid', (ctx) => {
    const ws = requireMembership(db, ctx.params.id, requireUser(ctx), 'editor');
    const c = getContact(db, ws.id, ctx.params.cid);
    const b = v.obj(ctx.body);
    const next: Partial<Contact> = {};
    if (b.displayName !== undefined) next.displayName = v.str(b.displayName, 'displayName', { min: 1, max: 200 });
    if (b.emails !== undefined) next.emails = uniq(v.strArr(b.emails, 'emails').map(normalizeEmail));
    if (b.phones !== undefined) next.phones = v.strArr(b.phones, 'phones');
    if (b.company !== undefined) next.company = v.str(b.company, 'company', { optional: true }) || null;
    if (b.title !== undefined) next.title = v.str(b.title, 'title', { optional: true }) || null;
    if (b.location !== undefined) next.location = v.str(b.location, 'location', { optional: true }) || null;
    if (b.avatarUrl !== undefined) next.avatarUrl = v.str(b.avatarUrl, 'avatarUrl', { optional: true }) || null;
    if (b.notes !== undefined) next.notes = v.str(b.notes, 'notes', { optional: true, max: 20000 });
    if (b.tags !== undefined) {
      next.tags = uniq(v.strArr(b.tags, 'tags'));
      for (const t of next.tags) ensureTag(db, ws.id, t);
    }
    if (b.categoryOverrides !== undefined) next.categoryOverrides = b.categoryOverrides === null ? null : v.strArr(b.categoryOverrides, 'categoryOverrides').map((x) => v.oneOf(x, 'category', CATEGORIES));
    const merged = { ...c, ...next };
    const split = next.displayName ? splitName(next.displayName) : { firstName: c.firstName, lastName: c.lastName };
    db.prepare(
      'UPDATE contacts SET display_name = ?, first_name = ?, last_name = ?, emails = ?, phones = ?, company = ?, title = ?, location = ?, avatar_url = ?, notes = ?, tags = ?, category_overrides = ?, updated_at = ? WHERE id = ?',
    ).run(merged.displayName, split.firstName, split.lastName, JSON.stringify(merged.emails), JSON.stringify(merged.phones), merged.company, merged.title, merged.location, merged.avatarUrl, merged.notes, JSON.stringify(merged.tags), merged.categoryOverrides ? JSON.stringify(merged.categoryOverrides) : null, now(), c.id);
    recomputeContacts(db, ws, [c.id]);
    rebuildSelfEdges(db, ws, selfContact(db, ws.id)?.id ?? null, [c.id]);
    if (next.company !== undefined) rebuildEmployerEdges(db, ws);
    return getContact(db, ws.id, c.id);
  });

  r.delete('/workspaces/:id/contacts/:cid', (ctx) => {
    const ws = requireMembership(db, ctx.params.id, requireUser(ctx), 'editor');
    const c = getContact(db, ws.id, ctx.params.cid);
    if (c.isSelf) throw new HttpError(400, 'You cannot delete yourself from the graph');
    db.prepare('DELETE FROM contacts WHERE id = ?').run(c.id);
    return { ok: true };
  });

  r.post('/workspaces/:id/contacts/:cid/merge', (ctx) => {
    const ws = requireMembership(db, ctx.params.id, requireUser(ctx), 'editor');
    const otherId = v.str(v.obj(ctx.body).otherId, 'otherId');
    const keep = getContact(db, ws.id, ctx.params.cid);
    const other = getContact(db, ws.id, otherId);
    if (keep.isSelf || other.isSelf) throw new HttpError(400, 'Cannot merge the self contact');
    mergeContacts(db, ws, keep.id, other.id);
    return getContact(db, ws.id, keep.id);
  });

  r.get('/workspaces/:id/duplicates', (ctx) => {
    const ws = requireMembership(db, ctx.params.id, requireUser(ctx));
    return findDuplicates(db, ws.id);
  });

  r.post('/workspaces/:id/contacts/:cid/interactions', (ctx) => {
    const ws = requireMembership(db, ctx.params.id, requireUser(ctx), 'editor');
    const c = getContact(db, ws.id, ctx.params.cid);
    const b = v.obj(ctx.body);
    const occurredAt = b.occurredAt ? new Date(v.str(b.occurredAt, 'occurredAt')).toISOString() : now();
    db.prepare('INSERT INTO interactions (id, workspace_id, contact_id, channel, direction, subject, thread_id, occurred_at, dedupe_key) VALUES (?,?,?,?,?,?,?,?,?)').run(
      uuid(),
      ws.id,
      c.id,
      v.oneOf(b.channel ?? 'note', 'channel', CHANNELS),
      v.oneOf(b.direction ?? 'mutual', 'direction', DIRECTIONS),
      v.str(b.subject, 'subject', { optional: true, max: 500 }),
      null,
      occurredAt,
      null,
    );
    recomputeContacts(db, ws, [c.id]);
    rebuildSelfEdges(db, ws, selfContact(db, ws.id)?.id ?? null, [c.id]);
    return getContact(db, ws.id, c.id);
  });

  r.delete('/workspaces/:id/interactions/:iid', (ctx) => {
    const ws = requireMembership(db, ctx.params.id, requireUser(ctx), 'editor');
    const row = db.prepare('SELECT contact_id FROM interactions WHERE id = ? AND workspace_id = ?').get(ctx.params.iid, ws.id) as Row | undefined;
    if (!row) throw new HttpError(404, 'Interaction not found');
    db.prepare('DELETE FROM interactions WHERE id = ?').run(ctx.params.iid);
    recomputeContacts(db, ws, [row.contact_id as string]);
    return { ok: true };
  });

  /* ---------- relationships / graph ---------- */

  r.get('/workspaces/:id/graph', (ctx) => {
    const ws = requireMembership(db, ctx.params.id, requireUser(ctx));
    const f = filters(ctx);
    return graph(db, ws.id, { ...f, minStrength: Number(ctx.query.get('minStrength') ?? 0) });
  });

  r.post('/workspaces/:id/relationships', (ctx) => {
    const ws = requireMembership(db, ctx.params.id, requireUser(ctx), 'editor');
    const b = v.obj(ctx.body);
    const from = getContact(db, ws.id, v.str(b.fromContactId, 'fromContactId'));
    const to = getContact(db, ws.id, v.str(b.toContactId, 'toContactId'));
    if (from.id === to.id) throw new HttpError(400, 'A relationship needs two different people');
    const id = uuid();
    db.prepare('INSERT OR REPLACE INTO relationships (id, workspace_id, from_contact_id, to_contact_id, kind, strength, origin, notes, created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(
      id,
      ws.id,
      from.id,
      to.id,
      v.oneOf(b.kind ?? 'personal', 'kind', CATEGORIES),
      Math.max(0, Math.min(1, v.num(b.strength, 'strength', 0.5))),
      'manual',
      v.str(b.notes, 'notes', { optional: true, max: 2000 }),
      now(),
    );
    return rowToRelationship(db.prepare('SELECT * FROM relationships WHERE id = ?').get(id) as Row);
  });

  r.delete('/workspaces/:id/relationships/:rid', (ctx) => {
    const ws = requireMembership(db, ctx.params.id, requireUser(ctx), 'editor');
    db.prepare('DELETE FROM relationships WHERE id = ? AND workspace_id = ?').run(ctx.params.rid, ws.id);
    return { ok: true };
  });

  /* ---------- analytics ---------- */

  r.get('/workspaces/:id/summary', (ctx) => summary(db, requireMembership(db, ctx.params.id, requireUser(ctx)).id));

  r.get('/workspaces/:id/analytics', (ctx) => {
    const ws = requireMembership(db, ctx.params.id, requireUser(ctx));
    const contacts = listContacts(db, ws.id, filters(ctx));
    const dates = (db.prepare('SELECT occurred_at FROM interactions WHERE workspace_id = ?').all(ws.id) as Row[]).map((x) => x.occurred_at as string);
    const sourcesByCategory: Record<Category, Record<Source, number>> = Object.fromEntries(CATEGORIES.map((c) => [c, Object.fromEntries(SOURCES.map((s) => [s, 0]))])) as never;
    for (const c of contacts) for (const k of c.categories) for (const s of uniq(c.sources.map((x) => x.source))) sourcesByCategory[k][s]++;
    return {
      total: contacts.length,
      venn: vennRegions(contacts),
      chord: categoryMatrix(contacts),
      sankey: sankeyFlows(contacts),
      hierarchy: hierarchy(contacts),
      timeline: monthlyBuckets(dates, 24),
      sourcesByCategory,
      strengthHistogram: Array.from({ length: 10 }, (_, i) => ({ bucket: `${i * 10}-${i * 10 + 10}%`, count: contacts.filter((c) => Math.min(9, Math.floor(c.strength * 10)) === i).length })),
      topContacts: contacts.slice(0, 15).map((c) => ({ id: c.id, name: c.displayName, strength: c.strength, categories: c.categories, interactionCount: c.interactionCount })),
    };
  });

  r.get('/workspaces/:id/export', (ctx) => {
    const ws = requireMembership(db, ctx.params.id, requireUser(ctx));
    const contacts = listContacts(db, ws.id, { includeSelf: true });
    const relationships = (db.prepare('SELECT * FROM relationships WHERE workspace_id = ?').all(ws.id) as Row[]).map(rowToRelationship);
    const interactions = (db.prepare('SELECT * FROM interactions WHERE workspace_id = ?').all(ws.id) as Row[]).map(rowToInteraction);
    return { workspace: ws, exportedAt: now(), contacts, relationships, interactions, tags: listTags(db, ws.id) };
  });

  /* ---------- tags ---------- */

  r.get('/workspaces/:id/tags', (ctx) => listTags(db, requireMembership(db, ctx.params.id, requireUser(ctx)).id));
  r.post('/workspaces/:id/tags', (ctx) => {
    const ws = requireMembership(db, ctx.params.id, requireUser(ctx), 'editor');
    const b = v.obj(ctx.body);
    return ensureTag(db, ws.id, v.str(b.name, 'name', { min: 1, max: 40 }), b.color ? v.str(b.color, 'color') : undefined);
  });
  r.delete('/workspaces/:id/tags/:tagId', (ctx) => {
    const ws = requireMembership(db, ctx.params.id, requireUser(ctx), 'editor');
    const t = db.prepare('SELECT * FROM tags WHERE id = ? AND workspace_id = ?').get(ctx.params.tagId, ws.id) as Row | undefined;
    if (!t) throw new HttpError(404, 'Tag not found');
    db.prepare('DELETE FROM tags WHERE id = ?').run(t.id);
    const rows = db.prepare('SELECT id, tags FROM contacts WHERE workspace_id = ? AND tags LIKE ?').all(ws.id, `%${JSON.stringify(t.name)}%`) as Row[];
    for (const row of rows) db.prepare('UPDATE contacts SET tags = ? WHERE id = ?').run(JSON.stringify((JSON.parse(row.tags as string) as string[]).filter((x) => x !== t.name)), row.id);
    return { ok: true };
  });

  // keep sourcesFor referenced for tooling
  void sourcesFor;
}
