/**
 * Stage 17: Color Utilities Tests
 *
 * Unit tests for color manipulation and WCAG accessibility functions
 */

import { describe, it, expect } from 'vitest';

import {
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
} from '../colorUtils';

describe('colorUtils', () => {
  describe('hexToRgb', () => {
    it('should convert valid hex colors to RGB', () => {
      expect(hexToRgb('#FF5733')).toEqual({ r: 255, g: 87, b: 51 });
      expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
      expect(hexToRgb('#FFFFFF')).toEqual({ r: 255, g: 255, b: 255 });
    });

    it('should handle shorthand hex colors', () => {
      expect(hexToRgb('#F53')).toEqual({ r: 255, g: 85, b: 51 });
      expect(hexToRgb('#000')).toEqual({ r: 0, g: 0, b: 0 });
      expect(hexToRgb('#FFF')).toEqual({ r: 255, g: 255, b: 255 });
    });

    it('should throw error for invalid hex colors', () => {
      expect(() => hexToRgb('invalid')).toThrow();
      expect(() => hexToRgb('#ZZZ')).toThrow();
      expect(() => hexToRgb('123456')).toThrow();
    });
  });

  describe('rgbToHex', () => {
    it('should convert RGB to hex', () => {
      expect(rgbToHex(255, 87, 51)).toBe('#FF5733');
      expect(rgbToHex(0, 0, 0)).toBe('#000000');
      expect(rgbToHex(255, 255, 255)).toBe('#FFFFFF');
    });

    it('should clamp values outside 0-255 range', () => {
      expect(rgbToHex(-10, 300, 150)).toBe('#00FF96');
    });
  });

  describe('lightenColor', () => {
    it('should lighten colors by percentage', () => {
      const result = lightenColor('#3B82F6', 15);
      expect(result).toMatch(/^#[0-9A-F]{6}$/);
      // Should be lighter than original
      const original = hexToRgb('#3B82F6');
      const lightened = hexToRgb(result);

      expect(original).not.toBeNull();
      expect(lightened).not.toBeNull();

      if (original && lightened) {
        expect(lightened.r).toBeGreaterThanOrEqual(original.r);
        expect(lightened.g).toBeGreaterThanOrEqual(original.g);
        expect(lightened.b).toBeGreaterThanOrEqual(original.b);
      }
    });

    it('should not go beyond white', () => {
      expect(lightenColor('#FFFFFF', 50)).toBe('#FFFFFF');
    });
  });

  describe('darkenColor', () => {
    it('should darken colors by percentage', () => {
      const result = darkenColor('#3B82F6', 15);
      expect(result).toMatch(/^#[0-9A-F]{6}$/);
      // Should be darker than original
      const original = hexToRgb('#3B82F6');
      const darkened = hexToRgb(result);

      expect(original).not.toBeNull();
      expect(darkened).not.toBeNull();

      if (original && darkened) {
        expect(darkened.r).toBeLessThanOrEqual(original.r);
        expect(darkened.g).toBeLessThanOrEqual(original.g);
        expect(darkened.b).toBeLessThanOrEqual(original.b);
      }
    });

    it('should not go beyond black', () => {
      expect(darkenColor('#000000', 50)).toBe('#000000');
    });
  });

  describe('getLuminance', () => {
    it('should calculate luminance for colors', () => {
      expect(getLuminance('#FFFFFF')).toBeCloseTo(1, 2);
      expect(getLuminance('#000000')).toBeCloseTo(0, 2);
      expect(getLuminance('#808080')).toBeCloseTo(0.22, 2);
    });
  });

  describe('getContrastRatio', () => {
    it('should calculate contrast ratio between colors', () => {
      expect(getContrastRatio('#FFFFFF', '#000000')).toBe(21);
      expect(getContrastRatio('#000000', '#FFFFFF')).toBe(21);
      expect(getContrastRatio('#FFFFFF', '#FFFFFF')).toBe(1);
    });

    it('should return ratio >= 1', () => {
      const ratio = getContrastRatio('#3B82F6', '#10B981');
      expect(ratio).toBeGreaterThanOrEqual(1);
    });
  });

  describe('WCAG compliance', () => {
    it('should correctly identify AA compliant color pairs', () => {
      expect(meetsWCAGAA('#FFFFFF', '#000000')).toBe(true);
      expect(meetsWCAGAA('#3B82F6', '#FFFFFF')).toBe(true);
      expect(meetsWCAGAA('#FFFF00', '#FFFFFF')).toBe(false);
    });

    it('should correctly identify AAA compliant color pairs', () => {
      expect(meetsWCAGAAA('#FFFFFF', '#000000')).toBe(true);
      expect(meetsWCAGAAA('#3B82F6', '#FFFFFF')).toBe(false);
    });
  });

  describe('getContrastTextColor', () => {
    it('should return white for dark backgrounds', () => {
      expect(getContrastTextColor('#000000')).toBe('#FFFFFF');
      expect(getContrastTextColor('#1E293B')).toBe('#FFFFFF');
      expect(getContrastTextColor('#3B82F6')).toBe('#FFFFFF');
    });

    it('should return black for light backgrounds', () => {
      expect(getContrastTextColor('#FFFFFF')).toBe('#000000');
      expect(getContrastTextColor('#F8FAFC')).toBe('#000000');
      expect(getContrastTextColor('#FFFF00')).toBe('#000000');
    });
  });

  describe('isLightColor / isDarkColor', () => {
    it('should identify light colors', () => {
      expect(isLightColor('#FFFFFF')).toBe(true);
      expect(isLightColor('#F8FAFC')).toBe(true);
      expect(isLightColor('#000000')).toBe(false);
    });

    it('should identify dark colors', () => {
      expect(isDarkColor('#000000')).toBe(true);
      expect(isDarkColor('#1E293B')).toBe(true);
      expect(isDarkColor('#FFFFFF')).toBe(false);
    });
  });

  describe('adjustForContrast', () => {
    it('should adjust colors to meet WCAG AA', () => {
      const result = adjustForContrast('#FFFF00', '#FFFFFF');
      expect(meetsWCAGAA(result, '#FFFFFF')).toBe(true);
    });

    it('should not modify already compliant colors', () => {
      const result = adjustForContrast('#3B82F6', '#FFFFFF');
      expect(meetsWCAGAA(result, '#FFFFFF')).toBe(true);
    });
  });

  describe('generateColorPalette', () => {
    it('should generate complete color palette', () => {
      const palette = generateColorPalette('#3B82F6');

      expect(palette).toHaveProperty('base');
      expect(palette).toHaveProperty('light');
      expect(palette).toHaveProperty('lighter');
      expect(palette).toHaveProperty('dark');
      expect(palette).toHaveProperty('darker');
      expect(palette).toHaveProperty('contrast');

      expect(palette.base).toBe('#3B82F6');
      expect(palette.contrast).toMatch(/^#[0-9A-F]{6}$/);
    });

    it('should generate progressively lighter/darker shades', () => {
      const palette = generateColorPalette('#808080');

      const baseLum = getLuminance(palette.base);
      const lightLum = getLuminance(palette.light);
      const lighterLum = getLuminance(palette.lighter);
      const darkLum = getLuminance(palette.dark);
      const darkerLum = getLuminance(palette.darker);

      expect(lightLum).toBeGreaterThan(baseLum);
      expect(lighterLum).toBeGreaterThan(lightLum);
      expect(darkLum).toBeLessThan(baseLum);
      expect(darkerLum).toBeLessThan(darkLum);
    });
  });

  describe('isValidHexColor', () => {
    it('should validate correct hex colors', () => {
      expect(isValidHexColor('#3B82F6')).toBe(true);
      expect(isValidHexColor('#000')).toBe(true);
      expect(isValidHexColor('#FFFFFF')).toBe(true);
      expect(isValidHexColor('#abc')).toBe(true);
    });

    it('should reject invalid hex colors', () => {
      expect(isValidHexColor('3B82F6')).toBe(false);
      expect(isValidHexColor('#ZZZ')).toBe(false);
      expect(isValidHexColor('invalid')).toBe(false);
      expect(isValidHexColor('#12')).toBe(false);
      expect(isValidHexColor('#1234567')).toBe(false);
    });
  });

  describe('normalizeHexColor', () => {
    it('should normalize shorthand to 6-digit hex', () => {
      expect(normalizeHexColor('#F53')).toBe('#FF5533');
      expect(normalizeHexColor('#000')).toBe('#000000');
      expect(normalizeHexColor('#FFF')).toBe('#FFFFFF');
    });

    it('should uppercase and preserve 6-digit hex', () => {
      expect(normalizeHexColor('#3b82f6')).toBe('#3B82F6');
      expect(normalizeHexColor('#3B82F6')).toBe('#3B82F6');
    });

    it('should add # prefix if missing', () => {
      expect(normalizeHexColor('3B82F6')).toBe('#3B82F6');
      expect(normalizeHexColor('F53')).toBe('#FF5533');
    });
  });
});
