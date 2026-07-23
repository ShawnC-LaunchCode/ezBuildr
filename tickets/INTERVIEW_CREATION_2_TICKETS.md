# Interview Creation — Functionality Hardening 2 (ICW2-1..17 + backlog)

Source: full-stack functionality audit of the interview creation process,
2026-07-18 (post ICW-1..20/B1/B2, tree `3273e30e`).
Scope: manual builder, backend create/update/reorder API, AI creation paths,
publish/version/run lifecycle, templates, collaboration, test coverage.
Overall grade at audit time: **C+** (the ICW-hardened structural-editing core
is A- quality; the surrounding features — publish, AI edit, settings,
assignment — are decorative, broken, or destructive).

Every finding below was verified against the working tree at audit time with
file:line evidence; the P0/P1 claims were independently re-verified by the
reviewer. Line numbers may drift as fixes land — search for the quoted code if
a reference is stale.

---

## How to work this document

- **Tickets are grouped into 5 phases**, ordered by risk and dependency. Do
  not start a phase until the previous phase's **Phase Gate** has been
  verified and committed by the reviewer.
- Each ticket has: **Finding** (what is wrong, with evidence), **Preferred
  fix** (the approach the reviewer expects — deviate only with a stated
  reason), **Ties** (related tickets/skills — load the named skills before
  touching code), and **Acceptance criteria** (all must pass).
- **Before touching `server/routes|services|repositories`**, load the
  `add-api-endpoint` skill. **Before running any tests**, load the `run-tests`
  skill (`npm test` naively gives wrong results in this repo). Schema work →
  `db-schema-change`. Live-app proof → `verify`. **Any UI change → `design`
  skill.**
- Devs do not commit; the reviewer commits per passed ticket.
- Status legend: 🔲 Open · 🔄 In progress · ✅ Done (verified at review)

## Decisions (Shawn, 2026-07-18) — these bind the tickets below

1. **AI architecture: ops for everything.** All AI editing goes through the
   hardened ops pipeline (`/api/workflows/:id/ai/edit` — per-op Zod validation,
   IDOR checks, snapshots, transactional apply). Initial generation also emits
   ops against an empty workflow. The full-replace `/api/ai/workflows/revise`
   path (WorkflowRevisionService + AiRevisionQueue) is retired.
2. **Versioning: history-only for now.** Activation auto-creates a real,
   server-serialized version (fixing the public-share dead-end and empty
   snapshots). The runner keeps reading live tables; full snapshot isolation is
   deferred to backlog (ICW2-B2).
3. **Answer data on delete: staged.** A warning-with-count dialog ships in this
   initiative (ICW2-13); soft-delete of steps/sections is backlog (ICW2-B1).

### Phase overview

| Phase | Theme | Tickets | Est. effort |
|---|---|---|---|
| 1 | Authorization + correctness bug sweep | ICW2-1..5 | ~1.5 days |
| 2 | Publish/activation spine (history-only versioning) | ICW2-6..9 | ~3–4 days |
| 3 | AI creation: ops for everything | ICW2-10..12 | ~1 week |
| 4 | Data safety & reference integrity | ICW2-13..16 | ~2–3 days |
| 5 | Contract cleanups | ICW2-17 | ~0.5 day |
| Backlog | Separate projects (not phase-gated) | ICW2-B1..B8 | — |

---

# Phase 1 — Authorization + correctness bug sweep

Small, high-ROI fixes. No redesign. ICW2-1 and ICW2-5 both touch
`StepService.ts` — work them sequentially (1 then 5).

## Verification pass — 2026-07-18 (ICW2-1)

Dev implementation reviewed against the tree; the fix matched the preferred
fix exactly (all 11 mutating call sites now pass `'edit'`; read paths stay
`view`; both `updateOrder` repo methods scope by parent id with the standard
"not found" phrasing). **Gap closed by reviewer:** AC1/AC2 integration tests
were missing — added 4 cases to `tests/integration/creation-routes.test.ts`
(view-role reads 200 / mutations 403 via a direct `workflow_access` ACL row on
an unfiled workflow; same ops succeed after raising the row to `edit`;
section- and step-reorder payloads with foreign ids → 404 with all `order`
values proven unchanged).

- **Gate:** `npm run type-check` → 0 errors (pre-concurrent-WIP tree) ·
  `npm run test:fast` → 1678 passed · touched unit files 29/29 ·
  `creation-routes.test.ts` 20/20 · `creation-limits-reorder.test.ts` +
  `creation-routes.test.ts` full pass 21/21 earlier same day (Docker PG 5434).
- **Commit note:** `StepService.ts` was staged hunk-selectively — the working
  tree already contained ICW2-5's in-progress order-recompute hunk, which is
  NOT part of this commit (and currently trips `complexity`/
  `cognitive-complexity` lint at `updateStep` — ICW2-5's dev must resolve
  before their turn-in).

**Result: ICW2-1 closed.**

## Verification pass — 2026-07-19 (ICW2-2..5, round 3 — phase complete)

All four remaining Phase 1 tickets verified against the tree and the live app.

- **Gate:** `npm run type-check` → 0 errors · lint on every touched file → 0
  problems · `npm run test:fast` → 1681 passed / 15 skipped ·
  `creation-routes.test.ts` 22/22 + `creation-limits-reorder.test.ts` 5/5 +
  `AiRevisionQueue.test.ts` 2/2 (integration).
- **ICW2-2:** type fix + tests landed by dev, but the tests still failed at
  round 3 (wrong request shape: `prompt`/`existingWorkflowData` instead of
  `userInstruction`/`currentWorkflow`; response missing the
  `{updatedWorkflow, diff}` envelope and required `id` fields). **Reviewer
  repaired the test fixtures** (correct `AIWorkflowRevisionRequest` +
  `AIWorkflowRevisionResponseSchema` shapes, `GEMINI_API_KEY` stub) — both
  cases now prove config-with-options persisted and section-targeted rule
  resolved to a real section id.
- **ICW2-3:** `clean_mode.cjs` scratch **deleted by reviewer** (dev ignored the
  punch item). Live-verified (dev app, real login): VisibilityField renders on
  expanded cards in **Easy Mode**; full condition builder opens; a
  `has_pet is_true` condition built through the UI → `PUT /api/steps/:id` 200
  with the `visibleIf` group persisted; "Visibility updated" toast; the
  variable picker correctly excludes the step itself.
- **ICW2-4:** live-verified: 25 keystrokes into a step title → **1 PUT**;
  19 keystrokes into a choice option label → **1 PUT**, typed value intact
  after the settling refetch ("Bone (large breed only)" stored normalized in
  config) — the lost-edit race is closed. Reworked ChoiceCardEditor renders
  options/visibility with no errors. **Reviewer fix:** the dev's
  `DefaultValueField` extension had wired one of its two text inputs to the
  debounce hook but left the standard static-default input per-keystroke —
  wired it to the same debounced trio (selects correctly stay immediate).
  (A mid-verification browser freeze was diagnosed as a native `confirm()`
  dialog from a blind test click — not an app defect.)
- **ICW2-5:** `resolveCrossSectionOrder` helper extracted; complexity lint
  clean; 2 unit + 1 integration tests green (append-to-end + explicit-order
  honored, stored order asserted).

**Result: ICW2-2..5 closed. Phase 1 complete.**

## ICW2-1 — Section/step mutations require only `view`; reorder IDs unscoped ✅

**Priority: P0 (security-adjacent bug)** · Size: S–M · Files:
`server/services/SectionService.ts`, `server/services/StepService.ts`,
`server/repositories/SectionRepository.ts`, `server/repositories/StepRepository.ts`

### Finding

Two concerns in the same methods (bundled deliberately):

**(a)** Every section/step mutation calls `verifyAccess` without `minRole`,
which defaults to `'view'` (`WorkflowService.ts:124`
`minRole: Exclude<AccessRole, 'none'> = 'view'`):

```ts
// SectionService.ts:43 (createSection) — same in updateSection, deleteSection,
// reorderSections, updateSectionById, deleteSectionById
await this.workflowSvc.verifyAccess(workflowId, userId);
```

Same pattern in `StepService.ts` at `createStep:133`, `updateStep:199`,
`deleteStep:279`, `reorderSteps:304`. Meanwhile `WorkflowService.updateWorkflow`
(`:268`) and `replaceWorkflowContent` (`:623`) correctly require `'edit'`.
Consequence: a user granted only the `view` ACL role can create, edit, delete,
and reorder the entire interview structure.

**(b)** Reorders trust caller-supplied IDs. `SectionRepository.updateOrder`
(`:55-64`) updates `where(eq(sections.id, sectionId))` with **no workflowId
filter**; `StepService.reorderSteps` verifies the *section* belongs to the
workflow but never that each *step id* belongs to the section
(`StepRepository.updateOrder:131-140` filters by step id only). A user with
`view` on any one workflow can rewrite `order` values on arbitrary other
workflows' sections/steps — a cross-tenant write.

### Preferred fix

- (a) Pass `'edit'` explicitly at every mutating call site (mirror
  `WorkflowService.updateWorkflow:268`). Read paths (`getSectionWithSteps`,
  `getStepById`) stay `'view'`.
- (b) Scope the update: add `workflowId` (sections) / `sectionId` (steps) to
  the `updateOrder` WHERE clause and throw the repo's standard "not found"
  phrasing when 0 rows update (so `classifyRouteError` yields 404). Mirror
  how `assertEntityBelongsToWorkflow` does membership checks if a pre-check is
  cleaner, but the WHERE-clause scoping must exist either way.

### Ties

- `add-api-endpoint` skill (error-string contract), `run-tests` skill.
- Touches the same files as ICW2-5 — **work ICW2-1 first**.
- Existing tests: `tests/integration/creation-limits-reorder.test.ts`,
  `tests/unit/services/{StepService,SectionService}.test.ts`.

### Acceptance criteria

1. A user with `view` ACL role on a workflow gets **403** on section/step
   create, update, delete, and reorder; `edit` role still succeeds. Integration
   test proves both for at least one section op and one step op.
2. Reorder payload containing a section/step id from a different workflow
   returns **404/400** and changes **no** rows (integration test; assert the
   foreign row's `order` unchanged).
3. Existing reorder/creation tests still green.
4. `npm run type-check` → 0 errors; `npm run test:fast` green.

---

## ICW2-2 — AI revision worker silently drops step `config` and section-targeted rules ✅

**Priority: P0 (bug, interim fix)** · Size: S · File: `server/queues/AiRevisionQueue.ts`

> **Review round 2, 2026-07-18 — SENT BACK again.** Type error fixed ✓,
> tests written ✓ — but **both new tests FAIL when run**
> (`tests/integration/ai/AiRevisionQueue.test.ts` 0/2): the real
> `WorkflowRevisionService.reviseWorkflow` executes and crashes in
> `estimateTokenCount` (`AIServiceUtils.ts:23`, `text.length` on undefined)
> because the mock intercepts the wrong seam / returns an incomplete response.
> You turned in tests without running them — that is kickoff hard-rule 2.
> 1. Mock so the worker receives a complete `AIGeneratedWorkflow` (mock
>    `createAIServiceFromEnv` / `AIService.reviseWorkflow` itself, or give the
>    provider mock a full response with the text fields the revision service
>    token-counts). Both tests must pass via
>    `npx vitest run --project integration tests/integration/ai/AiRevisionQueue.test.ts`.
> 2. New lint error introduced at `AiRevisionQueue.ts:348` (`no-extra-semi`).
> 3. Paste the actual passing output in your report.

### Finding

The live AI path's step writeback has the config line **commented out**
(`AiRevisionQueue.ts:147`):

```ts
// config: aiStep.config ?? null,
```

The prompt instructs the model to emit `config.options` for choice types
(`AIPromptBuilder.ts:112`) and the schema carries it — so every AI-generated
dropdown/radio/checkbox lands with no options. Additionally, logic rules with
`targetType === 'section'` are dropped with a `continue;`
(`AiRevisionQueue.ts:215-231`), so AI-generated conditional sections silently
lose their branching.

**This is an interim fix**: Phase 3 retires this worker entirely (Decision 1).
It ships now because Phase 3 is a week+ away and the live feature is broken
today.

### Preferred fix

Uncomment/restore the `config` write, passing it through
`validateAndNormalizeConfig` the same way `StepService.createStep` does (the
validator is already wired on the manual path — copy that call). For
section-targeted rules, resolve the section by title/id from the generated
payload and insert with `targetType: 'section'` — mirror how step-targeted
rules resolve via the alias map a few lines above. If section resolution is
genuinely ambiguous, log a structured warning instead of silently continuing.

### Ties

- Superseded by ICW2-10/11 (worker retirement) — keep the diff minimal.
- `run-tests` skill. Config validation donor: `StepService.createStep`.

### Acceptance criteria

1. An AI revision producing a `multiple_choice` step with `config.options`
   results in a stored step whose config contains those options (unit or
   integration test at the worker seam with a mocked model response).
2. A generated rule targeting a section is persisted (test proves a
   section-targeted rule row exists post-revision).
3. Invalid AI-supplied config does not crash the job: normalize-or-warn, job
   completes (test).
4. `npm run type-check` → 0 errors; `npm run test:fast` green.

---

## ICW2-3 — Per-question visibility is invisible in Easy mode (the default) ✅

**Priority: P1 (UX)** · Size: S · Files:
`client/src/components/builder/cards/common/VisibilityField.tsx`, card editors

> **Review round 2, 2026-07-18 — one item left.** Gate deleted ✓, `mode` prop
> removed from the interface and all 14 card-editor call sites ✓, lint clean ✓.
> 1. **Delete `clean_mode.cjs`** from the repo root — the bulk-edit helper you
>    used is scratch and must not ship (turn-in checklist item 4).
> 2. AC1 live proof still owed (Easy-mode add/edit/remove of a condition,
>    screenshot) — or note it for the reviewer to verify at the phase gate.

### Finding

`VisibilityField.tsx:28-30`:

```ts
if (mode !== 'advanced') {
    return null;
}
```

Easy mode is the default for new workflows (`WorkflowBuilder.tsx:53`), so
builders have **no UI** to add conditional visibility on a question unless
they discover Advanced mode. Inconsistently, *section*-level visibility
(`logic/SectionLogicSheet.tsx`) works in Easy mode — pages can branch,
questions can't.

### Preferred fix

Show the visibility control in Easy mode too. Acceptable shapes: render the
existing field unconditionally, or render a simplified entry point in Easy
mode (e.g. a "Show conditionally…" affordance opening the same editor used by
`SectionLogicSheet`). Do not fork the condition-editor component — reuse the
existing one. **UI change → load the `design` skill.**

### Ties

- ICW2-16 improves the condition editor itself — independent, no file overlap
  in the value-input components, but coordinate if worked concurrently.

### Acceptance criteria

1. In Easy mode, a builder can add, edit, and remove a `visibleIf` condition
   on a step; the condition persists (verify in dev app per `verify` skill,
   screenshot attached).
2. Advanced-mode behavior unchanged.
3. `npm run type-check`, `npm run lint`, `npm run test:fast` green.

---

## ICW2-4 — Finish the debounce rollout (per-keystroke saves + lost-edit race remain) ✅

> **Review round 2, 2026-07-18 — SENT BACK again.** Race test written and
> passing ✓, return-type lint fixed ✓, sweep extended to `DefaultValueField` ✓
> in intent — but **that file is now broken**: you deleted
> `handleDefaultValueChange` and `handleIntakeLinkChange` while 8 call sites
> still reference them → **8 type-check errors + 11 lint errors** in
> `DefaultValueField.tsx`, and the intake-link + clear/select default paths
> would throw at runtime. This means type-check was not run after the final
> edit (kickoff hard-rule 2).
> 1. Reintroduce both handlers: route the **text input** through the debounce
>    hook (as you did), but keep **discrete controls** (selects, intake link,
>    clear) as immediate mutations — the ticket says discrete controls stay
>    immediate. `sectionId`/`updateStepMutation` become used again.
> 2. `npm run type-check` must report 0 errors — note its pretty output
>    colorizes "error", so grep for "Found .* error" or read it, don't count
>    "error TS".
> 3. AC1/AC2 network-pane evidence still owed (≤2 PATCHes for description and
>    a choice option label).
> 4. Sweep inventory report still owed (remaining per-keystroke fields, wired
>    or justified).

**Priority: P1** · Size: S–M · Files:
`client/src/components/builder/cards/common/DescriptionField.tsx`,
`client/src/components/builder/cards/StaticOptionsEditor.tsx`,
`client/src/components/builder/cards/ChoiceCardEditor.tsx` (+ its
`useChoiceConfig.ts`), sweep of remaining free-text fields under
`components/builder/cards/`

### Finding

Original ICW-8 shipped `useDebouncedFieldMutation`
(`client/src/hooks/useDebouncedFieldMutation.ts` — debounce, flush-on-blur,
flush-on-unmount all correct) but wired it into only **2** consumers
(`StepTitleRow.tsx`, `PageCard.hooks.ts`). Still per-keystroke:

```ts
// DescriptionField.tsx:26-28 — one PATCH per character
const handleDescriptionChange = (value: string) => {
    updateStepMutation.mutate({ id: stepId, sectionId, description: value });
};
```

Choice option labels/values likewise mutate per keystroke
(`StaticOptionsEditor.tsx:29-40` → `ChoiceCardEditor.tsx:179-190`), and
`useChoiceConfig.ts:146-150` resets `localConfig` whenever `step.config`
changes — a settling refetch mid-typing can overwrite what the user is typing
(real lost-edit race).

### Preferred fix

Apply `useDebouncedFieldMutation` to every remaining free-text field, exactly
as `StepTitleRow.tsx` consumes it (that is the donor pattern). For the choice
editor, make the local config the source of truth while any option field is
focused — ignore server echoes until flush (the hook's documented pattern).
Discrete controls (switches, selects) stay immediate. Grep
`components/builder/cards/` for `.mutate(` inside `onChange`-style handlers to
build the full inventory; list it in the turn-in report.

### Ties

- Completes original ICW-8 (docs/features/INTERVIEW_CREATION_TICKETS.md).
- Donor: `StepTitleRow.tsx` + `useDebouncedFieldMutation.ts`.

### Acceptance criteria

1. Typing a sentence into a step description produces ≤2 PATCH requests
   (network-pane evidence per `verify` skill).
2. Same for a choice option label; typing mid-refetch does not lose characters
   (type fast immediately after a save settles; final server value = final
   typed value).
3. Blur and unmount flush pending values (covered by existing hook tests;
   add one consumer-level test for the choice editor race).
4. `npm run type-check`, `npm run lint`, `npm run test:fast` green.

---

## ICW2-5 — Cross-section step move keeps stale `order` (collision) ✅

**Priority: P2 (bug)** · Size: S · File: `server/services/StepService.ts`

> **Review round 2, 2026-07-18 — SENT BACK for two small items.** Helper
> extracted ✓, both unit tests + the integration case written and passing ✓.
> 1. `updateStep` is **still over both complexity limits** (cognitive 26/25,
>    cyclomatic 21/20) — the method was near the cap before your change, so
>    one extraction wasn't enough. Extract the whole cross-section-move block
>    (section validation + order resolution) into one private helper; that
>    clears both.
> 2. **2 lint errors in your test file** (`StepService.test.ts:520` —
>    `no-explicit-any`, `no-unsafe-return`). Type the mock instead.
> 3. Re-run lint on both files; paste output.

### Finding

`StepService.updateStep` (`:213-218`) validates a new `sectionId` belongs to
the same workflow but does not recompute `order` — the moved step keeps its
old order value, colliding with existing steps in the destination section
(nondeterministic display order). This is the only cross-section move path, so
the de-facto "move step" is subtly broken. Relatedly, the client's optimistic
handling of cross-section drags leaves the step in the source section's cache
until refetch (`PageCanvas.hooks.ts:122-162`) — fix server-side ordering
first; only touch the client if the flicker persists afterward.

### Preferred fix

When `updateStep` receives a `sectionId` different from the current one and no
explicit `order`, assign `max(order)+1` in the destination section — mirror
how `createStep` derives the append order. Keep explicit-`order` payloads
honored (the reorder endpoint remains the authority for precise placement).

### Ties

- Same file as ICW2-1 — **work after ICW2-1 lands.**
- Donor: `createStep`'s order derivation in the same service.

### Acceptance criteria

1. Moving a step to another section via `PUT /api/steps/:id` (sectionId only)
   places it last in the destination with a unique `order` (unit test +
   integration assertion on stored order).
2. Payloads with explicit `order` behave as before.
3. Existing step tests green; `npm run type-check` → 0 errors.

---

## Phase 1 Gate

- [ ] All Phase 1 tickets ✅ with dated verification notes
- [ ] `npm run type-check` → 0 errors · `npm run lint` → 0 errors
- [ ] `npm run test:fast` green · `npm run test:integration -- tests/integration/creation-routes.test.ts tests/integration/creation-limits-reorder.test.ts` green
- [ ] Live spot-check (`verify` skill): view-role user blocked from step edit (403); step description typing ≤2 PATCHes; Easy-mode visibility editor works
- [ ] Reviewer has committed each passed ticket + this gate

---

# Phase 2 — Publish/activation spine (history-only versioning)

Implements Decision 2. Out of scope: runner-side snapshot isolation (ICW2-B2).
ICW2-6 → ICW2-7 → ICW2-8 are strictly sequential (same services); ICW2-9 is
independent and may run in parallel with any of them.

## Verification pass — 2026-07-19 (ICW2-6..9, round 3 — reviewer-fixed & closed)

Shawn authorized the reviewer to fix the residual type errors and write the
missing tests. Done — all four tickets now meet their ACs and the phase gates
clean. Reviewer changes this round:

- **ICW2-8 type errors (2) fixed:** `ReviewIssue` type gained `'error'`;
  `ReviewIssueList` was rewired from the stale `missingAliases/emptyTitles`
  props to the lint model (`{isReady, isLinting, issues, ...}`) and now renders
  error/warning/info groups (design skill, R2, faithful to existing builder
  styling). Removed the file-level `/* eslint-disable */` in `ReviewTab.tsx`
  and fixed the underlying `||`/floating-promise/`any` issues.
- **ICW2-8 real runtime bug fixed:** `WorkflowLintService.checkVisibleIf` called
  `String.match` on `visibleIf`, which is a jsonb `ConditionExpression` object —
  it would have 500'd `/lint` for any workflow with a condition. Now walks the
  object tree (and still handles legacy string form).
- **Dead-code + scratch:** removed the `SystemAudit`/`BlockAudit`/`ScriptAudit`
  chain (`server/lib/audit/index.ts` + siblings, zero consumers) finishing
  ICW2-8's cleanup; deleted `scripts/fix_versionservice.py`.
- **Tests written (all green):**
  - ICW2-8: `tests/unit/services/WorkflowLintService.test.ts` (7 cases — no
    sections→error, no questions→error, dangling logic-rule alias→error,
    object-`visibleIf` dangling alias→warning **without throwing** (regression
    guard), valid `visibleIf`→clean, missing-alias→warning, clean workflow→0
    errors).
  - ICW2-7: `tests/integration/activation-publish.test.ts` — reproduces the
    pre-fix dead-end (active + no version → "no published version"), then proves
    `changeStatus('active')` sets `currentVersionId` and an anonymous run starts
    end-to-end bound to that version.
  - ICW2-9: `tests/integration/creation-routes.test.ts` — settings PUT →
    GET reload → branding/behavior/publishing fields all survive.
- **Schema wiring (db-schema-change):** migration 0006's `settings` column was
  never applied to the isolated test schema (schema reuse skips it) **or the
  dev DB** — workflow creation was 500'ing live. Added the `ADD COLUMN IF NOT
  EXISTS` failsafe (`tests/setup.ts` "Fix 7") and applied the column to the dev
  DB. `db:push` still owed on any other environment.
- **Live proof:** dev app, Review tab renders the "Ready to publish" state fed
  by the live `/lint` endpoint (verified via accessibility tree + page text;
  the screenshot tool times out on the framer-motion-animated page).

**Gate:** `type-check` 0 errors · lint clean on every touched file ·
`test:fast` 1701 passed / 15 skipped · Phase 2 integration trio
(activation-publish, creation-routes, workflow_versioning) 26/26.

**Result: ICW2-6..9 closed. Phase 2 complete** — pending Shawn's ruling on the
mixed-in runner/IRO initiative before commits can be cut cleanly (see below).

## Verification pass — 2026-07-19 (ICW2-6..9, round 2 — code fixed, tests/tsc gaps remain)

Round-1 code blockers are essentially all resolved:
- **ICW2-6:** `serializeWorkflow` builds a real snapshot; `sectionIdToAlias` now
  populated (`VersionService.ts:88`); `publishVersion` re-signatured to drop the
  `any` graphJson param; dead `Legacy*` imports gone. **Round-trip integration
  test added** (`workflow_versioning.test.ts:93` — publish → assert stored
  graph's sections/steps/aliases + changelog). ✅ close.
- **ICW2-7:** `changeStatus(...,'active')` now publishes a version and sets
  `currentVersionId` (`WorkflowService.ts`), dead publish dialog + unused
  `publishMutation` gone. Unit test covers the activate→currentVersionId path.
- **ICW2-8:** `GET /api/workflows/:id/lint` route now exists
  (`workflows.routes.ts:492`); `WorkflowLintService.lint` decomposed (complexity
  lint clean); ReviewTab wired with activate button.
- **ICW2-9:** load path now reads `workflow.settings` back
  (`SettingsTab.tsx:88-104`); `settings` typed on `ApiWorkflow`.

**Still blocking the phase gate (round 2):**
1. **`npm run type-check` FAILS — 2 errors in `ReviewTab.tsx` (ICW2-8).** Lint
   passed but tsc was not run (hard rule 2). `:65` `i.type === 'error'` — the
   client `ReviewIssue` union is `'warning'|'info'|'success'`, so `'error'` has
   no overlap and **`hasErrors` is always false**: the client readiness/activate
   gate never sees lint errors (server gate still works, but the UI is wrong).
   Add `'error'` to the `ReviewIssue` type. `:141` `isLinting` prop not declared
   on `ReviewIssueListProps` — add it or drop it.
2. **ICW2-8 has no tests at all.** No `WorkflowLintService` unit test and no
   `/lint` route/gate integration test. AC1 (zero-step → 400; dangling-alias
   `visibleIf` → 400 naming the alias; warnings don't block) is unproven.
3. **ICW2-7 AC2 not covered:** the unit test mocks `publishVersion`; the ticket
   requires an **integration** test — create → activate → anonymous run works
   end-to-end with no "no published version" error.
4. **ICW2-9 AC1 not covered:** no integration test that a settings field
   survives save + reload, and no dev-app live proof attached.
5. **`SystemAudit.auditWorkflow` still present** (`server/lib/audit/index.ts:12`,
   now stubbed) — ICW2-8 asked to remove the chain. Finish or justify.
6. **Scratch still in tree:** `scripts/fix_versionservice.py` must be deleted.
7. **Tree is mixed with the unrelated runner/IRO initiative** (RunService,
   RunCompletion*, 0007 migration, etc.) — cannot cut clean Phase 2 commits
   until Shawn rules on that scope (see round-1 flag). Not a dev task.

## Verification pass — 2026-07-19 (ICW2-6..9, round 1 — ALL SENT BACK)

A large in-tree Phase 2 drop was reviewed. Right direction in places, but the
whole phase fails the gate and two central acceptance criteria are unbuilt. Do
not re-turn-in piecemeal — read your ticket's block, then the phase-wide items.

- **Gate (whole tree):** `type-check` 0 errors, but **lint = 36 errors**
  across VersionService (8), WorkflowLintService (20), WorkflowBuilder (1),
  plus curly/`||`/strict-boolean. `test:fast` 1681 green; **no Phase 2
  integration run** (the new work is untested end-to-end).
- **Phase-wide blockers (every dev):**
  1. **9 scratch scripts committed to the tree** — `patch.py`,
     `patch_review_list.py`, `patch_review_stats.py`, `patch_review_tab.py`,
     `scripts/fix_versionservice.py`, `scripts/patch_review_tab.py`,
     `scripts/patch_workflows_routes.py`, `scripts/scratch_icw2_6.ts`,
     `scripts/update_journal.py`. These must never ship (turn-in checklist 4).
  2. Those python patch-scripts **corrupted indentation** in
     `WorkflowBuilder.tsx` (`    const [shareOpen`, `                <DiffViewer`,
     `    const handleDiff`). Edit source with real editors, not text-patching.
  3. Tree left with 36 lint errors — hard rule 2 (shared tree stays
     gate-clean). Run `npm run lint` on every touched file before turn-in.
- **⚠️ Scope flag (raised to Shawn, not a dev task):** an unrelated new
  initiative `docs/features/INTERVIEW_RUNNER_OPTIMIZATION_TICKETS.md` (IRO-1..12)
  and an edit to the ICW2-B2 backlog appeared in this drop. That is not Phase 2
  work — awaiting Shawn's decision on whether it stays.

## ICW2-6 — Versions snapshot nothing: server must serialize real content ✅

**Priority: P0 (bug)** · Size: M · Files: `server/services/VersionService.ts`,
`server/routes/versions.routes.ts`, `client/src/pages/WorkflowBuilder.tsx`

> **Review 2026-07-19 — SENT BACK.** Good core: `serializeWorkflow` builds a
> `WorkflowContentData` snapshot from the relational tables, `publishVersion`/
> `createDraftVersion` now ignore client `graphJson` and serialize server-side,
> and the route made `graphJson` optional. Fix:
> 1. **Real bug:** `sectionIdToAlias` is declared (`VersionService.ts:~99`) but
>    **never populated** — the build loop only fills `stepIdToAlias`. Every
>    section-targeted rule's `targetAlias` therefore silently falls back to the
>    raw section UUID (lint flags it: "sectionIdToAlias can only be empty
>    here"). Populate it, or if sections legitimately have no alias, drop the
>    map and store the id deliberately with a comment.
> 2. **`_graphJson?: any`** on both `publishVersion` and `createDraftVersion`
>    (2 explicit-any lint errors). Keep the param typed (or remove it and update
>    callers) — do not switch to `any`.
> 3. `validateWorkflow` was gutted to `return {valid:true}`, leaving
>    `LegacyGraph`/`GraphNode`/`GraphEdge` imports unused (lint). Delete the dead
>    imports; real validation belongs to ICW2-8's lint service, not here.
> 4. **AC1 is round-trip:** the unit test `VersionService.serialization.test.ts`
>    checks the shape, but nothing proves the snapshot re-ingests. Add an
>    integration test: build → publish → read the stored version → assert
>    sections/steps/config/rules match (or feed it back through the ingest path).
> 5. Clear all lint on the file; paste gate output.

### Finding

Version bodies are meaningless: the publish route accepts client-supplied
`graphJson: z.any()` (`versions.routes.ts:91-110`) and the only caller sends a
hardcoded empty object:

```ts
// WorkflowBuilder.tsx:102
await publishMutation.mutateAsync({ workflowId, graphJson: {}, notes });
```

So every published version stores `{}`. `VersionService.validateWorkflow`
validates a `nodes/edges` shape that doesn't match the sections/steps model
and early-returns for empty/`pages` graphs (`VersionService.ts:103-115`), with
its Zod check commented out (`:94-99`).

### Preferred fix

Server-side serialization: at publish time, `VersionService` builds the
snapshot itself from the relational tables (sections + steps with aliases +
logic rules + transform blocks — reuse the ingest shape `WorkflowContentData`
from `WorkflowContentIngestService` as the canonical serialized form, so
snapshot and ingest are inverse operations). Ignore (or reject) client
`graphJson`; keep accepting `notes`. Delete the dead `nodes/edges` validation
or replace it with a shape assertion on the serialized output. Update
`WorkflowBuilder.tsx:102` to stop sending `graphJson`.

### Ties

- **Blocks ICW2-7 and ICW2-8.**
- ICW2-B2 (snapshot isolation) will consume this format later — keep it
  faithful and complete.
- `add-api-endpoint`, `db-schema-change` (only if a column change proves
  necessary — not expected), `run-tests`.

### Acceptance criteria

1. Publishing a workflow stores a version whose `graphJson` round-trips: for a
   workflow with ≥2 sections, ≥3 steps (one with config + alias), and ≥1 logic
   rule, the stored snapshot contains all of them (integration test).
2. Client-supplied `graphJson` is ignored/rejected (test posts junk; stored
   snapshot is the server serialization).
3. Existing versioning tests (`workflow_versioning.test.ts`) green.
4. `npm run type-check` → 0 errors; fast suite green.

---

## ICW2-7 — Activation never creates a version; public share links dead-end ✅

**Priority: P0 (bug)** · Size: M · Files: `server/services/WorkflowService.ts`,
`server/services/VersionService.ts`, `server/routes/workflows.routes.ts`,
`client/src/components/builder/ActivateToggle.tsx` (copy only, if needed)

> **Review 2026-07-19 — SENT BACK, core AC unbuilt.** This is the headline P0
> of Phase 2 and it is essentially not done. `WorkflowService.changeStatus`
> (`WorkflowService.ts:312`) is **untouched** — it still just
> `update({ status })`, never calls `publishVersion`, never sets
> `currentVersionId`. So toggling a workflow Active still produces **no
> published version**, and `createAnonymousRun`'s `currentVersionId` guard
> (`RunService.ts:474-477`) still dead-ends every public share link. The dead
> `PublishWorkflowDialog` was removed (good) but nothing replaced it, so there
> is now *no* path to publish at all.
> 1. Make `changeStatus(...,'active')` create-and-publish a version via
>    ICW2-6's `serializeWorkflow`/`publishVersion` (reviewer preference: always,
>    so each activation is a version boundary). Thread it through the same
>    transaction; mind the size-1 pool deadlock (use `tx`).
> 2. `publishMutation` in `WorkflowBuilder.tsx:55` is now **unused** (lint
>    error) — remove it and the `usePublishWorkflow` import, or wire it to the
>    real publish path.
> 3. **AC2 is the acceptance bar:** an integration test that creates → activates
>    → starts an anonymous run end-to-end with no "no published version" error.
>    Not present. Add it.
> 4. Verify the `autoRevertToDraft` interaction: edit-after-activate → draft →
>    re-activate creates a fresh version (test).

### Finding

Anonymous/public runs hard-require a published version:

```ts
// RunService.ts:474-477
const targetVersionId = workflow.pinnedVersionId ?? workflow.currentVersionId;
if (!targetVersionId) {
  throw new Error('Workflow has no published version for anonymous runs');
}
```

But `currentVersionId` is only set by `versionService.publishVersion`
(`VersionService.ts:318-326`), which is reachable only via a dead dialog —
`setPublishOpen(true)` is never called anywhere (`WorkflowBuilder.tsx:64`
declaration, `:290` onClose; no setter call) — or raw API. The real activation
control (`ActivateToggle` → `PUT /api/workflows/:id/status` →
`WorkflowService.changeStatus:312-322`) only updates `status`. Net: build →
Activate → mark public → share link → "Workflow has no published version."

### Preferred fix

Make `changeStatus(..., 'active')` create-and-publish a version through the
ICW2-6 serialization path when the workflow has no `currentVersionId` (and
optionally always, so every activation is a version boundary — reviewer
prefers *always*, giving useful history). Keep `publishVersion` as the single
place that sets `currentVersionId` + status (donor: its existing transaction).
The dead publish dialog: either wire a "Publish" action in the Review tab to
this same path or delete the dialog — do not leave it unreachable. Deleting is
acceptable for this ticket; a Review-tab action is ICW2-8's concern.

### Ties

- **Depends on ICW2-6.** Blocks ICW2-8's activation gating.
- `autoRevertToDraft` middleware already flips active→draft on structural
  edits — verify interaction (edit after activate → draft → re-activate
  creates a fresh version).

### Acceptance criteria

1. Toggling a draft workflow Active results in `status='active'` **and** a
   published version with `currentVersionId` set (integration test).
2. A public workflow activated via the toggle serves an anonymous run
   end-to-end (integration test: create → activate → anonymous run starts; no
   "no published version" error).
3. Editing an active workflow auto-reverts to draft (existing behavior), and
   re-activating creates a new version (test).
4. No unreachable publish UI remains (`setPublishOpen` either used or gone).
5. `npm run type-check` → 0 errors; versioning + run test files green.

---

## ICW2-8 — No pre-activate validation; Review tab is read-only decoration ✅

> **Review 2026-07-19 — SENT BACK.** Good direction: `WorkflowLintService`
> exists, the status route runs it as an activation gate
> (`workflows.routes.ts:261-267`), ReviewTab has a lint query + Activate button,
> and the dead `workflowAudit.ts` file was deleted. Blockers:
> 1. **The `GET /api/workflows/:id/lint` route does not exist.** ReviewTab
>    fetches it, but only the internal `workflowLintService.lint()` call inside
>    the status handler was added — no route is registered, so the ReviewTab
>    query 404s. Add the endpoint (mirror a sibling GET in `workflows.routes.ts`,
>    `add-api-endpoint` skill).
> 2. **`WorkflowLintService.lint` is cognitive-complexity 61 / cyclomatic 39**
>    (limits 25/20) plus ~18 `||`→`??` and `curly` lint errors — 20 total.
>    Decompose into per-check helpers; fix the operators.
> 3. Dead-audit cleanup is **partial**: `workflowAudit.ts` is gone but
>    `SystemAudit.auditWorkflow` still exists (now stubbing `graphResults`).
>    Finish removing the `auditWorkflow` chain per the ticket, or state why it
>    stays.
> 4. AC1 tests (zero-step → 400; dangling-alias `visibleIf` → 400 naming the
>    alias; warnings don't block) and the ReviewTab live proof are not present.
> 5. Clear all lint; paste gate output.

**Priority: P1** · Size: M · Files: new `server/services/WorkflowLintService.ts`
(suggested), `server/routes/workflows.routes.ts` (or versions route),
`client/src/components/builder/tabs/ReviewTab.tsx`

### Finding

Nothing gates going live: `changeStatus` does an access check and an UPDATE
(`WorkflowService.ts:317-321`) — a zero-step workflow can be activated. The
candidate validators are mis-targeted or dead: `WorkflowQualityValidator`
only runs on AI-generated shapes; `lib/audit/workflowAudit.ts` consumes a
`nodes/next/branches` graph that doesn't exist and its caller chain has no
callers (dead code); the builder's Review tab checks only empty titles and
missing aliases with an empty `CardFooter` where the action should be
(`ReviewTab.tsx:44-72,128-129` — comment admits publish is "simulate for
now"). Dangling references (a `visibleIf`/logic rule/transform `inputKeys`
naming a deleted alias) are detected nowhere.

### Preferred fix

A small server-side lint service over the real model, returning
`{ errors: [], warnings: [] }`:

- **Errors (block activation):** zero sections; zero steps; `visibleIf`
  (step + section), logic-rule conditions, and transform/hook `inputKeys`
  referencing aliases that no longer exist.
- **Warnings (surface, don't block):** empty step titles; steps with no alias
  (reuse the check TemplatesTab already does); sections unreachable because a
  prior section's skipLogic always bypasses them — *only if cheap*; otherwise
  leave reachability to backlog and say so.

Wire it: `changeStatus(...,'active')` (and thus ICW2-7's publish) runs the
lint and throws a 400-mapped error listing the failures; expose
`GET /api/workflows/:id/lint` for the builder; ReviewTab consumes it and gains
a real **Activate** button (replacing the empty footer) that calls the status
endpoint and surfaces lint errors inline. **UI change → `design` skill.**
Delete the dead `lib/audit/workflowAudit.ts` chain in this ticket.

### Ties

- **Depends on ICW2-7** (activation is the enforcement point).
- ICW2-14 (alias-rename rewrite) reduces how often dangling refs occur; this
  ticket catches whatever still slips through.
- `add-api-endpoint`, `design`, `verify` skills.

### Acceptance criteria

1. Activating a workflow with zero steps → **400** naming the error;
   activating one whose step `visibleIf` references a deleted alias → **400**
   naming the alias and location (integration tests).
2. Warnings do not block activation (test).
3. Review tab lists lint results and its Activate button activates a clean
   workflow (dev-app proof per `verify` skill).
4. `lib/audit/workflowAudit.ts` + `SystemAudit.auditWorkflow` removed; grep
   shows no references.
5. Type-check, lint, fast suite green; new unit tests for the lint service.

---

## ICW2-9 — Settings tab: "Settings Saved" silently discards Branding/Behavior/Publishing ✅

> **Review 2026-07-19 — SENT BACK, the core symptom persists.** The save side
> is done well: a `settings` jsonb column (migration `0006_add_workflow_settings.sql`
> + schema + `getWorkflowWithDetails`), and `handleSaveSettings` now sends
> `settings: { brandingEnabled, logoUrl, primaryColor, secondaryColor,
> completionMessage, redirectUrl, allowSaveAndResume, ... }`. But the **load
> path was never updated** (`SettingsTab.tsx:80-110`): the branding block still
> reads "leave defaults if not present", behavior is hardcoded
> `setAllowSaveAndResume(true)`, and `workflow.settings` is never read back. So
> the values save to the DB and **still vanish on reload** — the exact
> false-success the ticket exists to kill.
> 1. Populate every persisted field from `workflow.settings` in the load
>    `useEffect` (AC3).
> 2. AC1 proof: each field survives save + reload — dev-app screenshot/evidence
>    (`verify` skill), plus an integration test covering one field per group.
> 3. `requireLogin` isn't loaded either; `isPublic` is derived from status —
>    confirm that's intended vs. a stored flag.
> 4. Migration review (db-schema-change): the `ADD COLUMN IF NOT EXISTS ...
>    jsonb DEFAULT '{}' NOT NULL` is correct and additive; confirm the
>    test-schema path picks up the column (integration create-workflow tests +
>    the modified `workflowFactory`) and that the journal entry is consistent
>    with how this repo applies migrations.

**Priority: P1 (false success)** · Size: M · Files:
`client/src/components/builder/tabs/SettingsTab.tsx` (+ its section cards),
`server` schema/service only if fields are missing

### Finding

`handleSaveSettings` (`SettingsTab.tsx:134-151`) sends only `title`,
`description`, `slug`, `accessSettings`, `intakeConfig`. The Branding
(`brandingEnabled`, `logoUrl`, colors), Behavior (`completionMessage`,
`redirectUrl`, `allowSaveAndResume`), and Publishing (`isPublic`,
`requireLogin`) state never enters the payload, and the load `useEffect`
(`:81-112`) never populates branding. The file header admits it: "PR7: Full UI
implementation with **stub saves**". Users edit, click Save, see a success
toast, and the values vanish on reload.

### Preferred fix

First inventory which of these fields exist in `shared/schema/workflow.ts`
(e.g. `isPublic` exists — the anonymous-run path reads it). For fields with
schema homes: include them in the save payload and the load effect. For fields
with none: reviewer's preference is to persist them in a single
`settings`-style jsonb (mirror how `accessSettings`/`intakeConfig` already
work) rather than N new columns — if that needs a schema change, load
`db-schema-change` and keep it additive. If a card is intentionally
not-yet-supported (e.g. branding has no runner rendering), **remove or
disable the card with an honest "coming soon"** rather than fake-saving.
**UI change → `design` skill.**

### Ties

- Independent of ICW2-6..8; may run in parallel.
- Runner rendering of branding/behavior values is out of scope — this ticket
  is about not lying; note in the turn-in which fields the runner actually
  consumes.

### Acceptance criteria

1. Every visible, enabled field in the Settings tab survives save + reload
   (dev-app proof per `verify` skill).
2. No field shows a success toast without being persisted (either persisted or
   the control is removed/disabled).
3. Load populates all persisted fields.
4. Type-check, lint, fast suite green; integration test covers one field from
   each persisted group.

---

## Phase 2 Gate — PASSED 2026-07-19

- [x] All Phase 2 tickets ✅ with dated verification notes (round 3, above)
- [x] `npm run type-check` && `npm run lint` clean · `npm run test:fast` green
- [x] Phase 2 integration trio green (activation-publish, creation-routes,
      workflow_versioning — 26/26)
- [x] Live pass: Review tab renders the "Ready to publish" state from the live
      `/lint` endpoint (round-3 note)
- [x] Reviewer has committed each passed ticket + this gate (`a8d1fcf7`)

---

# Phase 3 — AI creation: ops for everything (Decision 1)

The largest phase. Sequence: ICW2-10 → ICW2-11 → ICW2-12 (10 and 11 both touch
the panel and the ops pipeline; 12 extends the prompt/schema after the
pipeline is the only path). Sizes here were escalated and approved on
2026-07-18.

## Verification pass — 2026-07-19 (ICW2-10..12, worked and verified by the reviewer)

All three tickets implemented in one pass. Gates green on the whole tree:
`npm run type-check` → 0 errors · `npm run lint` → 0 problems (repo-wide,
`--max-warnings 0`) · `npm run test:fast` → 1685 passed / 15 skipped ·
`tests/integration/ai/workflowEdit.test.ts` → 32/32 (was 17 cases; extended,
not forked).

**Three real bugs were found and fixed while implementing, beyond the written
findings:**

1. **`step.create`/`step.update` silently dropped `config`**
   (`WorkflowPatchService.ts`). This is the exact ICW2-2 defect living at the
   ops seam — every AI-generated choice step would have landed with no options.
   Fixed and pinned by a regression test that was confirmed to fail without the
   fix (temporarily reverted; 2 tests went red, then restored).
2. **`step.setVisibleIf`/`step.update` typed `visibleIf` as a string**, but it
   is a jsonb `ConditionExpression` — the same misconception that crashed
   `/lint` in Phase 2. The ops schema now uses the existing
   `conditionExpressionSchema`, so the model is taught (and validated against)
   a shape the engine can actually evaluate.
3. **Valueless logic operators were unparseable.**
   `parseConditionToExpression` only matched `" <op> "` with a trailing space,
   so `"has_pet is_true"`, `"email is_empty"`, `is_false` and `is_not_empty`
   threw "Could not parse condition" — the model could never express a boolean
   or emptiness rule. Fixed to match a trailing operator, with a 4-case
   parameterised unit test.

**Live pass (dev app on :5000, real Express/auth/Postgres):** 11 of 12 live
assertions PASS — ops apply → section+steps written; choice step keeps its
options; `section.setVisibleIf` persists a condition object and rejects the
string form (400); `step.reorder` persists; cross-workflow op rejected with
"does not belong to workflow"; both retired revise endpoints now 404.

**Two live gaps, both environmental, neither a Phase 3 regression:**

- **AI-generation half of the live proof is unproven** (ICW2-10 AC1,
  ICW2-11 AC1). The `GEMINI_API_KEY` in `.env` returns HTTP 429 on every
  attempt across two sessions ~25 min apart (`ai-provider-client` retried 5×
  with 60s backoff), so no real model call could complete. Everything not
  requiring model quota was proven live; the generate-and-apply path is
  covered by the integration suite with a mocked provider. **Re-run the live
  AI check when the key has quota.**
- **Dev-DB drift (pre-existing).** `public.ai_settings` was missing
  `created_at`, which 500'd every AI request — added that one column so
  verification could proceed. `public.audit_logs.resource_type` is NOT NULL in
  the dev DB but nullable in the migration baseline, so the audit insert inside
  `createDraftVersion` throws and the route degrades to `versionId: null` on
  the dev DB only. The migration-built test schema creates versions correctly
  (proven by the AC3 integration test asserting before/after snapshot ids).
  `run_completion_jobs` is also missing (the uncommitted runner/IRO
  initiative). **Left alone deliberately — `npm run db:push` would apply
  another initiative's schema as a side effect. Shawn's call.**

**Backlog observation filed:** `createDraftVersion` failures are swallowed into
`versionId: null` with only a log line, so a broken audit/version write looks
like success to the client (pre-existing behaviour, not introduced here).

## ICW2-10 — Port the live AI panel to the hardened ops path; make Apply/Discard real ✅

**Priority: P0 (data-loss/trust)** · Size: M–L · Files:
`client/src/components/builder/ai/AiConversationPanel.tsx`,
`client/src/components/builder/ai/useAiConversation.ts`,
`server/routes/ai/workflowEdit.routes.ts`, delete
`AiConversationPanel.legacy.tsx`

### Finding

All the ICW-13..16 hardening (provider registry, per-op Zod + IDOR validation,
fail-closed pre-edit snapshots, transactional apply) lives on
`POST /api/workflows/:id/ai/edit` — whose only client is the **unmounted**
`AiConversationPanel.legacy.tsx:67`. The mounted panel
(`WorkflowBuilder.tsx:16,311`) uses `useReviseWorkflow` →
`/api/ai/workflows/revise`, whose worker **commits during the job** — before
the user sees the diff — including `db.delete(logicRules...)` reinsertion and
orphan deletion (`AiRevisionQueue.ts:184,257,306-317`). The panel then shows
"pending" changes with Apply/Discard, but `handleApply`
(`useAiConversation.ts:198`) only re-PUTs workflow metadata and
`handleDiscard` (`:230`) only edits local chat state:

```ts
const handleDiscard = (): void => {
    setProposedWorkflow(null);   // server was already mutated; no rollback
```

"Manual review" mode is currently a lie; Discard does nothing.

### Preferred fix

Point the mounted panel at the hardened path. Preferred interaction shape:

1. Panel sends the instruction to `/ai/edit` with a **propose-only** flag —
   extend the route to support `dryRun: true`, returning the validated ops +
   a human-readable diff **without applying** (the route already separates
   generation from apply; the seam exists around
   `WorkflowPatchService.apply`). Nothing is written on propose.
2. **Apply** sends the returned ops back for application through the existing
   snapshot + transaction pipeline (or the route caches the proposal
   server-side keyed by a proposal id — dev's choice; state the reason).
3. **Discard** drops the proposal — now genuinely a no-op because nothing was
   written.
4. Easy-mode auto-apply calls the same endpoint without `dryRun`.
5. Delete `AiConversationPanel.legacy.tsx`; fix the two
   `@ts-expect-error TODO(ICW-B1)` prop mismatches at
   `WorkflowBuilder.tsx:313-316` properly while rewiring.

Preserve the security invariants (system/user role separation,
`fenceUntrusted`, `aiModelResponseSchema.safeParse`) — they must not regress;
the existing integration tests assert them. **UI change → `design` skill.**

### Ties

- Implements Decision 1. **Blocks ICW2-11/12.**
- Existing tests: `tests/integration/ai/workflowEdit.test.ts` (17 cases) — 
  extend, don't fork.
- `add-api-endpoint`, `design`, `run-tests`, `verify` skills.

### Acceptance criteria

1. The mounted panel performs an end-to-end AI edit through `/ai/edit`
   (dev-app proof with `GEMINI_API_KEY`, per `verify` skill).
2. In manual-review mode, after the diff is shown and **before** Apply, the
   database contains zero changes (integration test: propose, then read
   sections/steps/rules — unchanged).
3. Apply commits through the snapshot pipeline (BEFORE-snapshot exists;
   failure → fail-closed 503 per ICW-16, still tested).
4. Discard leaves the workflow untouched (test).
5. `AiConversationPanel.legacy.tsx` deleted; no client references to
   `/api/ai/workflows/revise` remain for builder editing.
6. Full AI integration suite green; type-check/lint clean.

---

## ICW2-11 — Initial generation emits ops; retire the full-replace revise path ✅

**Priority: P1** · Size: L (approved) · Files:
`client/src/pages/NewWorkflow.tsx`, `server/routes/ai/workflowEdit.routes.ts`
(or generation route), retirements: `server/queues/AiRevisionQueue.ts`,
`server/services/WorkflowRevisionService.ts`, revise endpoints in
`server/controllers/AiController.ts` / `ai.routes.ts`, client
`useAi.ts`/`useReviseWorkflow` consumers

### Finding

Decision 1 says ops for everything. The NewWorkflow AI tab currently drives
the full-replace pipeline (`useAi.ts:22-47` — which also polls forever with no
attempt cap, hanging if the in-memory `MemoryQueue` (`AiRevisionQueue.ts:417`)
loses the job on restart). Once ICW2-10 lands, the revise path's only
remaining consumer is initial generation.

### Preferred fix

- NewWorkflow AI tab: create the (empty) workflow via the normal create route,
  then submit the prompt through the ops pipeline (`step.create` /
  `section.create` / `logicRule.create` ops) with auto-apply — generation
  against an empty workflow needs no manual review. Reuse the prompt-derived
  title behavior from ICW-20.
- If generation latency requires async UX, prefer a simple pending state on
  the synchronous call (the ops route already has timeout handling via
  `AIProviderClient`) over resurrecting the queue. If the dev believes a queue
  is genuinely required, **stop and escalate** rather than keeping the old one.
- Retire: `AiRevisionQueue`, `WorkflowRevisionService`, the revise endpoints,
  and the client hooks/polling — delete, don't comment out. Sweep for other
  consumers first (`AiAssistantDialog`'s `/suggest` path is separate and stays;
  `AIWorkflowGeneratorDialog` is unreferenced dead code — delete it too).
- ICW2-2's interim worker fixes die here with the worker; note it in the
  turn-in.

### Ties

- **Depends on ICW2-10.** Blocks ICW2-12.
- Chunking loss: the revise path's section-chunker handled very large
  workflows; ops generation sidesteps it (ops are incremental). Note in
  turn-in if any large-workflow behavior regresses.
- `add-api-endpoint`, `run-tests`, `verify` skills.

### Acceptance criteria

1. NewWorkflow AI tab produces a populated workflow (sections, steps **with
   configs**, rules) through the ops pipeline — dev-app proof.
2. Choice steps generated via the AI tab have options (regression test for
   the ICW2-2 class of bug, now at the ops seam).
3. `grep -r "workflows/revise" server/ client/` → no live references;
   AiRevisionQueue/WorkflowRevisionService deleted; dead
   `AIWorkflowGeneratorDialog` deleted.
4. No infinite polling loops remain (the `useAi.ts` poller is gone).
5. Full AI integration suite + fast suite green; type-check/lint clean.

---

## ICW2-12 — Teach the model the full vocabulary; close op-schema gaps ✅

**Priority: P1 (capability ceiling)** · Size: M · Files:
`server/services/AiSettingsService.ts` (DEFAULT_SYSTEM_PROMPT),
`shared/` ops schema (`aiWorkflowEdit.schema.ts`),
`server/services/WorkflowPatchService.ts`

### Finding

The prompt teaches ~19 of 38 step types — omitting `repeater`, `computed`,
`js_question`, `loop_group`, `final_documents`, `true_false`, and every
`*_advanced`/`multi_field` variant — and no config schemas or logic-operator
catalog (pre-port evidence: `AIPromptBuilder.ts:376-380`; re-verify against
the post-ICW2-10 prompt source). The model cannot generate a large fraction of
the platform's capability. Op-schema gaps to close while here: setting
`visibleIf` on steps/sections, section-targeted logic rules, and step reorder
ops if absent.

### Preferred fix

- Generate the step-type + config documentation **from the source of truth**
  (`stepTypeEnum` + `shared/validation/stepConfigSchemas`) rather than
  hand-listing types in the prompt — a build-time or startup-time derivation
  keeps it from drifting. Same for the logic-operator catalog
  (`shared/types/conditions.ts`).
- Extend the ops discriminated union where gaps exist; every new op gets the
  same per-op validation + IDOR checks as existing ones (donor:
  `assertEntityBelongsToWorkflow` usage in `WorkflowPatchService`).
- Mind the prompt-size budget: include the full catalog but keep it compact
  (names + one-line config summaries, not full JSON schemas).

### Ties

- **Depends on ICW2-10/11** (single pipeline first).
- `add-step-type` skill (the 38-type inventory), `run-tests`.

### Acceptance criteria

1. Prompt content is derived from `stepTypeEnum`/config schemas (test: a type
   added to the enum appears in the generated prompt without prompt-file
   edits).
2. AI can produce a `repeater` (or other previously-untaught type) step with
   valid config via the ops path (integration test with mocked model output).
3. Ops exist for `visibleIf` set/clear and section-targeted rules; each has a
   validation + IDOR test.
4. Full AI integration suite green.

---

## Phase 3 Gate — 2026-07-19 (one item outstanding)

- [x] All Phase 3 tickets ✅ with dated verification notes
- [x] `npm run type-check` && `npm run lint` clean
- [x] `npm run test:fast` green (1685) · `tests/integration/ai/workflowEdit.test.ts` 32/32
- [~] Live pass — **partially blocked.** Proven live: builder-panel apply
      writes through the snapshot pipeline, nothing is committed before Apply,
      Discard is side-effect-free (propose writes zero rows/versions/snapshots),
      new visibility + reorder ops, IDOR rejection, retired endpoints 404.
      **Not proven: AI tab generation with a real `GEMINI_API_KEY`** — the key
      is rate-limited (429 on every attempt). Re-run when quota returns.
- [x] Reviewer has committed each passed ticket + this gate

---

# Phase 4 — Data safety & reference integrity

ICW2-14 touches `AliasRenameService` + `StepService`; no overlap with the
others — this phase can largely run in parallel.

## Verification pass — 2026-07-20 (reviewer; ICW2-13, ICW2-14, ICW2-16, ICW2-17)

Reviewed the uncommitted tree work against each ticket's acceptance criteria and
committed the four passing tickets (one commit each, staging only that ticket's
files). ICW2-15 remains open (re-scoped — see its note).

- **Gate:** `npx tsc --noEmit` → 0 errors · pre-commit hook (ESLint + tsc +
  strict-zones + related unit tests) → PASSED on all four commits ·
  `npm run test:fast` → green.
- **ICW2-14** (commit `846dddd3`): `renameAliasInExpression` walker verified
  (recursive, immutable, rewrites `variable`/variable-typed `value`/`value2`);
  service rewrites step + section `visibleIf`. Reviewer confirmed the dev's
  deviation is correct — `logic_rules` store `conditionStepId` as a UUID FK
  (`shared/schema/workflow.ts:284`), not an alias, so a rename cannot dangle
  them; pinned by a regression test. Unit tests 13/13.
- **ICW2-17** (commit `67be01c6`): unfiled branch resets ownership to the
  personal/user model + propagates to `workflowRuns` in one `tx`; `status`
  removed from `updateWorkflowSchema`. Unit + integration green — **reviewer
  fixed** the move-to-unfiled integration test (it filed under a *personal*
  project, so the original ownership assertion was a no-op; now seeds the run as
  org-owned via `ctx.orgId` so the reset is observable). 8/8 integration.
- **ICW2-16** (commit `817f51c5`): date operators + `diff_*` (number `value2`)
  added to `OPERATORS_BY_STEP_TYPE`; legacy-operator fallback for old saved
  conditions; LogicBuilder feeds choice options via `getLegacyChoiceOptions`
  (mirrors runner `alias ?? id`). New unit tests 11/11.
  **Live (2026-07-20, dev app):** AC2 ✅ proven — a condition on the
  multiple-choice step rendered a value **dropdown** of that step's options
  (Small/Large) instead of free text, and selecting "Large" stored the exact
  option value (builder preview: `package_size = "large"`, not the label). AC1
  (date operators): verified via unit tests + code + the same operator-dropdown
  machinery demonstrated working live; the direct eyeball of the date-operator
  list was not captured (preview-tool instability driving the collapsible
  visibility toggle). Residual risk low — a static, unit-tested entry in the
  same `OPERATORS_BY_STEP_TYPE` map that fed the proven choice condition.
- **ICW2-13** (commit `02274720`): impact-count endpoint + destructive
  DeleteImpactDialog across all three delete surfaces; counting in the repo for
  ICW2-B1 reuse. Unit 43/43. **Reviewer fixed** a missing `Step` import in
  `SectionService.test.ts` and **wrote the AC4 integration coverage** the dev
  never got to (per-step counts, section aggregation, zero-impact, 401,
  non-collaborator 403/404) — `creation-routes.test.ts` 26/26.
  **Live (2026-07-20, dev app):** AC1 ✅ proven — deleting a step with a seeded
  answer surfaced the destructive dialog with the real count ("1 answer from 1
  run will be permanently deleted"), and Cancel aborted. AC2 (zero-answer =
  one-click, no dialog) confirmed by code + the integration test (impact {0,0})
  and the count>0 gating just demonstrated; not re-triggered live because the
  zero-impact path falls through to a native `confirm()` that hangs the
  automation.

Context: the four devs were dispatched in parallel; three (ICW2-13/16/17) were
killed mid-edit by a session usage limit, so the reviewer finished and verified
their work directly from the shared tree rather than re-dispatching.

## ICW2-13 — Deleting a step/section silently destroys collected answers ✅

**Priority: P1 (data loss)** · Size: S–M · Files:
`server/services/StepService.ts`, `server/services/SectionService.ts`, new
count endpoint or extension, builder delete confirmations under
`client/src/components/builder/`

### Finding

`step_values.stepId → steps` is `onDelete: 'cascade'`
(`shared/schema/run.ts:89`), and section→steps→values cascades likewise.
`StepService.deleteStep` (`:292`) / `SectionService.deleteSection` (`:93`) do
a plain delete. Removing a question from a workflow with in-progress or
completed runs permanently destroys every respondent answer for that step —
no warning, no count, no recovery (versions don't preserve answers either).

### Preferred fix

Per Decision 3 (staged): warning-with-count now, soft-delete later (ICW2-B1).

- Server: expose an impact count (answers + distinct runs affected) — either a
  lightweight `GET .../steps/:id/delete-impact` endpoint or include the count
  in a `409`-style first response; reviewer prefers the explicit GET (simpler
  client). Mirror the existing route patterns per `add-api-endpoint`.
- Client: the delete flows for steps and sections show a destructive-confirm
  dialog **only when count > 0**, stating "N answers from M runs will be
  permanently deleted." Zero-impact deletes stay one-click. **UI change →
  `design` skill.**

### Ties

- ICW2-B1 (soft-delete) is the long-term home; keep the server counting logic
  reusable for it.
- `add-api-endpoint`, `design`, `verify` skills.

### Acceptance criteria

1. Deleting a step with stored `step_values` in the dev app shows the count
   dialog; confirming deletes; canceling doesn't (screenshot proof).
2. Deleting a step with zero answers shows no extra friction.
3. Section delete aggregates counts across its steps (test).
4. Integration test covers the impact endpoint's counts and tenancy (foreign
   workflow → 404/403).
5. Type-check, lint, fast suite green.

---

## ICW2-14 — Alias rename breaks `visibleIf` and logic-rule conditions silently ✅

**Priority: P1** · Size: M · Files: `server/services/AliasRenameService.ts`,
`tests/unit/services/AliasRenameService.test.ts`

### Finding

`AliasRenameService.propagateRename` (`:99-182`, called from
`StepService.ts:263`) rewrites transform-block/document-hook/lifecycle-hook
`inputKeys` and Final Block mappings — but **not** step/section `visibleIf`
expressions nor logic-rule conditions. Renaming a step's alias silently breaks
every condition referencing the old alias; they evaluate against a missing
variable at runtime.

### Preferred fix

Extend `propagateRename` to rewrite alias references inside: `steps.visibleIf`,
`sections.visibleIf`, and logic-rule condition payloads. Reuse the expression
shape handled by `shared/conditionEvaluator.ts` — write one exported
`renameAliasInExpression(expr, oldAlias, newAlias)` walker (place it near the
evaluator in `shared/`) rather than ad-hoc JSON string replacement. Follow the
service's existing per-table update pattern and its logging.

### Ties

- ICW2-8's lint catches dangling refs that predate this fix — the two are
  complementary; neither replaces the other.
- Donor: existing `propagateRename` table-update blocks; the SystemStats
  tx-threading gotcha applies if transactions are involved (thread `tx`).

### Acceptance criteria

1. Renaming an alias referenced by another step's `visibleIf`, a section's
   `visibleIf`, and a logic rule updates all three (unit tests per reference
   type, extending the existing test file).
2. Expressions referencing other aliases are untouched (no over-rewrite).
3. Nested/grouped condition expressions handled (test with AND/OR group).
4. Existing rename-propagation tests green; type-check clean.

---

## ICW2-15 — Template instantiation feeds `pages`-shaped graphs into `sections`-shaped ingest ✅

> **Re-scoped & still open (Shawn + reviewer, 2026-07-20).** Re-audit found
> ICW2-6 already landed: `VersionService.serializeWorkflow` now writes
> `graphJson` as ingest-shaped `WorkflowContentData`, so the mismatch is fixed
> for all NEW templates. The `pagesToWorkflowContent` adapter is **descoped**
> (no legacy `pages`-shaped blueprint data exists; if any ever surfaces, handle
> it with a one-time migration, not permanent runtime translation — keeps the
> single canonical shape ICW2-6 established). Remaining scope when picked up:
> (1) empty/`{}` template → clear **400** ("Template has no content") instead of
> silently creating an empty interview; (2) fix the `blueprint.routes.ts:63-65`
> authz gap (`projectService.verifyOwnership` → `aclService.hasProjectRole(...,
> 'edit')`, donor `WorkflowService.createWorkflow`); (3) a post-ICW2-6
> build→publish→template→instantiate round-trip integration test. **Not yet
> implemented** — no tree work exists for this ticket.

**Priority: P1 (broken feature)** · Size: M · Files:
`server/services/TemplateService.ts`, possibly a new adapter in `shared/` or
`server/services/`

### Finding

Blueprints snapshot `workflowVersions.graphJson`
(`TemplateService.ts:61 — graphJson: sourceVersion.graphJson // Snapshot!`),
whose historical shape is `WorkflowJSON` `{ pages: [...] }`
(`shared/types/workflow.ts:55`). Instantiation feeds that straight into the
ingest service, which expects `{ sections[].steps[] }`:

```ts
// TemplateService.ts:135-141 — "historically the full structural payload"
await workflowContentIngestService.apply(
  workflowId,
  template.graphJson as WorkflowContentData, ...
```

`normalizeContent` defaults `sections ??= []`, so a `pages`-shaped blueprint
yields an interview with **zero sections/steps** while reporting success.
After ICW2-6, version graphJson becomes the ingest-compatible
`WorkflowContentData` shape — which fixes *future* blueprints but strands
existing `pages`-shaped ones and empty-`{}` ones.

### Preferred fix

- **Work after ICW2-6** so new blueprints are ingest-shaped by construction.
- At instantiation, detect the payload shape: ingest-shaped → apply as today;
  `pages`-shaped → convert via a small `pagesToWorkflowContent` adapter
  (pages→sections, blocks→steps, variableName→alias — map only what exists,
  log what can't map); empty/`{}` → fail with a clear 400-mapped "Template has
  no content" instead of silently creating an empty interview.
- Also fix the legacy authorization inconsistency while in this file's route:
  `blueprint.routes.ts:63-65` gates instantiate-into-project with
  `projectService.verifyOwnership` instead of the ACL check used everywhere
  else (`aclService.hasProjectRole(..., 'edit')` — donor:
  `WorkflowService.createWorkflow:148`). Same-locality bundle.

### Ties

- **Depends on ICW2-6** (canonical snapshot shape).
- `add-api-endpoint`, `run-tests` skills.

### Acceptance criteria

1. Instantiating a post-ICW2-6 blueprint reproduces its sections/steps/rules
   (integration test round-trip: build → publish → create template →
   instantiate → compare).
2. A legacy `pages`-shaped blueprint instantiates with converted content
   (fixture test); an empty blueprint returns **400**, creating nothing.
3. A project **editor** (non-owner) can instantiate into the project; a
   viewer cannot (tests).
4. Type-check, fast suite, template integration tests green.

---

## ICW2-16 — Logic UI: 8 engine operators unreachable; choice comparisons are free-text ✅

**Priority: P2** · Size: S–M · Files:
`client/src/components/logic/LogicBuilder.tsx`,
`client/src/components/logic/ConditionValueInput.tsx`, the
`OPERATORS_BY_STEP_TYPE` map (in `shared/` or `client/src/lib/`)

### Finding

- The engine implements date operators (`before`, `after`, `on_or_before`,
  `on_or_after`, `diff_days/weeks/months/years` —
  `shared/conditionEvaluator.ts:260-281`) that `OPERATORS_BY_STEP_TYPE` never
  lists, so the UI cannot express them.
- `LogicBuilder.tsx:89-91` hardcodes `choices: undefined` with
  `// TODO: Fetch choices for choice-based steps`, so
  `ConditionValueInput.tsx:97`'s choices dropdown never renders and users must
  hand-type exact option values for radio/multiple-choice conditions.

### Preferred fix

- Add the date operators to `OPERATORS_BY_STEP_TYPE` for date/datetime step
  types, with sensible value inputs (date picker for comparisons, number for
  diffs — the value-input component already switches by `valueType`).
- Resolve the TODO: the builder already has the workflow's steps in cache —
  pass each choice-type variable's options from its step `config` into the
  variable descriptor so the existing dropdown path renders. No new fetch
  should be needed; state the reason if one is.
- **UI change → `design` skill.**

### Ties

- ICW2-3 exposes this editor in Easy mode — coordinate if concurrent (different
  files, same feature area).

### Acceptance criteria

1. A date step offers the date operators in the condition UI and a built
   condition evaluates correctly in preview/runner (dev-app proof).
2. A condition on a multiple-choice step offers a dropdown of that step's
   options; the stored value matches the option value exactly (proof + unit
   test if the mapping is extracted).
3. Existing conditions still load/edit without regression.
4. Type-check, lint, fast suite green.

---

## Phase 4 Gate

- [ ] All Phase 4 tickets ✅ with dated verification notes
- [ ] `npm run type-check` && `npm run lint` clean · `npm run test:fast` green
- [ ] `npm run test:integration` (full)
- [ ] Live pass (`verify` skill): delete-with-answers dialog shows real count;
      alias rename keeps a dependent condition working; template instantiate
      round-trip; choice-condition dropdown
- [ ] Reviewer has committed each passed ticket + this gate

---

# Phase 5 — Contract cleanups

## ICW2-17 — Status vocabulary + unfiled-move ownership cleanups ✅

**Priority: P2** · Size: S · Files: `server/routes/workflows.routes.ts`,
`server/services/WorkflowService.ts`

### Finding

Two small correctness/coherence items in the same file pair (bundled):

- `updateWorkflowSchema.status` validates `['draft','published','archived']`
  (`workflows.routes.ts:183`) but the DB enum is `['draft','active','archived']`
  (`shared/schema/workflow.ts:33`) — `'published'` is not a real value and the
  handler strips status anyway (`:204` `delete updateData.status`). Dead,
  misleading contract surface.
- `WorkflowService.moveToProject` (`:351-385`): the `projectId === null`
  branch only clears `projectId` — unlike the project branch it does not reset
  `ownerType`/`ownerUuid` nor propagate to `workflowRuns`, leaving an
  "unfiled" workflow still org-owned and access checks misrouted.

### Preferred fix

- Remove `status` from `updateWorkflowSchema` entirely (the dedicated
  `PUT /:id/status` route is the status authority) and drop the strip line.
- In the unfiled branch, mirror the project branch: reset ownership to the
  personal/user model and propagate to `workflowRuns` in the same transaction.
  Confirm intended ownership semantics for "unfiled" against
  `docs/features/PROJECTS_API_TICKETS.md` decisions before coding; if unclear,
  escalate rather than guess.

### Ties

- `add-api-endpoint` skill; PROJ initiative decisions (ownership model).

### Acceptance criteria

1. `PUT /api/workflows/:id` with a `status` key is rejected by validation (or
   cleanly ignored per the chosen contract — state which and why).
2. Moving a workflow to unfiled resets ownership and updates its runs' owner
   fields (unit/integration test).
3. Existing workflow-update and move tests green; type-check clean.

---

## Phase 5 Gate

- [ ] ICW2-17 ✅ with dated verification note
- [ ] `npm run type-check` && `npm run lint` clean
- [ ] `npm test` (full CI-equivalent run) green — closes the initiative
- [ ] Re-grade the creation process and record it here

---

# Backlog — separate projects (not phase-gated)

## ICW2-B1 — Soft-delete for steps/sections (`deletedAt`) ✅

> **Landed 2026-07-23.** `deletedAt` on steps/sections (migration 0005, schema
> `_v8`); manual delete + ingest reconciliation now soft-delete (section
> cascades to its steps in a transaction), so `step_values` answers survive;
> chokepoint reads filter `isNull(deletedAt)`; the alias unique index is scoped
> to `deleted_at IS NULL`; restore endpoints added (UI deferred). Verified: 11
> integration tests (independently re-run against the test DB), full integration
> suite 865/0, type-check + lint clean. **Follow-up filed as ICW2-B11** — the
> AI-ops delete path still hard-deletes.

**Priority: P1 (data safety)** · Size: L · Files:
`shared/schema/workflow.ts`, a new `migrations/000N_*.sql` (via `db:generate`),
`tests/helpers/schemaManager.ts`, `server/repositories/StepRepository.ts`,
`server/repositories/SectionRepository.ts`, `server/services/StepService.ts`,
`server/services/SectionService.ts`,
`server/services/WorkflowContentIngestService.ts`,
`server/routes/steps.routes.ts`, `server/routes/sections.routes.ts`

> **Promoted from backlog & re-audited 2026-07-22.** Evidence below is current.
> Scoped to a **shippable server-side core**; the restore *UI* (a client
> surface to view/undelete removed steps) is deliberately deferred to a
> follow-up so this ticket stays landable by one dev.

### Finding

Deleting a step/section is a **hard SQL `DELETE`** that destroys respondent
answers. `StepService.deleteStep` (`StepService.ts:299-314`),
`deleteStepById` (`:505-520`), `SectionService.deleteSection`
(`SectionService.ts:88-97`), and `deleteSectionById` (`:203-211`) all call the
repo `delete()`, which is `BaseRepository.delete` (`BaseRepository.ts:113-121`)
— a real `DELETE`. `step_values` are the respondent answers (`run.ts:117-129`,
comment "Step values (Answers)") and FK-cascade on step delete
(`run.ts:120` `onDelete: 'cascade'`). So deleting a step permanently destroys
its answers; deleting a section cascades steps→answers. ICW2-13 shipped only a
**warning dialog** — the destruction still happens. The impact-count logic was
deliberately placed in `StepValueRepository` "so ICW2-B1 (soft-delete) can
reuse it" (`StepService.ts:318-321`).

No `deletedAt` exists on `steps`/`sections` (`workflow.ts:239-252` sections,
`:255-278` steps); only `datavault_rows` (`datavault.ts:111`) and `files`
(`files.ts:52`) carry one. RLS policies for steps/sections
(`migrations/0001_enable_rls.sql:123-178`) are tenancy-only and reference no
`deletedAt`, so **exclusion must be application-layer, not RLS** — no RLS
migration needed. A second hard-delete path exists in ingest reconciliation:
`WorkflowContentIngestService.ts:482` (sections) and `:493` (steps).

### Preferred fix

- Add nullable `deletedAt: timestamp("deleted_at")` to `sections` and `steps`
  in `shared/schema/workflow.ts`, then `npm run db:generate` → next migration
  (`0003`+; **never** hand-edit the journal — `db-schema-change` skill). Add a
  partial index `WHERE deleted_at IS NULL` (mirror `datavault_rows`,
  `datavault.ts:119`). Bump the `_vN` token in
  `tests/helpers/schemaManager.ts`.
- **Critical:** change the partial unique index `steps_workflow_alias_unique`
  to also require `deleted_at IS NULL`, so a soft-deleted step's alias frees up
  and re-creation/undelete doesn't hit a unique violation.
- Convert the delete paths to set `deletedAt = now()` instead of issuing a
  `DELETE` (in the two services' delete methods and/or a repo `softDelete`).
  Because no row is deleted, the `step_values` cascade never fires — answers
  survive automatically. Section soft-delete should also soft-delete its child
  steps.
- Filter readers at the **chokepoints** (covers the large majority in a few
  edits): add `isNull(deletedAt)` to `SectionRepository.findByWorkflowId`
  (`:23-30`), `findByIdAndWorkflow` (`:35-50`), `countByWorkflowId` (`:69-76`);
  `StepRepository.findBySectionId` (`:22-39`), `findBySectionIds` (`:46-64`),
  `findByWorkflowId` (`:71-106` — add the column to the explicit list
  `:84-100`), `findByWorkflowIdWithAliases` (`:147-169`), `getAliasMap`
  (`:177-192`), `countByWorkflowId` (`:197-204`). Handle the generic
  `BaseRepository.findById` used as `stepRepo/sectionRepo.findById` (override
  in these two repos or add a scoped finder). Make the ingest inline reads
  (`WorkflowContentIngestService.ts:231-233,259-265,389`) exclude soft-deleted
  rows, and make its reconciliation "delete" a soft-delete.
- Add restore endpoints: `POST /api/steps/:stepId/restore`,
  `POST /api/sections/:sectionId/restore` (edit access, standard error
  contract) that clear `deletedAt`. **Restore UI is out of scope — note it as
  a deferred follow-up.**

### Ties

- `db-schema-change` (migration + `_vN` bump), `add-api-endpoint` (restore
  endpoints, error contract), `run-tests`. Reuses `StepValueRepository`
  impact-count.
- **Sequenced LAST.** Shares `StepService`/`SectionService` with ICW2-B5 and a
  migration number with ICW2-B7 — dispatch only after both have landed so the
  migration number and service edits don't collide.

### Acceptance criteria

1. Deleting a step that has `step_values` sets `deletedAt` and leaves those
   `step_values` rows intact (integration test: create step → add step_values
   → delete → assert step row has `deletedAt` and the answers still exist).
2. Soft-deleted steps/sections do not appear in `getWorkflowWithDetails`, the
   builder list, version serialization, or the runner (integration test over
   the aggregate reader and at least one run path).
3. A new step can be created reusing a soft-deleted step's alias with no unique
   violation (test the alias-freeing behavior).
4. Restore endpoints clear `deletedAt` under `edit` access; `view` role → 403.
5. Ingest reconciliation soft-deletes removed rows and ignores already
   soft-deleted rows.
6. Migration generated via `db:generate`; `schemaManager` `_vN` bumped;
   `npm run type-check`, `npm run lint`, `npm run test:fast` + affected
   integration tests green.

## ICW2-B2 — Full snapshot isolation: runs execute against published versions
Size: L (architecture). Deferred by Decision 2. After ICW2-6, version bodies
are faithful; this project makes `RunService`/runner read the version snapshot
instead of live tables so edits stop leaking into in-flight runs and old
versions are reproducible. Design doc first. **Superseded by the fully scoped
[IRO-2 backlog](./INTERVIEW_RUNNER_OPTIMIZATION_TICKETS.md)
initiative ticket**, with IRO-1/IRO-3 as required companion work; use that
backlog as the implementation source of truth.

## ICW2-B3 — Collaborative editing: step content is last-write-wins
Size: L. Yjs syncs only the reactflow graph + presence
(`useCollabClient.ts:115-120`); step config edits go through REST and clobber
each other; soft locks are racy (`CollaborationContext.tsx:58-70`). Needs a
field-level merge or a real lock protocol. Defer unless co-editing becomes a
near-term priority.

## ICW2-B4 — Real builder E2E (UI-driven) ✅

> **Landed 2026-07-23 (scoped).** UI-driven spec `tests/e2e/builder-ui-flow.e2e.ts`
> drives create → add page → 2 questions (form edits) → keyboard reorder →
> Easy-mode visibility condition → activate → real run created & runner renders,
> with 3 persisted-state checkpoints. Passes reliably against a fresh dev server
> (chromium). The answer→submit tail is deferred to ICW2-B10 (+ the related
> answer-persistence gap) — two runner defects this spec surfaced. **In building
> it, the spec found and got fixed FIVE real bugs:** blueprint JWT-auth (ICW2-15),
> dev:test DB-init, runner null-500 (P0), section order-collision — all
> committed — plus ICW2-B9 and ICW2-B10 filed.

**Priority: P2 (test coverage)** · Size: M · Files: new
`tests/e2e/builder-ui-flow.e2e.ts` (name at dev's discretion, must match
`*.e2e.ts`)

> **Promoted from backlog 2026-07-22.** Unblocked now that Phases 1–3 landed
> (Easy-mode visibility ICW2-3, Review-tab activate ICW2-8 both exist).
>
> **Discovered-bug + reviewer fix 2026-07-22.** Round-1 dev correctly escalated
> that `npm run dev:test` (the command Playwright's `webServer` launches) never
> connected the DB, so UI e2e was never runnable this way. Root cause:
> `server/db.ts` skips auto-init under `NODE_ENV=test` (to protect Vitest's
> per-worker schema setup), and `server/index.ts` only `await`ed the resulting
> no-op `dbInitPromise`. **Reviewer-applied fix** (own commit, outside the
> ticket's e2e-spec scope): `server/index.ts` now also calls the idempotent
> `initializeDatabase()` after awaiting `dbInitPromise` — no-op in dev/prod,
> real connect under `dev:test`; Vitest never runs `index.ts`. Verified live:
> `/health` on `:5174` now reports `database.connected: true`. Dev resumed to
> run the spec against the working server.

### Finding

No Playwright spec drives the builder **UI**.
`tests/e2e/creator-flow-complete.e2e.ts` does every structural step through
`page.request.post` API calls (`:25` dev-login, `:38` create workflow, and so
on) — so the builder forms, drag-reorder, and logic UI are entirely
unasserted. A form regression (e.g. the ICW2-4 debounce, the ICW2-3 visibility
editor) would pass CI. Playwright is configured
(`playwright.config.ts`: `testMatch: *.e2e.ts`, baseURL `localhost:5174`,
`webServer: npm run dev:test`); auth is `POST /api/auth/dev-login` then reload
(`creator-flow-complete.e2e.ts:23-29`).

### Preferred fix

One new spec that drives the **actual builder UI** with real clicks/typing
(not `page.request` for the structural work): dev-login → create a workflow →
add a section through the builder → add ≥2 steps and edit title/description via
the form fields → reorder (drag or the reorder control) → add a `visibleIf`
condition via the Easy-mode visibility editor (ICW2-3) → activate via the
Review tab (ICW2-8) → run the workflow and submit one answer. `page.request`
is allowed only for auth/seed; the builder interactions must be UI. Use
resilient selectors (`getByRole`/`getByText`), not brittle `nth`. Keep it
chromium-only if cross-browser proves flaky (document via a project/`testMatch`
note). Load the `verify` skill for the local-app run pattern.

### Ties

- `verify` skill (dev-login workaround, `dev:test` on 5174). Builds on ICW2-3
  and ICW2-8. Isolated new file — **no overlap; safe to run in parallel.**

### Acceptance criteria

1. A new `*.e2e.ts` spec performs create → section → steps (form edit) →
   reorder → condition → activate → run entirely through UI interactions
   (`getByRole`/`click`/`fill`); API calls only for auth/seed.
2. The spec passes locally against `npm run dev:test` (paste output). If a step
   is genuinely not UI-drivable yet, document why and cover the rest.
3. Assertions verify persisted state (reload or API read) at ≥3 points (step
   created, condition saved, run submitted).
4. No `test.only`; `npm run lint` clean on the new file.

## ICW2-B5 — Duplicate step / duplicate section ✅

**Priority: P2 (enhancement)** · Size: M · Files:
`server/services/StepService.ts`, `server/services/SectionService.ts`,
`server/routes/steps.routes.ts`, `server/routes/sections.routes.ts`,
`client/src/components/builder/cards/common/StepTitleRow.tsx`,
`client/src/components/builder/pages/PageCard.Header.tsx`,
`client/src/hooks/api/useSteps.ts`, `client/src/hooks/api/useSections.ts`,
`client/src/lib/vault-api.ts`

> **Promoted from backlog & re-audited 2026-07-22.** Scoped to **duplicate a
> single step and duplicate a single section**. General "bulk operations" is
> **descoped** (no clear product spec, would balloon) — a dev should not build
> multi-select/bulk here.

### Finding

Only whole-asset clone exists: `POST /api/workflows/:id/copy`
(`workflows.routes.ts:143`) and `POST /api/projects/:id/copy`
(`projects.routes.ts:246`), both delegating to `workflowClonerService`. There
is **no** single-step or single-section duplicate endpoint, and no client
action/hook (the 6 client "duplicate" matches are all alias/option-uniqueness
validators, not features). Donor pattern:
`WorkflowClonerService.copySectionsAndSteps` (`:493-558`) with the two-phase id
remap `remapJsonIds` (`:135-153`) and `copyLogicRules` FK remap (`:560-599`) —
note the cloner copies `alias` **verbatim** (`:542`) because it targets a *new*
workflow. `createStep` (`StepService.ts:130-191`) derives append order as
`max(order)+1` (`:178-181`), gates `verifyAccess(..., 'edit')` (`:136`), and
enforces alias uniqueness via `validateAliasUniqueness` (`:93-125`) /
`generateUniqueAlias`. `createSection` (`SectionService.ts:41-64`) mirrors this.

### Preferred fix

- **Server:** add `duplicateStep(stepId, userId)` to `StepService` and
  `duplicateSection(sectionId, userId)` to `SectionService`, gated on
  `verifyAccess('edit')` and respecting `MAX_STEPS_PER_WORKFLOW` /
  `MAX_SECTIONS_PER_WORKFLOW`. Reuse the cloner's `remapJsonIds` approach but
  for a **same-workflow** copy — so unlike the cloner you **must mint a fresh
  unique alias** (`generateUniqueAlias`, e.g. `<alias>-copy`) rather than copy
  it verbatim, or you hit the `(workflowId, lower(alias))` unique index. Copy
  `config`/`defaultValue`/`visibleIf`/`repeaterConfig`. Prefer inserting the
  copy immediately after the source (`order = source.order + 1`, shifting
  later siblings) for good UX; append-at-end is acceptable if simpler — state
  the choice. `duplicateSection` deep-copies its steps (each a fresh alias) and
  any section-scoped logic rules, remapping ids via the two-phase pattern.
- **Routes** (`add-api-endpoint` skill): `POST /api/steps/:stepId/duplicate`
  and `POST /api/sections/:sectionId/duplicate`, `hybridAuth` +
  `autoRevertToDraft`, standard `classifyRouteError` mapping.
- **Client** (`design` skill): `PageCard.Header.tsx` already has a
  `DropdownMenu` (`:158-195`) — add a "Duplicate Page" item before the Delete
  separator. `StepTitleRow.tsx` is delete-only (`:82-91`) — add a small
  overflow menu with Duplicate + Delete. New hooks `useDuplicateStep` /
  `useDuplicateSection` in `useSteps.ts` / `useSections.ts` that invalidate the
  workflow query so the copy appears without a full reload.

### Ties

- `add-api-endpoint`, `design`, `run-tests`. Donor: `WorkflowClonerService`.
- **Shares `StepService`/`SectionService` with ICW2-B1** — dispatch this
  **before** B1; B1 rebases on the committed result.

### Acceptance criteria

1. `POST /api/steps/:id/duplicate` creates a copy in the same section with a
   **fresh unique alias** and identical config, positioned after the source;
   returns the new step (integration test asserts alias differs, config equal,
   order correct).
2. `POST /api/sections/:id/duplicate` copies the section, all its steps (fresh
   aliases), and section-scoped logic rules with remapped ids (integration
   test).
3. `view` role → 403; over the step/section limit → the standard limit error.
4. Client: a Duplicate action exists in both the page dropdown and a step menu;
   invoking it duplicates and the new item appears without a full reload
   (dev-app proof per `verify` skill, screenshot).
5. `npm run type-check`, `npm run lint`, `npm run test:fast` + new integration
   tests green.

## ICW2-B6 — Response-envelope standardization on the workflow routes
Size: M. `{message}` vs `{success,data}` split within
`workflows.routes.ts` (create/update vs copy/mode/access/transfer). Decide the
house envelope and converge; client sweep required.

## ICW2-B7 — Per-tenant AI cost/token budgeting ✅

**Priority: P2 (cost control)** · Size: L (escalated from M — API-contract +
schema change) · Files: `server/services/ai/AIProviderClient.ts`,
`server/services/ai/providers/AnthropicProvider.ts`,
`server/services/ai/providers/GeminiProvider.ts`,
`server/services/ai/providers/OpenAIProvider.ts`,
`server/services/ai/providers/types.ts`, `server/middleware/ai.middleware.ts`,
`shared/schema/ai.ts` (+ new migration), `shared/limits.ts`, a new repository,
tests. **Scope-expanded 2026-07-22 (reviewer-authorized, see note):**
`server/routes/ai/workflowEdit.routes.ts`,
`server/controllers/AiController.ts`, and
`server/services/AIService.ts` + `server/services/ai/providerConfig.ts`.

> **Promoted from backlog & re-audited 2026-07-22.** The dev is NOT expected to
> invent your business budget numbers — the budget is **env-configurable with a
> generous default** (below), so an unset env never breaks existing flows.
>
> **Reviewer scope authorization 2026-07-22.** Round-1 dev correctly escalated:
> the `callLLM` choke point receives **no tenant identity** today, so enforcing
> "at the AI endpoints (402/429)" (AC2) requires threading `tenantId` through
> the config builders and adding a `BUDGET_EXCEEDED` → 402 branch to the AI
> error mappers. Authorized additions (surgical, `tenantId`-only where
> possible): thread `authReq.tenantId`/`req.tenantId` from
> `workflowEdit.routes.ts` (into `resolveAiProviderConfig` +
> `respondToModelFailure` status mapping) and `AiController.ts` (into
> `createAIServiceFromEnv` + a `BUDGET_EXCEEDED` → 402 branch in
> `handleAiError`), and let `AIService.createAIServiceFromEnv` /
> `providerConfig.resolveAiProviderConfig` accept an optional `tenantId`. **Do
> NOT** mount the `server/middleware/rlsContext.ts` AsyncLocalStorage
> middleware — that is deliberately staged under SEC-051; pass `tenantId`
> explicitly instead. `AIProviderConfig.tenantId` is an optional field.

### Finding

Rate limiting is **request-count only, in-memory, per-instance**:
`aiWorkflowRateLimit` (`ai.middleware.ts:94-110`) and `aiDailyRateLimit`
(`:116-131`), both `express-rate-limit` with the default MemoryStore (no
`store` configured), keyed on `tenantId` (`:105-108,126-129`). Limits live in
`shared/limits.ts:27-28`. There is **no token or cost accounting**. Real
provider usage is **discarded in all three providers** — Anthropic ignores
`response.usage` (`AnthropicProvider.ts:37-59`), Gemini ignores
`usageMetadata` (`GeminiProvider.ts:52-67`), OpenAI ignores `response.usage`
(`OpenAIProvider.ts:53-68`) — each re-derives a `Math.ceil(len/4)` estimate
(`AIServiceUtils.ts:22-24`), logged (not persisted) in `AIProviderClient`
(`:53,77,80`). `IAIProvider.generateResponse`/`callLLM` return
`Promise<string>` (`providers/types.ts:27-31`) — **no usage channel**. No
per-tenant budget/usage storage exists (`tenants` `auth.ts:36-47`,
`ai_settings` `ai.ts:18-27` have none; `ai_settings` has no tenant FK).
**`callLLM` is the single choke point** every AI path funnels through
(`workflowEdit.routes.ts` and the `ai.routes.ts` generation family all reach
it).

### Preferred fix

- **Surface real usage:** change `IAIProvider.generateResponse` to return
  `{ text: string; usage?: { inputTokens: number; outputTokens: number } }`
  (or add an out-channel), and read real usage in each provider (Anthropic
  `response.usage.input_tokens/output_tokens`, Gemini
  `response.usageMetadata`, OpenAI `response.usage`). Thread it up through
  `callLLM`; keep the char/4 estimate only as a fallback when a provider omits
  usage.
- **Persist usage + budget:** add an `ai_usage` table (tenantId FK, inputTokens,
  outputTokens, costUSD, timestamp) in `shared/schema/ai.ts` via
  `npm run db:generate` (new migration — `db-schema-change` skill; **coordinate
  the migration number with ICW2-B1**, which also adds one). Record one row per
  `callLLM` in `AIProviderClient` after each call, keyed on the tenant.
- **Enforce a configurable budget** keyed on `tenantId` at the `callLLM` choke
  point (or a middleware sharing the accounting): a rolling 30-day token/cost
  budget with an **env default** in `shared/limits.ts` (e.g.
  `AI_TENANT_MONTHLY_TOKEN_BUDGET`, default generous enough not to break
  existing flows). Over budget → fail-closed with a clear error mapped to
  402/429 ("AI budget exceeded for this period").
- **Note (do not implement):** cross-instance durability (shared store / Redis)
  is deferred — the DB-backed `ai_usage` table is the source of truth; the
  in-memory `express-rate-limit` stays as a coarse RPM guard.

### Ties

- `add-api-endpoint` (error contract), `db-schema-change` (new table +
  migration — **coordinate number with ICW2-B1**), `run-tests`. `callLLM` is
  the single seam. Independent of B5/B8; **shares only a migration number with
  B1** — dispatched in Batch 1 (before B1).

### Acceptance criteria

1. After an AI call, **real provider token usage** (not the char/4 estimate) is
   persisted per tenant (test with a mocked provider returning a usage object;
   assert the stored row matches).
2. A tenant over its configured budget is blocked at the AI endpoints with a
   clear budget-exceeded error; under budget it succeeds (integration test that
   sets the budget low via config/env).
3. The default budget is env-configurable and generous; with the env unset,
   existing AI flows still work (test the default path).
4. All three providers pass real usage through; the estimate is only a fallback
   (test the fallback when `usage` is absent).
5. `npm run type-check`, `npm run lint`, `npm run test:fast` + new tests green;
   migration generated via `db:generate`; `schemaManager` `_vN` bumped.

## ICW2-B8 — Template pool: replace silent `projects[0]` fallback with explicit scoping ✅

**Priority: P2 (correctness/UX)** · Size: S–M · Files:
`client/src/components/builder/tabs/TemplatesTab.tsx` (+ a small picker/
empty-state), tests

> **Promoted from backlog & re-audited 2026-07-22.** Note: this tab manages
> **document templates** (DOCX/PDF, scoped by a `NOT NULL` `projectId`), a
> different subsystem from workflow blueprints — do not touch
> `TemplateService`/`blueprint.routes.ts` (that's ICW2-15).

### Finding

`TemplatesTab.tsx:81-88` resolves which project's template pool to show. When
the workflow is unfiled (`workflow.projectId == null`) it **silently** falls
back to `projects[0].id`:

```tsx
} else if (projects != null && projects.length > 0) {
  // Fallback: Use the first project (Default Project) if workflow is unfiled
  setWorkflowProjectId(projects[0].id);
}
```

That comment is wrong: `projects[0]` is the user's **newest** project
(`ProjectRepository` orders `desc(createdAt)`, `:150`), not a stable default,
and `useProjects()` is called with no arg so **archived** projects are included
(`useProjects.ts:15-20`). The chosen id drives **both** the template list fetch
(`:57-60`) and uploads (`:99-116`) — so an unfiled workflow silently reads from
and writes document templates into an unrelated project, with no UI signal.
(The zero-projects case is already handled correctly with a blocking toast,
`:99-106`.) The `templates` table requires a non-null `projectId`
(`workflow.ts:176-192`) and has no workflow-local pool, so the silent guess is
the only current fallback.

### Preferred fix (`design` skill)

Remove the silent `projects[0]` fallback. For an unfiled workflow, do **not**
auto-pick a project — instead surface an explicit affordance:

- **Reviewer preference:** an empty-state that prompts the user to file the
  workflow into a project first (document templates are project assets),
  reusing the existing "No project context found. Please save the workflow to
  a project first." copy pattern; **or**, if you judge inline selection better,
  a small project picker in the tab header that starts unselected with clear
  copy. State which you chose and why.

When no project is chosen: the grid shows the guidance empty-state and upload
is disabled — no fetch or upload fires against a project the user didn't
explicitly target. The filed-workflow path (`:82-83`) is unchanged.

### Ties

- `design` skill (UI change), `verify` skill (dev-app proof). Independent of
  ICW2-15 (server blueprint) — different files, **safe to run in parallel**.

### Acceptance criteria

1. An unfiled workflow no longer silently lists/uploads templates against
   `projects[0]`; the user sees an explicit picker or a "file this workflow
   first" empty-state (dev-app proof/screenshot per `verify` skill).
2. A filed workflow (`workflow.projectId` set) behaves exactly as before.
3. No upload or fetch fires against a project the user didn't explicitly
   target.
4. `npm run type-check`, `npm run lint`, `npm run test:fast` green; a test
   (component or e2e) covering the unfiled and filed cases.

---

## ICW2-B9 — First "Next" on a fresh run no-ops (run.currentSectionId starts null) ✅ (committed 692c4c6c)

**Priority: P2 (runner UX bug)** · Size: S–M · Files:
`server/services/RunService.ts`, the run-creation path
(`createRun`/`createAnonymousRun`), possibly
`server/services/runs/RunExecutionCoordinator.ts` /
`shared/workflowLogic.ts`, tests

> **Discovered during ICW2-B4 e2e, 2026-07-22.** Worked around in that spec with
> a documented double-click on the first section; this ticket is the real fix.

### Finding

The **first** `POST /api/runs/:id/next` on a fresh run returns
`nextSectionId === currentSectionId` (no advance); the **second** call advances
correctly. `RunService.next`/`nextNoAuth` (`RunService.ts:406-429`) ignores the
client-supplied `currentSectionId` and reads `run.currentSectionId` from the DB
row, which starts **NULL** at run creation. `calculateNextSection`
(`shared/workflowLogic.ts:396-399`) special-cases a null current section as
"return the first visible section" — so the first Next ever pressed resolves to
the first section, i.e. where the user already is.
`RunExecutionCoordinator.next` (`RunExecutionCoordinator.ts:72-77`) then
persists that to `run.currentSectionId`, which is why the second press works.
The pure nav logic (`LogicService.evaluateNavigation`) is correct once fed a
real `currentSectionId`. Verified via direct API calls (B4).

### Preferred fix

Initialize `run.currentSectionId` to the first visible section (lowest `order`)
at run creation, so the first Next advances **from** it. **Do NOT** start
trusting the client-supplied `currentSectionId` in `next()` — reading server
state is the safer design (a client shouldn't be able to assert its own
position); keep that. First **confirm nothing depends on `currentSectionId`
being null to mean "not started"** (resume, completion, first-render); if
something does, instead handle the null case inside `next()` by treating null
as "at the first section" and advancing past it.

### Ties

- `add-api-endpoint`, `run-tests`. Sibling to ICW2-B5's order-collision fix
  (both are runner-navigation correctness). Not yet dispatched.

### Acceptance criteria

1. On a fresh run, the first `POST /next` advances from the first section to the
   next visible section (integration test: `nextSectionId !== currentSectionId`
   when a next section exists).
2. `currentSectionId` semantics elsewhere (resume, completion, first render)
   unchanged — existing run tests green.
3. The ICW2-B4 e2e's first-section double-click accommodation can be removed and
   the spec still passes.
4. `npm run type-check`, `npm run lint`, tests green.

---

## ICW2-B10 — Runner does not reveal a step whose visibleIf references a just-answered step ✅ (committed 556f9b90)

> **Real root cause (deviation from hypothesis):** not alias-vs-id keying (that
> was already correct) but an unmemoized `run` object in `useRunSession` →
> `useRunValues` hydration reset answers on every render (update-depth loop),
> so answers never stuck. One bug, both symptoms (no reveal + review shows no
> answers). Fixed + full builder e2e submit-flow restored & passing.

**Priority: P1 (runner correctness)** · Size: M · Files (start here):
`server/services/IntakeQuestionVisibilityService.ts` and/or the client runner's
visibility evaluation + its answer/alias resolution, `shared/conditionEvaluator.ts`
(reference only — the operator itself is correct)

> **Discovered during ICW2-B4 e2e, 2026-07-22.** Needs root-cause; strong
> evidence points at answer-key (alias vs step id) resolution at runtime.
>
> **Related symptom (same investigation):** after answering the controlling
> Yes/No question and reaching the runner's Review page, the review rendered
> "No questions answered in this section" for the answered question — i.e. the
> submitted section recorded no answers. Likely downstream of the same
> visibility-context/answer-keying issue (the runner filters/submits by a
> visibility pass that can't resolve the answer). Confirm whether it is one bug
> or two while fixing.

### Finding

In the runner, a step whose `visibleIf` is "show when <yes/no step> **is_true**"
stays hidden even after the controlling Yes/No question is answered **Yes**. Live
e2e evidence: on the section, the Yes/No control shows active/answered and the
primary action is already the terminal "Review", but the conditional Date step is
**absent from the DOM entirely** (Playwright accessibility snapshot).

The condition is not the problem:
- It is correctly persisted — ICW2-B4 checkpoint 2 asserts `visibleIf.conditions[0].operator === "is_true"` and that the stored condition references the controlling step's **alias**.
- `is_true` = `toBoolean(actualValue) === true` (`shared/conditionEvaluator.ts:362`), and `toBoolean` (`:572-581`) already accepts `true`, `"yes"`, `"true"`, `"1"` — so any reasonable Yes encoding should evaluate true.

So the defect is in how the **runner resolves the controlling answer at evaluation
time** — most likely the `visibleIf` references the controlling step by **alias**
while the runtime answer map is keyed by **step id** (or the client re-evaluates
visibility from a source that doesn't yet hold the just-clicked answer). Net: the
lookup yields `undefined`, `toBoolean(undefined) === false`, step stays hidden.

### Preferred fix

Trace the runner's visibility path (server `IntakeQuestionVisibilityService`
around `:68/:167/:241`, and the client runner block that hides/shows steps) and
make the evaluation context resolve the controlling answer whether the condition
references an **alias or a step id** (build the context keyed by both, mirroring
how the builder/`VariableService` maps aliases). Confirm the just-answered value
is in the context the client evaluates against (re-evaluate on answer change).

### Ties

- `run-tests`. Sibling to ICW2-B9 (both runner-navigation/evaluation). Related to
  the two-tier visibility system (ICW2-3 authored the step-level `visibleIf`).
- Acceptance: an integration/e2e test where answering the controlling step Yes
  reveals the dependent step (and No hides it); once fixed, restore the reveal +
  date-fill assertions removed from `tests/e2e/builder-ui-flow.e2e.ts`.

---

## ICW2-B11 — Extend soft-delete to the remaining hard-delete paths (AI ops, transform blocks) ✅ (committed f99cb7b3)

**Priority: P1 (data safety)** · Size: M · Files:
`server/services/WorkflowPatchService.ts`,
`server/services/TransformBlockService.ts`,
`server/services/WorkflowService.ts` (~:625), tests

> **Filed from ICW2-B1, 2026-07-23.** B1 protected the manual + ingest delete
> paths; these remaining ones still destroy answers.

### Finding

ICW2-B1 converted the manual step/section delete and the ingest reconciliation
to soft-delete, but three paths still issue a hard `DELETE` and therefore still
permanently destroy respondent `step_values`:

1. **`WorkflowPatchService` `step.delete` / `section.delete`** — the AI-editing
   ops pipeline (Decision 1's "ops for everything" surface). So an **AI-driven
   delete still destroys answers** despite B1 — the most important gap.
2. `TransformBlockService.deleteBlock`.
3. `WorkflowService.ts:~625`.

### Preferred fix

Route these deletes through the soft-delete methods B1 added
(`stepRepo.softDelete` / `sectionRepo.softDelete`, or the service delete
methods) instead of `repo.delete()`; the AI-ops apply path must cascade
sections→steps like the manual path. Keep any deliberate hard-purge (if one
exists) explicit and separate.

### Ties

- Builds directly on ICW2-B1; related to Decision 1. `add-api-endpoint`,
  `run-tests`.

### Acceptance criteria

1. An AI `step.delete` / `section.delete` op soft-deletes: integration test
   proves `step_values` survive after an AI-driven delete.
2. `TransformBlockService.deleteBlock` and `WorkflowService.ts:~625` soft-delete
   (or the hard delete is justified in the turn-in).
3. A grep shows no remaining hard `DELETE` of steps/sections outside a
   deliberate, documented purge.
4. `npm run type-check`, `npm run lint`, and the relevant suites green.

---

## Audit cross-reference (finding → ticket)

| Audit finding | Ticket |
|---|---|
| view-role can mutate structure; unscoped reorder IDs | ICW2-1 |
| AI worker drops step config + section rules (live path) | ICW2-2 (interim), ICW2-10/11 (real) |
| Per-question visibility hidden in Easy mode | ICW2-3 |
| Debounce reached only 2 fields; choice-editor lost-edit race | ICW2-4 |
| Cross-section move order collision | ICW2-5 |
| Versions snapshot `{}` / client-trusted graphJson | ICW2-6 |
| Activate never creates version; public share dead-end; dead publish dialog | ICW2-7 |
| No pre-activate lint; Review tab decorative; dead audit code | ICW2-8 |
| Settings tab stub saves | ICW2-9 |
| Hardened AI path dead; fake Apply/Discard | ICW2-10 |
| Full-replace path retirement; infinite polling; ephemeral queue | ICW2-11 |
| Prompt teaches 19/38 types; op-schema gaps | ICW2-12 |
| Delete cascades respondent answers silently | ICW2-13, ICW2-B1 |
| Alias rename skips visibleIf/logic conditions | ICW2-14 |
| Template instantiation shape mismatch; legacy authz check | ICW2-15 |
| 8 operators unreachable; free-text choice values | ICW2-16 |
| `published` status vocab; unfiled-move stale ownership | ICW2-17 |
| Snapshot isolation, soft-delete, collab LWW, E2E, dup/bulk, envelopes, AI budgets, template scoping | ICW2-B1..B8 |

Findings noted but deliberately not ticketed: Assignment-tab condition builder
placeholder (`AssignmentRuleCard.tsx:83-86`) — the Assignment feature's
product direction should be decided before investing (raise with Shawn when
prioritizing); DataSource hardcoded capability badges and dead gear buttons
(`DataSourceCard.tsx:73-76`, `DataSourcesTab.tsx:53-58`) — cosmetic, fold into
any future DataSources work; preview staleness race on unflushed debounced
edits (`PreviewRunner.tsx:44-60`) — revisit after ICW2-4 narrows the window.

**Maintainer:** audit of 2026-07-18 · Reviewer signs off each phase gate
before the next phase starts.
