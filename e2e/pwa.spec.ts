import { expect, test } from 'playwright/test';
import { adoptSession, apiImport, apiUser, FIXTURES } from './helpers.ts';

test.describe('PWA', () => {
  test('manifest, icons and service worker are served', async ({ request }) => {
    const manifest = await request.get('/manifest.webmanifest');
    expect(manifest.ok()).toBeTruthy();
    expect(manifest.headers()['content-type']).toContain('manifest');
    const m = (await manifest.json()) as { name: string; display: string; icons: { src: string; purpose?: string }[]; start_url: string };
    expect(m.name).toBe('Relationship Manager');
    expect(m.display).toBe('standalone');
    expect(m.icons.some((i) => i.purpose === 'maskable')).toBeTruthy();
    for (const icon of m.icons) expect((await request.get(icon.src)).ok(), icon.src).toBeTruthy();
    const sw = await request.get('/sw.js');
    expect(sw.ok()).toBeTruthy();
    expect(await sw.text()).toContain('rm-shell');
    const html = await request.get('/people/anything-spa');
    expect(await html.text()).toContain('<div id="root">');
  });

  test('registers the service worker and keeps working offline', async ({ page, request, baseURL, context }) => {
    const u = await apiUser(request);
    await apiImport(request, u.workspaceId, 'linkedin', FIXTURES.linkedin);
    await adoptSession(page, request, baseURL!);
    await page.goto('/?sw');
    await page.waitForFunction(() => navigator.serviceWorker?.controller !== null || false, null, { timeout: 20_000 }).catch(() => undefined);
    await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration()), null, { timeout: 20_000 });
    await expect(page.getByTestId('stat-cards')).toBeVisible();
    // warm the API cache
    await page.goto('/people?sw');
    await expect(page.getByTestId('person-row').first()).toBeVisible();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20_000 });

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText(/offline/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('person-row').first()).toBeVisible();
    await context.setOffline(false);
  });

  test('install metadata is present in the document head', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('link[rel=manifest]')).toHaveAttribute('href', '/manifest.webmanifest');
    await expect(page.locator('meta[name=theme-color]').first()).toHaveCount(1);
    await expect(page.locator('link[rel=apple-touch-icon]')).toHaveAttribute('href', /icon-192/);
  });
});
