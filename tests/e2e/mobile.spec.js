// The app on a phone: iPhone 14 in WebKit (mobile-safari), Pixel 7 in Chromium
// (mobile-chrome), both with touch; also Safari at desktop size (webkit-desktop).
// Signed in as the staging test reader from the saved session. Books it makes
// start with "E2E " and are deleted after each test. AI and book lookups are
// answered locally (helpers/app.js), so no test spends money or needs a network.
//
// Runs only in the cross-browser projects (playwright.config.js CROSS_BROWSER).
// Each test names the review ID it guards, from
// tests/a11y-oracle-codex-profile-review.md ("Round 2 + WebKit/mobile").
import { test, expect } from './helpers/app.js';
import { signIn, rest, uniqueTitle } from './helpers/api.js';
import { press, hasTouch, expectNoSideScroll, smallTargets } from './helpers/touch.js';
import { LibraryPage } from './pages/LibraryPage.js';
import { InscribeModal } from './pages/InscribeModal.js';
import { DetailPanel } from './pages/DetailPanel.js';

const CORS = { 'access-control-allow-origin': '*' };
let db, lib;
test.beforeEach(async ({ request, page }) => {
  db = rest(request, await signIn(request));
  lib = new LibraryPage(page);
  await lib.goto();
});
test.afterEach(async () => { await db.deleteE2EBooks(); });

const heading = (page, name) => page.getByRole('heading', { name });

test.describe('library and navigation', () => {
  test('the saved session opens the library with the staging banner, and no sideways scroll', async ({ page }) => {
    await expect(lib.shelves.all).toHaveAttribute('aria-pressed', 'true');
    await expect(lib.controls.search).toBeVisible();
    await expectNoSideScroll(page, 'library');
  });

  test('Oracle, + Inscribe and Codex respond to a tap and are at least 44 x 44', async ({ page }) => {
    for (const tab of [lib.sections.oracle, lib.sections.inscribe, lib.sections.codex]) {
      await expect(tab).toBeInViewport();
    }
    expect(await smallTargets(page, 'nav[aria-label="Sections"], nav[aria-label="Shelves"]')).toEqual([]);

    await press(lib.sections.oracle);
    await expect(heading(page, 'The Oracle')).toBeVisible();
    await expect(lib.sections.oracle).toHaveAttribute('aria-current', 'page');

    await press(lib.sections.codex);
    await expect(heading(page, 'The Binding')).toBeVisible();
    await expect(lib.sections.codex).toHaveAttribute('aria-current', 'page');

    const inscribe = new InscribeModal(page);
    await press(lib.sections.inscribe);
    await expect(inscribe.dialog).toBeVisible();
    await press(inscribe.close);
    await expect(inscribe.dialog).toBeHidden();
  });

  test('no screen scrolls sideways: library, Oracle, Codex and Your Profile', async ({ page }) => {
    await expectNoSideScroll(page, 'library');
    await press(lib.sections.oracle);
    await expect(heading(page, 'The Oracle')).toBeVisible();
    await expectNoSideScroll(page, 'Oracle');
    await press(lib.sections.codex);
    await expect(heading(page, 'The Binding')).toBeVisible();
    await expectNoSideScroll(page, 'Codex');
    await press(lib.profile.chip);
    await expect(lib.profile.dialog).toBeVisible();
    await expectNoSideScroll(page, 'Your Profile');
    const panel = await lib.profile.dialog.evaluate((d) => {
      const p = d.firstElementChild;
      return { scroll: p.scrollWidth, client: p.clientWidth };
    });
    expect(panel.scroll, 'Your Profile panel scrolls sideways').toBeLessThanOrEqual(panel.client);
  });

  // R2-T1: the shelf controls were 22-38px tall at phone width. They sit above
  // <main>, in ControlsBar (the row holding the search box) and ArchiveSwitcher.
  test('the shelf controls (Covers, Spines, Sort, Search, Match all / any, trope chips, Clear) are at least 44 x 44', async ({ page }) => {
    // A book with a trope, so the trope row shows; one chip on, so Clear shows.
    await db.insertBook({ title: uniqueTitle('Phone Trope'), tropes: ['Slow Burn'] });
    await lib.goto();
    await press(lib.controls.tropeChip('Slow Burn'));
    await expect(lib.controls.clear).toBeVisible();
    await expect(lib.controls.matchAll).toBeVisible();
    const bar = 'div:has(> input[aria-label="Search the shelves"])';
    expect(await page.locator(bar).count()).toBe(1);
    expect(await smallTargets(page, bar)).toEqual([]);

    // The archive switcher and its list, when the reader belongs to an archive.
    if (await lib.shelves.archiveSwitcher.count()) {
      await press(lib.shelves.archiveSwitcher);
      await expect(lib.shelves.archiveList).toBeVisible();
      expect(await smallTargets(page, 'div:has(> div > button[aria-label="Choose which shelf to browse"])')).toEqual([]);
      await press(lib.shelves.archiveSwitcher);
    }
    await expectNoSideScroll(page, 'library with the trope row');
  });
});

test.describe('the Inscribe window', () => {
  test('opens from + Inscribe, fits the screen, and Close closes it', async ({ page }) => {
    const inscribe = new InscribeModal(page);
    await press(lib.sections.inscribe);
    await expect(inscribe.dialog).toBeVisible();
    // AddBookModal opens on Scan for a coarse pointer on a narrow screen, on Search otherwise.
    await expect(hasTouch() ? inscribe.scan : inscribe.scour).toHaveAttribute('aria-pressed', 'true');
    await press(inscribe.scour);
    await expect(inscribe.search).toBeVisible();
    const vp = page.viewportSize();
    const box = await inscribe.dialog.locator(':scope > div').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 0.5);
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 0.5);
    await expectNoSideScroll(page, 'Inscribe');
    // R2-T1: Close was 32 x 28.
    const close = await inscribe.close.boundingBox();
    expect(Math.min(close.width, close.height), 'Inscribe Close is under 44px').toBeGreaterThanOrEqual(44);
    await press(inscribe.close);
    await expect(inscribe.dialog).toBeHidden();
  });

  test('Escape from a hardware keyboard closes it', async ({ page }) => {
    const inscribe = new InscribeModal(page);
    await press(lib.sections.inscribe);
    await expect(inscribe.dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(inscribe.dialog).toBeHidden();
  });
});

test.describe('Your Profile', () => {
  test('opens from the chip, fits the screen, scrolls to its last control, and every control is at least 44 x 44', async ({ page }) => {
    await press(lib.profile.chip);
    const dialog = lib.profile.dialog;
    await expect(dialog).toBeVisible();
    // Wait for the archive list, so its rows are measured too.
    await expect(dialog.getByText('Opening…')).toHaveCount(0);
    const vp = page.viewportSize();
    const box = await dialog.locator(':scope > div').boundingBox();
    expect(box.y, 'panel top is off the screen').toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 0.5);
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 0.5);
    await expect(lib.profile.close).toBeInViewport();

    // The panel scrolls inside itself; its last control can be reached.
    await dialog.locator(':scope > div').evaluate((p) => { p.scrollTop = p.scrollHeight; });
    await expect(lib.profile.leave).toBeInViewport();
    expect(await smallTargets(page, '[role="dialog"]')).toEqual([]);

    await press(lib.profile.close);
    await expect(dialog).toBeHidden();
  });

  // R2-B1: on a phone the fixed staging badge covered the lower edge of
  // "Leave the archive" once the panel was scrolled to its end. The badge has
  // pointer-events:none, so elementFromPoint looks straight through it and
  // cannot see the overlap; compare the two boxes instead.
  test('scrolled to its end, the last control is not under the staging badge', async ({ page }) => {
    await press(lib.profile.chip);
    const dialog = lib.profile.dialog;
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Opening…')).toHaveCount(0);
    await dialog.locator(':scope > div').evaluate((p) => { p.scrollTop = p.scrollHeight; });
    await expect(lib.profile.leave).toBeInViewport();
    const m = await lib.profile.leave.evaluate((el) => {
      const badge = [...document.querySelectorAll('div')].find((d) => getComputedStyle(d).position === 'fixed' && /throwaway data/.test(d.textContent) && d.children.length === 0);
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { bottom: r.bottom, badgeTop: badge ? badge.getBoundingClientRect().top : null, hit: !!top && (top === el || el.contains(top)) };
    });
    expect(m.badgeTop, 'staging badge not found').not.toBeNull();
    expect(m.bottom, 'Leave the archive runs under the staging badge').toBeLessThanOrEqual(m.badgeTop);
    expect(m.hit, 'something else sits over the middle of Leave the archive').toBe(true);
  });

  test('from a hardware keyboard: Enter opens it, focus is inside, Escape closes it and focus returns to the chip', async ({ page }) => {
    await lib.profile.chip.focus();
    await page.keyboard.press('Enter');
    await expect(lib.profile.dialog).toBeVisible();
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(lib.profile.dialog).toBeHidden();
    await expect(lib.profile.chip).toBeFocused();
  });

  // R2-W1: Safari never focuses a tapped or clicked button, and Overlay took
  // its opener from document.activeElement, so in WebKit focus went to <body>
  // when the window closed. Overlay now falls back to the last pressed control.
  test('after a tap opens it and Close shuts it, focus is back on the chip', async ({ page }) => {
    await press(lib.profile.chip);
    await expect(lib.profile.dialog).toBeVisible();
    await press(lib.profile.close);
    await expect(lib.profile.dialog).toBeHidden();
    await expect(lib.profile.chip).toBeFocused({ timeout: 2000 });
  });
});

test.describe('The Oracle', () => {
  test.beforeEach(async ({ page }) => {
    await press(lib.sections.oracle);
    await expect(heading(page, 'The Oracle')).toBeVisible();
    // Open Library knows every pick it is asked about, so each one shows.
    await page.unroute(/openlibrary\.org/);
    await page.route(/openlibrary\.org\/search\.json/, (route) => {
      const u = new URL(route.request().url());
      const docs = [{ title: u.searchParams.get('title'), author_name: [u.searchParams.get('author')] }];
      return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ docs }) });
    });
  });

  async function oracleSays(page, titles) {
    const text = titles.map((title) => JSON.stringify({ title, author: 'Oracle Writer', genre: 'Gothic romantasy', reason: 'Fits.', spice: 2 })).join('\n');
    const calls = [];
    await page.unroute('**/api/claude');
    await page.route('**/api/claude', (route) => {
      calls.push(route.request().url());
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text }] }) });
    });
    return calls;
  }
  const wishlistButton = (page, title) => page.getByRole('button', { name: `+ Wishlist: ${title}` });

  test('a tap on Consult shows the picks, announces them once, and + Wishlist saves one row and moves focus on', async ({ page }) => {
    const [first, second] = [uniqueTitle('Phone A'), uniqueTitle('Phone B')];
    const calls = await oracleSays(page, [first, second]);
    const consult = page.getByRole('button', { name: /Consult the Oracle/ });
    await press(consult);

    const list = page.getByRole('list', { name: "The Oracle's picks" });
    await expect(list.getByRole('listitem')).toHaveCount(2);
    await expect(page.locator('main').getByRole('status').filter({ hasText: /picks? from the Oracle/ })).toHaveText('2 picks from the Oracle.');
    expect(calls).toHaveLength(1);
    await expectNoSideScroll(page, 'Oracle with picks');
    expect(await smallTargets(page, 'main')).toEqual([]);

    await press(wishlistButton(page, first));
    await expect(wishlistButton(page, first)).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: 'is on your wishlist' })).toHaveText(`“${first}” is on your wishlist.`);
    // Focus is moved by script, which works the same in WebKit and Chromium.
    await expect(wishlistButton(page, second)).toBeFocused();

    await expect.poll(async () => (await db.booksByTitle(first)).length).toBe(1);
    await page.waitForTimeout(1000); // a late second insert would land here
    const rows = await db.booksByTitle(first);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ shelf: 'wishlist', author: 'Oracle Writer' });
  });

  test('two quick taps on + Wishlist save the book once', async ({ page }) => {
    const title = uniqueTitle('Phone Twice');
    await oracleSays(page, [title]);
    await press(page.getByRole('button', { name: /Consult the Oracle/ }));
    const add = wishlistButton(page, title);
    await expect(add).toBeVisible();
    await add.evaluate((b) => { b.click(); b.click(); });
    await expect(add).toHaveCount(0);
    await expect.poll(async () => (await db.booksByTitle(title)).length).toBe(1);
    await page.waitForTimeout(1000);
    expect(await db.booksByTitle(title)).toHaveLength(1);
  });
});

test.describe('The Binding (Codex)', () => {
  test('a tap on Upload Goodreads CSV, a file, the preview, then Bind saves the book and says so', async ({ page }) => {
    await press(lib.sections.codex);
    await expect(heading(page, 'The Binding')).toBeVisible();
    expect(await smallTargets(page, 'main')).toEqual([]);

    const title = uniqueTitle('Phone Bound');
    const csv = ['Title,Author,My Rating,Exclusive Shelf', `${title},Ada Thorn,4,read`].join('\n');
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      press(page.getByRole('button', { name: 'Upload Goodreads CSV' })),
    ]);
    await chooser.setFiles({ name: 'goodreads.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });

    await expect(page.getByText(/choose what to bind/)).toBeFocused();
    await expect(page.locator('main').getByText(title)).toBeVisible();
    await expectNoSideScroll(page, 'Codex preview');
    expect(await smallTargets(page, 'main')).toEqual([]);

    await press(page.getByRole('button', { name: /^Bind 1 to the archive/ }));
    await expect(page.locator('main').getByRole('status').filter({ hasText: 'Bound 1 book' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload My Clippings.txt' })).toBeFocused();
    const rows = await db.booksByTitle(title);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ author: 'Ada Thorn', read: true, overall: 4 });
  });
});

test.describe('a book window', () => {
  test('opens from its card, a tap on Verdict 3 saves 3, and Close closes it', async ({ page }) => {
    const title = uniqueTitle('Phone Rate');
    await db.insertBook({ title });
    await lib.goto();
    await press(lib.card(title));
    const panel = new DetailPanel(page, title);
    await expect(panel.dialog).toBeVisible();
    await expectNoSideScroll(page, 'book window');

    await press(panel.verdict(3));
    await expect.poll(async () => (await db.booksByTitle(title))[0].overall).toBe(3);

    await press(panel.close);
    await expect(panel.dialog).toBeHidden();
  });

  // R2-T1: the Verdict and Smoulder icons were drawn at their own size with 2px
  // padding, below 44px. Each button is now a 44 x 44 hit area around the icon.
  test('the Verdict and Smoulder buttons are at least 44 x 44', async ({ page }) => {
    const title = uniqueTitle('Phone Size');
    await db.insertBook({ title });
    await lib.goto();
    await press(lib.card(title));
    const panel = new DetailPanel(page, title);
    for (const n of [1, 5]) {
      for (const b of [panel.verdict(n), panel.smoulder(n)]) {
        const box = await b.boundingBox();
        expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
      }
    }
    await expectNoSideScroll(page, 'book window');
  });
});
