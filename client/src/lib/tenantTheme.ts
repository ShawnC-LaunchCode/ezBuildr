/**
 * Stage 17: Tenant Theme Engine
 *
 * Converts tenant branding configuration to CSS custom properties
 * and provides utilities for loading and applying themes dynamically.
 */

import type { TenantBranding, ThemeTokens } from '@shared/types/branding';

/**
 * Convert tenant branding to CSS theme tokens
 */
export function brandingToThemeTokens(branding: TenantBranding | null | undefined): Partial<ThemeTokens> {
  const tokens: Partial<ThemeTokens> = {};

  if (branding?.primaryColor) {
    tokens['--brand-primary'] = branding.primaryColor;
  }

  if (branding?.accentColor) {
    tokens['--brand-accent'] = branding.accentColor;
  }

  if (branding?.logoUrl) {
    tokens['--brand-logo-url'] = `url('${branding.logoUrl}')`;
  }

  if (branding?.darkModeEnabled !== undefined) {
    tokens['--brand-dark-mode'] = branding.darkModeEnabled ? '1' : '0';
  }

  return tokens;
}

/**
 * Apply theme tokens to document root
 */
export function applyThemeTokens(tokens: Partial<ThemeTokens>): void {
  const root = document.documentElement;

  Object.entries(tokens).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}

/**
 * Remove theme tokens from document root
 */
export function removeThemeTokens(): void {
  const root = document.documentElement;
  const themeKeys: (keyof ThemeTokens)[] = [
    '--brand-primary',
    '--brand-accent',
    '--brand-logo-url',
    '--brand-dark-mode',
  ];

  themeKeys.forEach((key) => {
    root.style.removeProperty(key);
  });
}

/**
 * Load tenant branding and apply theme
 */
export async function loadAndApplyTenantTheme(tenantId: string): Promise<void> {
  try {
    const response = await fetch(`/api/tenants/${tenantId}/branding`, {
      credentials: 'include',
    });

    if (!response.ok) {
      console.warn('Failed to load tenant branding:', response.statusText);
      return;
    }

    const data = await response.json();
    const tokens = brandingToThemeTokens(data.branding);
    applyThemeTokens(tokens);
  } catch (error) {
    console.error('Error loading tenant theme:', error);
  }
}

/**
 * Get current theme tokens from document root
 */
export function getCurrentThemeTokens(): Partial<ThemeTokens> {
  const root = document.documentElement;
  const computedStyle = getComputedStyle(root);

  const tokens: Partial<ThemeTokens> = {};
  const themeKeys: (keyof ThemeTokens)[] = [
    '--brand-primary',
    '--brand-accent',
    '--brand-logo-url',
    '--brand-dark-mode',
  ];

  themeKeys.forEach((key) => {
    const value = computedStyle.getPropertyValue(key);
    if (value) {
      tokens[key] = value.trim();
    }
  });

  return tokens;
}

/**
 * Check if dark mode is enabled in current theme
 */
export function isDarkModeEnabled(): boolean {
  const tokens = getCurrentThemeTokens();
  return tokens['--brand-dark-mode'] === '1';
}

/**
 * Get the primary color from current theme
 */
export function getPrimaryColor(): string | null {
  const tokens = getCurrentThemeTokens();
  return tokens['--brand-primary'] || null;
}

/**
 * Get the accent color from current theme
 */
export function getAccentColor(): string | null {
  const tokens = getCurrentThemeTokens();
  return tokens['--brand-accent'] || null;
}

/**
 * Get the logo URL from current theme
 */
export function getLogoUrl(): string | null {
  const tokens = getCurrentThemeTokens();
  const logoToken = tokens['--brand-logo-url'];

  if (!logoToken) return null;

  // Extract URL from url('...') format
  const match = logoToken.match(/url\(['"]?(.+?)['"]?\)/);
  return match ? match[1] : null;
}
