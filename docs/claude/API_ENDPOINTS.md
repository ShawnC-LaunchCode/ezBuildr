# API Endpoints Reference

Map of API domains → route files (verified August 2026). **Source of truth is `server/routes/index.ts` (`registerAllRoutes`)** — ~69 route files including the `datavault/` and `ai/` subdirectories. Before relying on an exact path/method here, grep the route file; endpoint lists below were verified at the date above but drift.

New endpoints follow the 3-tier pattern in the `add-api-endpoint` skill (`.claude/skills/add-api-endpoint/SKILL.md`).

## Workflows & Structure — `workflows.routes.ts`, `sections.routes.ts`, `pages.routes.ts`, `steps.routes.ts`

```
GET/POST    /api/workflows                        # List / create
GET         /api/workflows/unfiled
GET/PUT/DEL /api/workflows/:workflowId            # CRUD
PUT         /api/workflows/:workflowId/status     # draft/active/archived
PUT         /api/workflows/:workflowId/intake-config
PUT         /api/workflows/:workflowId/move       # Move between projects
GET/PUT     /api/workflows/:workflowId/mode       # easy/advanced mode
GET         /api/workflows/:workflowId/variables  # Step aliases
GET         /api/workflows/:workflowId/steps      # Workflow step list (creator session or run token)
GET         /api/workflows/:workflowId/public-link
GET         /api/workflows/:workflowId/logic-rules
GET/PUT/DEL /api/workflows/:workflowId/access     # Workflow ACL
PUT         /api/workflows/:workflowId/owner
POST        /api/workflows/:workflowId/transfer
POST        /api/workflows/:workflowId/templates/:templateId/test
GET/POST    /api/workflows/:workflowId/sections   # List/create Sections; create requires a non-empty contiguous pageIds span
PUT/DEL     /api/sections/:sectionId              # Update/delete Section metadata; delete leaves pages in place and ungrouped
PUT         /api/workflows/:workflowId/pages/reorder # Full ordered page layout with explicit nullable sectionId per page
```

Pages and steps CRUD live in `pages.routes.ts` / `steps.routes.ts`. Generic page create/update cannot set `sectionId`; membership changes atomically through Section creation or page reorder. Reorder accepts the full active-page layout plus `deleteEmptySectionIds` (default `[]`) and rejects split, missing, duplicate, foreign, or stale layouts. Step config is stored in `steps.config`; workflow-wide alias uniqueness is enforced by `steps.workflow_id + lower(alias)`.

## Workflow Runs — `runs.routes.ts`

```
POST        /api/workflows/public/:publicLinkSlug/start   # Anonymous/public start
POST        /api/workflows/:workflowId/runs               # Create run (returns runToken)
GET         /api/workflows/:workflowId/runs               # List runs for workflow
GET         /api/runs/:runId                              # Creator session OR run token
GET         /api/runs/:runId/runtime                      # Sanitized pinned definition + cursor + values
POST        /api/runs/:runId/revoke-token
POST        /api/runs/:runId/resume-links                # Queue respondent email; run token or creator auth
POST        /api/runs/:runId/resume                      # Redeem one-time link; rotates run token
POST        /api/runs/:runId/handoff                     # Staff-only reassignment to tenant user/client email
GET/POST    /api/runs/:runId/values                       # Get / save step values
POST        /api/runs/:runId/values/bulk
POST        /api/runs/:runId/pages/:pageId/submit
POST        /api/runs/:runId/steps/:stepId/files           # Multipart respondent upload (run token or creator)
GET         /api/runs/:runId/steps/:stepId/files/url       # Refresh signed storage URL
DELETE      /api/runs/:runId/steps/:stepId/files           # Remove upload
POST        /api/runs/:runId/next                         # Navigate to next page
PUT         /api/runs/:runId/complete                     # Complete (triggers transforms)
GET/POST/DEL /api/runs/:runId/documents                   # Run documents (+ generate-documents)
POST        /api/runs/:runId/share                        # Create share token
GET         /api/shared/runs/:token                       # Public shared run view
```

> The old graph-run REST API was removed with the graph builder (2026). `workflow_runs` is the only run model.
> Resume/handoff credentials are stored only as SHA-256 hashes in `run_resume_links`. A successful one-time redemption rotates the ordinary run bearer token before the pinned runtime restores its saved values and cursor.
>
> **DOC-110 Note on Step Values:** The `/api/runs/:runId/values` endpoint permits saving values for steps outside the currently active page. This is an intentional out-of-page write allowance, supporting scenarios like computed fields or external integrations writing ahead.

## Blocks & Transform Blocks — `blocks.routes.ts`, `transformBlocks.routes.ts`

```
GET/POST    /api/workflows/:id/blocks             # Block CRUD (prefill/validate/branch/records/...)
PUT/DELETE  /api/blocks/:blockId
PUT         /api/workflows/:id/blocks/reorder
GET/POST    /api/workflows/:id/transform-blocks
PUT/DELETE  /api/transform-blocks/:blockId
POST        /api/transform-blocks/:blockId/test   # Test with sample data (blocks have NO /test)
```

## Lifecycle & Document Hooks — `lifecycleHooks`/`documentHooks` routers (mounted at `/api`)

```
GET/POST    /api/workflows/:workflowId/lifecycle-hooks
PUT/DELETE  /api/lifecycle-hooks/:hookId
POST        /api/lifecycle-hooks/:hookId/test
GET/POST    /api/workflows/:workflowId/document-hooks
PUT/DELETE  /api/document-hooks/:hookId
POST        /api/document-hooks/:hookId/test
GET/DELETE  /api/runs/:runId/script-console       # Script execution logs
```

## DataVault — `datavault.routes.ts` + `server/routes/datavault/*` (all under `/api/datavault`)

```
GET/POST    /api/datavault/databases              # NOT project-scoped
GET/PATCH/DEL /api/datavault/databases/:id
GET/POST    /api/datavault/databases/:id/tables
GET/PATCH/DEL /api/datavault/tables/:tableId
GET/POST    /api/datavault/tables/:tableId/rows   # Infinite scroll pagination
GET         /api/datavault/tables/:tableId/options # Bound value/label pairs; user or run-token auth
GET/PATCH/DEL /api/datavault/rows/:rowId          # Row ops are row-scoped, not table-nested
GET/POST    /api/datavault/tables/:tableId/permissions
DELETE      /api/datavault/permissions/:permissionId
GET/PUT/DEL /api/datavault/databases/:id/access   # Database ACL (DatavaultAclService)
POST        /api/datavault/databases/:databaseId/transfer
GET/POST    /api/datavault/databases/:databaseId/tokens   # API tokens (database-scoped)
DELETE      /api/datavault/tokens/:tokenId
```

Row notes/archive: `datavault/rowNotes.routes.ts`, `datavault/rowArchive.routes.ts`.

## Auth & Account — `auth.routes.ts`, `account.routes.ts`, `userPreferences.routes.ts`

```
POST        /api/auth/register | login | refresh-token | logout  # registration is feature-flagged
POST        /api/auth/forgot-password | reset-password | verify-email
GET         /api/auth/me | csrf-token | token
POST/GET    /api/auth/mfa/*                       # setup, verify, verify-login, status
GET/PUT     /api/account
GET/PUT     /api/preferences
```

## AI — `ai.routes.ts`, `ai/workflowEdit.routes.ts`, `ai.feedback.routes.ts`, mounted routers

```
POST        /api/ai/workflows/generate            # Generate workflow from description
POST        /api/ai/workflows/generate-logic | debug-logic | visualize-logic | revise
POST        /api/workflows/:workflowId/ai/edit    # AI workflow editing (Stage 22)
POST        /api/ai/transform/*                   # Transform code generation
POST        /api/ai/doc/*                         # AI document features
POST        /api/ai/personalize/*                 # Personalization
POST        /api/ai/workflows/optimize/*          # Optimization wizard backend
GET/POST    /api/ai/feedback (+ /stats)
GET         /api/ai/status | /api/ai/sentiment
```

Admin AI settings: `admin.aiSettings.routes.ts` → `/api/admin/ai-settings`.

## Templates & Marketplace — `marketplace.ts` (mounted at `/api`), `workflowTemplates.routes.ts`, `api.templates.routes.ts`

```
GET/POST    /api/templates                        # There is NO /api/marketplace prefix
GET         /api/templates/:id
POST        /api/templates/:id/install
```

## Documents & E-Signature — `documents.routes.ts`, `finalBlock.routes.ts`, `esign.routes.ts`

Document delivery status routes are defined in `documentDelivery.routes.ts`. They require authenticated tenant membership, resolve the run's real user/organization/project tenant in the service layer, and redact webhook/cloud credentials from every response:

```
GET         /api/tenants/:tenantId/runs/:runId/deliveries
GET         /api/tenants/:tenantId/deliveries/:deliveryId
POST        /api/tenants/:tenantId/deliveries/:deliveryId/retry  # failed jobs only
```

E-sign is mounted at **`/api/esign`** (not `/api/signatures`):

```
POST        /api/esign/execute/:runId/:stepId
GET         /api/esign/status/:envelopeId?runId=:runId
POST        /api/esign/webhook/docusign             # HMAC-verified DocuSign Connect
POST        /api/esign/callback/:runId/:stepId      # signed legacy return callback
GET         /api/esign/providers
POST        /api/esign/test
```

Execute/status accept a matching bearer run token or creator session. The
DocuSign webhook is public but fails closed unless its raw body passes the
`X-DocuSign-Signature-1` HMAC check. `/callback/docusign` remains a compatibility
alias for the webhook URL.

> There are **no `/api/reviews` routes** — the review-gates route layer was removed in the dead-code sweep; `ReviewTaskService`/`review_tasks` still exist but are orphaned.

## Connections, Secrets, Webhooks — `connections.v2.routes.ts`, `secrets.routes.ts`, mounted routers

```
GET/POST    /api/projects/:projectId/connections
PATCH/DEL   /api/projects/:projectId/connections/:connectionId
POST        /api/projects/:projectId/connections/:connectionId/test
GET/POST    /api/projects/:projectId/secrets
POST        /api/projects/:projectId/secrets/:secretId/test
GET         /api/projects/:projectId/integrations
POST        /api/projects/:projectId/integrations/clio
POST        /api/projects/:projectId/integrations/clio/:connectionId/authorize
POST        /api/projects/:projectId/integrations/clio/:connectionId/contacts
POST        /api/projects/:projectId/integrations/clio/:connectionId/matters/:matterId/documents
POST        /api/projects/:projectId/integrations/stripe
POST        /api/projects/:projectId/integrations/stripe/:connectionId/payment-intents
POST        /api/integrations/stripe/webhook/:connectionId # public, raw-body HMAC verified
/api/webhooks/*                                   # webhook router
/api/external/*                                   # external API (rate-limited)
/api/data-sources/*                               # data source router
/api/places/*                                     # Google Places proxy
```

`oauth.routes.ts` exists but is **intentionally disabled** (commented out in index.ts — insecure self-hosted OAuth provider).

The curated legal integration routes live in `legalIntegrations.routes.ts`.
Project routes require the matching project ACL; the Stripe webhook is public
but verifies the raw payload, timestamp, per-connection signing secret, and
project metadata before acknowledging an event.

## Analytics & Export — `workflowAnalytics.routes.ts`, `workflowExports.routes.ts`

Funnel/trends/heatmap/branching analytics and JSON/CSV/PDF export per workflow.

## Admin — `admin.routes.ts` (hybridAuth + isAdmin)

```
GET         /api/admin/users
DELETE      /api/admin/users/:userId              # removes personal DataVault data before the account
PUT         /api/admin/users/:userId/role         # NOT /set-admin
GET         /api/admin/users/:userId/workflows    # + runCount; excludes org-membership reach
GET         /api/admin/logs (+ /export, /events, /actors)
GET         /api/admin/stats
GET         /api/admin/org-stats
GET         /api/admin/workflows*
POST        /api/admin/workflows/:workflowId/copy # copies to the acting admin, bypasses source ACL
DELETE      /api/admin/workflows/:workflowId
PUT         /api/admin/tenants/:tenantId/mfa-required
```

The admin UI for the two workflow routes is `/admin/users/:userId/workflows`
(`AdminUserWorkflows.tsx`), used to salvage or clear a user's workflows before
deleting the account.

## Other registered domains (see route file for endpoints)

| Domain | File(s) |
|--------|---------|
| Projects | `projects.routes.ts` |
| Organizations / Tenants / Teams | `organizations.routes.ts`, `tenant.routes.ts`, `teams.routes.ts` |
| Billing (Stripe) | `billing.routes.ts` |
| Portal (magic link) | `portal` router at `/api/portal` |
| Branding / Email templates | `branding.routes.ts`, `emailTemplates.routes.ts` |
| Versions & Snapshots | `versions.routes.ts`, `snapshots.routes.ts` |
| Blueprints | `blueprint.routes.ts` |
| Collections (legacy) | `collections.routes.ts` |
| Intake / Preview / Dashboard | `intake.routes.ts`, `preview.routes.ts`, `dashboard.routes.ts` |
| Files | `files.routes.ts` |
| Health / Metrics / Docs | `health.ts`, `metrics.ts`, `docs.routes.ts` |
