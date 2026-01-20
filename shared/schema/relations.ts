import { relations } from 'drizzle-orm';

import {
    users, tenants, tenantDomains, organizations, workspaces, teams, teamMembers,
    organizationMemberships, auditLogs, portalTokens, workspaceMembers
} from './auth';
// analyticsEvents is in legacy.ts! import it from there or run.ts?
// Checked Step 545: analyticsEvents is in legacy.ts.

import {
    datavaultDatabases, datavaultTables, datavaultColumns, datavaultRows,
    datavaultValues, datavaultNumberSequences, datavaultRowNotes,
    datavaultApiTokens, datavaultTablePermissions, datavaultWritebackMappings,
    workflowDataSources, workflowQueries,
    collections, collectionFields, records
} from './datavault';
import {
    secrets, externalConnections, externalDestinations, apiKeys,
    webhookSubscriptions, webhookEvents, oauthApps, oauthAuthCodes, oauthAccessTokens
} from './integrations';
// } from './legacy';
import {
    runs, workflowRuns, stepValues, runLogs, reviewTasks, signatureRequests,
    signatureEvents, runOutputs, runGeneratedDocuments, transformBlockRuns,
    scriptExecutionLog, workflowRunEvents, workflowRunMetrics,
    blockMetrics, // analyticsEvents fixed
    metricsEvents, metricsRollups, sliConfigs, sliWindows, templateGenerationMetrics
} from './run';
import {
    projects, workflows, workflowVersions, templates, templateVersions,
    workflowTemplates, sections, steps, logicRules, blocks, transformBlocks,
    lifecycleHooks, documentHooks, projectAccess, workflowAccess,
    collabDocs, collabUpdates, collabSnapshots
} from './workflow';

// ===================================================================
// RELATIONS
// ===================================================================

// Auth Relations
export const tenantsRelations = relations(tenants, ({ many }) => ({
    users: many(users), // Link via membership
    projects: many(projects),
    domains: many(tenantDomains),
    collections: many(collections),
    records: many(records),
    externalDestinations: many(externalDestinations),
    datavaultDatabases: many(datavaultDatabases),
    datavaultTables: many(datavaultTables),
}));

export const tenantDomainsRelations = relations(tenantDomains, ({ one }) => ({
    tenant: one(tenants, {
        fields: [tenantDomains.tenantId],
        references: [tenants.id],
    }),
}));

export const usersRelations = relations(users, ({ many }) => ({
    memberships: many(organizationMemberships),
    teams: many(teamMembers),
}));

export const organizationMembershipsRelations = relations(organizationMemberships, ({ one }) => ({
    user: one(users, {
        fields: [organizationMemberships.userId],
        references: [users.id],
    }),

}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
    tenant: one(tenants, {
        fields: [teams.tenantId],
        references: [tenants.id],
    }),
    members: many(teamMembers),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
    team: one(teams, {
        fields: [teamMembers.teamId],
        references: [teams.id],
    }),
    user: one(users, {
        fields: [teamMembers.userId],
        references: [users.id],
    }),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
    organization: one(organizations, { // Organizations is alias for tenants if used that way
        fields: [workspaces.organizationId],
        references: [organizations.id],
    }),
    webhookSubscriptions: many(webhookSubscriptions),
    oauthApps: many(oauthApps),
    members: many(workspaceMembers),
}));


// Workflow Relations
export const projectsRelations = relations(projects, ({ one, many }) => ({
    tenant: one(tenants, {
        fields: [projects.tenantId],
        references: [tenants.id],
    }),
    workflows: many(workflows),
    templates: many(templates),
    secrets: many(secrets),
    apiKeys: many(apiKeys),
    externalConnections: many(externalConnections),
    sliConfigs: many(sliConfigs),
    sliWindows: many(sliWindows),
    // metricsEvents: many(metricsEvents),
    // metricsRollups: many(metricsRollups),

}));

export const workflowsRelations = relations(workflows, ({ one, many }) => ({
    project: one(projects, {
        fields: [workflows.projectId],
        references: [projects.id],
    }),
    currentVersion: one(workflowVersions, {
        fields: [workflows.currentVersionId],
        references: [workflowVersions.id],
    }),
    versions: many(workflowVersions),
    sections: many(sections),
    logicRules: many(logicRules),
    runs: many(workflowRuns),
    transformBlocks: many(transformBlocks),
    lifecycleHooks: many(lifecycleHooks),
    documentHooks: many(documentHooks),
    dataSources: many(workflowDataSources),
    queries: many(workflowQueries),
    collabDocs: many(collabDocs),
}));

export const workflowVersionsRelations = relations(workflowVersions, ({ one, many }) => ({
    workflow: one(workflows, {
        fields: [workflowVersions.workflowId],
        references: [workflows.id],
    }),
    createdByUser: one(users, {
        fields: [workflowVersions.createdBy],
        references: [users.id],
    }),
    runs: many(runs), // Legacy runs
    workflowRuns: many(workflowRuns), // Modern runs?
    workflowTemplates: many(workflowTemplates),
}));

export const templatesRelations = relations(templates, ({ one, many }) => ({
    project: one(projects, {
        fields: [templates.projectId],
        references: [projects.id],
    }),
    lastModifiedByUser: one(users, {
        fields: [templates.lastModifiedBy],
        references: [users.id],
    }),
    workflowTemplates: many(workflowTemplates),
    versions: many(templateVersions),
    metrics: many(templateGenerationMetrics),
}));

export const templateVersionsRelations = relations(templateVersions, ({ one }) => ({
    template: one(templates, {
        fields: [templateVersions.templateId],
        references: [templates.id],
    }),
    createdByUser: one(users, {
        fields: [templateVersions.createdBy],
        references: [users.id],
    }),
}));

export const workflowTemplatesRelations = relations(workflowTemplates, ({ one }) => ({
    workflowVersion: one(workflowVersions, {
        fields: [workflowTemplates.workflowVersionId],
        references: [workflowVersions.id],
    }),
    template: one(templates, {
        fields: [workflowTemplates.templateId],
        references: [templates.id],
    }),
}));

export const sectionsRelations = relations(sections, ({ one, many }) => ({
    workflow: one(workflows, {
        fields: [sections.workflowId],
        references: [workflows.id],
    }),
    steps: many(steps),
    blocks: many(blocks),
}));

export const stepsRelations = relations(steps, ({ one, many }) => ({
    section: one(sections, {
        fields: [steps.sectionId],
        references: [sections.id],
    }),
    values: many(stepValues),
}));

export const logicRulesRelations = relations(logicRules, ({ one }) => ({
    workflow: one(workflows, {
        fields: [logicRules.workflowId],
        references: [workflows.id],
    }),
    conditionStep: one(steps, {
        fields: [logicRules.conditionStepId],
        references: [steps.id],
    }),
    targetStep: one(steps, {
        fields: [logicRules.targetStepId],
        references: [steps.id],
    }),
    targetSection: one(sections, {
        fields: [logicRules.targetSectionId],
        references: [sections.id],
    }),
}));

export const blocksRelations = relations(blocks, ({ one }) => ({
    workflow: one(workflows, {
        fields: [blocks.workflowId],
        references: [workflows.id],
    }),
    section: one(sections, {
        fields: [blocks.sectionId],
        references: [sections.id],
    }),
}));

export const transformBlocksRelations = relations(transformBlocks, ({ one, many }) => ({
    workflow: one(workflows, {
        fields: [transformBlocks.workflowId],
        references: [workflows.id],
    }),
    runs: many(transformBlockRuns),
}));

export const lifecycleHooksRelations = relations(lifecycleHooks, ({ one }) => ({
    workflow: one(workflows, {
        fields: [lifecycleHooks.workflowId],
        references: [workflows.id],
    }),
    section: one(sections, {
        fields: [lifecycleHooks.sectionId],
        references: [sections.id],
    }),
}));

export const documentHooksRelations = relations(documentHooks, ({ one }) => ({
    workflow: one(workflows, {
        fields: [documentHooks.workflowId],
        references: [workflows.id],
    }),
}));

export const projectAccessRelations = relations(projectAccess, ({ one }) => ({
    project: one(projects, {
        fields: [projectAccess.projectId],
        references: [projects.id],
    }),
}));

export const workflowAccessRelations = relations(workflowAccess, ({ one }) => ({
    workflow: one(workflows, {
        fields: [workflowAccess.workflowId],
        references: [workflows.id],
    }),
}));

export const collabDocsRelations = relations(collabDocs, ({ one, many }) => ({
    workflow: one(workflows, {
        fields: [collabDocs.workflowId],
        references: [workflows.id],
    }),
    version: one(workflowVersions, {
        fields: [collabDocs.versionId],
        references: [workflowVersions.id],
    }),
    tenant: one(tenants, {
        fields: [collabDocs.tenantId],
        references: [tenants.id],
    }),
    updates: many(collabUpdates),
    snapshots: many(collabSnapshots),
}));

export const collabUpdatesRelations = relations(collabUpdates, ({ one }) => ({
    doc: one(collabDocs, {
        fields: [collabUpdates.docId],
        references: [collabDocs.id],
    }),
}));

export const collabSnapshotsRelations = relations(collabSnapshots, ({ one }) => ({
    doc: one(collabDocs, {
        fields: [collabSnapshots.docId],
        references: [collabDocs.id],
    }),
}));


// Run Relations
export const runsRelations = relations(runs, ({ one, many }) => ({
    workflowVersion: one(workflowVersions, {
        fields: [runs.workflowVersionId],
        references: [workflowVersions.id],
    }),
    createdByUser: one(users, {
        fields: [runs.createdBy],
        references: [users.id],
    }),
    logs: many(runLogs),
    outputs: many(runOutputs),
}));

export const workflowRunsRelations = relations(workflowRuns, ({ one, many }) => ({
    workflow: one(workflows, {
        fields: [workflowRuns.workflowId],
        references: [workflows.id],
    }),
    currentSection: one(sections, {
        fields: [workflowRuns.currentSectionId],
        references: [sections.id],
    }),
    stepValues: many(stepValues),
    transformBlockRuns: many(transformBlockRuns),
    generatedDocuments: many(runGeneratedDocuments),
}));

export const stepValuesRelations = relations(stepValues, ({ one }) => ({
    run: one(workflowRuns, {
        fields: [stepValues.runId],
        references: [workflowRuns.id],
    }),
    step: one(steps, {
        fields: [stepValues.stepId],
        references: [steps.id],
    }),
}));

export const runLogsRelations = relations(runLogs, ({ one }) => ({
    run: one(runs, {
        fields: [runLogs.runId],
        references: [runs.id],
    }),
}));

export const reviewTasksRelations = relations(reviewTasks, ({ one }) => ({
    run: one(runs, {
        fields: [reviewTasks.runId],
        references: [runs.id],
    }),
    workflow: one(workflows, {
        fields: [reviewTasks.workflowId],
        references: [workflows.id],
    }),
    reviewer: one(users, {
        fields: [reviewTasks.reviewerId],
        references: [users.id],
    }),
}));

export const signatureRequestsRelations = relations(signatureRequests, ({ one, many }) => ({
    run: one(runs, {
        fields: [signatureRequests.runId],
        references: [runs.id],
    }),
    workflow: one(workflows, {
        fields: [signatureRequests.workflowId],
        references: [workflows.id],
    }),
    events: many(signatureEvents),
}));

export const signatureEventsRelations = relations(signatureEvents, ({ one }) => ({
    request: one(signatureRequests, {
        fields: [signatureEvents.signatureRequestId],
        references: [signatureRequests.id],
    }),
}));

export const runOutputsRelations = relations(runOutputs, ({ one }) => ({
    run: one(runs, {
        fields: [runOutputs.runId],
        references: [runs.id],
    }),
    workflowVersion: one(workflowVersions, {
        fields: [runOutputs.workflowVersionId],
        references: [workflowVersions.id],
    }),
}));

export const runGeneratedDocumentsRelations = relations(runGeneratedDocuments, ({ one }) => ({
    run: one(workflowRuns, {
        fields: [runGeneratedDocuments.runId],
        references: [workflowRuns.id],
    }),
    template: one(workflowTemplates, {
        fields: [runGeneratedDocuments.templateId],
        references: [workflowTemplates.id],
    }),
}));

export const transformBlockRunsRelations = relations(transformBlockRuns, ({ one }) => ({
    run: one(workflowRuns, {
        fields: [transformBlockRuns.runId],
        references: [workflowRuns.id],
    }),
    block: one(transformBlocks, {
        fields: [transformBlockRuns.blockId],
        references: [transformBlocks.id],
    }),
}));

export const scriptExecutionLogRelations = relations(scriptExecutionLog, ({ one }) => ({
    run: one(workflowRuns, {
        fields: [scriptExecutionLog.runId],
        references: [workflowRuns.id],
    }),
}));

export const templateGenerationMetricsRelations = relations(templateGenerationMetrics, ({ one }) => ({
    template: one(templates, {
        fields: [templateGenerationMetrics.templateId],
        references: [templates.id],
    }),
    run: one(runs, { // Or workflowRuns? Schema says runs.
        fields: [templateGenerationMetrics.runId],
        references: [runs.id],
    }),
}));


// Analytics Relations
export const metricsEventsRelations = relations(metricsEvents, ({ one }) => ({
    tenant: one(tenants, {
        fields: [metricsEvents.tenantId],
        references: [tenants.id],
    }),
    project: one(projects, {
        fields: [metricsEvents.projectId],
        references: [projects.id],
    }),
    workflow: one(workflows, {
        fields: [metricsEvents.workflowId],
        references: [workflows.id],
    }),
    run: one(workflowRuns, {
        fields: [metricsEvents.runId],
        references: [workflowRuns.id],
    }),
}));

export const metricsRollupsRelations = relations(metricsRollups, ({ one }) => ({
    tenant: one(tenants, {
        fields: [metricsRollups.tenantId],
        references: [tenants.id],
    }),
    project: one(projects, {
        fields: [metricsRollups.projectId],
        references: [projects.id],
    }),
    workflow: one(workflows, {
        fields: [metricsRollups.workflowId],
        references: [workflows.id],
    }),
}));

export const sliConfigsRelations = relations(sliConfigs, ({ one }) => ({
    tenant: one(tenants, {
        fields: [sliConfigs.tenantId],
        references: [tenants.id],
    }),
    project: one(projects, {
        fields: [sliConfigs.projectId],
        references: [projects.id],
    }),
    workflow: one(workflows, {
        fields: [sliConfigs.workflowId],
        references: [workflows.id],
    }),
}));

export const sliWindowsRelations = relations(sliWindows, ({ one }) => ({
    tenant: one(tenants, {
        fields: [sliWindows.tenantId],
        references: [tenants.id],
    }),
    project: one(projects, {
        fields: [sliWindows.projectId],
        references: [projects.id],
    }),
    workflow: one(workflows, {
        fields: [sliWindows.workflowId],
        references: [workflows.id],
    }),
}));


// DataVault Relations
export const datavaultDatabasesRelations = relations(datavaultDatabases, ({ one, many }) => ({
    tenant: one(tenants, {
        fields: [datavaultDatabases.tenantId],
        references: [tenants.id],
    }),
    tables: many(datavaultTables),
    apiTokens: many(datavaultApiTokens),
    workflows: many(workflowDataSources),
}));

export const workflowDataSourcesRelations = relations(workflowDataSources, ({ one }) => ({
    workflow: one(workflows, {
        fields: [workflowDataSources.workflowId],
        references: [workflows.id],
    }),
    dataSource: one(datavaultDatabases, {
        fields: [workflowDataSources.dataSourceId],
        references: [datavaultDatabases.id],
    }),
}));

export const datavaultTablesRelations = relations(datavaultTables, ({ one, many }) => ({
    tenant: one(tenants, {
        fields: [datavaultTables.tenantId],
        references: [tenants.id],
    }),
    owner: one(users, {
        fields: [datavaultTables.ownerUserId],
        references: [users.id],
    }),
    database: one(datavaultDatabases, {
        fields: [datavaultTables.databaseId],
        references: [datavaultDatabases.id],
    }),
    columns: many(datavaultColumns),
    rows: many(datavaultRows),
}));

export const datavaultColumnsRelations = relations(datavaultColumns, ({ one, many }) => ({
    table: one(datavaultTables, {
        fields: [datavaultColumns.tableId],
        references: [datavaultTables.id],
    }),
    values: many(datavaultValues),
}));

export const datavaultRowsRelations = relations(datavaultRows, ({ one, many }) => ({
    table: one(datavaultTables, {
        fields: [datavaultRows.tableId],
        references: [datavaultTables.id],
    }),
    createdByUser: one(users, {
        fields: [datavaultRows.createdBy],
        references: [users.id],
    }),
    updatedByUser: one(users, {
        fields: [datavaultRows.updatedBy],
        references: [users.id],
    }),
    values: many(datavaultValues),
    dataSources: many(workflowDataSources),
    queries: many(workflowQueries),
}));

export const workflowQueriesRelations = relations(workflowQueries, ({ one }) => ({
    workflow: one(workflows, {
        fields: [workflowQueries.workflowId],
        references: [workflows.id],
    }),
    dataSource: one(datavaultDatabases, {
        fields: [workflowQueries.dataSourceId],
        references: [datavaultDatabases.id],
    }),
    table: one(datavaultTables, {
        fields: [workflowQueries.tableId],
        references: [datavaultTables.id],
    }),
}));

export const datavaultValuesRelations = relations(datavaultValues, ({ one }) => ({
    row: one(datavaultRows, {
        fields: [datavaultValues.rowId],
        references: [datavaultRows.id],
    }),
    column: one(datavaultColumns, {
        fields: [datavaultValues.columnId],
        references: [datavaultColumns.id],
    }),
}));

export const datavaultApiTokensRelations = relations(datavaultApiTokens, ({ one }) => ({
    database: one(datavaultDatabases, {
        fields: [datavaultApiTokens.databaseId],
        references: [datavaultDatabases.id],
    }),
    tenant: one(tenants, {
        fields: [datavaultApiTokens.tenantId],
        references: [tenants.id],
    }),
}));

export const collectionsRelations = relations(collections, ({ one, many }) => ({
    tenant: one(tenants, {
        fields: [collections.tenantId],
        references: [tenants.id],
    }),
    fields: many(collectionFields),
    records: many(records),
}));

export const collectionFieldsRelations = relations(collectionFields, ({ one }) => ({
    collection: one(collections, {
        fields: [collectionFields.collectionId],
        references: [collections.id],
    }),
}));

export const recordsRelations = relations(records, ({ one }) => ({
    tenant: one(tenants, {
        fields: [records.tenantId],
        references: [tenants.id],
    }),
    collection: one(collections, {
        fields: [records.collectionId],
        references: [collections.id],
    }),
    createdByUser: one(users, {
        fields: [records.createdBy],
        references: [users.id],
    }),
    updatedByUser: one(users, {
        fields: [records.updatedBy],
        references: [users.id],
    }),
}));

// Integrations Relations
export const secretsRelations = relations(secrets, ({ one, many }) => ({
    project: one(projects, {
        fields: [secrets.projectId],
        references: [projects.id],
    }),
    connections: many(externalConnections),
}));

export const externalConnectionsRelations = relations(externalConnections, ({ one }) => ({
    project: one(projects, {
        fields: [externalConnections.projectId],
        references: [projects.id],
    }),
    tenant: one(tenants, {
        fields: [externalConnections.tenantId],
        references: [tenants.id],
    }),
}));

export const externalDestinationsRelations = relations(externalDestinations, ({ one }) => ({
    tenant: one(tenants, {
        fields: [externalDestinations.tenantId],
        references: [tenants.id],
    }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
    project: one(projects, {
        fields: [apiKeys.projectId],
        references: [projects.id],
    }),
}));

export const auditEventsRelations = relations(auditLogs, ({ one }) => ({ // Map auditEvents to auditLogs if renamed?
    // Schema.ts used auditEvents. Auth.ts uses auditLogs.
    // I will assume auditLogs is the new name unless relation specifically referenced auditEvents table.
    // Line 2508 Step 556: `export const auditEventsRelations = relations(auditEvents, ...)`
    // And `insertAuditEventSchema`.
    // If I used `auditLogs` in `auth.ts`, I should stick to it unless `auditEvents` is distinct.
    // If `auditEvents` table was in schema.ts, I likely mapped it to `auditLogs` in `auth.ts`.
    // I will modify `auth.ts` to export `auditEvents` alias to `auditLogs` or rename `auditLogs` to `auditEvents`.
    // I'll assume they are the same table "audit_logs" or "audit_events"?
    // Step 579: `export const auditLogs = pgTable("audit_logs", ...)`
    // Schema.ts view: `metricsEvents`?
    // I'll stick to `auditLogs` for now.
    actor: one(users, {
        fields: [auditLogs.userId], // userId in auditLogs vs actorId in auditEvents
        references: [users.id],
    }),
}));
