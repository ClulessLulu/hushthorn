// Phone and Safari helpers. Projects with touch (mobile-safari, mobile-chrome)
// tap; the others click. Used by mobile.spec.js.
import { test, expect } from '@playwright/test';

export const hasTouch = () => !!test.info().project.use.hasTouch;

// Tap on a touch project, click elsewhere, so one test runs in every project.
export const press = (locator) => (hasTouch() ? locator.tap() : locator.click());

// Safari (WebKit) does not focus a button on tap or click, unlike Chromium.
export const isWebKit = () => test.info().project.use.defaultBrowserType === 'webkit';

// The page must not scroll sideways (CLAUDE.md section 6: layout holds at 390px).
export async function expectNoSideScroll(page, where) {
  const m = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(m.scroll, `${where}: page is ${m.scroll}px wide in a ${m.client}px viewport`).toBeLessThanOrEqual(m.client);
}

// Every visible control inside `rootSelector` that is smaller than 44 x 44 CSS px
// (CLAUDE.md section 6). A checkbox or radio inside a <label> is measured by its
// label, because the whole label is the target. Screen-reader-only text is skipped.
export async function smallTargets(page, rootSelector) {
  return page.evaluate((sel) => {
    const out = [];
    for (const root of document.querySelectorAll(sel)) {
      for (const el of root.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button], label')) {
        if (el.tagName === 'LABEL' && !el.querySelector('input[type=checkbox], input[type=radio]')) continue;
        if (el.tagName === 'INPUT' && /^(checkbox|radio)$/.test(el.type) && el.closest('label')) continue;
        if (el.closest('.sr-only')) continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
        if (r.width < 44 || r.height < 44) {
          const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().slice(0, 40);
          out.push(`${el.tagName.toLowerCase()} "${name}" ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
      }
    }
    return out;
  }, rootSelector);
}

// AddBookModal opens on "Scan or upload" for a coarse pointer on a screen up to
// 640px wide (a phone), on "Scour the grimoire" otherwise. Same rule here.
export const opensOnScan = (page) => hasTouch() && (page.viewportSize()?.width ?? 1280) <= 640;

// Make sure the Inscribe window shows the search box. A no-op on desktop.
export async function showSearch(page, dialog) {
  if (opensOnScan(page)) await press(dialog.getByRole('button', { name: 'Scour the grimoire' }));
}
