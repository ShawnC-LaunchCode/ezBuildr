# Database Schema Reference

Inventory of all **104 PostgreSQL tables**, organized by the `shared/schema/*.ts` domain file that defines them (verified July 2026).

**Source of truth is the Drizzle schema in `shared/schema/` — always check the domain file for exact columns before writing queries or migrations.** Entries are `sql_table_name` (`tsExportName` when it differs beyond casing). Schema changes go through the `db-schema-change` skill; update this file when tables are added or removed.

> **Row-Level Security (SEC-051):** the 24 tables with a direct `tenant_id` column have a `tenant_isolation` RLS policy defined in [`migrations/0001_enable_rls.sql`](../../migrations/0001_enable_rls.sql). The indirectly-scoped `workflows` / `sections` / `steps` (no `tenant_id`) get ownership/join-based `tenant_isolation` policies in [`migrations/0005_rls_phase4_workflows_sections_steps.sql`](../../migrations/0005_rls_phase4_workflows_sections_steps.sql) (SEC-051 phase 4 / ICW-B2). All defined, not yet enforced — see [TENANT_ISOLATION_RLS.md](../architecture/TENANT_ISOLATION_RLS.md). RLS policies live in SQL migrations, **not** in the Drizzle schema. A new tenant-scoped table must add a policy in a new migration.

## Workflow Core — `shared/schema/workflow.ts` (20 tables)

| Table | Purpose |
|-------|---------|
| `projects` | Top-level containers (tenant-scoped) |
| `workflows` | Workflow definitions, status, public link |
| `workflow_versions` | Published version history (JSONB snapshot) |
| `workflow_snapshots` | Test-data snapshots for the builder |
| `templates` / `template_versions` | Document templates + versioning |
| `workflow_blueprints` | Template blueprint structures (JSONB) |
| `workflow_templates` | Reusable workflow templates |
| `sections` | Pages/sections: order, skipLogic, visibleIf |
| `steps` | Individual steps: workflowId, type, workflow-unique alias, config, visibleIf, defaultValue |
| `logic_rules` | Conditional logic rules |
| `blocks` | Reusable workflow blocks (see `blockTypeEnum` below) |
| `transform_blocks` | JS/Python code blocks: code, inputKeys, outputKey, virtualStepId |
| `lifecycle_hooks` | Workflow phase hooks: phase, language, code, mutationMode |
| `document_hooks` | Document transformation hooks (`finalBlockDocumentId`, not a FK) |
| `project_access` / `workflow_access` | Per-project / per-workflow permissions |
| `collab_docs` / `collab_updates` / `collab_snapshots` | Real-time collaboration document state |

## Auth & Tenancy — `shared/schema/auth.ts` (27 tables)

| Table | Purpose |
|-------|---------|
| `tenants` | Workspace tenants |
| `users` | User accounts (`role` gates /api/admin; `tenant_role` gates RBAC writes) |
| `organizations` / `organization_memberships` / `organization_invites` | Enterprise orgs |
| `workspaces` / `workspace_members` / `workspace_invitations` | Team workspaces |
| `tenant_domains` | Custom domains per tenant |
| `user_credentials` | Email/password credentials (local auth) |
| `refresh_tokens` / `invalidated_tokens` | JWT refresh + revocation |
| `password_reset_tokens` / `email_verification_tokens` | Account flows |
| `login_attempts` / `account_locks` | Brute-force protection |
| `mfa_secrets` / `mfa_backup_codes` / `trusted_devices` | MFA |
| `user_preferences` / `user_personalization_settings` | User settings (JSONB) |
| `portal_tokens` | Portal magic-link tokens (there is no `portal_users` table) |
| `audit_logs` | Activity/audit trail (tenant, workspace, entity scoped) |
| `resource_permissions` | Granular resource permissions |
| `sessions` | Express session store |
| `teams` / `team_members` | Teams and membership |

## Runs & Metrics — `shared/schema/run.ts` (19 tables)

| Table | Purpose |
|-------|---------|
| `workflow_runs` | Execution instances: runToken, progress, completed |
| `run_completion_jobs` | Durable leased outbox for idempotent post-completion writeback/document work |
| `step_values` | Run data storage per step |
| `review_tasks` | Human-in-the-loop review gates (FK → workflow_runs) |
| `signature_requests` / `signature_events` | E-signature requests + audit trail |
| `run_generated_documents` | Generated PDF/DOCX artifacts |
| `transform_block_runs` | Transform block execution audit |
| `script_execution_log` | Hook/script execution audit (console output, duration) |
| `workflow_run_events` / `workflow_run_metrics` | Run-level events + metrics |
| `template_generation_metrics` | Document generation metrics (`run_id` is a plain nullable column) |
| `ai_workflow_feedback` | Feedback on AI-generated workflows |
| `workflow_analytics_snapshots` | Analytics snapshots (JSONB) |
| `block_metrics` / `metrics_events` / `metrics_rollups` | Block/system metrics + rollups |
| `sli_configs` / `sli_windows` | SLI definitions + computed windows (`npm run metrics:sli`) |

> The old graph-execution tables `runs`, `run_logs`, and `run_outputs` were **dropped** (graph-builder removal, 2026). There are no legacy `surveys`/`questions`/`responses`/`answers` tables either.

## DataVault — `shared/schema/datavault.ts` (17 tables)

All DataVault tables are `datavault_`-prefixed:

| Table | Purpose |
|-------|---------|
| `datavault_databases` | Database definitions |
| `datavault_tables` | Table schemas |
| `datavault_columns` | Column definitions (see column types below) |
| `datavault_rows` / `datavault_values` | Row records + EAV cell values |
| `datavault_number_sequences` | Auto-number sequences |
| `datavault_row_notes` | Row comments |
| `datavault_api_tokens` | External API access tokens |
| `datavault_table_permissions` | Per-user table access — single `role` enum (owner/write/read) |
| `datavault_database_access` / `datavault_table_access` | Database/table-level ACLs |
| `datavault_writeback_mappings` | Workflow → DataVault writeback config |
| `workflow_data_sources` / `workflow_queries` | DataVault as workflow data source |
| `collections` / `collection_fields` / `records` | Legacy collections (still present) |

**Column types (`datavaultColumnTypeEnum`):** text, number, date, datetime, boolean, select, multiselect, email, phone, url, json, reference, autonumber, auto_number

## Integrations — `shared/schema/integrations.ts` (10 tables)

| Table | Purpose |
|-------|---------|
| `connections` (TS: `externalConnections`) | API connections: `type`, authConfig, secretRefs, oauthState, tenantId |
| `secrets` | Encrypted credentials: key, value, valueEnc, type, metadata, environment |
| `external_destinations` | External data destinations |
| `api_keys` | API token storage |
| `webhook_subscriptions` / `webhook_events` | Webhooks |
| `oauth_apps` / `oauth_auth_codes` / `oauth_access_tokens` | OAuth provider tables |
| `email_queue` | Outbound email queue |

**Connection types:** api_key, bearer, oauth2_client_credentials, oauth2_3leg
**Secret types:** api_key, bearer, oauth2, basic_auth

## Billing — `shared/schema/billing.ts` (5 tables)

`billing_plans`, `subscriptions`, `subscription_seats`, `customer_billing_info`, `usage_records` — Stripe plans, subscriptions, seats, billing info, usage metering.

## Other domains

| File | Tables |
|------|--------|
| `shared/schema/ai.ts` | `ai_settings`, `workflow_personalization_settings` |
| `shared/schema/template_shares.ts` | `template_shares` |
| `shared/schema/system.ts` | `system_stats` |
| `shared/schema/files.ts` | `files` |
| `shared/schema/branding.ts` | `email_template_metadata` |

`shared/schema/analytics.ts` defines TypeScript interfaces only (no tables). `relations.ts` holds Drizzle relations; `index.ts` is the barrel.

## Key Enums (defined in `shared/schema/workflow.ts`)

**Step types (`stepTypeEnum`, 37 values):**
- Legacy/existing: `short_text`, `long_text`, `multiple_choice`, `radio`, `yes_no`, `date_time`, `file_upload`, `computed`, `js_question`, `final_documents`, `signature_block`
- Easy mode: `true_false`, `phone`, `date`, `time`, `datetime`, `email`, `number`, `currency`, `scale`, `website`, `display`, `address`, `final`
- Advanced mode: `text`, `boolean`, `phone_advanced`, `datetime_unified`, `choice`, `email_advanced`, `number_advanced`, `scale_advanced`, `website_advanced`, `address_advanced`, `multi_field`, `display_advanced`
- Structural: `list` (nestable repeating question; unsupported in the runner until the List initiative's Phase 3 lands — see `tickets/LIST_QUESTION_TICKETS.md`). Replaced `repeater`/`loop_group`, both dropped from the enum in LIST-13 (migration `0009`) along with the `steps.repeater_config` column.

(Note: there is no `checkbox` or plain `signature` step type.)

**Condition operators (`conditionOperatorEnum`):** equals, not_equals, contains, not_contains, greater_than, less_than, between, is_empty, is_not_empty
(`shared/types/conditions.ts` defines a much richer 28-operator `ComparisonOperator` union for the logic engine — starts_with, date diffs, includes_all, etc.)

**Conditional actions (`conditionalActionEnum`):** show, hide, require, make_optional, skip_to

**Block types (`blockTypeEnum`):** prefill, validate, branch, create_record, update_record, find_record, delete_record, query, write, external_send, read_table, list_tools

**Lifecycle hook phases:** beforePage, afterPage, beforeFinalBlock, afterDocumentsGenerated
**Document hook phases:** beforeGeneration, afterGeneration
**Script languages:** JavaScript (vm2/vm sandbox), Python (subprocess isolation)
