// Sign in, sign up, forgot password. Starts signed out.
// Sign-in talks to real staging. Sign-up and reset are answered locally (see
// mockAuth) because the real calls send email; these prove what the PAGE does
// with each answer, not that Supabase delivers mail. Mail delivery and the
// "choose a new password" screen stay in tests/manual-test-tracker.md.
import { test, expect, gotoSignIn, signInThroughForm, mockAuth, shelves, expectStaging } from './helpers/app.js';
import { loadConfig, BASE_URL } from './helpers/env.js';
import { PASSWORD_RULE_MSG } from '../../src/lib/authErrors.js';

const WRONG = 'That email or password is incorrect. Try again.';
const STRONG = 'Str0ng!Passw0rd';
const newEmail = () => `e2e-${Date.now()}@hushthorn.local`;

async function openSignUp(page) {
  await gotoSignIn(page);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('button', { name: /Open the Archive/ })).toBeVisible();
}
async function fillSignUp(page, email, password, confirm = password) {
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill(password);
  await page.locator('#auth-confirm').fill(confirm);
  await page.getByRole('button', { name: /Open the Archive/ }).click();
}
async function openForgot(page) {
  await gotoSignIn(page);
  await page.getByRole('button', { name: 'Forgot your password?' }).click();
  await expect(page.getByRole('heading', { name: 'Forgotten password' })).toBeVisible();
}

test.describe('sign in', () => {
  test('wrong password shows the plain error and stays on the sign-in page', async ({ page }) => {
    await gotoSignIn(page);
    await signInThroughForm(page, { email: loadConfig().alpha.email, password: 'not-the-password-1!A' });
    await expect(page.getByText(WRONG)).toBeVisible();
    await expect(shelves(page)).toBeHidden();
  });

  test('unknown email shows the same error as a wrong password', async ({ page }) => {
    await gotoSignIn(page);
    await signInThroughForm(page, { email: newEmail(), password: STRONG });
    await expect(page.getByText(WRONG)).toBeVisible();
  });

  test('empty form is not submitted', async ({ page }) => {
    await gotoSignIn(page);
    await page.getByRole('button', { name: 'Enter the Archive' }).click();
    await expect(page.locator('#auth-email:invalid')).toHaveCount(1);
    await expect(page.getByText(WRONG)).toBeHidden();
  });

  test('show / hide password switches the field', async ({ page }) => {
    await gotoSignIn(page);
    await page.locator('#auth-password').fill('secret');
    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(page.locator('#auth-password')).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Hide password' }).click();
    await expect(page.locator('#auth-password')).toHaveAttribute('type', 'password');
  });

  test('correct details open the library, and Leave the archive signs out', async ({ page }) => {
    await gotoSignIn(page);
    await signInThroughForm(page, loadConfig().alpha);
    await expect(shelves(page)).toBeVisible();
    await expectStaging(page);

    await page.locator('header button').click(); // the profile chip
    await page.getByRole('button', { name: 'Leave the archive', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Enter the Archive' })).toBeVisible();

    await page.reload(); // the session is really gone, not just hidden
    await expect(page.getByRole('button', { name: 'Enter the Archive' })).toBeVisible();
  });
});

test.describe('sign up', () => {
  test('passwords that do not match are stopped before anything is sent', async ({ page }) => {
    const sent = await mockAuth(page, 'signup');
    await openSignUp(page);
    await fillSignUp(page, newEmail(), STRONG, STRONG + 'x');
    await expect(page.getByText('Passwords do not match.')).toBeVisible();
    expect(sent).toHaveLength(0);
  });

  test('new account: asks to confirm by email, and the link points back to this site', async ({ page }) => {
    const email = newEmail();
    const sent = await mockAuth(page, 'signup', {
      body: { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', email, identities: [{ id: '1', provider: 'email' }] },
    });
    await openSignUp(page);
    await fillSignUp(page, email, STRONG);
    await expect(page.getByText('Check your inbox to confirm your email before signing in.')).toBeVisible();
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toMatchObject({ email, password: STRONG });
    expect(new URL(sent[0].url).searchParams.get('redirect_to')).toBe(BASE_URL);
  });

  test('email already registered: says so and what to do', async ({ page }) => {
    const email = newEmail();
    await mockAuth(page, 'signup', {
      body: { id: '00000000-0000-4000-8000-000000000002', aud: 'authenticated', email, identities: [] },
    });
    await openSignUp(page);
    await fillSignUp(page, email, STRONG);
    await expect(page.getByText('That email is already registered. Sign in instead, or use a different one.')).toBeVisible();
  });

  // Negative: checked before sending, so the message names what is missing. A
  // 6-character password with every kind of character used to get the
  // "missing characters" message instead of "too short".
  test('too short: says it needs at least 8 characters, and sends nothing', async ({ page }) => {
    const sent = await mockAuth(page, 'signup');
    await openSignUp(page);
    await fillSignUp(page, newEmail(), 'S@chi1');
    await expect(page.getByText('Password needs at least 8 characters. Add what is missing and try again.')).toBeVisible();
    expect(sent).toHaveLength(0);
  });

  test('missing a symbol: names the symbol, and sends nothing', async ({ page }) => {
    const sent = await mockAuth(page, 'signup');
    await openSignUp(page);
    await fillSignUp(page, newEmail(), 'Schi1xyz');
    await expect(page.getByText('Password needs a symbol (like !@#$). Add what is missing and try again.')).toBeVisible();
    expect(sent).toHaveLength(0);
  });

  // The server can still refuse a password the browser accepts (its policy may be
  // stricter); then the full rule is shown.
  test('weak password: shows the password rule', async ({ page }) => {
    await mockAuth(page, 'signup', {
      status: 422,
      body: { code: 422, error_code: 'weak_password', msg: 'Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789, !@#$%^&*().', weak_password: { reasons: ['characters'] } },
    });
    await openSignUp(page);
    await fillSignUp(page, newEmail(), STRONG);
    await expect(page.getByText(PASSWORD_RULE_MSG)).toBeVisible();
  });

  test('too many attempts: says to wait', async ({ page }) => {
    await mockAuth(page, 'signup', {
      status: 429,
      body: { code: 429, error_code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' },
    });
    await openSignUp(page);
    await fillSignUp(page, newEmail(), STRONG);
    await expect(page.getByText('Too many attempts. Wait a few minutes, then try again.')).toBeVisible();
  });

  test('server down: says the archive could not be reached', async ({ page }) => {
    const { url } = loadConfig();
    await page.route((u) => u.href.startsWith(`${url}/auth/v1/signup`), (route) => route.abort('connectionrefused'));
    await openSignUp(page);
    await fillSignUp(page, newEmail(), STRONG);
    await expect(page.getByText('The archive could not be reached. Check your connection and try again.')).toBeVisible();
  });
});

test.describe('forgot password', () => {
  const NEUTRAL = 'If that email has an account, a reset link is on its way. Check your inbox (and spam), then follow the link.';

  test('sends the request, shows the neutral message, and blocks a second send', async ({ page }) => {
    const sent = await mockAuth(page, 'recover');
    const email = newEmail();
    await openForgot(page);
    await page.locator('#auth-email').fill(email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('status')).toHaveText(NEUTRAL);
    await expect(page.getByRole('button', { name: 'Send reset link' })).toBeDisabled();
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toMatchObject({ email });
    expect(new URL(sent[0].url).searchParams.get('redirect_to')).toBe(BASE_URL);
  });

  test('too many attempts: says to wait', async ({ page }) => {
    await mockAuth(page, 'recover', {
      status: 429,
      body: { code: 429, error_code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' },
    });
    await openForgot(page);
    await page.locator('#auth-email').fill(newEmail());
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByText('Too many attempts. Wait a few minutes, then try again.')).toBeVisible();
  });

  test('Back to sign in returns to the sign-in form', async ({ page }) => {
    await openForgot(page);
    await page.getByRole('button', { name: 'Back to sign in' }).click();
    await expect(page.getByRole('button', { name: 'Enter the Archive' })).toBeVisible();
    await expect(page.locator('#auth-password')).toBeVisible();
  });

  test('an expired email link explains itself and offers a new one', async ({ page }) => {
    await page.goto('/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    await expect(page.getByRole('alert')).toContainText('That email link has expired or was already used.');
    await expect(page).not.toHaveURL(/otp_expired/); // cleaned, so a reload does not repeat it
    await page.getByRole('button', { name: 'Send a new reset link' }).click();
    await expect(page.getByRole('heading', { name: 'Forgotten password' })).toBeVisible();
  });
});
