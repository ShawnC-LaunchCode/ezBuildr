/**
 * GH-158 — branding resolution, safety validation, and contrast guarantees.
 */
import { describe, expect, it } from 'vitest';

import { getContrastRatio } from '../../../shared/colorUtils';
import {
  DEFAULT_RESOLVED_BRANDING,
  brandingToRunnerCssVars,
  isBranded,
  isSafeImageUrl,
  resolveBranding,
  workflowBrandingSettingsSchema,
  type TenantBranding,
  type WorkflowBrandingSettings,
} from '../../../shared/types/branding';

const tenant: TenantBranding = {
  logoUrl: 'https://tenant.example/logo.png',
  primaryColor: '#112233',
  accentColor: '#445566',
  intakeHeaderText: 'Tenant Co',
};

const workflow: WorkflowBrandingSettings = {
  brandingEnabled: true,
  logoUrl: 'https://workflow.example/logo.png',
  primaryColor: '#AABBCC',
  secondaryColor: '#DDEEFF',
  organizationName: 'Workflow Co',
};

describe('resolveBranding (AC1)', () => {
  it('lets workflow branding override tenant branding field by field', () => {
    const resolved = resolveBranding(tenant, workflow);

    expect(resolved.logoUrl).toBe('https://workflow.example/logo.png');
    expect(resolved.organizationName).toBe('Workflow Co');
    expect(resolved.primaryColor).toBe('#AABBCC');
    expect(resolved.accentColor).toBe('#DDEEFF');
  });

  it('falls back to tenant branding for fields the workflow leaves empty', () => {
    const resolved = resolveBranding(tenant, {
      brandingEnabled: true,
      primaryColor: '#AABBCC',
      logoUrl: '',
    });

    // Workflow supplied only a color, so the logo and name come from the tenant.
    expect(resolved.primaryColor).toBe('#AABBCC');
    expect(resolved.logoUrl).toBe('https://tenant.example/logo.png');
    expect(resolved.organizationName).toBe('Tenant Co');
    expect(resolved.accentColor).toBe('#445566');
  });

  it('ignores workflow branding when brandingEnabled is false but keeps tenant branding', () => {
    const resolved = resolveBranding(tenant, { ...workflow, brandingEnabled: false });

    expect(resolved.logoUrl).toBe('https://tenant.example/logo.png');
    expect(resolved.organizationName).toBe('Tenant Co');
    expect(resolved.primaryColor).toBe('#112233');
  });

  it('returns the product default when neither side has branding', () => {
    expect(resolveBranding(null, null)).toEqual(DEFAULT_RESOLVED_BRANDING);
    expect(resolveBranding(undefined, undefined)).toEqual(DEFAULT_RESOLVED_BRANDING);
    expect(isBranded(resolveBranding(null, null))).toBe(false);
  });

  it('drops stored values that fail validation instead of throwing', () => {
    // Rows written before GH-158 added write-time validation may hold anything.
    const resolved = resolveBranding(null, {
      brandingEnabled: true,
      logoUrl: 'javascript:alert(1)',
      primaryColor: 'not-a-color',
      organizationName: '   ',
    });

    expect(resolved).toEqual(DEFAULT_RESOLVED_BRANDING);
  });

  it('reads whiteLabel even when brandingEnabled is false', () => {
    // White-label is a separate promise to the participant from "do I have a
    // custom look" — turning custom branding off must not resurrect the mark.
    expect(resolveBranding(null, { brandingEnabled: false, whiteLabel: true }).whiteLabel).toBe(true);
  });
});

describe('isSafeImageUrl (AC6)', () => {
  it.each(['javascript:alert(1)', 'data:text/html;base64,PHN2Zz4=', 'vbscript:msgbox', '//evil.test/x.png'])(
    'rejects %s',
    (value) => {
      expect(isSafeImageUrl(value)).toBe(false);
    }
  );

  it.each(['https://cdn.example/logo.png', 'http://localhost:5000/logo.png', '/uploads/logo.png'])(
    'accepts %s',
    (value) => {
      expect(isSafeImageUrl(value)).toBe(true);
    }
  );
});

describe('workflowBrandingSettingsSchema (AC6, AC7)', () => {
  it.each(['javascript:alert(1)', 'data:text/html,<script>', 'vbscript:msgbox'])(
    'rejects %s as a logo URL',
    (logoUrl) => {
      expect(workflowBrandingSettingsSchema.safeParse({ logoUrl }).success).toBe(false);
    }
  );

  it('rejects an unsafe favicon URL', () => {
    expect(workflowBrandingSettingsSchema.safeParse({ faviconUrl: 'javascript:alert(1)' }).success).toBe(false);
  });

  it('rejects a non-hex color', () => {
    expect(workflowBrandingSettingsSchema.safeParse({ primaryColor: 'red' }).success).toBe(false);
    expect(workflowBrandingSettingsSchema.safeParse({ secondaryColor: '#12345' }).success).toBe(false);
  });

  it('normalizes a valid shorthand hex color', () => {
    const parsed = workflowBrandingSettingsSchema.parse({ primaryColor: '#abc' });
    expect(parsed.primaryColor).toBe('#AABBCC');
  });

  it('accepts empty strings so a cleared builder field round-trips', () => {
    const parsed = workflowBrandingSettingsSchema.parse({ logoUrl: '', primaryColor: '' });
    expect(parsed.logoUrl).toBe('');
    expect(parsed.primaryColor).toBe('');
  });

  it('passes through non-branding settings keys untouched', () => {
    const parsed = workflowBrandingSettingsSchema
      .passthrough()
      .parse({ whiteLabel: true, completionMessage: 'Thanks!', allowSaveAndResume: false });

    expect(parsed).toMatchObject({
      whiteLabel: true,
      completionMessage: 'Thanks!',
      allowSaveAndResume: false,
    });
  });
});

describe('brandingToRunnerCssVars (AC7)', () => {
  it('emits nothing when the branding carries no colors', () => {
    expect(brandingToRunnerCssVars(DEFAULT_RESOLVED_BRANDING)).toEqual({});
  });

  it('maps the primary color onto the tokens the design system already themes from', () => {
    const vars = brandingToRunnerCssVars({ ...DEFAULT_RESOLVED_BRANDING, primaryColor: '#2A6DF4' });

    expect(vars['--primary']).toBe('#2A6DF4');
    expect(vars['--ring']).toBe('#2A6DF4');
  });

  it('never maps the brand accent onto --accent, which is a hover surface here', () => {
    const vars = brandingToRunnerCssVars({ ...DEFAULT_RESOLVED_BRANDING, accentColor: '#DDEEFF' });

    expect(vars['--accent']).toBeUndefined();
    expect(vars['--brand-accent']).toBe('#DDEEFF');
  });

  it.each([
    ['#FFFFFF'], // white brand — needs dark label text
    ['#000000'], // black brand — needs light label text
    ['#767676'], // the worst case: both candidates sit near the 4.5 threshold
    ['#2A6DF4'],
    ['#FFFF00'],
  ])('derives a button label color that passes WCAG AA against brand %s', (primaryColor) => {
    const vars = brandingToRunnerCssVars({ ...DEFAULT_RESOLVED_BRANDING, primaryColor });

    const ratio = getContrastRatio(vars['--primary-foreground'], primaryColor);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
