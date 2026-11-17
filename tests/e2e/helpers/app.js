// Page-level helpers shared by the specs.
import { test as base, expect } from '@playwright/test';
import { loadConfig, PROD_REF } from './env.js';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
};

// Every test gets a page that cannot reach production and that never calls the
// paid AI endpoint. Third-party book lookups are answered locally so a Google
// quota or an Open Library outage cannot fail a test.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route((u) => u.hostname === `${PROD_REF}.supabase.co`, (route) => route.abort());
    await page.route('**/api/claude', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"AI is off in UI tests"}' }));
    await page.route(/https:\/\/(www\.googleapis\.com\/books|openlibrary\.org|covers\.openlibrary\.org)\//, (route) =>
      route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: '{"items":[],"docs":[]}' }));
    await use(page);
  },
});
export { expect };

// Answer one Supabase Auth endpoint locally. Used only where the real call
// would send an email (sign-up, password reset): staging allows a few emails an
// hour, so real calls would make the suite fail at random.
// Returns the list of intercepted requests so a test can check what was sent.
export async function mockAuth(page, path, { status = 200, body = {} } = {}) {
  const { url } = loadConfig();
  const seen = [];
  await page.route((u) => u.href.startsWith(`${url}/auth/v1/${path}`), async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    seen.push({ url: req.url(), body: req.postDataJSON() });
    return route.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return seen;
}

// Make Scour the grimoire return exactly these books.
export async function mockBookSearch(page, books) {
  const items = books.map((b, i) => ({
    id: `e2e-${i}`,
    volumeInfo: { title: b.title, authors: [b.author || 'E2E Bot'], publishedDate: '2020', categories: ['Fantasy'] },
  }));
  await page.route(/https:\/\/www\.googleapis\.com\/books\/v1\/volumes\?q=/, (route) =>
    route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ items }) }));
}

export async function expectStaging(page) {
  await expect(page.getByText('throwaway data', { exact: false }),
    'The staging banner is missing: this is not the staging app. Stop.').toBeVisible();
}

export async function gotoSignIn(page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Enter the Archive' })).toBeVisible();
  await expectStaging(page);
}

export async function signInThroughForm(page, { email, password }) {
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill(password);
  await page.getByRole('button', { name: 'Enter the Archive' }).click();
}

export const shelves = (page) => page.getByRole('navigation', { name: 'Shelves' });
export const sections = (page) => page.getByRole('navigation', { name: 'Sections' });

// Open the signed-in library in the Covers layout (the layout these tests read).
export async function gotoLibrary(page) {
  await page.goto('/');
  await expect(shelves(page)).toBeVisible();
  await expectStaging(page);
  await page.getByRole('button', { name: /Covers/ }).click();
  await expect(page.getByText('The archive stirs…')).toBeHidden();
}

export const card = (page, title) => page.locator('main button').filter({ hasText: title });
export const detail = (page, title) => page.getByRole('dialog', { name: title });
