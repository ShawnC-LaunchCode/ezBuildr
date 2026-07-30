# Features & Security Reference

Feature status, security details, and recent architecture changes (verified July 2026).

## Complete Features (Production Ready)

| Feature | Description |
|---------|-------------|
| **Workflow Builder** | Section/step builder with 7-tab navigation and inspector panel |
| **38 Step Types** | Text, choice, date/time, currency, address, scale, signature block, computed, multi-field, plus easy/advanced-mode variants. Three schema/builder types (`file_upload`, `loop_group`, `repeater`) are not respondent-fillable and render a skip notice; `RUNNER_INTENTIONALLY_UNSUPPORTED_STEP_TYPES` is the source of truth (`shared/types/runnerStepTypes.ts:69-73,119-126`). |
| **DataVault** | Data platform: databases, tables, rows, 14 column types, infinite scroll, role-based permissions, ACLs, API tokens, row notes |
| **Custom Scripting System** | Lifecycle hooks (4 phases) + document hooks (2 phases), 40+ helper functions, JS/Python, script console |
| **Two-Tier Visibility Logic** | Workflow rules + step-level `visibleIf` expressions with real-time evaluation |
| **Transform Blocks** | Sandboxed JS/Python execution, virtual steps, test playground |
| **Step Aliases** | Human-friendly variable names for logic and transforms |
| **Run Token Authentication** | Bearer token + JWT + session auth, anonymous runs, portal magic links |
| **Conditional Logic** | Show/hide/require/skip_to actions, 9 DB operators (28 in the logic engine), visual editor |
| **Default Values** | Pre-fill with defaults, URL parameter override |
| **HTTP/API Integration** | REST client via `safeFetch`, OAuth2 (Client Credentials + 3-legged), webhooks |
| **Secrets Management** | AES-256-GCM encrypted storage, LRU cache |
| **Document Generation** | PDF/DOCX generation, template variables, repeating sections |
| **AI-Powered Features** | Workflow generation and AI editing (OpenAI/Anthropic/Gemini), logic generation/debugging, optimization wizard, template binding, feedback loop |
| **Templates & Marketplace** | Reusable templates, marketplace page (`/marketplace` UI, `/api/templates` backend), test runner |
| **Advanced Analytics** | Funnel analysis, dropoff tracking, heatmaps, branching analysis, export (JSON/CSV/PDF) |
| **Portal System** | Magic link authentication, external user access, run tracking |
| **Multi-Tenant Workspaces** | Tenants, organizations, workspaces, resource permissions |
| **MFA & Account Security** | TOTP MFA, backup codes, trusted devices, account lockout |
| **Versioning & Snapshots** | Version history, publish workflow, restore, test data snapshots |
| **Real-time Collaboration** | Live presence, cursors (`client/src/components/collab/`), activity logs |
| **Billing Integration** | Stripe subscriptions, plans, usage metering, seat management |
| **Branding & Customization** | Custom colors, logos, domains, white-label intake forms, email templates (per-project settings) |
| **Admin & Audit** | Admin dashboard, user role management, audit logs, tenant MFA enforcement, AI settings |

## Orphaned / Partial

- **Review Gates** — `ReviewTaskService` and the `review_tasks` table exist, but the `/api/reviews` route layer was removed in the 2026 dead-code sweep. No UI or API exposes it; treat as dormant, not production.
- **Collections** (`/data`) — legacy datastore, superseded by DataVault but still present.
- **Self-hosted OAuth provider** — `oauth.routes.ts` exists but is intentionally disabled in `server/routes/index.ts` (security).
- **E-Signature** — **dormant, not partial.** The native signature-block UI and DocuSign webhook verification/parsing exist (`client/src/components/runner/blocks/SignatureBlockRenderer.tsx:51-58`; `server/services/esign/DocusignProvider.ts:416,475`), but DocuSign authentication and envelope create/status/void/download throw `not yet implemented` (`DocusignProvider.ts:124-125,178-179,322-323,378,398`). On top of that, `initializeEsignProviders()` (`server/services/esign/index.ts:47`) is **called from nowhere**, so the provider registry is unconditionally empty at runtime and every e-signature path resolves no provider at all. This is deliberate while the DocuSign operations are unimplemented, and the builder exposes DocuSign as "Coming Soon". Do not describe e-signature as working or partially working (DEBT-4, verified 2026-07-29).
- **AI document mapping** — mapping suggestions render, but `DocumentTemplateEditor.handleApplyMapping` only logs them and does not persist them (`client/src/components/builder/templates/DocumentTemplateEditor.tsx:65-69`). Track persistence in GitHub #156.

## Backlog (no committed dates)

Earlier roadmap targets (enhanced versioning, integration marketplace, adaptive personalization, mobile builder) did not ship and have no current target dates. Do not treat old Q1–Q3 2026 dates as commitments.

---

## Security Features

### Scripting System Sandboxing

**JavaScript (vm2/vm):**
- No access to `require`, `process`, `Buffer`, `global`, timers
- Only `input`, `context`, and `helpers` objects available; `emit()` for output
- Timeout enforced (100–3000ms configurable); code limit 32KB; output limit 64KB
- Note: `vm2`/`isolated-vm` are optional deps and may be absent locally — sandboxed JS paths can't execute on such machines (see run-tests skill)

**Python (subprocess):**
- Isolated subprocess, restricted builtins (no `os`, `sys`, `open`, `subprocess`, `socket`)
- No file system or network access; timeout with process termination; max output 64KB

**Helper Library & Execution:**
- HTTP from scripts proxied through the backend (`safeFetch`, URL validation — see docs/architecture/SECURITY_THREAT_MODEL.md)
- Console capture; input/output key allowlists; non-breaking error handling
- Execution audit logging; workflow-ownership validation; rate limiting on test endpoints

### General Security

- Google OAuth2 + JWT authentication (+ email/password with MFA)
- Session management (PostgreSQL store)
- AES-256-GCM secrets encryption with `VL_MASTER_KEY`
- CORS configuration, Zod input validation (mass-assignment protection — parse explicit fields, never spread `req.body`)
- Drizzle ORM (SQL injection protection)
- Rate limiting on test endpoints; file upload limits (10MB, MIME validation)

---

## Recent Architecture Changes

### Graph Builder Removal (June–July 2026)
The visual/graph (React Flow) builder, its execution engine, its REST API, and the `runs`/`run_logs`/`run_outputs` tables were fully removed. `workflow_runs` + `step_values` are the only execution model. The `/runs` dashboard pages were removed with it.

### Migration Baseline Compaction (July 2026)
The migration chain was compacted into a single `migrations/0000_init_baseline.sql` that builds a correct schema from scratch; the journal is clean. See the `db-schema-change` skill before touching migrations.

### Test Suite Split (Feb 2026)
Vitest is split into 3 projects: `unit-fast` (no DB, ~13s), `unit-db`, `integration` (real Postgres, `TEST_DATABASE_URL`). See the `run-tests` skill.

### Lint Zero-Error Policy (Feb–Mar 2026)
ESLint errors reduced from 12,694 to 0; `npm run lint` runs with `--max-warnings 0` policy on errors.

### Custom Scripting System (Dec 2025)
Lifecycle hooks (beforePage, afterPage, beforeFinalBlock, afterDocumentsGenerated) and document hooks (beforeGeneration, afterGeneration), 40+ helpers, script console.

### DataVault v4 + Visibility Logic Builder (Nov 2025)
Data platform with databases/tables/permissions/API tokens; two-tier visibility system.

### Survey System Removal (Nov 2025)
Legacy survey UI removed (~11,763 LOC); ezBuildr is 100% workflow-focused. No survey tables remain in the schema.
