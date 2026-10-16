import { expect, test } from 'playwright/test';
import { apiImport, apiUser, FIXTURES, fixtureText, uniqueEmail } from './helpers.ts';

test.describe('API contract', () => {
  test('health and validation errors', async ({ request }) => {
    expect((await request.get('/api/health')).ok()).toBeTruthy();
    const bad = await request.post('/api/auth/register', { data: { email: 'nope', name: '', password: 'short' } });
    expect(bad.status()).toBe(400);
    expect((await bad.json()).error).toContain('email');
    const missing = await request.get('/api/nope');
    expect(missing.status()).toBe(404);
  });

  test('workspace isolation between users', async ({ request, browser }) => {
    const a = await apiUser(request);
    await apiImport(request, a.workspaceId, 'linkedin', FIXTURES.linkedin);
    const ctx = await browser.newContext();
    const b = await apiUser(ctx.request);
    const res = await ctx.request.get(`/api/workspaces/${a.workspaceId}/contacts`);
    expect(res.status()).toBe(404);
    const own = await ctx.request.get(`/api/workspaces/${b.workspaceId}/contacts`);
    expect((await own.json()).total).toBe(0);
    await ctx.close();
  });

  test('import preview does not persist and bad files produce warnings', async ({ request }) => {
    const u = await apiUser(request);
    const preview = await request.post(`/api/workspaces/${u.workspaceId}/imports/preview`, { data: { source: 'facebook', filename: 'friends.json', text: fixtureText(FIXTURES.facebook) } });
    expect((await preview.json()).total).toBe(63);
    expect((await (await request.get(`/api/workspaces/${u.workspaceId}/contacts`)).json()).total).toBe(0);
    const garbage = await request.post(`/api/workspaces/${u.workspaceId}/imports/preview`, { data: { source: 'facebook', filename: 'x.json', text: 'not json' } });
    expect((await garbage.json()).warnings[0]).toContain('Not valid JSON');
  });

  test('graph, analytics, export and relationships', async ({ request }) => {
    const u = await apiUser(request);
    await apiImport(request, u.workspaceId, 'linkedin', FIXTURES.linkedin);
    await apiImport(request, u.workspaceId, 'email', FIXTURES.email);
    const graph = (await (await request.get(`/api/workspaces/${u.workspaceId}/graph`)).json()) as { nodes: unknown[]; links: unknown[] };
    expect(graph.nodes.length).toBeGreaterThan(90);
    expect(graph.links.length).toBeGreaterThan(90);
    const analytics = (await (await request.get(`/api/workspaces/${u.workspaceId}/analytics`)).json()) as { venn: unknown[]; chord: { matrix: number[][] }; sankey: { nodes: unknown[] }; hierarchy: { children: unknown[] }; timeline: unknown[] };
    expect(analytics.venn).toHaveLength(15);
    expect(analytics.chord.matrix).toHaveLength(4);
    expect(analytics.sankey.nodes.length).toBeGreaterThan(5);
    expect(analytics.hierarchy.children.length).toBeGreaterThan(1);
    expect(analytics.timeline).toHaveLength(24);

    const contacts = (await (await request.get(`/api/workspaces/${u.workspaceId}/contacts?limit=2`)).json()) as { contacts: { id: string }[] };
    const rel = await request.post(`/api/workspaces/${u.workspaceId}/relationships`, { data: { fromContactId: contacts.contacts[0].id, toContactId: contacts.contacts[1].id, kind: 'personal', strength: 0.9 } });
    expect(rel.ok()).toBeTruthy();
    const exp = (await (await request.get(`/api/workspaces/${u.workspaceId}/export`)).json()) as { contacts: unknown[]; relationships: { origin: string }[] };
    expect(exp.contacts.length).toBeGreaterThan(90);
    expect(exp.relationships.some((r) => r.origin === 'manual')).toBeTruthy();
  });

  test('integration secrets are encrypted and never returned', async ({ request }) => {
    const u = await apiUser(request);
    const created = await request.post(`/api/workspaces/${u.workspaceId}/integrations`, { data: { provider: 'x', config: { username: 'jack', bearerToken: 'SECRET-TOKEN-VALUE' } } });
    expect(created.ok()).toBeTruthy();
    const body = JSON.stringify(await created.json());
    expect(body).not.toContain('SECRET-TOKEN-VALUE');
    expect(body).toContain('"bearerToken":true');
    const missing = await request.post(`/api/workspaces/${u.workspaceId}/integrations`, { data: { provider: 'x', config: { username: 'jack' } } });
    expect(missing.status()).toBe(400);
  });

  test('invites are single-use', async ({ request, browser }) => {
    const owner = await apiUser(request);
    const email = uniqueEmail('inv');
    const inv = (await (await request.post(`/api/workspaces/${owner.workspaceId}/invites`, { data: { email, role: 'editor' } })).json()) as { token: string };
    const ctx = await browser.newContext();
    await apiUser(ctx.request, { email: uniqueEmail('someone-else') });
    expect((await ctx.request.post(`/api/invites/${inv.token}/accept`)).ok()).toBeTruthy();
    expect((await ctx.request.post(`/api/invites/${inv.token}/accept`)).status()).toBe(410);
    await ctx.close();
  });
});
