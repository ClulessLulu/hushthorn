// Negative cases for a book's window: a save the database refuses, the scribe (AI)
// down or talking nonsense, a photo it cannot read, and empty or odd input. Each test
// checks what the person SEES and what is (not) saved in staging. The AI endpoint is
// off (503) by default, as in every spec.
import { test, expect } from './helpers/app.js';
import { signIn, rest, uniqueTitle } from './helpers/api.js';
import { pngFile } from './helpers/png.js';
import { LibraryPage } from './pages/LibraryPage.js';
import { DetailPanel } from './pages/DetailPanel.js';

let db, lib, panel, title, book;
test.beforeEach(async ({ request, page }) => {
  db = rest(request, await signIn(request));
  lib = new LibraryPage(page);
  title = uniqueTitle('DetailNeg');
  book = await db.insertBook({ title, genres: ['Fantasy'], tropes: [] });
  await lib.goto();
  await lib.card(title).click();
  panel = new DetailPanel(page, title);
  await expect(panel.dialog).toBeVisible();
});
test.afterEach(async () => { await db.deleteE2EBooks(); });

const saved = async () => (await db.booksByTitle(title))[0];
const aiReplies = (page, text) => page.route('**/api/claude', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text }] }) }));
const refuse = (page, table, method) => page.route(`**/rest/v1/${table}*`, (route) =>
  route.request().method() === method
    ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"e2e"}' })
    : route.fallback());
const alert = () => panel.dialog.getByRole('alert');

test.describe('a save the database refuses', () => {
  test('a Verdict that cannot be saved says so, saves nothing, and a retry saves', async ({ page }) => {
    await refuse(page, 'books', 'PATCH');
    await panel.verdict(4).click();
    await expect(alert()).toContainText('could not be saved');
    await expect(panel.dialog.getByText('Saved', { exact: true })).toHaveCount(0); // no false "Saved" badge
    expect((await saved()).overall ?? 0).toBe(0);
    await page.unroute('**/rest/v1/books*');
    await panel.verdict(4).click();
    await expect.poll(async () => (await saved()).overall).toBe(4);
    await expect(alert()).toHaveCount(0);
  });

  test('Save & Close that cannot be saved keeps the window open with the edit in place', async ({ page }) => {
    const author = panel.dialog.getByPlaceholder('Author');
    await author.fill('Unsaved Author');
    await refuse(page, 'books', 'PATCH');
    await panel.saveAndClose.click();
    await expect(alert()).toContainText('could not be saved');
    await expect(panel.dialog).toBeVisible();
    await expect(author).toHaveValue('Unsaved Author');
    expect((await saved()).author).toBe('E2E Bot');
  });

  test('a genre that cannot be saved says so and is not shown as added', async ({ page }) => {
    await refuse(page, 'books', 'PATCH');
    await panel.genreInput.fill('Gothic');
    await panel.addGenre.click();
    await expect(alert()).toContainText('could not be saved');
    await expect(panel.removeGenre('Gothic')).toHaveCount(0);
    expect((await saved()).genres).toEqual(['Fantasy']);
  });

  test('a note that cannot be saved says so and keeps the words in the box', async ({ page }) => {
    await refuse(page, 'notes', 'POST');
    await panel.noteText.fill('Do not lose this thought');
    await panel.inscribeNote.click();
    await expect(alert()).toContainText('could not be saved');
    await expect(panel.noteText).toHaveValue('Do not lose this thought');
    expect(await db.notesForBook(book.id)).toHaveLength(0);
  });
});

test.describe('the scribe cannot divine tropes', () => {
  test('scribe unreachable: says so and points to choosing by hand', async () => {
    await panel.divineTropes.click();
    await expect(panel.dialog.getByText(/choose them by hand/i)).toBeVisible();
    await expect(panel.divineTropes).toBeEnabled(); // can try again
    expect((await saved()).tropes).toEqual([]);
  });

  test('scribe replies with nonsense: same plain message, nothing saved', async ({ page }) => {
    await aiReplies(page, 'I am not JSON at all');
    await panel.divineTropes.click();
    await expect(panel.dialog.getByText(/choose them by hand/i)).toBeVisible();
    expect((await saved()).tropes).toEqual([]);
  });

  test('a trope that is not on the list is never offered', async ({ page }) => {
    await aiReplies(page, '{"tropes":["Made Up Trope","Slow Burn"]}');
    await panel.divineTropes.click();
    await expect(panel.tropeChip('Slow Burn')).toHaveAttribute('aria-pressed', 'false');
    await expect(panel.dialog.getByText('Made Up Trope')).toHaveCount(0);
    expect((await saved()).tropes).toEqual([]);
  });
});

test.describe('Snap to update cannot read the photo', () => {
  const snapWith = async (page, files) => {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), panel.snap.click()]);
    await chooser.setFiles(files);
  };

  test('scribe unreachable: says enter it by hand, writes nothing', async ({ page }) => {
    await snapWith(page, pngFile());
    await expect(panel.dialog.getByText(/enter it by hand below/)).toBeVisible();
    await expect(panel.apply).toBeHidden();
    expect((await saved()).progress?.print?.page ?? null).toBeNull();
  });

  test('scribe reads no page number: same message, writes nothing', async ({ page }) => {
    await aiReplies(page, '{"page":"forty","chapter":null}');
    await snapWith(page, pngFile());
    await expect(panel.dialog.getByText(/enter it by hand below/)).toBeVisible();
    expect((await saved()).progress?.print?.page ?? null).toBeNull();
  });

  test('a file that is not a picture: says it could not be opened, writes nothing', async ({ page }) => {
    await snapWith(page, { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a picture') });
    await expect(panel.dialog.getByText(/couldn't be opened/)).toBeVisible();
    expect((await saved()).progress?.print?.page ?? null).toBeNull();
  });
});

test.describe('empty or odd input', () => {
  test('an empty or spaces-only genre cannot be added', async () => {
    await expect(panel.addGenre).toBeDisabled();
    await panel.genreInput.fill('   ');
    await expect(panel.addGenre).toBeDisabled();
  });

  test('the same genre in other capitals is not added twice', async () => {
    await panel.genreInput.fill('fantasy');
    await panel.addGenre.click();
    await panel.page.waitForTimeout(500);
    expect((await saved()).genres).toEqual(['Fantasy']);
  });

  test('an empty or spaces-only note cannot be inscribed', async () => {
    await expect(panel.inscribeNote).toBeDisabled();
    await panel.noteText.fill('   ');
    await expect(panel.inscribeNote).toBeDisabled();
  });

  test('a blank title is not saved: the book keeps its name', async () => {
    await panel.dialog.getByPlaceholder('Title').fill('   ');
    await panel.dialog.getByPlaceholder('Author').fill('Changed Too');
    await panel.saveAndClose.click();
    await expect.poll(async () => (await saved())?.author).toBe('Changed Too');
    expect((await saved()).title).toBe(title);
  });

  test('renaming to a title already in the library is stopped with a plain reason', async ({ page }) => {
    const other = uniqueTitle('Taken');
    await db.insertBook({ title: other });
    await page.reload();
    await lib.card(title).click();
    await panel.dialog.getByPlaceholder('Title').fill(other.toLowerCase());
    await panel.saveAndClose.click();
    await expect(panel.dialog.getByText(/already titled/)).toBeVisible();
    await expect(panel.dialog).toBeVisible();
    expect(await db.booksByTitle(title)).toHaveLength(1);
  });
});
