/**
 * Stage 17: Tenant Theme Engine
 *
 * Converts tenant branding configuration to CSS custom properties
 * and provides utilities for loading and applying themes dynamically.
 */

import type { TenantBranding, ThemeTokens } from '@shared/types/branding';

import {
  lightenColor,
  darkenColor,
  getContrastTextColor,
  isValidHexColor,
  generateColorPalette,
} from './colorUtils';

/**
 * Extended theme tokens with all color variants
 */
export interface ExtendedThemeTokens extends ThemeTokens {
  // Primary color variants
  '--brand-primary-light'?: string;
  '--brand-primary-lighter'?: string;
  '--brand-primary-dark'?: string;
  '--brand-primary-darker'?: string;
  '--brand-primary-contrast'?: string;

  // Accent color variants
  '--brand-accent-light'?: string;
  '--brand-accent-lighter'?: string;
  '--brand-accent-dark'?: string;
  '--brand-accent-darker'?: string;
  '--brand-accent-contrast'?: string;

  // Surface colors (for cards, panels)
  '--brand-surface'?: string;
  '--brand-surface-hover'?: string;
  '--brand-surface-active'?: string;

  // Text colors
  '--brand-text'?: string;
  '--brand-text-muted'?: string;
  '--brand-heading'?: string;

  // Border colors
  '--brand-border'?: string;
  '--brand-border-strong'?: string;

  // Link colors
  '--brand-link'?: string;
  '--brand-link-hover'?: string;

  // Background colors
  '--brand-bg'?: string;
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

  if (isDarkMode) {
    // Dark mode colors
    tokens['--brand-bg'] = '#0F172A'; // slate-900
    tokens['--brand-bg-alt'] = '#1E293B'; // slate-800
    tokens['--brand-surface'] = '#1E293B'; // slate-800
    tokens['--brand-surface-hover'] = '#334155'; // slate-700
    tokens['--brand-surface-active'] = '#475569'; // slate-600
    tokens['--brand-text'] = '#F8FAFC'; // slate-50
    tokens['--brand-text-muted'] = '#CBD5E1'; // slate-300
    tokens['--brand-heading'] = '#FFFFFF';
    tokens['--brand-border'] = '#334155'; // slate-700
    tokens['--brand-border-strong'] = '#475569'; // slate-600
  } else {
    // Light mode colors
    tokens['--brand-bg'] = '#FFFFFF';
    tokens['--brand-bg-alt'] = '#F8FAFC'; // slate-50
    tokens['--brand-surface'] = '#FFFFFF';
    tokens['--brand-surface-hover'] = '#F1F5F9'; // slate-100
    tokens['--brand-surface-active'] = '#E2E8F0'; // slate-200
    tokens['--brand-text'] = '#0F172A'; // slate-900
    tokens['--brand-text-muted'] = '#64748B'; // slate-500
    tokens['--brand-heading'] = '#0F172A'; // slate-900
    tokens['--brand-border'] = '#E2E8F0'; // slate-200
    tokens['--brand-border-strong'] = '#CBD5E1'; // slate-300
  }

  // Link colors (use primary or accent if available)
  const linkColor = branding?.primaryColor || '#3B82F6'; // blue-500 fallback
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

  if (!logoToken) {return null;}

  // Extract URL from url('...') format
  const match = logoToken.match(/url\(['"]?(.+?)['"]?\)/);
  return match ? match[1] : null;
}
