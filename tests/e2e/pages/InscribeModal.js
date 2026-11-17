// Page object: the Inscribe window (+ Inscribe).
// Buttons: Close, Scour the grimoire, Scan or upload, Add several (checkbox),
// + Owned, + Wishlist, Remove ... from the queue, Add N to the archive,
// Open the camera, Stop camera, Capture cover, Upload a photo, Scan another,
// Inscribe to Owned, Inscribe to Wishlist.
import { expect } from '@playwright/test';

export class InscribeModal {
  constructor(page) {
    this.page = page;
    this.dialog = page.getByRole('dialog', { name: 'Inscribe' });
    this.close = this.dialog.getByRole('button', { name: 'Close' });
    this.scour = this.dialog.getByRole('button', { name: 'Scour the grimoire' });
    this.scan = this.dialog.getByRole('button', { name: 'Scan or upload' });
    this.search = this.dialog.getByPlaceholder('Search by title or author…');
    this.addSeveral = this.dialog.getByRole('checkbox', { name: 'Add several' });
    this.openCamera = this.dialog.getByRole('button', { name: 'Open the camera' });
    this.stopCamera = this.dialog.getByRole('button', { name: 'Stop camera' });
    this.captureCover = this.dialog.getByRole('button', { name: /Capture cover/ });
    this.uploadPhoto = this.dialog.getByRole('button', { name: /Upload a photo/ });
    this.scanAnother = this.dialog.getByRole('button', { name: /Scan another/ });
    // The manual form shown after a scan (or when the scribe could not read the cover).
    this.title = this.dialog.getByPlaceholder('Title', { exact: true });
    this.author = this.dialog.getByPlaceholder('Author', { exact: true });
    this.inscribeToOwned = this.dialog.getByRole('button', { name: 'Inscribe to Owned' });
    this.inscribeToWishlist = this.dialog.getByRole('button', { name: 'Inscribe to Wishlist' });
  }

  async searchFor(title) {
    await this.search.fill(title);
    await expect(this.dialog.getByText(title).first()).toBeVisible();
  }

  // The result row for one title, so + Owned / + Wishlist hit the right book.
  result(title) {
    return this.dialog.locator('div').filter({ hasText: title }).filter({ has: this.page.getByRole('button', { name: '+ Owned' }) }).last();
  }

  // After a scan the review form has these. "Replace" swaps the photo, "Re-crop" reopens the crop.
  get replacePhoto() { return this.dialog.getByRole('button', { name: /Replace$/ }); }
  get recrop() { return this.dialog.getByRole('button', { name: /Re-crop/ }); }

  addToArchive(n) {
    return this.dialog.getByRole('button', { name: new RegExp(`Add ${n} to the archive`) });
  }

  removeFromQueue(title) {
    return this.dialog.getByRole('button', { name: `Remove ${title} from the queue` });
  }
}

// Page object: the "Adjust cover" window that opens right after a photo is chosen.
// Buttons: Skip - use as-is, Portrait, Landscape, Square, Free, Left 90, Right 90,
// Replace photo, Crop & use this cover.
export class CropModal {
  constructor(page) {
    this.page = page;
    this.heading = page.getByText('Adjust cover', { exact: true });
    this.skip = page.getByRole('button', { name: /Skip/ });
    this.portrait = page.getByRole('button', { name: 'Portrait' });
    this.landscape = page.getByRole('button', { name: 'Landscape' });
    this.square = page.getByRole('button', { name: 'Square' });
    this.free = page.getByRole('button', { name: 'Free' });
    this.rotateLeft = page.getByRole('button', { name: /Left 90°/ });
    this.rotateRight = page.getByRole('button', { name: /Right 90°/ });
    this.replace = page.getByRole('button', { name: /Replace photo/ });
    this.cropAndUse = page.getByRole('button', { name: /Crop & use this cover/ });
  }
}
