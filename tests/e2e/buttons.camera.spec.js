// Camera buttons in the Inscribe window, using Chromium's built-in fake camera, so no
// real device or permission prompt is involved. Separate file because the fake camera
// is a browser launch option, which applies to the whole file.
//
// The app opens the camera by itself the moment Scan or upload is chosen (one attempt).
// "Open the camera" and "Stop camera" are the same button position, so a test must not
// click Open while that automatic start is still finishing: the click can land on Stop.
// Each test therefore waits for the camera to be live first.
import { test, expect } from './helpers/app.js';
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
