// Page object: the signed-out screen (sign in, create account, forgotten password).
// Buttons: Sign in tab, Create account tab, Show/Hide password (one per field),
// Forgot your password?, Enter the Archive, Open the Archive, Send reset link,
// Back to sign in, Send a new reset link.
import { expect } from '@playwright/test';
import { expectStaging } from '../helpers/app.js';

export class SignInPage {
  constructor(page) {
    this.page = page;
    this.signInTab = page.getByRole('button', { name: 'Sign in', exact: true });
    this.createTab = page.getByRole('button', { name: 'Create account' });
    this.email = page.locator('#auth-email');
    this.password = page.locator('#auth-password');
    this.confirm = page.locator('#auth-confirm');
    // The eye button lives in the same wrapper as its input.
    this.passwordToggle = this.password.locator('xpath=..').getByRole('button', { name: /(Show|Hide) password/ });
    this.confirmToggle = this.confirm.locator('xpath=..').getByRole('button', { name: /(Show|Hide) password/ });
    this.forgot = page.getByRole('button', { name: 'Forgot your password?' });
    this.enter = page.getByRole('button', { name: 'Enter the Archive' });
    this.open = page.getByRole('button', { name: /Open the Archive/ });
    this.sendReset = page.getByRole('button', { name: 'Send reset link' });
    this.back = page.getByRole('button', { name: 'Back to sign in' });
    this.sendNewReset = page.getByRole('button', { name: 'Send a new reset link' });
    this.forgotHeading = page.getByRole('heading', { name: 'Forgotten password' });
  }

  async goto() {
    await this.page.goto('/');
    await expect(this.enter).toBeVisible();
    await expectStaging(this.page);
  }

  async signIn({ email, password }) {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.enter.click();
  }
}
