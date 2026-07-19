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

## ICW2-6 — Versions snapshot nothing: server must serialize real content 🔄

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

## ICW2-7 — Activation never creates a version; public share links dead-end 🔄

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

## ICW2-8 — No pre-activate validation; Review tab is read-only decoration 🔄

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

## ICW2-9 — Settings tab: "Settings Saved" silently discards Branding/Behavior/Publishing 🔄

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

## Phase 2 Gate

- [ ] All Phase 2 tickets ✅ with dated verification notes
- [ ] `npm run type-check` && `npm run lint` clean · `npm run test:fast` green
- [ ] `npm run test:integration` (full — this phase touches runs/versions)
- [ ] Live pass (`verify` skill): build → Activate (version auto-created) →
      public link anonymous run works; zero-step activate blocked with clear
      error; settings fields survive reload
- [ ] Reviewer has committed each passed ticket + this gate

---

# Phase 3 — AI creation: ops for everything (Decision 1)

The largest phase. Sequence: ICW2-10 → ICW2-11 → ICW2-12 (10 and 11 both touch
the panel and the ops pipeline; 12 extends the prompt/schema after the
pipeline is the only path). Sizes here were escalated and approved on
2026-07-18.

## ICW2-10 — Port the live AI panel to the hardened ops path; make Apply/Discard real 🔲

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

## ICW2-11 — Initial generation emits ops; retire the full-replace revise path 🔲

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

## ICW2-12 — Teach the model the full vocabulary; close op-schema gaps 🔲

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

## Phase 3 Gate

- [ ] All Phase 3 tickets ✅ with dated verification notes
- [ ] `npm run type-check` && `npm run lint` clean
- [ ] `npm run test:fast` green · `npm run test:integration -- tests/integration/ai/` green
- [ ] Live pass (`verify` skill, real `GEMINI_API_KEY`): AI tab generates a
      populated workflow; builder-panel edit shows diff with nothing committed
      until Apply; Discard proven side-effect-free
- [ ] Reviewer has committed each passed ticket + this gate

---

# Phase 4 — Data safety & reference integrity

ICW2-14 touches `AliasRenameService` + `StepService`; no overlap with the
others — this phase can largely run in parallel.

## ICW2-13 — Deleting a step/section silently destroys collected answers 🔲

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

## ICW2-14 — Alias rename breaks `visibleIf` and logic-rule conditions silently 🔲

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

## ICW2-15 — Template instantiation feeds `pages`-shaped graphs into `sections`-shaped ingest 🔲

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

## ICW2-16 — Logic UI: 8 engine operators unreachable; choice comparisons are free-text 🔲

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

## ICW2-17 — Status vocabulary + unfiled-move ownership cleanups 🔲

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

## ICW2-B1 — Soft-delete for steps/sections (`deletedAt`)
Size: L. Decision 3's long-term destination: additive `deletedAt` columns,
every reader filters, restore UI, answers survive question deletion. Composes
with ICW2-B2 (old versions can reference soft-deleted steps). Needs
`db-schema-change` + RLS-policy review for any new table/columns.

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

## ICW2-B4 — Real builder E2E
Size: M. No Playwright test drives the builder UI (existing "creator-flow"
e2e uses `page.request.post` for everything). One spec: create → add section →
add/edit steps via the forms → reorder via drag → add condition → activate →
run. Blocked until Phases 1–2 stabilize the flows it would assert.

## ICW2-B5 — Duplicate section / duplicate step / bulk operations
Size: M. Expected builder capabilities with no endpoints
(only whole-workflow clone exists — `WorkflowClonerService` is a good donor
for the remap logic).

## ICW2-B6 — Response-envelope standardization on the workflow routes
Size: M. `{message}` vs `{success,data}` split within
`workflows.routes.ts` (create/update vs copy/mode/access/transfer). Decide the
house envelope and converge; client sweep required.

## ICW2-B7 — Per-tenant AI cost/token budgeting
Size: M. Rate limits are request-count only, in-memory, per-instance
(`ai.middleware.ts:94-131`). With the ops path emitting telemetry (ICW-13),
add token/cost accounting per tenant with a configurable budget.

## ICW2-B8 — Project-scoped template pool fallback
Size: S–M. `TemplatesTab.tsx:84-87` silently attaches unfiled workflows'
templates to `projects[0]`. Decide the scoping story (workflow-scoped?
explicit picker?) and remove the silent fallback.

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
