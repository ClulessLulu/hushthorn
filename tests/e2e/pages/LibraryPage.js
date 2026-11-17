// Page object: the signed-in library screen. Four regions, one class each:
//   SectionsNav  Oracle, + Inscribe, Codex
//   ShelvesNav   All, Owned, Wishlist, Read, Unread, Audio, and the archive switcher
//   ControlsBar  Covers, Spines, Sort, Search, Match all / any, trope chips, Clear, Curiosities
//   ProfileChip  the avatar chip, and the "Your Profile" window it opens
// LibraryPage ties them together and finds book cards.
import { expect } from '@playwright/test';
import { expectStaging } from '../helpers/app.js';

export class SectionsNav {
  constructor(page) {
    this.root = page.getByRole('navigation', { name: 'Sections' });
    this.oracle = this.root.getByRole('button', { name: 'Oracle' });
    this.inscribe = this.root.getByRole('button', { name: '+ Inscribe' });
    this.codex = this.root.getByRole('button', { name: 'Codex' });
  }
}

export class ShelvesNav {
  constructor(page) {
    this.root = page.getByRole('navigation', { name: 'Shelves' });
    const filter = (name) => this.root.getByRole('button', { name, exact: true });
    this.all = filter('All');
    this.owned = filter('Owned');
    this.wishlist = filter('Wishlist');
    this.read = filter('Read');
    this.unread = filter('Unread');
    this.audio = this.root.getByRole('button', { name: /Audio/ });
    // The archive switcher sits above the nav, not inside it.
    this.archiveSwitcher = page.getByRole('button', { name: 'Choose which shelf to browse' });
    this.archiveList = page.getByRole('listbox', { name: 'Choose which shelf to browse' });
  }
}

export class ControlsBar {
  constructor(page) {
    this.covers = page.getByRole('button', { name: /Covers/ });
    this.spines = page.getByRole('button', { name: /Spines/ });
    this.sort = page.getByLabel('Sort the shelves');
    this.search = page.getByPlaceholder('Search the shelves…');
    this.matchAll = page.getByRole('button', { name: 'Match all' });
    this.matchAny = page.getByRole('button', { name: 'Match any' });
    this.clear = page.getByRole('button', { name: 'Clear', exact: true });
    this.curiosities = page.getByRole('button', { name: /Curiosities/ });
    this.page = page;
  }
  // A trope chip reads "Slow Burn 4": the name, then how many books carry it.
  tropeChip(name) {
    return this.page.getByRole('button', { name: new RegExp(`^${name} \\d+$`, 'i') });
  }
}

export class ProfileChip {
  constructor(page) {
    this.chip = page.locator('header button').first();
    this.dialog = page.getByRole('dialog', { name: 'Your Profile' });
    this.close = this.dialog.getByRole('button', { name: 'Close' });
    this.leave = this.dialog.getByRole('button', { name: 'Leave the archive', exact: true });
  }
}

export class LibraryPage {
  constructor(page) {
    this.page = page;
    this.sections = new SectionsNav(page);
    this.shelves = new ShelvesNav(page);
    this.controls = new ControlsBar(page);
    this.profile = new ProfileChip(page);
  }

  // Open the library in the Covers layout, the layout these tests read.
  async goto() {
    await this.page.goto('/');
    await expect(this.shelves.root).toBeVisible();
    await expectStaging(this.page);
    await this.controls.covers.click();
    await expect(this.page.getByText('The archive stirs…')).toBeHidden();
  }

  // A book card is the one button that carries the title text.
  card(title) {
    return this.page.locator('main button').filter({ hasText: title });
  }

  detail(title) {
    return this.page.getByRole('dialog', { name: title });
  }
}
