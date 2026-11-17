// The buttons: section tabs, shelf filters, layout switch, shelf search, modal.
import { test, expect, gotoLibrary, sections, shelves } from './helpers/app.js';
import { signIn, rest, uniqueTitle } from './helpers/api.js';

test.describe('section tabs and shelf filters', () => {
  test('Oracle and Codex open their screens; a shelf filter returns to the library', async ({ page }) => {
    await gotoLibrary(page);
    const oracle = sections(page).getByRole('button', { name: 'Oracle' });
    const codex = sections(page).getByRole('button', { name: 'Codex' });

    await oracle.click();
    await expect(page.getByRole('heading', { name: 'The Oracle' })).toBeVisible();
    await expect(oracle).toHaveAttribute('aria-current', 'page');

    await codex.click();
    await expect(page.getByRole('heading', { name: 'The Binding' })).toBeVisible();
    await expect(codex).toHaveAttribute('aria-current', 'page');
    await expect(oracle).not.toHaveAttribute('aria-current', 'page');

    await shelves(page).getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.getByPlaceholder('Search the shelves…')).toBeVisible();
    await expect(codex).not.toHaveAttribute('aria-current', 'page');
  });

  test('Owned and Wishlist filters show only their own books', async ({ page, request }) => {
    const db = rest(request, await signIn(request));
    try {
      await db.insertBook({ title: uniqueTitle('Own'), shelf: 'owned' });
      await db.insertBook({ title: uniqueTitle('Want'), shelf: 'wishlist' });
      await gotoLibrary(page);
      const badge = (text) => page.locator('main').getByText(text, { exact: true });
      const owned = shelves(page).getByRole('button', { name: 'Owned', exact: true });
      const wishlist = shelves(page).getByRole('button', { name: 'Wishlist', exact: true });

      await owned.click();
      await expect(owned).toHaveAttribute('aria-pressed', 'true');
      await expect(badge('Owned').first()).toBeVisible();
      await expect(badge('Wishlist')).toHaveCount(0);

      await wishlist.click();
      await expect(wishlist).toHaveAttribute('aria-pressed', 'true');
      await expect(owned).toHaveAttribute('aria-pressed', 'false');
      await expect(badge('Wishlist').first()).toBeVisible();
      await expect(badge('Owned')).toHaveCount(0);
    } finally {
      await db.deleteE2EBooks();
    }
  });
});

test.describe('shelf controls', () => {
  test('Spines / Covers switches the layout and is remembered after a reload', async ({ page, request }) => {
    const db = rest(request, await signIn(request));
    try {
      await gotoLibrary(page);
      await page.getByRole('button', { name: /Spines/ }).click();
      await expect(page.locator('.ht-cathedral-back').first()).toBeVisible();
      await expect.poll(async () => (await db.getPrefs()).pref_layout).toBe('spines');

      await page.reload();
      await expect(page.locator('.ht-cathedral-back').first()).toBeVisible();

      await page.getByRole('button', { name: /Covers/ }).click();
      await expect(page.locator('.ht-cathedral-back')).toHaveCount(0);
      await expect.poll(async () => (await db.getPrefs()).pref_layout).toBe('grid');
    } finally {
      await db.setPrefs({ pref_layout: 'grid' });
    }
  });

  test('searching the shelves for nothing shows the empty message with a way out', async ({ page }) => {
    await gotoLibrary(page);
    await page.getByPlaceholder('Search the shelves…').fill('zzqx-no-such-tome');
    await expect(page.getByText('This shelf lies bare.')).toBeVisible();
    await expect(page.getByText('Loose the search to see the shelf.', { exact: false })).toBeVisible();
    await page.getByPlaceholder('Search the shelves…').fill('');
    await expect(page.getByText('This shelf lies bare.')).toBeHidden();
  });
});

test.describe('the Inscribe window', () => {
  test('+ Inscribe opens it, the two methods switch, and Close closes it', async ({ page }) => {
    await gotoLibrary(page);
    await sections(page).getByRole('button', { name: '+ Inscribe' }).click();
    const dialog = page.getByRole('dialog', { name: 'Inscribe' });
    await expect(dialog).toBeVisible();

    const search = dialog.getByRole('button', { name: 'Scour the grimoire' });
    const scan = dialog.getByRole('button', { name: 'Scan or upload' });
    await expect(search).toHaveAttribute('aria-pressed', 'true');
    await scan.click();
    await expect(scan).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByRole('button', { name: /Upload a photo/ })).toBeVisible();
    await search.click();
    await expect(dialog.getByPlaceholder('Search by title or author…')).toBeVisible();

    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
  });

  // KNOWN GAP, found 2026-11-13: Overlay has no Escape handler, so Esc does
  // nothing. tests/manual-test-tracker.md expects it to close. Remove `.fixme`
  // when Overlay handles Escape; this test then guards it.
  test.fixme('Esc closes the Inscribe window', async ({ page }) => {
    await gotoLibrary(page);
    await sections(page).getByRole('button', { name: '+ Inscribe' }).click();
    const dialog = page.getByRole('dialog', { name: 'Inscribe' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});
