// Negative cases for the Inscribe window: nothing found, lookups down, a save that is
// refused, a title that is already in the library, empty or odd input. Each one checks
// what the person SEES and what is (not) saved in staging. Book lookups are stubbed
// per test; the AI endpoint is off (503) by default, as in every spec.
import { test, expect, mockBookSearch } from './helpers/app.js';
import { signIn, rest, uniqueTitle } from './helpers/api.js';
import { pngFile } from './helpers/png.js';
import { LibraryPage } from './pages/LibraryPage.js';
import { InscribeModal, CropModal } from './pages/InscribeModal.js';

const CORS = { 'access-control-allow-origin': '*' };
const GOOGLE = /https:\/\/www\.googleapis\.com\/books\/v1\/volumes\?q=/;
const OPEN_LIBRARY = /https:\/\/openlibrary\.org\/search\.json\?/;
const json = (route, body, status = 200) =>
  route.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) });

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

const rows = async (title) => db.booksByTitle(title);
// A book saved straight to the database is not on the page until it reloads, and the
// "already in your archive" checks read the page, so reload and reopen the window.
async function haveInLibrary(page, title) {
  await db.insertBook({ title });
  await page.reload();
  await lib.sections.inscribe.click();
  await expect(inscribe.dialog).toBeVisible();
}
const failBookInserts = (page) => page.route('**/rest/v1/books*', (route) =>
  route.request().method() === 'POST'
    ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"e2e"}' })
    : route.fallback());

test.describe('search finds nothing, or cannot search', () => {
  test('a search with no matches says so and offers another way', async () => {
    await inscribe.search.fill('zzzz no such book');
    await expect(inscribe.dialog.getByText('No tome answers to that name.')).toBeVisible();
    await expect(inscribe.dialog.getByRole('button', { name: '+ Owned' })).toHaveCount(0);
  });

  test('one letter is not searched: nothing is shown and nothing is asked', async ({ page }) => {
    let asked = 0;
    await page.route(GOOGLE, (route) => { asked++; return json(route, { items: [] }); });
    await inscribe.search.fill('a');
    await page.waitForTimeout(900); // longer than the typing pause
    await expect(inscribe.dialog.getByText('No tome answers to that name.')).toBeHidden();
    expect(asked).toBe(0);
  });

  test('both book lookups down: says the archives are unreachable, and a new search recovers', async ({ page }) => {
    await page.route(GOOGLE, (route) => route.abort());
    await page.route(OPEN_LIBRARY, (route) => route.abort());
    await inscribe.search.fill('Offline Thorn');
    await expect(inscribe.dialog.getByText('The archives are unreachable. Check your connection and try again.')).toBeVisible();
    await expect(inscribe.dialog.getByRole('button', { name: '+ Owned' })).toHaveCount(0);

    await page.unroute(GOOGLE); await page.unroute(OPEN_LIBRARY);
    const title = uniqueTitle('Back');
    await mockBookSearch(page, [{ title }]);
    await inscribe.searchFor(title);
    await expect(inscribe.dialog.getByText('The archives are unreachable.', { exact: false })).toBeHidden();
  });

  test('Google over its quota (429): Open Library answers instead', async ({ page }) => {
    const title = uniqueTitle('Fallback');
    await page.route(GOOGLE, (route) => json(route, { error: 'quota' }, 429));
    await page.route(OPEN_LIBRARY, (route) =>
      json(route, { docs: [{ key: '/works/e2e', title, author_name: ['Open Writer'], first_publish_year: 2001 }] }));
    await inscribe.searchFor(title);
    await expect(inscribe.dialog.getByText('Open Writer')).toBeVisible();
  });

  test('Google answers with no items: Open Library is tried before giving up', async ({ page }) => {
    const title = uniqueTitle('Empty');
    await page.route(GOOGLE, (route) => json(route, { items: [] }));
    await page.route(OPEN_LIBRARY, (route) =>
      json(route, { docs: [{ key: '/works/e2e2', title, author_name: ['Second Source'] }] }));
    await inscribe.searchFor(title);
  });

  test('study guides from Open Library are left out of the results', async ({ page }) => {
    const real = uniqueTitle('Real');
    await page.route(GOOGLE, (route) => json(route, { items: [] }));
    await page.route(OPEN_LIBRARY, (route) => json(route, { docs: [
      { key: '/works/a', title: real, author_name: ['A'] },
      { key: '/works/b', title: `${real} Study Guide`, author_name: ['B'] },
    ] }));
    await inscribe.searchFor(real);
    await expect(inscribe.dialog.getByText('Study Guide')).toHaveCount(0);
  });
});

test.describe('a single add that is refused or repeated', () => {
  // The save is refused. The window must stay, say so plainly, and nothing may be
  // saved or left on the shelf.
  test('+ Owned with the save refused: says it could not be saved, saves nothing', async ({ page }) => {
    const title = uniqueTitle('Refused');
    await mockBookSearch(page, [{ title }]);
    await inscribe.searchFor(title);
    await failBookInserts(page);
    await inscribe.dialog.getByRole('button', { name: '+ Owned' }).click();
    await expect(inscribe.dialog.getByRole('alert')).toContainText('could not be saved');
    expect(await rows(title)).toHaveLength(0);
    await page.unroute('**/rest/v1/books*');
    await inscribe.dialog.getByRole('button', { name: '+ Owned' }).click(); // try again
    await expect.poll(() => rows(title)).toHaveLength(1);
    await expect(inscribe.dialog).toBeHidden();
  });

  test('a title already in the library asks first, and Cancel saves nothing more', async ({ page }) => {
    const title = uniqueTitle('Twice');
    await haveInLibrary(page, title);
    await mockBookSearch(page, [{ title }]);
    await inscribe.searchFor(title);
    await inscribe.dialog.getByRole('button', { name: '+ Owned' }).click();
    const ask = page.getByRole('dialog', { name: 'Already in your archive' });
    await expect(ask).toBeVisible();
    await ask.getByRole('button', { name: 'Cancel' }).click();
    await expect(ask).toBeHidden();
    await expect(inscribe.dialog).toBeVisible(); // still on the add flow
    expect(await rows(title)).toHaveLength(1);
  });

  test('the same title in other capitals is still found to be a repeat', async ({ page }) => {
    const title = uniqueTitle('Shout');
    await haveInLibrary(page, title);
    await mockBookSearch(page, [{ title: title.toUpperCase() }]);
    await inscribe.searchFor(title.toUpperCase());
    await inscribe.dialog.getByRole('button', { name: '+ Wishlist' }).click();
    await expect(page.getByRole('dialog', { name: 'Already in your archive' })).toBeVisible();
    expect((await rows(title)).length).toBe(1);
  });
});

test.describe('Add several with a title that is already there', () => {
  test('it is marked, left out of the count, and when it is the only one there is nothing to add', async ({ page }) => {
    const title = uniqueTitle('Have');
    await haveInLibrary(page, title);
    await mockBookSearch(page, [{ title }]);
    await inscribe.addSeveral.check();
    await inscribe.search.fill(title);
    await expect(inscribe.dialog.getByText(title).first()).toBeVisible();
    await inscribe.result(title).getByRole('button', { name: '+ Owned' }).click();
    await expect(inscribe.dialog.getByText('already in archive')).toBeVisible();
    await expect(inscribe.dialog.getByRole('button', { name: /^Add \d+ to the archive/ })).toHaveCount(0);
    expect(await rows(title)).toHaveLength(1);
  });

  test('picking one title twice queues it once', async ({ page }) => {
    const title = uniqueTitle('Once');
    await mockBookSearch(page, [{ title }]);
    await inscribe.addSeveral.check();
    for (let i = 0; i < 2; i++) {
      await inscribe.search.fill(title);
      await expect(inscribe.dialog.getByText(title).first()).toBeVisible();
      await inscribe.result(title).getByRole('button', { name: '+ Owned' }).click();
    }
    await expect(inscribe.dialog.getByText('1 queued')).toBeVisible();
  });
});

test.describe('entering a book by hand', () => {
  async function toForm(page) {
    await inscribe.scan.click();
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), inscribe.uploadPhoto.click()]);
    await chooser.setFiles(pngFile());
    await expect(crop.heading).toBeVisible();
    await crop.skip.click();
    await expect(inscribe.title).toBeVisible();
  }

  test('with no title both Inscribe buttons are off, and a title of only spaces does not count', async ({ page }) => {
    await toForm(page);
    await expect(inscribe.inscribeToOwned).toBeDisabled();
    await expect(inscribe.inscribeToWishlist).toBeDisabled();
    await inscribe.title.fill('   ');
    await expect(inscribe.inscribeToOwned).toBeDisabled();
    await inscribe.title.fill(uniqueTitle('Typed'));
    await expect(inscribe.inscribeToOwned).toBeEnabled();
  });

  test('with no author the book is saved as "Unknown author"', async ({ page }) => {
    const title = uniqueTitle('Anon');
    await toForm(page);
    await inscribe.title.fill(title);
    await inscribe.inscribeToOwned.click();
    await expect.poll(async () => (await rows(title))[0]?.author).toBe('Unknown author');
  });

  test('a refused save keeps the form and says it could not be saved', async ({ page }) => {
    const title = uniqueTitle('HandRefused');
    await toForm(page);
    await inscribe.title.fill(title);
    await failBookInserts(page);
    await inscribe.inscribeToOwned.click();
    await expect(inscribe.dialog.getByRole('alert')).toContainText('could not be saved');
    await expect(inscribe.title).toHaveValue(title);
    expect(await rows(title)).toHaveLength(0);
  });

  test('a title already in the library asks first, and Cancel keeps the form', async ({ page }) => {
    const title = uniqueTitle('HandTwice');
    await haveInLibrary(page, title);
    await toForm(page);
    await inscribe.title.fill(title);
    await inscribe.inscribeToOwned.click();
    const ask = page.getByRole('dialog', { name: 'Already in your archive' });
    await expect(ask).toBeVisible();
    await ask.getByRole('button', { name: 'Cancel' }).click();
    await expect(inscribe.title).toHaveValue(title);
    expect(await rows(title)).toHaveLength(1);
  });

  test('a file that is not a picture does not break the window', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await inscribe.scan.click();
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), inscribe.uploadPhoto.click()]);
    await chooser.setFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a picture') });
    await page.waitForTimeout(800);
    expect(errors).toEqual([]);
    // Whatever it shows, the person is never stuck: the window can still be closed.
    await page.keyboard.press('Tab'); // focus is somewhere sane
    if (await crop.heading.isVisible()) await crop.skip.click();
    await inscribe.close.click();
    await expect(inscribe.dialog).toBeHidden();
  });
});
