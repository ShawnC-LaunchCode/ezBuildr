# Features & Security Reference

Feature status, security details, and recent architecture changes (verified August 2026).

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
| **Conditional Logic** | Show/hide/require/skip_to actions, 28-operator `ComparisonOperator` union evaluated by `shared/conditionEvaluator.ts`, visual editor |
| **Default Values** | Pre-fill with defaults, URL parameter override |
| **HTTP/API Integration** | REST client via `safeFetch`, OAuth2 (Client Credentials + 3-legged), webhooks |
| **Secrets Management** | AES-256-GCM encrypted storage, LRU cache |
| **Document Generation** | PDF/DOCX generation, template variables, repeating sections |
| **AI-Powered Features** | Workflow generation and AI editing (OpenAI/Anthropic/Gemini), logic generation/debugging, optimization wizard, template binding, feedback loop |
| **Templates & Marketplace** | Reusable templates, marketplace page (`/marketplace` UI, `/api/templates` backend), test runner |
| **Advanced Analytics** | Funnel analysis, dropoff tracking, heatmaps, branching analysis, export (JSON/CSV) |
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

### Document Mapping Workbench replaces the console-only AI mapping stub (August 2026)
`DocxMappingPanel` (added `bf564d7e`, GH-156) replaces the old `AIAssistPanel` /
`DocumentTemplateEditor.handleApplyMapping`, whose "apply mapping" action only
logged to the console — nothing was ever saved. The workbench extracts
`{{placeholder}}` names from the saved template, lets the author bind each one,
and persists the result to `templates.mapping`; AI-assisted suggestions are
folded in as a "Suggest with AI" action instead of a separate always-on panel.
This removes the "AI document mapping" item previously listed under
Orphaned/Partial above — the code it described no longer exists.

### Roadmap epics closed out (August 2026)
The 23 competitive-audit GitHub issues (GH-146..174), opened 2026-08-09 as
`tickets/ROADMAP_TICKETS.md`, retired 2026-08-18 with 20 of 27 tickets shipped.
The remaining 7 are epics rather than tickets — the audit that produced them
wrote against the product's intended shape, not the codebase, and 5 of the 6
open epics cite file paths that don't exist. They are parked in
`tickets/BACKLOG.md` (`needs-initiative`) rather than carried forward; promoting
one requires a fresh audit, not a re-read. GH-174 (this documentation ticket)
was the one exception carried into an active initiative instead of parked.
Full detail: `git log -p -- tickets/ROADMAP_TICKETS.md`.

### Legal Drafting Primitives & Curated Templates (August 2026)
Shipped 2026-08-12 → 2026-08-18. A drafting-vocabulary filter set
(`server/services/draftingPrimitives.ts`, merged onto the `docxHelpers` object
consumed by `RenderCore.ts`) adds hierarchical numbering (`1.1.1`, `(a)`,
`(i)`, `(A)`), party-plurality agreement (`plural`, `isAre`, `hasHave`), and
pronoun agreement — always from an explicit value, defaulting to they/them,
never inferred from a name. Three curated starter templates (NDA, Retainer
Agreement, Intake Questionnaire) ship at
`templates/curated/<slug>/{workflow.json,mapping.md,template.docx}`, each
authored only in the shipped filter vocabulary. The parent epic GH-173's
remaining scope (surfacing the curated templates to users) shipped separately
as the Template Marketplace initiative. Full detail:
`git log -p -- tickets/LEGAL_DRAFTING_TICKETS.md`.

### AI Service Layer unification (August 2026)
Closed 2026-08-10, 12/12 tickets. ezBuildr ran two AI stacks: a governed one
(`server/services/ai/`, behind `AIProviderClient` with per-tenant budget,
usage ledger, and retry/backoff) and a second set of call sites
(`/api/ai/transform/*`, `/api/ai/doc/*`, `/api/ai/personalize/*`,
`/api/ai/sentiment`) that constructed `new GoogleGenerativeAI(...)` directly
and ignored `AI_PROVIDER` entirely. Every LLM call now flows through
`AIProviderClient`, so `AI_PROVIDER` means what it says and a provider switch
is no longer partial. Budgets are denominated in dollars (warn/throttle
tiers, token cap retained as a secondary ceiling), and
`GET /api/admin/ai-settings/usage` reports real per-`(task_type, provider,
model)` cost. Full detail: `git log -p -- tickets/AI_SERVICE_LAYER_TICKETS.md`.

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
