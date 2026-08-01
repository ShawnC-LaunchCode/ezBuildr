/**
 * Stage 17: Tenant Theme Engine
 *
 * Converts tenant branding configuration to CSS custom properties
 * and provides utilities for loading and applying themes dynamically.
 */

import type { TenantBranding, ThemeTokens } from '@shared/types/branding';

import {
  darkenColor,
  isValidHexColor,
  generateColorPalette,
} from './colorUtils';

/**
 * Extended theme tokens with all color variants
 */

export interface ExtendedThemeTokens extends ThemeTokens {
  // Primary color variants
  // eslint-disable-next-line @typescript-eslint/naming-convention
  '--brand-primary-light'?: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  '--brand-primary-lighter'?: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  '--brand-primary-dark'?: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  '--brand-primary-darker'?: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  '--brand-primary-contrast'?: string;

  // Accent color variants
  // eslint-disable-next-line @typescript-eslint/naming-convention
  '--brand-accent-light'?: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  '--brand-accent-lighter'?: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  '--brand-accent-dark'?: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  '--brand-accent-darker'?: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  '--brand-accent-contrast'?: string;

  // Surface colors (for cards, panels)
  // eslint-disable-next-line @typescript-eslint/naming-convention, sonarjs/no-duplicate-string
  '--brand-surface'?: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention, sonarjs/no-duplicate-string
  '--brand-surface-hover'?: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention, sonarjs/no-duplicate-string
  '--brand-surface-active'?: string;

  // Text colors
  // eslint-disable-next-line @typescript-eslint/naming-convention, sonarjs/no-duplicate-string
  '--brand-text'?: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention, sonarjs/no-duplicate-string
  '--brand-text-muted'?: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention, sonarjs/no-duplicate-string
  '--brand-heading'?: string;

  // Border colors
  // eslint-disable-next-line @typescript-eslint/naming-convention, sonarjs/no-duplicate-string
  '--brand-border'?: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention, sonarjs/no-duplicate-string
  '--brand-border-strong'?: string;

  // Link colors
  // eslint-disable-next-line @typescript-eslint/naming-convention
  '--brand-link'?: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  '--brand-link-hover'?: string;

  // Background colors
  // eslint-disable-next-line @typescript-eslint/naming-convention, sonarjs/no-duplicate-string
  '--brand-bg'?: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention, sonarjs/no-duplicate-string
  '--brand-bg-alt'?: string;
}

/**
 * Convert tenant branding to CSS theme tokens with full color derivation
 */
export function brandingToThemeTokens(
  branding: TenantBranding | null | undefined
): Partial<ExtendedThemeTokens> {
  const tokens: Partial<ExtendedThemeTokens> = {};

  // Logo
  if (branding?.logoUrl) {
    tokens['--brand-logo-url'] = `url('${branding.logoUrl}')`;
  }

  // Dark mode flag
  if (branding?.darkModeEnabled !== undefined) {
    tokens['--brand-dark-mode'] = branding.darkModeEnabled ? '1' : '0';
  }

  // Primary color with variants
  if (branding?.primaryColor && isValidHexColor(branding.primaryColor)) {
    const primaryPalette = generateColorPalette(branding.primaryColor);
    tokens['--brand-primary'] = primaryPalette.base;
    tokens['--brand-primary-light'] = primaryPalette.light;
    tokens['--brand-primary-lighter'] = primaryPalette.lighter;
    tokens['--brand-primary-dark'] = primaryPalette.dark;
    tokens['--brand-primary-darker'] = primaryPalette.darker;
    tokens['--brand-primary-contrast'] = primaryPalette.contrast;
  }

  // Accent color with variants
  if (branding?.accentColor && isValidHexColor(branding.accentColor)) {
    const accentPalette = generateColorPalette(branding.accentColor);
    tokens['--brand-accent'] = accentPalette.base;
    tokens['--brand-accent-light'] = accentPalette.light;
    tokens['--brand-accent-lighter'] = accentPalette.lighter;
    tokens['--brand-accent-dark'] = accentPalette.dark;
    tokens['--brand-accent-darker'] = accentPalette.darker;
    tokens['--brand-accent-contrast'] = accentPalette.contrast;
  }

  // Derive surface, text, and border colors based on dark mode
  const isDarkMode = branding?.darkModeEnabled === true;

  // Color constants to avoid duplication
  const SLATE_900 = '#0F172A';
  const SLATE_800 = '#1E293B';
  const SLATE_700 = '#334155';
  const SLATE_600 = '#475569';
  const SLATE_500 = '#64748B';
  const SLATE_300 = '#CBD5E1';
  const SLATE_200 = '#E2E8F0';
  const SLATE_100 = '#F1F5F9';
  const SLATE_50 = '#F8FAFC';
  const WHITE = '#FFFFFF';

  if (isDarkMode) {
    // Dark mode colors
    tokens['--brand-bg'] = SLATE_900;
    tokens['--brand-bg-alt'] = SLATE_800;
    tokens['--brand-surface'] = SLATE_800;
    tokens['--brand-surface-hover'] = SLATE_700;
    tokens['--brand-surface-active'] = SLATE_600;
    tokens['--brand-text'] = SLATE_50;
    tokens['--brand-text-muted'] = SLATE_300;
    tokens['--brand-heading'] = WHITE;
    tokens['--brand-border'] = SLATE_700;
    tokens['--brand-border-strong'] = SLATE_600;
  } else {
    // Light mode colors
    tokens['--brand-bg'] = WHITE;
    tokens['--brand-bg-alt'] = SLATE_50;
    tokens['--brand-surface'] = WHITE;
    tokens['--brand-surface-hover'] = SLATE_100;
    tokens['--brand-surface-active'] = SLATE_200;
    tokens['--brand-text'] = SLATE_900;
    tokens['--brand-text-muted'] = SLATE_500;
    tokens['--brand-heading'] = SLATE_900;
    tokens['--brand-border'] = SLATE_200;
    tokens['--brand-border-strong'] = SLATE_300;
  }

  // Link colors (use primary or accent if available)
  const linkColor = branding?.primaryColor ?? '#3B82F6'; // blue-500 fallback
  if (isValidHexColor(linkColor)) {
    tokens['--brand-link'] = linkColor;
    tokens['--brand-link-hover'] = darkenColor(linkColor, 10);
  }

  return tokens;
}

/**
 * Apply theme tokens to document root
 */
export function applyThemeTokens(tokens: Partial<ExtendedThemeTokens>): void {
  const root = document.documentElement;

  Object.entries(tokens).forEach(([key, value]) => {
    if (value !== undefined) {
      root.style.setProperty(key, value);
    }
  });
}

/**
 * Remove theme tokens from document root
 */
export function removeThemeTokens(): void {
  const root = document.documentElement;
  const themeKeys: (keyof ExtendedThemeTokens)[] = [
    '--brand-primary',
    '--brand-primary-light',
    '--brand-primary-lighter',
    '--brand-primary-dark',
    '--brand-primary-darker',
    '--brand-primary-contrast',
    '--brand-accent',
    '--brand-accent-light',
    '--brand-accent-lighter',
    '--brand-accent-dark',
    '--brand-accent-darker',
    '--brand-accent-contrast',
    '--brand-logo-url',
    '--brand-dark-mode',
    '--brand-bg',
    '--brand-bg-alt',
    '--brand-surface',
    '--brand-surface-hover',
    '--brand-surface-active',
    '--brand-text',
    '--brand-text-muted',
    '--brand-heading',
    '--brand-border',
    '--brand-border-strong',
    '--brand-link',
    '--brand-link-hover',
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

    const data = await response.json() as { branding: TenantBranding };
    const tokens = brandingToThemeTokens(data.branding);
    applyThemeTokens(tokens);
  } catch (error) {
    console.error('Error loading tenant theme:', error);
  }
}

/**
 * Get current theme tokens from document root
 */
export function getCurrentThemeTokens(): Partial<ExtendedThemeTokens> {
  const root = document.documentElement;
  const computedStyle = getComputedStyle(root);

  const tokens: Partial<ExtendedThemeTokens> = {};
  const themeKeys: (keyof ExtendedThemeTokens)[] = [
    '--brand-primary',
    '--brand-primary-light',
    '--brand-primary-lighter',
    '--brand-primary-dark',
    '--brand-primary-darker',
    '--brand-primary-contrast',
    '--brand-accent',
    '--brand-accent-light',
    '--brand-accent-lighter',
    '--brand-accent-dark',
    '--brand-accent-darker',
    '--brand-accent-contrast',
    '--brand-logo-url',
    '--brand-dark-mode',
    '--brand-bg',
    '--brand-bg-alt',
    '--brand-surface',
    '--brand-surface-hover',
    '--brand-surface-active',
    '--brand-text',
    '--brand-text-muted',
    '--brand-heading',
    '--brand-border',
    '--brand-border-strong',
    '--brand-link',
    '--brand-link-hover',
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
  return tokens['--brand-primary'] ?? null;
}

/**
 * Get the accent color from current theme
 */
export function getAccentColor(): string | null {
  const tokens = getCurrentThemeTokens();
  return tokens['--brand-accent'] ?? null;
}

/**
 * Get the logo URL from current theme
 */
export function getLogoUrl(): string | null {
  const tokens = getCurrentThemeTokens();
  const logoToken = tokens['--brand-logo-url'];

  if (!logoToken) {
    return null;
  }

  // Extract URL from url('...') format
  const match = logoToken.match(/url\(['"]?(.+?)['"]?\)/);
  return match ? match[1] : null;
}
