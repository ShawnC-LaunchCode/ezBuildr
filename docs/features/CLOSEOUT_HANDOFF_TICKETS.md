# Close-out Handoff Tickets (HND-1..8)

Written 2026-07-13 (evening) after the third verification pass of
`DOCUMENT_AUTOMATION_TICKETS.md` (DOC-101..112) and `RUNNER_HARDENING_TICKETS.md`
(RUN-1..13). Each ticket below is **self-contained** — a dev picking one up needs
no prior context beyond this file and the referenced code.

## Current state (verified 2026-07-13 ~18:00)

| Gate | Status |
|---|---|
| `npx tsc --noEmit` | ✅ **0 errors** |
| `npm run test:fast` | ✅ **1,628 passed** / 15 skipped |
| Key integration suites (docs.autogeneration, api.runs.bulk-values, runtime-pipelines) | ✅ 10/10 (run against Docker PG on 5434) |
| `npx eslint .` | ❌ **799 errors / 18 warnings in 164 files** |

Lint split (measured, not guessed): **323 errors in 43 files touched by today's
pushes** (HND-1) and **476 errors in 121 files untouched today** — pre-existing
drift since the zero-error lint project (HND-2). Note: the CI lint step is
currently **advisory by design** (`.github/workflows/ci.yml:10-13` — it does not
gate the test job), so this is a policy/hygiene debt, not a broken build.

DOC tickets that are functionally complete and close **automatically when HND-1
lands**: DOC-101 (autosave), DOC-104 (missing-variable visibility), DOC-109
(template helpers). Their features are verified working with green tests; only
lint errors in their own files hold them.

---

## HND-1 — Lint: clean the 43 files touched by the document-automation push

**Effort: M (~1 day). Pure hygiene — no behavior changes allowed.**
**Closes: DOC-101, DOC-104, DOC-109 (all functionally verified already).**

### Context
The July 13 document-automation push (runner decomposition, autosave,
RunDataService, document status tracking) shipped working, tested code but
introduced 323 eslint errors, concentrated in the new runner hooks. The dominant
patterns: `any`-typed hook props (`run: any`, `previewEnvironment: any`),
`no-unsafe-*` member access on those `any`s, `strict-boolean-expressions`
(truthiness checks on strings/objects), and `no-misused-promises` (async
handlers passed to void-returning props).

### Worst files (fix in this order — top 5 = 138 of the 323)
```
63  tests/unit/services/RunService.versioning.test.ts
33  client/src/hooks/runner/useRunNavigation.ts
33  client/src/pages/WorkflowRunner.tsx
29  client/src/hooks/runner/useRunValues.ts
21  scripts/createFeeWaiverDemo.ts
15  server/routes/admin.routes.ts        15  server/routes/workflowTemplates.routes.ts
10  client/src/hooks/runner/useRunSession.ts   10  server/controllers/AiController.ts
 9  server/routes/finalBlock.routes.ts    8  server/routes/ai/workflowEdit.routes.ts
 8  server/services/WorkflowPatchService.ts    7  client/src/hooks/runner/useSectionVisibility.ts
 6  client/src/components/runner/sections/FinalDocumentsSection.tsx
 5  server/services/WorkflowService.ts    5  tests/helpers/testFactory.ts
 4  server/services/workflow-runs/RunLifecycleService.ts
 4  tests/unit/services/EnhancedDocumentEngine.conditions.test.ts
 3  client/src/components/datavault/DocumentsTab.tsx   3  server/services/docxHelpers.ts
 (+ ~20 files with 1–3 each — regenerate the list with:
  npx eslint . --format json, filter errorCount > 0 ∩ git-touched-since-bb048426)
```

### How to fix (patterns, not suppressions)
- The runner hooks take `any` props because `ApiRun`/`PreviewEnvironment` types
  weren't threaded. Define a `RunnerSessionContext` interface (or import the
  real `PreviewEnvironment` type from `@/lib/previewRunner/PreviewEnvironment`
  and `ApiRun` from `vault-api`) — do NOT sprinkle eslint-disables.
- `strict-boolean-expressions`: `if (!iso)` → `if (iso == null || iso === '')`
  (see `server/services/docxHelpers.ts:169,189`).
- `no-misused-promises` on JSX handlers: wrap `onClick={() => void handler()}`.
- Test files may use the established file-level disable header for the
  `no-unsafe-*` family ONLY (see `tests/unit/services/RunCompletionService.test.ts:1`
  for the sanctioned pattern) — typed mocks are still preferred.
- `RunLifecycleService.ts` carries `max-params(6)` + `complexity(31)` on
  `generateDocumentsInner` — fix by extracting the config-discovery and
  persistence loops into private methods, not by raising limits.

### Acceptance criteria
- [ ] `npx eslint <each file in the list>` → 0 errors, 0 new warnings.
- [ ] No new `eslint-disable` comments outside test files' sanctioned unsafe-family header; zero file-level disables added to `client/src/hooks/runner/*` or `server/services/**`.
- [ ] No behavior changes: `npm run test:fast` stays at ≥1,628 passing; `npx tsc --noEmit` stays at 0.
- [ ] The three held tickets flip to closed in `DOCUMENT_AUTOMATION_TICKETS.md` (DOC-101, DOC-104, DOC-109) with a note referencing this ticket.

---

## HND-2 — Lint: retire the pre-existing 476-error backlog and make the gate real

**Effort: M–L (1–2 days, parallelizable by directory). Independent of HND-1.**

### Context
476 eslint errors live in 121 files untouched by today's work — drift
accumulated since the zero-error lint project (memory says the repo hit 0 in
March 2026). Because CI's lint step is advisory, nothing stops further drift.

### Worst files
```
51  server/routes/workflowAnalytics.routes.ts   28  client/src/pages/AdminUsers.tsx
25  server/routes/places.routes.ts              24  server/routes/templateAnalysis.routes.ts
24  server/services/connections.ts              17  tests/unit/services/DatavaultReferenceColumns.test.ts
14  server/routes/webhooks.routes.ts            14  server/services/ExternalDestinationService.ts
12  client/src/pages/Organizations.tsx          12  server/routes/dataSource.routes.ts
10  client/src/pages/AdminLogs.tsx              10  scripts/assignOrphanedWorkflows.ts
(109 more files with <10 each — regenerate with npx eslint . --format json)
```

### Acceptance criteria
- [ ] `npx eslint .` → **0 errors** repo-wide (warnings ≤ the pre-existing ~18).
- [ ] Same fix-not-suppress rules as HND-1.
- [ ] After zero is reached: flip the CI lint step from advisory to **blocking** (`.github/workflows/ci.yml`) in the same PR, so the debt cannot re-accumulate. If the team wants it kept advisory, record that decision in the workflow file comment instead.
- [ ] `npm test` (full CI suite) green.

---

## HND-3 — Runner: preview isolation + last raw fetch + preview logic-rules decision

**Effort: M (~1 day). Closes DOC-102.**

### Context
`WorkflowRunner.tsx` was decomposed (1,003 → 249 lines) into
`useRunSession` / `useRunValues` / `useSectionVisibility` / `useRunNavigation`
(`client/src/hooks/runner/`). Three items remain from DOC-102's acceptance
criteria:

1. **Preview is not isolated.** `useRunNavigation` still branches on
   `mode === 'preview'` throughout (trace entries, completion, a preview-only
   bulk save at `useRunNavigation.ts:184`). The AC wants preview behavior behind
   ONE boundary (an adapter/provider implementing a common interface: e.g.
   `RunTransport` with `submitSection/next/complete/saveValues`, with a
   `ProductionTransport` and `PreviewTransport`), so handlers contain no mode
   conditionals.
2. **One raw `fetch` remains** at `useRunSession.ts:95` (the run-fork fallback).
   Route it through `fetchAPI` from `client/src/lib/vault-api.ts` (which owns
   run-token attachment); it throws on non-OK, so wrap in try/catch to keep the
   fallback semantics.
3. **Behavior regression to decide:** the runner now passes real logic rules in
   production but `effectiveLogicRules = []` in preview
   (`WorkflowRunner.tsx:74`) — the OLD runner fetched persisted rules in preview
   too. Decide: preview evaluates persisted rules (restore old behavior), or
   preview intentionally ignores rules (document why in the hook). Note the
   in-memory preview graph may have unsaved rule edits either way.

### Acceptance criteria
- [ ] No `mode === 'preview'` conditionals inside `useRunNavigation`/`useRunValues` handler bodies — preview differences live in one transport/adapter object passed in.
- [ ] `grep -rn "fetch(" client/src/hooks/runner client/src/pages/WorkflowRunner.tsx | grep -v fetchAPI` → empty.
- [ ] Preview logic-rules behavior decided, implemented, and documented in `useSectionVisibility`'s header comment; a preview run with a show/hide rule behaves per the decision.
- [ ] Behavior parity: start → autosave → skip logic → review → complete → documents flow works in production mode (manual verification via the `verify` skill) and preview mode; `npm run test:fast` green.
- [ ] `DOCUMENT_AUTOMATION_TICKETS.md` DOC-102 marked closed.

---

## HND-4 — Validated step-value writes (the last AI-foundation seam)

**Effort: S–M (~1 day). Closes DOC-105 (with HND-5's parity test optional but recommended here).**

### Context
DOC-105 built most of the AI foundations: `WorkflowContentIngestService`
(one validated ingest for AI/template/manual deep-update) and `RunDataService`
(one variable-context builder). The remaining gap: **programmatic value writes
bypass validation.** `POST /api/runs/:runId/values/bulk` →
`RunService.bulkUpsertValues*` → `RunPersistenceWriter.bulkSaveValues` persists
any JSON for any in-workflow step with only a size cap — no check that a value
matches its step's type/config (e.g. a `radio` answer must be one of its
options). The AI path (suggest-values / prefill) will write through this
endpoint, so garbage-in becomes documents-out.

### Sketch
Add a validation pass in `RunPersistenceWriter.bulkSaveValues` (or a
`RunValueWriteService` wrapping it): load the workflow's steps (already
prefetched there for membership), and per value run the same per-type validation
the section-submit path uses (`shared/validation/BlockValidation.getValidationSchema`
— server-safe, already shared). Decide the failure mode: reject the whole batch
(400 with per-step errors) vs skip-and-report. Reject-whole-batch is simpler and
matches submit semantics. Autosave sends partial/in-progress values — validation
here must check TYPE/format only, NOT required-ness (required stays a
section-submit/completion concern).

### Acceptance criteria
- [ ] A bulk write with a value violating its step's type/options (e.g. radio value not in options, number for a date step) is rejected with a 400 listing the offending stepIds; valid batches persist unchanged.
- [ ] Required-ness is NOT enforced on autosave/bulk writes (partial answers must save) — covered by a test with an empty-but-typed value.
- [ ] Both authed and run-token bulk routes go through the same validation.
- [ ] Integration test extends `tests/integration/api.runs.bulk-values.test.ts` with the reject case + the partial-value case.
- [ ] (Recommended) AI↔manual parity test: the same content applied via `WorkflowContentIngestService` from source `'ai'` and via manual deep-update produces identical sections/steps rows — then close DOC-105 fully.

---

## HND-5 — LogicService: prove the N+1s are gone

**Effort: S (~half day). Closes DOC-106.**

### Context
`LogicService.buildContext` + context-threaded `isSectionVisible/isStepVisible/
isStepRequired` landed, and `determineStartSection`
(`server/services/workflow-runs/RunLifecycleService.ts`) builds the context
once. What's missing is the **proof**: DOC-106's AC requires a unit test that
counts repository calls so the O(sections×steps) reload pattern can't silently
return.

### Acceptance criteria
- [ ] Unit test: `determineStartSection` on a workflow with ≥3 sections × ≥4 steps performs ≤1 call each to `logicRuleRepo.findByWorkflowId`, `stepRepo.findByWorkflowIdWithAliases`, `sectionRepo.findByWorkflowId` (assert with vi.fn call counts).
- [ ] Verify (and test the same way) that one `evaluateNavigation` call and one `validateCompletion` call each load sections/steps/rules/values at most once per invocation.
- [ ] No behavior change: fast suite green.
- [ ] DOC-106 marked closed.

---

## HND-6 — Docs: remove the phantom LibreOffice PDF path

**Effort: XS (<1 hour). Closes DOC-107.**

### Context
DOC-107's code is done: the API only accepts `pdfStrategy: 'puppeteer'`, the
strategy is threaded and persisted per document. But
`server/services/document/README.md` still documents a LibreOffice conversion
path that does not exist in code (lines **114** and **570**).

### Acceptance criteria
- [ ] `grep -rin "libreoffice" server/ docs/ openapi.yaml` returns no hits describing a supported strategy (a "not currently supported; puppeteer only" note is fine).
- [ ] The README's PDF section describes the actual pipeline: DOCX → Mammoth HTML → Puppeteer, including the known fidelity limits (tables/headers/footers).
- [ ] DOC-107 marked closed.

---

## HND-7 — Runner accessibility: produce the evidence

**Effort: S (~half day). Closes DOC-111.**

### Context
The implementation is done and verified by code inspection: `BlockRenderer`
threads `ariaDescribedBy`/`required`/`hasError` to every block renderer, blocks
wire `aria-describedby`/`aria-required`/`aria-invalid`, and failed submits move
focus to the first invalid field (`useRunNavigation.ts:118-138`). What was NOT
done: the two verification ACs were checked off with no tooling in the repo —
there is no axe dependency anywhere. Evidence is required, not assertion.

### Acceptance criteria
- [ ] Add `axe-core` (unit: `vitest-axe` against rendered `SectionSteps` with one of every block type, or e2e: `@axe-core/playwright` on a preview run) and commit a passing a11y smoke test asserting **zero serious/critical violations** in the runner.
- [ ] Keyboard-only walkthrough (Tab/Shift-Tab/Enter/Space/Arrows) through a workflow containing every rendered block type — completes without a mouse; findings fixed or filed; walkthrough recorded as a checklist in the test file header or a doc note.
- [ ] The two reverted checkboxes in DOC-111 get re-checked with a pointer to the test file.
- [ ] DOC-111 marked closed.

---

## HND-8 — Decision: section-scoped submits (unchanged from DOC-110)

**Effort: S once decided. Closes DOC-110.**

### Context (self-contained restatement)
`POST /api/runs/:runId/sections/:sectionId/submit` persists every submitted
`stepId` after only a workflow-membership check
(`server/services/runs/RunPersistenceWriter.bulkSaveValues`) — nothing ties
values to `:sectionId`. A client can write any in-workflow step through any
section submit. This may be load-bearing (hidden-step clearing, autosave
flushing cross-section edits after Back-navigation — note autosave/bulk now
intentionally saves ALL form values, so scoping must NOT break that path).

### Acceptance criteria
- [ ] Audit client callers (`useRunNavigation.handleNext` filters to current-section steps; autosave uses `/values/bulk` not section-submit — confirm) and document findings on the ticket.
- [ ] Either: section-submit rejects out-of-section stepIds with a test proving the 400 (and an explicit carve-out list if any legitimate case exists); or: the permissive behavior is documented as intentional in `docs/claude/API_ENDPOINTS.md` with rationale.
- [ ] DOC-110 marked closed with the decision recorded.

---

## Suggested assignment

- **HND-1** and **HND-2** are parallelizable and junior-friendly (mechanical,
  clear ACs). HND-1 first — it closes three tickets.
- **HND-3** needs someone comfortable with the runner architecture (1 dev, 1 day).
- **HND-4** is the highest-leverage item for the upcoming AI push.
- **HND-5/6/7/8** are half-day-or-less each; good sprint fillers.

Everything above assumes the current uncommitted working set gets committed
first — it contains the RUN-1..13 implementations, DOC-109 completion, and the
`workflowTemplates` router auth refactor (verified: all 7 routes carry
route-level `hybridAuth`).
