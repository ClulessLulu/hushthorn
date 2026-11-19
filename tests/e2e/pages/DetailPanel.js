// Page object: one book's window (click a card).
// Buttons: Close, Move to Wishlist / Mark as Owned, Mark as Read / Unread, Banish from the
// archive, Verdict 1-5, Smoulder 1-5, Add genre, Remove genre, Browse all tropes,
// trope chips, Divine tropes, Snap to update, 25%, 50%, Done, Print / Ebook / Audio,
// Page / Time, Speak a note, Inscribe note, Strike out, Save & Close, Discard changes.
export class DetailPanel {
  constructor(page, title) {
    this.page = page;
    this.dialog = page.getByRole('dialog', { name: title });
    const button = (name, opts = {}) => this.dialog.getByRole('button', { name, ...opts });
    this.close = button('Close');
    this.toWishlist = button('Move to Wishlist');
    this.toOwned = button('Mark as Owned');
    this.markRead = button('Mark as Read');
    this.markUnread = button('Mark Unread');
    this.banish = button('Banish from the archive');
    this.saveAndClose = button('Save & Close');
    this.discard = button('Discard changes');
    this.genreInput = this.dialog.getByPlaceholder('Add a genre…');
    this.addGenre = button('Add', { exact: true });
    this.browseTropes = button(/Browse all tropes/);
    this.closeTropeIndex = button(/Close the index/);
    this.divineTropes = button(/Divine tropes/i);
    this.snap = button(/Snap to update/);
    this.quarter = button('25%', { disabled: false });
    this.half = button('50%', { disabled: false });
    this.done = button('Done', { exact: true, disabled: false });
    this.print = button('Print');
    this.ebook = button('Ebook');
    this.audio = button('Audio', { exact: true });
    this.pageTab = button('Page', { exact: true });
    this.timeTab = button(/Time/);
    this.apply = button('Apply', { exact: true });
    this.retry = button('Retry', { exact: true });
    this.enterByHand = button('Enter by hand');
    this.speak = button(/Speak a note|Listening/); // the label changes while recording
    this.inscribeNote = button('Inscribe note');
    this.noteText = this.dialog.getByPlaceholder(/Write or speak/);
    this.notePage = this.dialog.getByRole('textbox', { name: 'Page', exact: true });
  }

  verdict(n) { return this.dialog.getByRole('button', { name: `Verdict: ${n} of 5` }); }
  smoulder(n) { return this.dialog.getByRole('button', { name: `Smoulder: ${n} of 5` }); }
  removeGenre(g) { return this.dialog.getByRole('button', { name: `Remove genre ${g}` }); }
  tropeChip(name) { return this.dialog.getByRole('button', { name, exact: true }); }
  strikeOut() { return this.dialog.getByRole('button', { name: /strike out/i }).first(); }
}
