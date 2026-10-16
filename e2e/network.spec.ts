import { expect, test } from 'playwright/test';
import { adoptSession, apiUser, seedAll } from './helpers.ts';

test.describe('Network visualisations', () => {
  test.beforeEach(async ({ page, request, baseURL }) => {
    const u = await apiUser(request);
    await seedAll(request, u.workspaceId);
    await adoptSession(page, request, baseURL!);
  });

  test('force graph renders, filters and opens a person', async ({ page }) => {
    await page.goto('/network');
    const graph = page.getByTestId('force-graph');
    await expect(graph).toBeVisible();
    await expect(page.getByText(/140 people · \d+ relationships/)).toBeVisible();

    // lens filter narrows the graph
    await page.getByTestId('lens-corporate').click();
    await expect(page.getByText(/^20 people/)).toBeVisible();
    await page.getByTestId('lens-all').click();
    await expect(page.getByText(/^140 people/)).toBeVisible();

    // search filter
    await page.getByTestId('search-input').fill('Northwind');
    await expect(page.getByText(/^(2\d|3\d) people/)).toBeVisible();
    await page.getByTestId('search-input').fill('');

    // strength slider + cluster + labels controls exist
    await page.getByLabel('Minimum strength').fill('0.5');
    await expect(page.getByText(/people · /)).toBeVisible();
    await page.getByLabel('Minimum strength').fill('0');

    // clicking the centre hits "you" after auto-fit
    await page.waitForTimeout(2500);
    const box = (await page.locator('[data-testid=force-graph] canvas').boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByTestId('sheet')).toContainText('Jordan Reyes');
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByTestId('sheet')).toHaveCount(0);
  });

  test('venn diagram with set toggles and region click', async ({ page }) => {
    await page.goto('/network?view=venn');
    await expect(page.getByTestId('venn')).toBeVisible();
    await expect(page.getByText('Four-set Venn')).toBeVisible();
    await page.getByTestId('venn-set-social').click();
    await expect(page.getByText('Circle areas are proportional')).toBeVisible();
    await page.getByTestId('venn-set-corporate').click();
    // two sets left: click in the middle of the canvas (the overlap) → people list with exact filter
    const box = (await page.locator('[data-testid=venn] canvas').boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page).toHaveURL(/\/people\?categories=/);
    await expect(page.getByTestId('people-table')).toBeVisible();
  });

  test('chord, flow, treemap, radial and activity views render', async ({ page }) => {
    await page.goto('/network?view=chord');
    await expect(page.getByTestId('chord').locator('svg path').first()).toBeVisible();
    await expect(page.getByTestId('chord')).toContainText('Personal');

    await page.getByTestId('view-flow').click();
    await expect(page.getByTestId('sankey')).toContainText('LinkedIn');
    await expect(page.getByTestId('sankey')).toContainText('Northwind Labs');

    await page.getByTestId('view-treemap').click();
    await expect(page.getByTestId('treemap')).toContainText('Personal');
    await page.getByTestId('treemap').getByText(/^Business/).first().click();
    await expect(page.getByTestId('treemap-crumb')).toHaveText('Business');
    await page.getByTestId('treemap-root').click();

    await page.getByTestId('view-radial').click();
    await expect(page.getByTestId('radial')).toContainText('Corporate');

    await page.getByTestId('view-activity').click();
    await expect(page.getByTestId('activity-view')).toContainText('Interactions per month');
    await expect(page.getByTestId('activity-view')).toContainText('LinkedIn');
  });

  test('clicking a chord ribbon lists the shared people', async ({ page }) => {
    await page.goto('/network?view=chord');
    const ribbons = page.getByTestId('chord').locator('svg > g').first().locator('path');
    await expect(ribbons.first()).toBeVisible();
    await ribbons.first().click({ force: true });
    await expect(page).toHaveURL(/\/people\?categories=/);
  });

  test('dashboard category cards deep-link into the lens', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('category-card-business').click();
    await expect(page).toHaveURL(/category=business/);
    await expect(page.getByTestId('lens-business')).toHaveAttribute('aria-pressed', 'true');
  });
});
