# Features & Security Reference

Feature status, security details, and recent architecture changes (verified July 2026).

## Complete Features (Production Ready)

| Feature | Description |
|---------|-------------|
| **Workflow Builder** | Page/step builder with 7-tab navigation and inspector panel |
| **37 Step Types** | Text, choice, date/time, currency, address, scale, signature block, computed, multi-field, plus easy/advanced-mode variants and the structural `list`. Two types (`file_upload`, `list`) are not respondent-fillable yet and render a skip notice; `RUNNER_INTENTIONALLY_UNSUPPORTED_STEP_TYPES` is the source of truth (`shared/types/runnerStepTypes.ts`). The retired `loop_group`/`repeater` types were removed in LIST-13. |
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
| **Legal Delivery Integrations** | Project-scoped Clio Manage OAuth/actions, Stripe PaymentIntents/signed webhooks, and production DocuSign envelope lifecycle |
| **Branding & Customization** | Custom colors, logos, domains, white-label intake forms, email templates (per-project settings) |
| **Admin & Audit** | Admin dashboard, user role management, audit logs, tenant MFA enforcement, AI settings |

## Orphaned / Partial

- **Review Gates** — `ReviewTaskService` and the `review_tasks` table exist, but the `/api/reviews` route layer was removed in the 2026 dead-code sweep. No UI or API exposes it; treat as dormant, not production.
- **Collections** (`/data`) — legacy datastore, superseded by DataVault but still present.
- **Self-hosted OAuth provider** — `oauth.routes.ts` exists but is intentionally disabled in `server/routes/index.ts` (security).
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

### Template Language (August 2026)
DOCX templates and the interview runner now share **one** grammar, parsed in a single place
(`server/services/document/RenderCore.ts`) via docxtemplater's `angular-expressions` wrapper.
It replaces a prefix form that allowed exactly one helper per tag and no chaining.

- **Pipe filters with chaining and colon-form arguments** — `{{ fee | usd }}`,
  `{{ name | trim | upper }}`, `{{ d | formatDate:"MM/DD/YYYY" }}`. Comparisons in section
  tags (`{{#a == b}}`), array indexing (`Children[9].name`) and `{{$index}}` all work.
- **Strict-undefined.** An unknown top-level variable raises and names itself instead of
  rendering blank; a known-but-empty one still renders blank. `RunDataService.buildForRun`
  seeds every aliased step as `null` so a skipped optional question is not read as a typo.
- **`{%` and `{#` are reserved** for future statement/comment syntax and rejected with a
  clear error, so templates migrated from `docxtpl` fail loudly rather than silently.
- **Template health at authoring time.** The placeholder inventory is parsed once at upload
  and stored on `templates.metadata`; the builder's template card shows variable counts,
  unmapped names with did-you-mean suggestions, and unused aliases. Objectively broken
  templates are refused at upload; an unresolved *variable* only warns, because uploading a
  document before the interview exists is a supported flow.
- **Date math is loud.** `addDays:"30"` no longer returns a date 18 months out, the two
  disagreeing date formatters were reconciled, and `addMonths`/`addYears`/`startOfMonth`/
  `endOfMonth` were added with a documented month-end clamp.

Structural constructs that always worked but were undocumented — table row loops, conditional
rows, multi-row spans, nested loops, mid-sentence conditionals — are now written up with Word
recipes. The guide's examples are **executable**: `tests/unit/services/document/docSamples.test.ts`
renders each one, so a sample that stops working fails the suite instead of rotting.

Business-day and holiday arithmetic are deliberately out of scope pending a decision on which
holiday calendar. See `docs/guides/VARIABLES_IN_DOCUMENTS.md`.

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
