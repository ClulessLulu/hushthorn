// Camera buttons in the Inscribe window, using Chromium's built-in fake camera, so no
// real device or permission prompt is involved. Separate file because the fake camera
// is a browser launch option, which applies to the whole file.
//
// The app opens the camera by itself the moment Scan or upload is chosen (one attempt).
// "Open the camera" and "Stop camera" are the same button position, so a test must not
// click Open while that automatic start is still finishing: the click can land on Stop.
// Each test therefore waits for the camera to be live first.
import { test, expect } from './helpers/app.js';
import { signIn, rest, uniqueTitle } from './helpers/api.js';
import { LibraryPage } from './pages/LibraryPage.js';
import { InscribeModal } from './pages/InscribeModal.js';

test.use({
  permissions: ['camera'],
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
});

let inscribe;
test.beforeEach(async ({ page }) => {
  const lib = new LibraryPage(page);
  inscribe = new InscribeModal(page);
  await lib.goto();
  await lib.sections.inscribe.click();
  await inscribe.scan.click();
  await expect(inscribe.stopCamera).toBeVisible(); // the automatic start has finished
});

test('Scan or upload starts the camera by itself and offers Stop camera and Capture cover', async () => {
  await expect(inscribe.captureCover).toBeEnabled();
  await expect(inscribe.openCamera).toBeHidden();
});

test('Stop camera turns the camera off and brings Open the camera back', async () => {
  await inscribe.stopCamera.click();
  await expect(inscribe.openCamera).toBeVisible();
  await expect(inscribe.captureCover).toBeDisabled();
});

test('Open the camera starts the camera again after it was stopped', async () => {
  await inscribe.stopCamera.click();
  await inscribe.openCamera.click();
  await expect(inscribe.stopCamera).toBeVisible();
  await expect(inscribe.captureCover).toBeEnabled();
});

// Capture goes straight to the entry form (no crop window, unlike an uploaded photo).
// The AI endpoint is off in these tests, so the form arrives with the by-hand notice.
test('Capture cover takes a still, turns the camera off and opens the entry form', async ({ page }) => {
  await expect(inscribe.captureCover).toBeEnabled();
  await inscribe.captureCover.click();
  await expect(inscribe.title).toBeVisible();
  await expect(inscribe.scanAnother).toBeVisible();
  await expect(page.getByText("The scribe couldn't make out the cover", { exact: false })).toBeVisible();
  await expect(inscribe.stopCamera).toBeHidden();
});

// Scan multiple: barcodes queue up and "Add N to" saves them together. The browser's
// barcode reader is replaced by a stand-in that "sees" whichever ISBN the test pushes,
// and the ISBN lookup is answered locally.
test.describe('Scan multiple', () => {
  const CORS = { 'access-control-allow-origin': '*' };
  let db;
  test.afterEach(async () => { await db?.deleteE2EBooks(); });

  // Negative: the save is refused. It used to close the window and lose the queue with
  // no message, so the user believed the books were added.
  test('a failed save keeps the window and the queue, and a second try saves', async ({ page, request }) => {
    db = rest(request, await signIn(request));
    const titles = { 9780000000011: uniqueTitle('Scan A'), 9780000000028: uniqueTitle('Scan B') };
    await page.addInitScript(() => {
      window.__codes = [];
      window.BarcodeDetector = class {
        static async getSupportedFormats() { return ['ean_13']; }
        async detect() { const c = window.__codes.shift(); return c ? [{ rawValue: c, format: 'ean_13' }] : []; }
      };
    });
    await page.route(/https:\/\/openlibrary\.org\/search\.json\?q=isbn:(\d+)/, (route) => {
      const title = titles[route.request().url().match(/isbn:(\d+)/)[1]];
      const docs = title ? [{ title, author_name: ['E2E Bot'], subject: ['Fantasy'] }] : [];
      return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ docs }) });
    });
    await page.reload();
    await new LibraryPage(page).sections.inscribe.click();
    await inscribe.scan.click();
    await expect(inscribe.stopCamera).toBeVisible();
    await inscribe.dialog.getByRole('checkbox', { name: /Scan multiple/ }).check();
    for (const [i, isbn] of Object.keys(titles).entries()) {
      await page.evaluate((c) => window.__codes.push(c), isbn);
      await expect(inscribe.dialog.getByText(`${i + 1} queued`)).toBeVisible();
    }

    await page.route('**/rest/v1/books*', (route) =>
      route.request().method() === 'POST' ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"e2e"}' }) : route.fallback());
    const add = inscribe.dialog.getByRole('button', { name: /^Add 2 to/ });
    await add.click();
    await expect(inscribe.dialog.getByRole('alert')).toContainText('could not be saved');
    await expect(inscribe.dialog.getByText('2 queued')).toBeVisible();
    for (const t of Object.values(titles)) expect(await db.booksByTitle(t)).toHaveLength(0);

    await page.unroute('**/rest/v1/books*');
    await add.click();
    await expect(inscribe.dialog).toBeHidden();
    for (const t of Object.values(titles)) await expect.poll(() => db.booksByTitle(t)).toHaveLength(1);
  });
});
