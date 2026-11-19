// One positive test per button on the signed-in library screen (section tabs, shelf
// filters, archive switcher, layout/sort/search/trope controls, profile), through the
// LibraryPage objects. Runs against staging as the shared test reader.
import { test, expect, signInThroughForm } from './helpers/app.js';
import { loadConfig } from './helpers/env.js';
import { signIn, rest, uniqueTitle } from './helpers/api.js';
import { LibraryPage } from './pages/LibraryPage.js';
import { InscribeModal } from './pages/InscribeModal.js';

let db, lib;
test.beforeEach(async ({ request, page }) => {
  db = rest(request, await signIn(request));
  lib = new LibraryPage(page);
});
test.afterEach(async () => { await db.deleteE2EBooks(); });

test.describe('section tabs', () => {
  test('Oracle opens The Oracle and is marked as the current section', async ({ page }) => {
    await lib.goto();
    await lib.sections.oracle.click();
    await expect(page.getByRole('heading', { name: 'The Oracle' })).toBeVisible();
    await expect(lib.sections.oracle).toHaveAttribute('aria-current', 'page');
  });

  test('Codex opens The Binding and is marked as the current section', async ({ page }) => {
    await lib.goto();
    await lib.sections.codex.click();
    await expect(page.getByRole('heading', { name: 'The Binding' })).toBeVisible();
    await expect(lib.sections.codex).toHaveAttribute('aria-current', 'page');
  });

  test('+ Inscribe opens the Inscribe window and reports it as open', async () => {
    await lib.goto();
    const inscribe = new InscribeModal(lib.page);
    await expect(lib.sections.inscribe).toHaveAttribute('aria-haspopup', 'dialog');
    await lib.sections.inscribe.click();
    await expect(inscribe.dialog).toBeVisible();
    await expect(lib.sections.inscribe).toHaveAttribute('aria-expanded', 'true');
    await inscribe.close.click();
    await expect(lib.sections.inscribe).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('shelf filters', () => {
  // Four books with one shared tag, so the search box can isolate them from the
  // other books on the staging account. Each filter must keep exactly its own.
  let tag, t;
  test.beforeEach(async () => {
    tag = uniqueTitle('Shelf');
    t = { own: `${tag} Own`, wish: `${tag} Wish`, done: `${tag} Done`, aud: `${tag} Aud` };
    await db.insertBook({ title: t.own, shelf: 'owned', read: false });
    await db.insertBook({ title: t.wish, shelf: 'wishlist', read: false });
    await db.insertBook({ title: t.done, shelf: 'owned', read: true });
    await db.insertBook({ title: t.aud, shelf: 'owned', read: false, formats: ['audio'] });
    await lib.goto();
    await lib.controls.search.fill(tag);
  });

  const expectShown = async (shown) => {
    for (const [key, title] of Object.entries(t)) {
      await expect(lib.card(title), `${key} should be ${shown.includes(key) ? 'shown' : 'hidden'}`)
        .toHaveCount(shown.includes(key) ? 1 : 0);
    }
  };

  test('All shows every book and is pressed by default', async () => {
    await expect(lib.shelves.all).toHaveAttribute('aria-pressed', 'true');
    await expectShown(['own', 'wish', 'done', 'aud']);
  });
  test('Owned shows only owned books', async () => {
    await lib.shelves.owned.click();
    await expect(lib.shelves.owned).toHaveAttribute('aria-pressed', 'true');
    await expectShown(['own', 'done', 'aud']);
  });
  test('Wishlist shows only wishlist books', async () => {
    await lib.shelves.wishlist.click();
    await expect(lib.shelves.wishlist).toHaveAttribute('aria-pressed', 'true');
    await expectShown(['wish']);
  });
  test('Read shows only books marked read', async () => {
    await lib.shelves.read.click();
    await expect(lib.shelves.read).toHaveAttribute('aria-pressed', 'true');
    await expectShown(['done']);
  });
  test('Unread shows only books not yet read', async () => {
    await lib.shelves.unread.click();
    await expect(lib.shelves.unread).toHaveAttribute('aria-pressed', 'true');
    await expectShown(['own', 'wish', 'aud']);
  });
  test('Audio shows only books with an audio edition', async () => {
    await lib.shelves.audio.click();
    await expect(lib.shelves.audio).toHaveAttribute('aria-pressed', 'true');
    await expectShown(['aud']);
  });
});

test.describe('archive switcher', () => {
  test('opens the list of shelves and closes again on a second press', async () => {
    await lib.goto();
    await expect(lib.shelves.archiveSwitcher).toHaveAttribute('aria-expanded', 'false');
    await lib.shelves.archiveSwitcher.click();
    await expect(lib.shelves.archiveSwitcher).toHaveAttribute('aria-expanded', 'true');
    await expect(lib.shelves.archiveList).toBeVisible();
    await lib.shelves.archiveSwitcher.click();
    await expect(lib.shelves.archiveList).toBeHidden();
  });

  test('choosing My library from the list closes it and keeps the personal shelf', async () => {
    await lib.goto();
    await lib.shelves.archiveSwitcher.click();
    await lib.shelves.archiveList.getByRole('option').first().click();
    await expect(lib.shelves.archiveList).toBeHidden();
    await expect(lib.controls.search).toBeVisible();
  });
});

test.describe('shelf controls', () => {
  test('Covers shows the cover grid', async () => {
    await lib.goto();
    await lib.controls.spines.click();
    await lib.controls.covers.click();
    await expect(lib.page.locator('.ht-cathedral-back')).toHaveCount(0);
  });

  // A card's swords and candles used to be disabled buttons inside the card's own
  // button: invalid HTML, and React logged validateDOMNesting. Now they are one image each.
  test('a cover card reads its ratings out, with no button nested inside the card', async ({ page }) => {
    const warnings = [];
    page.on('console', (m) => { if (/validateDOMNesting|cannot appear as a descendant/.test(m.text())) warnings.push(m.text()); });
    const title = uniqueTitle('Rated');
    await db.insertBook({ title, overall: 3, smut: 2 });
    await lib.goto();
    const card = lib.card(title);
    await expect(card.getByRole('img', { name: 'Verdict: 3 of 5' })).toBeVisible();
    await expect(card.getByRole('img', { name: 'Smoulder: 2 of 5' })).toBeVisible();
    await expect(card.getByRole('button')).toHaveCount(0);
    expect(warnings).toEqual([]);
  });

  test('Spines shows the cathedral spine shelf', async () => {
    await lib.goto();
    await lib.controls.spines.click();
    await expect(lib.page.locator('.ht-cathedral-back').first()).toBeVisible();
    await lib.controls.covers.click(); // put the layout back for the next test
    await expect.poll(async () => (await db.getPrefs()).pref_layout).toBe('grid');
  });

  test('Sort the shelves: By title puts the A book before the B book', async () => {
    const tag = uniqueTitle('Sort');
    await db.insertBook({ title: `${tag} A` });
    await db.insertBook({ title: `${tag} B` }); // newest, so first under "Recently inscribed"
    await lib.goto();
    await lib.controls.search.fill(tag);
    await expect(lib.card(tag).first()).toContainText(`${tag} B`);
    await lib.controls.sort.selectOption({ label: 'By title' });
    await expect(lib.card(tag).first()).toContainText(`${tag} A`);
    await lib.controls.sort.selectOption({ label: 'Recently inscribed' });
  });

  test('Search the shelves narrows the grid to the matching book', async () => {
    const title = uniqueTitle('Find');
    await db.insertBook({ title });
    await lib.goto();
    await lib.controls.search.fill(title);
    await expect(lib.card(title)).toHaveCount(1);
    await expect(lib.page.locator('main button').filter({ hasText: 'The Hobbit' })).toHaveCount(0);
  });

  test.describe('trope filter', () => {
    let a, b;
    test.beforeEach(async () => {
      const tag = uniqueTitle('Trope');
      a = `${tag} A`; b = `${tag} B`;
      await db.insertBook({ title: a, tropes: ['Slow Burn'] });
      await db.insertBook({ title: b, tropes: ['Fated Mates'] });
      await lib.goto();
      await lib.controls.search.fill(tag);
    });

    test('a trope chip filters to books that carry it', async () => {
      await lib.controls.tropeChip('Slow Burn').click();
      await expect(lib.controls.tropeChip('Slow Burn')).toHaveAttribute('aria-pressed', 'true');
      await expect(lib.card(a)).toHaveCount(1);
      await expect(lib.card(b)).toHaveCount(0);
    });

    test('Match any keeps books that carry either chosen trope', async () => {
      await lib.controls.tropeChip('Slow Burn').click();
      await lib.controls.tropeChip('Fated Mates').click();
      await lib.controls.matchAny.click();
      await expect(lib.card(a)).toHaveCount(1);
      await expect(lib.card(b)).toHaveCount(1);
    });

    test('Match all keeps only books that carry every chosen trope', async () => {
      await lib.controls.tropeChip('Slow Burn').click();
      await lib.controls.tropeChip('Fated Mates').click();
      await lib.controls.matchAny.click();
      await lib.controls.matchAll.click();
      await expect(lib.card(a)).toHaveCount(0);
      await expect(lib.card(b)).toHaveCount(0);
    });

    test('Clear removes the chosen tropes and brings the books back', async () => {
      await lib.controls.tropeChip('Slow Burn').click();
      await expect(lib.card(b)).toHaveCount(0);
      await lib.controls.clear.click();
      await expect(lib.controls.tropeChip('Slow Burn')).toHaveAttribute('aria-pressed', 'false');
      await expect(lib.card(b)).toHaveCount(1);
    });
  });

  test('✦ Curiosities opens the list of what the archive has shown, and closes it again', async () => {
    await lib.goto();
    await expect(lib.controls.curiosities).toHaveAttribute('aria-expanded', 'false');
    await lib.controls.curiosities.click();
    await expect(lib.controls.curiosities).toHaveAttribute('aria-expanded', 'true');
    await expect(lib.page.getByText('What the archive has shown you')).toBeVisible();
    await lib.controls.curiosities.click();
    await expect(lib.page.getByText('What the archive has shown you')).toBeHidden();
  });
});

test.describe('profile', () => {
  test('the profile chip opens Your Profile and Close closes it', async () => {
    await lib.goto();
    await lib.profile.chip.click();
    await expect(lib.profile.dialog).toBeVisible();
    await lib.profile.close.click();
    await expect(lib.profile.dialog).toBeHidden();
  });

  // The sign-out request is answered locally: a real one would revoke the saved
  // test session that every other test in this run relies on.
  test('Leave the archive returns to the sign-in page and removes Your Profile', async ({ page }) => {
    await page.route('**/auth/v1/logout*', (route) => route.fulfill({ status: 204, body: '' }));
    await lib.goto();
    await lib.profile.chip.click();
    await expect(lib.profile.dialog).toBeVisible();
    await lib.profile.leave.click();
    await expect(page.getByRole('button', { name: 'Enter the Archive' })).toBeVisible();
    // Gone, not just hidden behind the sign-in page: it stayed mounted before the fix.
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('signing back in shows the library with Your Profile closed', async ({ page }) => {
    await page.route('**/auth/v1/logout*', (route) => route.fulfill({ status: 204, body: '' }));
    await lib.goto();
    await lib.profile.chip.click();
    await lib.profile.leave.click();
    await expect(page.getByRole('button', { name: 'Enter the Archive' })).toBeVisible();

    await signInThroughForm(page, loadConfig().alpha);
    await expect(lib.shelves.root).toBeVisible();
    await expect(lib.controls.search).toBeVisible();
    await expect(lib.profile.dialog).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(lib.sections.oracle).not.toHaveAttribute('aria-current', 'page');
    await expect(lib.sections.codex).not.toHaveAttribute('aria-current', 'page');
  });
});

// Signing out in another tab of the same browser reaches the first tab as a
// SIGNED_OUT event while one of its windows is open: the only UI route to "signed
// out with a book window or Inscribe open" (those windows cover the profile chip).
test.describe('signed out from another tab while a window is open', () => {
  async function signOutInSecondTab(page) {
    const other = await page.context().newPage();
    await other.route('**/auth/v1/logout*', (route) => route.fulfill({ status: 204, body: '' }));
    const otherLib = new LibraryPage(other);
    await otherLib.goto();
    await otherLib.profile.chip.click();
    await otherLib.profile.leave.click();
    await expect(other.getByRole('button', { name: 'Enter the Archive' })).toBeVisible();
    await other.close();
  }

  test('a book window is removed, and the next sign-in shows the library without it', async ({ page }) => {
    const title = uniqueTitle('SignOut');
    await db.insertBook({ title, genres: ['Fantasy'], tropes: [] });
    await lib.goto();
    await lib.card(title).click();
    await expect(lib.detail(title)).toBeVisible();

    await signOutInSecondTab(page);
    await expect(page.getByRole('button', { name: 'Enter the Archive' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await signInThroughForm(page, loadConfig().alpha);
    await expect(lib.shelves.root).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('the Inscribe window is removed, and the next sign-in shows the library without it', async ({ page }) => {
    await lib.goto();
    const inscribe = new InscribeModal(page);
    await lib.sections.inscribe.click();
    await expect(inscribe.dialog).toBeVisible();

    await signOutInSecondTab(page);
    await expect(page.getByRole('button', { name: 'Enter the Archive' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await signInThroughForm(page, loadConfig().alpha);
    await expect(lib.shelves.root).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(lib.sections.inscribe).toHaveAttribute('aria-expanded', 'false');
  });
});
