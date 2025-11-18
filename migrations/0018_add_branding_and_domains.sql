-- Migration: Add branding and tenant domains for Stage 17
-- This migration adds support for:
-- - Tenant-level branding customization
-- - Custom subdomain mapping
-- - Email template metadata (registry)

-- =====================================================================
-- ADD BRANDING COLUMN TO TENANTS
-- =====================================================================

-- Add branding jsonb column to tenants table
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "branding" jsonb;

-- Add comment explaining branding structure
COMMENT ON COLUMN "tenants"."branding" IS 'Branding configuration: { logoUrl, primaryColor, accentColor, darkModeEnabled, intakeHeaderText, emailSenderName, emailSenderAddress }';

-- =====================================================================
-- CREATE TENANT DOMAINS TABLE
-- =====================================================================

-- Create tenant_domains table for custom domain mapping
CREATE TABLE IF NOT EXISTS "tenant_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"domain" text NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

-- =====================================================================
-- CREATE EMAIL TEMPLATE METADATA TABLE
-- =====================================================================

-- Create email_template_metadata table (NO rendering yet, just metadata)
CREATE TABLE IF NOT EXISTS "email_template_metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_key" varchar(100) NOT NULL UNIQUE,
	"name" varchar(255) NOT NULL,
	"description" text,
	"subject_preview" text,
	"branding_tokens" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

-- =====================================================================
-- ADD FOREIGN KEY CONSTRAINTS
-- =====================================================================

-- Tenant domains to tenants
DO $$ BEGIN
 ALTER TABLE "tenant_domains" ADD CONSTRAINT "tenant_domains_tenant_id_tenants_id_fk"
 FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- =====================================================================
-- CREATE INDICES
-- =====================================================================

-- Tenant domains indices
CREATE INDEX IF NOT EXISTS "tenant_domains_tenant_idx" ON "tenant_domains" USING btree ("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_domains_domain_idx" ON "tenant_domains" USING btree ("domain");

-- Email template metadata indices
CREATE INDEX IF NOT EXISTS "email_template_metadata_key_idx" ON "email_template_metadata" USING btree ("template_key");

-- =====================================================================
-- SEED DEFAULT EMAIL TEMPLATES (METADATA ONLY)
-- =====================================================================

-- Insert default email template metadata
INSERT INTO "email_template_metadata" ("template_key", "name", "description", "subject_preview", "branding_tokens")
VALUES
  ('workflow_invitation', 'Workflow Invitation', 'Invitation to complete a workflow', 'You have been invited to {{workflowName}}', '{"logoUrl": true, "primaryColor": true, "emailSenderName": true}'),
  ('workflow_reminder', 'Workflow Reminder', 'Reminder for incomplete workflow', 'Reminder: {{workflowName}} is waiting for you', '{"logoUrl": true, "primaryColor": true, "emailSenderName": true}'),
  ('review_request', 'Review Request', 'Request for document/workflow review', 'Review requested: {{reviewTitle}}', '{"logoUrl": true, "primaryColor": true, "emailSenderName": true}'),
  ('signature_request', 'Signature Request', 'E-signature request notification', 'Signature requested: {{documentName}}', '{"logoUrl": true, "primaryColor": true, "emailSenderName": true}'),
  ('workflow_completed', 'Workflow Completed', 'Notification that workflow is complete', '{{workflowName}} has been completed', '{"logoUrl": true, "primaryColor": true, "emailSenderName": true}')
ON CONFLICT ("template_key") DO NOTHING;

-- =====================================================================
-- ADD COMMENTS FOR DOCUMENTATION
-- =====================================================================

COMMENT ON TABLE "tenant_domains" IS 'Custom domain mapping for tenant-specific intake portals (e.g., acme.vaultlogic.com)';
COMMENT ON TABLE "email_template_metadata" IS 'Email template registry with metadata only - actual rendering happens in application layer';
