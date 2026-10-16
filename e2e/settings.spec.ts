import { expect, test } from 'playwright/test';
import { adoptSession, apiImport, apiUser, FIXTURES, signUp } from './helpers.ts';

test.describe('Settings', () => {
  test('workspace corporate domains recompute circles', async ({ page, request, baseURL }) => {
    const u = await apiUser(request, { corporateDomains: [] });
    await apiImport(request, u.workspaceId, 'linkedin', FIXTURES.linkedin);
    await adoptSession(page, request, baseURL!);
    await page.goto('/');
    await expect(page.getByTestId('category-card-corporate')).toContainText('0');
    await page.goto('/settings/workspace');
    await page.getByTestId('ws-domains').fill('northwindlabs.com');
    await page.getByTestId('ws-save').click();
    await expect(page.getByTestId('snackbar')).toContainText('recomputed');
    await page.goto('/');
    await expect(page.getByTestId('category-card-corporate')).not.toContainText(/\b0\b/);
  });

  test('create and switch workspaces', async ({ page }) => {
    await signUp(page, { name: 'Switcher Sam' });
    await page.goto('/settings/workspace');
    await page.getByTestId('ws-new').click();
    await page.getByTestId('ws-create-name').fill('Team network');
    await page.getByTestId('ws-create').click();
    await expect(page.getByTestId('snackbar')).toContainText('Created Team network');
    await expect(page.getByTestId('ws-name')).toHaveValue('Team network');
    await page.getByTestId('workspace-menu').click();
    await page.getByRole('menuitem', { name: /My network/ }).click();
    await expect(page.getByTestId('ws-name')).toHaveValue('My network');
  });

  test('integrations: create with secrets, test fails gracefully, edit and delete', async ({ page }) => {
    await signUp(page);
    await page.goto('/settings/integrations');
    await expect(page.getByTestId('provider-tiles')).toContainText('Email (IMAP)');
    await page.getByTestId('provider-imap').click();
    await page.getByTestId('field-host').fill('imap.invalid.test');
    await page.getByTestId('field-user').fill('me@example.com');
    await page.getByTestId('field-password').fill('app-password-123');
    await page.getByTestId('integration-save').click();
    const card = page.getByTestId('integration-imap');
    await expect(card).toContainText('host: imap.invalid.test');
    await expect(card).toContainText('secrets: password');
    await expect(card).not.toContainText('app-password-123');

    await card.getByTestId('integration-test').click();
    await expect(page.getByTestId('snackbar')).toContainText('Connection failed', { timeout: 30_000 });

    await card.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByTestId('field-password')).toHaveValue('');
    await page.getByTestId('integration-dialog').getByLabel('Label').fill('Work mailbox');
    await page.getByTestId('integration-save').click();
    await expect(card).toContainText('Work mailbox');

    page.once('dialog', (d) => d.accept());
    await card.getByTestId('integration-delete').click();
    await expect(page.getByTestId('integrations-card')).toContainText('No integrations yet');
  });

  test('every provider has a connect form with secret fields', async ({ page, request }) => {
    const providers = (await (await request.get('/api/providers')).json()) as { provider: string; fields: { key: string; secret?: boolean }[] }[];
    expect(providers.map((p) => p.provider).sort()).toEqual(['facebook', 'google', 'imap', 'linkedin', 'microsoft', 'x']);
    for (const p of providers) expect(p.fields.some((f) => f.secret)).toBeTruthy();
    await signUp(page);
    await page.goto('/settings/integrations');
    for (const p of providers) {
      await page.getByTestId(`provider-${p.provider}`).click();
      await expect(page.getByTestId('integration-dialog')).toBeVisible();
      for (const f of p.fields) await expect(page.getByTestId(`field-${f.key}`)).toHaveAttribute('type', f.secret ? 'password' : 'text');
      await page.getByRole('button', { name: 'Cancel' }).click();
    }
  });

  test('appearance: seed colour and dark mode change the theme', async ({ page }) => {
    await signUp(page);
    await page.goto('/settings/appearance');
    const before = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary'));
    await page.getByTestId('seed-146c2e').click();
    const after = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary'));
    expect(after).not.toBe(before);
    await page.getByTestId('segment-dark').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByTestId('theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('profile name update and data export', async ({ page }) => {
    await signUp(page, { name: 'Before Name' });
    await page.goto('/settings/profile');
    await page.getByTestId('profile-name').fill('After Name');
    await page.getByTestId('profile-save').click();
    await expect(page.getByTestId('snackbar')).toContainText('Profile saved');
    await page.goto('/');
    await expect(page.getByTestId('page-title')).toContainText('After');
    await page.goto('/settings/data');
    const download = page.waitForEvent('download');
    await page.getByTestId('export-json').click();
    expect((await download).suggestedFilename()).toMatch(/export\.json$/);
  });
});
