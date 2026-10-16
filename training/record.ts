/**
 * Records the training videos by driving the real app with Playwright.
 *
 *   npm run training:record            # all videos
 *   npm run training:record -- welcome-tour network-graph
 *
 * Output: web/public/training/<id>.mp4 + .vtt + .jpg, then `training:build` refreshes index.json.
 * Requires ffmpeg on PATH (or Playwright's bundled ffmpeg).
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { Recorder, toVtt } from './lib.ts';
import { VIDEOS } from './videos.ts';
import { seedDatabase, writeFixtures } from '../server/src/seed.ts';
import { hashPassword } from '../server/src/auth.ts';
import { now, openDb, uuid } from '../server/src/db.ts';
import { createWorkspace } from '../server/src/repo.ts';
import { buildIndex } from './build.ts';

const root = resolve(import.meta.dirname, '..');
const outDir = resolve(root, 'training/out');
const publicDir = resolve(root, 'web/public/training');
const PORT = 8795;
const baseURL = `http://localhost:${PORT}`;
const PASSWORD = 'training-demo';
const DEMO_EMAIL = 'jordan@northwindlabs.com';
const EMPTY_EMAIL = 'fresh@example.com';

function ffmpegPath(): string {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return 'ffmpeg';
  } catch {
    const pw = process.env.PLAYWRIGHT_BROWSERS_PATH ?? resolve(process.env.HOME ?? '', '.cache/ms-playwright');
    const dir = existsSync(pw) ? readdirSync(pw).find((d) => d.startsWith('ffmpeg')) : undefined;
    if (dir) return resolve(pw, dir, 'ffmpeg-linux');
    throw new Error('ffmpeg not found');
  }
}

async function main() {
  const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const scripts = only.length ? VIDEOS.filter((v) => only.includes(v.id)) : VIDEOS;
  if (!scripts.length) throw new Error(`No videos match ${only.join(', ')}`);

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  mkdirSync(publicDir, { recursive: true });
  const fixtures = resolve(outDir, 'fixtures');
  writeFixtures(fixtures);

  // Build + start the app on a throw-away database.
  execFileSync(process.execPath, [resolve(root, 'scripts/build.mjs')], { stdio: 'inherit' });
  const dbPath = resolve(outDir, 'training.db');
  seedDatabase(dbPath, { email: DEMO_EMAIL, password: PASSWORD, name: 'Jordan Reyes' });
  const db = openDb(dbPath);
  const freshId = uuid();
  db.prepare('INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?,?,?,?,?)').run(freshId, EMPTY_EMAIL, 'Jordan Reyes', hashPassword(PASSWORD), now());
  createWorkspace(db, freshId, 'My network', [EMPTY_EMAIL], []);
  // the demo account should land on the demo workspace, not the auto-created one
  db.prepare("DELETE FROM workspaces WHERE name = 'My network' AND owner_id = (SELECT id FROM users WHERE email = ?)").run(DEMO_EMAIL);
  db.close();

  const server = spawn(process.execPath, ['--import', 'tsx', resolve(root, 'server/src/server.ts')], {
    env: { ...process.env, PORT: String(PORT), DB_PATH: dbPath, DATA_DIR: outDir, NODE_NO_WARNINGS: '1' },
    stdio: 'ignore',
  });
  await waitFor(`${baseURL}/api/health`);

  const browser = await chromium.launch();
  const ff = ffmpegPath();
  try {
    for (const script of scripts) {
      console.log(`\n▶ Recording ${script.id}`);
      const videoDir = resolve(outDir, script.id);
      mkdirSync(videoDir, { recursive: true });
      const context = await browser.newContext({
        baseURL,
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } },
        colorScheme: 'light',
        locale: 'en-US',
        timezoneId: 'America/Chicago',
      });
      const page = await context.newPage();
      const rec = new Recorder(page);
      let failed: unknown = null;
      try {
        await script.run(rec, { email: script.dataset === 'empty' ? EMPTY_EMAIL : DEMO_EMAIL, password: PASSWORD, fixtures, baseURL: baseURL });
      } catch (e) {
        failed = e;
        console.error(`  ✖ ${script.id} failed:`, e);
      }
      const video = page.video();
      await context.close();
      const webm = await video!.path();
      if (failed) throw failed;

      const mp4 = resolve(publicDir, `${script.id}.mp4`);
      const webmOut = resolve(publicDir, `${script.id}.webm`);
      const poster = resolve(publicDir, `${script.id}.jpg`);
      const vtt = resolve(publicDir, `${script.id}.vtt`);
      // Re-encode to a broadly playable H.264 MP4 (yuv420p, faststart), poster from ~3s in.
      execFileSync(ff, ['-y', '-loglevel', 'error', '-i', webm, '-c:v', 'libx264', '-preset', 'medium', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4]);
      execFileSync(ff, ['-y', '-loglevel', 'error', '-ss', '14', '-i', mp4, '-frames:v', '1', '-q:v', '3', poster]);
      // VP9 WebM for browsers without H.264 (e.g. Playwright's Chromium in CI).
      execFileSync(ff, ['-y', '-loglevel', 'error', '-i', mp4, '-c:v', 'libvpx-vp9', '-crf', '40', '-b:v', '0', '-deadline', 'good', '-cpu-used', '5', '-row-mt', '1', '-an', webmOut]);
      writeFileSync(vtt, toVtt(rec.cues));
      writeFileSync(resolve(publicDir, `${script.id}.chapters.json`), JSON.stringify(rec.chapters));
      const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4]).toString().trim());
      console.log(`  ✔ ${script.id}: ${duration.toFixed(1)}s, ${rec.cues.length} cues, ${rec.chapters.length} chapters`);
    }
  } finally {
    await browser.close();
    server.kill();
  }
  buildIndex();
}

async function waitFor(url: string, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server did not start at ${url}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
