import { Page, Locator } from "@playwright/test";

/**
 * Page Object for the Dashboard page
 * Encapsulates dashboard interactions
 */
export class DashboardPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly userMenu: Locator;
  readonly logoutButton: Locator;
  readonly settingsLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('h1, h2').first();
    this.userMenu = page.locator('[data-testid="user-menu"], button:has-text("account"), button:has-text("menu")').first();
    this.logoutButton = page.locator('button:has-text("Logout"), button:has-text("Sign out"), a:has-text("Logout")');
    this.settingsLink = page.locator('a:has-text("Settings")');
  }

  async goto() {
    await this.page.goto("/dashboard");
  }

  async waitForLoad() {
    await this.page.waitForURL("**/dashboard", { timeout: 10000 });
  }

  async logout() {
    // Try to find and click user menu first
    try {
      await this.userMenu.click({ timeout: 2000 });
    } catch {
      // User menu might not exist, try direct logout button
    }
    await this.logoutButton.click();
  }

  async isVisible(): Promise<boolean> {
    try {
      await this.heading.waitFor({ state: "visible", timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}
