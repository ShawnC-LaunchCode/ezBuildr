import { PgTable } from 'drizzle-orm/pg-core';
import * as schema from '@shared/schema';

export interface EntityDescriptor {
  table: PgTable;
  name: string;
  scopes: Array<'workflow' | 'project' | 'tenant' | 'database'>;
  parent: { name: string; fk: string } | null;
  fields: string[];
  refs?: string[];
  jsonRefs?: string[];
  blobRefs?: string[];
  redactPaths?: string[];
  scanPaths?: string[];
  importable?: boolean;
  /**
   * NOT NULL references whose target may legitimately fall outside the export.
   * If the referenced id was not extracted, the row is dropped with a warning
   * rather than written.
   *
   * This is the invariant that keeps a bundle importable: `ImportService`
   * throws `Unresolvable reference` on a NOT NULL ref it cannot map, so a row
   * whose target did not travel turns the whole bundle into a dead artifact
   * (IEX3-1). A dropped row plus a manifest warning is strictly better than a
   * file that 400s. The referenced entity must be processed earlier in
   * ENTITY_GRAPH — `ExportService.findUnresolvedRef` reads `extractedIds`.
   */
  dropIfUnresolved?: Array<{ column: string; entity: string }>;
  /**
   * jsonb columns whose contents carry ids of *other* entities, to be reported
   * when they cannot be resolved on import (IEX3-2).
   *
   * Distinct from `jsonRefs`, which only says "run remapJsonIds over this".
   * That remap is silent about misses, so a DataVault-bound choice question —
   * including one nested inside a List — used to import cleanly while still
   * pointing at the source instance. `collectConfigEntityRefs` finds them;
   * these columns say where to look.
   */
  entityRefColumns?: string[];
  /**
   * NOT NULL columns deliberately absent from `fields` because their contents
   * must never travel, and which therefore have to be supplied on import.
   *
   * `secrets.valueEnc` is the case: withholding it is the entire point of
   * decision D-2, but the column is NOT NULL, so an import that simply omitted
   * it hit a 23502 and **no project bundle containing a secret could be
   * imported at all** (IEX3-7). Written as the empty sentinel, matching the
   * blobRefs handling in ImportService: empty fails closed, and
   * `manifest.requiresReentry` already tells the user to re-enter it.
   */
  withheldColumns?: string[];
}

export const ENTITY_GRAPH: EntityDescriptor[] = [
  {
    table: schema.projects,
    name: 'projects',
    scopes: ["project"],
    parent: null,
    fields: ["id","title","name","description","creatorId","tenantId","createdBy","ownerId","ownerType","ownerUuid","status","archived"],
  },
  {
    table: schema.secrets,
    name: 'secrets',
    scopes: ["project"],
    parent: {"name":"projects","fk":"projectId"},
    fields: ["id","projectId","key","type","environment","metadata"],
    refs: ["projectId"],
    withheldColumns: ["valueEnc"],
  },
  {
    table: schema.externalConnections,
    name: 'connections',
    scopes: ["project"],
    parent: {"name":"projects","fk":"projectId"},
    fields: ["id","tenantId","projectId","name","type","baseUrl","defaultHeaders","timeoutMs","retries","backoffMs","enabled","secretRefs"],
    refs: ["projectId"],
    // No scanPaths here on purpose. ExportService redacts before it scans
    // (applyRedaction then scanForSecrets), and redactPaths blanks the whole
    // defaultHeaders object -- so a scanPath on the same column sees nulls and
    // can never fire. Verified: redacted then scanned yields 0 warnings, the
    // same row scanned unredacted yields 1. The IEX2-14 ticket asked for this
    // entry; the ticket was wrong about the ordering.
    redactPaths: ["defaultHeaders"]
  },
  {
    table: schema.workflows,
    name: 'workflows',
    scopes: ["project","workflow"],
    parent: {"name":"projects","fk":"projectId"},
    fields: ["id","title","name","description","creatorId","ownerId","modeOverride","publicLink","projectId","currentVersionId","isPublic","slug","requireLogin","intakeConfig","settings","pinnedVersionId","status","ownerType","ownerUuid","sourceBlueprintId"],
    refs: ["projectId", "currentVersionId", "pinnedVersionId", "sourceBlueprintId"],
    jsonRefs: ["intakeConfig"],
  },
  {
    table: schema.sections,
    name: 'sections',
    scopes: ["project","workflow"],
    parent: {"name":"workflows","fk":"workflowId"},
    fields: ["id","workflowId","title","description","order","config","visibleIf","skipIf"],
    refs: ["workflowId"],
    jsonRefs: ["config","visibleIf","skipIf"],
    scanPaths: ["config"]
  },
  {
    table: schema.steps,
    name: 'steps',
    scopes: ["project","workflow"],
    parent: {"name":"sections","fk":"sectionId"},
    fields: ["id","workflowId","sectionId","type","title","description","required","config","alias","defaultValue","order","isVirtual","visibleIf"],
    refs: ["workflowId", "sectionId"],
    jsonRefs: ["config","defaultValue","visibleIf"],
    scanPaths: ["config"],
    entityRefColumns: ["config"]
  },
  {
    table: schema.logicRules,
    name: 'logic_rules',
    scopes: ["project","workflow"],
    parent: {"name":"workflows","fk":"workflowId"},
    fields: ["id","workflowId","conditionStepId","operator","conditionValue","targetType","targetStepId","targetSectionId","action","logicalOperator","order"],
    refs: ["workflowId", "conditionStepId", "targetStepId", "targetSectionId"],
    jsonRefs: ["conditionValue"],
  },
  {
    table: schema.blocks,
    name: 'blocks',
    scopes: ["project","workflow"],
    parent: {"name":"workflows","fk":"workflowId"},
    fields: ["id","workflowId","sectionId","type","phase","config","virtualStepId","enabled","order"],
    refs: ["workflowId", "sectionId", "virtualStepId"],
    jsonRefs: ["config"],
    redactPaths: ["config.headers[].value"],
    scanPaths: ["config"],
    entityRefColumns: ["config"]
  },
  {
    table: schema.transformBlocks,
    name: 'transform_blocks',
    scopes: ["project","workflow"],
    parent: {"name":"workflows","fk":"workflowId"},
    fields: ["id","workflowId","sectionId","name","language","code","inputKeys","outputKey","virtualStepId","phase","enabled","order","timeoutMs"],
    refs: ["workflowId", "sectionId", "virtualStepId"],
    scanPaths: ["code"]
  },
  {
    table: schema.lifecycleHooks,
    name: 'lifecycle_hooks',
    scopes: ["project","workflow"],
    parent: {"name":"workflows","fk":"workflowId"},
    fields: ["id","workflowId","sectionId","name","phase","language","code","inputKeys","outputKeys","virtualStepIds","enabled","order","timeoutMs","mutationMode"],
    refs: ["workflowId", "sectionId"],
    scanPaths: ["code"]
  },
  {
    table: schema.documentHooks,
    name: 'document_hooks',
    scopes: ["project","workflow"],
    parent: {"name":"workflows","fk":"workflowId"},
    fields: ["id","workflowId","finalBlockDocumentId","name","phase","language","code","inputKeys","outputKeys","enabled","order","timeoutMs"],
    refs: ["workflowId", "finalBlockDocumentId"],
    scanPaths: ["code"]
  },
  {
    table: schema.workflowVersions,
    name: 'workflow_versions',
    scopes: ["project","workflow"],
    parent: {"name":"workflows","fk":"workflowId"},
    fields: ["id","workflowId","baseId","versionNumber","isDraft","graphJson","migrationInfo","changelog","notes","checksum","createdBy","published","publishedAt"],
    refs: ["workflowId", "baseId"],
    jsonRefs: ["graphJson","migrationInfo","changelog"],
  },
  {
    table: schema.templates,
    name: 'templates',
    // In workflow scope there is no `projects` row to descend from, so
    // ExportService selects these by the ids `workflow_templates` references
    // (collected up-front by collectWorkflowRefs). Without them a workflow
    // that generates a document exports a bundle that cannot be imported at
    // all -- workflow_templates.templateId is NOT NULL (IEX3-1).
    scopes: ["project","workflow"],
    parent: {"name":"projects","fk":"projectId"},
    fields: ["id","projectId","name","description","fileRef","type","helpersVersion","metadata","mapping","currentVersion","lastModifiedBy"],
    refs: ["projectId"],
    jsonRefs: ["metadata","mapping"],
    blobRefs: ["fileRef"],
  },
  {
    table: schema.templateVersions,
    name: 'template_versions',
    // Reachable in workflow scope through the templates selected above.
    scopes: ["project","workflow"],
    parent: {"name":"templates","fk":"templateId"},
    fields: ["id","templateId","versionNumber","fileRef","metadata","mapping","createdBy","notes","isActive"],
    refs: ["templateId"],
    jsonRefs: ["metadata","mapping"],
    blobRefs: ["fileRef"],
  },
  {
    table: schema.workflowTemplates,
    name: 'workflow_templates',
    scopes: ["project","workflow"],
    parent: {"name":"workflow_versions","fk":"workflowVersionId"},
    fields: ["id","workflowVersionId","templateId","key","isPrimary"],
    refs: ["workflowVersionId", "templateId"],
    dropIfUnresolved: [{ column: "templateId", entity: "templates" }],
  },
  {
    table: schema.datavaultDatabases,
    name: 'datavault_databases',
    scopes: ["project","workflow","database"],
    parent: null,
    fields: ["id","tenantId","name","description","type","config","scopeType","scopeId","ownerType","ownerUuid"],
    refs: ["scopeId"],
    jsonRefs: ["config"],
  },
  {
    table: schema.datavaultTables,
    name: 'datavault_tables',
    scopes: ["project","workflow","database"],
    parent: {"name":"datavault_databases","fk":"databaseId"},
    fields: ["id","tenantId","ownerUserId","databaseId","name","slug","description","ownerType","ownerUuid"],
    refs: ["databaseId"],
  },
  {
    table: schema.datavaultColumns,
    name: 'datavault_columns',
    scopes: ["project","workflow","database"],
    parent: {"name":"datavault_tables","fk":"tableId"},
    fields: ["id","tableId","name","slug","type","description","widthPx","required","isPrimaryKey","isUnique","orderIndex","autoNumberStart","autonumberPrefix","autonumberPadding","autonumberResetPolicy","referenceTableId","referenceDisplayColumnSlug","options"],
    refs: ["tableId", "referenceTableId"],
    jsonRefs: ["options"],
  },
  {
    table: schema.datavaultNumberSequences,
    name: 'datavault_number_sequences',
    scopes: ["project","workflow","database"],
    parent: {"name":"datavault_tables","fk":"tableId"},
    fields: ["id","tenantId","tableId","columnId","prefix","padding","nextValue","resetPolicy","lastReset"],
    refs: ["tableId", "columnId"],
  },
  {
    table: schema.datavaultRows,
    name: 'datavault_rows',
    scopes: ["project","workflow","database"],
    parent: {"name":"datavault_tables","fk":"tableId"},
    fields: ["id","tableId","deletedAt","createdBy","updatedBy"],
    refs: ["tableId"],
  },
  {
    table: schema.datavaultValues,
    name: 'datavault_values',
    scopes: ["project","workflow","database"],
    parent: {"name":"datavault_rows","fk":"rowId"},
    fields: ["id","rowId","columnId","value"],
    refs: ["rowId", "columnId"],
    jsonRefs: ["value"],
  },
  {
    table: schema.workflowDataSources,
    name: 'workflow_data_sources',
    scopes: ["project","workflow"],
    parent: {"name":"workflows","fk":"workflowId"},
    fields: ["workflowId","dataSourceId"],
    refs: ["workflowId", "dataSourceId"],
    dropIfUnresolved: [{ column: "dataSourceId", entity: "datavault_databases" }],
  },
  {
    table: schema.workflowQueries,
    name: 'workflow_queries',
    scopes: ["project","workflow"],
    parent: {"name":"workflows","fk":"workflowId"},
    fields: ["id","workflowId","dataSourceId","tableId","name","filters","sort","limit"],
    refs: ["workflowId", "dataSourceId", "tableId"],
    jsonRefs: ["filters","sort"],
    dropIfUnresolved: [
      { column: "dataSourceId", entity: "datavault_databases" },
      { column: "tableId", entity: "datavault_tables" }
    ],
  },
];

export const EXCLUDED_TABLES: Record<string, string> = {
  'project_access': 'Access control lists are instance-bound and never exported.',
  'workflow_access': 'Access control lists are instance-bound and never exported.',
  'datavault_database_access': 'Access control lists are instance-bound and never exported.',
  'datavault_table_access': 'Access control lists are instance-bound and never exported.',
  'tenants': 'System identity is instance-specific and not portable.',
  'users': 'User identities belong to the host system.',
  'organizations': 'Organization structure is instance-bound.',
  'organization_memberships': 'Memberships are specific to the host organization.',
  'organization_invites': 'Invites are ephemeral state.',
  'workspaces': 'Workspaces are organizational units in the host.',
  'workspace_members': 'Workspace memberships are local state.',
  'workspace_invitations': 'Workspace invitations are local state.',
  'tenant_domains': 'Custom domains are environment-specific routing.',
  'teams': 'Teams are organizational units.',
  'team_members': 'Team memberships are local.',
  'user_credentials': 'Passwords and credentials are never exported.',
  'refresh_tokens': 'Tokens are sensitive session material.',
  'password_reset_tokens': 'Reset tokens are sensitive ephemeral material.',
  'email_verification_tokens': 'Verification tokens are sensitive.',
  'login_attempts': 'Security logs are not exported.',
  'account_locks': 'Account lockouts are local security state.',
  'mfa_secrets': 'MFA secrets are highly sensitive and never exported.',
  'mfa_backup_codes': 'MFA backup codes are sensitive.',
  'trusted_devices': 'Device trust is local to the user.',
  'user_preferences': 'User UI preferences are personal to the user.',
  'user_personalization_settings': 'Personalization settings are user-bound.',
  'portal_tokens': 'Portal tokens are sensitive access grants.',
  'audit_logs': 'Audit logs are historical compliance data for the host.',
  'resource_permissions': 'Permissions are evaluated locally based on roles.',
  'sessions': 'Active sessions are sensitive ephemeral state.',
  'invalidated_tokens': 'Token blacklists are local security state.',
  'workflow_snapshots': 'Historical workflow snapshots are omitted to reduce bundle size.',
  'workflow_blueprints': 'Blueprints are instance templates, not exported directly.',
  'collab_docs': 'Live collaboration documents are transient runtime state.',
  'collab_updates': 'Collaboration updates are transient.',
  'collab_snapshots': 'Collaboration snapshots are transient.',
  'workflow_runs': 'Excluded by decision D-1 (workflow runs are instance data).',
  'run_completion_jobs': 'Completion jobs are background worker state.',
  'step_values': 'Step values belong to workflow runs.',
  'review_tasks': 'Review tasks are associated with workflow runs.',
  'signature_requests': 'Signature requests are runtime instance data.',
  'signature_events': 'Signature events are runtime audit data.',
  'run_generated_documents': 'Generated documents belong to workflow runs.',
  'transform_block_runs': 'Transform runs are runtime execution logs.',
  'script_execution_log': 'Execution logs are historical runtime data.',
  'workflow_run_events': 'Run events are runtime telemetry.',
  'workflow_run_metrics': 'Run metrics are operational telemetry.',
  'template_generation_metrics': 'Generation metrics are operational data.',
  'ai_workflow_feedback': 'AI feedback is operational telemetry.',
  'workflow_analytics_snapshots': 'Analytics snapshots are materialized views of local data.',
  'block_metrics': 'Block execution metrics are telemetry.',
  'metrics_events': 'Raw metric events are telemetry.',
  'metrics_rollups': 'Aggregated metrics are telemetry.',
  'sli_configs': 'SLI configurations are operational monitoring.',
  'sli_windows': 'SLI windows are monitoring data.',
  'datavault_row_notes': 'Row annotations are instance data.',
  'datavault_api_tokens': 'DataVault API tokens are sensitive access credentials.',
  'datavault_table_permissions': 'DataVault permissions are tied to local roles.',
  'datavault_unique_keys': 'Derived unique index key table, populated from active row values.',
  'collections': 'Legacy collections are superseded by DataVault.',
  'collection_fields': 'Legacy collection fields.',
  'records': 'Legacy collection records.',
  'external_destinations': 'External webhook destinations are instance-specific integrations.',
  'api_keys': 'Platform API keys are sensitive.',
  'webhook_subscriptions': 'Webhook subscriptions are tied to external host endpoints.',
  'webhook_events': 'Webhook delivery logs are telemetry.',
  'oauth_apps': 'OAuth application configs are instance-specific.',
  'oauth_auth_codes': 'OAuth authorization codes are sensitive and ephemeral.',
  'oauth_access_tokens': 'OAuth access tokens are sensitive material.',
  'email_queue': 'Pending emails are local background jobs.',
  'billing_plans': 'Billing plans are platform configuration.',
  'subscriptions': 'Customer subscriptions are billing data.',
  'subscription_seats': 'Subscription seat allocations are billing data.',
  'customer_billing_info': 'Customer payment details are sensitive billing data.',
  'usage_records': 'Usage records are for billing purposes.',
  'email_template_metadata': 'Global email templates are platform configuration.',
  'ai_settings': 'Global AI settings are platform configuration.',
  'workflow_personalization_settings': 'Workflow personalization is local state.',
  'ai_usage': 'AI usage metrics are billing/telemetry data.',
  'system_stats': 'System wide statistics are host telemetry.',
  'template_shares': 'Template sharing links are instance-specific.'
};





