# API Endpoints Reference

Map of API domains → route files (verified July 2026). **Source of truth is `server/routes/index.ts` (`registerAllRoutes`)** — ~68 route files including the `datavault/` and `ai/` subdirectories. Before relying on an exact path/method here, grep the route file; endpoint lists below were verified at the date above but drift.

New endpoints follow the 3-tier pattern in the `add-api-endpoint` skill (`.claude/skills/add-api-endpoint/SKILL.md`).

## Workflows & Structure — `workflows.routes.ts`, `sections.routes.ts`, `steps.routes.ts`

```
GET/POST    /api/workflows                        # List / create
GET         /api/workflows/unfiled
GET/PUT/DEL /api/workflows/:workflowId            # CRUD
PUT         /api/workflows/:workflowId/status     # draft/active/archived
PUT         /api/workflows/:workflowId/intake-config
PUT         /api/workflows/:workflowId/move       # Move between projects
GET/PUT     /api/workflows/:workflowId/mode       # easy/advanced mode
GET         /api/workflows/:workflowId/variables  # Step aliases
GET         /api/workflows/:workflowId/public-link
GET         /api/workflows/:workflowId/logic-rules
GET/PUT/DEL /api/workflows/:workflowId/access     # Workflow ACL
PUT         /api/workflows/:workflowId/owner
POST        /api/workflows/:workflowId/transfer
POST        /api/workflows/:workflowId/templates/:templateId/test
```

Sections and steps CRUD live in `sections.routes.ts` / `steps.routes.ts`.

## Workflow Runs — `runs.routes.ts`

```
POST        /api/workflows/public/:publicLinkSlug/start   # Anonymous/public start
POST        /api/workflows/:workflowId/runs               # Create run (returns runToken)
GET         /api/workflows/:workflowId/runs               # List runs for workflow
GET         /api/runs/:runId                              # Creator session OR run token
POST        /api/runs/:runId/revoke-token
GET/POST    /api/runs/:runId/values                       # Get / save step values
POST        /api/runs/:runId/values/bulk
POST        /api/runs/:runId/sections/:sectionId/submit
POST        /api/runs/:runId/next                         # Navigate to next section
PUT         /api/runs/:runId/complete                     # Complete (triggers transforms)
GET/POST/DEL /api/runs/:runId/documents                   # Run documents (+ generate-documents)
POST        /api/runs/:runId/share                        # Create share token
GET         /api/shared/runs/:token                       # Public shared run view
```

> The old graph-run REST API was removed with the graph builder (2026). `workflow_runs` is the only run model.

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
POST        /api/auth/register | login | refresh-token | logout
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

E-sign is mounted at **`/api/esign`** (not `/api/signatures`):

```
POST        /api/esign/execute/:runId/:stepId
GET         /api/esign/status/:envelopeId
POST        /api/esign/callback/:runId/:stepId  (+ /callback/docusign)
GET         /api/esign/providers
POST        /api/esign/test
```

> There are **no `/api/reviews` routes** — the review-gates route layer was removed in the dead-code sweep; `ReviewTaskService`/`review_tasks` still exist but are orphaned.

## Connections, Secrets, Webhooks — `connections.v2.routes.ts`, `secrets.routes.ts`, mounted routers

```
GET/POST    /api/projects/:projectId/connections
PATCH/DEL   /api/projects/:projectId/connections/:connectionId
POST        /api/projects/:projectId/connections/:connectionId/test
GET/POST    /api/projects/:projectId/secrets
POST        /api/projects/:projectId/secrets/:secretId/test
/api/webhooks/*                                   # webhook router
/api/external/*                                   # external API (rate-limited)
/api/data-sources/*                               # data source router
/api/places/*                                     # Google Places proxy
```

`oauth.routes.ts` exists but is **intentionally disabled** (commented out in index.ts — insecure self-hosted OAuth provider).

## Analytics & Export — `workflowAnalytics.routes.ts`, `workflowExports.routes.ts`

Funnel/trends/heatmap/branching analytics and JSON/CSV/PDF export per workflow.

## Admin — `admin.routes.ts` (hybridAuth + isAdmin)

```
GET         /api/admin/users
PUT         /api/admin/users/:userId/role         # NOT /set-admin
GET         /api/admin/logs (+ /export, /events, /actors)
GET         /api/admin/stats
GET         /api/admin/org-stats
GET         /api/admin/workflows*
PUT         /api/admin/tenants/:tenantId/mfa-required
```

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
