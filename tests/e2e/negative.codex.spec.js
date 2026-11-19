// Negative cases for the Codex (The Binding): empty, wrong or broken import files, odd
// values inside a real file, the same file twice, and a save the database refuses.
// Every title starts with "E2E " so the afterEach clean-up removes what an import wrote.
import { test, expect } from './helpers/app.js';
import { signIn, rest, uniqueTitle } from './helpers/api.js';
import { LibraryPage } from './pages/LibraryPage.js';

let db, lib, page;
test.beforeEach(async ({ request, page: p }) => {
  page = p;
  db = rest(request, await signIn(request));
  lib = new LibraryPage(page);
  await lib.goto();
  await lib.sections.codex.click();
  await expect(page.getByRole('heading', { name: 'The Binding' })).toBeVisible();
});
test.afterEach(async () => { await db.deleteE2EBooks(); });

const file = (name, text, mimeType = 'text/plain') => ({ name, mimeType, buffer: Buffer.from(text) });
async function upload(button, f) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: button }).click()]);
  await chooser.setFiles(f);
}
const goodreads = (f) => upload('Upload Goodreads CSV', f);
const kindle = (f) => upload('Upload My Clippings.txt', f);
const csv = (rows) => ['Title,Author,My Rating,Exclusive Shelf', ...rows].join('\n');
const clip = (title, author, kind, text) =>
  `${title} (${author})\n- Your ${kind} on page 12 | Location 100-101 | Added on Monday, 1 January 2024 00:00:00\n\n${text}\n==========\n`;
const bind = () => page.getByRole('button', { name: /^Bind \d+ to the archive/ });
const noBooks = () => page.getByText(/No books could be read from that file/);

test.describe('a file with nothing usable in it', () => {
  test('an empty Goodreads CSV says no books were found and saves nothing', async () => {
    await goodreads(file('goodreads.csv', '', 'text/csv'));
    await expect(noBooks()).toBeVisible();
    await expect(bind()).toHaveCount(0);
  });

  test('a CSV with the wrong columns says no books were found', async () => {
    await goodreads(file('other.csv', 'Name,Writer\nE2E Wrong Columns,Someone', 'text/csv'));
    await expect(noBooks()).toBeVisible();
    expect(await db.booksByTitle('E2E Wrong Columns')).toHaveLength(0);
  });

  test('a picture renamed to .csv says no books were found, with no page error', async () => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await goodreads({ name: 'cover.csv', mimeType: 'text/csv', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0xff, 0xfe, 0x0d, 0x0a]) });
    await expect(noBooks()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('an empty My Clippings.txt says no books were found', async () => {
    await kindle(file('My Clippings.txt', ''));
    await expect(noBooks()).toBeVisible();
  });

  test('a clippings file with only bookmarks says no books were found', async () => {
    await kindle(file('My Clippings.txt', clip(uniqueTitle('Marks'), 'A', 'Bookmark', '')));
    await expect(noBooks()).toBeVisible();
  });
});

test.describe('odd values inside a real export', () => {
  test('a row with no title is skipped and star ratings are kept between 0 and 5', async () => {
    const high = uniqueTitle('High'), junk = uniqueTitle('Junk');
    await goodreads(file('goodreads.csv', csv([`${high},A,9,read`, `${junk},B,ten,to-read`, ',C,3,read']), 'text/csv'));
    await expect(page.getByText(/Found\s*2\s*books/)).toBeVisible();
    await bind().click();
    await expect(page.getByText(/Bound 2 books to the archive/)).toBeVisible();
    expect((await db.booksByTitle(high))[0]).toMatchObject({ overall: 5, read: true, shelf: 'owned' });
    expect((await db.booksByTitle(junk))[0]).toMatchObject({ overall: 0, read: false, shelf: 'wishlist' });
  });

  test('cancel on the preview saves nothing', async () => {
    const title = uniqueTitle('Cancel');
    await goodreads(file('goodreads.csv', csv([`${title},A,4,read`]), 'text/csv'));
    await page.getByRole('button', { name: 'cancel' }).click();
    await expect(bind()).toHaveCount(0);
    expect(await db.booksByTitle(title)).toHaveLength(0);
  });

  test('with every book unticked, Bind is off', async () => {
    const title = uniqueTitle('Untick');
    await goodreads(file('goodreads.csv', csv([`${title},A,4,read`]), 'text/csv'));
    await page.getByRole('checkbox').uncheck();
    await expect(bind()).toBeDisabled();
  });
});

test.describe('importing the same file twice', () => {
  test('a Goodreads file bound twice leaves one book, marked as already there the second time', async () => {
    const title = uniqueTitle('Twice');
    const f = file('goodreads.csv', csv([`${title},A,4,read`]), 'text/csv');
    await goodreads(f);
    await bind().click();
    await expect(page.getByText(/Bound 1 book/)).toBeVisible();
    await goodreads(f);
    await expect(page.getByText('already in archive — will update')).toBeVisible();
    await bind().click();
    await expect(page.getByText(/Bound 1 book/)).toBeVisible();
    expect(await db.booksByTitle(title)).toHaveLength(1);
  });

  test('a clippings file bound twice does not repeat its highlights', async () => {
    const title = uniqueTitle('Highlights');
    const f = file('My Clippings.txt', clip(title, 'Ann Author', 'Highlight', 'A line worth keeping.') +
      clip(title, 'Ann Author', 'Highlight', 'A second line.'));
    for (let i = 0; i < 2; i++) {
      await kindle(f);
      await bind().click();
      await expect(page.getByText(/Bound 1 book/)).toBeVisible();
    }
    const [row] = await db.booksByTitle(title);
    expect(await db.notesForBook(row.id)).toHaveLength(2);
  });
});

test.describe('a save the database refuses', () => {
  test('says it could not be bound, how to retry, and leaves nothing behind', async () => {
    const title = uniqueTitle('Refused');
    await page.route('**/rest/v1/books*', (route) => route.request().method() === 'POST'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"e2e"}' })
      : route.fallback());
    await goodreads(file('goodreads.csv', csv([`${title},A,4,read`]), 'text/csv'));
    await bind().click();
    await expect(page.getByText(/couldn't be bound to the archive.*upload the same file again/)).toBeVisible();
    expect(await db.booksByTitle(title)).toHaveLength(0);
    await expect(page.getByText(/^Bound /)).toHaveCount(0);
  });
});
