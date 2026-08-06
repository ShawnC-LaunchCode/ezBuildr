/**
 * What a portability bundle deliberately leaves behind, in language a person
 * can act on.
 *
 * The engine's `EXCLUDED_TABLES` is the authority on *what* is excluded, but it
 * is 70-odd table names with engineering reasons attached — useless in a
 * dialog. This is the editorial layer: the same set, grouped into categories a
 * user can read before deciding to share a file.
 *
 * `tests/unit/portability/exclusionCategories.test.ts` asserts that every key
 * of `EXCLUDED_TABLES` appears in exactly one category here. That is the whole
 * point of the structure: a new excluded table fails the test until someone
 * decides how to describe it, so the disclosure cannot quietly go stale and
 * start understating what is withheld.
 */

export interface ExclusionCategory {
  /** Shown as the row label. */
  title: string;
  /** One sentence, plain language, no table names. */
  summary: string;
  /** The `EXCLUDED_TABLES` keys this category accounts for. */
  tables: readonly string[];
}

export const EXCLUSION_CATEGORIES: readonly ExclusionCategory[] = [
  {
    title: 'Responses and run history',
    summary:
      'Every submission, answer, generated document, signature and execution log stays here. A bundle carries the design of the workflow, never the data people entered into it.',
    tables: [
      'workflow_runs', 'run_completion_jobs', 'step_values', 'review_tasks',
      'signature_requests', 'signature_events', 'run_generated_documents',
      'run_document_deliveries', 'transform_block_runs', 'script_execution_log',
      'workflow_run_events', 'workflow_run_metrics', 'datavault_row_notes',
    ],
  },
  {
    title: 'Credentials and secrets',
    summary:
      'Secret values, API keys, tokens, MFA enrolments and stored passwords are never written to a bundle. Secrets travel as names only, so they must be re-entered after importing.',
    tables: [
      'user_credentials', 'refresh_tokens', 'password_reset_tokens',
      'email_verification_tokens', 'mfa_secrets', 'mfa_backup_codes',
      'trusted_devices', 'portal_tokens', 'run_resume_links', 'sessions',
      'invalidated_tokens',
      'datavault_api_tokens', 'api_keys', 'oauth_apps', 'oauth_auth_codes',
      'oauth_access_tokens', 'login_attempts', 'account_locks',
    ],
  },
  {
    title: 'People and access control',
    summary:
      'User accounts, organizations, teams, workspaces and every permission list are properties of this installation. The imported copy is owned by whoever imports it.',
    tables: [
      'users', 'tenants', 'organizations', 'organization_memberships',
      'organization_invites', 'workspaces', 'workspace_members',
      'workspace_invitations', 'teams', 'team_members', 'tenant_domains',
      'project_access', 'workflow_access', 'datavault_database_access',
      'datavault_table_access', 'datavault_table_permissions',
      'resource_permissions', 'user_preferences',
      'user_personalization_settings', 'workflow_personalization_settings',
      'audit_logs',
    ],
  },
  {
    title: 'Billing and usage',
    summary:
      'Plans, subscriptions, seats, payment details and usage counters belong to this account and are not part of a workflow.',
    tables: [
      'billing_plans', 'subscriptions', 'subscription_seats',
      'customer_billing_info', 'usage_records', 'ai_usage',
    ],
  },
  {
    title: 'Environment and telemetry',
    summary:
      'Instance-specific wiring — outbound webhooks, email queues, platform AI settings — plus analytics and monitoring data that describe this installation rather than the workflow.',
    tables: [
      'external_destinations', 'webhook_subscriptions', 'webhook_events',
      'email_queue', 'email_template_metadata', 'ai_settings',
      'ai_workflow_feedback', 'workflow_analytics_snapshots', 'block_metrics',
      'metrics_events', 'metrics_rollups', 'sli_configs', 'sli_windows',
      'template_generation_metrics', 'system_stats', 'template_shares',
    ],
  },
  {
    title: 'Superseded and transient records',
    summary:
      'Live collaboration state, historical snapshots and retired legacy tables are omitted to keep the file small and the import predictable.',
    tables: [
      'collab_docs', 'collab_updates', 'collab_snapshots',
      'workflow_snapshots', 'workflow_blueprints',
      'collections', 'collection_fields', 'records',
      'datavault_unique_keys',
    ],
  },
] as const;
