# Document Automation — Manual Path Tickets (DOC-101..112)

Source: document-automation deep dive, 2026-07-13. Four parallel code audits
(client runner, server run pipeline, document engine, AI/template paths), every
finding verified against the code with file:line evidence.

Scope of this push: **run start → interview → variable JSON → document**, manual
path first. The AI path is the next push and every ticket here should leave an
interface the AI path can reuse (see DOC-105).

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

## DOC-101 — Runner autosave (answers must survive a refresh)

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
- [ ] Unit test covers debounce + flush-on-navigation; an integration test proves a value written by autosave persists in `step_values`.

---

## DOC-102 — Decompose WorkflowRunner + single validation/visibility path

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
- [ ] `WorkflowRunner.tsx` is under 300 lines and carries no complexity/max-lines eslint-disables.
- [ ] Exactly one client-side section-visibility implementation remains, used by runner, `handleNext` filtering, and `PreviewRunner`.
- [ ] `client/src/components/runner/blocks/validation.ts` is deleted; `shared/validation` is the only validator.
- [ ] No raw `fetch` in the runner path — everything goes through `client/src/lib/vault-api.ts` (which owns run-token attachment).
- [ ] Preview mode is isolated behind one boundary (a provider or adapter), not `mode === 'preview'` conditionals scattered through handlers.
- [ ] Behavior parity: existing e2e/manual flows (start, resume, skip logic, review, complete, documents) unchanged; `npm run test:fast` green.
- [ ] Dead code removed: `FillPageWithRandomDataButton` (unimported) either wired into preview or deleted; `IntakeAssignmentSection` "Start Workflow" buttons get a working `onClick` or the section is hidden.

---

## DOC-103 — One condition engine for document inclusion

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
- [ ] `EnhancedDocumentEngine.evaluateConditions` delegates to the shared evaluator; the private operator switch is deleted.
- [ ] Document conditions evaluate against the same alias-keyed, hook-enhanced data object the template renders with (not pre-hook raw values).
- [ ] All 28 `ComparisonOperator` values work in document conditions; existing 7-operator configs keep their current semantics (regression tests for each).
- [ ] A condition referencing a nested value (e.g. `address.city`) matches the same path a template `{{address.city}}` resolves.
- [ ] Unit tests: one per legacy operator + one alias-based + one nested-path condition.

---

## DOC-104 — Make missing variables and generation failures visible

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
- [ ] After generation, each document record exposes the list of template tags that rendered empty (empty list when none).
- [ ] The respondent-facing completion screen distinguishes: generating (spinner), done (downloads), failed (friendly error), none-configured (no infinite spinner). Polling stops on terminal states.
- [ ] A generation failure on the fire-and-forget path is persisted and queryable — not just a server log line.
- [ ] PDF-conversion fallback to DOCX-only (`DocumentEngine.ts:67-70`) is recorded on the document record (`pdfFailed: true` or similar) instead of silently downgrading.
- [ ] Integration test: template with an unknown `{{tag}}` → generation succeeds AND reports that tag; template resolver throwing → status = failed with reason.

---

## DOC-105 — Shared foundations the AI path will reuse

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
- [ ] Template instantiate rejects (or repairs, with report) a blueprint whose `graphJson` fails the same structural validation AI output must pass.
- [ ] AI apply and manual deep-update produce identical DB state for identical content (test: same fixture through both paths → same sections/steps/blocks rows modulo ids).
- [ ] One exported function returns the document variable context for a run; `RunLifecycleService`, `finalBlock.routes.ts`, and template validation all call it (no other `getRunDataWithAliases` call sites in doc paths).
- [ ] `POST /api/runs/:runId/values/bulk` validates values against step type/config (rejecting e.g. a radio value not in options) or the ticket documents the explicit decision not to.
- [ ] `docs/claude/SERVICES.md` updated with the new services.

---

## DOC-106 — Request-scoped logic context (kill the N+1s)

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
- [ ] `determineStartSection` performs a constant number of queries (≤5) regardless of section/step count.
- [ ] A single section submit + next performs at most one load each of sections, steps, rules, and values (verify by counting repo-mock calls in a unit test).
- [ ] No behavior change: existing LogicService + runtime-pipelines tests green.

---

## DOC-107 — PDF strategy honesty (fidelity)

**Priority: P3.** Size: S (honesty) / L (real LibreOffice strategy)

**Problem.** The API accepts `pdfStrategy: 'libreoffice'`
(`finalBlock.routes.ts:46,65`) and docs advertise it, but `PdfConverter.ts`
implements only Mammoth→HTML→Puppeteer (layout fidelity loss: tables get
generic CSS at `PdfConverter.ts:79-118`, headers/footers dropped) plus a
Gotenberg stub that throws. `'libreoffice'` silently behaves as `'puppeteer'`.

**Fix sketch (phase 1, S).** Remove `'libreoffice'` from the Zod enums and
docs, or return `501` when requested; log which strategy actually ran onto the
document record. **Phase 2 (L, separate decision):** implement a real
`soffice --headless` strategy behind an env flag for layout-critical templates.

**Acceptance criteria (phase 1)**
- [ ] Requesting an unimplemented strategy is impossible (schema) or explicit (4xx/501) — never a silent substitute.
- [ ] The strategy actually used is recorded per generated document.
- [ ] `docs/api/`, `server/services/document/README.md`, and the OpenAPI spec agree with the code.

---

## DOC-108 — Completion-phase transform outputs must reach documents

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

## DOC-109 — Ship or unship the five phantom template helpers

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

## DOC-110 — Decide: should section submit accept out-of-section steps?

**Priority: P4 (decision ticket).** Size: S once decided

**Problem.** `POST /api/runs/:runId/sections/:sectionId/submit` persists every
`values[].stepId` after only a workflow-membership check
(`RunPersistenceWriter.saveStepValue` / `bulkSaveValues`) — nothing ties values
to `:sectionId`. A client can write any in-workflow step through any section
submit. This may be load-bearing (clearing hidden steps elsewhere, repeater
side-writes), which is why it was deliberately NOT changed in `bb048426`.

**Acceptance criteria**
- [ ] Audit client callers for legitimate cross-section writes; document findings on this ticket.
- [ ] Either: submits are scoped to the section's steps (+ an explicit allowance for hidden-step clearing) with a test proving out-of-section writes 400; or: the permissive behavior is documented as intentional in `docs/claude/API_ENDPOINTS.md` with rationale.

---

## DOC-111 — Runner accessibility pass

**Priority: P4 (professional polish, compliance).** Size: M

**Problem.** Only `TextBlockRenderer` receives/uses `ariaDescribedBy`
(`BlockRenderer.tsx:102`). Date, Number, Boolean, Choice, etc. never link their
description/error text for screen readers; required is conveyed by an
`aria-hidden` asterisk with no `aria-required`; invalid state lacks
`aria-invalid`.

**Acceptance criteria**
- [ ] Every block renderer wires `aria-describedby` to its description + error node ids (the ids are already built at `BlockRenderer.tsx:85-89`).
- [ ] Required inputs expose `aria-required="true"`; fields with active errors expose `aria-invalid="true"`.
- [ ] Error containers keep `role="alert"`; focus moves to the first invalid field on failed submit (not just scroll).
- [ ] Keyboard-only walkthrough of a workflow with every block type completes without a mouse.
- [ ] Verified with axe (or equivalent) on a preview run: zero critical violations in the runner.

---

## DOC-112 — Runner loading/error state polish

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
