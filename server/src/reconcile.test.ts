import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, now, uuid } from './db.ts';
import { createWorkspace, listContacts, graph, requireMembership } from './repo.ts';
import { reconcile, findDuplicates, mergeContacts } from './reconcile.ts';
import { hashPassword, encrypt, decrypt, signToken, verifyToken, verifyPassword } from './auth.ts';
import { parseImportFile } from '@shared/importers/index.ts';
import { generateDemo } from './demo.ts';

function setup() {
  const db = openDb(':memory:');
  const userId = uuid();
  db.prepare('INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?,?,?,?,?)').run(userId, 'jordan@northwindlabs.com', 'Jordan Reyes', hashPassword('pw'), now());
  const ws = createWorkspace(db, userId, 'Test', ['jordan@northwindlabs.com'], ['northwindlabs.com']);
  return { db, userId, ws };
}

test('reconcile merges people across sources and builds the graph', () => {
  const { db, ws } = setup();
  const demo = generateDemo();
  const li = reconcile(db, ws, 'linkedin', parseImportFile('linkedin', demo.files.linkedin));
  assert.equal(li.created, 98);
  const fb = reconcile(db, ws, 'facebook', parseImportFile('facebook', demo.files.facebook));
  assert.ok(fb.merged > 0, 'facebook friends merge into linkedin people by name');
  const em = reconcile(db, ws, 'email', parseImportFile('email', demo.files.mbox, { filename: 'mail.mbox', email: { selfEmails: ws.selfEmails, corporateDomains: ws.corporateDomains } }));
  assert.ok(em.interactions > 100);
  const contacts = listContacts(db, ws.id);
  assert.ok(contacts.some((c) => c.categories.includes('corporate')), 'corporate circle from domain');
  assert.ok(contacts.some((c) => c.sources.length >= 2), 'multi-source people');
  const g = graph(db, ws.id);
  assert.equal(g.nodes.filter((n) => n.isSelf).length, 1);
  assert.ok(g.links.length >= contacts.length);
  // idempotent
  const again = reconcile(db, ws, 'linkedin', parseImportFile('linkedin', demo.files.linkedin));
  assert.equal(again.created, 0);
  assert.equal(listContacts(db, ws.id).length, contacts.length);
});

test('duplicates and merge', () => {
  const { db, ws } = setup();
  reconcile(db, ws, 'manual', { warnings: [], interactions: [], contacts: [{ source: 'manual', displayName: 'Ada Lovelace', emails: ['ada@a.com'] }] });
  reconcile(db, ws, 'contacts', { warnings: [], interactions: [], contacts: [{ source: 'contacts', displayName: 'A. Lovelace', emails: ['ada@b.com'], company: 'Analytical' }] });
  assert.equal(listContacts(db, ws.id).length, 2);
  const pairs = findDuplicates(db, ws.id);
  assert.equal(pairs.length, 0, 'different emails and names are not auto-flagged');
  const [a, b] = listContacts(db, ws.id);
  mergeContacts(db, ws, a.id, b.id);
  const left = listContacts(db, ws.id);
  assert.equal(left.length, 1);
  assert.deepEqual(left[0].emails.sort(), ['ada@a.com', 'ada@b.com']);
  assert.equal(left[0].company, 'Analytical');
  assert.equal(left[0].sources.length, 2);
  assert.equal(requireMembership(db, ws.id, ws.ownerId).id, ws.id);
});

test('auth primitives', () => {
  const h = hashPassword('secret-pass');
  assert.ok(verifyPassword('secret-pass', h));
  assert.ok(!verifyPassword('wrong', h));
  const t = signToken({ sub: 'u1' }, 'k');
  assert.equal(verifyToken(t, 'k')?.sub, 'u1');
  assert.equal(verifyToken(t, 'other'), null);
  const key = Buffer.alloc(32, 7);
  assert.equal(decrypt(encrypt('api-key', key), key), 'api-key');
});
