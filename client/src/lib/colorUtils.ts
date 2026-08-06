/**
 * Color utilities — re-exported from `@shared/colorUtils`.
 *
 * The implementation lives in `shared/` because the server validates branding
 * colors for contrast at the API boundary (GH-158) and must run the same math
 * the client renders with. This module is kept so existing client imports of
 * `@/lib/colorUtils` continue to resolve.
 */

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
} from '@shared/colorUtils';

export type { ColorPalette } from '@shared/colorUtils';
