// Adding and updating books, signed in as the staging test reader.
// Each test checks the screen AND the row in the staging database, because a
// screen can look right while nothing was saved.
import { test, expect, gotoLibrary, mockBookSearch, sections, card, detail } from './helpers/app.js';
import { signIn, rest, uniqueTitle } from './helpers/api.js';
import { showSearch } from './helpers/touch.js';

let db;
test.beforeEach(async ({ request }) => { db = rest(request, await signIn(request)); });
test.afterEach(async () => { await db.deleteE2EBooks(); });

const saved = async (title) => (await db.booksByTitle(title))[0];

async function searchInInscribe(page, title) {
  await sections(page).getByRole('button', { name: '+ Inscribe' }).click();
  const dialog = page.getByRole('dialog', { name: 'Inscribe' });
  await showSearch(page, dialog); // a phone opens on Scan
  await dialog.getByPlaceholder('Search by title or author…').fill(title);
  await expect(dialog.getByText(title)).toBeVisible();
  return dialog;
}

test.describe('adding a book', () => {
  test('search, + Owned: the book is saved, opens, and is on the shelf', async ({ page }) => {
    const title = uniqueTitle('Owned');
    await mockBookSearch(page, [{ title, author: 'Ada Thorn' }]);
    await gotoLibrary(page);
    const dialog = await searchInInscribe(page, title);
    await dialog.getByRole('button', { name: '+ Owned' }).click();

    await expect(detail(page, title)).toBeVisible(); // an owned add opens the book
    await expect.poll(() => db.booksByTitle(title)).toHaveLength(1);
    expect(await saved(title)).toMatchObject({ author: 'Ada Thorn', shelf: 'owned', read: false, overall: 0, smut: 0, formats: ['print'] });

    await detail(page, title).getByRole('button', { name: 'Close' }).click();
    await expect(card(page, title)).toBeVisible();
    await page.reload(); // still there after a fresh load
    await expect(card(page, title)).toBeVisible();
  });

  test('search, + Wishlist: saved to the wishlist', async ({ page }) => {
    const title = uniqueTitle('Wish');
    await mockBookSearch(page, [{ title }]);
    await gotoLibrary(page);
    const dialog = await searchInInscribe(page, title);
    await dialog.getByRole('button', { name: '+ Wishlist' }).click();

    await expect(dialog).toBeHidden();
    await expect(card(page, title)).toContainText('Wishlist');
    await expect.poll(async () => (await saved(title))?.shelf).toBe('wishlist');
  });

  test('a title already in the library asks first, and Cancel adds nothing', async ({ page }) => {
    const title = uniqueTitle('Dup');
    await db.insertBook({ title });
    await mockBookSearch(page, [{ title }]);
    await gotoLibrary(page);
    const dialog = await searchInInscribe(page, title);
    await dialog.getByRole('button', { name: '+ Owned' }).click();

    const warn = page.getByRole('dialog', { name: 'Already in your archive' });
    await expect(warn).toBeVisible();
    await warn.getByRole('button', { name: 'Cancel' }).click();
    await expect(warn).toBeHidden();
    expect(await db.booksByTitle(title)).toHaveLength(1);
  });

  test('a search with no results says so and what to try', async ({ page }) => {
    await gotoLibrary(page);
    await sections(page).getByRole('button', { name: '+ Inscribe' }).click();
    const dialog = page.getByRole('dialog', { name: 'Inscribe' });
    await showSearch(page, dialog); // a phone opens on Scan
    await dialog.getByPlaceholder('Search by title or author…').fill('zzqx no such tome');
    await expect(dialog.getByText('No tome answers to that name.')).toBeVisible();
  });
});

test.describe('updating a book', () => {
  let title;
  test.beforeEach(async ({ page }) => {
    title = uniqueTitle('Edit');
    await db.insertBook({ title });
    await gotoLibrary(page);
    await card(page, title).click();
    await expect(detail(page, title)).toBeVisible();
  });

  test('Verdict and Smoulder save on tap, and tapping the same one clears it', async ({ page }) => {
    const panel = detail(page, title);
    await panel.getByRole('button', { name: 'Verdict: 4 of 5' }).click();
    await expect.poll(async () => (await saved(title)).overall).toBe(4);
    await panel.getByRole('button', { name: 'Smoulder: 2 of 5' }).click();
    await expect.poll(async () => (await saved(title)).smut).toBe(2);
    await panel.getByRole('button', { name: 'Verdict: 4 of 5' }).click();
    await expect.poll(async () => (await saved(title)).overall).toBe(0);
    expect((await saved(title)).smut).toBe(2); // clearing one rating leaves the other
  });

  test('Mark as Read and Move to Wishlist change the label and the saved row', async ({ page }) => {
    const panel = detail(page, title);
    await panel.getByRole('button', { name: 'Mark as Read' }).click();
    await expect(panel.getByText('Read ✓')).toBeVisible();
    await expect.poll(async () => (await saved(title)).read).toBe(true);

    await panel.getByRole('button', { name: 'Move to Wishlist' }).click();
    await expect(panel.getByText('On the Wishlist')).toBeVisible();
    await expect.poll(async () => (await saved(title)).shelf).toBe('wishlist');

    await panel.getByRole('button', { name: 'Mark Unread' }).click();
    await expect(panel.getByText('Not yet read')).toBeVisible();
    await expect.poll(async () => (await saved(title)).read).toBe(false);
  });

  test('renaming: Save & Close saves; Discard changes does not', async ({ page }) => {
    const panel = detail(page, title);
    await panel.getByPlaceholder('Title').fill(`${title} DRAFT`);
    await panel.getByRole('button', { name: 'Discard changes' }).click();
    await expect(panel.getByPlaceholder('Title')).toHaveValue(title);

    const renamed = `${title} II`;
    await panel.getByPlaceholder('Title').fill(renamed);
    await panel.getByRole('button', { name: 'Save & Close' }).click();
    await expect(card(page, renamed)).toBeVisible();
    await expect.poll(() => db.booksByTitle(renamed)).toHaveLength(1);
    expect(await db.booksByTitle(title)).toHaveLength(0);
  });

  test('renaming onto another book\'s title is refused', async ({ page }) => {
    const other = uniqueTitle('Taken');
    await db.insertBook({ title: other });
    await page.reload(); // the app must know the other book exists
    await card(page, title).click();
    const panel = detail(page, title);
    await panel.getByPlaceholder('Title').fill(other.toUpperCase()); // match ignores case
    await panel.getByRole('button', { name: 'Save & Close' }).click();
    await expect(panel.getByText('Choose a different title.')).toBeVisible();
    expect(await db.booksByTitle(title)).toHaveLength(1);
  });

  test('Banish from the archive removes the book', async ({ page }) => {
    await detail(page, title).getByRole('button', { name: 'Banish from the archive' }).click();
    await expect(detail(page, title)).toBeHidden();
    await expect(card(page, title)).toHaveCount(0);
    await expect.poll(() => db.booksByTitle(title)).toHaveLength(0);
  });
});
