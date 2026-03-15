import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E test configuration.
 * Run from the repository root:  npx --prefix frontend playwright test --config=playwright.config.ts
 * Or from the frontend directory: npx playwright test --config=../playwright.config.ts
 *
 * Tests run against a locally started Next.js dev server.
 * On failure, screenshots and videos are captured automatically.
 */
export default defineConfig({
  testDir: './frontend/e2e',

  /* Run tests in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Limit parallel workers on CI to avoid resource contention */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter: HTML report + GitHub-friendly line reporter on CI */
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['html', { open: 'never' }]],

  use: {
    /* Base URL – override with BASE_URL env var in CI */
    baseURL: process.env.BASE_URL || 'http://localhost:3000',

    /* Capture screenshot and video only on failure */
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',

    /* Default locale prefix used throughout the app */
    locale: 'it',
  },

  /* Per-project browser configurations */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  /* Start the Next.js dev server before running tests (local development only) */
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        cwd: './frontend',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
