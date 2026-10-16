import { expect, test } from 'playwright/test';
import { adoptSession, apiImport, apiUser, FIXTURES } from './helpers.ts';

test.describe('Mobile layout', () => {
  test('bottom navigation, responsive dashboard and graph', async ({ page, request, baseURL }) => {
    const u = await apiUser(request);
    await apiImport(request, u.workspaceId, 'linkedin', FIXTURES.linkedin);
    await adoptSession(page, request, baseURL!);
    await page.goto('/');
    await expect(page.locator('.bottom-nav')).toBeVisible();
    await expect(page.locator('.rail')).toBeHidden();
    await expect(page.getByTestId('stat-cards')).toBeVisible();
    await page.locator('.bottom-nav').getByTestId('nav-network').click();
    await expect(page.getByTestId('force-graph')).toBeVisible();
    await page.locator('.bottom-nav').getByTestId('nav-people').click();
    await expect(page.getByTestId('person-row').first()).toBeVisible();
  });
});
