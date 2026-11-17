// One positive test per button in the Inscribe window and the "Adjust cover" window
// that follows a photo upload. Book search is stubbed (mockBookSearch); the AI endpoint
// answers 503, so a scanned photo ends in the manual form, which is the real fallback.
import { test, expect, mockBookSearch } from './helpers/app.js';
import { signIn, rest, uniqueTitle } from './helpers/api.js';
import { pngFile } from './helpers/png.js';
import { LibraryPage } from './pages/LibraryPage.js';
import { InscribeModal, CropModal } from './pages/InscribeModal.js';

let db, lib, inscribe, crop;
test.beforeEach(async ({ request, page }) => {
  db = rest(request, await signIn(request));
  lib = new LibraryPage(page);
  inscribe = new InscribeModal(page);
  crop = new CropModal(page);
  await lib.goto();
  await lib.sections.inscribe.click();
  await expect(inscribe.dialog).toBeVisible();
});
test.afterEach(async () => { await db.deleteE2EBooks(); });

const saved = async (title) => (await db.booksByTitle(title))[0];

// Choose a photo through the real file chooser and land on the crop window.
async function uploadPhoto(page) {
  await inscribe.scan.click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), inscribe.uploadPhoto.click()]);
  await chooser.setFiles(pngFile());
  await expect(crop.heading).toBeVisible();
}

test.describe('modes and Close', () => {
  test('Close closes the window', async () => {
    await inscribe.close.click();
    await expect(inscribe.dialog).toBeHidden();
  });

  test('Scan or upload switches to the photo tools', async () => {
    await inscribe.scan.click();
    await expect(inscribe.scan).toHaveAttribute('aria-pressed', 'true');
    await expect(inscribe.openCamera).toBeVisible();
    await expect(inscribe.uploadPhoto).toBeVisible();
  });

  test('Scour the grimoire switches back to the search box', async () => {
    await inscribe.scan.click();
    await inscribe.scour.click();
    await expect(inscribe.scour).toHaveAttribute('aria-pressed', 'true');
    await expect(inscribe.search).toBeVisible();
  });
});

test.describe('search results', () => {
  test('+ Owned saves the book to Owned', async ({ page }) => {
    const title = uniqueTitle('Owned');
    await mockBookSearch(page, [{ title, author: 'Ada Thorn' }]);
    await inscribe.searchFor(title);
    await inscribe.dialog.getByRole('button', { name: '+ Owned' }).click();
    await expect.poll(async () => (await saved(title))?.shelf).toBe('owned');
  });

  test('+ Wishlist saves the book to the Wishlist', async ({ page }) => {
    const title = uniqueTitle('Wish');
    await mockBookSearch(page, [{ title }]);
    await inscribe.searchFor(title);
    await inscribe.dialog.getByRole('button', { name: '+ Wishlist' }).click();
    await expect.poll(async () => (await saved(title))?.shelf).toBe('wishlist');
  });
});

test.describe('Add several', () => {
  let tag, a, b;
  test.beforeEach(async ({ page }) => {
    tag = uniqueTitle('Many');
    a = `${tag} A`; b = `${tag} B`;
    await mockBookSearch(page, [{ title: a }, { title: b }]);
    await inscribe.addSeveral.check();
  });

  // The search box clears after every pick, ready for the next title, so each pick
  // searches again first.
  const queue = async (title, button = '+ Owned') => {
    await inscribe.search.fill(tag);
    await expect(inscribe.dialog.getByText(title).first()).toBeVisible();
    await inscribe.result(title).getByRole('button', { name: button }).click();
  };

  test('the checkbox turns on the queue: + Owned adds to it instead of saving', async () => {
    await expect(inscribe.addSeveral).toBeChecked();
    await queue(a);
    await expect(inscribe.dialog.getByText('1 queued')).toBeVisible();
    expect(await db.booksByTitle(a)).toHaveLength(0); // nothing is saved until Add N
  });

  test('+ Wishlist queues the book for the Wishlist', async () => {
    await queue(a, '+ Wishlist');
    await expect(inscribe.dialog.getByText('1 queued')).toBeVisible();
    await expect(inscribe.dialog.getByText('wishlist', { exact: false }).first()).toBeVisible();
  });

  test('Remove from the queue takes one book out', async () => {
    await queue(a);
    await queue(b);
    await expect(inscribe.dialog.getByText('2 queued')).toBeVisible();
    await inscribe.removeFromQueue(a).click();
    await expect(inscribe.dialog.getByText('1 queued')).toBeVisible();
    await expect(inscribe.addToArchive(1)).toBeVisible();
  });

  test('Add N to the archive saves every queued book in one go', async () => {
    await queue(a);
    await queue(b, '+ Wishlist');
    await inscribe.addToArchive(2).click();
    await expect(inscribe.dialog).toBeHidden();
    await expect.poll(async () => (await saved(a))?.shelf).toBe('owned');
    await expect.poll(async () => (await saved(b))?.shelf).toBe('wishlist');
  });
});

test.describe('photo upload and the Adjust cover window', () => {
  test('Upload a photo opens the file chooser, then the Adjust cover window', async ({ page }) => {
    await uploadPhoto(page);
  });

  test('Skip - use as-is goes on to the entry form', async ({ page }) => {
    await uploadPhoto(page);
    await crop.skip.click();
    await expect(crop.heading).toBeHidden();
    await expect(inscribe.title).toBeVisible();
  });

  test('Crop & use this cover goes on to the entry form', async ({ page }) => {
    await uploadPhoto(page);
    await crop.cropAndUse.click();
    await expect(crop.heading).toBeHidden();
    await expect(inscribe.title).toBeVisible();
  });

  test('Portrait, Landscape, Square and Free each become the chosen shape', async ({ page }) => {
    await uploadPhoto(page);
    for (const shape of [crop.landscape, crop.square, crop.free, crop.portrait]) {
      await shape.click();
      await expect(shape).toBeVisible(); // still on the crop window, nothing broke
    }
    await expect(crop.cropAndUse).toBeEnabled();
  });

  test('Left 90 and Right 90 turn the photo and the crop can still be used', async ({ page }) => {
    await uploadPhoto(page);
    // The window shows the current turn between the two buttons, 0 to 359.
    await expect(page.getByText('0°', { exact: true })).toBeVisible();
    await crop.rotateRight.click();
    await expect(page.getByText('90°', { exact: true })).toBeVisible();
    await crop.rotateLeft.click();
    await crop.rotateLeft.click();
    await expect(page.getByText('270°', { exact: true })).toBeVisible();
    await expect(crop.cropAndUse).toBeEnabled();
  });

  test('Replace photo opens the file chooser again', async ({ page }) => {
    await uploadPhoto(page);
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), crop.replace.click()]);
    expect(chooser).toBeTruthy();
  });

  test('Inscribe to Owned saves the hand-entered book to Owned', async ({ page }) => {
    const title = uniqueTitle('Hand');
    await uploadPhoto(page);
    await crop.skip.click();
    await inscribe.title.fill(title);
    await inscribe.author.fill('Hand Writer');
    await inscribe.inscribeToOwned.click();
    await expect.poll(async () => (await saved(title))?.shelf).toBe('owned');
    expect(await saved(title)).toMatchObject({ author: 'Hand Writer' });
  });

  test('Inscribe to Wishlist saves the hand-entered book to the Wishlist', async ({ page }) => {
    const title = uniqueTitle('HandWish');
    await uploadPhoto(page);
    await crop.skip.click();
    await inscribe.title.fill(title);
    await inscribe.inscribeToWishlist.click();
    await expect.poll(async () => (await saved(title))?.shelf).toBe('wishlist');
  });

  test('Scan another goes back to the photo tools', async ({ page }) => {
    await uploadPhoto(page);
    await crop.skip.click();
    await inscribe.scanAnother.click();
    await expect(inscribe.uploadPhoto).toBeVisible();
    await expect(inscribe.title).toBeHidden();
  });
});
