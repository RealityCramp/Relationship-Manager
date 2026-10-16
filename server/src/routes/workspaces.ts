import { randomBytes } from 'node:crypto';
import type { Router } from '../http.ts';
import { HttpError, v } from '../http.ts';
import { requireUser } from '../auth.ts';
import { now, uuid, type DB, type Row } from '../db.ts';
import { createWorkspace, members, requireMembership, workspacesForUser } from '../repo.ts';
import { recomputeAll } from '../reconcile.ts';

const ROLES = ['owner', 'editor', 'viewer'] as const;

export function workspaceRoutes(r: Router, db: DB) {
  r.get('/workspaces', (ctx) => workspacesForUser(db, requireUser(ctx)));

  r.post('/workspaces', (ctx) => {
    const uid = requireUser(ctx);
    const b = v.obj(ctx.body);
    return createWorkspace(db, uid, v.str(b.name, 'name', { min: 1, max: 80 }), v.strArr(b.selfEmails, 'selfEmails'), v.strArr(b.corporateDomains, 'corporateDomains'));
  });

  r.get('/workspaces/:id', (ctx) => requireMembership(db, ctx.params.id, requireUser(ctx)));

  r.patch('/workspaces/:id', (ctx) => {
    const ws = requireMembership(db, ctx.params.id, requireUser(ctx), 'editor');
    const b = v.obj(ctx.body);
    const name = b.name !== undefined ? v.str(b.name, 'name', { min: 1, max: 80 }) : ws.name;
    const selfEmails = b.selfEmails !== undefined ? v.strArr(b.selfEmails, 'selfEmails').map((e) => e.toLowerCase()) : ws.selfEmails;
    const corporateDomains = b.corporateDomains !== undefined ? v.strArr(b.corporateDomains, 'corporateDomains').map((d) => d.toLowerCase().replace(/^@/, '')) : ws.corporateDomains;
    db.prepare('UPDATE workspaces SET name = ?, self_emails = ?, corporate_domains = ? WHERE id = ?').run(name, JSON.stringify(selfEmails), JSON.stringify(corporateDomains), ws.id);
    db.prepare('UPDATE contacts SET emails = ? WHERE workspace_id = ? AND is_self = 1').run(JSON.stringify(selfEmails), ws.id);
    const updated = requireMembership(db, ws.id, ctx.userId!);
    if (JSON.stringify(corporateDomains) !== JSON.stringify(ws.corporateDomains)) recomputeAll(db, updated);
    return updated;
  });

  r.delete('/workspaces/:id', (ctx) => {
    const uid = requireUser(ctx);
    const ws = requireMembership(db, ctx.params.id, uid, 'owner');
    if (workspacesForUser(db, uid).length <= 1) throw new HttpError(400, 'You need at least one workspace');
    db.prepare('DELETE FROM workspaces WHERE id = ?').run(ws.id);
    return { ok: true };
  });

  r.get('/workspaces/:id/members', (ctx) => {
    const ws = requireMembership(db, ctx.params.id, requireUser(ctx));
    const invites = db.prepare('SELECT * FROM invites WHERE workspace_id = ? AND accepted_at IS NULL ORDER BY created_at DESC').all(ws.id) as Row[];
    return {
      members: members(db, ws.id),
      invites: invites.map((i) => ({ id: i.id, email: i.email, role: i.role, token: ws.role === 'owner' ? i.token : null, createdAt: i.created_at })),
    };
  });

  r.post('/workspaces/:id/invites', (ctx) => {
    const ws = requireMembership(db, ctx.params.id, requireUser(ctx), 'owner');
    const b = v.obj(ctx.body);
    const email = v.email(b.email);
    const role = v.oneOf(b.role ?? 'editor', 'role', ROLES);
    if (role === 'owner') throw new HttpError(400, 'Invite as editor or viewer; ownership can be transferred later');
    const existing = db.prepare('SELECT u.id FROM users u WHERE u.email = ?').get(email) as Row | undefined;
    if (existing) {
      db.prepare('INSERT OR REPLACE INTO workspace_members (workspace_id, user_id, role) VALUES (?,?,?)').run(ws.id, existing.id, role);
      return { joined: true, members: members(db, ws.id) };
    }
    const token = randomBytes(18).toString('base64url');
    db.prepare('INSERT INTO invites (id, workspace_id, email, role, token, created_at) VALUES (?,?,?,?,?,?)').run(uuid(), ws.id, email, role, token, now());
    return { joined: false, token, link: `/invite/${token}` };
  });

  r.delete('/workspaces/:id/invites/:inviteId', (ctx) => {
    const ws = requireMembership(db, ctx.params.id, requireUser(ctx), 'owner');
    db.prepare('DELETE FROM invites WHERE id = ? AND workspace_id = ?').run(ctx.params.inviteId, ws.id);
    return { ok: true };
  });

  r.get('/invites/:token', (ctx) => {
    const inv = db.prepare('SELECT i.*, w.name as workspace_name FROM invites i JOIN workspaces w ON w.id = i.workspace_id WHERE token = ?').get(ctx.params.token) as Row | undefined;
    if (!inv) throw new HttpError(404, 'Invite not found');
    return { email: inv.email, role: inv.role, workspaceName: inv.workspace_name, accepted: !!inv.accepted_at };
  });

  r.post('/invites/:token/accept', (ctx) => {
    const uid = requireUser(ctx);
    const inv = db.prepare('SELECT * FROM invites WHERE token = ?').get(ctx.params.token) as Row | undefined;
    if (!inv) throw new HttpError(404, 'Invite not found');
    if (inv.accepted_at) throw new HttpError(410, 'Invite already used');
    db.prepare('INSERT OR REPLACE INTO workspace_members (workspace_id, user_id, role) VALUES (?,?,?)').run(inv.workspace_id, uid, inv.role);
    db.prepare('UPDATE invites SET accepted_at = ? WHERE id = ?').run(now(), inv.id);
    return requireMembership(db, inv.workspace_id as string, uid);
  });

  r.patch('/workspaces/:id/members/:userId', (ctx) => {
    const ws = requireMembership(db, ctx.params.id, requireUser(ctx), 'owner');
    const role = v.oneOf(v.obj(ctx.body).role, 'role', ROLES);
    if (ctx.params.userId === ws.ownerId && role !== 'owner') throw new HttpError(400, 'The workspace owner keeps the owner role');
    db.prepare('UPDATE workspace_members SET role = ? WHERE workspace_id = ? AND user_id = ?').run(role, ws.id, ctx.params.userId);
    return members(db, ws.id);
  });

  r.delete('/workspaces/:id/members/:userId', (ctx) => {
    const uid = requireUser(ctx);
    const ws = requireMembership(db, ctx.params.id, uid, ctx.params.userId === uid ? 'viewer' : 'owner');
    if (ctx.params.userId === ws.ownerId) throw new HttpError(400, 'The owner cannot be removed');
    db.prepare('DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?').run(ws.id, ctx.params.userId);
    return { ok: true };
  });
}
