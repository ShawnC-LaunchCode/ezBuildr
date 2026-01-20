# Database Schema Reference

Complete reference for all 80+ PostgreSQL tables organized by domain.

## Core Workflow Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `projects` | Top-level containers | `id`, `name`, `description`, `createdBy`, `tenantId` |
| `workflows` | Workflow definitions | `id`, `title`, `status`, `projectId`, `publicLink` |
| `sections` | Pages/sections | `id`, `workflowId`, `title`, `order`, `skipLogic`, `visibleIf` |
| `steps` | Individual steps | `id`, `sectionId`, `type`, `alias`, `required`, `config`, `visibleIf`, `defaultValue` |
| `stepValues` | Run data | `id`, `runId`, `stepId`, `value` |
| `workflowRuns` | Execution instances | `id`, `workflowId`, `runToken`, `createdBy`, `progress`, `completed` |

**Step Types (15+):** short_text, long_text, email, phone, website, number, currency, address, boolean, multiple_choice, radio, checkbox, scale, date, date_time, time, display, multi_field, signature, file_upload, computed

## DataVault Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `databases` | Database definitions | `id`, `projectId`, `name`, `archived` |
| `tables` | Table schemas | `id`, `databaseId`, `name`, `columns` (JSONB) |
| `table_rows` | Actual data | `id`, `tableId`, `data` (JSONB) |
| `table_permissions` | Access control | `tableId`, `userId`, `teamId`, `canView`, `canCreate`, `canUpdate`, `canDelete` |
| `api_tokens` | External API access | `id`, `projectId`, `token`, `expiresAt` |
| `row_notes` | Row comments | `id`, `tableId`, `rowId`, `userId`, `note` |

**Column types:** text, number, date, boolean, select, multiselect, autonumber

## Logic & Automation Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `logicRules` | Conditional logic | `id`, `workflowId`, `condition`, `action` |
| `transformBlocks` | JS/Python code | `id`, `workflowId`, `code`, `inputKeys`, `outputKey`, `virtualStepId` |
| `transformBlockRuns` | Execution audit | `id`, `runId`, `blockId`, `status`, `errorMessage` |
| `blocks` | Reusable blocks | `id`, `workflowId`, `type`, `config` |

**Logic operators:** equals, not_equals, contains, greater_than, less_than, between, is_empty, is_not_empty

**Logic actions:** show, hide, require, make_optional, set_value, skip_section

## Custom Scripting Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `lifecycle_hooks` | Workflow phase hooks | `id`, `workflowId`, `sectionId`, `name`, `phase`, `language`, `code`, `mutationMode` |
| `document_hooks` | Document transformation hooks | `id`, `workflowId`, `documentId`, `name`, `phase`, `language`, `code` |
| `script_execution_log` | Script execution audit trail | `id`, `runId`, `scriptType`, `scriptId`, `status`, `consoleOutput`, `durationMs` |

**Lifecycle hook phases:** beforePage, afterPage, beforeFinalBlock, afterDocumentsGenerated

**Document hook phases:** beforeGeneration, afterGeneration

**Supported languages:** JavaScript (vm2/vm sandbox), Python (subprocess isolation)

## Integration Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `connections` | API connections | `id`, `projectId`, `connectionType`, `authConfig`, `secretRefs`, `oauthState` |
| `secrets` | Encrypted credentials | `id`, `projectId`, `key`, `type`, `encryptedValue`, `iv`, `authTag` |
| `review_tasks` | Review gates | `id`, `runId`, `status`, `assignedTo`, `decision` |
| `signature_requests` | E-signatures | `id`, `runId`, `token`, `status`, `documentUrl` |

**Connection types:** api_key, bearer, oauth2_client_credentials, oauth2_3leg

**Secret types:** api_key, bearer, oauth2, basic_auth

## Team Collaboration Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `teams` | Team entities | `id`, `name`, `createdBy` |
| `teamMembers` | Team membership | `teamId`, `userId`, `role` |
| `projectAccess` | Project permissions | `projectId`, `teamId`, `userId`, `role` |
| `workflowAccess` | Workflow permissions | `workflowId`, `teamId`, `userId`, `role` |
| `tenants` | Workspace tenants | `id`, `name`, `slug` |
| `organizations` | Enterprise orgs | `id`, `name`, `tenantId` |
| `workspaces` | Team workspaces | `id`, `name`, `tenantId` |
| `workspaceMembers` | Workspace membership | `workspaceId`, `userId`, `role` |
| `resourcePermissions` | Granular permissions | `resourceType`, `resourceId`, `userId`, `permission` |
| `auditLogs` | Activity tracking | `id`, `userId`, `action`, `resourceType`, `timestamp` |

## Portal & External Access Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `portalUsers` | Portal user accounts | `id`, `email`, `workflowId`, `magicToken` |
| `portalAccessLogs` | Portal login tracking | `id`, `portalUserId`, `timestamp` |
| `anonymousResponseTracking` | Anonymous run tracking | `id`, `runId`, `fingerprint` |

## Templates & Sharing Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `workflowTemplates` | Workflow templates | `id`, `name`, `description`, `createdBy` |
| `workflowBlueprints` | Template blueprints | `id`, `templateId`, `structure` (JSONB) |
| `templateShares` | Sharing permissions | `id`, `templateId`, `sharedWith`, `permissions` |
| `emailTemplateMetadata` | Email templates | `id`, `projectId`, `name`, `htmlContent` |

## Analytics & Metrics Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `analyticsEvents` | Event tracking | `id`, `workflowId`, `runId`, `eventType`, `timestamp` |
| `workflowRunEvents` | Run-level events | `id`, `runId`, `eventName`, `metadata` (JSONB) |
| `workflowRunMetrics` | Run metrics | `id`, `runId`, `completionTime`, `dropoffStep` |
| `blockMetrics` | Block performance | `id`, `blockId`, `executionTime`, `errorRate` |
| `workflowAnalyticsSnapshots` | Analytics snapshots | `id`, `workflowId`, `snapshotDate`, `metrics` (JSONB) |
| `metricsEvents` | Metric events | `id`, `eventType`, `value`, `timestamp` |
| `metricsRollups` | Aggregated metrics | `id`, `period`, `aggregatedData` (JSONB) |

## Document Generation Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `runGeneratedDocuments` | Generated PDFs/DOCX | `id`, `runId`, `documentUrl`, `fileType`, `createdAt` |
| `signatureEvents` | Signature audit trail | `id`, `signatureRequestId`, `eventType`, `timestamp` |
| `finalBlock` | Final block config | `id`, `workflowId`, `templateId`, `config` (JSONB) |

## Billing & Enterprise Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `subscriptions` | Stripe subscriptions | `id`, `tenantId`, `stripeSubscriptionId`, `status`, `planId` |
| `billingPlans` | Plan definitions | `id`, `name`, `features` (JSONB), `priceMonthly` |
| `subscriptionSeats` | Seat management | `id`, `subscriptionId`, `userId`, `assignedAt` |
| `customerBillingInfo` | Billing addresses | `id`, `tenantId`, `billingEmail`, `stripeCustomerId` |
| `usageRecords` | Usage metering | `id`, `tenantId`, `period`, `runCount`, `workflowCount` |

## Versioning & State Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `workflowVersions` | Version history | `id`, `workflowId`, `versionNumber`, `publishedAt`, `snapshot` (JSONB) |
| `workflowSnapshots` | Test data snapshots | `id`, `workflowId`, `name`, `data` (JSONB) |
| `sessions` | Express sessions | `sid`, `sess` (JSONB), `expire` |
| `userPreferences` | User settings | `id`, `userId`, `preferences` (JSONB) |
| `userPersonalizationSettings` | Personalization | `id`, `userId`, `settings` (JSONB) |
| `workflowPersonalizationSettings` | Workflow personalization | `id`, `workflowId`, `settings` (JSONB) |

## Legacy & Collections Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `collections` | Legacy collections | `id`, `projectId`, `name` |
| `collectionFields` | Collection schemas | `id`, `collectionId`, `fieldName`, `fieldType` |
| `records` | Collection records | `id`, `collectionId`, `data` (JSONB) |
| `surveys` | Legacy surveys (deprecated) | `id`, `title`, `createdBy` |
| `questions` | Legacy questions | `id`, `surveyId`, `questionType` |
| `responses` / `answers` | Legacy response data | `id`, `surveyId`, `userId`, `submittedAt` |

## Utility Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `files` | File storage metadata | `id`, `filename`, `mimeType`, `uploadedBy`, `url` |
| `apiKeys` | API token storage | `id`, `projectId`, `key`, `expiresAt` |
| `runLogs` | Run execution logs | `id`, `runId`, `logLevel`, `message`, `timestamp` |
| `systemStats` | System metrics | `id`, `statName`, `value`, `recordedAt` |
| `auditEvents` | Comprehensive audit trail | `id`, `userId`, `action`, `resourceType`, `before`, `after`, `timestamp` |
