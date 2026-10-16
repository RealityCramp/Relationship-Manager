import { expect, test } from 'playwright/test';
import { PASSWORD, signIn, signUp, uniqueEmail } from './helpers.ts';

test.describe('Authentication & multi-user', () => {
  test('register, sign out, sign in', async ({ page }) => {
    const { email } = await signUp(page, { name: 'Ada Lovelace' });
    await expect(page.getByTestId('page-title')).toContainText('Ada');
    await expect(page.getByTestId('dashboard-import-cta')).toBeVisible();

    await page.getByTestId('account-menu').click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page.getByTestId('auth-form')).toBeVisible();

    await signIn(page, email);
    await expect(page.getByTestId('page-title')).toContainText('Ada');
  });

  test('rejects a wrong password and duplicate accounts', async ({ page }) => {
    const { email } = await signUp(page);
    await page.getByTestId('account-menu').click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await page.getByTestId('auth-email').fill(email);
    await page.getByTestId('auth-password').fill('nope-nope-nope');
    await page.getByTestId('auth-submit').click();
    await expect(page.getByRole('alert')).toContainText('Incorrect email or password');

    await page.getByTestId('auth-switch').click();
    await page.getByTestId('auth-name').fill('Again');
    await page.getByTestId('auth-email').fill(email);
    await page.getByTestId('auth-password').fill(PASSWORD);
    await page.getByTestId('auth-submit').click();
    await expect(page.getByRole('alert')).toContainText('already exists');
  });

  test('session survives a reload and protected API calls need auth', async ({ page, request }) => {
    await signUp(page);
    await page.reload();
    await expect(page.getByTestId('page-title')).toContainText('Good');
    const res = await request.get('/api/workspaces');
    expect(res.status()).toBe(401);
  });

  test('owner invites a new user who joins through the invite link', async ({ browser, page }) => {
    await signUp(page, { name: 'Owner Olga' });
    await page.goto('/settings/members');
    const inviteeEmail = uniqueEmail('invitee');
    await page.getByTestId('invite-email').fill(inviteeEmail);
    await page.getByTestId('invite-send').click();
    const link = (await page.getByTestId('invite-link').textContent())!.trim();
    expect(link).toContain('/invite/');
    await expect(page.getByTestId('invite-row')).toContainText(inviteeEmail);

    // Second user in a fresh browser context
    const ctx = await browser.newContext();
    const other = await ctx.newPage();
    await other.goto(link);
    await expect(other.getByTestId('auth-form')).toBeVisible();
    await other.getByTestId('auth-name').fill('Invitee Ivan');
    await other.getByTestId('auth-password').fill(PASSWORD);
    await other.getByTestId('auth-submit').click();
    await expect(other.getByTestId('page-title')).toContainText('Good');
    // the invited workspace is available in the switcher
    await other.getByTestId('workspace-menu').click();
    await expect(other.getByRole('menuitem', { name: /My network/ }).first()).toBeVisible();
    await ctx.close();

    // owner now sees the member
    await page.reload();
    await expect(page.getByTestId('members-card')).toContainText('Invitee Ivan');
  });

  test('existing user is added immediately and role can be changed', async ({ browser, page }) => {
    const ctx = await browser.newContext();
    const other = await ctx.newPage();
    const { email: memberEmail } = await signUp(other, { name: 'Member Mia' });
    await ctx.close();

    await signUp(page, { name: 'Owner Omar' });
    await page.goto('/settings/members');
    await page.getByTestId('invite-email').fill(memberEmail);
    await page.getByTestId('invite-send').click();
    await expect(page.getByTestId('members-card')).toContainText('Member Mia');
    const row = page.getByTestId('member-row').filter({ hasText: 'Member Mia' });
    await row.getByRole('combobox', { name: 'Role' }).selectOption('viewer');
    await expect(row.getByRole('combobox', { name: 'Role' })).toHaveValue('viewer');
  });
});
