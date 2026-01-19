/**
 * Stage 17: Tenant Theme Tests
 *
 * Unit tests for theme token generation and application
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { TenantBranding } from '@/lib/vault-api';
import {
  brandingToThemeTokens,
  applyThemeTokens,
  removeThemeTokens,
  getCurrentThemeTokens,
  isDarkModeEnabled,
  getPrimaryColor,
  getAccentColor,
  getLogoUrl,
} from '../tenantTheme';
describe('tenantTheme', () => {
  describe('brandingToThemeTokens', () => {
    it('should return empty object for null branding', () => {
      const tokens = brandingToThemeTokens(null);
      expect(tokens).toEqual({});
    });
    it('should return empty object for undefined branding', () => {
      const tokens = brandingToThemeTokens(undefined);
      expect(tokens).toEqual({});
    });
    it('should generate primary color tokens', () => {
      const branding: TenantBranding = {
        primaryColor: '#3B82F6',
      };
      const tokens = brandingToThemeTokens(branding);
      expect(tokens['--brand-primary']).toBe('#3B82F6');
      expect(tokens['--brand-primary-light']).toBeDefined();
      expect(tokens['--brand-primary-lighter']).toBeDefined();
      expect(tokens['--brand-primary-dark']).toBeDefined();
      expect(tokens['--brand-primary-darker']).toBeDefined();
      expect(tokens['--brand-primary-contrast']).toBeDefined();
    });
    it('should generate accent color tokens', () => {
      const branding: TenantBranding = {
        accentColor: '#10B981',
      };
      const tokens = brandingToThemeTokens(branding);
      expect(tokens['--brand-accent']).toBe('#10B981');
      expect(tokens['--brand-accent-light']).toBeDefined();
      expect(tokens['--brand-accent-dark']).toBeDefined();
      expect(tokens['--brand-accent-contrast']).toBeDefined();
    });
    it('should generate light mode surface tokens', () => {
      const branding: TenantBranding = {
        darkModeEnabled: false,
      };
      const tokens = brandingToThemeTokens(branding);
      expect(tokens['--brand-bg']).toBe('#FFFFFF');
      expect(tokens['--brand-surface']).toBe('#FFFFFF');
      expect(tokens['--brand-text']).toBe('#0F172A');
      expect(tokens['--brand-text-muted']).toBe('#64748B');
      expect(tokens['--brand-border']).toBe('#E2E8F0');
    });
    it('should generate dark mode surface tokens', () => {
      const branding: TenantBranding = {
        darkModeEnabled: true,
      };
      const tokens = brandingToThemeTokens(branding);
      expect(tokens['--brand-bg']).toBe('#0F172A');
      expect(tokens['--brand-surface']).toBe('#1E293B');
      expect(tokens['--brand-text']).toBe('#F8FAFC');
      expect(tokens['--brand-text-muted']).toBe('#CBD5E1');
      expect(tokens['--brand-border']).toBe('#334155');
    });
    it('should set logo URL token', () => {
      const branding: TenantBranding = {
        logoUrl: 'https://example.com/logo.png',
      };
      const tokens = brandingToThemeTokens(branding);
      expect(tokens['--brand-logo-url']).toBe('url("https://example.com/logo.png")');
    });
    it('should generate complete token set for full branding', () => {
      const branding: TenantBranding = {
        logoUrl: 'https://example.com/logo.png',
        primaryColor: '#3B82F6',
        accentColor: '#10B981',
        darkModeEnabled: false,
        intakeHeaderText: 'Welcome',
        emailSenderName: 'Acme Corp',
        emailSenderAddress: 'noreply@acme.com',
      };
      const tokens = brandingToThemeTokens(branding);
      // Check all major token categories exist
      expect(tokens['--brand-primary']).toBeDefined();
      expect(tokens['--brand-accent']).toBeDefined();
      expect(tokens['--brand-bg']).toBeDefined();
      expect(tokens['--brand-text']).toBeDefined();
      expect(tokens['--brand-logo-url']).toBeDefined();
      // Should have generated 25+ tokens
      expect(Object.keys(tokens).length).toBeGreaterThanOrEqual(25);
    });
    it('should skip invalid colors', () => {
      const branding: TenantBranding = {
        primaryColor: 'invalid-color',
        accentColor: '#notahex',
      };
      const tokens = brandingToThemeTokens(branding);
      expect(tokens['--brand-primary']).toBeUndefined();
      expect(tokens['--brand-accent']).toBeUndefined();
    });
  });
  describe('applyThemeTokens', () => {
    beforeEach(() => {
      // Clean up any existing tokens
      removeThemeTokens();
    });
    afterEach(() => {
      removeThemeTokens();
    });
    it('should apply tokens to body element', () => {
      const tokens = {
        '--brand-primary': '#3B82F6',
        '--brand-accent': '#10B981',
      };
      applyThemeTokens(tokens);
      const bodyStyle = document.body.style;
      expect(bodyStyle.getPropertyValue('--brand-primary')).toBe('#3B82F6');
      expect(bodyStyle.getPropertyValue('--brand-accent')).toBe('#10B981');
    });
    it('should update existing tokens', () => {
      applyThemeTokens({ '--brand-primary': '#FF0000' });
      expect(document.body.style.getPropertyValue('--brand-primary')).toBe('#FF0000');
      applyThemeTokens({ '--brand-primary': '#00FF00' });
      expect(document.body.style.getPropertyValue('--brand-primary')).toBe('#00FF00');
    });
  });
  describe('removeThemeTokens', () => {
    it('should remove all brand tokens from body', () => {
      const tokens = {
        '--brand-primary': '#3B82F6',
        '--brand-accent': '#10B981',
        '--brand-bg': '#FFFFFF',
      };
      applyThemeTokens(tokens);
      expect(document.body.style.getPropertyValue('--brand-primary')).toBe('#3B82F6');
      removeThemeTokens();
      expect(document.body.style.getPropertyValue('--brand-primary')).toBe('');
      expect(document.body.style.getPropertyValue('--brand-accent')).toBe('');
      expect(document.body.style.getPropertyValue('--brand-bg')).toBe('');
    });
  });
  describe('getCurrentThemeTokens', () => {
    beforeEach(() => {
      removeThemeTokens();
    });
    afterEach(() => {
      removeThemeTokens();
    });
    it('should return empty object when no tokens applied', () => {
      const current = getCurrentThemeTokens();
      expect(current).toEqual({});
    });
    it('should return currently applied tokens', () => {
      const tokens = {
        '--brand-primary': '#3B82F6',
        '--brand-accent': '#10B981',
      };
      applyThemeTokens(tokens);
      const current = getCurrentThemeTokens();
      expect(current['--brand-primary']).toBe('#3B82F6');
      expect(current['--brand-accent']).toBe('#10B981');
    });
  });
  describe('isDarkModeEnabled', () => {
    beforeEach(() => {
      removeThemeTokens();
    });
    afterEach(() => {
      removeThemeTokens();
    });
    it('should return false when no branding applied', () => {
      expect(isDarkModeEnabled()).toBe(false);
    });
    it('should detect dark mode from tokens', () => {
      const darkBranding: TenantBranding = { darkModeEnabled: true };
      const tokens = brandingToThemeTokens(darkBranding);
      applyThemeTokens(tokens);
      expect(isDarkModeEnabled()).toBe(true);
    });
    it('should detect light mode from tokens', () => {
      const lightBranding: TenantBranding = { darkModeEnabled: false };
      const tokens = brandingToThemeTokens(lightBranding);
      applyThemeTokens(tokens);
      expect(isDarkModeEnabled()).toBe(false);
    });
  });
  describe('getPrimaryColor', () => {
    beforeEach(() => {
      removeThemeTokens();
    });
    afterEach(() => {
      removeThemeTokens();
    });
    it('should return null when no primary color set', () => {
      expect(getPrimaryColor()).toBeNull();
    });
    it('should return primary color from tokens', () => {
      const branding: TenantBranding = { primaryColor: '#3B82F6' };
      const tokens = brandingToThemeTokens(branding);
      applyThemeTokens(tokens);
      expect(getPrimaryColor()).toBe('#3B82F6');
    });
  });
  describe('getAccentColor', () => {
    beforeEach(() => {
      removeThemeTokens();
    });
    afterEach(() => {
      removeThemeTokens();
    });
    it('should return null when no accent color set', () => {
      expect(getAccentColor()).toBeNull();
    });
    it('should return accent color from tokens', () => {
      const branding: TenantBranding = { accentColor: '#10B981' };
      const tokens = brandingToThemeTokens(branding);
      applyThemeTokens(tokens);
      expect(getAccentColor()).toBe('#10B981');
    });
  });
  describe('getLogoUrl', () => {
    beforeEach(() => {
      removeThemeTokens();
    });
    afterEach(() => {
      removeThemeTokens();
    });
    it('should return null when no logo URL set', () => {
      expect(getLogoUrl()).toBeNull();
    });
    it('should return logo URL from tokens', () => {
      const branding: TenantBranding = { logoUrl: 'https://example.com/logo.png' };
      const tokens = brandingToThemeTokens(branding);
      applyThemeTokens(tokens);
      expect(getLogoUrl()).toBe('https://example.com/logo.png');
    });
    it('should extract URL from CSS url() format', () => {
      applyThemeTokens({ '--brand-logo-url': 'url("https://example.com/logo.png")' });
      expect(getLogoUrl()).toBe('https://example.com/logo.png');
    });
  });
});