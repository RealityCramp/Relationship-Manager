import { defineConfig, devices } from 'playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 8790);

/**
 * End-to-end suite. Builds the app, starts the API on a throw-away SQLite database in e2e/.tmp,
 * and runs every spec against the real server. `npm run test:e2e`.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts/,
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: `node scripts/build.mjs && node --import tsx server/src/server.ts`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { PORT: String(PORT), DB_PATH: 'e2e/.tmp/e2e.db', DATA_DIR: 'e2e/.tmp', NODE_NO_WARNINGS: '1' },
  },
});
