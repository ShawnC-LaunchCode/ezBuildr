/**
 * Stage 17: Color Utilities
 *
 * Utilities for color manipulation, derivation, and contrast calculation.
 * Used for generating light/dark variants of branding colors.
 */

/**
 * Convert hex color to RGB components
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  // Remove # if present
  hex = hex.replace(/^#/, '');

  // Parse 3-digit or 6-digit hex
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((char) => char + char)
      .join('');
  }

  if (hex.length !== 6) {
    return null;
  }

  const num = parseInt(hex, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * Convert RGB to hex color
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const hex = Math.round(Math.max(0, Math.min(255, n))).toString(16);
    return hex.length === 1 ? `0${  hex}` : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Lighten a color by a percentage (0-100)
 */
export function lightenColor(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) {return hex;}

  const amount = (percent / 100) * 255;
  return rgbToHex(
    rgb.r + (255 - rgb.r) * (amount / 255),
    rgb.g + (255 - rgb.g) * (amount / 255),
    rgb.b + (255 - rgb.b) * (amount / 255)
  );
}

/**
 * Darken a color by a percentage (0-100)
 */
export function darkenColor(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) {return hex;}

  const factor = 1 - percent / 100;
  return rgbToHex(rgb.r * factor, rgb.g * factor, rgb.b * factor);
}

/**
 * Calculate relative luminance of a color (WCAG 2.0)
 * https://www.w3.org/TR/WCAG20/#relativeluminancedef
 */
export function getLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) {return 0;}

  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((val) => {
    const sRGB = val / 255;
    return sRGB <= 0.03928 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculate contrast ratio between two colors (WCAG 2.0)
 * Returns a value between 1 and 21
 */
export function getContrastRatio(color1: string, color2: string): number {
  const lum1 = getLuminance(color1);
  const lum2 = getLuminance(color2);

  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if color combination meets WCAG AA standard (4.5:1 for normal text)
 */
export function meetsWCAGAA(foreground: string, background: string): boolean {
  return getContrastRatio(foreground, background) >= 4.5;
}

/**
 * Check if color combination meets WCAG AAA standard (7:1 for normal text)
 */
export function meetsWCAGAAA(foreground: string, background: string): boolean {
  return getContrastRatio(foreground, background) >= 7;
}

/**
 * Get the best contrast text color (black or white) for a background
 */
export function getContrastTextColor(backgroundColor: string): string {
  const whiteContrast = getContrastRatio('#FFFFFF', backgroundColor);
  const blackContrast = getContrastRatio('#000000', backgroundColor);

  return whiteContrast > blackContrast ? '#FFFFFF' : '#000000';
}

/**
 * Check if a color is considered "light"
 */
export function isLightColor(hex: string): boolean {
  return getLuminance(hex) > 0.5;
}

/**
 * Check if a color is considered "dark"
 */
export function isDarkColor(hex: string): boolean {
  return getLuminance(hex) <= 0.5;
}

/**
 * Adjust color brightness to ensure minimum contrast ratio
 * Returns a new color that meets the target contrast ratio
 */
export function adjustForContrast(
  color: string,
  backgroundColor: string,
  targetRatio: number = 4.5
): string {
  let adjustedColor = color;
  let iterations = 0;
  const maxIterations = 20;

  while (getContrastRatio(adjustedColor, backgroundColor) < targetRatio && iterations < maxIterations) {
    if (isLightColor(backgroundColor)) {
      // On light backgrounds, darken the color
      adjustedColor = darkenColor(adjustedColor, 5);
    } else {
      // On dark backgrounds, lighten the color
      adjustedColor = lightenColor(adjustedColor, 5);
    }
    iterations++;
  }

  return adjustedColor;
}

/**
 * Generate color palette variants from a base color
 */
export interface ColorPalette {
  base: string;
  light: string;
  lighter: string;
  dark: string;
  darker: string;
  contrast: string; // Best contrast text color
}

export function generateColorPalette(baseColor: string): ColorPalette {
  return {
    base: baseColor,
    light: lightenColor(baseColor, 15),
    lighter: lightenColor(baseColor, 30),
    dark: darkenColor(baseColor, 15),
    darker: darkenColor(baseColor, 30),
    contrast: getContrastTextColor(baseColor),
  };
}

/**
 * Validate hex color format
 */
export function isValidHexColor(hex: string): boolean {
  return /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hex);
}

/**
 * Normalize hex color (ensure it has # prefix and is 6 digits)
 */
export function normalizeHexColor(hex: string): string {
  hex = hex.replace(/^#/, '');

  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((char) => char + char)
      .join('');
  }

  return `#${hex.toUpperCase()}`;
}
