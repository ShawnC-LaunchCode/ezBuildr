CREATE TYPE "public"."anonymous_access_type" AS ENUM('disabled', 'unlimited', 'one_per_ip', 'one_per_session');--> statement-breakpoint
CREATE TYPE "public"."auth_provider" AS ENUM('local', 'google', 'github', 'email');--> statement-breakpoint
CREATE TYPE "public"."organization_invite_status" AS ENUM('pending', 'accepted', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."organization_role" AS ENUM('admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."owner_type" AS ENUM('user', 'org');--> statement-breakpoint
CREATE TYPE "public"."tenant_plan" AS ENUM('free', 'pro', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'creator', 'user', 'guest');--> statement-breakpoint
CREATE TYPE "public"."user_tenant_role" AS ENUM('owner', 'builder', 'runner', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."workspace_role" AS ENUM('owner', 'admin', 'editor', 'contributor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."block_phase" AS ENUM('onRunStart', 'onSectionEnter', 'onSectionSubmit', 'onNext', 'onRunComplete');--> statement-breakpoint
CREATE TYPE "public"."block_type" AS ENUM('prefill', 'validate', 'branch', 'create_record', 'update_record', 'find_record', 'delete_record', 'query', 'write', 'external_send', 'read_table', 'list_tools');--> statement-breakpoint
CREATE TYPE "public"."condition_operator" AS ENUM('equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than', 'between', 'is_empty', 'is_not_empty');--> statement-breakpoint
CREATE TYPE "public"."conditional_action" AS ENUM('show', 'hide', 'require', 'make_optional', 'skip_to');--> statement-breakpoint
CREATE TYPE "public"."document_hook_phase" AS ENUM('beforeGeneration', 'afterGeneration');--> statement-breakpoint
CREATE TYPE "public"."lifecycle_hook_phase" AS ENUM('beforePage', 'afterPage', 'beforeFinalBlock', 'afterDocumentsGenerated');--> statement-breakpoint
CREATE TYPE "public"."logic_rule_target_type" AS ENUM('section', 'step');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."step_type" AS ENUM('short_text', 'long_text', 'multiple_choice', 'radio', 'yes_no', 'date_time', 'file_upload', 'loop_group', 'computed', 'js_question', 'repeater', 'final_documents', 'signature_block', 'true_false', 'phone', 'date', 'time', 'datetime', 'email', 'number', 'currency', 'scale', 'website', 'display', 'address', 'final', 'text', 'boolean', 'phone_advanced', 'datetime_unified', 'choice', 'email_advanced', 'number_advanced', 'scale_advanced', 'website_advanced', 'address_advanced', 'multi_field', 'display_advanced');--> statement-breakpoint
CREATE TYPE "public"."template_type" AS ENUM('docx', 'html', 'pdf');--> statement-breakpoint
CREATE TYPE "public"."transform_block_language" AS ENUM('javascript', 'python');--> statement-breakpoint
CREATE TYPE "public"."transform_block_type" AS ENUM('map', 'rename', 'compute', 'conditional', 'loop', 'script');--> statement-breakpoint
CREATE TYPE "public"."version_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."workflow_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."metrics_event_type" AS ENUM('run_started', 'run_succeeded', 'run_failed', 'pdf_succeeded', 'pdf_failed', 'docx_succeeded', 'docx_failed', 'queue_enqueued', 'queue_dequeued');--> statement-breakpoint
CREATE TYPE "public"."portal_access_mode" AS ENUM('anonymous', 'token', 'portal');--> statement-breakpoint
CREATE TYPE "public"."review_task_status" AS ENUM('pending', 'approved', 'changes_requested', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."rollup_bucket" AS ENUM('1m', '5m', '1h', '1d');--> statement-breakpoint
CREATE TYPE "public"."script_execution_status" AS ENUM('success', 'error', 'timeout');--> statement-breakpoint
CREATE TYPE "public"."signature_event_type" AS ENUM('sent', 'viewed', 'signed', 'declined');--> statement-breakpoint
CREATE TYPE "public"."signature_provider" AS ENUM('native', 'docusign', 'hellosign');--> statement-breakpoint
CREATE TYPE "public"."signature_request_status" AS ENUM('pending', 'signed', 'declined', 'expired');--> statement-breakpoint
CREATE TYPE "public"."sli_window" AS ENUM('1d', '7d', '30d');--> statement-breakpoint
CREATE TYPE "public"."transform_block_run_status" AS ENUM('success', 'timeout', 'error');--> statement-breakpoint
CREATE TYPE "public"."autonumber_reset_policy" AS ENUM('never', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."collection_field_type" AS ENUM('text', 'number', 'boolean', 'date', 'datetime', 'file', 'select', 'multi_select', 'json');--> statement-breakpoint
CREATE TYPE "public"."data_source_type" AS ENUM('native', 'postgres', 'google_sheets', 'airtable', 'external');--> statement-breakpoint
CREATE TYPE "public"."datavault_column_type" AS ENUM('text', 'number', 'boolean', 'date', 'datetime', 'email', 'phone', 'url', 'json', 'auto_number', 'autonumber', 'reference', 'select', 'multiselect');--> statement-breakpoint
CREATE TYPE "public"."datavault_scope_type" AS ENUM('account', 'project', 'workflow');--> statement-breakpoint
CREATE TYPE "public"."datavault_table_role" AS ENUM('owner', 'write', 'read');--> statement-breakpoint
CREATE TYPE "public"."connection_type" AS ENUM('api_key', 'bearer', 'oauth2_client_credentials', 'oauth2_3leg');--> statement-breakpoint
CREATE TYPE "public"."secret_type" AS ENUM('api_key', 'bearer', 'oauth2', 'basic_auth');--> statement-breakpoint
CREATE TYPE "public"."webhook_event" AS ENUM('workflow_run.started', 'workflow_run.page_completed', 'workflow_run.completed', 'document.generated', 'signature.completed', 'signature.declined');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'past_due', 'canceled', 'trialing', 'incomplete', 'incomplete_expired', 'unpaid');--> statement-breakpoint
CREATE TYPE "public"."template_access" AS ENUM('use', 'edit');--> statement-breakpoint
CREATE TABLE "account_locks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"locked_at" timestamp DEFAULT now() NOT NULL,
	"locked_until" timestamp NOT NULL,
	"reason" varchar(255),
	"unlocked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"workspace_id" uuid,
	"user_id" varchar,
	"action" varchar NOT NULL,
	"entity_type" varchar NOT NULL,
	"entity_id" varchar NOT NULL,
	"resource_type" varchar,
	"resource_id" varchar,
	"changes" jsonb,
	"details" jsonb,
	"ip_address" varchar,
	"user_agent" text,
	"created_at" timestamp DEFAULT now(),
	"timestamp" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "email_verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"token" varchar NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "invalidated_tokens" (
	"token" varchar(500) PRIMARY KEY NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"ip_address" varchar(45),
	"successful" boolean DEFAULT false NOT NULL,
	"attempted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mfa_backup_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"code_hash" text NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mfa_secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"secret" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"enabled_at" timestamp,
	CONSTRAINT "mfa_secrets_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "organization_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"invited_email" varchar(255) NOT NULL,
	"invited_user_id" varchar,
	"invited_by_user_id" varchar NOT NULL,
	"token" varchar(255) NOT NULL,
	"status" "organization_invite_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"email_sent_at" timestamp,
	"email_failed" boolean DEFAULT false,
	"email_error" text,
	CONSTRAINT "organization_invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "organization_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" varchar NOT NULL,
	"role" "organization_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"slug" varchar,
	"domain" varchar,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"tenant_id" uuid NOT NULL,
	"created_by_user_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"token" varchar NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "portal_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar NOT NULL,
	"token" varchar NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "portal_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"token" varchar NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"device_name" varchar(255),
	"ip_address" varchar(45),
	"location" varchar(255),
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "resource_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"resource_type" varchar NOT NULL,
	"resource_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"action" varchar NOT NULL,
	"allowed" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" varchar NOT NULL,
	"role" varchar(50) DEFAULT 'member' NOT NULL,
	"joined_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tenant_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"verified" boolean DEFAULT false,
	"verification_token" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "tenant_domains_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"billing_email" varchar(255),
	"plan" "tenant_plan" DEFAULT 'free' NOT NULL,
	"mfa_required" boolean DEFAULT false NOT NULL,
	"branding" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trusted_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"device_fingerprint" varchar(255) NOT NULL,
	"device_name" varchar(255),
	"trusted_until" timestamp NOT NULL,
	"ip_address" varchar(45),
	"location" varchar(255),
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	"revoked" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_credentials_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "user_personalization_settings" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"reading_level" varchar DEFAULT 'standard' NOT NULL,
	"tone" varchar DEFAULT 'neutral' NOT NULL,
	"verbosity" varchar DEFAULT 'standard' NOT NULL,
	"language" varchar DEFAULT 'en' NOT NULL,
	"allow_adaptive_prompts" boolean DEFAULT true NOT NULL,
	"allow_ai_clarification" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"settings" jsonb DEFAULT '{"celebrationEffects":true,"darkMode":"system","aiHints":true}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"full_name" varchar(255),
	"first_name" varchar(255),
	"last_name" varchar(255),
	"profile_image_url" varchar(500),
	"tenant_id" uuid,
	"role" "user_role" DEFAULT 'creator' NOT NULL,
	"tenant_role" "user_tenant_role",
	"auth_provider" "auth_provider" DEFAULT 'local' NOT NULL,
	"default_mode" text DEFAULT 'easy' NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"last_password_change" timestamp,
	"is_placeholder" boolean DEFAULT false NOT NULL,
	"placeholder_email" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "workspace_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" varchar NOT NULL,
	"role" "workspace_role" DEFAULT 'viewer' NOT NULL,
	"token" varchar NOT NULL,
	"expires_at" timestamp NOT NULL,
	"invited_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" varchar NOT NULL,
	"role" "workspace_role" DEFAULT 'viewer' NOT NULL,
	"joined_at" timestamp DEFAULT now(),
	"invited_by" varchar
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar NOT NULL,
	"slug" varchar NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"section_id" uuid,
	"type" "block_type" NOT NULL,
	"phase" "block_phase" NOT NULL,
	"config" jsonb NOT NULL,
	"virtual_step_id" uuid,
	"enabled" boolean DEFAULT true NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "collab_docs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"version_id" uuid,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "collab_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_id" uuid NOT NULL,
	"clock" integer NOT NULL,
	"state" text NOT NULL,
	"ts" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collab_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"update" text NOT NULL,
	"ts" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_hooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"final_block_document_id" varchar(255),
	"name" varchar(255) NOT NULL,
	"phase" "document_hook_phase" NOT NULL,
	"language" "transform_block_language" NOT NULL,
	"code" text NOT NULL,
	"input_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"output_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"timeout_ms" integer DEFAULT 3000,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "document_hooks_timeout_check" CHECK ("document_hooks"."timeout_ms" > 0)
);
--> statement-breakpoint
CREATE TABLE "lifecycle_hooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"section_id" uuid,
	"name" varchar(255) NOT NULL,
	"phase" "lifecycle_hook_phase" NOT NULL,
	"language" "transform_block_language" NOT NULL,
	"code" text NOT NULL,
	"input_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"output_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"virtual_step_ids" uuid[] DEFAULT '{}'::uuid[],
	"enabled" boolean DEFAULT true NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"timeout_ms" integer DEFAULT 1000,
	"mutation_mode" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "lifecycle_hooks_timeout_check" CHECK ("lifecycle_hooks"."timeout_ms" > 0)
);
--> statement-breakpoint
CREATE TABLE "logic_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"condition_step_id" uuid NOT NULL,
	"operator" "condition_operator" NOT NULL,
	"condition_value" jsonb,
	"target_type" "logic_rule_target_type" NOT NULL,
	"target_step_id" uuid,
	"target_section_id" uuid,
	"action" "conditional_action" NOT NULL,
	"logical_operator" varchar DEFAULT 'AND',
	"order" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"principal_type" varchar(20) NOT NULL,
	"principal_id" varchar NOT NULL,
	"role" varchar(20) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"name" varchar(255),
	"description" text,
	"creator_id" varchar NOT NULL,
	"tenant_id" uuid,
	"created_by" varchar,
	"owner_id" varchar NOT NULL,
	"owner_type" "owner_type",
	"owner_uuid" varchar,
	"status" "project_status" DEFAULT 'active' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"title" varchar NOT NULL,
	"description" text,
	"order" integer NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb,
	"visible_if" jsonb,
	"skip_if" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"type" "step_type" NOT NULL,
	"title" varchar NOT NULL,
	"description" text,
	"required" boolean DEFAULT false,
	"options" jsonb,
	"alias" text,
	"default_value" jsonb,
	"order" integer NOT NULL,
	"is_virtual" boolean DEFAULT false NOT NULL,
	"visible_if" jsonb,
	"repeater_config" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "template_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"file_ref" varchar(500) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"mapping" jsonb DEFAULT '{}'::jsonb,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"notes" text,
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"file_ref" varchar(500) NOT NULL,
	"type" "template_type" NOT NULL,
	"helpers_version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"mapping" jsonb DEFAULT '{}'::jsonb,
	"current_version" integer DEFAULT 1,
	"last_modified_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "transform_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"section_id" uuid,
	"name" varchar NOT NULL,
	"language" "transform_block_language" NOT NULL,
	"code" text NOT NULL,
	"input_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"output_key" varchar NOT NULL,
	"virtual_step_id" uuid,
	"phase" "block_phase" DEFAULT 'onSectionSubmit' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"timeout_ms" integer DEFAULT 1000,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "transform_blocks_timeout_check" CHECK ("transform_blocks"."timeout_ms" > 0)
);
--> statement-breakpoint
CREATE TABLE "workflow_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"principal_type" varchar(20) NOT NULL,
	"principal_id" varchar NOT NULL,
	"role" varchar(20) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "workflow_blueprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"creator_id" varchar,
	"name" varchar(255) NOT NULL,
	"description" text,
	"graph_json" jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"source_workflow_id" uuid,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "workflow_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"name" text NOT NULL,
	"values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"workflow_version_id" uuid,
	"version_hash" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "workflow_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_version_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"key" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "workflow_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"base_id" uuid,
	"version_number" integer DEFAULT 1 NOT NULL,
	"is_draft" boolean DEFAULT false NOT NULL,
	"graph_json" jsonb NOT NULL,
	"migration_info" jsonb,
	"changelog" jsonb,
	"notes" text,
	"checksum" text,
	"created_by" varchar,
	"published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"creator_id" varchar,
	"owner_id" varchar,
	"mode_override" text,
	"public_link" text,
	"name" varchar(255),
	"project_id" uuid,
	"current_version_id" uuid,
	"is_public" boolean DEFAULT false NOT NULL,
	"slug" text,
	"require_login" boolean DEFAULT false NOT NULL,
	"intake_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"pinned_version_id" uuid,
	"status" "workflow_status" DEFAULT 'draft' NOT NULL,
	"owner_type" "owner_type",
	"owner_uuid" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"source_blueprint_id" uuid,
	CONSTRAINT "workflows_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "ai_workflow_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid,
	"user_id" varchar,
	"operation_type" varchar NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"ai_provider" varchar,
	"ai_model" varchar,
	"prompt_version" varchar,
	"quality_score" integer,
	"quality_passed" boolean,
	"issues_count" integer,
	"request_description" text,
	"generated_sections" integer,
	"generated_steps" integer,
	"was_edited" boolean DEFAULT false,
	"edit_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "ai_workflow_feedback_rating_check" CHECK ("ai_workflow_feedback"."rating" >= 0)
);
--> statement-breakpoint
CREATE TABLE "block_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"block_id" varchar NOT NULL,
	"total_visits" integer DEFAULT 0,
	"avg_time_ms" integer DEFAULT 0,
	"dropoff_count" integer DEFAULT 0,
	"validation_error_count" integer DEFAULT 0,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "metrics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"workflow_id" uuid,
	"run_id" uuid,
	"type" "metrics_event_type" NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_ms" integer,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "metrics_rollups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"workflow_id" uuid,
	"bucket_start" timestamp with time zone NOT NULL,
	"bucket" "rollup_bucket" NOT NULL,
	"runs_count" integer DEFAULT 0 NOT NULL,
	"runs_success" integer DEFAULT 0 NOT NULL,
	"runs_error" integer DEFAULT 0 NOT NULL,
	"dur_p50" integer,
	"dur_p95" integer,
	"pdf_success" integer DEFAULT 0 NOT NULL,
	"pdf_error" integer DEFAULT 0 NOT NULL,
	"docx_success" integer DEFAULT 0 NOT NULL,
	"docx_error" integer DEFAULT 0 NOT NULL,
	"queue_enqueued" integer DEFAULT 0 NOT NULL,
	"queue_dequeued" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "review_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"status" "review_task_status" DEFAULT 'pending' NOT NULL,
	"reviewer_id" varchar,
	"reviewer_email" varchar(255),
	"message" text,
	"comment" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "run_generated_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"file_url" text NOT NULL,
	"mime_type" text,
	"file_size" integer,
	"template_id" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "script_execution_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"script_type" varchar(50) NOT NULL,
	"script_id" uuid NOT NULL,
	"script_name" varchar(255),
	"phase" varchar(50),
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"status" "script_execution_status" NOT NULL,
	"error_message" text,
	"console_output" jsonb,
	"input_sample" jsonb,
	"output_sample" jsonb,
	"duration_ms" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "signature_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signature_request_id" uuid NOT NULL,
	"type" "signature_event_type" NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"payload" jsonb
);
--> statement-breakpoint
CREATE TABLE "signature_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"signer_email" varchar(255) NOT NULL,
	"signer_name" varchar(255),
	"status" "signature_request_status" DEFAULT 'pending' NOT NULL,
	"provider" "signature_provider" DEFAULT 'native' NOT NULL,
	"provider_request_id" text,
	"token" text NOT NULL,
	"document_url" text,
	"redirect_url" text,
	"message" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"signed_at" timestamp,
	CONSTRAINT "signature_requests_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "sli_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"workflow_id" uuid,
	"target_success_pct" integer DEFAULT 99 NOT NULL,
	"target_p95_ms" integer DEFAULT 5000 NOT NULL,
	"error_budget_pct" integer DEFAULT 1 NOT NULL,
	"window" "sli_window" DEFAULT '7d' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sli_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"workflow_id" uuid,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"success_pct" integer,
	"p95_ms" integer,
	"error_budget_burn_pct" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "step_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "template_generation_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"run_id" uuid,
	"result" varchar(50) NOT NULL,
	"duration_ms" integer,
	"error_message" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "transform_block_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"status" "transform_block_run_status" NOT NULL,
	"error_message" text,
	"output_sample" jsonb
);
--> statement-breakpoint
CREATE TABLE "workflow_analytics_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"date" timestamp NOT NULL,
	"summary" jsonb NOT NULL,
	"dropoff" jsonb NOT NULL,
	"branching" jsonb NOT NULL,
	"heatmap" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "workflow_run_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"block_id" varchar,
	"page_id" uuid,
	"type" varchar NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"payload" jsonb,
	"is_preview" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_run_metrics" (
	"run_id" uuid PRIMARY KEY NOT NULL,
	"workflow_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"total_time_ms" integer,
	"pages_visited" integer DEFAULT 0,
	"blocks_visited" integer DEFAULT 0,
	"validation_errors" integer DEFAULT 0,
	"script_errors" integer DEFAULT 0,
	"completed" boolean DEFAULT false,
	"completed_at" timestamp,
	"is_preview" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"workflow_version_id" uuid,
	"run_token" text NOT NULL,
	"token_expires_at" timestamp,
	"created_by" text,
	"current_section_id" uuid,
	"progress" integer DEFAULT 0,
	"completed" boolean DEFAULT false,
	"completed_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"client_email" varchar,
	"portal_access_key" varchar,
	"access_mode" "portal_access_mode" DEFAULT 'anonymous',
	"share_token_hash" varchar,
	"share_token_expires_at" timestamp,
	"owner_type" varchar(50),
	"owner_uuid" varchar,
	CONSTRAINT "workflow_runs_run_token_unique" UNIQUE("run_token"),
	CONSTRAINT "workflow_runs_share_token_hash_unique" UNIQUE("share_token_hash")
);
--> statement-breakpoint
CREATE TABLE "collection_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"type" "collection_field_type" NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"options" jsonb,
	"default_value" jsonb,
	"order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "datavault_api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"database_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"label" text NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "datavault_columns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"type" "datavault_column_type" NOT NULL,
	"description" text,
	"width_px" integer DEFAULT 150,
	"required" boolean DEFAULT false NOT NULL,
	"is_primary_key" boolean DEFAULT false NOT NULL,
	"is_unique" boolean DEFAULT false NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"auto_number_start" integer DEFAULT 1,
	"autonumber_prefix" text,
	"autonumber_padding" integer DEFAULT 4,
	"autonumber_reset_policy" "autonumber_reset_policy" DEFAULT 'never',
	"reference_table_id" uuid,
	"reference_display_column_slug" text,
	"options" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "datavault_database_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"database_id" uuid NOT NULL,
	"principal_type" varchar(20) NOT NULL,
	"principal_id" varchar NOT NULL,
	"role" varchar(20) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "datavault_databases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"type" "data_source_type" DEFAULT 'native' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb,
	"scope_type" "datavault_scope_type" DEFAULT 'account' NOT NULL,
	"scope_id" uuid,
	"owner_type" "owner_type",
	"owner_uuid" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "datavault_number_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"column_id" uuid NOT NULL,
	"prefix" text,
	"padding" integer DEFAULT 4 NOT NULL,
	"next_value" integer DEFAULT 1 NOT NULL,
	"reset_policy" "autonumber_reset_policy" DEFAULT 'never' NOT NULL,
	"last_reset" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "datavault_row_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"row_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" varchar NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "datavault_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" varchar,
	"updated_by" varchar
);
--> statement-breakpoint
CREATE TABLE "datavault_table_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"principal_type" varchar(20) NOT NULL,
	"principal_id" varchar NOT NULL,
	"role" varchar(20) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "datavault_table_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"user_id" varchar NOT NULL,
	"role" "datavault_table_role" NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "datavault_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_user_id" varchar,
	"database_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"owner_type" "owner_type",
	"owner_uuid" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "datavault_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"row_id" uuid NOT NULL,
	"column_id" uuid NOT NULL,
	"value" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "datavault_writeback_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"column_mappings" jsonb NOT NULL,
	"trigger_phase" varchar(50) DEFAULT 'afterComplete' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" varchar
);
--> statement-breakpoint
CREATE TABLE "records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" varchar,
	"updated_by" varchar
);
--> statement-breakpoint
CREATE TABLE "workflow_data_sources" (
	"workflow_id" uuid NOT NULL,
	"data_source_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "workflow_data_sources_workflow_id_data_source_id_pk" PRIMARY KEY("workflow_id","data_source_id")
);
--> statement-breakpoint
CREATE TABLE "workflow_queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"data_source_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"filters" jsonb DEFAULT '[]'::jsonb,
	"sort" jsonb DEFAULT '[]'::jsonb,
	"limit" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"prefix" varchar(50) NOT NULL,
	"key_hash" varchar(255) NOT NULL,
	"scopes" text[] NOT NULL,
	"name" varchar NOT NULL,
	"expires_at" timestamp,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "email_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to" varchar NOT NULL,
	"subject" varchar NOT NULL,
	"html" text NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" "connection_type" NOT NULL,
	"base_url" varchar(500),
	"auth_config" jsonb DEFAULT '{}'::jsonb,
	"secret_refs" jsonb DEFAULT '{}'::jsonb,
	"oauth_state" jsonb,
	"default_headers" jsonb DEFAULT '{}'::jsonb,
	"timeout_ms" integer DEFAULT 8000,
	"retries" integer DEFAULT 2,
	"backoff_ms" integer DEFAULT 250,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_tested_at" timestamp,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "external_destinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar NOT NULL,
	"type" varchar NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "oauth_access_tokens" (
	"access_token_hash" varchar PRIMARY KEY NOT NULL,
	"refresh_token_hash" varchar,
	"client_id" varchar NOT NULL,
	"user_id" varchar,
	"workspace_id" uuid NOT NULL,
	"scope" jsonb,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "oauth_access_tokens_refresh_token_hash_unique" UNIQUE("refresh_token_hash")
);
--> statement-breakpoint
CREATE TABLE "oauth_apps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar NOT NULL,
	"client_id" varchar NOT NULL,
	"client_secret_hash" varchar NOT NULL,
	"redirect_uris" jsonb NOT NULL,
	"scopes" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "oauth_apps_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "oauth_auth_codes" (
	"code_hash" varchar PRIMARY KEY NOT NULL,
	"client_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"scope" jsonb,
	"redirect_uri" varchar NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"key" varchar NOT NULL,
	"value" text,
	"value_enc" text NOT NULL,
	"type" "secret_type" DEFAULT 'api_key' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"environment" varchar DEFAULT 'production',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"event" varchar NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "webhook_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"target_url" varchar NOT NULL,
	"events" jsonb NOT NULL,
	"secret" varchar NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "billing_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"type" varchar NOT NULL,
	"price_monthly" integer DEFAULT 0 NOT NULL,
	"price_yearly" integer DEFAULT 0 NOT NULL,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"stripe_product_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "customer_billing_info" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"stripe_customer_id" varchar NOT NULL,
	"billing_email" varchar,
	"default_payment_method_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "subscription_seats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"user_id" varchar NOT NULL,
	"assigned_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"stripe_subscription_id" varchar,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false,
	"canceled_at" timestamp,
	"trial_start" timestamp,
	"trial_end" timestamp,
	"seat_quantity" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "subscription_seat_quantity_check" CHECK ("subscriptions"."seat_quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"metric" varchar NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"workflow_id" uuid,
	"metadata" jsonb,
	"recorded_at" timestamp DEFAULT now(),
	CONSTRAINT "usage_quantity_check" CHECK ("usage_records"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "email_template_metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_key" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"subject_preview" text,
	"branding_tokens" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "email_template_metadata_template_key_unique" UNIQUE("template_key")
);
--> statement-breakpoint
CREATE TABLE "ai_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar DEFAULT 'global' NOT NULL,
	"system_prompt" text,
	"updated_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "workflow_personalization_settings" (
	"workflow_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"allow_dynamic_prompts" boolean DEFAULT true NOT NULL,
	"allow_dynamic_help" boolean DEFAULT true NOT NULL,
	"allow_dynamic_tone" boolean DEFAULT true NOT NULL,
	"default_tone" varchar DEFAULT 'neutral' NOT NULL,
	"default_reading_level" varchar DEFAULT 'standard' NOT NULL,
	"default_verbosity" varchar DEFAULT 'standard' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "system_stats" (
	"id" integer PRIMARY KEY NOT NULL,
	"total_users_created" integer DEFAULT 0 NOT NULL,
	"total_workflows_created" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "template_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"user_id" varchar,
	"pending_email" varchar(255),
	"access" "template_access" NOT NULL,
	"invited_at" timestamp DEFAULT now(),
	"accepted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "account_locks" ADD CONSTRAINT "account_locks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_backup_codes" ADD CONSTRAINT "mfa_backup_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_secrets" ADD CONSTRAINT "mfa_secrets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invites" ADD CONSTRAINT "organization_invites_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invites" ADD CONSTRAINT "organization_invites_invited_user_id_users_id_fk" FOREIGN KEY ("invited_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invites" ADD CONSTRAINT "organization_invites_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_permissions" ADD CONSTRAINT "resource_permissions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_permissions" ADD CONSTRAINT "resource_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_domains" ADD CONSTRAINT "tenant_domains_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_credentials" ADD CONSTRAINT "user_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_personalization_settings" ADD CONSTRAINT "user_personalization_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_virtual_step_id_steps_id_fk" FOREIGN KEY ("virtual_step_id") REFERENCES "public"."steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_docs" ADD CONSTRAINT "collab_docs_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_docs" ADD CONSTRAINT "collab_docs_version_id_workflow_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."workflow_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_docs" ADD CONSTRAINT "collab_docs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_snapshots" ADD CONSTRAINT "collab_snapshots_doc_id_collab_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."collab_docs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_updates" ADD CONSTRAINT "collab_updates_doc_id_collab_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."collab_docs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_hooks" ADD CONSTRAINT "document_hooks_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lifecycle_hooks" ADD CONSTRAINT "lifecycle_hooks_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lifecycle_hooks" ADD CONSTRAINT "lifecycle_hooks_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logic_rules" ADD CONSTRAINT "logic_rules_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logic_rules" ADD CONSTRAINT "logic_rules_condition_step_id_steps_id_fk" FOREIGN KEY ("condition_step_id") REFERENCES "public"."steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logic_rules" ADD CONSTRAINT "logic_rules_target_step_id_steps_id_fk" FOREIGN KEY ("target_step_id") REFERENCES "public"."steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logic_rules" ADD CONSTRAINT "logic_rules_target_section_id_sections_id_fk" FOREIGN KEY ("target_section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_access" ADD CONSTRAINT "project_access_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "steps" ADD CONSTRAINT "steps_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_last_modified_by_users_id_fk" FOREIGN KEY ("last_modified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transform_blocks" ADD CONSTRAINT "transform_blocks_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transform_blocks" ADD CONSTRAINT "transform_blocks_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transform_blocks" ADD CONSTRAINT "transform_blocks_virtual_step_id_steps_id_fk" FOREIGN KEY ("virtual_step_id") REFERENCES "public"."steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_access" ADD CONSTRAINT "workflow_access_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_blueprints" ADD CONSTRAINT "workflow_blueprints_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_blueprints" ADD CONSTRAINT "workflow_blueprints_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_blueprints" ADD CONSTRAINT "workflow_blueprints_source_workflow_id_workflows_id_fk" FOREIGN KEY ("source_workflow_id") REFERENCES "public"."workflows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_snapshots" ADD CONSTRAINT "workflow_snapshots_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_snapshots" ADD CONSTRAINT "workflow_snapshots_workflow_version_id_workflow_versions_id_fk" FOREIGN KEY ("workflow_version_id") REFERENCES "public"."workflow_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD CONSTRAINT "workflow_templates_workflow_version_id_workflow_versions_id_fk" FOREIGN KEY ("workflow_version_id") REFERENCES "public"."workflow_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD CONSTRAINT "workflow_templates_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_base_id_workflows_id_fk" FOREIGN KEY ("base_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workflow_feedback" ADD CONSTRAINT "ai_workflow_feedback_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workflow_feedback" ADD CONSTRAINT "ai_workflow_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_metrics" ADD CONSTRAINT "block_metrics_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_metrics" ADD CONSTRAINT "block_metrics_version_id_workflow_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."workflow_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics_events" ADD CONSTRAINT "metrics_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics_events" ADD CONSTRAINT "metrics_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics_events" ADD CONSTRAINT "metrics_events_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics_events" ADD CONSTRAINT "metrics_events_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics_rollups" ADD CONSTRAINT "metrics_rollups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics_rollups" ADD CONSTRAINT "metrics_rollups_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics_rollups" ADD CONSTRAINT "metrics_rollups_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_tasks" ADD CONSTRAINT "review_tasks_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_tasks" ADD CONSTRAINT "review_tasks_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_tasks" ADD CONSTRAINT "review_tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_tasks" ADD CONSTRAINT "review_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_tasks" ADD CONSTRAINT "review_tasks_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_generated_documents" ADD CONSTRAINT "run_generated_documents_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_generated_documents" ADD CONSTRAINT "run_generated_documents_template_id_workflow_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."workflow_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_execution_log" ADD CONSTRAINT "script_execution_log_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_events" ADD CONSTRAINT "signature_events_signature_request_id_signature_requests_id_fk" FOREIGN KEY ("signature_request_id") REFERENCES "public"."signature_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sli_configs" ADD CONSTRAINT "sli_configs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sli_configs" ADD CONSTRAINT "sli_configs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sli_configs" ADD CONSTRAINT "sli_configs_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sli_windows" ADD CONSTRAINT "sli_windows_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sli_windows" ADD CONSTRAINT "sli_windows_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sli_windows" ADD CONSTRAINT "sli_windows_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_values" ADD CONSTRAINT "step_values_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_values" ADD CONSTRAINT "step_values_step_id_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_generation_metrics" ADD CONSTRAINT "template_generation_metrics_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transform_block_runs" ADD CONSTRAINT "transform_block_runs_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transform_block_runs" ADD CONSTRAINT "transform_block_runs_block_id_transform_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."transform_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_analytics_snapshots" ADD CONSTRAINT "workflow_analytics_snapshots_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_analytics_snapshots" ADD CONSTRAINT "workflow_analytics_snapshots_version_id_workflow_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."workflow_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run_events" ADD CONSTRAINT "workflow_run_events_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run_events" ADD CONSTRAINT "workflow_run_events_version_id_workflow_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."workflow_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run_events" ADD CONSTRAINT "workflow_run_events_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run_metrics" ADD CONSTRAINT "workflow_run_metrics_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run_metrics" ADD CONSTRAINT "workflow_run_metrics_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run_metrics" ADD CONSTRAINT "workflow_run_metrics_version_id_workflow_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."workflow_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_version_id_workflow_versions_id_fk" FOREIGN KEY ("workflow_version_id") REFERENCES "public"."workflow_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_current_section_id_sections_id_fk" FOREIGN KEY ("current_section_id") REFERENCES "public"."sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_fields" ADD CONSTRAINT "collection_fields_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_api_tokens" ADD CONSTRAINT "datavault_api_tokens_database_id_datavault_databases_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."datavault_databases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_api_tokens" ADD CONSTRAINT "datavault_api_tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_columns" ADD CONSTRAINT "datavault_columns_table_id_datavault_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."datavault_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_columns" ADD CONSTRAINT "datavault_columns_reference_table_id_datavault_tables_id_fk" FOREIGN KEY ("reference_table_id") REFERENCES "public"."datavault_tables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_database_access" ADD CONSTRAINT "datavault_database_access_database_id_datavault_databases_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."datavault_databases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_databases" ADD CONSTRAINT "datavault_databases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_number_sequences" ADD CONSTRAINT "datavault_number_sequences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_number_sequences" ADD CONSTRAINT "datavault_number_sequences_table_id_datavault_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."datavault_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_number_sequences" ADD CONSTRAINT "datavault_number_sequences_column_id_datavault_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."datavault_columns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_row_notes" ADD CONSTRAINT "datavault_row_notes_row_id_datavault_rows_id_fk" FOREIGN KEY ("row_id") REFERENCES "public"."datavault_rows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_row_notes" ADD CONSTRAINT "datavault_row_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_row_notes" ADD CONSTRAINT "datavault_row_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_rows" ADD CONSTRAINT "datavault_rows_table_id_datavault_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."datavault_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_rows" ADD CONSTRAINT "datavault_rows_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_rows" ADD CONSTRAINT "datavault_rows_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_table_access" ADD CONSTRAINT "datavault_table_access_table_id_datavault_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."datavault_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_table_permissions" ADD CONSTRAINT "datavault_table_permissions_table_id_datavault_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."datavault_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_table_permissions" ADD CONSTRAINT "datavault_table_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_tables" ADD CONSTRAINT "datavault_tables_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_tables" ADD CONSTRAINT "datavault_tables_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_tables" ADD CONSTRAINT "datavault_tables_database_id_datavault_databases_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."datavault_databases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_values" ADD CONSTRAINT "datavault_values_row_id_datavault_rows_id_fk" FOREIGN KEY ("row_id") REFERENCES "public"."datavault_rows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_values" ADD CONSTRAINT "datavault_values_column_id_datavault_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."datavault_columns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_writeback_mappings" ADD CONSTRAINT "datavault_writeback_mappings_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_writeback_mappings" ADD CONSTRAINT "datavault_writeback_mappings_table_id_datavault_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."datavault_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_writeback_mappings" ADD CONSTRAINT "datavault_writeback_mappings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_data_sources" ADD CONSTRAINT "workflow_data_sources_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_data_sources" ADD CONSTRAINT "workflow_data_sources_data_source_id_datavault_databases_id_fk" FOREIGN KEY ("data_source_id") REFERENCES "public"."datavault_databases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_queries" ADD CONSTRAINT "workflow_queries_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_queries" ADD CONSTRAINT "workflow_queries_data_source_id_datavault_databases_id_fk" FOREIGN KEY ("data_source_id") REFERENCES "public"."datavault_databases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_queries" ADD CONSTRAINT "workflow_queries_table_id_datavault_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."datavault_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_destinations" ADD CONSTRAINT "external_destinations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_client_id_oauth_apps_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_apps"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_apps" ADD CONSTRAINT "oauth_apps_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_auth_codes" ADD CONSTRAINT "oauth_auth_codes_client_id_oauth_apps_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_apps"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_auth_codes" ADD CONSTRAINT "oauth_auth_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_subscription_id_webhook_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."webhook_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_billing_info" ADD CONSTRAINT "customer_billing_info_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_seats" ADD CONSTRAINT "subscription_seats_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_seats" ADD CONSTRAINT "subscription_seats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_billing_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."billing_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_personalization_settings" ADD CONSTRAINT "workflow_personalization_settings_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_shares" ADD CONSTRAINT "template_shares_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_shares" ADD CONSTRAINT "template_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_locks_user_idx" ON "account_locks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_locks_until_idx" ON "account_locks" USING btree ("locked_until");--> statement-breakpoint
CREATE INDEX "audit_logs_tenant_idx" ON "audit_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "audit_logs_user_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_logs_ts_entity_idx" ON "audit_logs" USING btree ("timestamp","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "email_verify_token_idx" ON "email_verification_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "email_verify_user_idx" ON "email_verification_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "login_attempts_email_idx" ON "login_attempts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "login_attempts_timestamp_idx" ON "login_attempts" USING btree ("attempted_at");--> statement-breakpoint
CREATE INDEX "mfa_backup_codes_user_idx" ON "mfa_backup_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mfa_backup_codes_hash_idx" ON "mfa_backup_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "mfa_secrets_user_idx" ON "mfa_secrets" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_invites_token_unique_idx" ON "organization_invites" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_org_invites_org_email_status" ON "organization_invites" USING btree ("org_id","invited_email","status");--> statement-breakpoint
CREATE INDEX "idx_org_invites_status" ON "organization_invites" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_org_invites_expires" ON "organization_invites" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "org_membership_unique_idx" ON "organization_memberships" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_org_memberships_org" ON "organization_memberships" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_org_memberships_user" ON "organization_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_org_memberships_role" ON "organization_memberships" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_organizations_created_by" ON "organizations" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "idx_organizations_tenant" ON "organizations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "pwd_reset_token_idx" ON "password_reset_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "pwd_reset_user_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_token_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_token_token_idx" ON "refresh_tokens" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "resource_perm_idx" ON "resource_permissions" USING btree ("resource_id","user_id","action");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE UNIQUE INDEX "team_members_idx" ON "team_members" USING btree ("team_id","user_id");--> statement-breakpoint
CREATE INDEX "teams_tenant_idx" ON "teams" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tenant_domains_tenant_idx" ON "tenant_domains" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tenant_domains_domain_idx" ON "tenant_domains" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "tenants_plan_idx" ON "tenants" USING btree ("plan");--> statement-breakpoint
CREATE INDEX "trusted_devices_user_idx" ON "trusted_devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trusted_devices_fingerprint_idx" ON "trusted_devices" USING btree ("device_fingerprint");--> statement-breakpoint
CREATE INDEX "trusted_devices_user_fingerprint_idx" ON "trusted_devices" USING btree ("user_id","device_fingerprint");--> statement-breakpoint
CREATE INDEX "user_credentials_user_idx" ON "user_credentials" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_tenant_idx" ON "users" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "users_tenant_email_idx" ON "users" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "idx_users_is_placeholder" ON "users" USING btree ("is_placeholder");--> statement-breakpoint
CREATE INDEX "idx_users_placeholder_email" ON "users" USING btree ("placeholder_email");--> statement-breakpoint
CREATE INDEX "invitation_token_idx" ON "workspace_invitations" USING btree ("token");--> statement-breakpoint
CREATE INDEX "invitation_ws_email_idx" ON "workspace_invitations" USING btree ("workspace_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_member_idx" ON "workspace_members" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_org_slug_idx" ON "workspaces" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "blocks_workflow_phase_order_idx" ON "blocks" USING btree ("workflow_id","phase","order");--> statement-breakpoint
CREATE INDEX "collab_docs_workflow_idx" ON "collab_docs" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "collab_snapshots_doc_clock_idx" ON "collab_snapshots" USING btree ("doc_id","clock");--> statement-breakpoint
CREATE INDEX "collab_updates_doc_seq_idx" ON "collab_updates" USING btree ("doc_id","seq");--> statement-breakpoint
CREATE INDEX "logic_rules_workflow_idx" ON "logic_rules" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "project_access_project_idx" ON "project_access" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_access_principal_idx" ON "project_access" USING btree ("project_id","principal_type","principal_id");--> statement-breakpoint
CREATE INDEX "projects_tenant_idx" ON "projects" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "projects_created_by_idx" ON "projects" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "projects_creator_idx" ON "projects" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "projects_owner_idx" ON "projects" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_projects_owner" ON "projects" USING btree ("owner_type","owner_uuid");--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "projects_archived_idx" ON "projects" USING btree ("archived");--> statement-breakpoint
CREATE INDEX "sections_workflow_idx" ON "sections" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "steps_section_idx" ON "steps" USING btree ("section_id");--> statement-breakpoint
CREATE UNIQUE INDEX "steps_section_alias_unique" ON "steps" USING btree ("section_id","alias");--> statement-breakpoint
CREATE UNIQUE INDEX "template_versions_unique_idx" ON "template_versions" USING btree ("template_id","version_number");--> statement-breakpoint
CREATE INDEX "templates_project_idx" ON "templates" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "workflow_access_workflow_idx" ON "workflow_access" USING btree ("workflow_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_access_principal_idx" ON "workflow_access" USING btree ("workflow_id","principal_type","principal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_snapshots_workflow_name_unique" ON "workflow_snapshots" USING btree ("workflow_id","name");--> statement-breakpoint
CREATE INDEX "workflow_templates_version_key_unique" ON "workflow_templates" USING btree ("workflow_version_id","key");--> statement-breakpoint
CREATE INDEX "workflow_versions_workflow_idx" ON "workflow_versions" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "workflow_versions_version_number_idx" ON "workflow_versions" USING btree ("workflow_id","version_number");--> statement-breakpoint
CREATE INDEX "workflow_versions_is_draft_idx" ON "workflow_versions" USING btree ("is_draft");--> statement-breakpoint
CREATE INDEX "workflows_project_idx" ON "workflows" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "workflows_status_idx" ON "workflows" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workflows_is_public_idx" ON "workflows" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "workflows_slug_idx" ON "workflows" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "workflows_pinned_version_idx" ON "workflows" USING btree ("pinned_version_id");--> statement-breakpoint
CREATE INDEX "idx_workflows_owner" ON "workflows" USING btree ("owner_type","owner_uuid");--> statement-breakpoint
CREATE INDEX "ai_feedback_workflow_idx" ON "ai_workflow_feedback" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "bm_version_block_idx" ON "block_metrics" USING btree ("version_id","block_id");--> statement-breakpoint
CREATE INDEX "metrics_events_project_ts_idx" ON "metrics_events" USING btree ("project_id","ts");--> statement-breakpoint
CREATE INDEX "metrics_events_workflow_ts_idx" ON "metrics_events" USING btree ("workflow_id","ts");--> statement-breakpoint
CREATE INDEX "metrics_events_type_idx" ON "metrics_events" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "metrics_rollups_unique_idx" ON "metrics_rollups" USING btree ("tenant_id","project_id",COALESCE("workflow_id", '00000000-0000-0000-0000-000000000000'::uuid),"bucket_start","bucket");--> statement-breakpoint
CREATE INDEX "metrics_rollups_project_bucket_idx" ON "metrics_rollups" USING btree ("project_id","bucket_start","bucket");--> statement-breakpoint
CREATE INDEX "review_tasks_run_idx" ON "review_tasks" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "review_tasks_workflow_idx" ON "review_tasks" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "review_tasks_status_idx" ON "review_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "review_tasks_reviewer_idx" ON "review_tasks" USING btree ("reviewer_id");--> statement-breakpoint
CREATE INDEX "run_generated_documents_run_idx" ON "run_generated_documents" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "script_execution_log_run_idx" ON "script_execution_log" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "signature_events_request_idx" ON "signature_events" USING btree ("signature_request_id");--> statement-breakpoint
CREATE INDEX "signature_requests_run_idx" ON "signature_requests" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "signature_requests_token_idx" ON "signature_requests" USING btree ("token");--> statement-breakpoint
CREATE INDEX "sli_configs_project_idx" ON "sli_configs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "sli_windows_project_window_idx" ON "sli_windows" USING btree ("project_id","window_start","window_end");--> statement-breakpoint
CREATE INDEX "step_values_run_idx" ON "step_values" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "step_values_step_idx" ON "step_values" USING btree ("step_id");--> statement-breakpoint
CREATE INDEX "step_values_run_step_idx" ON "step_values" USING btree ("run_id","step_id");--> statement-breakpoint
CREATE UNIQUE INDEX "step_values_run_step_unique" ON "step_values" USING btree ("run_id","step_id");--> statement-breakpoint
CREATE INDEX "template_metrics_template_idx" ON "template_generation_metrics" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "template_metrics_run_idx" ON "template_generation_metrics" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "transform_block_runs_run_idx" ON "transform_block_runs" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "transform_block_runs_block_idx" ON "transform_block_runs" USING btree ("block_id");--> statement-breakpoint
CREATE UNIQUE INDEX "was_workflow_version_date_idx" ON "workflow_analytics_snapshots" USING btree ("workflow_id","version_id","date");--> statement-breakpoint
CREATE INDEX "wre_run_idx" ON "workflow_run_events" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "wre_workflow_ts_idx" ON "workflow_run_events" USING btree ("workflow_id","timestamp");--> statement-breakpoint
CREATE INDEX "wrm_workflow_created_idx" ON "workflow_run_metrics" USING btree ("workflow_id","created_at");--> statement-breakpoint
CREATE INDEX "workflow_runs_workflow_idx" ON "workflow_runs" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_version_idx" ON "workflow_runs" USING btree ("workflow_version_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_completed_idx" ON "workflow_runs" USING btree ("completed");--> statement-breakpoint
CREATE INDEX "workflow_runs_run_token_idx" ON "workflow_runs" USING btree ("run_token");--> statement-breakpoint
CREATE INDEX "workflow_runs_share_token_idx" ON "workflow_runs" USING btree ("share_token_hash");--> statement-breakpoint
CREATE INDEX "workflow_runs_current_section_idx" ON "workflow_runs" USING btree ("current_section_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_created_at_idx" ON "workflow_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "workflow_runs_owner_idx" ON "workflow_runs" USING btree ("owner_type","owner_uuid");--> statement-breakpoint
CREATE INDEX "workflow_runs_portal_access_key_idx" ON "workflow_runs" USING btree ("portal_access_key");--> statement-breakpoint
CREATE INDEX "collection_fields_collection_idx" ON "collection_fields" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "collection_fields_slug_idx" ON "collection_fields" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "collection_fields_type_idx" ON "collection_fields" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_fields_collection_slug_unique_idx" ON "collection_fields" USING btree ("collection_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "collections_slug_unique" ON "collections" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "idx_datavault_api_tokens_database_id" ON "datavault_api_tokens" USING btree ("database_id");--> statement-breakpoint
CREATE INDEX "idx_datavault_api_tokens_token_hash" ON "datavault_api_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_token_hash" ON "datavault_api_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "datavault_columns_table_idx" ON "datavault_columns" USING btree ("table_id");--> statement-breakpoint
CREATE INDEX "datavault_columns_reference_table_idx" ON "datavault_columns" USING btree ("reference_table_id");--> statement-breakpoint
CREATE UNIQUE INDEX "datavault_columns_table_slug_unique" ON "datavault_columns" USING btree ("table_id","slug");--> statement-breakpoint
CREATE INDEX "datavault_database_access_database_idx" ON "datavault_database_access" USING btree ("database_id");--> statement-breakpoint
CREATE UNIQUE INDEX "datavault_database_access_principal_idx" ON "datavault_database_access" USING btree ("database_id","principal_type","principal_id");--> statement-breakpoint
CREATE INDEX "idx_databases_tenant" ON "datavault_databases" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_databases_scope" ON "datavault_databases" USING btree ("scope_type","scope_id");--> statement-breakpoint
CREATE INDEX "idx_datavault_databases_owner" ON "datavault_databases" USING btree ("owner_type","owner_uuid");--> statement-breakpoint
CREATE INDEX "idx_datavault_sequences_tenant" ON "datavault_number_sequences" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_datavault_sequences_table" ON "datavault_number_sequences" USING btree ("table_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_datavault_sequences_column_unique" ON "datavault_number_sequences" USING btree ("tenant_id","table_id","column_id");--> statement-breakpoint
CREATE INDEX "idx_datavault_row_notes_row_id" ON "datavault_row_notes" USING btree ("row_id");--> statement-breakpoint
CREATE INDEX "idx_datavault_row_notes_tenant_id" ON "datavault_row_notes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "datavault_rows_table_idx" ON "datavault_rows" USING btree ("table_id");--> statement-breakpoint
CREATE INDEX "datavault_rows_created_by_idx" ON "datavault_rows" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "datavault_rows_deleted_at_idx" ON "datavault_rows" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "datavault_table_access_table_idx" ON "datavault_table_access" USING btree ("table_id");--> statement-breakpoint
CREATE UNIQUE INDEX "datavault_table_access_principal_idx" ON "datavault_table_access" USING btree ("table_id","principal_type","principal_id");--> statement-breakpoint
CREATE INDEX "idx_table_permissions_table" ON "datavault_table_permissions" USING btree ("table_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_table_user_permission" ON "datavault_table_permissions" USING btree ("table_id","user_id");--> statement-breakpoint
CREATE INDEX "datavault_tables_tenant_idx" ON "datavault_tables" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "datavault_tables_owner_idx" ON "datavault_tables" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "idx_tables_database" ON "datavault_tables" USING btree ("database_id","tenant_id");--> statement-breakpoint
CREATE INDEX "idx_datavault_tables_owner" ON "datavault_tables" USING btree ("owner_type","owner_uuid");--> statement-breakpoint
CREATE UNIQUE INDEX "datavault_tables_tenant_slug_unique" ON "datavault_tables" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "datavault_values_row_idx" ON "datavault_values" USING btree ("row_id");--> statement-breakpoint
CREATE INDEX "datavault_values_column_idx" ON "datavault_values" USING btree ("column_id");--> statement-breakpoint
CREATE UNIQUE INDEX "datavault_values_row_column_unique" ON "datavault_values" USING btree ("row_id","column_id");--> statement-breakpoint
CREATE INDEX "idx_writeback_mappings_workflow" ON "datavault_writeback_mappings" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "records_collection_idx" ON "records" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "records_tenant_idx" ON "records" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_data_sources_workflow" ON "workflow_data_sources" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_queries_workflow" ON "workflow_queries" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "api_keys_project_idx" ON "api_keys" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "email_queue_status_next_attempt_idx" ON "email_queue" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "connections_tenant_idx" ON "connections" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "connections_project_idx" ON "connections" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "connections_project_name_idx" ON "connections" USING btree ("project_id","name");--> statement-breakpoint
CREATE INDEX "connections_type_idx" ON "connections" USING btree ("type");--> statement-breakpoint
CREATE INDEX "connections_enabled_idx" ON "connections" USING btree ("enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "connections_project_name_unique_idx" ON "connections" USING btree ("project_id","name");--> statement-breakpoint
CREATE INDEX "ext_dest_tenant_idx" ON "external_destinations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "oauth_apps_client_id_idx" ON "oauth_apps" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_apps_workspace_idx" ON "oauth_apps" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "secrets_project_key_env_unique" ON "secrets" USING btree ("project_id","key","environment");--> statement-breakpoint
CREATE INDEX "webhook_events_sub_idx" ON "webhook_events" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "webhook_subs_workspace_idx" ON "webhook_subscriptions" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_info_org_idx" ON "customer_billing_info" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_info_stripe_idx" ON "customer_billing_info" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seat_sub_user_idx" ON "subscription_seats" USING btree ("subscription_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sub_org_idx" ON "subscriptions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "usage_org_metric_date_idx" ON "usage_records" USING btree ("organization_id","metric","recorded_at");--> statement-breakpoint
CREATE INDEX "email_templates_key_idx" ON "email_template_metadata" USING btree ("template_key");--> statement-breakpoint
CREATE INDEX "ai_settings_scope_idx" ON "ai_settings" USING btree ("scope");