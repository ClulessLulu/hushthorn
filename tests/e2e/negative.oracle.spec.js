// Negative cases for The Oracle (AI recommendations): the scribe down or talking
// nonsense, broken entries in an otherwise good reply, books already on the shelves,
// cover lookups down, a refused wishlist save, and an impatient double press.
// The AI endpoint is stubbed per test; it is off (503) by default, as in every spec.
import { test, expect } from './helpers/app.js';
import { signIn, rest, uniqueTitle } from './helpers/api.js';
import { LibraryPage } from './pages/LibraryPage.js';

let db, lib, page;
test.beforeEach(async ({ request, page: p }) => {
  page = p;
  db = rest(request, await signIn(request));
  lib = new LibraryPage(page);
  await lib.goto();
  await lib.sections.oracle.click();
  await expect(page.getByRole('heading', { name: 'The Oracle' })).toBeVisible();
});
test.afterEach(async () => { await db.deleteE2EBooks(); });

const consult = () => page.getByRole('button', { name: /Consult the Oracle/ });
const clouded = () => page.getByText("The Oracle's vision clouded over. Try consulting again.");
const recCards = () => page.locator('main .ht-card').filter({ has: page.getByRole('button', { name: '+ Wishlist' }) });
const rec = (title, extra = {}) => ({ title, author: 'Oracle Writer', genre: 'Gothic romantasy', reason: 'Fits.', spice: 3, ...extra });
// Answer the AI endpoint with this text; returns a counter of calls made.
function oracleSays(text) {
  const calls = { n: 0 };
  page.unroute('**/api/claude');
  page.route('**/api/claude', (route) => {
    calls.n++;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text }] }) });
  });
  return calls;
}

test.describe('the scribe cannot answer', () => {
  test('scribe unreachable: says the vision clouded, and the button works again', async () => {
    await consult().click();
    await expect(clouded()).toBeVisible();
    await expect(consult()).toBeEnabled();
  });

  test('a reply that is not JSON: same plain message', async () => {
    oracleSays('The stars are silent tonight.');
    await consult().click();
    await expect(clouded()).toBeVisible();
    await expect(recCards()).toHaveCount(0);
  });

  test('an empty list: same plain message, no blank cards', async () => {
    oracleSays('[]');
    await consult().click();
    await expect(clouded()).toBeVisible();
    await expect(recCards()).toHaveCount(0);
  });
});

test.describe('a reply with problems inside it', () => {
  test('entries with no title (null, empty object) are not shown as blank cards', async () => {
    const good = uniqueTitle('Good');
    oracleSays(JSON.stringify([null, {}, { author: 'Nameless' }, rec(good)]));
    await consult().click();
    await expect(page.getByText(good)).toBeVisible();
    await expect(recCards()).toHaveCount(1);
  });

  test('odd spice values and missing fields still render, with no page error', async () => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const a = uniqueTitle('Spice99'), b = uniqueTitle('SpiceWord');
    oracleSays(JSON.stringify([rec(a, { spice: 99 }), { title: b, spice: 'very' }]));
    await consult().click();
    await expect(page.getByText(a)).toBeVisible();
    await expect(page.getByText(b)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a book already on the shelves is not recommended, even in other capitals', async () => {
    const have = uniqueTitle('Have'), fresh = uniqueTitle('Fresh');
    await db.insertBook({ title: have });
    await page.reload();
    await lib.sections.oracle.click();
    oracleSays(JSON.stringify([rec(have.toUpperCase()), rec(fresh)]));
    await consult().click();
    await expect(page.getByText(fresh)).toBeVisible();
    await expect(page.getByText(have.toUpperCase())).toHaveCount(0);
  });

  test('only five are shown; the rest wait in reserve and slide up when one is added', async () => {
    const titles = Array.from({ length: 7 }, (_, i) => uniqueTitle(`Rec${i}`));
    oracleSays(JSON.stringify(titles.map((t) => rec(t))));
    await consult().click();
    await expect(recCards()).toHaveCount(5);
    await expect(page.getByText(titles[5])).toHaveCount(0);
    await recCards().filter({ hasText: titles[0] }).getByRole('button', { name: '+ Wishlist' }).click();
    await expect(page.getByText(titles[5])).toBeVisible();
    await expect.poll(async () => (await db.booksByTitle(titles[0]))[0]?.shelf).toBe('wishlist');
  });
});

test.describe('around the reply', () => {
  test('cover lookups down: recommendations still appear, with the crown placeholder', async () => {
    const title = uniqueTitle('NoCover');
    await page.unroute(/openlibrary\.org/);
    await page.route(/openlibrary\.org/, (route) => route.abort());
    oracleSays(JSON.stringify([rec(title)]));
    await consult().click();
    await expect(page.getByText(title)).toBeVisible();
    await expect(recCards().first().getByText('♛')).toBeVisible();
  });

  test('a refused wishlist save says so and keeps the recommendation', async () => {
    const title = uniqueTitle('RefusedRec');
    oracleSays(JSON.stringify([rec(title)]));
    await consult().click();
    await page.route('**/rest/v1/books*', (route) => route.request().method() === 'POST'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"e2e"}' })
      : route.fallback());
    await recCards().first().getByRole('button', { name: '+ Wishlist' }).click();
    await expect(page.getByRole('alert')).toContainText('could not be saved');
    await expect(recCards().filter({ hasText: title })).toHaveCount(1); // still offered
    expect(await db.booksByTitle(title)).toHaveLength(0);
  });

  test('the list shows before slow cover lookups finish', async () => {
    const title = uniqueTitle('Quick');
    await page.unroute(/openlibrary\.org/);
    let release;
    const held = new Promise((r) => { release = r; });
    await page.route(/openlibrary\.org/, async (route) => { await held; return route.fulfill({ status: 200, contentType: 'application/json', body: '{"docs":[]}' }); });
    oracleSays(JSON.stringify([rec(title)]));
    await consult().click();
    await expect(page.getByText(title)).toBeVisible({ timeout: 3000 }); // covers still held
    release();
  });

  test('Consult again tells the scribe what it already suggested', async () => {
    const first = uniqueTitle('First');
    const prompts = [];
    await page.unroute('**/api/claude');
    await page.route('**/api/claude', (route) => {
      prompts.push(route.request().postDataJSON().messages[0].content);
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify([rec(prompts.length === 1 ? first : uniqueTitle('Second'))]) }] }) });
    });
    await consult().click();
    await expect(page.getByText(first)).toBeVisible();
    await consult().click();
    await expect.poll(() => prompts.length).toBe(2);
    expect(prompts[0]).not.toContain(first);
    expect(prompts[1]).toContain(`already suggested to this reader: ${first}`);
  });

  test('a streamed reply (one pick per line) is shown, and the Oracle asks for a stream', async () => {
    const a = uniqueTitle('StreamA'), b = uniqueTitle('StreamB');
    const sse = (text) => `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })}\n\n`;
    const lines = `${JSON.stringify(rec(a))}\n${JSON.stringify(rec(b))}\n`;
    let asked;
    await page.unroute('**/api/claude');
    await page.route('**/api/claude', (route) => {
      asked = route.request().postDataJSON();
      // Split mid-line on purpose: the half line must wait for its other half.
      return route.fulfill({ status: 200, contentType: 'text/event-stream',
        body: sse(lines.slice(0, 40)) + sse(lines.slice(40)) + 'event: message_stop\ndata: {"type":"message_stop"}\n\n' });
    });
    await consult().click();
    await expect(page.getByText(a)).toBeVisible();
    await expect(page.getByText(b)).toBeVisible();
    await expect(recCards()).toHaveCount(2);
    expect(asked.stream).toBe(true);
    expect(asked.model).toBe('claude-haiku-5-5');
  });

  test('a same-instant double press asks the scribe once', async () => {
    const calls = oracleSays(JSON.stringify([rec(uniqueTitle('Once'))]));
    await consult().evaluate((b) => { b.click(); b.click(); });
    await expect(recCards()).toHaveCount(1);
    expect(calls.n).toBe(1);
  });
});
