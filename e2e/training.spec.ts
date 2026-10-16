import { expect, test } from 'playwright/test';
import { signUp } from './helpers.ts';

test.describe('Training materials', () => {
  test('index lists videos and guides with reachable media', async ({ request }) => {
    const res = await request.get('/training/index.json');
    expect(res.ok(), 'training index should be built and committed').toBeTruthy();
    const index = (await res.json()) as { videos: { id: string; video: string; videoWebm: string | null; captions: string; poster: string; guide: string; duration: number }[]; guides: { path: string }[] };
    expect(index.videos.length).toBeGreaterThanOrEqual(6);
    expect(index.guides.length).toBeGreaterThanOrEqual(4);
    for (const v of index.videos) {
      expect(v.videoWebm, 'WebM fallback should exist').toBeTruthy();
      for (const url of [v.video, v.videoWebm!, v.captions, v.poster, v.guide]) expect((await request.get(url)).ok(), url).toBeTruthy();
      expect(v.duration).toBeGreaterThan(5);
      expect(await (await request.get(v.captions)).text()).toContain('WEBVTT');
    }
    for (const g of index.guides) expect((await request.get(g.path)).ok(), g.path).toBeTruthy();
  });

  test('video page plays with transcript and chapters; guides render', async ({ page }) => {
    await signUp(page);
    await page.goto('/training');
    await expect(page.getByTestId('video-grid').locator('[data-testid^=video-]').first()).toBeVisible();
    await page.getByTestId('video-grid').locator('[data-testid^=video-]').first().click();
    await expect(page.getByTestId('training-video')).toBeVisible();
    await expect(page.getByTestId('transcript').locator('.transcript__cue').first()).toBeVisible();
    const video = page.getByTestId('training-video');
    await expect(video.locator('source')).toHaveCount(2);
    await video.evaluate((v: HTMLVideoElement) => {
      v.muted = true;
      void v.play();
    });
    await page.waitForFunction(() => (document.querySelector('[data-testid=training-video]') as HTMLVideoElement).currentTime > 1, null, { timeout: 15_000 });
    await expect(page.locator('.transcript__cue[aria-current=true]')).toHaveCount(1);
    await page.getByTestId('transcript').locator('.transcript__cue').nth(2).click();
    const t = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
    expect(t).toBeGreaterThan(1);

    await page.goto('/training');
    await page.getByTestId('tab-guides').click();
    await page.getByTestId('guide-grid').locator('[data-testid^=guide-]').first().click();
    await expect(page.getByTestId('guide-body').locator('h2').first()).toBeVisible();
  });
});
