import { Page, Locator } from "@playwright/test";

/**
 * Page Object for Portal authentication
 * Handles magic link authentication flow
 */
export class PortalPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly sendLinkButton: Locator;
  readonly successMessage: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('input[name="email"], input[type="email"]');
    this.sendLinkButton = page.locator('button:has-text("Send"), button:has-text("magic link")');
    this.successMessage = page.locator('[role="status"], .success-message, .alert-success');
    this.errorMessage = page.locator('[role="alert"], .error-message, .alert-error');
  }

  async goto() {
    await this.page.goto("/portal/login");
  }

  async requestMagicLink(email: string) {
    await this.emailInput.fill(email);
    await this.sendLinkButton.click();
  }

  async verifyMagicLink(token: string) {
    await this.page.goto(`/portal/verify/${token}`);
  }

  async getSuccessMessage(): Promise<string> {
    return await this.successMessage.textContent() || "";
  }
}
