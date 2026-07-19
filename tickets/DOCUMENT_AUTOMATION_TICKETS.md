# Document Automation — Manual Path Tickets (DOC-101..112)

Source: document-automation deep dive, 2026-07-13. Four parallel code audits
(client runner, server run pipeline, document engine, AI/template paths), every
finding verified against the code with file:line evidence.

## 2026-07-14 closeout update

Repo hygiene is now green: `npm run check` and `npm run lint` both pass, with lint at **0 errors / 0 warnings** and CI lint restored as a blocking gate. DOC-102 remains open because the required HND-10 live runner smoke could not be completed in this local pass: both `npm run test:fast` and `npm run dev:test` hit sandbox read restrictions, and the required unsandboxed reruns were rejected because the workspace is out of credits.

Scope of this push: **run start → interview → variable JSON → document**, manual
path first. The AI path is the next push and every ticket here should leave an
interface the AI path can reuse (see DOC-105).

> **See also `RUNNER_HARDENING_TICKETS.md` (RUN-1..12), 2026-07-13.** A follow-up
> runner audit that overlaps this backlog. Two cross-cutting decisions landed
> there that affect tickets here: (1) **DOC-108 is superseded by RUN-2** (blank
> auto-generated documents — verified). (2) The step config field will be
> **renamed `steps.options` → `steps.config` end-to-end** (RUN-6, Option B) —
> any new ticket touching step config should assume the field is `config`.

## Verification review — 2026-07-13 PM (senior close-out pass)

Every ticket re-verified against the actual code (committed `747011ad`/`0a125a00`
plus the uncommitted working set). **Verdict: nothing closes yet.** A large,
genuinely good implementation wave landed most of the backlog's substance, but
the close bar is "acceptance criteria pass on a tree that builds and is green,"
and the tree currently fails that gate:

### 🚫 Release blockers (fix before ANY ticket closes)

| # | Blocker | Evidence |
|---|---|---|
| B1 | **Working tree does not compile — 67 tsc errors.** The RUN-6 `options`→`config` rename is mid-flight; tests/scripts/5 services still reference `options` | `npx tsc --noEmit --pretty false` → 67 errors across 26 files |
| B2 | **RUN-2 P0 active: completion auto-generates BLANK documents.** Uncommitted change passes stepId-keyed `blockResult.data` into generation; templates key on alias | `RunCompletionService.ts:101` → `generateDocuments(runId, blockResult.data)`; `RunLifecycleService.ts:377` `currentData ?? getRunDataWithAliases(...)` |
| B3 | **Logic rules silently disabled in the runner.** The decomposed `WorkflowRunner` hardcodes `logicRules={[]}` (old runner fetched `/api/workflows/:id/logic-rules`); rule-driven show/hide/require no longer runs client-side | `client/src/pages/WorkflowRunner.tsx:210` |
| B4 | **HEAD's runner fetches a nonexistent endpoint.** Committed `WorkflowRunner` (747011ad) loads steps from `GET /api/workflows/:workflowId/steps`, which only exists in the *uncommitted* diff — at HEAD the interview cannot load steps | `WorkflowRunner.tsx:50` vs `steps.routes.ts:132` (uncommitted) |
| B5 | **`pdfStrategy` out-of-scope identifier** — compile error / RUN-5 crash | `FinalBlockRenderer.ts:355` references `pdfStrategy`; `prepareResponseDocuments(results, toPdf)` has no such param |
| B6 | 4 unit suites failing: `RunCompletionService` (suite), `RunExecutionCoordinator` (2 tests — rename fallout), `StepService`, `AliasRenameService` | `npm run test:fast` |
| B7 | Codemod junk `update_blocks.py` at repo root; must not ship | repo root |

### Per-ticket verdicts

| Ticket | Verdict | What's genuinely done (verified) | Returned — what's missing | Remaining effort |
|---|---|---|---|---|
| DOC-101 autosave | 🟡 Returned | Debounced 1.5s autosave wired (`useRunValues`+`useAutoSave`), flush on Next/Prev, `beforeunload` keepalive, preview disabled, Saving/Saved indicator in header, 3 unit tests green | (1) `performSave` doesn't throw on `!response.ok` — a 500 shows **"Saved"** and marks data clean, so no retry until the user types again; (2) no integration test proving persistence to `step_values` (AC) | **S** (~½ day) |
| DOC-102 decompose | 🟡 Returned | 1003→233-line `WorkflowRunner`, 4 hooks extracted, `runner/blocks/validation.ts` deleted, focus-to-first-invalid added | Regressions **B3** + **B4**; still TWO visibility systems (`useSectionVisibility` visibleIf-only for nav vs `useWorkflowVisibility` rules in `SectionSteps`); 3 raw `fetch` calls remain (`WorkflowRunner.tsx:52`, `useRunValues.ts:88`, `useRunNavigation.ts:184`); preview NOT isolated (mode branches throughout `useRunNavigation`); dead-code AC unaddressed | **S urgent** (B3/B4) + **M** (1–2 days) for the rest |
| DOC-103 conditions | 🔴 Returned | Conditions now evaluate against normalized, hook-enhanced values (one-line fix) + new 20-case test file green | The private 7-operator evaluator still exists; no delegation to `shared/conditionEvaluator`; 28-operator + nested-path ACs unmet. RUN-11 (silent no-op date operators) also still open | **M** (~1 day) |
| DOC-104 visibility | 🟡 Returned (closest) | `nullGetter` tracks unresolved tags (`RenderCore.ts:123-131`); `unresolvedVariables` persisted; `generationStatus` pending/generating/done/failed with **CAS `tryMarkGenerating`** (also progress on RUN-10); `/documents` returns status; `FinalDocumentsSection` distinguishes generating/failed/fallback; creator DocumentsTab | `pdf_failed` column exists but **is never written** by generation code (only a metrics fn named `pdfFailed` exists); the two AC integration tests (unknown-tag report; resolver-throw → `failed:` status) missing; end-to-end value defeated by B2 until fixed | **S** (~½ day) after B2 |
| DOC-105 AI foundations | ✅ Closed 2026-07-14 (HND-9) | `WorkflowContentIngestService` exists, `RunDataService` is the canonical run data builder, HND-4 added validated `/values/bulk` writes, and HND-9 proves AI↔manual ingest parity with an integration test | — | — |
| DOC-106 logic N+1 | ✅ Closed 2026-07-13 (HND-5) | Query-count unit test proves `determineStartSection`, `evaluateNavigation`, and `validateCompletion` perform bounded repository loads | — | — |
| DOC-107 PDF honesty | ✅ Closed 2026-07-13 (HND-6) | API/schema accept only `puppeteer`, strategy is recorded, and README documents the actual Mammoth HTML → Puppeteer pipeline + fidelity limits | — | — |
| DOC-108 transforms | 🔴 → **RUN-2** | (intent implemented) | The implementation is exactly the RUN-2 P0: threading `blockResult.data` stepId-keyed regressed ALL alias variables. Fix = `toAliasKeyed` at the completion→generation boundary (RUN-2 has the design + proof) | **S** — do first |
| DOC-109 helpers | 🟡 Returned | All 5 helpers (`concat/round/percentage/addDays/daysBetween`) implemented, registered, 83 tests green in the extended suite | Upload-time unknown-helper warning in `TemplateValidationService` (AC 2) unverified/likely absent; can close quickly once tree is green | **XS** |
| DOC-110 submit scope | ✅ Closed 2026-07-13 (HND-8) | Section submit now rejects out-of-section stepIds with a 400; autosave keeps using `/values/bulk` for all form values | — | — |
| DOC-111 a11y | ✅ Closed 2026-07-14 (HND-7) | `vitest-axe` smoke covers `SectionSteps` with every rendered runner block type and asserts zero serious/critical violations; keyboard smoke/checklist recorded; text/scale/address ARIA issues fixed | — | — |
| DOC-112 polish | 🟡 Returned | `FullScreenLoader`, friendly Session Error card, "Review" label fix, per-step `BlockErrorBoundary`, old comment blocks gone with the rewrite | Verify branding-aware loading (minor); close after the tree compiles & suites green | **XS** |

### Suggested close-out order (fastest path to closing tickets)

1. **B1** — finish the `options`→`config` rename (tests/scripts/5 services), get tsc to 0 and the 4 suites green.
2. **B2/DOC-108** — `toAliasKeyed` at the completion handoff (RUN-2's fix sketch), plus its regression test.
3. **B3 + B4** — re-wire logic rules into the runner; commit the steps endpoint with the runner change (never apart).
4. **B5/DOC-107 + B7** — thread `pdfStrategy`, delete the codemod, docs alignment → close DOC-107.
5. DOC-104 pdfFailed write + 2 integration tests → close DOC-104. DOC-109 validation warning → close. DOC-112 → close. DOC-101 error-honesty + integration test → close. DOC-111 axe pass → close.
6. Then the structural remainder: DOC-102 (one visibility path, preview boundary), DOC-103/RUN-11, DOC-105 remainder (with RUN-1), DOC-106 test.

Total remaining to clear the whole board (excl. DOC-110 decision): roughly **4–6 focused days**.

---

> **Third pass — 2026-07-13 ~18:00.** Gates now: `tsc` **0 errors**, unit-fast
> **1,628 green**, DOC-109's `unknownHelpers` report finished + tested (83 tests
> green) — but its new helper code carries 3 `strict-boolean-expressions` errors
> (`docxHelpers.ts:169,189`), so **DOC-109 joins DOC-101/DOC-104 as functionally
> complete, held for lint**. Full-repo lint measured and split: **799 errors =
> 323 in files touched by this push + 476 pre-existing drift** in 121 untouched
> files (the morning "was 0" framing was wrong — drift predates today; CI lint
> is advisory by design, `ci.yml:10-13`). All remaining work is now packaged as
> self-contained dev handoff tickets: **see `CLOSEOUT_HANDOFF_TICKETS.md`
> (HND-1..8)** — HND-1 closes DOC-101/104/109; HND-3 closes DOC-102; HND-4
> closes DOC-105; HND-5 → DOC-106; HND-6 → DOC-107; HND-7 → DOC-111; HND-8 →
> DOC-110.

## Second verification pass — 2026-07-13 evening (close-out)

All seven blockers from the morning review were re-verified: **B2–B7 are fixed**
(B2 via a proper `RunDataService` with `byStepId`/`byAlias` views — the RUN-1
design — plus the RUN-4 unification of both generation entry points and the
RUN-12 tenancy fix landing early). Gates: `tsc` 1 error remaining
(`TemplateValidationService.ts:215`, the in-flight DOC-109 work), unit-fast
**1,626 green**, key integration suites (docs.autogeneration incl. the two new
DOC-104 tests, api.runs.bulk-values, runtime-pipelines) **10/10 green**.

**New global gate: `npm run lint` = 793 errors (repo policy is zero).** Mostly
mechanical (`any`-typed hook props and unsafe-* in the refactored runner files,
plus rename churn); ~126 sit in this push's own files. Largest: 33
`useRunNavigation`, 33 `WorkflowRunner`, 29 `useRunValues`.

### ✅ CLOSED (all ACs independently verified, tests green, own files lint-clean)

| Ticket | Closing evidence |
|---|---|
| **DOC-103** | Private operator switch deleted; `evaluateConditions` translates the legacy `{key,op,value}` shape and delegates to `shared/conditionEvaluator.evaluateConditionExpression` (`EnhancedDocumentEngine.ts:525`) over alias-keyed, hook-enhanced, normalized data (`:404`); 10-test suite covers all 7 legacy operators + alias + nested-path, green |
| **DOC-108** | Closed as superseded-resolved (RUN-2): `RunDataService.fromStepIdData(blockResult.data, steps)` at the completion handoff (`RunCompletionService.ts:102`) — transform outputs pass through `toAliasKeyed`, lifecycle consumes `runData.byAlias` (`RunLifecycleService.ts:392-393`); unit test asserts the alias conversion; both generation paths now share one pipeline |
| **DOC-112** | `FullScreenLoader`, friendly Session Error card, "Review" header label, per-step `BlockErrorBoundary` in `SectionSteps`; components lint-clean. (Branding during initial load: nothing brandable is loaded yet — accepted as written, "where available") |

### 🟡 FUNCTIONALLY COMPLETE — held only for lint hygiene (close after cleanup)

| Ticket | Verified | Holding because | Effort |
|---|---|---|---|
| **DOC-101** | All ACs pass: `fetchAPI` now throws on `!ok` so the indicator is honest (`error` state reachable, retry via unsaved-changes + beforeunload keepalive flush); integration test proves persistence to `step_values`; debounce/flush/preview-off all verified | 29 lint errors in `useRunValues.ts` + 1 in `useAutoSave.ts` (`any`-typed props) — repo lint gate is zero-error | **XS** |
| **DOC-104** | All ACs pass: `pdfFailed` now written end-to-end (`DocumentEngine.ts:74` → renderer → `RunLifecycleService.ts:440`); both AC integration tests exist and are green (unknown-tag reported; resolver-throw → `failed:` status) | 6 errors `FinalDocumentsSection.tsx`, 3 `DocumentsTab.tsx`, 1 `RenderCore.ts` | **XS** |

### 🟠 OPEN — real work remaining

| Ticket | Landed since morning | Still missing | Effort |
|---|---|---|---|
| **DOC-102** | 🟡 HND-3 code complete: runner navigation/value preview differences are behind adapters; raw runner `fetch(` grep is empty; preview evaluates persisted logic rules again; show/hide behavior has a hook regression test; runner files are targeted-lint clean; `npm run test:fast` green (1,636 passed / 15 skipped); `npm run dev:test` served HTTP 200 | Full production + preview browser click-through from start → autosave → skip logic → review → complete → documents still pending before closing | **S** |
| **DOC-105** | ✅ Closed via HND-9: ingest service validates + serves template & AI paths; `RunDataService` is the single variable-context builder; `/generate-final` now delegates to `runService.generateDocuments` (RUN-4); HND-4 validates `/values/bulk` writes; HND-9 adds AI↔manual parity coverage | — | — |
| **DOC-106** | ✅ Closed via HND-5 query-count tests | — | — |
| **DOC-107** | ✅ Closed via HND-6 README cleanup | — | — |
| **DOC-109** | 5 helpers implemented + 83 tests green; `unknownHelpers` report started | THE remaining tsc error (`TemplateValidationService.ts:215` — one return path missing `unknownHelpers`); finish + test | **XS** |
| **DOC-110** | ✅ Closed via HND-8 section-submit scoping decision | — | — |
| **DOC-111** | ✅ Closed via HND-7: `tests/unit/client/SectionSteps.a11y.test.tsx` renders every runner block type, asserts zero serious/critical axe violations, records the keyboard checklist, and exercises keyboard interaction for primary controls | — | — |

### Behavior changes worth knowing (not blockers)

- `/generate-final` now goes through `runService.generateDocuments`, which
  **skips generation when documents already exist** — regenerate flows must
  DELETE first (the client's regenerate path already does).
- Preview mode no longer receives logic rules (`effectiveLogicRules = []`).

### Path to a fully closed board

1. Fix the 1 tsc error (DOC-109) → close DOC-109.
2. Lint hygiene pass over the ~126 new-file errors (mostly typing hook props) →
   closes DOC-101, DOC-104; then take the repo-wide 793 back to 0 before push.
3. README cleanup → close DOC-107. Axe/keyboard evidence → close DOC-111.
4. DOC-102 preview boundary, DOC-105 validated writes + parity test, DOC-106
   test, DOC-110 decision.

Remaining runway: **~2–3 focused days** (was 4–6 this morning).

## Already shipped (commit `bb048426`, 2026-07-13) — for context

- Idempotent run completion (conditional `markComplete`, docs-exist gate,
  per-run in-flight dedup in `RunLifecycleService.generateDocuments`)
- Unified auth/anonymous completion (anon runs now execute DataVault writebacks)
- `POST /api/runs/:runId/generate-final` keys variables by alias (was raw stepId)
- Partial document mappings merge instead of replacing the variable set
- `GET /api/runs/:runId` honors run-token auth
- Batched section-submit value writes (`upsertMany` + one membership prefetch)
- `/w/:slug` renders the real runner (PublicRunner stub deleted); anonymous
  start accepts `publicLink`, `slug`, and public-workflow UUIDs
- Runner navigation dead-end fallback; completion analytics fire on actual submit

---

## DOC-101 — Runner autosave (answers must survive a refresh) ✅ CLOSED 2026-07-13 (fifth pass — files lint-clean, all ACs verified)

**Priority: P1 (highest-value UX gap in the interview).** Size: M

**Problem.** Answers live only in React state (`formValues`) until the user
clicks Next; a refresh, crash, tab close, or navigation loses the entire
current page. Meanwhile a complete debounced autosave hook
(`client/src/hooks/useAutoSave.ts`) and a per-step save mutation
(`useUpsertValue`, `client/src/hooks/api/useRuns.ts:44`) exist and are used by
nothing.

**Evidence.** `client/src/pages/WorkflowRunner.tsx` — `onChange` only writes
local state; the sole persistence call is `useSubmitSection` at the section
boundary.

**Fix sketch.** Debounced (~1–2s) per-step upsert to
`POST /api/runs/:runId/values` while typing; flush pending saves on `Next`,
`Prev`, and `beforeunload`; section submit remains the validation gate.
Autosave must be disabled in preview mode (preview has no DB run).

**Acceptance criteria**
- [ ] Editing a field and refreshing within 5 seconds restores the value on resume (via existing `useRunWithValues` hydration).
- [ ] Autosave is debounced: continuous typing in a text field produces at most 1 request per debounce window, not per keystroke.
- [ ] `Next` still submits the section exactly once with validation; no duplicate or racing writes between autosave flush and section submit.
- [ ] Autosave failures are non-blocking (silent retry or subtle indicator — no toast per failure) and never lose later keystrokes.
- [ ] A visible save-state indicator exists (e.g. "Saved" / "Saving…" in the runner header).
- [ ] Preview mode performs zero autosave network calls.
- [x] Unit test covers debounce + flush-on-navigation; an integration test proves a value written by autosave persists in `step_values`.

---

## DOC-102 — Decompose WorkflowRunner + single validation/visibility path 🟡 ONE AC LEFT (live smoke — HND-10)

**Priority: P1 (foundation for everything else, incl. AI).** Size: L

**Problem.** `client/src/pages/WorkflowRunner.tsx` is ~850 lines with
`handleNext` alone ~230 lines (multiple complexity eslint-disables at lines
95/428). Preview and production branches interleave throughout. Inline `fetch`
calls bypass the API layer (lines ~152/248/293/558). Validation logic exists
twice (`shared/validation/*` used by the runner vs the orphaned
`client/src/components/runner/blocks/validation.ts`), and section visibility is
reimplemented inline in at least three places (`WorkflowRunner.tsx:314-323`,
`:449-471`, `PreviewRunner.tsx:182-193`) each with its own alias resolver.

**Fix sketch.** Extract: `useRunSession` (init/resume/token), `useRunNavigation`
(next/prev/review), `useRunValues` (values + autosave from DOC-101), and a
single `useSectionVisibility` hook wrapping `shared/conditionEvaluator` +
`shared/workflowLogic` with one alias resolver. Delete
`runner/blocks/validation.ts`. All network calls through `vault-api`.

**Acceptance criteria**
- [x] `WorkflowRunner.tsx` is under 300 lines and carries no complexity/max-lines eslint-disables.
- [x] Exactly one client-side section-visibility implementation remains, used by runner, `handleNext` filtering, and `PreviewRunner`.
- [x] `client/src/components/runner/blocks/validation.ts` is deleted; `shared/validation` is the only validator.
- [x] No raw `fetch` in the runner path — everything goes through `client/src/lib/vault-api.ts` (which owns run-token attachment).
- [ ] Preview mode is isolated behind one boundary (a provider or adapter), not `mode === 'preview'` conditionals scattered through handlers.
- [ ] Behavior parity: existing e2e/manual flows (start, resume, skip logic, review, complete, documents) unchanged; `npm run test:fast` green. 2026-07-14 attempt blocked by sandbox/approval credit state; see `CLOSEOUT_HANDOFF_TICKETS.md` HND-10.
- [x] Dead code removed: `FillPageWithRandomDataButton` (unimported) either wired into preview or deleted; `IntakeAssignmentSection` "Start Workflow" buttons get a working `onClick` or the section is hidden.

---

## DOC-103 — One condition engine for document inclusion ✅ CLOSED 2026-07-13

**Priority: P2 (correctness).** Size: M

**Problem.** Which documents get generated is decided by a private, simplified
evaluator (`EnhancedDocumentEngine.evaluateConditions`,
`server/services/document/EnhancedDocumentEngine.ts:496-540`) supporting only 7
operators, no alias resolver, evaluated against **raw** step values — while
runtime visibility uses `shared/conditionEvaluator` (28 operators) against
alias-resolved data. The same logical intent can show a step but skip its
document, or vice versa. Conditions on nested/dot-path keys behave differently
than the template body sees them (normalized/flattened).

**Fix sketch.** Replace the private evaluator with
`shared/conditionEvaluator.evaluateConditionExpression`, fed the same
alias-keyed data the templates receive; keep a compatibility shim for the
legacy `{key, operator, value}` condition shape (translate to a
`ConditionExpression`).

**Acceptance criteria**
- [x] `EnhancedDocumentEngine.evaluateConditions` delegates to the shared evaluator; the private operator switch is deleted.
- [x] Document conditions evaluate against the same alias-keyed, hook-enhanced data object the template renders with (not pre-hook raw values).
- [x] All 28 `ComparisonOperator` values work in document conditions; existing 7-operator configs keep their current semantics (regression tests for each).
- [x] A condition referencing a nested value (e.g. `address.city`) matches the same path a template `{{address.city}}` resolves.
- [x] Unit tests: one per legacy operator + one alias-based + one nested-path condition.

---

## DOC-104 — Make missing variables and generation failures visible ✅ CLOSED 2026-07-13 (fifth pass — incl. generation_status varchar overflow fix)

**Priority: P2 (the #1 "my document is blank/missing" support driver).** Size: M

**Problem.** Three stacked silent fallbacks (`nullGetter: () => ''` in
`RenderCore.ts:130`; null→`''` in `VariableNormalizer.ts:133`; missing mapping
source→`''` in `MappingInterpreter.ts:160`) mean a bad template renders blank
with no signal. Generation runs fire-and-forget after completion
(`RunCompletionService.ts`) and the client polls `GET /api/runs/:runId/documents`,
which cannot distinguish "still generating" from "failed" from "no documents
configured" (`FinalDocumentsSection.tsx:103-116` polls every 2s forever).

**Fix sketch.**
1. Collect a per-document `unresolvedVariables[]` during render (RenderCore
   already knows every nullGetter hit) and persist it with the
   `run_generated_documents` row (or a sibling status record).
2. Add a generation-status surface: either a `generationStatus` field
   (`pending|generating|done|failed:<reason>`) on the run or a
   `GET /api/runs/:runId/documents/status` endpoint, written by
   `RunLifecycleService.generateDocuments`.
3. Client: `FinalDocumentsSection` shows generating/failed states and stops
   polling on terminal states; creator-facing UI (run detail) lists unresolved
   variables per document.

**Acceptance criteria**
- [x] After generation, each document record exposes the list of template tags that rendered empty (empty list when none).
- [x] The respondent-facing completion screen distinguishes: generating (spinner), done (downloads), failed (friendly error), none-configured (no infinite spinner). Polling stops on terminal states.
- [x] A generation failure on the fire-and-forget path is persisted and queryable — not just a server log line.
- [x] PDF-conversion fallback to DOCX-only (`DocumentEngine.ts:67-70`) is recorded on the document record (`pdfFailed: true` or similar) instead of silently downgrading.
- [x] Integration test: template with an unknown `{{tag}}` → generation succeeds AND reports that tag; template resolver throwing → status = failed with reason.

---

## DOC-105 — Shared foundations the AI path will reuse ✅ CLOSED 2026-07-14 (HND-9)

**Priority: P2 (prerequisite for the AI push).** Size: L

**Problem.** Three parallel ingest paths exist for workflow content: manual
builder CRUD (`sections/steps/blocks.routes.ts`), AI apply
(`WorkflowService.replaceWorkflowContent`, forked at
`workflows.routes.ts:199-205`), and template instantiate
(`TemplateService.instantiate:87` — copies `graphJson` verbatim with **no
validation**). AI-side normalization/validation
(`normalizeWorkflowTypes`/`validateWorkflowStructure` in
`server/services/ai/AIServiceUtils.ts`) runs on none of the other paths. For
runs, programmatic value writes (AI prefill, `POST /values/bulk`) bypass the
validation that only `submitSection` performs.

**Fix sketch.** Three seams:
1. `WorkflowContentIngestService.apply(workflowId, content, {source})` — one
   entry that normalizes + validates + diff-upserts; manual deep-update, AI
   apply, and template instantiate all call it.
2. `RunValueWriteService.writeValidated(runId, values, {mode})` — step-type
   validation + coercion shared by interactive submit and programmatic prefill.
3. `VariableContextService.assemble(runId)` — the one place that produces the
   alias-keyed document JSON (today buried in
   `RunLifecycleService.generateDocuments` step 3 + `FinalBlockRenderer`),
   reusable by AI mapping suggestions and template validation.

**Acceptance criteria**
- [x] Template instantiate rejects (or repairs, with report) a blueprint whose `graphJson` fails the same structural validation AI output must pass.
- [x] AI apply and manual deep-update produce identical DB state for identical content (test: same fixture through both paths → same sections/steps/blocks rows modulo ids). Evidence: HND-9, `tests/integration/workflow-content-ingest-parity.test.ts`.
- [x] One exported function returns the document variable context for a run; `RunLifecycleService`, `finalBlock.routes.ts`, and template validation all call it (no other `getRunDataWithAliases` call sites in doc paths).
- [x] `POST /api/runs/:runId/values/bulk` validates values against step type/config (rejecting e.g. a radio value not in options) or the ticket documents the explicit decision not to. Evidence: HND-4, `RunPersistenceWriter.bulkSaveValues`, `tests/integration/api.runs.bulk-values.test.ts`.
- [x] `docs/claude/SERVICES.md` updated with the new services.

---

## DOC-106 — Request-scoped logic context (kill the N+1s) ✅ CLOSED 2026-07-13 (HND-5)

**Priority: P3 (performance; severe only on snapshot/randomize runs).** Size: M

**Problem.** `RunLifecycleService.determineStartSection` (`:213`) calls
`logicSvc.isSectionVisible/isStepVisible/isStepRequired` per section × step,
and each call independently reloads all logic rules and steps
(`LogicService.ts:381,428,441,487,514`) — O(sections × steps) full reloads on
every snapshot- or randomize-created run. `evaluateNavigation` /
`validateCompletion` also each reload sections+steps+rules+values from scratch,
so one submit→next round trip loads the same data 3-4 times.

**Fix sketch.** A `LogicContext` value object (sections, steps, rules, alias
map, values) loaded once and passed through; `LogicService` methods accept an
optional prebuilt context. `determineStartSection` builds it once.

**Acceptance criteria**
- [x] `determineStartSection` performs a constant number of queries (≤5) regardless of section/step count.
- [x] A single section submit + next performs at most one load each of sections, steps, rules, and values (verify by counting repo-mock calls in a unit test). Evidence: `tests/unit/services/LogicService.queryCounts.test.ts`.
- [x] No behavior change: `npm run test:fast` green (1,634 passed / 15 skipped); targeted query-count unit tests green.

---

## DOC-107 — PDF strategy honesty (fidelity) ✅ CLOSED 2026-07-13 (HND-6)

**Priority: P3.** Size: S (honesty) / L (real office-converter strategy)

**Problem.** The API used to accept an unsupported office-converter
`pdfStrategy` value and docs advertised it, but `PdfConverter.ts`
implements only Mammoth→HTML→Puppeteer (layout fidelity loss: tables get
generic CSS at `PdfConverter.ts:79-118`, headers/footers dropped) plus a
Gotenberg stub that throws. The unsupported value silently behaved as
`'puppeteer'`.

**Fix sketch (phase 1, S).** Remove the unsupported strategy from the Zod enums and
docs, or return `501` when requested; log which strategy actually ran onto the
document record. **Phase 2 (L, separate decision):** implement a real
`soffice --headless` strategy behind an env flag for layout-critical templates.

**Acceptance criteria (phase 1)**
- [x] Requesting an unimplemented strategy is impossible (schema) or explicit (4xx/501) — never a silent substitute.
- [x] The strategy actually used is recorded per generated document.
- [x] `docs/api/`, `server/services/document/README.md`, and the OpenAPI spec agree with the code.

---

## DOC-108 — Completion-phase transform outputs must reach documents ✅ CLOSED 2026-07-13 (resolved via RUN-2 / RunDataService)

> **Superseded by RUN-2** (see `RUNNER_HARDENING_TICKETS.md`). Option (b) here
> ("thread completion's post-block data into generateDocuments") was implemented
> but stepId-keyed, which regressed *all* alias variables, not just computed
> ones — documents auto-generated on completion now render blank. RUN-2 is the
> verified fix and preserves this ticket's intent (computed outputs survive).
> Track the work under RUN-2.

**Priority: P3 (correctness, affects computed values in documents).** Size: M

**Problem.** `onRunComplete` transform/lifecycle outputs merge into an
in-memory map (`BlockRunner.ts:143,183`) but persist to `step_values` only when
the block has a `virtualStepId` (`TransformBlockService.ts:394-419` logs
"output will not be persisted" otherwise). `generateDocuments` re-reads
`step_values` fresh (`RunLifecycleService.ts:359`), so completion-phase
computed values without a virtual step silently never appear in documents.

**Fix sketch.** Either (a) guarantee every transform block gets a virtual step
(migration `scripts/migrateTransformBlockVirtualSteps.ts` exists — enforce at
block save), or (b) thread the post-block `currentData` from completion into
`generateDocuments` instead of re-reading. (a) is more durable.

**Acceptance criteria**
- [ ] A workflow with an `onRunComplete` transform (no manual virtual-step setup) produces a document containing the transform's output under its alias.
- [ ] Creating/updating a transform block without a `virtualStepId` is impossible, or the value-threading path is covered by an integration test.
- [ ] The "output will not be persisted" warning path is unreachable for newly created blocks.

---

## DOC-109 — Ship or unship the five phantom template helpers ✅ CLOSED 2026-07-13 (fifth pass — 1 style nit rolled into HND-1)

**Priority: P4.** Size: S

**Problem.** `concat`, `round`, `percentage`, `addDays`, `daysBetween` are
documented (`server/services/document/README.md:411-455` and the user guide)
but don't exist in `docxHelpers.ts`/`formatters.ts`. A template using them gets
a swallowed helper error → empty string (`RenderCore.ts:101-105`).

**Fix sketch.** Implement all five in `docxHelpers.ts` (each is <10 lines,
date ones via date-fns) — they're genuinely useful and cheap. Otherwise strip
them from all docs.

**Acceptance criteria**
- [ ] Every helper named in the README, `VARIABLES_IN_DOCUMENTS.md`, and the helper table renders correctly in a real DOCX fixture test.
- [ ] `TemplateValidationService` warns on unknown helper names at upload/validate time (so future phantom helpers are caught before generation).

---

## DOC-110 — Decide: should section submit accept out-of-section steps? ✅ CLOSED 2026-07-13 (HND-8)

**Priority: P4 (decision ticket).** Size: S once decided

**Problem.** `POST /api/runs/:runId/sections/:sectionId/submit` persists every
`values[].stepId` after only a workflow-membership check
(`RunPersistenceWriter.saveStepValue` / `bulkSaveValues`) — nothing ties values
to `:sectionId`. A client can write any in-workflow step through any section
submit. This may be load-bearing (clearing hidden steps elsewhere, repeater
side-writes), which is why it was deliberately NOT changed in `bb048426`.

**Acceptance criteria**
- [x] Audit client callers for legitimate cross-section writes; document findings on this ticket. `useRunNavigation.handleNext` filters to visible steps in the current section; autosave/back-navigation uses `/values/bulk`, not section-submit.
- [x] Either: submits are scoped to the section's steps (+ an explicit allowance for hidden-step clearing) with a test proving out-of-section writes 400; or: the permissive behavior is documented as intentional in `docs/claude/API_ENDPOINTS.md` with rationale. Decision: reject out-of-section section-submit values; no carve-outs found.

---

## DOC-111 — Runner accessibility pass ✅ CLOSED 2026-07-14 (HND-7)

**Priority: P4 (professional polish, compliance).** Size: M

**Problem.** Only `TextBlockRenderer` receives/uses `ariaDescribedBy`
(`BlockRenderer.tsx:102`). Date, Number, Boolean, Choice, etc. never link their
description/error text for screen readers; required is conveyed by an
`aria-hidden` asterisk with no `aria-required`; invalid state lacks
`aria-invalid`.

**Acceptance criteria**
- [x] Every block renderer wires `aria-describedby` to its description + error node ids (the ids are already built at `BlockRenderer.tsx:85-89`).
- [x] Required inputs expose `aria-required="true"`; fields with active errors expose `aria-invalid="true"`.
- [x] Error containers keep `role="alert"`; focus moves to the first invalid field on failed submit (not just scroll).
- [x] Keyboard-only walkthrough of a workflow with every block type completes without a mouse. Evidence: HND-7 checklist header and keyboard smoke in `tests/unit/client/SectionSteps.a11y.test.tsx`.
- [x] Verified with axe (or equivalent) on a preview run: zero critical violations in the runner. Evidence: HND-7 `vitest-axe` smoke asserts zero serious/critical violations for representative `SectionSteps` runner blocks.

---

## DOC-112 — Runner loading/error state polish ✅ CLOSED 2026-07-13

**Priority: P4.** Size: S

**Problem.** Init/loading states are bare centered gray text
("Starting workflow…", `WorkflowRunner.tsx:392-419`) unlike the polished
`FullScreenLoader` used elsewhere; render errors fall back to raw
`Error rendering workflow: {String(error)}` (`:843-846`); the progress header
shows "Step N+1 of N" during Review (`ClientRunnerLayout.tsx:33-37`).

**Acceptance criteria**
- [ ] Loading states use the shared loader/skeleton components and respect workflow branding where available.
- [ ] Render errors show a friendly message + retry, never a stringified exception.
- [ ] Review screen shows "Review" (or Step N of N), never N+1 of N; progress bar reads 100% only at Review/completion.
- [ ] Stray commented-out "OLD DIRECT COMPLETION LOGIC" and stream-of-consciousness comment blocks in `WorkflowRunner.tsx` are removed (may be absorbed by DOC-102).

---

## Suggested order

1. **DOC-101** (autosave) — immediate user-facing win, independent.
2. **DOC-102** (runner decomposition) — do second so autosave lands in the new structure, or fold DOC-101 into it.
3. **DOC-104** (visibility of failures) + **DOC-103** (condition engine) — the two remaining silent-wrongness sources.
4. **DOC-105** — right before the AI push starts, so the AI path lands on shared rails.
5. DOC-106..112 as capacity allows; DOC-109 and DOC-112 are good small-slot fillers.

> Note (not a ticket here): the in-flight `AdminOrgStatsRepository` stores the
> lazy `db` proxy as an instance property, which breaks unit suites that
> automock the repositories barrel ("Database not initialized" in
> `StepService`/`AliasRenameService` tests). Fix in that workstream: use the
> `BaseRepository` lazy-`getDb()` pattern instead of a `= db` constructor default.
