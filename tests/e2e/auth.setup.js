// Runs before the signed-in tests: clears leftovers from an earlier crashed
// run, signs in through the real form, and saves the session to a file.
import { mkdirSync } from 'node:fs';
import { test as setup, expect, gotoSignIn, signInThroughForm, shelves } from './helpers/app.js';
import { loadConfig } from './helpers/env.js';
import { signIn, rest } from './helpers/api.js';

setup('sign in as the staging test reader', async ({ page, request }) => {
  await rest(request, await signIn(request)).deleteE2EBooks();
  await gotoSignIn(page);
  await signInThroughForm(page, loadConfig().alpha);
  await expect(shelves(page)).toBeVisible();
  mkdirSync('tests/e2e/.auth', { recursive: true });
  await page.context().storageState({ path: 'tests/e2e/.auth/alpha.json' });
});
