/**
 * Stage 17: Branding Module Exports
 *
 * Centralized exports for branding components, hooks, and utilities
 */

// Context and Provider
export {
  BrandingProvider,
  useBranding,
  useThemeTokens,
  useTenantId,
  useIsDarkMode,
  usePrimaryColor,
  useAccentColor,
  useLogoUrl,
  useIntakeHeaderText,
} from './BrandingContext';

export type { BrandingContextValue, BrandingProviderProps } from './BrandingContext';

// Components
export { default as BrandingPreview } from './BrandingPreview';
export type { BrandingPreviewProps } from './BrandingPreview';

// Theme utilities
export {
  brandingToThemeTokens,
  applyThemeTokens,
  removeThemeTokens,
  loadAndApplyTenantTheme,
  getCurrentThemeTokens,
  isDarkModeEnabled,
  getPrimaryColor,
  getAccentColor,
  getLogoUrl,
} from '../../lib/tenantTheme';

export type { ExtendedThemeTokens } from '../../lib/tenantTheme';

// Color utilities
export {
  hexToRgb,
  rgbToHex,
  lightenColor,
  darkenColor,
  getLuminance,
  getContrastRatio,
  meetsWCAGAA,
  meetsWCAGAAA,
  getContrastTextColor,
  isLightColor,
  isDarkColor,
  adjustForContrast,
  generateColorPalette,
  isValidHexColor,
  normalizeHexColor,
} from '../../lib/colorUtils';

export type { ColorPalette } from '../../lib/colorUtils';

// API
export { brandingAPI } from '../../lib/vault-api';
export type {
  TenantBranding,
  TenantDomain,
  GetBrandingResponse,
  UpdateBrandingRequest,
  UpdateBrandingResponse,
  GetDomainsResponse,
  CreateDomainRequest,
  CreateDomainResponse,
  DeleteDomainResponse,
} from '../../lib/vault-api';
