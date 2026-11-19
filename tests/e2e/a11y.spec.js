// Keyboard and screen-reader behaviour on The Oracle, The Binding (Codex) and
// Your Profile. Audit and evidence: tests/a11y-oracle-codex-profile-audit.md.
// Every test here failed before the fix it guards (see the audit's IDs), and
// finds its elements in a way that also exists on master, so it fails on the
// behaviour it names rather than on a missing locator (review m3).
//
// Runs in the "app" project (playwright.config.js testMatch includes `a11y`).
import { test, expect, mockBookSearch } from './helpers/app.js';
import { signIn, rest, uniqueTitle } from './helpers/api.js';
import { loadConfig } from './helpers/env.js';
import { LibraryPage } from './pages/LibraryPage.js';
import { pngFile } from './helpers/png.js';
import { showSearch } from './helpers/touch.js';

const CORS = { 'access-control-allow-origin': '*' };
let db, lib;
test.beforeEach(async ({ request, page }) => {
  db = rest(request, await signIn(request));
  lib = new LibraryPage(page);
  await lib.goto();
});
test.afterEach(async () => { await db.deleteE2EBooks(); });

test.describe('Your Profile window', () => {
  // P1-P4: focus went nowhere, Tab walked into the page behind, Escape did nothing.
  test('opens with focus inside, keeps Tab inside, closes on Escape, and returns focus to the chip', async ({ page }) => {
    await lib.profile.chip.focus();
    await page.keyboard.press('Enter');
    await expect(lib.profile.dialog).toBeVisible();
    const focusInDialog = () => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
    expect(await focusInDialog()).toBe(true);

    for (let i = 0; i < 30; i++) {
      await page.keyboard.press(i % 7 === 6 ? 'Shift+Tab' : 'Tab');
      expect(await focusInDialog(), `Tab press ${i + 1} left the dialog`).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(lib.profile.dialog).toBeHidden();
    await expect(lib.profile.chip).toBeFocused();
  });

  // Review M1: when the focused control unmounts (Invite, Bind, Remove member)
  // focus falls to <body>. Escape and the Tab trap must still work.
  test('with focus lost to the page, Tab comes back into the window and Escape still closes it', async ({ page }) => {
    await lib.profile.chip.click();
    await expect(lib.profile.dialog).toBeVisible();
    // Wait for the archive list to load first: its render is a DOM change, and
    // Overlay's focus-rescue would pull focus back before we could check <body>.
    await expect(lib.profile.dialog.getByText('Opening…')).toHaveCount(0);
    await expect(lib.profile.dialog.getByText('Gathering the keepers…')).toHaveCount(0);
    const dropFocus = () => page.evaluate(() => document.activeElement?.blur());
    await dropFocus();
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
    await dropFocus();
    await page.keyboard.press('Escape');
    await expect(lib.profile.dialog).toBeHidden();
  });

  test('the chip says it opens a dialog', async () => {
    await expect(lib.profile.chip).toHaveAttribute('aria-haspopup', 'dialog');
  });

  // R2-S1: Remove member reloaded the roster but not the archive list, so the
  // row kept saying "2 members" until the window was reopened. Needs the second
  // staging reader (E2E_BETA_*) to join alpha's archive. Staging rate-limits
  // invite joins per reader, so this runs in the Chromium "app" project only
  // (the count is not engine-specific) and skips, saying why, if the limit is hit.
  test('after Remove member, the archive row says 1 member at once', async ({ page, request }) => {
    const beta = loadConfig().beta;
    test.skip(!beta, 'E2E_BETA_EMAIL / E2E_BETA_PASSWORD are not set');
    test.skip(test.info().project.name !== 'app', 'one invite join per run: Chromium "app" project only');
    const name = uniqueTitle('Archive');
    const archiveId = await db.createArchive(name);
    try {
      const betaDb = rest(request, await signIn(request, beta));
      try {
        await betaDb.acceptInvite(await db.makeInvite(archiveId));
      } catch (e) {
        test.skip(/Too many invite attempts/.test(String(e)), 'staging invite rate limit hit; try again later');
        throw e;
      }

      await lib.profile.chip.click();
      const row = lib.profile.dialog.locator(`[data-lib-toggle="${archiveId}"]`);
      await expect(row).toContainText('2 members');
      await row.click();
      const remove = lib.profile.dialog.getByRole('button', { name: /^Remove @.* from the archive$/ });
      await expect(remove).toHaveCount(1);
      page.once('dialog', (d) => d.accept());
      await remove.click();
      await expect(remove).toHaveCount(0);
      await expect(row).toContainText('1 member');
      await expect(row).not.toContainText('2 members');
      await expect(row).toBeFocused();
    } finally {
      await db.deleteE2EArchives();
    }
  });

  // P5: the shared-archive fields were placeholder-only.
  test('the shared-archive fields have real labels', async ({ page }) => {
    await lib.profile.chip.click();
    await expect(lib.profile.dialog.getByLabel('New shared archive')).toBeVisible();
    await expect(lib.profile.dialog.getByLabel('Invite code')).toBeVisible();
    await page.keyboard.press('Escape');
  });
});

test.describe('Inscribe window', () => {
  // CODE_REVIEW_TODO item 12 (the same Overlay fix).
  // R2-W1: Safari never focuses a clicked button, so Overlay had no opener and
  // focus fell to <body>. It now uses the last pressed control, in every engine.
  test('Escape closes it and focus returns to + Inscribe', async ({ page }) => {
    await lib.sections.inscribe.click();
    const dialog = page.getByRole('dialog', { name: 'Inscribe' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(lib.sections.inscribe).toBeFocused();
  });

  // R2-F1: + Owned opens the book window and leaves with Inscribe in the same
  // step, so the book window's opener is gone when it closes. Focus used to
  // drop to <body>; it now falls back to + Inscribe.
  test('a book opened by + Owned returns focus to + Inscribe when it closes', async ({ page }) => {
    const title = uniqueTitle('Focus Owned');
    await mockBookSearch(page, [{ title, author: 'Ada Thorn' }]);
    await lib.sections.inscribe.click();
    const dialog = page.getByRole('dialog', { name: 'Inscribe' });
    await showSearch(page, dialog);
    await dialog.getByPlaceholder('Search by title or author…').fill(title);
    await expect(dialog.getByText(title)).toBeVisible();
    await dialog.getByRole('button', { name: '+ Owned' }).click();

    const book = lib.detail(title);
    await expect(book).toBeVisible();
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(book).toBeHidden();
    await expect(lib.sections.inscribe).toBeFocused();
  });
});

test.describe('The Oracle', () => {
  test.beforeEach(async ({ page }) => {
    await lib.sections.oracle.click();
    await expect(page.getByRole('heading', { name: 'The Oracle' })).toBeVisible();
    // Open Library knows every pick it is asked about, so each one shows.
    await page.unroute(/openlibrary\.org/);
    await page.route(/openlibrary\.org\/search\.json/, (route) => {
      const u = new URL(route.request().url());
      const docs = [{ title: u.searchParams.get('title'), author_name: [u.searchParams.get('author')] }];
      return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ docs }) });
    });
  });

  const consult = (page) => page.getByRole('button', { name: /Consult the Oracle|Divining/ });
  const wishlistButton = (page, title) =>
    page.locator('main .ht-card').filter({ hasText: title }).getByRole('button', { name: /\+ Wishlist/ });
  // Answer the AI endpoint with these picks (plain JSON, one per line), after `delay` ms.
  async function oracleSays(page, titles, delay = 0) {
    const text = titles.map((title) => JSON.stringify({ title, author: 'Oracle Writer', genre: 'Gothic romantasy', reason: 'Fits.', spice: 2 })).join('\n');
    await page.unroute('**/api/claude');
    await page.route('**/api/claude', async (route) => {
      if (delay) await new Promise((r) => setTimeout(r, delay));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text }] }) });
    });
  }

  // O2: the button was disabled while divining, which dropped keyboard focus.
  test('Consult exposes its busy state and keeps keyboard focus while divining', async ({ page }) => {
    await oracleSays(page, [uniqueTitle('Busy')], 1500);
    await consult(page).focus();
    await page.keyboard.press('Enter');
    await expect(consult(page)).toHaveAttribute('aria-busy', 'true');
    await expect(consult(page)).toHaveText(/Divining/);
    await expect(consult(page)).toBeFocused();
    await expect(consult(page)).not.toHaveAttribute('aria-busy', 'true', { timeout: 10_000 });
    await expect(consult(page)).toBeFocused();
  });

  // O1: picks streamed in with nothing announced.
  test('results are announced through a polite status region, not by making the list live', async ({ page }) => {
    const titles = [uniqueTitle('Live A'), uniqueTitle('Live B')];
    await oracleSays(page, titles, 800);
    const status = page.locator('main').getByRole('status').filter({ hasText: /leaves|arriving|picks? from the Oracle/ });
    await consult(page).click();
    await expect(status).toHaveText('Reading the leaves of your library…');
    await expect(status).toHaveText('2 picks from the Oracle.');
    const list = page.getByRole('list', { name: "The Oracle's picks" });
    await expect(list.getByRole('listitem')).toHaveCount(2);
    await expect(list).not.toHaveAttribute('aria-live', /.+/);
    await expect(list).not.toHaveAttribute('role', /status|alert|log/);
  });

  // O3: the "vision clouded" error was a plain paragraph.
  test('a failed consult is announced as an alert', async ({ page }) => {
    await consult(page).click(); // the fixture answers 503
    await expect(page.getByRole('alert')).toHaveText("The Oracle's vision clouded over. Try consulting again.");
  });

  // O5: the card left with its button, and focus dropped to the page.
  test('+ Wishlist names its book, then moves focus to the next pick and says it was saved', async ({ page }) => {
    const [first, second] = [uniqueTitle('Wish A'), uniqueTitle('Wish B')];
    await oracleSays(page, [first, second]);
    await consult(page).click();
    // By card text and the visible label, which master has too.
    const addFirst = wishlistButton(page, first);
    const addSecond = wishlistButton(page, second);
    await expect(addSecond).toBeVisible();
    await addFirst.focus();
    await page.keyboard.press('Enter');
    await expect(addFirst).toHaveCount(0);
    await expect(addSecond).toBeFocused();
    await expect(page.getByRole('status').filter({ hasText: 'is on your wishlist' })).toHaveText(`“${first}” is on your wishlist.`);
    expect(await db.booksByTitle(first)).toHaveLength(1);
    const box = await addSecond.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    await expect(addSecond).toHaveAccessibleName(`+ Wishlist: ${second}`);
  });

  // Review M2 / BUG-004: a double click saved the same title twice.
  test('a double click on + Wishlist saves the book once', async ({ page }) => {
    const title = uniqueTitle('Twice');
    await oracleSays(page, [title]);
    await consult(page).click();
    const add = wishlistButton(page, title);
    await expect(add).toBeVisible();
    await add.evaluate((b) => { b.click(); b.click(); });
    await expect(add).toHaveCount(0);
    await expect.poll(async () => (await db.booksByTitle(title)).length, { timeout: 5000 }).toBe(1);
    await page.waitForTimeout(1000); // a late second insert would land here
    expect(await db.booksByTitle(title)).toHaveLength(1);
  });
});

test.describe('The Binding (Codex)', () => {
  test.beforeEach(async ({ page }) => {
    await lib.sections.codex.click();
    await expect(page.getByRole('heading', { name: 'The Binding' })).toBeVisible();
  });
  const csv = (rows) => ['Title,Author,My Rating,Exclusive Shelf', ...rows].join('\n');
  const file = (text) => ({ name: 'goodreads.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });
  // By type and accept, not by the new label, so these fail on master for the behaviour.
  const goodreadsInput = (page) => page.locator('main input[type="file"][accept*="csv"]');

  // C4: the file inputs had no accessible name.
  test('both file inputs are labelled', async ({ page }) => {
    await expect(page.getByLabel('Kindle My Clippings.txt file')).toHaveCount(1);
    await expect(page.getByLabel('Goodreads library export CSV file')).toHaveCount(1);
  });

  // C1: choosing a file, then Cancel, each dropped focus to the page.
  test('focus follows the steps: preview heading after a file, upload button after Cancel', async ({ page }) => {
    await goodreadsInput(page).setInputFiles(file(csv([`${uniqueTitle('Focus')},A,4,read`])));
    await expect(page.getByText(/choose what to bind/)).toBeFocused();
    await page.getByRole('button', { name: 'cancel' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Upload My Clippings.txt' })).toBeFocused();
  });

  // C3: file errors were not announced.
  test('an unreadable file is announced as an alert', async ({ page }) => {
    await goodreadsInput(page).setInputFiles(file('nothing,here\n1,2\n'));
    await expect(page.getByRole('alert')).toContainText('No books could be read from that file');
  });

  // C2: the outcome was a plain paragraph, and Bind was disabled mid-import.
  test('Bind reports its outcome through a status region and focus lands on the upload button', async ({ page }) => {
    const title = uniqueTitle('Bound');
    await goodreadsInput(page).setInputFiles(file(csv([`${title},A,4,read`])));
    await page.getByRole('button', { name: /^Bind 1 to the archive/ }).click();
    await expect(page.locator('main').getByRole('status').filter({ hasText: 'Bound 1 book' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload My Clippings.txt' })).toBeFocused();
    expect(await db.booksByTitle(title)).toHaveLength(1);
  });
});

test.describe('Cover crop inside the book window', () => {
  // Review m1: Escape on the crop screen closed the whole book window and lost the photo.
  test('Escape cancels the crop and leaves the book window open', async ({ page }) => {
    const title = uniqueTitle('Crop');
    await db.insertBook({ title });
    await lib.goto();
    await lib.card(title).click();
    const dialog = lib.detail(title);
    await expect(dialog).toBeVisible();
    // "Change cover" is a clickable div whose label is transparent until hover
    // (review m6, a follow-up), so it never counts as stable: force the click.
    await dialog.getByText('Change cover').click({ force: true });
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), dialog.getByRole('button', { name: /Upload photo/ }).click()]);
    await chooser.setFiles(pngFile());
    const crop = page.getByText('Adjust cover');
    await expect(crop).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(crop).toBeHidden();
    await expect(dialog).toBeVisible();
  });
});
