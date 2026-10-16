import type { ImportJob, IntegrationPublic, Provider, Source } from '@shared/types.ts';
import { SOURCES } from '@shared/types.ts';
import { parseImportFile } from '@shared/importers/index.ts';
import type { Router } from '../http.ts';
import { HttpError, v } from '../http.ts';
import { decrypt, encrypt, requireUser, type Secrets } from '../auth.ts';
import { now, uuid, type DB, type Row } from '../db.ts';
import { requireMembership, rowToJob } from '../repo.ts';
import { reconcile } from '../reconcile.ts';
import { PROVIDERS, SECRET_KEYS, syncProvider, testConnection } from '../connectors/index.ts';

const PROVIDER_IDS = PROVIDERS.map((p) => p.provider);

export function importRoutes(r: Router, db: DB, secrets: Secrets) {
  const insertJob = (workspaceId: string, source: Source): string => {
    const id = uuid();
    db.prepare("INSERT INTO import_jobs (id, workspace_id, source, status, created_at) VALUES (?,?,?,'running',?)").run(id, workspaceId, source, now());
    return id;
  };
  const finishJob = (id: string, stats: unknown, error: string | null) => {
    db.prepare('UPDATE import_jobs SET status = ?, stats = ?, error = ?, finished_at = ? WHERE id = ?').run(error ? 'error' : 'done', JSON.stringify(stats ?? {}), error, now(), id);
  };

  r.get('/workspaces/:id/imports', (ctx) => {
    const ws = requireMembership(db, ctx.params.id, requireUser(ctx));
    return (db.prepare('SELECT * FROM import_jobs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 50').all(ws.id) as Row[]).map(rowToJob);
  });

  /** Parses a file without saving anything, so the wizard can show what it found. */
  r.post('/workspaces/:id/imports/preview', (ctx) => {
    const ws = requireMembership(db, ctx.params.id, requireUser(ctx));
    const b = v.obj(ctx.body);
    const source = v.oneOf(b.source, 'source', SOURCES);
    const text = v.str(b.text, 'text', { min: 1 });
    const result = parseImportFile(source, text, {
      filename: v.str(b.filename, 'filename', { optional: true }),
      email: { selfEmails: ws.selfEmails, corporateDomains: ws.corporateDomains, bidirectionalOnly: b.bidirectionalOnly !== false },
    });
    return { total: result.contacts.length, interactions: result.interactions.length, warnings: result.warnings, sample: result.contacts.slice(0, 25) };
  });

  r.post('/workspaces/:id/imports', (ctx) => {
    const ws = requireMembership(db, ctx.params.id, requireUser(ctx), 'editor');
    const b = v.obj(ctx.body);
    const source = v.oneOf(b.source, 'source', SOURCES);
    const text = v.str(b.text, 'text', { min: 1 });
    const jobId = insertJob(ws.id, source);
    try {
      const result = parseImportFile(source, text, {
        filename: v.str(b.filename, 'filename', { optional: true }),
        email: { selfEmails: ws.selfEmails, corporateDomains: ws.corporateDomains, bidirectionalOnly: b.bidirectionalOnly !== false },
      });
      const stats = reconcile(db, ws, source, result);
      finishJob(jobId, stats, null);
    } catch (e) {
      finishJob(jobId, {}, (e as Error).message);
      throw e;
    }
    return rowToJob(db.prepare('SELECT * FROM import_jobs WHERE id = ?').get(jobId) as Row);
  });

  /* ---------- integrations ---------- */

  r.get('/providers', () => PROVIDERS);

  const publicIntegration = (row: Row): IntegrationPublic => {
    const secretsObj = safeDecrypt(row.secrets_enc as string, secrets.encryptionKey);
    return {
      id: row.id as string,
      provider: row.provider as Provider,
      label: row.label as string,
      config: JSON.parse(row.config as string),
      secretsSet: Object.fromEntries(Object.keys(secretsObj).map((k) => [k, !!secretsObj[k]])),
      status: row.status as IntegrationPublic['status'],
      lastSyncAt: (row.last_sync_at as string) ?? null,
      lastError: (row.last_error as string) ?? null,
    };
  };

  r.get('/workspaces/:id/integrations', (ctx) => {
    const ws = requireMembership(db, ctx.params.id, requireUser(ctx));
    return (db.prepare('SELECT * FROM integrations WHERE workspace_id = ? ORDER BY created_at').all(ws.id) as Row[]).map(publicIntegration);
  });

  const splitFields = (b: Record<string, unknown>) => {
    const config: Record<string, string> = {};
    const sec: Record<string, string> = {};
    for (const [k, val] of Object.entries(v.obj(b.config ?? {}, 'config'))) if (typeof val === 'string' && val.trim()) (SECRET_KEYS.has(k) ? sec : config)[k] = val.trim();
    for (const [k, val] of Object.entries(v.obj(b.secrets ?? {}, 'secrets'))) if (typeof val === 'string' && val.trim()) sec[k] = val.trim();
    return { config, sec };
  };

  r.post('/workspaces/:id/integrations', (ctx) => {
    const ws = requireMembership(db, ctx.params.id, requireUser(ctx), 'editor');
    const b = v.obj(ctx.body);
    const provider = v.oneOf(b.provider, 'provider', PROVIDER_IDS);
    const spec = PROVIDERS.find((p) => p.provider === provider)!;
    const { config, sec } = splitFields(b);
    for (const f of spec.fields) if (f.required && !config[f.key] && !sec[f.key]) throw new HttpError(400, `${f.label} is required`);
    const id = uuid();
    db.prepare('INSERT INTO integrations (id, workspace_id, provider, label, config, secrets_enc, created_at) VALUES (?,?,?,?,?,?,?)').run(id, ws.id, provider, v.str(b.label, 'label', { optional: true }) || spec.name, JSON.stringify(config), encrypt(JSON.stringify(sec), secrets.encryptionKey), now());
    return publicIntegration(db.prepare('SELECT * FROM integrations WHERE id = ?').get(id) as Row);
  });

  r.patch('/workspaces/:id/integrations/:iid', (ctx) => {
    const ws = requireMembership(db, ctx.params.id, requireUser(ctx), 'editor');
    const row = db.prepare('SELECT * FROM integrations WHERE id = ? AND workspace_id = ?').get(ctx.params.iid, ws.id) as Row | undefined;
    if (!row) throw new HttpError(404, 'Integration not found');
    const b = v.obj(ctx.body);
    const { config, sec } = splitFields(b);
    const existingSecrets = safeDecrypt(row.secrets_enc as string, secrets.encryptionKey);
    const mergedSecrets = { ...existingSecrets, ...sec };
    for (const k of v.strArr(b.clearSecrets, 'clearSecrets')) delete mergedSecrets[k];
    db.prepare('UPDATE integrations SET label = ?, config = ?, secrets_enc = ? WHERE id = ?').run(b.label !== undefined ? v.str(b.label, 'label', { min: 1 }) : row.label, JSON.stringify({ ...JSON.parse(row.config as string), ...config }), encrypt(JSON.stringify(mergedSecrets), secrets.encryptionKey), row.id);
    return publicIntegration(db.prepare('SELECT * FROM integrations WHERE id = ?').get(row.id) as Row);
  });

  r.delete('/workspaces/:id/integrations/:iid', (ctx) => {
    const ws = requireMembership(db, ctx.params.id, requireUser(ctx), 'editor');
    db.prepare('DELETE FROM integrations WHERE id = ? AND workspace_id = ?').run(ctx.params.iid, ws.id);
    return { ok: true };
  });

  const load = (ws: { id: string }, iid: string) => {
    const row = db.prepare('SELECT * FROM integrations WHERE id = ? AND workspace_id = ?').get(iid, ws.id) as Row | undefined;
    if (!row) throw new HttpError(404, 'Integration not found');
    return { row, config: JSON.parse(row.config as string) as Record<string, string>, secretsObj: safeDecrypt(row.secrets_enc as string, secrets.encryptionKey) };
  };

  r.post('/workspaces/:id/integrations/:iid/test', async (ctx) => {
    const ws = requireMembership(db, ctx.params.id, requireUser(ctx), 'editor');
    const { row, config, secretsObj } = load(ws, ctx.params.iid);
    try {
      const res = await testConnection(row.provider as Provider, config, secretsObj);
      db.prepare("UPDATE integrations SET status = 'ok', last_error = NULL WHERE id = ?").run(row.id);
      return res;
    } catch (e) {
      db.prepare("UPDATE integrations SET status = 'error', last_error = ? WHERE id = ?").run((e as Error).message, row.id);
      throw new HttpError(400, `Connection failed: ${(e as Error).message}`);
    }
  });

  r.post('/workspaces/:id/integrations/:iid/sync', async (ctx) => {
    const ws = requireMembership(db, ctx.params.id, requireUser(ctx), 'editor');
    const { row, config, secretsObj } = load(ws, ctx.params.iid);
    db.prepare("UPDATE integrations SET status = 'syncing', last_error = NULL WHERE id = ?").run(row.id);
    const jobs: ImportJob[] = [];
    try {
      const results = await syncProvider(row.provider as Provider, { ws, config, secrets: secretsObj, log: (m) => console.log(`[sync ${row.provider}] ${m}`) });
      for (const { source, result } of results) {
        const jobId = insertJob(ws.id, source);
        try {
          const stats = reconcile(db, ws, source, result);
          finishJob(jobId, stats, null);
        } catch (e) {
          finishJob(jobId, {}, (e as Error).message);
        }
        jobs.push(rowToJob(db.prepare('SELECT * FROM import_jobs WHERE id = ?').get(jobId) as Row));
      }
      db.prepare("UPDATE integrations SET status = 'ok', last_sync_at = ? WHERE id = ?").run(now(), row.id);
    } catch (e) {
      db.prepare("UPDATE integrations SET status = 'error', last_error = ? WHERE id = ?").run((e as Error).message, row.id);
      throw new HttpError(400, `Sync failed: ${(e as Error).message}`);
    }
    return { integration: publicIntegration(db.prepare('SELECT * FROM integrations WHERE id = ?').get(row.id) as Row), jobs };
  });
}

function safeDecrypt(blob: string, key: Buffer): Record<string, string> {
  try {
    return blob ? (JSON.parse(decrypt(blob, key)) as Record<string, string>) : {};
  } catch {
    return {};
  }
}
