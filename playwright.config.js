// UI tests for the critical paths. They drive the real app in Chromium (and a
// subset in WebKit and on two phones) against the STAGING Supabase project only.
// See tests/e2e/README.md.
import { defineConfig, devices } from '@playwright/test';
import { BASE_URL } from './tests/e2e/helpers/env.js';

// Signed-in specs the Safari and phone projects run: the a11y checks, the phone
// spec, navigation and the add/update-book critical paths. The full 'app' suite
// stays Chromium-only to keep a run near 10 minutes; see tests/e2e/README.md.
const CROSS_BROWSER = /(mobile|a11y|navigation|books)\.spec\.js/;
const signedIn = { dependencies: ['setup'], testMatch: CROSS_BROWSER };
const alpha = { storageState: 'tests/e2e/.auth/alpha.json' };

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
      testMatch: /(books|navigation|a11y|buttons\.(library|inscribe|camera|detail)|negative\.(inscribe|detail|codex|oracle))\.spec\.js/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: 'tests/e2e/.auth/alpha.json' },
    },
    // Safari engine (WebKit) at desktop size, and two phones with touch.
    // `npm run test:e2e` names the three Chromium projects, so it runs what it
    // always did; test:e2e:webkit, test:e2e:mobile and test:e2e:all run these.
    { name: 'webkit-desktop', ...signedIn, use: { ...devices['Desktop Safari'], ...alpha } },
    { name: 'mobile-safari', ...signedIn, use: { ...devices['iPhone 14'], ...alpha } },
    { name: 'mobile-chrome', ...signedIn, use: { ...devices['Pixel 7'], ...alpha } },
  ],
});
