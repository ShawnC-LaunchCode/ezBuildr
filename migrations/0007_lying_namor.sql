CREATE TYPE "auth_provider" AS ENUM('local', 'google');--> statement-breakpoint
CREATE TYPE "autonumber_reset_policy" AS ENUM('never', 'yearly');--> statement-breakpoint
CREATE TYPE "block_phase" AS ENUM('onRunStart', 'onSectionEnter', 'onSectionSubmit', 'onNext', 'onRunComplete');--> statement-breakpoint
CREATE TYPE "block_type" AS ENUM('prefill', 'validate', 'branch', 'create_record', 'update_record', 'find_record', 'delete_record', 'query', 'write', 'external_send', 'read_table', 'list_tools');--> statement-breakpoint
CREATE TYPE "collection_field_type" AS ENUM('text', 'number', 'boolean', 'date', 'datetime', 'file', 'select', 'multi_select', 'json');--> statement-breakpoint
CREATE TYPE "connection_type" AS ENUM('api_key', 'bearer', 'oauth2_client_credentials', 'oauth2_3leg');--> statement-breakpoint
CREATE TYPE "data_source_type" AS ENUM('native', 'postgres', 'google_sheets', 'airtable', 'external');--> statement-breakpoint
CREATE TYPE "datavault_column_type" AS ENUM('text', 'number', 'boolean', 'date', 'datetime', 'email', 'phone', 'url', 'json', 'auto_number', 'autonumber', 'reference', 'select', 'multiselect');--> statement-breakpoint
CREATE TYPE "datavault_scope_type" AS ENUM('account', 'project', 'workflow');--> statement-breakpoint
CREATE TYPE "datavault_table_role" AS ENUM('owner', 'write', 'read');--> statement-breakpoint
CREATE TYPE "document_hook_phase" AS ENUM('beforeGeneration', 'afterGeneration');--> statement-breakpoint
CREATE TYPE "email_queue_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "external_destination_type" AS ENUM('webhook', 'google_sheets', 'airtable', 'zapier', 'make');--> statement-breakpoint
CREATE TYPE "lifecycle_hook_phase" AS ENUM('beforePage', 'afterPage', 'beforeFinalBlock', 'afterDocumentsGenerated');--> statement-breakpoint
CREATE TYPE "log_level" AS ENUM('info', 'warn', 'error');--> statement-breakpoint
CREATE TYPE "logic_rule_target_type" AS ENUM('section', 'step');--> statement-breakpoint
CREATE TYPE "metrics_event_type" AS ENUM('run_started', 'run_succeeded', 'run_failed', 'pdf_succeeded', 'pdf_failed', 'docx_succeeded', 'docx_failed', 'queue_enqueued', 'queue_dequeued');--> statement-breakpoint
CREATE TYPE "output_file_type" AS ENUM('docx', 'pdf');--> statement-breakpoint
CREATE TYPE "output_status" AS ENUM('pending', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "portal_access_mode" AS ENUM('anonymous', 'token', 'portal');--> statement-breakpoint
CREATE TYPE "project_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public_access_mode" AS ENUM('open', 'link_only', 'domain_restricted');--> statement-breakpoint
CREATE TYPE "review_task_status" AS ENUM('pending', 'approved', 'changes_requested', 'rejected');--> statement-breakpoint
CREATE TYPE "rollup_bucket" AS ENUM('1m', '5m', '1h', '1d');--> statement-breakpoint
CREATE TYPE "run_status" AS ENUM('pending', 'success', 'error', 'waiting_review', 'waiting_signature');--> statement-breakpoint
CREATE TYPE "script_execution_status" AS ENUM('success', 'error', 'timeout');--> statement-breakpoint
CREATE TYPE "secret_type" AS ENUM('api_key', 'bearer', 'oauth2', 'basic_auth');--> statement-breakpoint
CREATE TYPE "signature_event_type" AS ENUM('sent', 'viewed', 'signed', 'declined');--> statement-breakpoint
CREATE TYPE "signature_provider" AS ENUM('native', 'docusign', 'hellosign');--> statement-breakpoint
CREATE TYPE "signature_request_status" AS ENUM('pending', 'signed', 'declined', 'expired');--> statement-breakpoint
CREATE TYPE "sli_window" AS ENUM('1d', '7d', '30d');--> statement-breakpoint
CREATE TYPE "step_type" AS ENUM('short_text', 'long_text', 'multiple_choice', 'radio', 'yes_no', 'date_time', 'file_upload', 'loop_group', 'computed', 'js_question', 'repeater', 'final_documents', 'signature_block', 'true_false', 'phone', 'date', 'time', 'datetime', 'email', 'number', 'currency', 'scale', 'website', 'display', 'address', 'final', 'text', 'boolean', 'phone_advanced', 'datetime_unified', 'choice', 'email_advanced', 'number_advanced', 'scale_advanced', 'website_advanced', 'address_advanced', 'multi_field', 'display_advanced');--> statement-breakpoint
CREATE TYPE "subscription_status" AS ENUM('active', 'past_due', 'canceled', 'trialing', 'incomplete', 'incomplete_expired', 'unpaid');--> statement-breakpoint
CREATE TYPE "template_access" AS ENUM('use', 'edit');--> statement-breakpoint
CREATE TYPE "template_type" AS ENUM('docx', 'html', 'pdf');--> statement-breakpoint
CREATE TYPE "tenant_plan" AS ENUM('free', 'pro', 'enterprise');--> statement-breakpoint
CREATE TYPE "transform_block_language" AS ENUM('javascript', 'python');--> statement-breakpoint
CREATE TYPE "transform_block_run_status" AS ENUM('success', 'timeout', 'error');--> statement-breakpoint
CREATE TYPE "transform_block_type" AS ENUM('map', 'rename', 'compute', 'conditional', 'loop', 'script');--> statement-breakpoint
CREATE TYPE "user_tenant_role" AS ENUM('owner', 'builder', 'runner', 'viewer');--> statement-breakpoint
CREATE TYPE "version_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "webhook_event" AS ENUM('workflow_run.started', 'workflow_run.page_completed', 'workflow_run.completed', 'document.generated', 'signature.completed', 'signature.declined');--> statement-breakpoint
CREATE TYPE "workflow_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "workspace_role" AS ENUM('owner', 'admin', 'editor', 'contributor', 'viewer');--> statement-breakpoint
ALTER TYPE "conditional_action" ADD VALUE IF NOT EXISTS 'skip_to';--> statement-breakpoint
ALTER TYPE "survey_status" ADD VALUE IF NOT EXISTS 'active';--> statement-breakpoint
ALTER TYPE "survey_status" ADD VALUE IF NOT EXISTS 'archived';--> statement-breakpoint
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
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"prefix" varchar(50) NOT NULL,
	"key_hash" varchar(255) NOT NULL,
	"scopes" text[] NOT NULL,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" varchar,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" varchar(100) NOT NULL,
	"diff" jsonb,
	"ts" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" varchar,
	"action" varchar NOT NULL,
	"resource_type" varchar NOT NULL,
	"resource_id" varchar,
	"changes" jsonb,
	"ip_address" varchar,
	"user_agent" text,
	"timestamp" timestamp DEFAULT now()
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
CREATE TABLE "collection_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"type" "collection_field_type" NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"options" jsonb,
	"default_value" jsonb,
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
CREATE TABLE "datavault_databases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"type" "data_source_type" DEFAULT 'native' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb,
	"scope_type" "datavault_scope_type" DEFAULT 'account' NOT NULL,
	"scope_id" uuid,
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
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "email_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to" varchar NOT NULL,
	"subject" varchar NOT NULL,
	"html" text NOT NULL,
	"status" "email_queue_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "email_template_metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_key" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"subject_preview" text,
	"branding_tokens" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "email_template_metadata_template_key_unique" UNIQUE("template_key")
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
CREATE TABLE "external_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"base_url" varchar(500) NOT NULL,
	"auth_type" varchar(50) NOT NULL,
	"secret_id" uuid,
	"default_headers" jsonb DEFAULT '{}'::jsonb,
	"timeout_ms" integer DEFAULT 8000,
	"retries" integer DEFAULT 2,
	"backoff_ms" integer DEFAULT 250,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "external_destinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" "external_destination_type" NOT NULL,
	"name" varchar(255) NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
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
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "logic_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"condition_step_id" uuid NOT NULL,
	"operator" "condition_operator" NOT NULL,
	"condition_value" jsonb NOT NULL,
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
CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"ip_address" varchar(45),
	"successful" boolean DEFAULT false NOT NULL,
	"attempted_at" timestamp DEFAULT now() NOT NULL
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
CREATE TABLE "oauth_access_tokens" (
	"access_token" varchar PRIMARY KEY NOT NULL,
	"refresh_token" varchar,
	"client_id" varchar NOT NULL,
	"user_id" varchar,
	"workspace_id" uuid NOT NULL,
	"scope" jsonb,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "oauth_access_tokens_refresh_token_unique" UNIQUE("refresh_token")
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
	"code" varchar PRIMARY KEY NOT NULL,
	"client_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"scope" jsonb,
	"redirect_uri" varchar NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"slug" varchar NOT NULL,
	"domain" varchar,
	"settings" jsonb DEFAULT '{}'::jsonb,
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
	"status" "project_status" DEFAULT 'active' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
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
CREATE TABLE "run_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"node_id" varchar(100),
	"level" "log_level" NOT NULL,
	"message" text NOT NULL,
	"context" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "run_outputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"workflow_version_id" uuid NOT NULL,
	"template_key" text NOT NULL,
	"file_type" "output_file_type" NOT NULL,
	"storage_path" text NOT NULL,
	"status" "output_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_version_id" uuid NOT NULL,
	"input_json" jsonb,
	"output_refs" jsonb,
	"trace" jsonb,
	"status" "run_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"duration_ms" integer,
	"run_token" varchar,
	"share_token" varchar,
	"share_token_expires_at" timestamp,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "runs_run_token_unique" UNIQUE("run_token"),
	CONSTRAINT "runs_share_token_unique" UNIQUE("share_token")
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
CREATE TABLE "secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"key" varchar(255) NOT NULL,
	"value_enc" text NOT NULL,
	"type" "secret_type" DEFAULT 'api_key' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "secrets_project_key_unique" UNIQUE("project_id","key")
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
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "survey_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"content" jsonb NOT NULL,
	"creator_id" varchar,
	"is_system" boolean DEFAULT false NOT NULL,
	"tags" text[] DEFAULT ARRAY[]::text[],
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "system_stats" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"total_surveys_created" integer DEFAULT 0 NOT NULL,
	"total_surveys_deleted" integer DEFAULT 0 NOT NULL,
	"total_responses_collected" integer DEFAULT 0 NOT NULL,
	"total_responses_deleted" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now()
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
CREATE TABLE "template_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"user_id" varchar,
	"pending_email" text,
	"access" "template_access" DEFAULT 'use' NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now(),
	"accepted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "template_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"file_ref" varchar(500) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"mapping" jsonb DEFAULT '{}'::jsonb,
	"created_by" uuid,
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
	"last_modified_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tenant_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"domain" text NOT NULL,
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
CREATE TABLE "usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"metric" varchar NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"workflow_id" uuid,
	"metadata" jsonb,
	"recorded_at" timestamp DEFAULT now()
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
CREATE TABLE "workflow_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"principal_type" varchar(20) NOT NULL,
	"principal_id" varchar NOT NULL,
	"role" varchar(20) NOT NULL,
	"created_at" timestamp DEFAULT now()
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
CREATE TABLE "workflow_blueprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"creator_id" varchar NOT NULL,
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
CREATE TABLE "workflow_data_sources" (
	"workflow_id" uuid NOT NULL,
	"data_source_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "workflow_data_sources_workflow_id_data_source_id_pk" PRIMARY KEY("workflow_id","data_source_id")
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
	"share_token" varchar,
	"share_token_expires_at" timestamp,
	CONSTRAINT "workflow_runs_run_token_unique" UNIQUE("run_token"),
	CONSTRAINT "workflow_runs_share_token_unique" UNIQUE("share_token")
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
	"created_by" varchar NOT NULL,
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
	"creator_id" varchar NOT NULL,
	"owner_id" varchar NOT NULL,
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
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"source_blueprint_id" uuid,
	CONSTRAINT "workflows_slug_unique" UNIQUE("slug")
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

DROP TABLE IF EXISTS "global_recipients" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "recipients" CASCADE;--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_email_unique";--> statement-breakpoint
ALTER TABLE "answers" DROP CONSTRAINT IF EXISTS "answers_question_id_questions_id_fk";
--> statement-breakpoint
ALTER TABLE "answers" DROP CONSTRAINT IF EXISTS "answers_subquestion_id_loop_group_subquestions_id_fk";
--> statement-breakpoint
ALTER TABLE "conditional_rules" DROP CONSTRAINT IF EXISTS "conditional_rules_condition_question_id_questions_id_fk";
--> statement-breakpoint
ALTER TABLE "conditional_rules" DROP CONSTRAINT IF EXISTS "conditional_rules_target_question_id_questions_id_fk";
--> statement-breakpoint
ALTER TABLE "conditional_rules" DROP CONSTRAINT IF EXISTS "conditional_rules_target_page_id_survey_pages_id_fk";
--> statement-breakpoint
ALTER TABLE "responses" DROP CONSTRAINT IF EXISTS "responses_recipient_id_recipients_id_fk";
--> statement-breakpoint
ALTER TABLE "surveys" ALTER COLUMN "anonymous_access_type" SET DEFAULT 'unlimited';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "first_name" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "last_name" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "profile_image_url" SET DATA TYPE varchar(500);--> statement-breakpoint
ALTER TABLE "loop_group_subquestions" ADD COLUMN IF NOT EXISTS "loop_config" jsonb;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN IF NOT EXISTS "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN IF NOT EXISTS "is_public" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN IF NOT EXISTS "public_access_mode" "public_access_mode" DEFAULT 'link_only';--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN IF NOT EXISTS "public_slug" varchar;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN IF NOT EXISTS "allowed_domains" jsonb;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN IF NOT EXISTS "public_settings" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "full_name" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tenant_role" "user_tenant_role";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "auth_provider" "auth_provider" DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "default_mode" text DEFAULT 'easy' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mfa_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_password_change" timestamp;--> statement-breakpoint
ALTER TABLE "account_locks" DROP CONSTRAINT IF EXISTS "account_locks_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "account_locks" ADD CONSTRAINT "account_locks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" DROP CONSTRAINT IF EXISTS "api_keys_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" DROP CONSTRAINT IF EXISTS "audit_events_actor_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_metrics" DROP CONSTRAINT IF EXISTS "block_metrics_workflow_id_workflows_id_fk";--> statement-breakpoint
ALTER TABLE "block_metrics" ADD CONSTRAINT "block_metrics_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_metrics" DROP CONSTRAINT IF EXISTS "block_metrics_version_id_workflow_versions_id_fk";--> statement-breakpoint
ALTER TABLE "block_metrics" ADD CONSTRAINT "block_metrics_version_id_workflow_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "workflow_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" DROP CONSTRAINT IF EXISTS "blocks_workflow_id_workflows_id_fk";--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" DROP CONSTRAINT IF EXISTS "blocks_section_id_sections_id_fk";--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" DROP CONSTRAINT IF EXISTS "blocks_virtual_step_id_steps_id_fk";--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_virtual_step_id_steps_id_fk" FOREIGN KEY ("virtual_step_id") REFERENCES "steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_docs" DROP CONSTRAINT IF EXISTS "collab_docs_workflow_id_workflows_id_fk";--> statement-breakpoint
ALTER TABLE "collab_docs" ADD CONSTRAINT "collab_docs_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_docs" DROP CONSTRAINT IF EXISTS "collab_docs_version_id_workflow_versions_id_fk";--> statement-breakpoint
ALTER TABLE "collab_docs" ADD CONSTRAINT "collab_docs_version_id_workflow_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "workflow_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_docs" DROP CONSTRAINT IF EXISTS "collab_docs_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "collab_docs" ADD CONSTRAINT "collab_docs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_snapshots" DROP CONSTRAINT IF EXISTS "collab_snapshots_doc_id_collab_docs_id_fk";--> statement-breakpoint
ALTER TABLE "collab_snapshots" ADD CONSTRAINT "collab_snapshots_doc_id_collab_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "collab_docs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_updates" DROP CONSTRAINT IF EXISTS "collab_updates_doc_id_collab_docs_id_fk";--> statement-breakpoint
ALTER TABLE "collab_updates" ADD CONSTRAINT "collab_updates_doc_id_collab_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "collab_docs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_fields" DROP CONSTRAINT IF EXISTS "collection_fields_collection_id_collections_id_fk";--> statement-breakpoint
ALTER TABLE "collection_fields" ADD CONSTRAINT "collection_fields_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" DROP CONSTRAINT IF EXISTS "collections_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" DROP CONSTRAINT IF EXISTS "connections_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" DROP CONSTRAINT IF EXISTS "connections_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_billing_info" DROP CONSTRAINT IF EXISTS "customer_billing_info_organization_id_organizations_id_fk";--> statement-breakpoint
ALTER TABLE "customer_billing_info" ADD CONSTRAINT "customer_billing_info_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_api_tokens" DROP CONSTRAINT IF EXISTS "datavault_api_tokens_database_id_datavault_databases_id_fk";--> statement-breakpoint
ALTER TABLE "datavault_api_tokens" ADD CONSTRAINT "datavault_api_tokens_database_id_datavault_databases_id_fk" FOREIGN KEY ("database_id") REFERENCES "datavault_databases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_api_tokens" DROP CONSTRAINT IF EXISTS "datavault_api_tokens_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "datavault_api_tokens" ADD CONSTRAINT "datavault_api_tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_columns" DROP CONSTRAINT IF EXISTS "datavault_columns_table_id_datavault_tables_id_fk";--> statement-breakpoint
ALTER TABLE "datavault_columns" ADD CONSTRAINT "datavault_columns_table_id_datavault_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "datavault_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_databases" DROP CONSTRAINT IF EXISTS "datavault_databases_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "datavault_databases" ADD CONSTRAINT "datavault_databases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_number_sequences" DROP CONSTRAINT IF EXISTS "datavault_number_sequences_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "datavault_number_sequences" ADD CONSTRAINT "datavault_number_sequences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_number_sequences" DROP CONSTRAINT IF EXISTS "datavault_number_sequences_table_id_datavault_tables_id_fk";--> statement-breakpoint
ALTER TABLE "datavault_number_sequences" ADD CONSTRAINT "datavault_number_sequences_table_id_datavault_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "datavault_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_number_sequences" DROP CONSTRAINT IF EXISTS "datavault_number_sequences_column_id_datavault_columns_id_fk";--> statement-breakpoint
ALTER TABLE "datavault_number_sequences" ADD CONSTRAINT "datavault_number_sequences_column_id_datavault_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "datavault_columns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_row_notes" DROP CONSTRAINT IF EXISTS "datavault_row_notes_row_id_datavault_rows_id_fk";--> statement-breakpoint
ALTER TABLE "datavault_row_notes" ADD CONSTRAINT "datavault_row_notes_row_id_datavault_rows_id_fk" FOREIGN KEY ("row_id") REFERENCES "datavault_rows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_row_notes" DROP CONSTRAINT IF EXISTS "datavault_row_notes_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "datavault_row_notes" ADD CONSTRAINT "datavault_row_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_row_notes" DROP CONSTRAINT IF EXISTS "datavault_row_notes_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "datavault_row_notes" ADD CONSTRAINT "datavault_row_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_rows" DROP CONSTRAINT IF EXISTS "datavault_rows_table_id_datavault_tables_id_fk";--> statement-breakpoint
ALTER TABLE "datavault_rows" ADD CONSTRAINT "datavault_rows_table_id_datavault_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "datavault_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_rows" DROP CONSTRAINT IF EXISTS "datavault_rows_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "datavault_rows" ADD CONSTRAINT "datavault_rows_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_rows" DROP CONSTRAINT IF EXISTS "datavault_rows_updated_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "datavault_rows" ADD CONSTRAINT "datavault_rows_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_table_permissions" DROP CONSTRAINT IF EXISTS "datavault_table_permissions_table_id_datavault_tables_id_fk";--> statement-breakpoint
ALTER TABLE "datavault_table_permissions" ADD CONSTRAINT "datavault_table_permissions_table_id_datavault_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "datavault_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_table_permissions" DROP CONSTRAINT IF EXISTS "datavault_table_permissions_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "datavault_table_permissions" ADD CONSTRAINT "datavault_table_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_tables" DROP CONSTRAINT IF EXISTS "datavault_tables_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "datavault_tables" ADD CONSTRAINT "datavault_tables_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_tables" DROP CONSTRAINT IF EXISTS "datavault_tables_owner_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "datavault_tables" ADD CONSTRAINT "datavault_tables_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_tables" DROP CONSTRAINT IF EXISTS "datavault_tables_database_id_datavault_databases_id_fk";--> statement-breakpoint
ALTER TABLE "datavault_tables" ADD CONSTRAINT "datavault_tables_database_id_datavault_databases_id_fk" FOREIGN KEY ("database_id") REFERENCES "datavault_databases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_values" DROP CONSTRAINT IF EXISTS "datavault_values_row_id_datavault_rows_id_fk";--> statement-breakpoint
ALTER TABLE "datavault_values" ADD CONSTRAINT "datavault_values_row_id_datavault_rows_id_fk" FOREIGN KEY ("row_id") REFERENCES "datavault_rows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_values" DROP CONSTRAINT IF EXISTS "datavault_values_column_id_datavault_columns_id_fk";--> statement-breakpoint
ALTER TABLE "datavault_values" ADD CONSTRAINT "datavault_values_column_id_datavault_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "datavault_columns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_hooks" DROP CONSTRAINT IF EXISTS "document_hooks_workflow_id_workflows_id_fk";--> statement-breakpoint
ALTER TABLE "document_hooks" ADD CONSTRAINT "document_hooks_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_verification_tokens" DROP CONSTRAINT IF EXISTS "email_verification_tokens_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_connections" DROP CONSTRAINT IF EXISTS "external_connections_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "external_connections" ADD CONSTRAINT "external_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_connections" DROP CONSTRAINT IF EXISTS "external_connections_secret_id_secrets_id_fk";--> statement-breakpoint
ALTER TABLE "external_connections" ADD CONSTRAINT "external_connections_secret_id_secrets_id_fk" FOREIGN KEY ("secret_id") REFERENCES "secrets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_destinations" DROP CONSTRAINT IF EXISTS "external_destinations_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "external_destinations" ADD CONSTRAINT "external_destinations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lifecycle_hooks" DROP CONSTRAINT IF EXISTS "lifecycle_hooks_workflow_id_workflows_id_fk";--> statement-breakpoint
ALTER TABLE "lifecycle_hooks" ADD CONSTRAINT "lifecycle_hooks_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lifecycle_hooks" DROP CONSTRAINT IF EXISTS "lifecycle_hooks_section_id_sections_id_fk";--> statement-breakpoint
ALTER TABLE "lifecycle_hooks" ADD CONSTRAINT "lifecycle_hooks_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logic_rules" DROP CONSTRAINT IF EXISTS "logic_rules_workflow_id_workflows_id_fk";--> statement-breakpoint
ALTER TABLE "logic_rules" ADD CONSTRAINT "logic_rules_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logic_rules" DROP CONSTRAINT IF EXISTS "logic_rules_condition_step_id_steps_id_fk";--> statement-breakpoint
ALTER TABLE "logic_rules" ADD CONSTRAINT "logic_rules_condition_step_id_steps_id_fk" FOREIGN KEY ("condition_step_id") REFERENCES "steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logic_rules" DROP CONSTRAINT IF EXISTS "logic_rules_target_step_id_steps_id_fk";--> statement-breakpoint
ALTER TABLE "logic_rules" ADD CONSTRAINT "logic_rules_target_step_id_steps_id_fk" FOREIGN KEY ("target_step_id") REFERENCES "steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logic_rules" DROP CONSTRAINT IF EXISTS "logic_rules_target_section_id_sections_id_fk";--> statement-breakpoint
ALTER TABLE "logic_rules" ADD CONSTRAINT "logic_rules_target_section_id_sections_id_fk" FOREIGN KEY ("target_section_id") REFERENCES "sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics_events" DROP CONSTRAINT IF EXISTS "metrics_events_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "metrics_events" ADD CONSTRAINT "metrics_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics_events" DROP CONSTRAINT IF EXISTS "metrics_events_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "metrics_events" ADD CONSTRAINT "metrics_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics_events" DROP CONSTRAINT IF EXISTS "metrics_events_workflow_id_workflows_id_fk";--> statement-breakpoint
ALTER TABLE "metrics_events" ADD CONSTRAINT "metrics_events_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics_events" DROP CONSTRAINT IF EXISTS "metrics_events_run_id_workflow_runs_id_fk";--> statement-breakpoint
ALTER TABLE "metrics_events" ADD CONSTRAINT "metrics_events_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "workflow_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics_rollups" DROP CONSTRAINT IF EXISTS "metrics_rollups_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "metrics_rollups" ADD CONSTRAINT "metrics_rollups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics_rollups" DROP CONSTRAINT IF EXISTS "metrics_rollups_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "metrics_rollups" ADD CONSTRAINT "metrics_rollups_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics_rollups" DROP CONSTRAINT IF EXISTS "metrics_rollups_workflow_id_workflows_id_fk";--> statement-breakpoint
ALTER TABLE "metrics_rollups" ADD CONSTRAINT "metrics_rollups_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_backup_codes" DROP CONSTRAINT IF EXISTS "mfa_backup_codes_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "mfa_backup_codes" ADD CONSTRAINT "mfa_backup_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_secrets" DROP CONSTRAINT IF EXISTS "mfa_secrets_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "mfa_secrets" ADD CONSTRAINT "mfa_secrets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_tokens" DROP CONSTRAINT IF EXISTS "oauth_access_tokens_client_id_oauth_apps_client_id_fk";--> statement-breakpoint
ALTER TABLE "oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_client_id_oauth_apps_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "oauth_apps"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_tokens" DROP CONSTRAINT IF EXISTS "oauth_access_tokens_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_tokens" DROP CONSTRAINT IF EXISTS "oauth_access_tokens_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_apps" DROP CONSTRAINT IF EXISTS "oauth_apps_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "oauth_apps" ADD CONSTRAINT "oauth_apps_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_auth_codes" DROP CONSTRAINT IF EXISTS "oauth_auth_codes_client_id_oauth_apps_client_id_fk";--> statement-breakpoint
ALTER TABLE "oauth_auth_codes" ADD CONSTRAINT "oauth_auth_codes_client_id_oauth_apps_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "oauth_apps"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_auth_codes" DROP CONSTRAINT IF EXISTS "oauth_auth_codes_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "oauth_auth_codes" ADD CONSTRAINT "oauth_auth_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" DROP CONSTRAINT IF EXISTS "password_reset_tokens_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_access" DROP CONSTRAINT IF EXISTS "project_access_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "project_access" ADD CONSTRAINT "project_access_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_creator_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_owner_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" DROP CONSTRAINT IF EXISTS "records_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" DROP CONSTRAINT IF EXISTS "records_collection_id_collections_id_fk";--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" DROP CONSTRAINT IF EXISTS "records_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" DROP CONSTRAINT IF EXISTS "records_updated_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" DROP CONSTRAINT IF EXISTS "refresh_tokens_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_permissions" DROP CONSTRAINT IF EXISTS "resource_permissions_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "resource_permissions" ADD CONSTRAINT "resource_permissions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_permissions" DROP CONSTRAINT IF EXISTS "resource_permissions_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "resource_permissions" ADD CONSTRAINT "resource_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_tasks" DROP CONSTRAINT IF EXISTS "review_tasks_run_id_runs_id_fk";--> statement-breakpoint
ALTER TABLE "review_tasks" ADD CONSTRAINT "review_tasks_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_tasks" DROP CONSTRAINT IF EXISTS "review_tasks_workflow_id_workflows_id_fk";--> statement-breakpoint
ALTER TABLE "review_tasks" ADD CONSTRAINT "review_tasks_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_tasks" DROP CONSTRAINT IF EXISTS "review_tasks_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "review_tasks" ADD CONSTRAINT "review_tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_tasks" DROP CONSTRAINT IF EXISTS "review_tasks_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "review_tasks" ADD CONSTRAINT "review_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_tasks" DROP CONSTRAINT IF EXISTS "review_tasks_reviewer_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "review_tasks" ADD CONSTRAINT "review_tasks_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_generated_documents" DROP CONSTRAINT IF EXISTS "run_generated_documents_run_id_workflow_runs_id_fk";--> statement-breakpoint
ALTER TABLE "run_generated_documents" ADD CONSTRAINT "run_generated_documents_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_generated_documents" DROP CONSTRAINT IF EXISTS "run_generated_documents_template_id_workflow_templates_id_fk";--> statement-breakpoint
ALTER TABLE "run_generated_documents" ADD CONSTRAINT "run_generated_documents_template_id_workflow_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "workflow_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_logs" DROP CONSTRAINT IF EXISTS "run_logs_run_id_runs_id_fk";--> statement-breakpoint
ALTER TABLE "run_logs" ADD CONSTRAINT "run_logs_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_outputs" DROP CONSTRAINT IF EXISTS "run_outputs_run_id_runs_id_fk";--> statement-breakpoint
ALTER TABLE "run_outputs" ADD CONSTRAINT "run_outputs_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_outputs" DROP CONSTRAINT IF EXISTS "run_outputs_workflow_version_id_workflow_versions_id_fk";--> statement-breakpoint
ALTER TABLE "run_outputs" ADD CONSTRAINT "run_outputs_workflow_version_id_workflow_versions_id_fk" FOREIGN KEY ("workflow_version_id") REFERENCES "workflow_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" DROP CONSTRAINT IF EXISTS "runs_workflow_version_id_workflow_versions_id_fk";--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_workflow_version_id_workflow_versions_id_fk" FOREIGN KEY ("workflow_version_id") REFERENCES "workflow_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" DROP CONSTRAINT IF EXISTS "runs_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_execution_log" DROP CONSTRAINT IF EXISTS "script_execution_log_run_id_workflow_runs_id_fk";--> statement-breakpoint
ALTER TABLE "script_execution_log" ADD CONSTRAINT "script_execution_log_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secrets" DROP CONSTRAINT IF EXISTS "secrets_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" DROP CONSTRAINT IF EXISTS "sections_workflow_id_workflows_id_fk";--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_events" DROP CONSTRAINT IF EXISTS "signature_events_signature_request_id_signature_requests_id_fk";--> statement-breakpoint
ALTER TABLE "signature_events" ADD CONSTRAINT "signature_events_signature_request_id_signature_requests_id_fk" FOREIGN KEY ("signature_request_id") REFERENCES "signature_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_requests" DROP CONSTRAINT IF EXISTS "signature_requests_run_id_runs_id_fk";--> statement-breakpoint
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_requests" DROP CONSTRAINT IF EXISTS "signature_requests_workflow_id_workflows_id_fk";--> statement-breakpoint
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_requests" DROP CONSTRAINT IF EXISTS "signature_requests_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_requests" DROP CONSTRAINT IF EXISTS "signature_requests_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sli_configs" DROP CONSTRAINT IF EXISTS "sli_configs_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "sli_configs" ADD CONSTRAINT "sli_configs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sli_configs" DROP CONSTRAINT IF EXISTS "sli_configs_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "sli_configs" ADD CONSTRAINT "sli_configs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sli_configs" DROP CONSTRAINT IF EXISTS "sli_configs_workflow_id_workflows_id_fk";--> statement-breakpoint
ALTER TABLE "sli_configs" ADD CONSTRAINT "sli_configs_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sli_windows" DROP CONSTRAINT IF EXISTS "sli_windows_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "sli_windows" ADD CONSTRAINT "sli_windows_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sli_windows" DROP CONSTRAINT IF EXISTS "sli_windows_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "sli_windows" ADD CONSTRAINT "sli_windows_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sli_windows" DROP CONSTRAINT IF EXISTS "sli_windows_workflow_id_workflows_id_fk";--> statement-breakpoint
ALTER TABLE "sli_windows" ADD CONSTRAINT "sli_windows_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_values" DROP CONSTRAINT IF EXISTS "step_values_run_id_workflow_runs_id_fk";--> statement-breakpoint
ALTER TABLE "step_values" ADD CONSTRAINT "step_values_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_values" DROP CONSTRAINT IF EXISTS "step_values_step_id_steps_id_fk";--> statement-breakpoint
ALTER TABLE "step_values" ADD CONSTRAINT "step_values_step_id_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "steps" DROP CONSTRAINT IF EXISTS "steps_section_id_sections_id_fk";--> statement-breakpoint
ALTER TABLE "steps" ADD CONSTRAINT "steps_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_seats" DROP CONSTRAINT IF EXISTS "subscription_seats_subscription_id_subscriptions_id_fk";--> statement-breakpoint
ALTER TABLE "subscription_seats" ADD CONSTRAINT "subscription_seats_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_seats" DROP CONSTRAINT IF EXISTS "subscription_seats_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "subscription_seats" ADD CONSTRAINT "subscription_seats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT IF EXISTS "subscriptions_organization_id_organizations_id_fk";--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT IF EXISTS "subscriptions_plan_id_billing_plans_id_fk";--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_billing_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "billing_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_templates" DROP CONSTRAINT IF EXISTS "survey_templates_creator_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "survey_templates" ADD CONSTRAINT "survey_templates_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" DROP CONSTRAINT IF EXISTS "team_members_team_id_teams_id_fk";--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" DROP CONSTRAINT IF EXISTS "team_members_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" DROP CONSTRAINT IF EXISTS "teams_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_generation_metrics" DROP CONSTRAINT IF EXISTS "template_generation_metrics_template_id_templates_id_fk";--> statement-breakpoint
ALTER TABLE "template_generation_metrics" ADD CONSTRAINT "template_generation_metrics_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_generation_metrics" DROP CONSTRAINT IF EXISTS "template_generation_metrics_run_id_workflow_runs_id_fk";--> statement-breakpoint
ALTER TABLE "template_generation_metrics" ADD CONSTRAINT "template_generation_metrics_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_shares" DROP CONSTRAINT IF EXISTS "template_shares_template_id_survey_templates_id_fk";--> statement-breakpoint
ALTER TABLE "template_shares" ADD CONSTRAINT "template_shares_template_id_survey_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "survey_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_shares" DROP CONSTRAINT IF EXISTS "template_shares_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "template_shares" ADD CONSTRAINT "template_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_versions" DROP CONSTRAINT IF EXISTS "template_versions_template_id_templates_id_fk";--> statement-breakpoint
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" DROP CONSTRAINT IF EXISTS "templates_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_domains" DROP CONSTRAINT IF EXISTS "tenant_domains_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "tenant_domains" ADD CONSTRAINT "tenant_domains_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transform_block_runs" DROP CONSTRAINT IF EXISTS "transform_block_runs_run_id_workflow_runs_id_fk";--> statement-breakpoint
ALTER TABLE "transform_block_runs" ADD CONSTRAINT "transform_block_runs_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transform_block_runs" DROP CONSTRAINT IF EXISTS "transform_block_runs_block_id_transform_blocks_id_fk";--> statement-breakpoint
ALTER TABLE "transform_block_runs" ADD CONSTRAINT "transform_block_runs_block_id_transform_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "transform_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transform_blocks" DROP CONSTRAINT IF EXISTS "transform_blocks_workflow_id_workflows_id_fk";--> statement-breakpoint
ALTER TABLE "transform_blocks" ADD CONSTRAINT "transform_blocks_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transform_blocks" DROP CONSTRAINT IF EXISTS "transform_blocks_section_id_sections_id_fk";--> statement-breakpoint
ALTER TABLE "transform_blocks" ADD CONSTRAINT "transform_blocks_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transform_blocks" DROP CONSTRAINT IF EXISTS "transform_blocks_virtual_step_id_steps_id_fk";--> statement-breakpoint
ALTER TABLE "transform_blocks" ADD CONSTRAINT "transform_blocks_virtual_step_id_steps_id_fk" FOREIGN KEY ("virtual_step_id") REFERENCES "steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_devices" DROP CONSTRAINT IF EXISTS "trusted_devices_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" DROP CONSTRAINT IF EXISTS "usage_records_organization_id_organizations_id_fk";--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" DROP CONSTRAINT IF EXISTS "usage_records_workflow_id_workflows_id_fk";--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_credentials" DROP CONSTRAINT IF EXISTS "user_credentials_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "user_credentials" ADD CONSTRAINT "user_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_personalization_settings" DROP CONSTRAINT IF EXISTS "user_personalization_settings_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "user_personalization_settings" ADD CONSTRAINT "user_personalization_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" DROP CONSTRAINT IF EXISTS "user_preferences_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" DROP CONSTRAINT IF EXISTS "webhook_events_subscription_id_webhook_subscriptions_id_fk";--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_subscription_id_webhook_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "webhook_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_subscriptions" DROP CONSTRAINT IF EXISTS "webhook_subscriptions_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_access" DROP CONSTRAINT IF EXISTS "workflow_access_workflow_id_workflows_id_fk";--> statement-breakpoint
ALTER TABLE "workflow_access" ADD CONSTRAINT "workflow_access_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_analytics_snapshots" DROP CONSTRAINT IF EXISTS "workflow_analytics_snapshots_workflow_id_workflows_id_fk";--> statement-breakpoint
ALTER TABLE "workflow_analytics_snapshots" ADD CONSTRAINT "workflow_analytics_snapshots_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_analytics_snapshots" DROP CONSTRAINT IF EXISTS "workflow_analytics_snapshots_version_id_workflow_versions_id_fk";--> statement-breakpoint
ALTER TABLE "workflow_analytics_snapshots" ADD CONSTRAINT "workflow_analytics_snapshots_version_id_workflow_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "workflow_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_blueprints" DROP CONSTRAINT IF EXISTS "workflow_blueprints_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "workflow_blueprints" ADD CONSTRAINT "workflow_blueprints_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_blueprints" DROP CONSTRAINT IF EXISTS "workflow_blueprints_creator_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "workflow_blueprints" ADD CONSTRAINT "workflow_blueprints_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_data_sources" DROP CONSTRAINT IF EXISTS "workflow_data_sources_workflow_id_workflows_id_fk";--> statement-breakpoint
ALTER TABLE "workflow_data_sources" ADD CONSTRAINT "workflow_data_sources_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_data_sources" DROP CONSTRAINT IF EXISTS "workflow_data_sources_data_source_id_datavault_databases_id_fk";--> statement-breakpoint
ALTER TABLE "workflow_data_sources" ADD CONSTRAINT "workflow_data_sources_data_source_id_datavault_databases_id_fk" FOREIGN KEY ("data_source_id") REFERENCES "datavault_databases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_personalization_settings" DROP CONSTRAINT IF EXISTS "workflow_personalization_settings_workflow_id_workflows_id_fk";--> statement-breakpoint
ALTER TABLE "workflow_personalization_settings" ADD CONSTRAINT "workflow_personalization_settings_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_queries" DROP CONSTRAINT IF EXISTS "workflow_queries_workflow_id_workflows_id_fk";--> statement-breakpoint
ALTER TABLE "workflow_queries" ADD CONSTRAINT "workflow_queries_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_queries" DROP CONSTRAINT IF EXISTS "workflow_queries_data_source_id_datavault_databases_id_fk";--> statement-breakpoint
ALTER TABLE "workflow_queries" ADD CONSTRAINT "workflow_queries_data_source_id_datavault_databases_id_fk" FOREIGN KEY ("data_source_id") REFERENCES "datavault_databases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_queries" DROP CONSTRAINT IF EXISTS "workflow_queries_table_id_datavault_tables_id_fk";--> statement-breakpoint
ALTER TABLE "workflow_queries" ADD CONSTRAINT "workflow_queries_table_id_datavault_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "datavault_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run_events" DROP CONSTRAINT IF EXISTS "workflow_run_events_run_id_workflow_runs_id_fk";--> statement-breakpoint
ALTER TABLE "workflow_run_events" ADD CONSTRAINT "workflow_run_events_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run_events" DROP CONSTRAINT IF EXISTS "workflow_run_events_version_id_workflow_versions_id_fk";--> statement-breakpoint
ALTER TABLE "workflow_run_events" ADD CONSTRAINT "workflow_run_events_version_id_workflow_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "workflow_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run_events" DROP CONSTRAINT IF EXISTS "workflow_run_events_workflow_id_workflows_id_fk";--> statement-breakpoint
ALTER TABLE "workflow_run_events" ADD CONSTRAINT "workflow_run_events_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run_metrics" DROP CONSTRAINT IF EXISTS "workflow_run_metrics_run_id_workflow_runs_id_fk";--> statement-breakpoint
ALTER TABLE "workflow_run_metrics" ADD CONSTRAINT "workflow_run_metrics_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run_metrics" DROP CONSTRAINT IF EXISTS "workflow_run_metrics_workflow_id_workflows_id_fk";--> statement-breakpoint
ALTER TABLE "workflow_run_metrics" ADD CONSTRAINT "workflow_run_metrics_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run_metrics" DROP CONSTRAINT IF EXISTS "workflow_run_metrics_version_id_workflow_versions_id_fk";--> statement-breakpoint
ALTER TABLE "workflow_run_metrics" ADD CONSTRAINT "workflow_run_metrics_version_id_workflow_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "workflow_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" DROP CONSTRAINT IF EXISTS "workflow_runs_workflow_id_workflows_id_fk";--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" DROP CONSTRAINT IF EXISTS "workflow_runs_workflow_version_id_workflow_versions_id_fk";--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_version_id_workflow_versions_id_fk" FOREIGN KEY ("workflow_version_id") REFERENCES "workflow_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" DROP CONSTRAINT IF EXISTS "workflow_runs_current_section_id_sections_id_fk";--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_current_section_id_sections_id_fk" FOREIGN KEY ("current_section_id") REFERENCES "sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_snapshots" DROP CONSTRAINT IF EXISTS "workflow_snapshots_workflow_id_workflows_id_fk";--> statement-breakpoint
ALTER TABLE "workflow_snapshots" ADD CONSTRAINT "workflow_snapshots_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_snapshots" DROP CONSTRAINT IF EXISTS "workflow_snapshots_workflow_version_id_workflow_versions_id_fk";--> statement-breakpoint
ALTER TABLE "workflow_snapshots" ADD CONSTRAINT "workflow_snapshots_workflow_version_id_workflow_versions_id_fk" FOREIGN KEY ("workflow_version_id") REFERENCES "workflow_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_templates" DROP CONSTRAINT IF EXISTS "workflow_templates_workflow_version_id_workflow_versions_id_fk";--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD CONSTRAINT "workflow_templates_workflow_version_id_workflow_versions_id_fk" FOREIGN KEY ("workflow_version_id") REFERENCES "workflow_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_templates" DROP CONSTRAINT IF EXISTS "workflow_templates_template_id_templates_id_fk";--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD CONSTRAINT "workflow_templates_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_versions" DROP CONSTRAINT IF EXISTS "workflow_versions_workflow_id_workflows_id_fk";--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_versions" DROP CONSTRAINT IF EXISTS "workflow_versions_base_id_workflows_id_fk";--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_base_id_workflows_id_fk" FOREIGN KEY ("base_id") REFERENCES "workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_versions" DROP CONSTRAINT IF EXISTS "workflow_versions_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" DROP CONSTRAINT IF EXISTS "workflows_creator_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" DROP CONSTRAINT IF EXISTS "workflows_owner_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" DROP CONSTRAINT IF EXISTS "workflows_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitations" DROP CONSTRAINT IF EXISTS "workspace_invitations_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitations" DROP CONSTRAINT IF EXISTS "workspace_invitations_invited_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" DROP CONSTRAINT IF EXISTS "workspace_members_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" DROP CONSTRAINT IF EXISTS "workspace_members_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" DROP CONSTRAINT IF EXISTS "workspace_members_invited_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" DROP CONSTRAINT IF EXISTS "workspaces_organization_id_organizations_id_fk";--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_locks_user_idx" ON "account_locks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_locks_until_idx" ON "account_locks" USING btree ("locked_until");--> statement-breakpoint
CREATE INDEX "api_keys_project_idx" ON "api_keys" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "api_keys_key_hash_idx" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "audit_events_actor_idx" ON "audit_events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_events_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_events_ts_idx" ON "audit_events" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "audit_ws_ts_idx" ON "audit_logs" USING btree ("workspace_id","timestamp");--> statement-breakpoint
CREATE INDEX "audit_resource_idx" ON "audit_logs" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "bm_version_block_idx" ON "block_metrics" USING btree ("version_id","block_id");--> statement-breakpoint
CREATE INDEX "blocks_workflow_phase_order_idx" ON "blocks" USING btree ("workflow_id","phase","order");--> statement-breakpoint
CREATE INDEX "blocks_section_idx" ON "blocks" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "collab_docs_workflow_idx" ON "collab_docs" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "collab_docs_tenant_idx" ON "collab_docs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "collab_docs_version_idx" ON "collab_docs" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "collab_snapshots_doc_clock_idx" ON "collab_snapshots" USING btree ("doc_id","clock");--> statement-breakpoint
CREATE INDEX "collab_snapshots_doc_ts_idx" ON "collab_snapshots" USING btree ("doc_id","ts");--> statement-breakpoint
CREATE INDEX "collab_updates_doc_seq_idx" ON "collab_updates" USING btree ("doc_id","seq");--> statement-breakpoint
CREATE INDEX "collab_updates_doc_ts_idx" ON "collab_updates" USING btree ("doc_id","ts");--> statement-breakpoint
CREATE INDEX "collection_fields_collection_idx" ON "collection_fields" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "collection_fields_slug_idx" ON "collection_fields" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "collection_fields_type_idx" ON "collection_fields" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_fields_collection_slug_unique_idx" ON "collection_fields" USING btree ("collection_id","slug");--> statement-breakpoint
CREATE INDEX "collections_tenant_idx" ON "collections" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "collections_slug_idx" ON "collections" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "collections_created_at_idx" ON "collections" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "collections_tenant_slug_unique_idx" ON "collections" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "connections_tenant_idx" ON "connections" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "connections_project_idx" ON "connections" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "connections_project_name_idx" ON "connections" USING btree ("project_id","name");--> statement-breakpoint
CREATE INDEX "connections_type_idx" ON "connections" USING btree ("type");--> statement-breakpoint
CREATE INDEX "connections_enabled_idx" ON "connections" USING btree ("enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "connections_project_name_unique_idx" ON "connections" USING btree ("project_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_info_org_idx" ON "customer_billing_info" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_info_stripe_idx" ON "customer_billing_info" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "idx_datavault_api_tokens_database_id" ON "datavault_api_tokens" USING btree ("database_id");--> statement-breakpoint
CREATE INDEX "idx_datavault_api_tokens_tenant_id" ON "datavault_api_tokens" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_datavault_api_tokens_token_hash" ON "datavault_api_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_datavault_api_tokens_expires_at" ON "datavault_api_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_token_hash" ON "datavault_api_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "datavault_columns_table_idx" ON "datavault_columns" USING btree ("table_id");--> statement-breakpoint
CREATE INDEX "datavault_columns_reference_table_idx" ON "datavault_columns" USING btree ("reference_table_id");--> statement-breakpoint
CREATE UNIQUE INDEX "datavault_columns_table_slug_unique" ON "datavault_columns" USING btree ("table_id","slug");--> statement-breakpoint
CREATE INDEX "idx_databases_tenant" ON "datavault_databases" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_databases_scope" ON "datavault_databases" USING btree ("scope_type","scope_id");--> statement-breakpoint
CREATE INDEX "idx_databases_updated" ON "datavault_databases" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_datavault_sequences_tenant" ON "datavault_number_sequences" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_datavault_sequences_table" ON "datavault_number_sequences" USING btree ("table_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_datavault_sequences_column_unique" ON "datavault_number_sequences" USING btree ("tenant_id","table_id","column_id");--> statement-breakpoint
CREATE INDEX "idx_datavault_row_notes_row_id" ON "datavault_row_notes" USING btree ("row_id");--> statement-breakpoint
CREATE INDEX "idx_datavault_row_notes_tenant_id" ON "datavault_row_notes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_datavault_row_notes_user_id" ON "datavault_row_notes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_datavault_row_notes_row_created" ON "datavault_row_notes" USING btree ("row_id","created_at");--> statement-breakpoint
CREATE INDEX "datavault_rows_table_idx" ON "datavault_rows" USING btree ("table_id");--> statement-breakpoint
CREATE INDEX "datavault_rows_created_by_idx" ON "datavault_rows" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_table_permissions_table" ON "datavault_table_permissions" USING btree ("table_id");--> statement-breakpoint
CREATE INDEX "idx_table_permissions_user" ON "datavault_table_permissions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_table_permissions_role" ON "datavault_table_permissions" USING btree ("table_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_table_user_permission" ON "datavault_table_permissions" USING btree ("table_id","user_id");--> statement-breakpoint
CREATE INDEX "datavault_tables_tenant_idx" ON "datavault_tables" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "datavault_tables_owner_idx" ON "datavault_tables" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "idx_tables_database" ON "datavault_tables" USING btree ("database_id","tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "datavault_tables_tenant_slug_unique" ON "datavault_tables" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "datavault_values_row_idx" ON "datavault_values" USING btree ("row_id");--> statement-breakpoint
CREATE INDEX "datavault_values_column_idx" ON "datavault_values" USING btree ("column_id");--> statement-breakpoint
CREATE UNIQUE INDEX "datavault_values_row_column_unique" ON "datavault_values" USING btree ("row_id","column_id");--> statement-breakpoint
CREATE INDEX "document_hooks_workflow_idx" ON "document_hooks" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "document_hooks_phase_idx" ON "document_hooks" USING btree ("workflow_id","phase");--> statement-breakpoint
CREATE INDEX "document_hooks_enabled_idx" ON "document_hooks" USING btree ("workflow_id","enabled");--> statement-breakpoint
CREATE INDEX "document_hooks_document_idx" ON "document_hooks" USING btree ("workflow_id","final_block_document_id");--> statement-breakpoint
CREATE INDEX "email_queue_status_idx" ON "email_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "email_queue_next_attempt_idx" ON "email_queue" USING btree ("next_attempt_at");--> statement-breakpoint
CREATE INDEX "email_template_metadata_key_idx" ON "email_template_metadata" USING btree ("template_key");--> statement-breakpoint
CREATE INDEX "email_verify_token_idx" ON "email_verification_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "email_verify_user_idx" ON "email_verification_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "external_connections_project_idx" ON "external_connections" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "external_connections_project_name_idx" ON "external_connections" USING btree ("project_id","name");--> statement-breakpoint
CREATE INDEX "external_connections_secret_idx" ON "external_connections" USING btree ("secret_id");--> statement-breakpoint
CREATE INDEX "external_destinations_tenant_idx" ON "external_destinations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "external_destinations_type_idx" ON "external_destinations" USING btree ("type");--> statement-breakpoint
CREATE INDEX "lifecycle_hooks_workflow_idx" ON "lifecycle_hooks" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "lifecycle_hooks_phase_idx" ON "lifecycle_hooks" USING btree ("workflow_id","phase");--> statement-breakpoint
CREATE INDEX "lifecycle_hooks_section_idx" ON "lifecycle_hooks" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "lifecycle_hooks_enabled_idx" ON "lifecycle_hooks" USING btree ("workflow_id","enabled");--> statement-breakpoint
CREATE INDEX "logic_rules_workflow_idx" ON "logic_rules" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "logic_rules_condition_step_idx" ON "logic_rules" USING btree ("condition_step_id");--> statement-breakpoint
CREATE INDEX "logic_rules_target_step_idx" ON "logic_rules" USING btree ("target_step_id");--> statement-breakpoint
CREATE INDEX "logic_rules_target_section_idx" ON "logic_rules" USING btree ("target_section_id");--> statement-breakpoint
CREATE INDEX "login_attempts_email_idx" ON "login_attempts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "login_attempts_timestamp_idx" ON "login_attempts" USING btree ("attempted_at");--> statement-breakpoint
CREATE INDEX "metrics_events_project_ts_idx" ON "metrics_events" USING btree ("project_id","ts");--> statement-breakpoint
CREATE INDEX "metrics_events_workflow_ts_idx" ON "metrics_events" USING btree ("workflow_id","ts");--> statement-breakpoint
CREATE INDEX "metrics_events_type_idx" ON "metrics_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "metrics_events_tenant_idx" ON "metrics_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "metrics_events_run_idx" ON "metrics_events" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "metrics_rollups_unique_idx" ON "metrics_rollups" USING btree ("tenant_id","project_id",COALESCE("workflow_id", '00000000-0000-0000-0000-000000000000'::uuid),"bucket_start","bucket");--> statement-breakpoint
CREATE INDEX "metrics_rollups_project_bucket_idx" ON "metrics_rollups" USING btree ("project_id","bucket_start","bucket");--> statement-breakpoint
CREATE INDEX "metrics_rollups_workflow_bucket_idx" ON "metrics_rollups" USING btree ("workflow_id","bucket_start","bucket");--> statement-breakpoint
CREATE INDEX "metrics_rollups_tenant_idx" ON "metrics_rollups" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "mfa_backup_codes_user_idx" ON "mfa_backup_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mfa_backup_codes_hash_idx" ON "mfa_backup_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "mfa_secrets_user_idx" ON "mfa_secrets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_apps_client_id_idx" ON "oauth_apps" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_apps_workspace_idx" ON "oauth_apps" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "pwd_reset_token_idx" ON "password_reset_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "pwd_reset_user_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "project_access_project_idx" ON "project_access" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_access_principal_idx" ON "project_access" USING btree ("project_id","principal_type","principal_id");--> statement-breakpoint
CREATE INDEX "projects_tenant_idx" ON "projects" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "projects_created_by_idx" ON "projects" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "projects_creator_idx" ON "projects" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "projects_owner_idx" ON "projects" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "projects_archived_idx" ON "projects" USING btree ("archived");--> statement-breakpoint
CREATE INDEX "records_tenant_idx" ON "records" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "records_collection_idx" ON "records" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "records_created_at_idx" ON "records" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "records_created_by_idx" ON "records" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "records_data_gin_idx" ON "records" USING btree ("data");--> statement-breakpoint
CREATE INDEX "refresh_token_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_token_token_idx" ON "refresh_tokens" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "resource_perm_idx" ON "resource_permissions" USING btree ("resource_id","user_id","action");--> statement-breakpoint
CREATE INDEX "review_tasks_run_idx" ON "review_tasks" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "review_tasks_workflow_idx" ON "review_tasks" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "review_tasks_node_idx" ON "review_tasks" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "review_tasks_status_idx" ON "review_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "review_tasks_tenant_idx" ON "review_tasks" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "review_tasks_project_idx" ON "review_tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "review_tasks_reviewer_idx" ON "review_tasks" USING btree ("reviewer_id");--> statement-breakpoint
CREATE INDEX "run_generated_documents_run_idx" ON "run_generated_documents" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "run_generated_documents_created_at_idx" ON "run_generated_documents" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "run_logs_run_idx" ON "run_logs" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "run_logs_level_idx" ON "run_logs" USING btree ("level");--> statement-breakpoint
CREATE INDEX "run_logs_created_at_idx" ON "run_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "run_outputs_run_idx" ON "run_outputs" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "run_outputs_template_key_idx" ON "run_outputs" USING btree ("template_key");--> statement-breakpoint
CREATE INDEX "run_outputs_status_idx" ON "run_outputs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "run_outputs_workflow_version_idx" ON "run_outputs" USING btree ("workflow_version_id");--> statement-breakpoint
CREATE INDEX "run_outputs_run_template_type_idx" ON "run_outputs" USING btree ("run_id","template_key","file_type");--> statement-breakpoint
CREATE INDEX "runs_workflow_version_idx" ON "runs" USING btree ("workflow_version_id");--> statement-breakpoint
CREATE INDEX "runs_status_idx" ON "runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "runs_created_by_idx" ON "runs" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "runs_created_at_idx" ON "runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "script_execution_log_run_idx" ON "script_execution_log" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "script_execution_log_script_idx" ON "script_execution_log" USING btree ("script_type","script_id");--> statement-breakpoint
CREATE INDEX "script_execution_log_status_idx" ON "script_execution_log" USING btree ("status");--> statement-breakpoint
CREATE INDEX "script_execution_log_created_idx" ON "script_execution_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "secrets_project_idx" ON "secrets" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "secrets_project_key_idx" ON "secrets" USING btree ("project_id","key");--> statement-breakpoint
CREATE INDEX "secrets_type_idx" ON "secrets" USING btree ("type");--> statement-breakpoint
CREATE INDEX "sections_workflow_idx" ON "sections" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "signature_events_request_idx" ON "signature_events" USING btree ("signature_request_id");--> statement-breakpoint
CREATE INDEX "signature_events_type_idx" ON "signature_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "signature_requests_run_idx" ON "signature_requests" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "signature_requests_workflow_idx" ON "signature_requests" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "signature_requests_node_idx" ON "signature_requests" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "signature_requests_status_idx" ON "signature_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "signature_requests_tenant_idx" ON "signature_requests" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "signature_requests_project_idx" ON "signature_requests" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "signature_requests_token_idx" ON "signature_requests" USING btree ("token");--> statement-breakpoint
CREATE INDEX "sli_configs_project_idx" ON "sli_configs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "sli_configs_workflow_idx" ON "sli_configs" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "sli_configs_tenant_idx" ON "sli_configs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "sli_windows_project_window_idx" ON "sli_windows" USING btree ("project_id","window_start","window_end");--> statement-breakpoint
CREATE INDEX "sli_windows_workflow_window_idx" ON "sli_windows" USING btree ("workflow_id","window_start","window_end");--> statement-breakpoint
CREATE INDEX "sli_windows_tenant_idx" ON "sli_windows" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "step_values_run_idx" ON "step_values" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "step_values_step_idx" ON "step_values" USING btree ("step_id");--> statement-breakpoint
CREATE INDEX "step_values_run_step_idx" ON "step_values" USING btree ("run_id","step_id");--> statement-breakpoint
CREATE UNIQUE INDEX "step_values_run_step_unique" ON "step_values" USING btree ("run_id","step_id");--> statement-breakpoint
CREATE INDEX "steps_section_idx" ON "steps" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "steps_is_virtual_idx" ON "steps" USING btree ("is_virtual");--> statement-breakpoint
CREATE UNIQUE INDEX "seat_sub_user_idx" ON "subscription_seats" USING btree ("subscription_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sub_org_idx" ON "subscriptions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "survey_templates_creator_idx" ON "survey_templates" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "survey_templates_system_idx" ON "survey_templates" USING btree ("is_system");--> statement-breakpoint
CREATE UNIQUE INDEX "team_members_idx" ON "team_members" USING btree ("team_id","user_id");--> statement-breakpoint
CREATE INDEX "teams_tenant_idx" ON "teams" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "template_metrics_template_idx" ON "template_generation_metrics" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "template_metrics_run_idx" ON "template_generation_metrics" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "template_metrics_result_idx" ON "template_generation_metrics" USING btree ("result");--> statement-breakpoint
CREATE INDEX "template_metrics_created_at_idx" ON "template_generation_metrics" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "template_shares_template_idx" ON "template_shares" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "template_shares_user_idx" ON "template_shares" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "template_shares_pending_email_idx" ON "template_shares" USING btree ("pending_email");--> statement-breakpoint
CREATE INDEX "template_versions_template_idx" ON "template_versions" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "template_versions_created_at_idx" ON "template_versions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "template_versions_created_by_idx" ON "template_versions" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "template_versions_unique_idx" ON "template_versions" USING btree ("template_id","version_number");--> statement-breakpoint
CREATE INDEX "templates_project_idx" ON "templates" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "templates_type_idx" ON "templates" USING btree ("type");--> statement-breakpoint
CREATE INDEX "tenant_domains_tenant_idx" ON "tenant_domains" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tenant_domains_domain_idx" ON "tenant_domains" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "tenants_plan_idx" ON "tenants" USING btree ("plan");--> statement-breakpoint
CREATE INDEX "transform_block_runs_run_idx" ON "transform_block_runs" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "transform_block_runs_block_idx" ON "transform_block_runs" USING btree ("block_id");--> statement-breakpoint
CREATE INDEX "transform_blocks_workflow_idx" ON "transform_blocks" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "transform_blocks_workflow_order_idx" ON "transform_blocks" USING btree ("workflow_id","order");--> statement-breakpoint
CREATE INDEX "transform_blocks_phase_idx" ON "transform_blocks" USING btree ("workflow_id","phase");--> statement-breakpoint
CREATE INDEX "transform_blocks_virtual_step_idx" ON "transform_blocks" USING btree ("virtual_step_id");--> statement-breakpoint
CREATE INDEX "trusted_devices_user_idx" ON "trusted_devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trusted_devices_fingerprint_idx" ON "trusted_devices" USING btree ("device_fingerprint");--> statement-breakpoint
CREATE INDEX "trusted_devices_user_fingerprint_idx" ON "trusted_devices" USING btree ("user_id","device_fingerprint");--> statement-breakpoint
CREATE INDEX "usage_org_metric_date_idx" ON "usage_records" USING btree ("organization_id","metric","recorded_at");--> statement-breakpoint
CREATE INDEX "user_credentials_user_idx" ON "user_credentials" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "webhook_events_sub_idx" ON "webhook_events" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "webhook_subs_workspace_idx" ON "webhook_subscriptions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workflow_access_workflow_idx" ON "workflow_access" USING btree ("workflow_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_access_principal_idx" ON "workflow_access" USING btree ("workflow_id","principal_type","principal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "was_workflow_version_date_idx" ON "workflow_analytics_snapshots" USING btree ("workflow_id","version_id","date");--> statement-breakpoint
CREATE INDEX "workflow_blueprints_tenant_idx" ON "workflow_blueprints" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "workflow_blueprints_creator_idx" ON "workflow_blueprints" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "workflow_blueprints_public_idx" ON "workflow_blueprints" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "idx_workflow_data_sources_workflow" ON "workflow_data_sources" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_data_sources_source" ON "workflow_data_sources" USING btree ("data_source_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_queries_workflow" ON "workflow_queries" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_queries_table" ON "workflow_queries" USING btree ("table_id");--> statement-breakpoint
CREATE INDEX "wre_run_idx" ON "workflow_run_events" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "wre_workflow_ts_idx" ON "workflow_run_events" USING btree ("workflow_id","timestamp");--> statement-breakpoint
CREATE INDEX "wre_version_idx" ON "workflow_run_events" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "wrm_workflow_created_idx" ON "workflow_run_metrics" USING btree ("workflow_id","created_at");--> statement-breakpoint
CREATE INDEX "wrm_version_idx" ON "workflow_run_metrics" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_workflow_idx" ON "workflow_runs" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_version_idx" ON "workflow_runs" USING btree ("workflow_version_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_completed_idx" ON "workflow_runs" USING btree ("completed");--> statement-breakpoint
CREATE INDEX "workflow_runs_run_token_idx" ON "workflow_runs" USING btree ("run_token");--> statement-breakpoint
CREATE INDEX "workflow_runs_share_token_idx" ON "workflow_runs" USING btree ("share_token");--> statement-breakpoint
CREATE INDEX "workflow_runs_current_section_idx" ON "workflow_runs" USING btree ("current_section_id");--> statement-breakpoint
CREATE INDEX "workflow_snapshots_workflow_idx" ON "workflow_snapshots" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "workflow_snapshots_created_at_idx" ON "workflow_snapshots" USING btree ("workflow_id","created_at");--> statement-breakpoint
CREATE INDEX "workflow_snapshots_version_hash_idx" ON "workflow_snapshots" USING btree ("version_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_snapshots_workflow_name_unique" ON "workflow_snapshots" USING btree ("workflow_id","name");--> statement-breakpoint
CREATE INDEX "workflow_templates_version_idx" ON "workflow_templates" USING btree ("workflow_version_id");--> statement-breakpoint
CREATE INDEX "workflow_templates_template_idx" ON "workflow_templates" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "workflow_templates_key_idx" ON "workflow_templates" USING btree ("key");--> statement-breakpoint
CREATE INDEX "workflow_templates_version_key_unique" ON "workflow_templates" USING btree ("workflow_version_id","key");--> statement-breakpoint
CREATE INDEX "workflow_versions_workflow_idx" ON "workflow_versions" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "workflow_versions_version_number_idx" ON "workflow_versions" USING btree ("workflow_id","version_number");--> statement-breakpoint
CREATE INDEX "workflow_versions_is_draft_idx" ON "workflow_versions" USING btree ("is_draft");--> statement-breakpoint
CREATE INDEX "workflow_versions_published_idx" ON "workflow_versions" USING btree ("published");--> statement-breakpoint
CREATE INDEX "workflow_versions_created_by_idx" ON "workflow_versions" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "workflow_versions_checksum_idx" ON "workflow_versions" USING btree ("checksum");--> statement-breakpoint
CREATE INDEX "workflows_project_idx" ON "workflows" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "workflows_status_idx" ON "workflows" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workflows_is_public_idx" ON "workflows" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "workflows_slug_idx" ON "workflows" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "workflows_pinned_version_idx" ON "workflows" USING btree ("pinned_version_id");--> statement-breakpoint
CREATE INDEX "workflows_source_blueprint_idx" ON "workflows" USING btree ("source_blueprint_id");--> statement-breakpoint
CREATE INDEX "invitation_token_idx" ON "workspace_invitations" USING btree ("token");--> statement-breakpoint
CREATE INDEX "invitation_ws_email_idx" ON "workspace_invitations" USING btree ("workspace_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_member_idx" ON "workspace_members" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_org_slug_idx" ON "workspaces" USING btree ("organization_id","slug");--> statement-breakpoint
ALTER TABLE "answers" DROP CONSTRAINT IF EXISTS "answers_question_id_questions_id_fk";--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" DROP CONSTRAINT IF EXISTS "answers_subquestion_id_loop_group_subquestions_id_fk";--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_subquestion_id_loop_group_subquestions_id_fk" FOREIGN KEY ("subquestion_id") REFERENCES "loop_group_subquestions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conditional_rules" DROP CONSTRAINT IF EXISTS "conditional_rules_condition_question_id_questions_id_fk";--> statement-breakpoint
ALTER TABLE "conditional_rules" ADD CONSTRAINT "conditional_rules_condition_question_id_questions_id_fk" FOREIGN KEY ("condition_question_id") REFERENCES "questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conditional_rules" DROP CONSTRAINT IF EXISTS "conditional_rules_target_question_id_questions_id_fk";--> statement-breakpoint
ALTER TABLE "conditional_rules" ADD CONSTRAINT "conditional_rules_target_question_id_questions_id_fk" FOREIGN KEY ("target_question_id") REFERENCES "questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conditional_rules" DROP CONSTRAINT IF EXISTS "conditional_rules_target_page_id_survey_pages_id_fk";--> statement-breakpoint
ALTER TABLE "conditional_rules" ADD CONSTRAINT "conditional_rules_target_page_id_survey_pages_id_fk" FOREIGN KEY ("target_page_id") REFERENCES "survey_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surveys" DROP CONSTRAINT IF EXISTS "surveys_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action NOT VALID;--> statement-breakpoint
CREATE INDEX "surveys_workspace_idx" ON "surveys" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_tenant_idx" ON "users" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "users_tenant_email_idx" ON "users" USING btree ("tenant_id","email");--> statement-breakpoint
ALTER TABLE "responses" DROP COLUMN "recipient_id";--> statement-breakpoint
ALTER TABLE "surveys" DROP CONSTRAINT IF EXISTS "surveys_public_slug_unique";--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_public_slug_unique" UNIQUE("public_slug");