// One positive test per button on the signed-out screen, through the SignInPage object.
// Sign-up and reset replies are stubbed (the real calls send email); see auth.spec.js.
import { test, expect, mockAuth, shelves } from './helpers/app.js';
import { loadConfig } from './helpers/env.js';
import { SignInPage } from './pages/SignInPage.js';

const STRONG = 'Str0ng!Passw0rd';
const newEmail = () => `e2e-${Date.now()}@hushthorn.local`;

let signIn;
test.beforeEach(async ({ page }) => {
  signIn = new SignInPage(page);
  await signIn.goto();
});

test('Create account tab shows the confirm field and the Open the Archive button', async () => {
  await signIn.createTab.click();
  await expect(signIn.confirm).toBeVisible();
  await expect(signIn.open).toBeVisible();
  await expect(signIn.enter).toBeHidden();
});

test('Sign in tab returns from Create account to the sign-in form', async () => {
  await signIn.createTab.click();
  await signIn.signInTab.click();
  await expect(signIn.enter).toBeVisible();
  await expect(signIn.confirm).toBeHidden();
});

test('Show password reveals the sign-in password and Hide password covers it again', async () => {
  await signIn.password.fill('secret');
  await expect(signIn.passwordToggle).toHaveAccessibleName('Show password');
  await signIn.passwordToggle.click();
  await expect(signIn.password).toHaveAttribute('type', 'text');
  await expect(signIn.passwordToggle).toHaveAccessibleName('Hide password');
  await signIn.passwordToggle.click();
  await expect(signIn.password).toHaveAttribute('type', 'password');
});

test('on Create account each password field has its own Show / Hide button', async () => {
  await signIn.createTab.click();
  await signIn.password.fill('secret');
  await signIn.confirm.fill('secret');
  await signIn.confirmToggle.click();
  await expect(signIn.confirm).toHaveAttribute('type', 'text');
  await expect(signIn.password).toHaveAttribute('type', 'password'); // the other field is untouched
  await signIn.passwordToggle.click();
  await expect(signIn.password).toHaveAttribute('type', 'text');
});

test('Forgot your password? opens the reset form', async () => {
  await signIn.forgot.click();
  await expect(signIn.forgotHeading).toBeVisible();
  await expect(signIn.sendReset).toBeVisible();
});

test('Send reset link sends the email address and shows the neutral message', async ({ page }) => {
  const sent = await mockAuth(page, 'recover');
  const email = newEmail();
  await signIn.forgot.click();
  await signIn.email.fill(email);
  await signIn.sendReset.click();
  await expect(page.getByRole('status')).toContainText('a reset link is on its way');
  expect(sent[0].body).toMatchObject({ email });
});

test('Back to sign in leaves the reset form', async () => {
  await signIn.forgot.click();
  await signIn.back.click();
  await expect(signIn.enter).toBeVisible();
  await expect(signIn.forgotHeading).toBeHidden();
});

test('Enter the Archive signs in with the staging reader and opens the library', async ({ page }) => {
  await signIn.signIn(loadConfig().alpha);
  await expect(shelves(page)).toBeVisible();
  await expect(signIn.enter).toBeHidden();
});

test('Open the Archive sends the new account and asks to confirm by email', async ({ page }) => {
  const email = newEmail();
  const sent = await mockAuth(page, 'signup', {
    body: { id: '00000000-0000-4000-8000-0000000000a1', aud: 'authenticated', email, identities: [{ id: '1', provider: 'email' }] },
  });
  await signIn.createTab.click();
  await signIn.email.fill(email);
  await signIn.password.fill(STRONG);
  await signIn.confirm.fill(STRONG);
  await signIn.open.click();
  await expect(page.getByText('Check your inbox to confirm your email before signing in.')).toBeVisible();
  expect(sent).toHaveLength(1);
});

test('Send a new reset link, shown after an expired email link, opens the reset form', async ({ page }) => {
  // The app reads the link error once, on load. beforeEach already loaded "/", so
  // leave first: a hash-only change would not reload the page.
  await page.goto('about:blank');
  await page.goto('/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  await signIn.sendNewReset.click();
  await expect(signIn.forgotHeading).toBeVisible();
});
