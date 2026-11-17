// UI tests for the critical paths. They drive the real app in Chromium against
// the STAGING Supabase project only. See tests/e2e/README.md.
import { defineConfig, devices } from '@playwright/test';
import { BASE_URL } from './tests/e2e/helpers/env.js';

export default defineConfig({
  testDir: './tests/e2e',
  // One shared staging account and one shared database: run in order, one at a time.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // Starts the staging dev server if it is not already running on 5174.
  webServer: {
    command: 'npm run dev:staging',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    // Signs in once through the real form and saves the session for the others.
    { name: 'setup', testMatch: /auth\.setup\.js/ },
    // Sign-in page tests start signed out.
    { name: 'auth', testMatch: /(auth|buttons\.signin)\.spec\.js/, use: { ...devices['Desktop Chrome'] } },
    {
      name: 'app',
      testMatch: /(books|navigation|buttons\.(library|inscribe|camera|detail)|negative\.inscribe)\.spec\.js/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: 'tests/e2e/.auth/alpha.json' },
    },
  ],
});
