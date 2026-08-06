import { z } from 'zod';

import { getContrastTextColor, isValidHexColor, normalizeHexColor } from '../colorUtils';

/**
 * Stage 17: Branding & Tenant Customization Types
 *
 * This file contains TypeScript types and Zod schemas for tenant branding,
 * custom domains, and email template metadata.
 *
 * GH-158 added the participant-facing half: workflow branding settings, the
 * single `resolveBranding()` entry point that merges tenant and workflow
 * branding, and the CSS custom properties the runner applies.
 */

// =====================================================================
// TENANT BRANDING
// =====================================================================

/**
 * Tenant branding configuration stored in tenants.branding jsonb column
 */
export interface TenantBranding {
  logoUrl?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  darkModeEnabled?: boolean | null;
  intakeHeaderText?: string | null;
  emailSenderName?: string | null;
  emailSenderAddress?: string | null;
}

/**
 * Zod schema for tenant branding validation
 */
export const tenantBrandingSchema = z.object({
  logoUrl: z.string().url().nullable().optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color').nullable().optional(),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color').nullable().optional(),
  darkModeEnabled: z.boolean().nullable().optional(),
  intakeHeaderText: z.string().max(500).nullable().optional(),
  emailSenderName: z.string().max(255).nullable().optional(),
  emailSenderAddress: z.string().email().nullable().optional(),
});

/**
 * Partial branding schema for PATCH operations
 */
export const partialTenantBrandingSchema = tenantBrandingSchema.partial();

// =====================================================================
// WORKFLOW BRANDING (GH-158)
// =====================================================================

/**
 * Image URLs are rendered into `<img src>` and CSS `url()` on participant
 * surfaces, so only absolute http(s) URLs and same-origin absolute paths are
 * accepted. This rejects `javascript:`, `data:`, `vbscript:` and
 * protocol-relative (`//evil.test`) URLs.
 */
export function isSafeImageUrl(value: string): boolean {
  const trimmed = value.trim();

  if (trimmed === '') {
    return false;
  }

  // Same-origin absolute path (e.g. an uploaded logo), but not protocol-relative.
  if (trimmed.startsWith('/')) {
    return !trimmed.startsWith('//');
  }

  try {
    const { protocol } = new URL(trimmed);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

const safeImageUrlSchema = z
  .string()
  .max(2048)
  .refine(isSafeImageUrl, 'Must be an http(s) URL or a same-origin path');

const brandHexColorSchema = z
  .string()
  .refine(isValidHexColor, 'Must be a valid hex color')
  .transform(normalizeHexColor);

/**
 * Participant-facing branding stored inside the `workflows.settings` jsonb blob.
 *
 * `secondaryColor` is the workflow-level name for what tenant branding calls
 * `accentColor`. Both spellings are load-bearing in stored data;
 * `resolveBranding()` is the only place that should reconcile them.
 */
export interface WorkflowBrandingSettings {
  brandingEnabled?: boolean | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  organizationName?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  whiteLabel?: boolean | null;
}

/**
 * Validation for the branding keys of `workflows.settings`.
 *
 * Empty strings are coerced to `null` because the builder's controlled inputs
 * submit `""` for a cleared field, and `""` must not be stored as a URL.
 */
export const workflowBrandingSettingsSchema = z.object({
  brandingEnabled: z.boolean().nullable().optional(),
  logoUrl: z.union([safeImageUrlSchema, z.literal('')]).nullable().optional(),
  faviconUrl: z.union([safeImageUrlSchema, z.literal('')]).nullable().optional(),
  organizationName: z.string().max(120).nullable().optional(),
  primaryColor: z.union([brandHexColorSchema, z.literal('')]).nullable().optional(),
  secondaryColor: z.union([brandHexColorSchema, z.literal('')]).nullable().optional(),
  whiteLabel: z.boolean().nullable().optional(),
});

// =====================================================================
// BRANDING RESOLUTION (GH-158)
// =====================================================================

/**
 * The single branding shape every participant surface renders from.
 *
 * `null` means "not branded — use the product default", which is deliberately
 * different from a hardcoded ezBuildr hex: the stylesheet in `index.css` owns
 * the default palette, and the runner leaves those CSS variables untouched
 * rather than restating them here where they would drift.
 */
export interface ResolvedBranding {
  logoUrl: string | null;
  faviconUrl: string | null;
  organizationName: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  whiteLabel: boolean;
}

export const DEFAULT_RESOLVED_BRANDING: ResolvedBranding = {
  logoUrl: null,
  faviconUrl: null,
  organizationName: null,
  primaryColor: null,
  accentColor: null,
  whiteLabel: false,
};

function cleanString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function cleanImageUrl(value: string | null | undefined): string | null {
  const cleaned = cleanString(value);
  return cleaned !== null && isSafeImageUrl(cleaned) ? cleaned : null;
}

function cleanColor(value: string | null | undefined): string | null {
  const cleaned = cleanString(value);
  return cleaned !== null && isValidHexColor(cleaned) ? normalizeHexColor(cleaned) : null;
}

/**
 * Resolve the branding a participant should see for one workflow.
 *
 * Precedence: workflow branding wins field-by-field, tenant branding fills the
 * gaps, product default is the floor. A workflow with `brandingEnabled: false`
 * contributes nothing but still inherits its tenant's branding — turning the
 * workflow-level switch off means "I have no workflow-specific brand", not
 * "show this participant the ezBuildr brand".
 *
 * Values that fail validation are dropped rather than thrown on: this runs on
 * the participant read path, where rows predating write-time validation must
 * degrade to the default instead of failing the run.
 */
export function resolveBranding(
  tenantBranding: TenantBranding | null | undefined,
  workflowBranding: WorkflowBrandingSettings | null | undefined
): ResolvedBranding {
  const workflowEnabled = workflowBranding?.brandingEnabled === true;
  const workflow = workflowEnabled ? workflowBranding : null;

  return {
    logoUrl: cleanImageUrl(workflow?.logoUrl) ?? cleanImageUrl(tenantBranding?.logoUrl),
    faviconUrl: cleanImageUrl(workflow?.faviconUrl),
    organizationName:
      cleanString(workflow?.organizationName) ?? cleanString(tenantBranding?.intakeHeaderText),
    primaryColor: cleanColor(workflow?.primaryColor) ?? cleanColor(tenantBranding?.primaryColor),
    accentColor: cleanColor(workflow?.secondaryColor) ?? cleanColor(tenantBranding?.accentColor),
    // White-label is workflow-scoped only. It ships ungated (repo owner
    // decision, 2026-08-05); the plan check is blocked on user-level billing.
    whiteLabel: workflowBranding?.whiteLabel === true,
  };
}

/**
 * Does this branding differ from the product default in any visible way?
 */
export function isBranded(branding: ResolvedBranding): boolean {
  return (
    branding.logoUrl !== null ||
    branding.faviconUrl !== null ||
    branding.organizationName !== null ||
    branding.primaryColor !== null ||
    branding.accentColor !== null ||
    branding.whiteLabel
  );
}

/**
 * Map resolved branding onto the CSS custom properties the runner already
 * themes from, so every existing shadcn/Tailwind component inherits the brand
 * without per-component changes.
 *
 * Two deliberate choices:
 *
 * - `--primary-foreground` is derived, never taken from the author. Picking the
 *   better of black/white against the brand color is guaranteed to land at
 *   >= 4.58:1 (the worst case sits at relative luminance ~0.179, where both
 *   candidates meet in the middle), so button label text passes WCAG AA for
 *   *any* brand color the author chooses.
 * - The brand accent is NOT mapped onto `--accent`. In this design system
 *   `--accent` is a subtle hover surface paired with `--accent-foreground`;
 *   assigning a saturated brand color to it would make every dropdown and
 *   hover state unreadable. It is exposed as `--brand-accent` instead.
 */
export function brandingToRunnerCssVars(branding: ResolvedBranding): Record<string, string> {
  const vars: Record<string, string> = {};

  if (branding.primaryColor !== null) {
    vars['--primary'] = branding.primaryColor;
    vars['--primary-foreground'] = getContrastTextColor(branding.primaryColor);
    vars['--ring'] = branding.primaryColor;
  }

  if (branding.accentColor !== null) {
    vars['--brand-accent'] = branding.accentColor;
    vars['--brand-accent-foreground'] = getContrastTextColor(branding.accentColor);
  }

  return vars;
}

// =====================================================================
// TENANT DOMAINS
// =====================================================================

/**
 * Tenant domain record
 */
export interface TenantDomain {
  id: string;
  tenantId: string;
  domain: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Zod schema for creating a tenant domain
 */
export const createTenantDomainSchema = z.object({
  domain: z.string()
    .min(3, 'Domain must be at least 3 characters')
    .max(255, 'Domain must be less than 255 characters')
    .regex(
      // eslint-disable-next-line security/detect-unsafe-regex
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i,
      'Must be a valid domain name'
    ),
});

// =====================================================================
// EMAIL TEMPLATE METADATA
// =====================================================================

/**
 * Email template metadata record
 */
export interface EmailTemplateMetadata {
  id: string;
  templateKey: string;
  name: string;
  description?: string | null;
  subjectPreview?: string | null;
  brandingTokens?: Record<string, boolean> | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Zod schema for email template metadata
 */
export const emailTemplateMetadataSchema = z.object({
  templateKey: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  subjectPreview: z.string().nullable().optional(),
  brandingTokens: z.record(z.boolean()).nullable().optional(),
});

/**
 * Zod schema for updating email template metadata
 */
export const updateEmailTemplateMetadataSchema = emailTemplateMetadataSchema.partial().omit({ templateKey: true });

// =====================================================================
// THEME TOKENS
// =====================================================================

/**
 * CSS theme tokens derived from tenant branding
 */
export interface ThemeTokens {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  '--brand-primary': string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  '--brand-accent': string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  '--brand-logo-url': string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  '--brand-dark-mode': string;
}

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

// =====================================================================
// API REQUEST/RESPONSE TYPES
// =====================================================================

/**
 * GET /api/tenants/:tenantId/branding response
 */
export interface GetBrandingResponse {
  branding: TenantBranding | null;
}

/**
 * PATCH /api/tenants/:tenantId/branding request
 */
export interface UpdateBrandingRequest {
  branding: Partial<TenantBranding>;
}

/**
 * PATCH /api/tenants/:tenantId/branding response
 */
export interface UpdateBrandingResponse {
  message: string;
  branding: TenantBranding;
}

/**
 * GET /api/tenants/:tenantId/domains response
 */
export interface GetDomainsResponse {
  domains: TenantDomain[];
  total: number;
}

/**
 * POST /api/tenants/:tenantId/domains request
 */
export interface CreateDomainRequest {
  domain: string;
}

/**
 * POST /api/tenants/:tenantId/domains response
 */
export interface CreateDomainResponse {
  message: string;
  domain: TenantDomain;
}

/**
 * DELETE /api/tenants/:tenantId/domains/:id response
 */
export interface DeleteDomainResponse {
  message: string;
}

/**
 * GET /api/email-templates response
 */
export interface GetEmailTemplatesResponse {
  templates: EmailTemplateMetadata[];
  total: number;
}

/**
 * GET /api/email-templates/:id response
 */
export interface GetEmailTemplateResponse {
  template: EmailTemplateMetadata;
}

/**
 * PATCH /api/email-templates/:id/metadata request
 */
export interface UpdateEmailTemplateMetadataRequest {
  name?: string;
  description?: string | null;
  subjectPreview?: string | null;
  brandingTokens?: Record<string, boolean> | null;
}

/**
 * PATCH /api/email-templates/:id/metadata response
 */
export interface UpdateEmailTemplateMetadataResponse {
  message: string;
  template: EmailTemplateMetadata;
}
