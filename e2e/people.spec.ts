import { expect, test } from 'playwright/test';
import { adoptSession, apiUser, seedAll } from './helpers.ts';

test.describe('People & contact management', () => {
  test.beforeEach(async ({ page, request, baseURL }) => {
    const u = await apiUser(request);
    await seedAll(request, u.workspaceId);
    await adoptSession(page, request, baseURL!);
  });

  test('search, filter, sort and paginate', async ({ page }) => {
    await page.goto('/people');
    await expect(page.getByTestId('page-title')).toHaveText('People');
    await expect(page.getByTestId('person-row')).toHaveCount(50);
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByTestId('person-row')).toHaveCount(50);

    await page.getByTestId('search-input').fill('Northwind');
    const count = await page.getByTestId('person-row').count();
    expect(count).toBeGreaterThan(10);
    expect(count).toBeLessThan(40);

    await page.getByTestId('search-input').fill('');
    await page.getByTestId('cat-chip-corporate').click();
    await expect(page.getByTestId('person-row')).toHaveCount(20);
    await page.getByRole('switch', { name: /exact/ }).click();
    const exact = await page.getByTestId('person-row').count();
    expect(exact).toBeLessThan(20);
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.getByTestId('person-row')).toHaveCount(50);

    await page.getByRole('combobox').nth(3).selectOption('name');
    const first = await page.getByTestId('person-row').first().textContent();
    expect(first?.startsWith('AA') || first?.includes('Ada') || first?.includes('Amara') || first?.includes('Ava')).toBeTruthy();
  });

  test('open a person, edit, tag, note, override circles, log an interaction', async ({ page }) => {
    await page.goto('/people');
    await page.getByTestId('person-row').first().click();
    await expect(page).toHaveURL(/\/people\/[0-9a-f-]+/);
    await expect(page.getByTestId('circles-card')).toBeVisible();
    await expect(page.getByTestId('related-list')).toBeVisible();

    // tags & notes
    await page.getByTestId('tag-input').fill('mentor');
    await page.getByTestId('tag-input').press('Enter');
    await expect(page.getByTestId('tag-chips')).toContainText('mentor');
    await page.getByTestId('notes-input').fill('Met at the Chicago conference.');
    await page.getByTestId('save-notes').click();
    await page.reload();
    await expect(page.getByTestId('notes-input')).toHaveValue('Met at the Chicago conference.');
    await expect(page.getByTestId('tag-chips')).toContainText('mentor');

    // category override
    await page.getByTestId('circles-card').getByTestId('cat-chip-social').click();
    await expect(page.getByTestId('circles-card')).toContainText('Set manually');
    await page.getByRole('button', { name: 'Reset to automatic' }).click();
    await expect(page.getByTestId('circles-card')).toContainText('Inferred');

    // edit details
    await page.getByTestId('contact-more').click();
    await page.getByRole('menuitem', { name: 'Edit details' }).click();
    await page.getByTestId('edit-company').fill('Acme Rockets');
    await page.getByTestId('edit-save').click();
    await expect(page.getByTestId('page-title')).toBeVisible();
    await expect(page.getByText('Acme Rockets').first()).toBeVisible();

    // log an interaction
    const before = Number((await page.locator('text=/^\\d+$/').first().textContent()) ?? 0);
    await page.getByTestId('log-interaction').click();
    await page.getByTestId('log-subject').fill('Coffee catch-up');
    await page.getByTestId('log-save').click();
    await expect(page.getByTestId('interactions-table')).toContainText('Coffee catch-up');
    void before;
  });

  test('add a person manually, find and merge duplicates', async ({ page }) => {
    await page.goto('/people');
    await page.getByTestId('add-person').click();
    await page.getByTestId('add-person-name').fill('Ada Lovelace');
    await page.getByTestId('add-person-dialog').getByLabel('Email').fill('ada@example.com');
    await page.getByTestId('add-person-save').click();
    await expect(page.getByTestId('page-title')).toHaveText('Ada Lovelace');

    // create a second Ada with the same email through the API-backed UI
    await page.goto('/people');
    await page.getByTestId('add-person').click();
    await page.getByTestId('add-person-name').fill('Ada K. Lovelace');
    await page.getByTestId('add-person-dialog').getByLabel('Email').fill('ada@example.com');
    await page.getByTestId('add-person-save').click();

    await page.goto('/people');
    await page.getByTestId('find-duplicates').click();
    await expect(page.getByTestId('duplicates-dialog')).toContainText('Same email ada@example.com');
    await page.getByTestId('merge-keep').first().click();
    await expect(page.getByTestId('snackbar')).toContainText('Merged');
    await page.getByRole('button', { name: 'Close' }).click();
    await page.getByTestId('search-input').fill('Lovelace');
    await expect(page.getByTestId('person-row')).toHaveCount(1);
  });

  test('merge through the contact menu and export CSV', async ({ page }) => {
    await page.goto('/people');
    await page.getByTestId('search-input').fill('Ava');
    await page.getByTestId('person-row').first().click();
    await page.getByTestId('contact-more').click();
    await page.getByRole('menuitem', { name: 'Merge with…' }).click();
    await page.getByTestId('merge-search').fill('Ava');
    page.once('dialog', (d) => d.accept());
    await page.getByTestId('merge-candidate').first().click();
    await expect(page.getByTestId('snackbar')).toContainText('Merged');

    await page.goto('/people');
    const download = page.waitForEvent('download');
    await page.getByTestId('export-csv').click();
    expect((await download).suggestedFilename()).toBe('people.csv');
  });

  test('viewer role cannot edit', async ({ page, request, baseURL, browser }) => {
    // owner (already seeded) invites a viewer
    const me = await request.get('/api/auth/me');
    const ws = (await me.json()).workspaces[0].id as string;
    const viewerCtx = await browser.newContext();
    const viewerReq = viewerCtx.request;
    const viewer = await apiUser(viewerReq, { name: 'View Only' });
    const inv = await request.post(`/api/workspaces/${ws}/invites`, { data: { email: viewer.email, role: 'viewer' } });
    expect(inv.ok()).toBeTruthy();
    const viewerPage = await viewerCtx.newPage();
    await adoptSession(viewerPage, viewerReq, baseURL!);
    await viewerPage.goto('/');
    await viewerPage.evaluate((id) => localStorage.setItem('rm.workspace', id), ws);
    await viewerPage.goto('/people');
    await expect(viewerPage.getByTestId('person-row').first()).toBeVisible();
    await viewerPage.getByTestId('person-row').first().click();
    await expect(viewerPage.getByTestId('contact-more')).toHaveCount(0);
    await expect(viewerPage.getByTestId('notes-input')).toBeDisabled();
    const res = await viewerReq.post(`/api/workspaces/${ws}/contacts`, { data: { displayName: 'Nope' } });
    expect(res.status()).toBe(403);
    await viewerCtx.close();
    void page;
  });
});
