// One positive test per button in a book's window, through the DetailPanel object.
// Each test checks the screen AND the saved row in staging. The AI endpoint is stubbed:
// off (503) by default, and answered with a small valid reply where a button needs it.
import { test, expect } from './helpers/app.js';
import { signIn, rest, uniqueTitle } from './helpers/api.js';
import { pngFile } from './helpers/png.js';
import { LibraryPage } from './pages/LibraryPage.js';
import { DetailPanel } from './pages/DetailPanel.js';

let db, lib, panel, title, book;
test.beforeEach(async ({ request, page }) => {
  db = rest(request, await signIn(request));
  lib = new LibraryPage(page);
  title = uniqueTitle('Detail');
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

test.describe('header and shelf buttons', () => {
  test('Close closes the book window', async () => {
    await panel.close.click();
    await expect(panel.dialog).toBeHidden();
  });

  test('Move to Wishlist moves the book, and Mark as Owned moves it back', async () => {
    await panel.toWishlist.click();
    await expect.poll(async () => (await saved()).shelf).toBe('wishlist');
    await panel.toOwned.click();
    await expect.poll(async () => (await saved()).shelf).toBe('owned');
  });

  test('Mark as Read marks it read, and Mark Unread undoes it', async () => {
    await panel.markRead.click();
    await expect.poll(async () => (await saved()).read).toBe(true);
    await panel.markUnread.click();
    await expect.poll(async () => (await saved()).read).toBe(false);
  });

  test('Banish from the archive deletes the book', async () => {
    await panel.banish.click();
    await expect(panel.dialog).toBeHidden();
    await expect.poll(() => db.booksByTitle(title)).toHaveLength(0);
  });

  test('Save & Close saves an edited author and closes', async () => {
    await panel.dialog.getByPlaceholder('Author').fill('Edited Author');
    await panel.saveAndClose.click();
    await expect(panel.dialog).toBeHidden();
    await expect.poll(async () => (await saved()).author).toBe('Edited Author');
  });

  test('Discard changes puts the original author back', async () => {
    const author = panel.dialog.getByPlaceholder('Author');
    await author.fill('Never Saved');
    await panel.discard.click();
    await expect(author).toHaveValue('E2E Bot');
    expect((await saved()).author).toBe('E2E Bot');
  });
});

test.describe('ratings', () => {
  for (const n of [1, 3, 5]) {
    test(`Verdict ${n} of 5 saves ${n} swords`, async () => {
      await panel.verdict(n).click();
      await expect.poll(async () => (await saved()).overall).toBe(n);
    });
    test(`Smoulder ${n} of 5 saves ${n} candles`, async () => {
      await panel.smoulder(n).click();
      await expect.poll(async () => (await saved()).smut).toBe(n);
    });
  }
});

test.describe('genres', () => {
  test('Remove genre takes the genre off the book', async () => {
    await panel.removeGenre('Fantasy').click();
    await expect.poll(async () => (await saved()).genres).toEqual([]);
  });

  test('Add saves a typed genre', async () => {
    await panel.genreInput.fill('Gothic');
    await panel.addGenre.click();
    await expect.poll(async () => (await saved()).genres).toContain('Gothic');
    await expect(panel.removeGenre('Gothic')).toBeVisible();
  });
});

test.describe('tropes', () => {
  test('Browse all tropes opens the index, a trope chip saves, and Close the index closes it', async () => {
    await panel.browseTropes.click();
    await expect(panel.closeTropeIndex).toBeVisible();
    await panel.tropeChip('Slow Burn').click();
    await expect.poll(async () => (await saved()).tropes).toContain('Slow Burn');
    await panel.closeTropeIndex.click();
    await expect(panel.browseTropes).toBeVisible();
  });

  // Divining only SUGGESTS: the names appear as chips, and nothing is saved until one is chosen.
  test('Divine tropes offers the tropes the scribe names, and choosing one saves it', async ({ page }) => {
    await aiReplies(page, '{"tropes":["Slow Burn","Forbidden Love"]}');
    await panel.divineTropes.click();
    await expect(panel.tropeChip('Forbidden Love')).toHaveAttribute('aria-pressed', 'false');
    expect((await saved()).tropes).toEqual([]);
    await panel.tropeChip('Forbidden Love').click();
    await expect.poll(async () => (await saved()).tropes).toEqual(['Forbidden Love']);
  });
});

test.describe('formats and progress', () => {
  test('Ebook adds the ebook edition, Print can then be turned off, and Audio adds audio', async () => {
    await panel.ebook.click();
    await expect.poll(async () => (await saved()).formats).toEqual(expect.arrayContaining(['print', 'ebook']));
    await panel.print.click();
    await expect.poll(async () => (await saved()).formats).toEqual(['ebook']);
    await panel.audio.click();
    await expect.poll(async () => (await saved()).formats).toEqual(expect.arrayContaining(['ebook', 'audio']));
  });

  test('25% and 50% set the ebook progress', async () => {
    await panel.ebook.click();
    await panel.quarter.click();
    await expect.poll(async () => (await saved()).progress?.ebook?.percent).toBe(25);
    await panel.half.click();
    await expect.poll(async () => (await saved()).progress?.ebook?.percent).toBe(50);
  });

  test('Done sets the ebook to 100% and marks the book read', async () => {
    await panel.ebook.click();
    await panel.done.click();
    await expect.poll(async () => (await saved()).progress?.ebook?.percent).toBe(100);
    await expect.poll(async () => (await saved()).read).toBe(true);
  });
});

test.describe('Snap to update', () => {
  test('Snap to update opens the file chooser', async ({ page }) => {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), panel.snap.click()]);
    expect(chooser).toBeTruthy();
  });

  test('Apply saves the page the photo showed', async ({ page }) => {
    await aiReplies(page, '{"page": 42, "chapter": null}');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), panel.snap.click()]);
    await chooser.setFiles(pngFile());
    await expect(panel.apply).toBeEnabled();
    await panel.apply.click();
    await expect.poll(async () => (await saved()).progress?.print?.page).toBe(42);
  });

  test('Retry opens the file chooser again, and Enter by hand drops the reading', async ({ page }) => {
    await aiReplies(page, '{"page": 42, "chapter": null}');
    const [first] = await Promise.all([page.waitForEvent('filechooser'), panel.snap.click()]);
    await first.setFiles(pngFile());
    await expect(panel.retry).toBeVisible();
    const [second] = await Promise.all([page.waitForEvent('filechooser'), panel.retry.click()]);
    expect(second).toBeTruthy();
    await second.setFiles(pngFile());
    await panel.enterByHand.click();
    await expect(panel.apply).toBeHidden();
    expect((await saved()).progress?.print?.page ?? null).toBeNull(); // nothing was written
  });
});

test.describe('marginalia', () => {
  test('Inscribe note saves a note with its page, and Strike out deletes it', async () => {
    await panel.noteText.fill('A thought worth keeping');
    await panel.notePage.fill('12');
    await panel.inscribeNote.click();
    await expect(panel.dialog.getByText('A thought worth keeping')).toBeVisible();
    await expect.poll(async () => (await db.notesForBook(book.id)).length).toBe(1);
    expect((await db.notesForBook(book.id))[0]).toMatchObject({ text: 'A thought worth keeping', page: '12' } /* stored as text */);

    await panel.strikeOut().click();
    await expect(panel.dialog.getByText('A thought worth keeping')).toBeHidden();
    await expect.poll(async () => (await db.notesForBook(book.id)).length).toBe(0);
  });

  test('Time switches the note box to a timestamp for an audiobook, and Page switches it back', async () => {
    await panel.audio.click();
    await expect(panel.timeTab).toBeVisible();
    await panel.timeTab.click();
    await expect(panel.dialog.getByLabel('Timestamp')).toBeVisible();
    await panel.pageTab.click();
    await expect(panel.dialog.getByLabel('Page', { exact: true })).toBeVisible();
  });

  // Headless Chromium has no working microphone or speech service, so a stand-in
  // recogniser that "hears" one phrase is installed before the page loads. That proves
  // the button, the listening state and the transcript landing in the note box.
  test('Speak a note starts listening, writes what was heard, and a second press stops', async ({ page }) => {
    await page.addInitScript(() => {
      window.webkitSpeechRecognition = window.SpeechRecognition = class {
        start() {
          setTimeout(() => this.onresult?.({
            resultIndex: 0,
            results: [Object.assign([{ transcript: 'spoken words' }], { isFinal: true })],
          }), 50);
        }
        stop() { this.onend?.(); }
      };
    });
    await page.reload();
    await lib.card(title).click();
    await panel.speak.click();
    await expect(panel.speak).toHaveAttribute('aria-pressed', 'true');
    await expect(panel.noteText).toHaveValue('spoken words');
    await panel.speak.click();
    await expect(panel.speak).toHaveAttribute('aria-pressed', 'false');
  });
});
