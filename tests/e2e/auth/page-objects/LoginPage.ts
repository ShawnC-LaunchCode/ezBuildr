import { Page, Locator } from "@playwright/test";

/**
 * Page Object for the Login page
 * Encapsulates login page interactions
 */
export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly googleLoginButton: Locator;
  readonly errorMessage: Locator;
  readonly forgotPasswordLink: Locator;
  readonly registerLink: Locator;
  readonly mfaCodeInput: Locator;
  readonly mfaVerifyButton: Locator;
  readonly backupCodeInput: Locator;
  readonly useBackupCodeLink: Locator;
  readonly trustDeviceCheckbox: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('input[name="email"], input[type="email"]');
    this.passwordInput = page.locator('input[name="password"], input[type="password"]');
    this.loginButton = page.locator('button[type="submit"]:has-text("Login"), button:has-text("Sign in"), button:has-text("Log in")');
    this.googleLoginButton = page.locator('button:has-text("Google"), button:has-text("Sign in with Google")');
    this.errorMessage = page.locator('[role="alert"], .error-message, .alert-error');
    this.forgotPasswordLink = page.locator('a:has-text("Forgot password")');
    this.registerLink = page.locator('a:has-text("Sign up"), a:has-text("Register")');
    this.mfaCodeInput = page.locator('input[name="mfaCode"], input[name="token"]');
    this.mfaVerifyButton = page.locator('button:has-text("Verify")');
    this.backupCodeInput = page.locator('input[name="backupCode"]');
    this.useBackupCodeLink = page.locator('a:has-text("Use backup code"), button:has-text("Use backup code")');
    this.trustDeviceCheckbox = page.locator('input[name="trustDevice"], input[type="checkbox"]');
  }

  async goto() {
    await this.page.goto("/login");
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  async loginWithGoogle() {
    await this.googleLoginButton.click();
  }

  async getErrorMessage(): Promise<string> {
    return await this.errorMessage.textContent() || "";
  }

  async waitForMfaPrompt() {
    await this.mfaCodeInput.waitFor({ state: "visible", timeout: 10000 });
  }

  async verifyMfa(code: string, trustDevice = false) {
    await this.mfaCodeInput.fill(code);
    if (trustDevice) {
      await this.trustDeviceCheckbox.check();
    }
    await this.mfaVerifyButton.click();
  }

  async useBackupCode(code: string) {
    await this.useBackupCodeLink.click();
    await this.backupCodeInput.fill(code);
    await this.mfaVerifyButton.click();
  }
}
