import { COOKIE, loadSecrets, verifyToken } from './auth.ts';
import { openDb, type DB } from './db.ts';
import { createApp, Router, type Ctx } from './http.ts';
import { authRoutes } from './routes/auth.ts';
import { workspaceRoutes } from './routes/workspaces.ts';
import { contactRoutes } from './routes/contacts.ts';
import { importRoutes } from './routes/imports.ts';

export interface AppOptions {
  dbPath: string;
  dataDir: string;
  staticDir?: string;
  quiet?: boolean;
}

export function buildApp(opts: AppOptions): { server: ReturnType<typeof createApp>; db: DB } {
  const db = openDb(opts.dbPath);
  const secrets = loadSecrets(opts.dataDir);
  const router = new Router('/api');
  router.get('/health', () => ({ ok: true, time: new Date().toISOString() }));
  authRoutes(router, db, secrets);
  workspaceRoutes(router, db);
  contactRoutes(router, db);
  importRoutes(router, db, secrets);

  const before = (ctx: Ctx) => {
    const bearer = ctx.req.headers.authorization?.replace(/^Bearer\s+/i, '');
    const token = ctx.cookies[COOKIE] || bearer;
    if (token) {
      const payload = verifyToken(token, secrets.jwtSecret);
      if (payload && typeof payload.sub === 'string') ctx.userId = payload.sub;
    }
  };
  const server = createApp({ router, staticDir: opts.staticDir, before, logger: opts.quiet ? () => undefined : undefined });
  return { server, db };
}
