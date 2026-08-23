# Frontend Pages Reference

All client routes, taken from the Wouter `<Switch>` in `client/src/Router.tsx` (verified July 2026). **That file is the source of truth** — pages are lazy-loaded from `client/src/pages/`. Routes below are grouped by auth requirement.

## Public routes (no login)

| Page | Route | Purpose |
|------|-------|---------|
| Landing | `/` | Public homepage (Dashboard when authenticated) |
| Public Runner | `/w/:slug` | Public workflow access by slug |
| Workflow Runner | `/run/:id` | Run a workflow (available to everyone) |
| Shared Run View | `/share/:token` | Public share view of a completed run |
| Intake Preview | `/intake/preview` | Branded intake portal preview |
| URL Parameters Doc | `/docs/url-parameters` | In-app documentation |

## Auth pages (public, redirect to `/dashboard` when logged in)

| Page | Route |
|------|-------|
| Login | `/auth/login` |
| Register | `/auth/register` |
| Forgot / Reset Password | `/auth/forgot-password`, `/auth/reset-password` |
| Verify Email | `/auth/verify-email` |

## Portal (independent magic-link auth)

| Page | Route |
|------|-------|
| Portal Login | `/portal/login` |
| Portal Magic Link Verify | `/portal/auth/verify` |
| Portal Dashboard | `/portal` |

## Authenticated app

### Workflows

| Page | Route | Purpose |
|------|-------|---------|
| Dashboard | `/dashboard` (and `/`) | Main hub after login |
| Workflows List | `/workflows` | Browse workflows |
| New Workflow | `/workflows/new` | Create workflow |
| Workflow Builder | `/workflows/:id/builder` | 7-tab builder (Pages, Templates, Data Sources, Review, Snapshots, Settings, Assignment) |
| Workflow Preview | `/workflows/:workflowId/preview` | In-memory preview (no database) |
| Workflow Analytics | `/workflows/:id/analytics` | Funnel, dropoff, trends |
| Optimization Wizard | `/workflows/:workflowId/optimize` | AI workflow optimization |
| Template Test Runner | `/workflows/:workflowId/builder/templates/test/:templateId` | Test a template with sample data |

### Projects & Settings

| Page | Route |
|------|-------|
| Project View | `/projects/:id` |
| Branding Settings | `/projects/:id/settings/branding` |
| Legal Integrations | `/projects/:id/settings/integrations` |
| Domain Settings | `/projects/:id/settings/branding/domains` |
| Email Templates | `/projects/:id/settings/email-templates` (+ `/:templateId` editor) |
| User Settings | `/settings` |
| Developer OAuth Apps | `/developer/oauth` |

### Data

| Page | Route | Purpose |
|------|-------|---------|
| DataVault Dashboard | `/datavault` | Home, database overview |
| Databases | `/datavault/databases` (+ `/:databaseId`, `/:databaseId/settings`) | Database CRUD, settings |
| Tables | `/datavault/tables` (+ `/:tableId`) | Data grid with infinite scroll |
| Collections (legacy) | `/data` (+ `/:id`) | Legacy datastore pages |

### Organizations, Marketplace, Billing, Admin

| Page | Route |
|------|-------|
| Organizations | `/organizations` (+ `/:id`) |
| Accept Invite | `/invites/:token/accept` |
| Marketplace | `/marketplace` |
| Billing Dashboard | `/billing` |
| Plans / Pricing | `/billing/plans` |
| Admin Dashboard | `/admin` |
| Admin Users / Logs / AI Settings | `/admin/users`, `/admin/logs`, `/admin/ai-settings` |

## Removed routes (do not reference)

- `/runs`, `/runs/:id`, `/runs/compare` — run dashboard pages removed with the graph-builder/run-tables removal (2026). Run completion is viewed via `/share/:token`.
- `/teams` — replaced by `/organizations`.
- `/login` → `/auth/login`; `/pricing` → `/billing/plans`; `/connections`, `/templates`, `/branding`, `/domains`, `/email-templates` as top-level routes no longer exist (settings moved under `/projects/:id/settings/*`).
