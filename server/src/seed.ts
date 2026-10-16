/**
 * Seeds a demo account and workspace with the generated sample data.
 *   npm run seed                 → creates demo@example.com / demo-password in ./data
 *   DB_PATH=... npm run seed     → seeds another database
 * Also writes the sample export files to e2e/fixtures so tests and docs can reuse them.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hashPassword } from './auth.ts';
import { now, openDb, uuid, type Row } from './db.ts';
import { generateDemo } from './demo.ts';
import { createWorkspace, requireMembership } from './repo.ts';
import { reconcile } from './reconcile.ts';
import { parseImportFile } from '@shared/importers/index.ts';
import type { Source } from '@shared/types.ts';

export const DEMO_EMAIL = 'demo@example.com';
export const DEMO_PASSWORD = 'demo-password';

export function writeFixtures(dir: string) {
  const demo = generateDemo();
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'linkedin-Connections.csv'), demo.files.linkedin);
  writeFileSync(resolve(dir, 'facebook-friends.json'), demo.files.facebook);
  writeFileSync(resolve(dir, 'x-follower.js'), demo.files.xFollowers);
  writeFileSync(resolve(dir, 'x-following.js'), demo.files.xFollowing);
  writeFileSync(resolve(dir, 'x-followers.csv'), demo.files.xCsv);
  writeFileSync(resolve(dir, 'contacts.vcf'), demo.files.contacts);
  writeFileSync(resolve(dir, 'mail.mbox'), demo.files.mbox);
  return demo;
}

export function seedDatabase(dbPath: string, opts: { email?: string; password?: string; name?: string } = {}) {
  const db = openDb(dbPath);
  const demo = generateDemo();
  const email = opts.email ?? DEMO_EMAIL;
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as Row | undefined;
  let userId: string;
  if (existing) userId = existing.id as string;
  else {
    userId = uuid();
    db.prepare('INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?,?,?,?,?)').run(userId, email, opts.name ?? demo.self.name, hashPassword(opts.password ?? DEMO_PASSWORD), now());
  }
  const wsRow = db.prepare("SELECT w.id FROM workspaces w JOIN workspace_members m ON m.workspace_id = w.id WHERE m.user_id = ? AND w.name = 'Demo network'").get(userId) as Row | undefined;
  const ws = wsRow ? requireMembership(db, wsRow.id as string, userId) : createWorkspace(db, userId, 'Demo network', [demo.self.email, email], [demo.self.corporate.domain]);
  const emailOpts = { selfEmails: ws.selfEmails, corporateDomains: ws.corporateDomains };
  const files: [Source, string, string][] = [
    ['linkedin', 'Connections.csv', demo.files.linkedin],
    ['facebook', 'friends.json', demo.files.facebook],
    ['x', 'followers.csv', demo.files.xCsv],
    ['contacts', 'contacts.vcf', demo.files.contacts],
    ['email', 'mail.mbox', demo.files.mbox],
  ];
  const stats = files.map(([source, filename, text]) => {
    const result = parseImportFile(source, text, { filename, email: emailOpts });
    const s = reconcile(db, ws, source, result);
    const jobId = uuid();
    db.prepare("INSERT INTO import_jobs (id, workspace_id, source, status, stats, created_at, finished_at) VALUES (?,?,?,'done',?,?,?)").run(jobId, ws.id, source, JSON.stringify(s), now(), now());
    return { source, ...s };
  });
  db.close();
  return { email, workspaceId: ws.id, stats };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop()!);
if (isMain) {
  const root = resolve(import.meta.dirname, '../..');
  writeFixtures(resolve(root, 'e2e/fixtures'));
  const dbPath = process.env.DB_PATH ?? resolve(root, 'data/relationship-manager.db');
  const r = seedDatabase(dbPath);
  console.log(`Seeded ${dbPath}`);
  console.log(`  sign in as ${r.email} / ${DEMO_PASSWORD}`);
  for (const s of r.stats) console.log(`  ${s.source}: parsed ${s.parsed}, created ${s.created}, merged ${s.merged}, interactions ${s.interactions}, relationships ${s.relationships}`);
}
