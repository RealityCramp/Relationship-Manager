import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, type APIRequestContext, type Page } from 'playwright/test';

let counter = 0;
export const uniqueEmail = (prefix = 'user') => `${prefix}-${Date.now().toString(36)}-${counter++}@example.com`;
export const PASSWORD = 'correct-horse-battery';

export const FIXTURES = {
  linkedin: 'linkedin-Connections.csv',
  facebook: 'facebook-friends.json',
  x: 'x-followers.csv',
  xArchive: 'x-follower.js',
  contacts: 'contacts.vcf',
  email: 'mail.mbox',
} as const;

export const fixturePath = (name: string) => resolve(process.cwd(), 'e2e/fixtures', name);
export const fixtureText = (name: string) => readFileSync(fixturePath(name), 'utf8');

/** Registers through the UI and lands on the dashboard. */
export async function signUp(page: Page, opts: { name?: string; email?: string } = {}) {
  const email = opts.email ?? uniqueEmail();
  const name = opts.name ?? 'Jordan Reyes';
  await page.goto('/');
  await page.getByTestId('auth-switch').click();
  await page.getByTestId('auth-name').fill(name);
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill(PASSWORD);
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('page-title')).toContainText('Good');
  return { email, name };
}

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/');
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill(password);
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('page-title')).toContainText('Good');
}

/** Creates an account through the API and returns an authenticated request context + workspace. */
export async function apiUser(request: APIRequestContext, opts: { name?: string; email?: string; corporateDomains?: string[]; selfEmails?: string[] } = {}) {
  const email = opts.email ?? uniqueEmail('api');
  const res = await request.post('/api/auth/register', { data: { email, name: opts.name ?? 'Jordan Reyes', password: PASSWORD } });
  expect(res.ok(), await res.text()).toBeTruthy();
  const body = (await res.json()) as { user: { id: string }; workspaces: { id: string }[] };
  const ws = body.workspaces[0];
  await request.patch(`/api/workspaces/${ws.id}`, { data: { selfEmails: opts.selfEmails ?? ['jordan@northwindlabs.com', email], corporateDomains: opts.corporateDomains ?? ['northwindlabs.com'] } });
  return { email, userId: body.user.id, workspaceId: ws.id };
}

export async function apiImport(request: APIRequestContext, workspaceId: string, source: string, fixture: string) {
  const res = await request.post(`/api/workspaces/${workspaceId}/imports`, { data: { source, filename: fixture, text: fixtureText(fixture) } });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as { stats: { created: number; merged: number; parsed: number; interactions: number } };
}

/** Full demo dataset through the API. */
export async function seedAll(request: APIRequestContext, workspaceId: string) {
  await apiImport(request, workspaceId, 'linkedin', FIXTURES.linkedin);
  await apiImport(request, workspaceId, 'facebook', FIXTURES.facebook);
  await apiImport(request, workspaceId, 'x', FIXTURES.x);
  await apiImport(request, workspaceId, 'contacts', FIXTURES.contacts);
  await apiImport(request, workspaceId, 'email', FIXTURES.email);
}

/** Copies the API session cookie into the browser so the page is signed in as that user. */
export async function adoptSession(page: Page, request: APIRequestContext, baseURL: string) {
  const state = await request.storageState();
  await page.context().addCookies(state.cookies.map((c) => ({ name: c.name, value: c.value, url: baseURL })));
}
