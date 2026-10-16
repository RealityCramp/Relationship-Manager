import type { Router } from '../http.ts';
import { HttpError, v } from '../http.ts';
import { hashPassword, requireUser, setSessionCookie, signToken, verifyPassword, type Secrets } from '../auth.ts';
import { now, uuid, type DB, type Row } from '../db.ts';
import { createWorkspace, rowToUser, workspacesForUser } from '../repo.ts';
import { emailDomain, isFreemail } from '@shared/util.ts';

export function authRoutes(r: Router, db: DB, secrets: Secrets) {
  r.post('/auth/register', (ctx) => {
    const b = v.obj(ctx.body);
    const email = v.email(b.email);
    const name = v.str(b.name, 'name', { min: 1, max: 120 });
    const password = v.str(b.password, 'password', { min: 8, max: 200 });
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'An account with that email already exists');
    const id = uuid();
    db.prepare('INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?,?,?,?,?)').run(id, email, name, hashPassword(password), now());
    const corporate = isFreemail(email) ? [] : [emailDomain(email)];
    createWorkspace(db, id, 'My network', [email], corporate);
    // auto-accept pending invites for this email
    const invites = db.prepare('SELECT * FROM invites WHERE email = ? AND accepted_at IS NULL').all(email) as Row[];
    for (const inv of invites) {
      db.prepare('INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role) VALUES (?,?,?)').run(inv.workspace_id, id, inv.role);
      db.prepare('UPDATE invites SET accepted_at = ? WHERE id = ?').run(now(), inv.id);
    }
    setSessionCookie(ctx, signToken({ sub: id }, secrets.jwtSecret));
    return { user: rowToUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Row), workspaces: workspacesForUser(db, id) };
  });

  r.post('/auth/login', (ctx) => {
    const b = v.obj(ctx.body);
    const email = v.email(b.email);
    const password = v.str(b.password, 'password');
    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as Row | undefined;
    if (!row || !verifyPassword(password, row.password_hash as string)) throw new HttpError(401, 'Incorrect email or password');
    setSessionCookie(ctx, signToken({ sub: row.id }, secrets.jwtSecret));
    return { user: rowToUser(row), workspaces: workspacesForUser(db, row.id as string) };
  });

  r.post('/auth/logout', (ctx) => {
    setSessionCookie(ctx, null);
    return { ok: true };
  });

  r.get('/auth/me', (ctx) => {
    const uid = requireUser(ctx);
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(uid) as Row | undefined;
    if (!row) throw new HttpError(401, 'Session expired');
    return { user: rowToUser(row), workspaces: workspacesForUser(db, uid) };
  });

  r.patch('/auth/me', (ctx) => {
    const uid = requireUser(ctx);
    const b = v.obj(ctx.body);
    if (b.name !== undefined) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(v.str(b.name, 'name', { min: 1, max: 120 }), uid);
    if (b.password !== undefined) {
      const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(uid) as Row;
      if (!verifyPassword(v.str(b.currentPassword, 'currentPassword'), row.password_hash as string)) throw new HttpError(400, 'Current password is incorrect');
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(v.str(b.password, 'password', { min: 8 })), uid);
    }
    return { user: rowToUser(db.prepare('SELECT * FROM users WHERE id = ?').get(uid) as Row) };
  });
}
