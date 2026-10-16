import type { Category, Contact, ContactSource, Graph, ImportJob, Interaction, Relationship, Role, Source, Summary, Tag, User, Workspace, WorkspaceMember } from '@shared/types.ts';
import { CATEGORIES, SOURCES } from '@shared/types.ts';
import { countBy } from '@shared/graph.ts';
import { HttpError } from './http.ts';
import { json, now, uuid, type DB, type Row } from './db.ts';

/* ---------- mapping ---------- */

export function rowToUser(r: Row): User {
  return { id: r.id as string, email: r.email as string, name: r.name as string, createdAt: r.created_at as string };
}

export function rowToWorkspace(r: Row, role: Role): Workspace {
  return {
    id: r.id as string,
    name: r.name as string,
    ownerId: r.owner_id as string,
    role,
    createdAt: r.created_at as string,
    corporateDomains: json<string[]>(r.corporate_domains, []),
    selfEmails: json<string[]>(r.self_emails, []),
  };
}

export function rowToContact(r: Row, sources: ContactSource[] = []): Contact {
  return {
    id: r.id as string,
    workspaceId: r.workspace_id as string,
    displayName: r.display_name as string,
    firstName: r.first_name as string,
    lastName: r.last_name as string,
    emails: json<string[]>(r.emails, []),
    phones: json<string[]>(r.phones, []),
    company: (r.company as string | null) ?? null,
    title: (r.title as string | null) ?? null,
    location: (r.location as string | null) ?? null,
    avatarUrl: (r.avatar_url as string | null) ?? null,
    notes: (r.notes as string) ?? '',
    categories: json<Category[]>(r.categories, []),
    categoryOverrides: r.category_overrides ? json<Category[]>(r.category_overrides, []) : null,
    tags: json<string[]>(r.tags, []),
    sources,
    strength: Number(r.strength ?? 0),
    interactionCount: Number(r.interaction_count ?? 0),
    lastInteractionAt: (r.last_interaction_at as string | null) ?? null,
    isSelf: Boolean(r.is_self),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export function rowToSource(r: Row): ContactSource {
  return {
    id: r.id as string,
    source: r.source as Source,
    externalId: (r.external_id as string | null) ?? null,
    handle: (r.handle as string | null) ?? null,
    url: (r.url as string | null) ?? null,
    importedAt: r.imported_at as string,
  };
}

export function rowToRelationship(r: Row): Relationship {
  return {
    id: r.id as string,
    workspaceId: r.workspace_id as string,
    fromContactId: r.from_contact_id as string,
    toContactId: r.to_contact_id as string,
    kind: r.kind as Category,
    strength: Number(r.strength),
    origin: r.origin as Relationship['origin'],
    notes: (r.notes as string) ?? '',
    createdAt: r.created_at as string,
  };
}

export function rowToInteraction(r: Row): Interaction {
  return {
    id: r.id as string,
    workspaceId: r.workspace_id as string,
    contactId: r.contact_id as string,
    channel: r.channel as Interaction['channel'],
    direction: r.direction as Interaction['direction'],
    subject: (r.subject as string) ?? '',
    threadId: (r.thread_id as string | null) ?? null,
    occurredAt: r.occurred_at as string,
  };
}

export function rowToJob(r: Row): ImportJob {
  return {
    id: r.id as string,
    workspaceId: r.workspace_id as string,
    source: r.source as Source,
    status: r.status as ImportJob['status'],
    stats: json(r.stats, { parsed: 0, created: 0, merged: 0, skipped: 0, relationships: 0, interactions: 0, warnings: [] }),
    error: (r.error as string | null) ?? null,
    createdAt: r.created_at as string,
    finishedAt: (r.finished_at as string | null) ?? null,
  };
}

/* ---------- workspaces & membership ---------- */

export function workspacesForUser(db: DB, userId: string): Workspace[] {
  const rows = db
    .prepare('SELECT w.*, m.role FROM workspaces w JOIN workspace_members m ON m.workspace_id = w.id WHERE m.user_id = ? ORDER BY w.created_at')
    .all(userId) as Row[];
  return rows.map((r) => rowToWorkspace(r, r.role as Role));
}

export function requireMembership(db: DB, workspaceId: string, userId: string, minRole: Role = 'viewer'): Workspace {
  const r = db.prepare('SELECT w.*, m.role FROM workspaces w JOIN workspace_members m ON m.workspace_id = w.id WHERE w.id = ? AND m.user_id = ?').get(workspaceId, userId) as Row | undefined;
  if (!r) throw new HttpError(404, 'Workspace not found');
  const rank: Record<Role, number> = { viewer: 0, editor: 1, owner: 2 };
  const role = r.role as Role;
  if (rank[role] < rank[minRole]) throw new HttpError(403, `This action needs the ${minRole} role`);
  return rowToWorkspace(r, role);
}

export function createWorkspace(db: DB, userId: string, name: string, selfEmails: string[] = [], corporateDomains: string[] = []): Workspace {
  const id = uuid();
  const ts = now();
  db.prepare('INSERT INTO workspaces (id, name, owner_id, corporate_domains, self_emails, created_at) VALUES (?,?,?,?,?,?)').run(id, name, userId, JSON.stringify(corporateDomains), JSON.stringify(selfEmails), ts);
  db.prepare('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?,?,?)').run(id, userId, 'owner');
  // The owner is a contact too (the centre of the graph).
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as Row;
  db.prepare(
    `INSERT INTO contacts (id, workspace_id, display_name, first_name, last_name, emails, categories, is_self, strength, created_at, updated_at) VALUES (?,?,?,?,?,?,?,1,1,?,?)`,
  ).run(uuid(), id, user.name as string, (user.name as string).split(' ')[0], (user.name as string).split(' ').slice(1).join(' '), JSON.stringify(selfEmails.length ? selfEmails : [user.email]), JSON.stringify(CATEGORIES), ts, ts);
  return requireMembership(db, id, userId);
}

export function members(db: DB, workspaceId: string): WorkspaceMember[] {
  return (db.prepare('SELECT u.id as user_id, u.email, u.name, m.role FROM workspace_members m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = ? ORDER BY m.role, u.name').all(workspaceId) as Row[]).map((r) => ({
    userId: r.user_id as string,
    email: r.email as string,
    name: r.name as string,
    role: r.role as Role,
  }));
}

/* ---------- contacts ---------- */

export function selfContact(db: DB, workspaceId: string): Contact | null {
  const r = db.prepare('SELECT * FROM contacts WHERE workspace_id = ? AND is_self = 1 AND merged_into IS NULL').get(workspaceId) as Row | undefined;
  return r ? rowToContact(r) : null;
}

export function listContacts(db: DB, workspaceId: string, opts: { category?: Category; source?: Source; q?: string; tag?: string; company?: string; includeSelf?: boolean } = {}): Contact[] {
  let sql = 'SELECT * FROM contacts WHERE workspace_id = ? AND merged_into IS NULL';
  const args: unknown[] = [workspaceId];
  if (!opts.includeSelf) sql += ' AND is_self = 0';
  if (opts.category) {
    sql += ' AND categories LIKE ?';
    args.push(`%"${opts.category}"%`);
  }
  if (opts.tag) {
    sql += ' AND tags LIKE ?';
    args.push(`%${JSON.stringify(opts.tag)}%`);
  }
  if (opts.company) {
    sql += ' AND company = ?';
    args.push(opts.company);
  }
  if (opts.q) {
    sql += ' AND (display_name LIKE ? OR emails LIKE ? OR company LIKE ? OR title LIKE ? OR notes LIKE ?)';
    const like = `%${opts.q}%`;
    args.push(like, like, like, like, like);
  }
  sql += ' ORDER BY strength DESC, display_name COLLATE NOCASE';
  const rows = db.prepare(sql).all(...(args as never[])) as Row[];
  const ids = rows.map((r) => r.id as string);
  const sourcesByContact = sourcesFor(db, ids);
  let contacts = rows.map((r) => rowToContact(r, sourcesByContact.get(r.id as string) ?? []));
  if (opts.source) contacts = contacts.filter((c) => c.sources.some((s) => s.source === opts.source));
  return contacts;
}

export function sourcesFor(db: DB, contactIds: string[]): Map<string, ContactSource[]> {
  const map = new Map<string, ContactSource[]>();
  if (!contactIds.length) return map;
  // chunk to stay under SQLite's variable limit
  for (let i = 0; i < contactIds.length; i += 500) {
    const chunk = contactIds.slice(i, i + 500);
    const rows = db.prepare(`SELECT * FROM contact_sources WHERE contact_id IN (${chunk.map(() => '?').join(',')}) ORDER BY imported_at`).all(...(chunk as never[])) as Row[];
    for (const r of rows) {
      const list = map.get(r.contact_id as string) ?? [];
      list.push(rowToSource(r));
      map.set(r.contact_id as string, list);
    }
  }
  return map;
}

export function getContact(db: DB, workspaceId: string, id: string): Contact {
  const r = db.prepare('SELECT * FROM contacts WHERE workspace_id = ? AND id = ?').get(workspaceId, id) as Row | undefined;
  if (!r) throw new HttpError(404, 'Contact not found');
  if (r.merged_into) return getContact(db, workspaceId, r.merged_into as string);
  return rowToContact(r, sourcesFor(db, [id]).get(id) ?? []);
}

export function effectiveCategories(inferred: Category[], overrides: Category[] | null): Category[] {
  return overrides ?? inferred;
}

/* ---------- relationships / graph ---------- */

export function graph(db: DB, workspaceId: string, opts: { category?: Category; source?: Source; minStrength?: number; company?: string; q?: string } = {}): Graph {
  const contacts = listContacts(db, workspaceId, { includeSelf: true, category: opts.category, source: opts.source, company: opts.company, q: opts.q });
  const visible = new Set(contacts.filter((c) => c.isSelf || c.strength >= (opts.minStrength ?? 0)).map((c) => c.id));
  const rels = (db.prepare('SELECT * FROM relationships WHERE workspace_id = ?').all(workspaceId) as Row[]).map(rowToRelationship);
  return {
    nodes: contacts
      .filter((c) => visible.has(c.id))
      .map((c) => ({
        id: c.id,
        name: c.displayName,
        company: c.company,
        categories: c.categories,
        sources: Array.from(new Set(c.sources.map((s) => s.source))),
        strength: c.strength,
        isSelf: c.isSelf,
        avatarUrl: c.avatarUrl,
      })),
    links: rels
      .filter((r) => visible.has(r.fromContactId) && visible.has(r.toContactId))
      .filter((r) => !opts.category || r.kind === opts.category || r.origin === 'employer')
      .map((r) => ({ source: r.fromContactId, target: r.toContactId, kind: r.kind, strength: r.strength, origin: r.origin })),
  };
}

export function summary(db: DB, workspaceId: string): Summary {
  const contacts = listContacts(db, workspaceId);
  const relationships = (db.prepare('SELECT COUNT(*) as n FROM relationships WHERE workspace_id = ?').get(workspaceId) as Row).n as number;
  const interactions = (db.prepare('SELECT COUNT(*) as n FROM interactions WHERE workspace_id = ?').get(workspaceId) as Row).n as number;
  const companies = new Map<string, number>();
  for (const c of contacts) if (c.company) companies.set(c.company, (companies.get(c.company) ?? 0) + 1);
  return {
    contacts: contacts.length,
    relationships,
    interactions,
    byCategory: countBy(contacts.flatMap((c) => c.categories), CATEGORIES),
    bySource: countBy(contacts.flatMap((c) => Array.from(new Set(c.sources.map((s) => s.source)))), SOURCES),
    companies: Array.from(companies.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 25),
    recentImports: (db.prepare('SELECT * FROM import_jobs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 10').all(workspaceId) as Row[]).map(rowToJob),
  };
}

export function listTags(db: DB, workspaceId: string): Tag[] {
  return (db.prepare('SELECT * FROM tags WHERE workspace_id = ? ORDER BY name').all(workspaceId) as Row[]).map((r) => ({ id: r.id as string, workspaceId, name: r.name as string, color: r.color as string }));
}

export function ensureTag(db: DB, workspaceId: string, name: string, color?: string): Tag {
  const existing = db.prepare('SELECT * FROM tags WHERE workspace_id = ? AND name = ?').get(workspaceId, name) as Row | undefined;
  if (existing) return { id: existing.id as string, workspaceId, name, color: existing.color as string };
  const id = uuid();
  const c = color ?? TAG_COLORS[Math.abs(hash(name)) % TAG_COLORS.length];
  db.prepare('INSERT INTO tags (id, workspace_id, name, color) VALUES (?,?,?,?)').run(id, workspaceId, name, c);
  return { id, workspaceId, name, color: c };
}

const TAG_COLORS = ['#0B57D0', '#146C2E', '#B3261E', '#7A5C00', '#6750A4', '#00677D', '#8C4A00', '#4A5C92'];
function hash(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return h;
}
