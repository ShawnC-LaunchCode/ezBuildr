import { z } from 'zod';

/**
 * Stage 17: Branding & Tenant Customization Types
 *
 * This file contains TypeScript types and Zod schemas for tenant branding,
 * custom domains, and email template metadata.
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
  '--brand-primary': string;
  '--brand-accent': string;
  '--brand-logo-url': string;
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
