import { expect, test } from 'playwright/test';
import { FIXTURES, fixturePath, signUp } from './helpers.ts';

async function importViaUi(page: import('playwright/test').Page, source: string, fixture: string, opts: { review?: boolean } = {}) {
  await page.goto('/import');
  await page.getByTestId(`source-${source}`).click();
  await page.getByTestId('file-input').setInputFiles(fixturePath(fixture));
  await expect(page.getByTestId('file-list')).toContainText(fixture);
  if (opts.review) {
    await page.getByTestId('preview-button').click();
    await expect(page.getByTestId('import-preview')).toBeVisible();
    await page.getByTestId('confirm-import').click();
  } else {
    await page.getByTestId('import-now-button').click();
  }
  await expect(page.getByTestId('import-results')).toBeVisible({ timeout: 30_000 });
  return Number(await page.getByTestId('result-created').first().textContent());
}

test.describe('Importing every source', () => {
  test('LinkedIn connections with a review step', async ({ page }) => {
    await signUp(page);
    const created = await importViaUi(page, 'linkedin', FIXTURES.linkedin, { review: true });
    expect(created).toBe(98);
    await page.getByTestId('results-view-network').click();
    await expect(page.getByTestId('force-graph')).toBeVisible();
  });

  test('Facebook friends JSON', async ({ page }) => {
    await signUp(page);
    expect(await importViaUi(page, 'facebook', FIXTURES.facebook)).toBe(63);
    await page.goto('/');
    await expect(page.getByTestId('category-card-personal')).toContainText('63');
  });

  test('X followers CSV and archive file', async ({ page }) => {
    await signUp(page);
    expect(await importViaUi(page, 'x', FIXTURES.x)).toBe(44);
    // archive file only has IDs — they are new people with a warning
    await importViaUi(page, 'x', FIXTURES.xArchive);
    await expect(page.getByTestId('import-results')).toContainText('bearer token');
  });

  test('Contacts vCard', async ({ page }) => {
    await signUp(page);
    expect(await importViaUi(page, 'contacts', FIXTURES.contacts)).toBe(87);
  });

  test('Email mbox keeps only bidirectional threads and records interactions', async ({ page }) => {
    await signUp(page);
    await page.goto('/settings/workspace');
    await page.getByTestId('ws-self-emails').fill('jordan@northwindlabs.com');
    await page.getByTestId('ws-domains').fill('northwindlabs.com');
    await page.getByTestId('ws-save').click();
    await expect(page.getByTestId('snackbar')).toContainText('saved');

    const created = await importViaUi(page, 'email', FIXTURES.email);
    expect(created).toBeGreaterThan(30);
    expect(created).toBeLessThanOrEqual(62);
    await expect(page.getByTestId('import-results')).toContainText('526');
    await expect(page.getByTestId('import-results')).not.toContainText('0 interactions');
    await page.goto('/');
    await expect(page.getByTestId('category-card-corporate')).not.toContainText(/\b0\b/);
  });

  test('source is auto-detected from the file and re-imports are idempotent', async ({ page }) => {
    await signUp(page);
    await page.goto('/import');
    await page.getByTestId('file-input').setInputFiles(fixturePath(FIXTURES.linkedin));
    await expect(page.getByTestId('source-linkedin')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('import-now-button').click();
    await expect(page.getByTestId('import-results')).toBeVisible();
    const again = await importViaUi(page, 'linkedin', FIXTURES.linkedin);
    expect(again).toBe(0);
    await expect(page.getByTestId('import-history').getByRole('row')).toHaveCount(3); // header + 2
  });

  test('all five sources merge into one network', async ({ page }) => {
    await signUp(page);
    await page.goto('/settings/workspace');
    await page.getByTestId('ws-self-emails').fill('jordan@northwindlabs.com');
    await page.getByTestId('ws-domains').fill('northwindlabs.com');
    await page.getByTestId('ws-save').click();
    for (const [source, file] of [
      ['linkedin', FIXTURES.linkedin],
      ['facebook', FIXTURES.facebook],
      ['x', FIXTURES.x],
      ['contacts', FIXTURES.contacts],
      ['email', FIXTURES.email],
    ] as const) await importViaUi(page, source, file);
    await page.goto('/');
    await expect(page.getByTestId('stat-cards')).toContainText('140');
    await expect(page.getByTestId('category-cards')).toBeVisible();
  });
});
