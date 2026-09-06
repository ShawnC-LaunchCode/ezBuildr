# Code Blocks — Sandboxed JS/Python Transforms, Rebuilt (CB-1..11 + backlog)

Source: design session with the repo owner + code audit of the scripting/transform surface, 2026-09-04.
Scope: `server/services/scripting/`, `server/services/TransformBlockService.ts`,
`server/utils/enhancedSandboxExecutor.ts`, the `js_question` step type, the transform-block
builder UI, and the run engine's recompute call sites.
Overall grade at audit time: **C+** — the execution engine is genuinely good
(`isolated-vm`, AST validation on every execute, alias-keyed run data, virtual steps that
already reach logic and documents). The authoring model on top of it is the problem: the
same idea is implemented three times, every surface is single-output, and there is no
readiness or change gate anywhere, so a block runs with missing inputs and emits garbage.

**This initiative discharges `STB-B8`** (`tickets/BACKLOG.md`, tag `needs-initiative`:
"Sandboxed JS/Python transforms, rebuilt after the initiative closes"). STB-B8's warning
still governs: **`server/services/scripting/` is dormant, not dead — do not delete it.**
This initiative builds *on* it.

Every finding below was verified against the working tree at audit time. **Line numbers are
advisory** — they were accurate when written and drift as fixes land. The locator is the
quoted code and the named symbol; grep for those. A stale line number is not a broken ticket
and does not need re-issuing.

---

## How to work this document

- **Tickets are grouped into 4 phases**, ordered by dependency. Do not start a phase until
  the previous phase's **Phase Gate** has been verified and committed by the reviewer.
- Each ticket has **Finding**, **Preferred fix**, **Ties**, **Acceptance criteria**, plus
  **Vertical proof** on any ticket spanning more than one layer.
- **Load the project skills named in your ticket's Ties before touching code.** At minimum
  `run-tests` — running `npm test` naively gives wrong results in this repo.
- **`npm run type-check` is not the commit gate** — `check:strict-zones` pulls files in
  transitively. Run the pre-commit script before believing the tree is green.
- Devs do not commit; the reviewer commits per passed ticket.
- Status legend: 🔲 Open · 🔄 In progress · ✅ Done (verified at review)

---

## Decisions — the design, in one place

Read this before working any ticket. Every ticket assumes it.

A **Code Block** is a step (`type: 'js_question'`, relabelled "Code Block" in the palette)
that declares **inputs** and **outputs** and runs sandboxed JS (later Python).

1. **Append-only.** A block creates *new* variables; it never overwrites an existing one.
   Each variable therefore has exactly one writer, which makes the dependency graph static
   and knowable at author time.
2. **Two gates decide every execution.**
   - **Readiness gate** — are all *required* inputs resolved? Optional inputs pass through
     as `null` and do not gate. A step that logic has made unreachable counts as
     *resolved-absent*, not pending.
   - **Change gate** — has the canonicalized input tuple changed since the last run
     (compared by hash)? If not, skip.
3. **Firing = trigger × repeat policy**, two independent choices:
   - *Trigger*: `everySubmit` (default) · `atPage` (a floor — "not before this page") ·
     `runStart` · `runComplete`
   - *Repeat*: `onChange` (default) · `once` (fire once, then freeze) · `always` (ignore the hash)
4. **The readiness gate always wins.** `atPage` sets the earliest moment a block may fire;
   it never forces it to fire unready.
5. **Errors null the block's entire output set** and mark it errored. A wrong number in a
   legal document is worse than a blank one.
6. **Recompute is idempotent** (the change gate makes it a no-op when clean), so it is safe
   to call from every navigation point.
7. **The AST pass is the workhorse.** `ASTValidator` already walks every saved script. Input
   derivation, output derivation, dynamic-access warnings, impure-helper detection and cycle
   detection all ride on that one existing traversal, and all report in the editor — never at
   runtime.

### Phase overview

| Phase | Theme | Tickets | Dispatch |
|---|---|---|---|
| 1 | Engine — the recompute model | CB-1..4 | **Sequential** (same files) |
| 2 | Authoring guarantees — the AST pass | CB-5..7 | CB-5 → CB-6 sequential; CB-7 parallel |
| 3 | Surfaces — editor + inspector | CB-8, CB-9a, CB-9 | CB-9a → CB-9 sequential; coordinate shared route files with CB-8 |
| 4 | Cleanup — retire old surfaces, Python | CB-10, CB-11 | **Parallel** (disjoint) |
| Backlog | Not phase-gated | CB-B1..B4 | |

---

# Phase 1 — Engine: the recompute model

Builds the execution model server-side, on the existing `ScriptEngine`. Out of scope for
this phase: editor UI beyond the minimum needed to save the new config shape, Python, and
deleting `transform_blocks` (Phase 4).

**These four tickets touch the same files and must be dispatched in order.** Shared
footprint: `shared/types/steps.ts`, `server/services/codeBlocks/*`,
`server/services/runs/RunExecutionCoordinator.ts`.

## CB-1 — Code Block config: multi-output and one virtual step per output ✅

> **Verified 2026-09-04 (reviewer).** All 8 criteria checked against the tree, not the
> turn-in report. Gates re-run by the reviewer in the worktree after a reviewer edit:
> `type-check` 0 errors (with `node_modules/typescript/tsbuildinfo` cleared first) ·
> `lint` clean (`--max-warnings 0`, repo-wide) · `check:strict-zones` 6 zones / 11 files
> PASSED · `test:fast` **3718 / 330 files** (baseline, 0 added) · `test:integration`
> **140 files, 1289 passed | 3 skipped** (baseline 1284 + 5 new).
>
> The AC-3 seam holds for real: `step_values` row count asserted directly (3), each value
> asserted per virtual step id, and `byAlias` asserted by **value** plus explicit
> `not.toBeNull()` — so the TPL-10 null seed cannot fake it. The error case asserts the
> complementary shape (`{alpha: null, count: null, enabled: null}` with **zero** rows),
> which is Decisions §5 proven at the database rather than at the type level.
>
> **Reviewer edit:** the cross-tenant assertion was tightened from
> `expect([403, 404]).toContain(...)` to `expect(denied.status).toBe(403)` — a status set
> would let a future change to the denial path pass silently. See the corrected Vertical
> proof clause below for why 403, not 404, is right; the dev correctly refused to widen
> scope into shared route authorization to satisfy the original wording.

**Priority: P1** · Size: M · File: `shared/types/steps.ts`

### Finding

`JsQuestionConfig` in `shared/types/steps.ts` allows exactly one output:

```ts
export type JsQuestionConfig = {
  display: "visible" | "hidden";
  code: string;
  inputKeys: string[];
  /** Output variable key where result will be stored */
  outputKey: string;
  timeoutMs?: number;
  helpText?: string;
};
```

`transform_blocks.outputKey` (`shared/schema/workflow.ts`) has the same single-output limit,
and `TransformBlockService.executeAllForPhase` writes it as
`resultData[block.outputKey] = result.output;`.

The multi-output pattern **already exists** — on lifecycle hooks. `LifecycleHookService`
merges an emitted object against a whitelist:

```ts
// Validate output against outputKeys whitelist
// Only merge keys that are whitelisted in outputKeys
for (const key of hook.outputKeys) {
```

and `lifecycle_hooks` carries `outputKeys: text("output_keys").array()` plus
`virtualStepIds: uuid("virtual_step_ids").array()`. The capability is proven; it is simply
not on the surface authors need.

Also: `display: "visible"` is a lie. Nothing in `client/src/components/runner/` handles
`js_question` or `computed` — grep returns no renderer. A block set to `visible` renders nothing.

### Preferred fix

Extend `JsQuestionConfig` into the Code Block config. **Do not add a new value to
`stepTypeEnum`** — STB-21 (migration `0042`) just cut it from 37 to 18, and the config is
JSONB, so no enum change is needed. The palette label becomes "Code Block"; the stored type
stays `js_question`.

```ts
export type CodeBlockOutput = {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'object' | 'list';
  description?: string;
};

export type CodeBlockInput = {
  key: string;
  required: boolean;   // default true; optional inputs pass as null and do not gate
};
```

Replace `outputKey: string` with `outputs: CodeBlockOutput[]`, and `inputKeys: string[]`
with `inputs: CodeBlockInput[]`. Drop `display` entirely — it never worked; the block is
always compute-only.

Declared output `type` is for **authoring-time** use only: correct operators in the
visibility editor, the right icon in the variable picker, correct filter behavior in
documents. Do **not** coerce values at runtime; validate and warn.

Create **one virtual step per output**, mirroring `TransformBlockService.createBlock`, which
is the donor pattern:

```ts
const virtualStep = await this.stepRepo.create({
  workflowId, pageId: targetPageId,
  type: 'computed',
  alias: data.outputKey,   // ← one of these per declared output now
  required: false, order: -1, isVirtual: true,
});
```

Port the whitelist merge from `LifecycleHookService` verbatim: `emit({ a, b, c })`, only
declared keys merged, undeclared keys rejected with a named error.

Provide a `LEGACY_JS_QUESTION_ADAPTER` that reads an old single-`outputKey` config as a
one-element `outputs` array, in the spirit of `LEGACY_STEP_ADAPTERS` in
`shared/types/stepConfigs.ts`. Old configs stay readable; new writes use the new shape.

### Ties

- **Blocks CB-2, CB-3, CB-4** — they build on this config. Dispatch strictly in order.
- Load the **`add-step-type`** skill (step config touches ~10 places) and **`run-tests`**.
- Donor patterns: `LifecycleHookService.executeHooksForPhase` (whitelist merge),
  `TransformBlockService.createBlock` (virtual step creation),
  `shared/types/stepConfigs.ts` (`LEGACY_STEP_ADAPTERS` shape).
- File footprint: `shared/types/steps.ts`, `shared/types/stepConfigs.ts`,
  `server/services/codeBlocks/CodeBlockService.ts` (new),
  `client/src/lib/blockRegistry.tsx` (label + default config),
  `client/src/components/builder/questions/js-question/*`.
- Collides with: CB-2, CB-3, CB-4 (same service), CB-5 (config shape), CB-8 (editor).

### Vertical proof

- **Path:** save a Code Block with 3 declared outputs via the step API → 3 `steps` rows with
  `isVirtual: true` carrying the declared aliases → run the workflow → `emit({a,b,c})` →
  3 `step_values` rows → `RunDataService.buildForRun` returns all 3 under `byAlias`.
- **Real, not mocked:** the DB hop (virtual step creation and `step_values` upsert) and
  `RunDataService`. Mocking either voids this proof.
- **Cross-tenant denial:** saving a Code Block against tenant B's workflow id → **403**, no
  `steps` rows written. (Corrected 2026-09-04, mid-ticket: this clause originally demanded 404,
  which contradicts the repo's own error contract. `classifyRouteError`
  (`server/utils/routeErrors.ts`) maps only a `"not found"` message to 404; an authorization
  failure — `"Access denied"`, or the RLS no-tenant-in-context throw — maps to 403, per
  CLAUDE.md convention 2. A cross-tenant save is an authorization failure, so 403 is correct
  and the ticket was wrong. Satisfying the original wording would have meant changing shared
  step-route authorization for every consumer, which is out of scope for this ticket and is a
  repo-wide decision. The property this clause exists to prove is isolation — denial plus zero
  writes — not a particular status code.)
- **Suite:** `tests/integration/codeBlocks.multiOutput.test.ts` (integration project, needs DB).

### Acceptance criteria

1. `JsQuestionConfig` carries `outputs: CodeBlockOutput[]` and `inputs: CodeBlockInput[]`;
   `outputKey`, `inputKeys` and `display` are gone from the type.
2. Saving a block with N declared outputs creates exactly N virtual steps, one per output
   alias, `type: 'computed'`, `isVirtual: true`.
3. `emit({a, b, c})` with all three declared writes three `step_values` rows, and all three
   carry their **emitted values** in `RunDataService`'s `byAlias` projection.
   **Assert values, never key presence.** `RunDataService.buildForRun` seeds `byAlias` with
   `null` for *every* aliased step (TPL-10), and `findByWorkflowIdWithAliases` defaults to
   `includeVirtual = true` — so the moment AC 2's virtual steps exist, all three keys are
   present in `byAlias` whether or not a single `step_values` row was ever written. A
   `toHaveProperty` / `'a' in byAlias` / `Object.keys` assertion therefore passes with the
   emit-and-persist path completely broken. The test must assert
   `byAlias.a === <emitted value>` (and non-null), plus a direct count of the `step_values`
   rows for those three virtual step ids.
4. `emit()` returning a key **not** in `outputs` fails the block with an error naming the
   undeclared key — it is not silently merged and not silently dropped.
5. A stored pre-existing single-`outputKey` config still loads and runs, via the legacy adapter.
6. Deleting a Code Block soft-deletes its virtual steps, so `steps_workflow_alias_unique`
   frees the aliases (see that index's `deleted_at IS NULL` scope).
7. New test `tests/integration/codeBlocks.multiOutput.test.ts` asserts 2–6 and walks the
   Vertical proof path end to end with the DB hop real.
8. `npm run type-check` 0 errors · `npm run lint` clean on every touched file ·
   `npm run test:integration` green.

---

## CB-2 — Readiness gate, change gate, and per-run block state ✅

> **Verified 2026-09-05 (reviewer).** All 10 criteria checked against the tree, not the
> turn-in report. Gates re-run by the reviewer: `type-check` 0 errors (`tsbuildinfo` cleared
> first) · `lint` 0 errors/warnings (`--max-warnings 0`, repo-wide) · `check:strict-zones`
> 6 zones / 11 files PASSED · `test:fast` **3718 / 330 files** (unchanged — this ticket adds
> entries to tables existing tests read, not new fast tests) · `test:integration`
> **141 files, 1303 passed | 3 skipped** (baseline 1292 + 11 new).
>
> **Both anti-traps met without correction.** AC 4 spies on
> `sandbox.executeCodeWithHelpers` with **call-through** against the real ScriptEngine and
> asserts the invocation count across the sequence (0 → 1 → still 1 after an unrelated
> submit → still 1 after re-evaluation → 2 after a real change); the stored value is
> identical whether a block re-ran or was skipped, so only the count can distinguish them.
> AC 3 inserts a real `logic_rules` row with `action: 'hide'` rather than omitting a value,
> which would have been indistinguishable from AC 1's unready case. The test also pins that
> a **falsy** answer (`income_a: 0`) counts as resolved — a bug class the ticket never asked
> about.
>
> AC 7 is real, not nominal: `evaluateWorkflowVisibility` now appears in exactly one place,
> `server/services/runs/RunVisibility.ts`, with both `RunExecutionCoordinator` and
> `CodeBlockService` importing `getVisibleStepIds` from it. The module imports nothing back
> from either service, so the `import/no-cycle` error is broken rather than relocated.
>
> AC 8 verified directly against the test database: `code_block_runs` exists with both FKs,
> the status check, and `code_block_runs_run_step_unique` on `(run_id, step_id)` — a unique
> index, the same pattern as `steps_workflow_alias_unique`. The reviewer separately confirmed
> the shared Neon branch was **not** migrated (no `code_block_runs`, no drizzle migrations
> table), so `db:migrate` was correctly never run against it.
>
> **Approved footprint additions:** `server/services/runs/RunVisibility.ts` (required by
> AC 7 — the cycle-free extraction), `server/services/portability/entityGraph.ts` and
> `shared/types/portabilityDisclosure.ts` (both forced by coverage guards
> `schemaCoverage.test.ts:62` and `exclusionCategories.test.ts:16`, which fail whenever a
> table is added without classification and disclosure). `code_block_runs` is excluded from
> portability as per-run instance data, alongside `workflow_runs`, `step_values` and
> `transform_block_runs`.
>
> The dev raised three blockers and was right all three times — most importantly the
> CB-2/CB-3 boundary, which was a defect in this ticket's Vertical proof (see the correction
> in that section).

**Priority: P1** · Size: M · File: `server/services/codeBlocks/CodeBlockService.ts`

### Finding

There is no readiness check and no change detection anywhere in the scripting surface.
`ScriptEngine.execute()` copies whitelisted keys **only if present**, with no gate:

```ts
for (const key of inputKeys) {
  const dataKey = aliasMap?.[key] ?? key;
  if (dataKey in data) {
    input[key] = data[dataKey];
  }
}
```

So a block needing `income_a`, `income_b`, `num_children` that runs before `num_children`
is collected executes with it `undefined`, computes `NaN`, and writes `NaN` into a variable
documents will render. `TransformBlockService.executeAllForPhase` compounds this by running
**every** enabled block for a phase unconditionally, every time that phase fires.

### Preferred fix

Add both gates in a new `CodeBlockService.evaluate(runId, definition, data)`.

**Readiness gate.** A required input is *resolved* if it has a `step_values` row (a row
holding JSON `null` counts as resolved — the user answered and cleared it), **or** its step
is not in the visible set. Reuse the visibility computation that already exists —
`getVisibleStepIds` in `RunExecutionCoordinator` calls
`evaluateWorkflowVisibility({sections, pages, steps})`. Extract it so both callers share one
implementation; **do not write a second visibility path.** Optional inputs (`required: false`)
never gate and arrive as `null`.

**Change gate.** Hash the canonicalized resolved-input tuple (stable key order —
`JSON.stringify` over a sorted-key object). Compare against the stored hash for that
(run, block). Equal → skip.

**Per-run state** needs a new table. Load the **`db-schema-change`** skill first — author via
`db:generate`, never hand-edit the journal. Next migration number is `0043`.

```
code_block_runs
  id, run_id (FK workflow_runs, cascade), step_id (FK steps, cascade),
  input_hash text, status ('fired'|'skipped_unready'|'skipped_unchanged'|'error'),
  pending_inputs text[],           -- what it is waiting on, for CB-9's inspector
  error_message text, fired_at, updated_at
  unique (run_id, step_id)
```

`pending_inputs` exists so CB-9's inspector can say *waiting on `num_children`* without
recomputing anything.

⚠️ **`db:migrate` against the local `.env` hits a shared Neon branch** (see `LU-B1` in
`tickets/BACKLOG.md`). Confirm which branch `DATABASE_URL` points at before running it.

### Ties

- **Depends on CB-1** (needs `inputs[]` with the `required` flag). Do not start before CB-1 is ✅.
- **Blocks CB-3, CB-4.**
- Load **`db-schema-change`** (new table + migration `0043`) and **`run-tests`**.
- File footprint: `server/services/codeBlocks/CodeBlockService.ts`, `shared/schema/run.ts`,
  `migrations/0043_*.sql`, `server/repositories/CodeBlockRunRepository.ts` (new — follow the
  `BaseRepository` pattern), `server/services/runs/RunExecutionCoordinator.ts` (extract
  `getVisibleStepIds`).
- Collides with: CB-1, CB-3, CB-4.

### Vertical proof

**How to drive it — corrected 2026-09-04.** Persist each page's answers through the **real
page-submit API**, then drive the gate with an **explicit `codeBlockService.evaluate(...)`
call** after each submit. Do **not** widen `RunExecutionCoordinator.executeJsQuestions` to
consider blocks outside the submitted page: it filters `step.pageId === pageId`, and
changing that is CB-3's `everySubmit` trigger, listed in CB-3's own Preferred fix ("wire the
eligible evaluation points") and file footprint. CB-2 owns the **gates**; CB-3 owns **when
they are consulted**. The DB and sandbox hops stay real either way — only the caller
changes — so this costs the proof nothing. (Original wording implied automatic cross-page
firing and could not be satisfied inside CB-2's footprint; the dev correctly stopped rather
than reach into CB-3.)

- **Path:** the repo owner's own scenario. Block needs `income_a`, `income_b` (page 1) and
  `num_children` (page 2). Submit page 1 → `code_block_runs.status = 'skipped_unready'`,
  `pending_inputs = ['num_children']`, no output `step_values` row. Submit page 2 → status
  `fired`, output row written, hash stored. Submit page 3 (unrelated answers) → status
  `skipped_unchanged`, hash unchanged, **no second script execution**. Change `income_a` and
  resubmit page 1 → status `fired`, new hash, output updated.
- **Real, not mocked:** the DB hops (`step_values`, `code_block_runs`) and the real
  `ScriptEngine`/`isolated-vm` execution — counting executions requires the real engine.
- **Cross-tenant denial:** evaluating against a run belonging to tenant B → refused, no
  `code_block_runs` row written.
- **Suite:** `tests/integration/codeBlocks.gates.test.ts` (integration project, needs DB).

### Acceptance criteria

1. A block with an unresolved **required** input does not execute; a `code_block_runs` row
   records `skipped_unready` and lists the missing keys in `pending_inputs`.
2. An **optional** input that is absent does not gate; the block runs and receives `null`
   for that key.
3. A required input whose step is **not in the visible set** counts as resolved-absent — the
   block fires rather than waiting forever. The test must construct a real logic rule that
   hides the step, not merely omit the value.
4. With inputs unchanged, a second evaluation records `skipped_unchanged` and the sandbox is
   **not** invoked — assert the execution count, not just the stored value.
5. Changing any required input changes the hash and re-fires the block.
6. A `step_values` row holding JSON `null` counts as **resolved**, not missing.
7. The visibility computation is shared with `RunExecutionCoordinator`, not duplicated — one
   function, two callers.
8. Migration `0043` creates `code_block_runs` with the unique `(run_id, step_id)` constraint
   and applies cleanly **from scratch, as proven by a green `test:integration`**.
   ⛔ **Do NOT run `npm run db:migrate`** to satisfy this — corrected 2026-09-04. The
   worktree `.env`'s `DATABASE_URL` points at a **shared Neon branch**, so `db:migrate`
   would migrate a database other people are using; the ⚠️ above says so and the original
   wording of this criterion contradicted it.
   Running it is also unnecessary: `tests/setup.ts` decides schema reuse by
   `SchemaManager.migrationsFingerprint()` (`tests/helpers/SchemaManager.ts:194`), a SHA-256
   over every `migrations/*.sql` **filename and body**. Adding `0043_*.sql` changes that
   fingerprint, so every cached worker schema is dropped and rebuilt from the full chain —
   which means a green integration run *is* the from-scratch proof this criterion wants.
   There is **no `_vN` cache token to bump**; that mechanism was replaced on 2026-08-21, so
   do not go looking for one.
9. New test `tests/integration/codeBlocks.gates.test.ts` asserts 1–6 and walks the full
   Vertical proof path with the DB and sandbox hops real.
10. `npm run type-check` 0 errors · `npm run lint` clean · `npm run test:integration` green.

---

## CB-3 — Firing model: trigger × repeat policy ✅

> **Verified 2026-09-05 (reviewer).** ⚠️ **Implemented by the reviewer, not an independent
> dev** — the repo owner chose that path knowingly. Every design call below was therefore
> made and approved by the same party, which is weaker than this initiative's usual gate.
> The compensating control was **mutation testing**: each load-bearing behaviour was broken
> on purpose to confirm a test actually caught it. Two of those mutations survived on the
> first attempt and forced a real test to be added.
>
> **The five call sites in the Preferred fix above were wrong, and are corrected here.**
> "Page enter" **does not exist** in this codebase: there is no page-enter endpoint and no
> page-enter block-execution point (only four `blockRunner.runPhase` callers exist server-wide;
> the runner navigates via `POST /runs/:id/next` and renders from `GET /runs/:id/runtime`).
> The list also omitted `runStart` while defining a `runStart` trigger that is meaningless
> without one. `GET /runtime` was deliberately **not** wired as the substitute: it is a polled
> GET, and a `repeat: 'always'` block hung off it would execute sandboxed code on every render
> — a side-effecting GET and a cheap DoS vector. The five real points are:
> `RunLifecycleService.executeOnRunStart` (runStart) · `RunExecutionCoordinator.submitPage` ·
> `RunExecutionCoordinator.next` · `RunResumeService.redeemResumeLink` ·
> `RunLifecycleService` before `buildForRun` (runComplete, placed *before* run data is built
> so a firing block reaches the documents rendered on the next line).
>
> **Mutation results — what the tests actually pin:**
> | Mutation | Caught by |
> |---|---|
> | Remove `evaluateAll` from `next()` | AC 4 ✅ |
> | Move the sweep **after** `evaluateNavigation` | **nothing** — all 7 passed ❌ |
>
> The second result means AC 7's ordering claim was unproven behind a green suite. A test was
> added driving the **autosave** path (`POST /runs/:id/values`), which persists inputs without
> running the submit sweep — the only shape where the ordering inside `next()` is observable.
> Re-running the inversion now fails that test and nothing else.
>
> **AC 7's first failure was a bad test, not a product gap.** It looked like logic rules could
> not read computed/virtual outputs; an isolated probe comparing a virtual condition step
> against a real one showed both hide correctly. The real cause: the rule was inserted *after*
> the run was created, and a run resolves its definition once at creation, so that rule was
> never in it. Fixtures must insert logic rules **before** creating the run.
>
> **Correction to this ticket's own prediction:** it recorded that widening execution would
> break CB-1's legacy-adapter test. It did not — that block sits on a page whose submit is not
> involved. **CB-2's gates test broke instead** (3 tests): it drove `evaluate()` manually
> because CB-3 did not exist, so the explicit call now correctly reports `skipped_unchanged`
> and the error test counted 4 executions rather than 3. Every assertion still held, so only
> the redundant post-submit `evaluate()` calls were removed, one at a time with a stated
> reason — no assertion deleted, count still 11. The erroring-block-on-another-page ruling is
> now pinned by a coordinator unit test instead.
>
> Three unit suites (`pinnedDefinition`, `lifecycleHooks`, `RunResumeService`) had **no**
> `CodeBlockService` mock and began reaching the real service without a database once the five
> call sites were wired; the sweep is stubbed in each. `makeDefinition` and two type imports
> became orphans when the coordinator tests were rewritten and were deleted, not suppressed.
>
> **A real bug was caught only by the FULL suite, after every targeted run was green.** The
> first full integration run came back 1306 rather than the predicted 1310: four **30-second
> timeouts** (not assertion failures) across `api.runs.resume-handoff` and
> `api.runs.visited-pages`. Cause: the resume call site wrapped `evaluateAll` in `withTenant`,
> which opens a transaction, while `evaluateAll` opens its own via `withCurrentTenant` —
> nested pool queries against the size-1 test pool, the deadlock shape already documented for
> `SystemStatsRepository`. Fixed with `runWithTenantContext`, which sets the ambient tenant id
> without opening a transaction; that call never needed one. It produced no wrong data, so
> nothing but running those suites could have surfaced it, and in production it would have
> hung resume-link redemption. **Chasing the unexplained count delta rather than re-running is
> what found it** — four timeouts on Windows read exactly like flakiness.
>
> Gates (reviewer-run): `type-check` 0 errors · `lint` 0 errors/warnings (`--max-warnings 0`,
> repo-wide) · `check:strict-zones` 6 zones / 11 files PASSED · `test:fast` **3733 passed**
> (3718 + 14 firingPolicy + 1 net coordinator) · `test:integration` **142 files, 1310 passed |
> 3 skipped** (baseline 1303 + 7 new).

**Priority: P1** · Size: M · File: `server/services/codeBlocks/CodeBlockService.ts`

### Finding

Today *when* a block runs is a single `phase` column on `transform_blocks`
(`blockPhaseEnum`, default `onPageSubmit`), and it is unconditional — the block fires
whenever its phase fires, ready or not, changed or not. There is no way to express "compute
this once and freeze it", which every generated id, timestamp, or captured rate needs: under
re-running semantics those values drift every time an unrelated input moves.

### Preferred fix

Two independent config fields, not one enum:

```ts
trigger: 'everySubmit' | 'atPage' | 'runStart' | 'runComplete';   // default 'everySubmit'
triggerPageId?: string;                                            // required iff trigger === 'atPage'
repeat: 'onChange' | 'once' | 'always';                            // default 'onChange'
```

Semantics — this table is the contract, implement it literally:

| Field | Value | Means |
|---|---|---|
| trigger | `everySubmit` | eligible at every page submit / navigation |
| trigger | `atPage` | **a floor, not a fixed point** — not eligible before `triggerPageId` submits; eligible at every evaluation after |
| trigger | `runStart` | eligible only at run creation (inbound/prefill variables) |
| trigger | `runComplete` | eligible only in the completion pass, before documents |
| repeat | `onChange` | fire when ready and the hash moved |
| repeat | `once` | fire the first time ready, then never again — hash ignored thereafter |
| repeat | `always` | fire at every eligible evaluation, hash ignored |

**The readiness gate always wins over the trigger.** An `atPage` block whose inputs are not
ready when that page submits does not fire and does not error — it waits, and fires at the
next evaluation where it is ready. This is the most important rule in the ticket: the
alternative (firing unready because the author said "here") is what puts `NaN` in documents.

Wire the eligible evaluation points. Because the gates make recompute idempotent, call it
from **all** of these — each is a no-op when clean:

- `RunExecutionCoordinator.submitPage` (after values persist, before validation returns)
- `RunExecutionCoordinator.next` (before `logicSvc.evaluateNavigation`, so computed values
  can gate navigation on the same submit)
- page enter
- resume-link landing (`RunResumeService`)
- `RunLifecycleService`, before document generation

### Ties

- **Depends on CB-2** (the gates must exist). **Blocks CB-4.**
- Load **`run-tests`**.
- File footprint: `server/services/codeBlocks/CodeBlockService.ts`, `shared/types/steps.ts`,
  `server/services/runs/RunExecutionCoordinator.ts`, `server/services/runs/RunResumeService.ts`,
  `server/services/workflow-runs/RunLifecycleService.ts`,
  **`tests/integration/codeBlocks.multiOutput.test.ts`** (see the ruling below).

**This ticket owns the widening that CB-2 was told not to do** (added 2026-09-04).
`executeJsQuestions` filters `step.pageId === pageId`, so today a block is only ever
considered on its own page's submit. Implementing `everySubmit` means removing that filter —
and doing so **will break CB-1's legacy-adapter test**
(`tests/integration/codeBlocks.multiOutput.test.ts`), which submits a newly created page
while an intentionally-erroring block sits on an earlier page. That test file is therefore
inside this ticket's footprint; updating it is expected, not a violation of the
"never weaken an existing test" rule.

**Ruling on what that test should assert afterwards — decide it this way, do not improvise.**
A block that errors on a page *other than the one being submitted* must **not** fail the
submission. Decisions §5 says an error nulls that block's output set and marks it errored; it
says nothing about failing the user's navigation, and the alternative is that one broken
block anywhere in a workflow makes every subsequent page un-submittable. So: record
`status = 'error'`, null that block's outputs, and let the submit succeed. The CB-1 test's
existing expectation (a later page submits fine despite an earlier invalid block) is
**correct and must be preserved** — what changes is that the earlier block now also gets a
`code_block_runs` row recording the error. Errors in blocks belonging to the submitted page
keep their current behavior.
- Collides with: CB-1, CB-2, CB-4.

### Vertical proof

- **Path:** a block with `trigger: 'atPage'` on page 3 whose inputs only complete on page 4.
  Submit page 3 → does not fire (`skipped_unready`). Submit page 4 → fires. Separately, a
  `repeat: 'once'` block emitting `helpers.now()`: fires on first readiness, and a later
  input change leaves the stored value byte-identical.
- **Real, not mocked:** the DB hops and the real sandbox. The `once` case is only meaningful
  against the real `now()` helper.
- **Cross-tenant denial:** covered by CB-2's service-level check; assert it is not bypassed
  by the `runStart` path, which runs at run creation before a page context exists.
- **Suite:** `tests/integration/codeBlocks.firing.test.ts` (integration project, needs DB).

### Acceptance criteria

1. Each of the four `trigger` values gates eligibility exactly as tabulated above.
2. `atPage` behaves as a **floor**: a block unready at its named page fires at the next
   evaluation where it becomes ready, and never fires before that page.
3. `repeat: 'once'` fires exactly once per run; a subsequent required-input change does
   **not** re-fire it and does not alter the stored output.
4. `repeat: 'always'` fires at every eligible evaluation even when the hash is unchanged.
5. `trigger: 'runStart'` fires against inbound/prefill data at run creation with no page context.
6. Recompute is invoked from all five call sites listed in the Preferred fix, and a clean
   (unchanged) run through all of them performs **zero** sandbox executions — assert the count.
7. A computed value produced during `submitPage` is visible to `evaluateNavigation` on that
   same submit, so it can gate the next page's visibility.
8. `triggerPageId` is required when `trigger === 'atPage'` and rejected otherwise, with a
   validation error naming the field.
9. New test `tests/integration/codeBlocks.firing.test.ts` asserts 1–7.
10. `npm run type-check` 0 errors · `npm run lint` clean · `npm run test:integration` green.

---

## CB-4 — Dependency ordering: topological execution and cycle detection ✅

> **Verified 2026-09-05 (reviewer).** ⚠️ **Reviewer-implemented, like CB-3** — same caveat:
> design calls were made and approved by one party. Mutation testing was again the
> compensating control, and both new behaviours were confirmed to fail without their fix
> (topological ordering → definition order breaks AC 1 and AC 4; removing save-time cycle
> detection breaks AC 3).
>
> **This ticket uncovered a pre-existing defect that made its own premise impossible.**
> `RunDefinitionProvider` builds a run's step list with `findByPageIds(pageIds, tx)`, and
> `includeVirtual` **defaults to `false`** — so the run definition omits virtual steps, and a
> Code Block's output lives on exactly such a step. A consumer resolving its inputs against
> the run definition could therefore never see its producer's output and sat at
> `skipped_unready` forever, **whatever order the blocks ran in**. Ordering alone would not
> have satisfied AC 1. First observed directly: producer `fired`, consumer `skipped_unready`
> with `pendingInputs: ['gross_total']`.
>
> Fixed **inside `CodeBlockService`** by resolving inputs against
> `findByWorkflowIdWithAliases` (which includes virtual steps), *not* by widening the run
> definition — that definition also feeds navigation, page validation, visibility and progress
> counts, so virtual steps would have leaked into `visibleSteps` and required-field validation.
> That fix required a second rule: **"not visible" counts as resolved-absent only for a real
> question logic has hidden.** A virtual step is never in the visible set by construction, so
> without an `isVirtual` guard every consumer would fire immediately with `null` where its
> producer's value belongs — the exact NaN-in-a-document failure these gates exist to prevent.
>
> **Cycles are rejected at save time against the whole workflow**, since a cycle is a property
> of the graph and never of one block alone; the block being saved is merged into its siblings
> before the check. At runtime a cycle can only mean a workflow saved *before* this check
> existed, so `resolveExecutionOrder` logs and falls back to definition order rather than
> throwing — failing closed there would take a live run down for an authoring mistake that was
> legal when it was made.
>
> **AC 5 needed no new code:** `steps_workflow_alias_unique` already refuses a second writer
> for one variable, which is what makes the one-writer-per-variable property (and therefore the
> static DAG) hold. The test asserts the **rejection** and that exactly one live step keeps the
> alias — not merely that the first save succeeded, which would pass with no constraint at all.
>
> Ordering rules (AC 2, 6) are proven **without a database** in
> `tests/unit/services/codeBlocks/CodeBlockGraph.test.ts`, including that a producer runs
> before its consumer even when the hand-set `order` integer says the opposite — the defect
> this ticket exists to remove — and that independent blocks come back in the same order
> regardless of input array order.
>
> Gates (reviewer-run): `type-check` 0 errors · `lint` 0 errors/warnings (`--max-warnings 0`,
> repo-wide) · `check:strict-zones` 6 zones / 11 files PASSED · `test:fast` **3744 passed**
> (3733 + 11 graph unit tests) · `test:integration` **143 files, 1315 passed | 3 skipped**
> (baseline 1310 + 5 new).

**Priority: P1** · Size: M · File: `server/services/codeBlocks/CodeBlockGraph.ts`

### Finding

Execution order is a hand-set integer. `transform_blocks.order` is
`integer("order").notNull().default(0)` and `executeAllForPhase` runs blocks in that order,
so if block B consumes block A's output the author must get the integers right by hand. When
they don't, B reads A's **previous** output and lags one page submit behind — silent, and
very hard to debug.

With CB-1's append-only rule this is fully solvable statically: every variable has exactly
one writer, so the block graph is a fixed DAG known at author time.

### Preferred fix

Build the graph from declared inputs/outputs (not by parsing code — CB-5 handles derivation)
and topologically sort it. Within one evaluation pass, run blocks in topological order and
**re-check the gates after each block writes**, so A firing makes B's hash change and B
fires in the *same* pass rather than a page later.

Detect cycles at **save time**, in the editor, not at runtime. Reject the save with an error
naming the cycle (`support_total → net_income → support_total`). There is no runtime
fixpoint iteration and no cycle-breaking heuristic — a saved workflow is acyclic by
construction.

The DB already helps: `steps_workflow_alias_unique` in `shared/schema/workflow.ts`

```ts
uniqueIndex("steps_workflow_alias_unique")
    .on(table.workflowId, sql`lower(${table.alias})`)
    .where(sql`${table.alias} IS NOT NULL AND ${table.alias} <> '' AND ${table.deletedAt} IS NULL`),
```

already makes two blocks declaring the same output alias impossible, which is what
guarantees the one-writer-per-variable property the graph depends on. Rely on it; CB-7 turns
its raw `23505` into a good message.

### Ties

- **Depends on CB-1, CB-2, CB-3.** Last ticket of Phase 1.
- Load **`run-tests`**.
- File footprint: `server/services/codeBlocks/CodeBlockGraph.ts` (new),
  `server/services/codeBlocks/CodeBlockService.ts`, `server/services/StepService.ts`
  (save-time validation).
- Collides with: CB-1, CB-2, CB-3.

### Vertical proof

- **Path:** block A outputs `gross_total`; block B declares `gross_total` as input and
  outputs `net_total`. One page submit that completes A's inputs must leave **both**
  `gross_total` and `net_total` written, in one pass. Then a save attempt where B's output is
  fed back as A's input → rejected with a cycle error, nothing persisted.
- **Real, not mocked:** the DB hop and the real sandbox for both blocks.
- **Cross-tenant denial:** graph construction is scoped to one workflow; assert a block in
  tenant B's workflow never enters tenant A's graph.
- **Suite:** `tests/integration/codeBlocks.graph.test.ts` (integration project, needs DB).

### Acceptance criteria

1. Chained blocks resolve in **one** evaluation pass — A's output is visible to B on the same
   submit that completed A's inputs, not the next one.
2. Execution order is derived topologically from declared inputs/outputs; the manual `order`
   integer no longer decides it.
3. A save creating a cycle is rejected with an error naming the variables in the cycle;
   nothing is persisted.
4. A three-deep chain (A→B→C) resolves in one pass.
5. Two blocks declaring the same output alias are rejected — the test must prove the
   rejection, not merely that one save succeeded.
6. Independent blocks with no shared variables execute in a stable, deterministic order.
7. New test `tests/integration/codeBlocks.graph.test.ts` asserts 1–6, and the cycle test
   proves the save fails **without** the fix in place.
8. `npm run type-check` 0 errors · `npm run lint` clean · `npm run test:integration` green.

---

## Phase 1 Gate ✅ PASSED 2026-09-05

- [x] CB-1..4 all ✅ with dated verification notes — `1b9db7fc`, `345976b9`, `95cefd81`, `ca1ae9fe`
- [x] `npm run type-check` → 0 errors
- [x] `npm run lint` → clean (`--max-warnings 0`, repo-wide) · `check:strict-zones` 6 zones / 11 files
- [x] `npm run test:integration` → **143 files, 1315 passed | 3 skipped**, run on `dev` at
      `ca1ae9fe` (Phase 1 start was 1284; +5 CB-1, +11 CB-2, +7 CB-3, +5 CB-4, +3 AN-1 = 1315)
- [x] `npm run test:fast` → **330 files, 3744 passed** (Phase 1 start 3718)
- [x] **Live proof (batched)** — driven over real HTTP against `npm run dev:test` on :5174,
      real sandbox, real database, fixtures torn down and the teardown proven (0 leftover):

      submit page 1 (2 of 3 inputs)   status=skipped_unready    pending=["num_children"]  hash=-         support_total=null
      submit page 2 (last input)      status=fired              pending=[]                hash=09084a7b  support_total=100
      submit page 3 (unrelated)       status=skipped_unchanged  pending=[]                hash=09084a7b  support_total=100
      resubmit page 1 (changed)       status=fired              pending=[]                hash=38fda175  support_total=200

      The arithmetic is discriminating, not incidental: (100+200)/3 = 100, then
      (400+200)/3 = 200, and the input hash moves **only** on the real change — the
      unrelated page-3 submit leaves it byte-identical, which is the change gate doing
      its job rather than a coincidence of equal values.
- [x] Reviewer has committed each passed ticket + this gate

### What Phase 1 cost, and what it bought

**Every defect that mattered lived at a seam, and none was caught by a targeted run.**
Three for three: the analytics `'draft'` insert (AN-1) swallowed by a `catch` so no test
ever failed; CB-3's resume deadlock, which surfaced only in the FULL suite as four 30-second
timeouts after every targeted run was green; and CB-4's discovery that
`RunDefinitionProvider` omits virtual steps, which made block-to-block chaining impossible
regardless of execution order — the feature's own premise, broken before the ticket started.

**Four ticket defects were found by devs, not by the reviewer who wrote them.** AC 3's
null-seed trap (CB-1), the 404-vs-403 error-contract error (CB-1), the CB-2/CB-3 boundary,
and CB-2's AC 8 instructing a `db:migrate` against a shared Neon branch. Each was raised as
a blocker rather than improvised around. **CB-3 and CB-4 were reviewer-implemented and had
no such independent check** — mutation testing substituted, and earned its place: four
mutations run, all caught, and one exposed a test (CB-3 AC 7) that passed for the wrong
reason. Phase 2 should return to dispatched devs.

**Anti-trap notes belong in the ticket, not the review.** Three separate criteria were
satisfiable by assertions that pass against completely broken code — key-presence against a
null-seeded map, a row count that is zero both before and after, and a stored value that is
identical whether a block re-ran or was skipped. Writing the trap into the acceptance
criterion cost minutes; catching it at review cost a round trip every time it was missed.

---

# Phase 2 — Authoring guarantees: the AST pass

Everything here reports **in the editor at save time**, never at runtime. All three tickets
extend a traversal that already runs on every save, so none of them adds a runtime cost.

## CB-5 — Derive inputs and outputs from the code ✅

> **Verified 2026-09-05 (reviewer).** Dispatched dev; all 10 criteria checked against the
> tree, not the turn-in report. Gates re-run by the reviewer: `type-check` 0 errors ·
> `lint` 0 (`--max-warnings 0`, repo-wide) · `check:strict-zones` 6 zones / 11 files ·
> `test:fast` **333 files, 3754 passed** (3744 + 10) · `test:integration` **144 files,
> 1319 passed | 3 skipped** (1315 + 4). Fail-then-pass proof supplied for AC 1, 2, 5 and 7.
>
> **AC 4's anti-trap was properly met.** The preserved input is `manual_only`, which appears
> nowhere in the code, and the test asserts `derivedInputs` equals `['a']` *before* the
> re-save — so the parser demonstrably cannot see it and the assertion fails if the
> preserve-author-edits logic is removed. It also pins `a` at `required: false` where
> derivation defaults to `required: true`, which catches author-wins on a key the parser
> *does* derive.
>
> **A cross-ticket semantic collision, found by the dev.** Derivation declares every
> literally-emitted key at save time, so CB-1's AC-4 fixture — which emitted an undeclared
> `surprise` — could no longer create its own precondition and the submit began succeeding.
> The behaviour CB-1 asserts (undeclared emitted key fails the block, names it, nulls the
> whole output set) **still holds**; only the fixture had to change, to a computed
> `[unexpectedKey]` emit the parser cannot derive. One code line plus a comment; every
> assertion in that test preserved.
>
> **Two consequences of derivation, recorded so they are not rediscovered as bugs:**
> 1. **The code is the source of truth for which output keys exist.** Deleting a derived
>    output re-adds it on the next save while its literal key remains in the code (returning
>    as `type: 'object'`, since the prior declaration is gone). Removing an output for good
>    means removing it from the code as well. Authors own output **types** and input
>    **required** flags; the parser owns the **key set**.
> 2. **CB-1's undeclared-output runtime guard is now reachable only for keys the parser
>    cannot derive** — dynamic emits. For literal emits it is unreachable by construction,
>    and a typo'd literal key (`emit({ totl: x })`) is now silently declared rather than
>    erroring. The protection moved from a runtime error to the author seeing the derived
>    list, which is exactly why AC 3 requires those fields rendered **editable** rather than
>    read-only. A deliberate trade, not a regression.
>
> **Deferred by reviewer ruling:** dynamic-access warnings are produced and returned from
> `ScriptEngine.validate()` but are not yet surfaced to the author. Delivery was declined for
> this ticket and belongs to **CB-8**, which rebuilds this editor as a Monaco modal — building
> the plumbing into the outgoing component would mean building it twice. **CB-8 must pick this
> up**, or the warnings become the produced-but-unconsumed dead-code pattern that cost this
> repo months once already (see CLAUDE.md convention 8, O-10). A new validation endpoint was
> also declined: the Vertical proof is derive-at-save then reload, so no route is needed.
>
> The dev raised **five** blockers across this ticket — footprint expansions and the CB-1
> collision — and was correct every time.

**Priority: P1** · Size: M · File: `server/services/scripting/ASTValidator.ts`

### Finding

The variable picker inserts a reference into the code but does not register it as an input.
`handleInsertVariable` in
`client/src/components/builder/questions/js-question/JSCodeEditorSection.tsx`:

```ts
// Insert the variable path with "input." prefix
const insertText = `input.${path}`;
const newCode = currentCode.substring(0, start) + insertText + currentCode.substring(end);
onChange({ code: newCode });
```

Nothing calls `onChange({ inputKeys: ... })`. Input keys are declared separately, in a
comma-separated text field parsed with `value.split(',')`. Because `ScriptEngine` copies
**only whitelisted keys**, picking a variable from the picker and forgetting to also type it
into the inputs box yields a silent `undefined` at runtime — with CB-2 in place it instead
yields a block that waits forever on an input it was never told about.

### Preferred fix

`ASTValidator` already walks the syntax tree on every save. Add two collectors to that
existing traversal:

- **Inputs** — every `input.X` member expression. This becomes the declared input list.
- **Outputs** — the keys of the object literal passed to `emit({ ... })`.

Present the derived lists in the editor as **populated but editable**: the author watches
them fill in, can flip an input to optional, can set an output's declared type, and can
hand-add a key the parser could not see. Auto-derive, do not auto-decide.

**Name the boundary honestly.** Dynamic access — `input[someKey]`, or `emit(obj)` where
`obj` is not an object literal — cannot be derived statically. Detect that case and surface
a warning telling the author to declare those keys manually, then get out of the way. Do
**not** guess, and do **not** block the save.

### Ties

- **Depends on Phase 1** (the config shape must exist). **Blocks CB-6** (same traversal).
- Load **`run-tests`**.
- File footprint: `server/services/scripting/ASTValidator.ts`,
  `server/services/scripting/ScriptEngine.ts` (expose derivation results on `validate()`),
  `client/src/components/builder/questions/js-question/JSCodeEditorSection.tsx`.
- Collides with: CB-6 (same file), CB-8 (same editor component).

### Vertical proof

- **Path:** author saves a block whose code reads `input.income_a` and calls
  `emit({ support_total })` → `ScriptEngine.validate()` returns the derived lists → the step
  API persists `inputs: [{key:'income_a',...}]` and `outputs: [{key:'support_total',...}]` →
  reopening the editor shows both, populated and editable.
- **Real, not mocked:** the AST traversal itself and the persistence hop. A test that stubs
  `ASTValidator` proves the stub works — this ticket *is* the validator change.
- **Cross-tenant denial:** validation is pure and tenant-free, but the save it feeds is not —
  assert saving the derived config against tenant B's workflow is refused.
- **Suite:** `tests/unit/services/scripting/astDerivation.test.ts` (derivation) plus
  `tests/integration/codeBlocks.derivation.test.ts` (persist + reload round trip, needs DB).

### Acceptance criteria

1. Saving code containing `input.a` and `input.b` derives exactly `['a','b']` as inputs.
2. `emit({ x: 1, y: 2 })` derives exactly `['x','y']` as outputs.
3. Derived lists are returned from `ScriptEngine.validate()` and rendered in the editor as
   editable fields, not read-only text.
4. An author-added input the parser did not find survives a re-save and is not overwritten
   by derivation.
5. `input[someKey]` produces a named dynamic-access warning, does **not** block the save, and
   does not silently produce an empty input list.
6. `emit(someVariable)` (non-literal) produces the same warning for outputs.
7. Nested member access (`input.a.b.c`) derives the top-level key `a` only.
8. New test `tests/unit/services/scripting/astDerivation.test.ts` asserts 1–7.
9. New test `tests/integration/codeBlocks.derivation.test.ts` proves the Vertical proof
   round trip: derived lists persist and reload unchanged, with the DB hop real.
10. `npm run type-check` 0 errors · `npm run lint` clean · `test:fast` + `test:integration` green.

---

## CB-6 — Impure helper detection forces `once` or `always` ✅

> **Verified 2026-09-05 (reviewer).** Dispatched dev; the dev's session ran out of context
> during the lint gate, so **every gate below was run by the reviewer** on the finished tree:
> `type-check` 0 · `lint` 0 (`--max-warnings 0`, repo-wide) · `check:strict-zones` 6 zones /
> 11 files · `test:fast` **334 files, 3795 passed** (3754 + 41 — the `describe.each` /
> `it.each` matrices multiply out) · `test:integration` **144 files, 1319 passed | 3 skipped**,
> unchanged from baseline because this ticket adds only unit tests. **No existing test file
> was modified**, so nothing could have been weakened.
>
> **The default-`repeat` trap was handled at the source, not just in tests.** `repeat` is
> optional and `resolveFiringPolicy` defaults it to `'onChange'`, so a check matching the
> literal string would let every block that omits the field — the common case — save impure
> and go silently stale. The guard reads `resolveFiringPolicy(config).repeat !== 'onChange'`,
> and the tests prove it with `describe.each(['onChange', undefined])` plus an explicit
> assertion that the omitted config genuinely lacks the property.
>
> **AC 5's vacuous-truth trap is closed:** the test asserts `IMPURE_HELPERS` is non-empty and
> contains the three required names *before* asserting every entry resolves to a real helper.
> `[].every(...)` is `true`, so the resolution check alone would pass with the catalog empty
> and detection entirely dead.
>
> **AC 6 goes beyond the criterion:** aliasing is covered for plain destructuring, *renamed*
> destructuring (`const { now: clock }`), *nested* destructuring, and `const { http: api }`.
> There is also a false-positive guard proving a user object with its own `now` method, a
> commented-out `random()`, and the string `"now()"` are all ignored.
>
> **The ticket's "DataVault via helpers" is not a gap — that surface does not exist.**
> `createHelperLibrary` exposes exactly `date`, `string`, `number`, `array`, `object`, `math`
> and `http`; there are no DataVault helpers to flag. `IMPURE_HELPERS` (`date.now`,
> `math.random`, `math.randomInt`, `http.get`, `http.post`) is therefore complete for what a
> block can actually call, and AC 5's resolution test would fail if a phantom entry were added.
>
> The rejection rides the existing error contract — `statusCode: 400`, which
> `classifyRouteError` honours directly — and names both the offending helpers and the two
> valid choices. It is wired into the create *and* update save paths.

**Priority: P1** · Size: S · File: `server/services/scripting/ASTValidator.ts`

### Finding

The change gate assumes a block is a **pure function of its declared inputs**. Three helpers
in `server/services/scripting/HelperLibrary.ts` break that assumption:

```ts
now: (): string => {
  return new Date().toISOString();
},
random: (min: number = 0, max: number = 1): number => {
  return Math.random() * (max - min) + min;
},
randomInt: (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
},
```

A block calling any of these under `repeat: 'onChange'` is skipped whenever its declared
inputs are unchanged, even though its result would differ — so the value silently goes
stale. The same applies to any block reading external state (DataVault via helpers): the
underlying data moves, the declared inputs don't, the hash doesn't change, the block never
re-runs.

### Preferred fix

Add one more visitor case to CB-5's traversal: flag calls to the known-impure helper set
(`now`, `random`, `randomInt`, plus any helper that reads external state — enumerate them in
one exported constant next to the helper library so the list cannot drift silently).

When a block is impure, **refuse to save it on `repeat: 'onChange'`** with an error
explaining the choice: `once` (compute and freeze — right for ids and timestamps) or
`always` (recompute every evaluation — right for external reads). This is deliberately a
hard save-time error rather than a warning: the failure it prevents is silent and shows up
in a generated document, not on screen.

### Ties

- **Depends on CB-5** (same traversal) and CB-3 (the `repeat` field must exist).
- Load **`run-tests`**.
- File footprint: `server/services/scripting/ASTValidator.ts`,
  `server/services/scripting/HelperLibrary.ts` (export the impure-helper constant),
  `server/services/StepService.ts` (save-time rejection).
- Collides with: CB-5 (same file).

### Acceptance criteria

1. A block calling `now()`, `random()` or `randomInt()` is detected as impure.
2. Saving an impure block with `repeat: 'onChange'` is rejected with an error naming the
   offending helper and the two valid choices.
3. The same block saves successfully with `repeat: 'once'` or `repeat: 'always'`.
4. A pure block is unaffected and saves on any `repeat` value.
5. The impure-helper list is a single exported constant colocated with `HelperLibrary`, and a
   test asserts every name in it resolves to a real helper (so the list cannot rot).
6. Detection survives aliasing through the helpers object (e.g. `helpers.now()` and a
   destructured `const { now } = helpers`).
7. New test `tests/unit/services/scripting/impureHelpers.test.ts` asserts 1–6.
8. `npm run type-check` 0 errors · `npm run lint` clean · `npm run test:fast` green.

---

## CB-7 — Append-only enforcement: good collision errors, retire `mutationMode` ✅

> **Verified 2026-09-06 (reviewer).** Dispatched dev; all 8 criteria checked against the
> tree. Gates re-run by the reviewer: `type-check` 0 · `lint` 0 (`--max-warnings 0`,
> repo-wide) · `check:strict-zones` 6 zones / 11 files · `test:fast` **334 files, 3801
> passed** (3795 + 6) · `test:integration` **145 files, 1328 passed | 3 skipped** (1319 + 9).
>
> **This ticket's Ties were wrong and are corrected here.** They claimed "Collides with:
> nothing in Phase 2 (different files from CB-5/CB-6)", but CB-7 and CB-6 both touch
> `server/services/StepService.ts`. CB-7 was therefore dispatched *after* CB-6 landed rather
> than in parallel, and builds on CB-6's `assertImpureRepeatPolicy` guard.
>
> **The `mutationMode` footprint was understated by seven files.** AC 6 demands a clean grep
> across `server/` and `shared/`, and there are **nine** source files, not the two listed:
> `lifecycleHooks.routes.ts`, `LifecycleHookService.ts`, `portability/entityGraph.ts`,
> `VersionService.ts`, `RunLifecycleService.ts`, `WorkflowClonerService.ts`,
> `WorkflowContentIngestService.ts`, `shared/schema/workflow.ts`, and
> `shared/types/scripting.ts` — plus three test files. (The reviewer's first enumeration
> capped the grep at `head -8` and reported eight as complete; the dev found the ninth. A
> truncated list presented as exhaustive is the same false-completeness this initiative keeps
> catching elsewhere.)
>
> **Historical migrations were correctly left alone.** `mutation_mode` also appears in
> `0000_init_baseline.sql` and ~42 `meta/*_snapshot.json` files. Those are records of the
> schema as it was and must never be edited — rewriting them is the drift that forced this
> repo's migration chain to be regenerated once already. `git status` on `migrations/` shows
> only `_journal.json` plus the two new `0044` files. The migration itself is one line:
> `ALTER TABLE "lifecycle_hooks" DROP COLUMN "mutation_mode";`
>
> **The Drizzle-wrapping trap was handled, not sidestepped.** A unique violation arrives as
> `DrizzleQueryError` with `.code` **undefined** and the real code on `err.cause.code`. The
> fail-then-pass proof also had to work harder than usual: ordinary base saves already
> returned a generic 400, so a naive "before" would have shown 400 both with and without the
> fix and proved nothing. The dev built a restore-after-alias-reuse path that reaches the
> database for real, producing `cause.code: "23505"`,
> `constraint: "steps_workflow_alias_unique"` before the fix and a named 400 after.
>
> **Two unlisted test files were touched and are legitimate:** `StepService.test.ts` and
> CB-6's `impureHelpers.test.ts` both needed their `db`/`tx` stubs taught to support nested
> transactions, because the collision check opens a savepoint. **No assertion changed in
> either file** — the diffs are the stub definitions only.

**Priority: P1** · Size: M · File: `server/services/StepService.ts`

### Finding

Two halves of the append-only rule are unenforced at the surface.

**(a) Collisions surface as a raw Postgres error.** The invariant itself is already
guaranteed — `steps_workflow_alias_unique` in `shared/schema/workflow.ts` is case-insensitive
and scoped to non-deleted steps — but a violation arrives as a Drizzle-wrapped `23505`. Note
the repo's own gotcha: a constraint violation arrives as `DrizzleQueryError` with `.code`
undefined; the code is on `err.cause.code`.

**(b) `mutationMode` contradicts the rule outright.** `lifecycle_hooks` carries:

```ts
mutationMode: boolean("mutation_mode").default(false),
```

which lets a hook overwrite existing values — precisely the thing append-only outlaws. Left
in place it is a second writer for variables that are supposed to have exactly one, which
silently invalidates the static dependency graph CB-4 depends on.

### Preferred fix

**(a)** Catch the unique violation at the service layer and convert it to a named error:
which alias collided, and what already owns it (another block's output, or a question). Read
`err.cause.code === '23505'` (the unique-violation code), not `err.code` — Drizzle wraps it. Also validate before the write so
the common case is a clean message rather than a caught exception: a block's declared outputs
may not collide with any existing step alias in the workflow, including another block's.

**(b)** Retire `mutationMode`: remove the column (migration, load **`db-schema-change`**),
remove the branch in `LifecycleHookService`, and confirm no stored hook depends on it. The
repo's DBs hold only test data (confirmed with the repo owner 2026-09-04), so this is a
removal, not a migration of live rows — but verify against the dev branch before dropping.

### Ties

- **Depends on Phase 1.** Independent of CB-5/CB-6 — **dispatch in parallel with them.**
- Load **`db-schema-change`** (column drop) and **`run-tests`**.
- File footprint: `server/services/StepService.ts`,
  `server/services/scripting/LifecycleHookService.ts`, `shared/schema/workflow.ts`,
  `migrations/0044_*.sql`.
- Collides with: nothing in Phase 2 (different files from CB-5/CB-6).

### Vertical proof

- **Path:** save block A with output `total` → succeeds. Save block B also declaring `total`
  → rejected with a message naming `total` and identifying block A as the owner; no `steps`
  row written for B's output. Then a question aliased `total` → same rejection.
- **Real, not mocked:** the DB hop. The unique index is the thing under test; mocking the
  repository voids this proof.
- **Cross-tenant denial:** an alias used in tenant B's workflow does **not** collide in
  tenant A's — the index is scoped by `workflowId`; assert both workflows can use `total`.
- **Suite:** `tests/integration/codeBlocks.aliasCollision.test.ts` (integration, needs DB).

### Acceptance criteria

1. Two blocks declaring the same output alias: the second is rejected with an error naming
   the alias and its current owner — not a raw `23505` and not a 500.
2. A block output colliding with an existing question's alias is rejected the same way.
3. Collision detection is case-insensitive, matching the index's `lower(alias)`.
4. A soft-deleted step's alias is reusable immediately (the index's `deleted_at IS NULL` scope).
5. The same alias in two *different* workflows does not collide.
6. `mutationMode` is gone: column dropped by migration, no references remain in
   `server/` or `shared/` (grep clean), and `LifecycleHookService` no longer branches on it.
7. New test `tests/integration/codeBlocks.aliasCollision.test.ts` asserts 1–5, and proves the
   rejection path fails **without** the fix (raw error) to show the test is not vacuous.
8. `npm run type-check` 0 errors · `npm run lint` clean · `npm run test:integration` green.

---

## Phase 2 Gate ✅ PASSED 2026-09-06

All items re-measured on `dev` at `33447a46` after the merge, not carried over from the
worktrees — the gate's claim is about the merged branch.

- [x] CB-5, CB-6, CB-7 all ✅ with dated verification notes — `e04228bb`, `b168a1d5`, `33447a46`
- [x] `npm run type-check` → 0 errors · `npm run lint` → clean (`--max-warnings 0`, repo-wide)
- [x] `npm run test:fast` → **334 files, 3801 passed** · `npm run test:integration` →
      **145 files, 1328 passed | 3 skipped** (Phase 2 start: 3754 / 1319)
- [x] `grep -rn "mutationMode" server/ shared/` → **0 results**
- [x] Reviewer has committed each passed ticket + this gate

### Carried into Phase 3 — do not lose these

**CB-8 inherits CB-5's undelivered warnings.** CB-5 produces dynamic-access warnings and
returns them from `ScriptEngine.validate()`, but nothing surfaces them to the author. The
reviewer declined delivery inside CB-5 because CB-8 rebuilds this editor as a Monaco modal
and the plumbing would have been built twice — so **CB-8 must render them**, or they become
the produced-but-unconsumed dead-code pattern that CLAUDE.md convention 8 exists to prevent
(a store setter nobody called sat unused for months). A new validation endpoint was also
declined for CB-5: the proof path is derive-at-save then reload, so no route was needed —
but CB-8 adds `POST /api/steps/:stepId/code-block/test` anyway, which is the natural home
for live feedback.

**Ties sections have been wrong twice, in the same way.** CB-7 claimed "collides with
nothing in Phase 2" while sharing `StepService.ts` with CB-6, and its `mutationMode`
footprint listed two files where nine existed. Before dispatching CB-8 and CB-9 as
"parallel — disjoint files", verify that against the tree rather than the ticket.

### What Phase 2 cost, and what it bought

**Six blockers were raised by dispatched devs, and all six were correct** — three footprint
expansions the tickets had understated, the CB-1/CB-5 semantic collision, the ninth
`mutationMode` file the reviewer's truncated grep missed, and a generated-metadata question.
Phase 1's lesson held: the ticket author is the worst judge of the ticket's completeness.

**Anti-trap notes written into the dispatch worked.** Every one flagged in advance was met on
the first attempt — CB-5's AC 4 (an input the parser genuinely cannot derive), CB-6's
vacuous-truth catalog check (`[].every(...)` is `true`) and its default-`repeat` correctness
bug, and CB-7's `err.cause.code` Drizzle wrapping. Phase 1 caught these at review, one round
trip each; Phase 2 caught them before a line was written.

**The fail-then-pass requirement earned its keep in CB-7.** Ordinary saves already returned a
generic 400, so a naive "before" would have been 400 in both directions and proved nothing.
Getting genuine evidence required constructing a path that actually reaches the database.

---

# Phase 3 — Surfaces: editor and inspector

**CB-9 is blocked on CB-9a.** Complete and review the preview execution prerequisite
before resuming the inspector. CB-8 may continue in its own worktree, but coordinate
`server/routes/codeBlocks.routes.ts` and `server/routes/index.ts`: these are shared
registration surfaces, not disjoint files. Keep registration edits minimal; the reviewer
resolves merge conflicts. Load `design` before browser-visible changes. Only one may
run DB-backed suites at a time.

## CB-8 — Monaco code editor modal ✅

> **Verified 2026-09-06 (reviewer).** Gates re-run by the reviewer, not taken from the report:
> `type-check` 0 · `lint` 0 (`--max-warnings 0`, repo-wide) · `check:strict-zones` 6 zones /
> 11 files · `test:fast` **335 files, 3811 passed** (3801 + 10) · `test:integration`
> **146 files, 1341 passed | 3 skipped** (1328 + 13).
>
> **AC 10's live proof was inspected, not just counted.** Six screenshots (light/dark pairs of
> the modal, the inline-error state, and the final state) landed in the main checkout's
> `.playwright-mcp/` — as the `verify` skill warns happens from a worktree. The inline-error
> shot shows Monaco with syntax highlighting, an INPUTS panel of 3 derived keys with working
> required/optional toggles, an OUTPUTS panel of 3 with type dropdowns, the test-run panel,
> the firing controls, and a real save error rendered against the outputs field:
> *"Output alias 'orderTotalBlock' is already in use by this block's own step alias."*
>
> **Discharges CB-5's deferred debt.** The dynamic-access warnings `ScriptEngine.validate()`
> has always returned now reach the author against the inputs/outputs panels. The Phase 2
> Gate recorded this as CB-8's obligation; it is met, so those warnings are no longer
> produced-but-unconsumed dead code.
>
> **Process deviations, recorded rather than waved through:**
> - **The dev committed the work itself**, which hard rule 7 forbids — the reviewer commits.
>   The commit was well-formed and its content verified, so history was not rewritten; the
>   ✅ note was folded into it by amend rather than adding a second commit.
> - **Six files outside the declared footprint were touched without asking**, unlike CB-5/6/7.
>   All were checked and are defensible: `CodeBlockService.ts` (the test endpoint's service
>   layer), `JSBlockEditor.tsx` and `JsQuestionCardEditor.tsx` (the modal replaces inline
>   editing, so their save paths had to change), `server/routes/index.ts` (registration is
>   mechanically required by adding a route), `docs/claude/API_ENDPOINTS.md` (CLAUDE.md
>   *requires* keeping it in sync when an endpoint is added), and CB-5's
>   `astDerivation.test.ts`.
> - **CB-5's test was updated, not weakened.** CB-8 moved those controls out of
>   `JSCodeEditorSection` into `CodeBlockPanels`, so the test renders the new components. The
>   property CB-5's AC 3 protects is intact, including `not.toContain('readOnly')` — a derived
>   key must render as an editable field, never a label.
>
> **Two behaviour changes outside CB-8's criteria, both deliberate and both worth knowing:**
> 1. `validateForSave`'s script-validation throw is now tagged `statusCode: 400`. Untagged it
>    fell through `classifyRouteError` to a 500 with the generic "Failed to update step",
>    which told an author with a syntax error nothing. This changes an error contract.
> 2. **`JSQuestionEditor` and the step card lose their onChange-per-keystroke save.** The modal
>    owns an awaitable save instead, because a fire-and-forget mutation has nowhere to put a
>    rejection message and keeping both would double-write. Sound reasoning, but it changes how
>    Code Blocks are edited and was not asked for.
>
> **Monaco is loaded from the local package**, not `@monaco-editor/react`'s default CDN loader,
> which fetches a different pinned version at runtime and fails on a locked-down network. It
> sits behind `React.lazy` and follows the app's `dark` class via a `MutationObserver` rather
> than a prop, because that class changes under a mounted editor.

**Priority: P1** · Size: M · File: `client/src/components/blocks/js-editor/JSCodeEditor.tsx`

### Finding

The code editor is a plain textarea. `JSCodeEditor` renders:

```tsx
<Textarea
    ref={textareaRef}
    value={code}
    onChange={(e) => onChange(e.target.value)}
    placeholder="// Example:\n// return { fullName: input.firstName + ' ' + input.lastName };..."
    className="font-mono text-sm h-64 resize-none"
/>
```

No syntax highlighting, no bracket matching, no error gutter, no autocomplete. Meanwhile
**`monaco-editor` and `@monaco-editor/react` are both already in `package.json`**, and
`grep -rn "@monaco-editor/react" client/src` returns **zero** results. The dependency is paid
for and entirely unused. Note also the placeholder is wrong — it shows `return {...}` while
the runtime requires `emit(...)`.

### Preferred fix

Replace the textarea with Monaco in a proper editing modal. Load the **`design`** skill first.

The modal is the authoring surface the whole initiative points at, so it carries:

- Monaco, JS mode, dark/light following the app theme.
- The **inputs** panel — CB-5's derived list, editable, each row with a required/optional toggle.
- The **outputs** panel — CB-5's derived list, editable, each row with a declared type dropdown.
- The **firing** controls — CB-3's two dropdowns (trigger, repeat), with `triggerPageId` shown
  only for `atPage`.
- A **test** panel backed by a **new** `POST /api/steps/:stepId/code-block/test` endpoint,
  seeded with last-run data where available. Use `POST /api/transform-blocks/:blockId/test`
  in `server/routes/transformBlocks.routes.ts` as the donor pattern — same `hybridAuth` +
  `testLimiter` (10/min) shape — but write a new route: CB-10 deletes the transform one.
  Load the **`add-api-endpoint`** skill for the route/service/repository split and the
  error-string contract.
- Save-time errors from CB-5/CB-6/CB-7 rendered inline against the offending field, not as a
  toast: the cycle error, the impure-helper rejection, the alias collision, the dynamic-access
  warning.

Fix the placeholder to use `emit()`. Delete `JSCodeEditor`'s textarea path rather than leaving
it behind a flag.

### Ties

- **Depends on Phase 1 + Phase 2** (it renders their config and their errors).
- **Parallel with CB-9** — disjoint files.
- Load the **`design`** skill (mandatory for UI work), **`add-api-endpoint`** (new test
  route), and **`run-tests`**.
- File footprint: `server/routes/codeBlocks.routes.ts` (new),
  `client/src/components/blocks/js-editor/*`,
  `client/src/components/builder/questions/js-question/*`,
  `client/src/components/builder/questions/JSQuestionEditor.tsx`.
- Collides with: CB-5 (touches `JSCodeEditorSection.tsx` — CB-5 lands first).

### Vertical proof

- **Path:** open the modal on a saved Code Block → type code → the test panel POSTs to
  `POST /api/steps/:stepId/code-block/test` → the real `ScriptEngine` executes it → the
  emitted object renders in the panel. Then save a block whose code creates a cycle → the
  CB-4 error renders inline against the outputs field, and nothing persists.
- **Real, not mocked:** the new route and the sandbox execution behind it. Stubbing the
  endpoint proves only that the panel renders a fixture.
- **Cross-tenant denial:** the test endpoint called with a step id in tenant B's workflow →
  404, no execution performed.
- **Suite:** `tests/integration/codeBlocks.testEndpoint.test.ts` (route + sandbox + denial)
  and `tests/unit/client/codeBlockEditor.test.tsx` (render).

### Acceptance criteria

1. Monaco replaces the textarea; `@monaco-editor/react` is imported and the old textarea path
   is deleted, not disabled.
2. The editor follows the app's light/dark theme.
3. Inputs panel lists CB-5's derived keys, each with a working required/optional toggle that
   persists.
4. Outputs panel lists CB-5's derived keys, each with a working type dropdown that persists.
5. Trigger and repeat dropdowns persist; `triggerPageId` appears only for `atPage` and is
   required there.
6. The test panel executes the block against sample data via the new
   `POST /api/steps/:stepId/code-block/test` endpoint and shows the emitted object or the
   error; the endpoint is rate-limited and refuses a step in another tenant.
7. Save-time errors from CB-5, CB-6 and CB-7 render inline against the relevant field.
8. The placeholder/example code uses `emit(...)`, not `return {...}`.
9. New tests: `tests/unit/client/codeBlockEditor.test.tsx` asserts 3–5 and 7;
   `tests/integration/codeBlocks.testEndpoint.test.ts` asserts 6 including the cross-tenant
   denial, with the sandbox hop real.
10. **Live proof required:** screenshots of the modal in light and dark, showing a derived
    input list and one inline save error. "It should work" is not evidence.
11. `npm run type-check` 0 errors · `npm run lint` clean · `npm run test:fast` green.

---

## CB-9a — Server-backed preview execution 🔲

**Priority: P1 · Prerequisite for CB-9 · Size: L**

> **Approved direction, 2026-09-06:** preview uses the ordinary server execution engine,
> with explicit isolation for preview data and side effects. This is a prerequisite
> implementation ticket, not approval to mark CB-9 complete with a read-only panel.
> CB-9 remains paused; no runtime code was changed during prerequisite planning.

### Finding

Verified at base `12b2ff65`:

- `useRunNavigationTransport` in `client/src/hooks/runner/useRunNavigation.ts` advances
  preview locally. `saveBeforeLeavingPage` does nothing; it only bulk-saves answers when
  entering a final-document page. Ordinary preview Next never calls server submit.
- `client/src/hooks/runner/useRunValues.ts` disables autosave for preview.
- `client/src/hooks/runner/useRunSession.ts` disables server runtime reads for preview.
- `PreviewRunner.tsx` creates an ordinary run for documents, while answers and navigation
  continue in `PreviewEnvironment`. Reset clears local state without replacing that run.
- `RunExecutionCoordinator` already accepts `mode: 'live' | 'preview'` and passes it to
  `BlockRunner`, but the current `RunService` submit/next call sites supply `live`.
  An execution-mode argument alone is not evidence of end-to-end preview isolation.

Consequently, CB-9's proposed read endpoint cannot observe changes that preview never
executes. A second background submission process solely for the inspector would leave
client navigation and server execution disagreeing.

### Execution/isolation audit — 2026-09-06

**Readiness verdict: do not enable server-backed preview yet.** Source inspection found
missing durable identity, incomplete effect isolation, and duplicate execution boundaries.
This is a static audit of base `12b2ff65`, not a claim of passing runtime tests. No
application code, database rows, external services, or running processes were changed.

| Boundary | Verified path and current behavior | Required implementation |
|---|---|---|
| Create/access | `RunService.createRun` chooses the published/pinned version when present; otherwise pins a draft. `RunAuthResolver.resolveRun` always returns `live`. `shared/schema/run.ts` has no dedicated preview mode/retirement fields. | Persist server-owned mode and lifecycle fields on the existing run model; author preview must pin the current draft rather than silently preview the published version. |
| Untrusted metadata | `server/routes/runs.routes.ts` accepts `metadata` and forwards it to creation. | Do not trust `metadata.preview`; use dedicated fields omitted from ordinary request schemas. Reject promotion through every ordinary run access path. |
| Submit/next | `RunExecutionCoordinator.submitPage` and `.next` both call `evaluateAll(..., 'submit', ...)`; client ordinary transport issues submit then next. | One logical submission owns evaluation and navigation. A second evaluation changes `fired` to `skipped_unchanged` or fires `always` twice. Preserve standalone next compatibility explicitly. |
| Code Blocks | `CodeBlockService.evaluate` checks readiness and persists output/state; `execute` delegates to `ScriptEngine`. | Reuse these rules. Add submission serialization/replay handling outside the block hash gate; a hash is not request idempotency. |
| Native writes | `WriteBlockRunner` forwards preview to `server/lib/writes/WriteRunner.ts`, whose preview branch validates and returns before writing. | Reuse and test this adapter; expose the simulated outcome in the response. Its fixed `preview-simulated-id` is not evidence that later reads can observe simulated writes. |
| External sends | `ExternalSendBlockRunner` forwards mode to `server/lib/external/ExternalSendRunner.ts`; preview returns simulated data before fetch. | Reuse the branch and preserve its `simulated` marker through the block result (currently the wrapper drops that marker). |
| Collection writes | `CollectionBlockRunner` routes create/update/delete to `RecordService` without testing mode. | Add a preview boundary before record mutations. Until a coherent simulation exists, report unsupported behavior explicitly; never fake successful downstream read-after-write parity. |
| Queries/reads | `QueryBlockRunner` uses tenant-scoped query execution; separate read-table/find-record runners exist. | Preserve authorized reads. Define simulations that cannot be mistaken for real records; do not build a shadow database as an incidental inspector dependency. |
| Hooks/scripts | `BlockRunner.runPhase` calls lifecycle hooks and legacy transforms without forwarding mode. `HelperLibrary` HTTP get/post currently throw unimplemented errors. `enhancedSandboxExecutor` builds the default helper library itself when console capture is enabled. | Propagate server-owned policy through script entry points. Do not claim HTTP currently sends traffic or enable new helpers. Do not rely on an injected helper override that the executor replaces; test the actual sandbox path. |
| Start/completion | `RunLifecycleService.executeOnRunStart` and `RunCompletionService.complete` call `BlockRunner` without mode. Completion marks the run and enqueues durable document work. | Derive mode from persisted identity at both boundaries; keep validation/trigger rules shared. |
| Queued documents | `RunCompletionJobWorker` calls `RunLifecycleService.generateDocuments(runId)`. That service evaluates `runComplete`, executes final/document hooks, persists artifacts, and calls `DocumentDeliveryService.enqueueDeliveriesForRun`. Neither delivery service nor lifecycle path has a preview branch. | Worker and explicit generate endpoint must resolve the same persisted policy; render isolated artifacts, suppress delivery enqueue, and recheck retirement before committing results. Rendering success must not become delivery permission. |
| Signature action | Browser signature component simulates preview locally. `/api/esign/execute/:runId/:stepId` calls `SignatureBlockService` without its optional preview argument, which defaults false. | The service must derive preview policy from the run; a UI prop is insufficient protection against direct requests. Preserve the existing provider preview capability after validating its behavior. |
| Resume/handoff/share | `RunResumeService` issues credentials and calls `sendRunResumeEmail`; ordinary run routes expose resume links, handoff, and share. | Reject these live distribution actions for preview sessions at the server boundary. Do not produce usable public preview credentials. |
| Counts/metrics | `WorkflowRunRepository.findByWorkflowIds`, `countByWorkflowIds`, and completed-run finder include all runs. `RunMetricsService` supplies `isPreview: false`; `AnalyticsService.recordEvent` already skips correctly marked preview events. | Exclude previews in ordinary reads/counts and propagate mode to existing metrics filtering; enumerate other direct run aggregates during implementation. |
| Cleanup | `RunStateService.deleteGeneratedDocuments` delegates to a repository row deletion. No preview-session expiry/retirement mechanism was found in the inspected run services/schema. | Add bounded expiry/retirement cleanup and storage-object ownership tracking; deleting document rows alone does not prove blob deletion. Coordinate retirement with worker leases and active submits. |

**Selected direction:** extend the existing run model with explicit mode and lifecycle
fields; reuse version pinning, the coordinator, query hooks, and existing simulation
branches. Add a durable logical-submission identity/replay boundary. Do not add a second
run-table family, mirror values in `PreviewEnvironment`, or turn on server preview behind
only a browser flag. Exact migration and request schemas belong to implementation review.

**Audit limits:** no live effects were exercised. The rows above identify concrete
reachable dispatchers, not a proof that every possible provider is isolated. Implementation
must finish the provider-boundary inventory (including storage and delivery workers),
exercise it with spies, and search direct `workflow_runs` aggregates before enabling UI.
Ordinary behavior must retain regression coverage throughout.

### Post-CB-8 scope recheck — 2026-09-06

The assigned `cb-9` worktree now points to `f5e0dc60` (CB-8), directly after
`12b2ff65`. No merge is in progress and no unmerged paths exist. The only local change
is this ticket document; Vitest still resolves. This is a dependency-resolution check,
not a fresh test-suite baseline or verification of CB-8's implementation.

- `server/routes/codeBlocks.routes.ts` now exists and exports `registerCodeBlockRoutes`.
  It serves `POST /api/steps/:stepId/code-block/test` with authenticated authoring access,
  rate limiting, validation, and the service's `testBlock` method.
- `server/routes/index.ts` already imports and registers that function. CB-9 should add
  its run-state read route inside the existing module, with **no additional registration**.
- `CodeBlockService` now has `testBlock`, `loadBlockForAuthoring`, and injected page/access
  dependencies. Preserve those changes when adding the later run-state read. The sample
  execution endpoint is not a preview-session submission or a persisted block-state API.
- `CodeBlockRunRepository` has no CB-8 changes; `findByRunId` is still needed for CB-9.
- The CB-8 commit did not change preview hooks, run identity, the execution coordinator,
  completion/delivery, or the other audited isolation boundaries. The audit verdict and
  sequential CB-9a-1 → CB-9a-2 → CB-9a-3 scope therefore remain in effect.
- Start implementation with CB-9a-1, not the inspector or CB-8's editor. Measure new
  fast/integration baselines on `f5e0dc60` before code edits; do not use the original
  3801/1328 counts as evidence of the updated tree's baseline.

### Sequential implementation tickets (CB-9a umbrella)

The audit found enough missing infrastructure to split implementation before coding.
These are sequential review units, not parallel assignments. All inherit this ticket's
skills, local-only proof, gates, and no-commit rules. CB-9a is complete only after all three
units and the parent acceptance criteria pass. Do not enable the client after unit 1 or 2.

**CB-9a-1 — Persist preview identity and isolate its lifecycle (open).**

- Own existing run schema/repository, creation/auth, metrics/count filtering, retirement
  cleanup, and the effect boundaries named in the audit. Mechanically required migrations,
  journal/snapshot entries, shared types, and registrations are included.
- Acceptance: server-owned immutable mode; authorized author-only creation from a pinned
  draft; ordinary paths cannot promote/distribute preview sessions; simulation or explicit
  unsupported outcomes for mutations; no provider calls or delivery jobs from preview;
  queued work reloads mode; finite expiry and cleanup preserve live runs and active previews.
- Add `tests/integration/preview.isolation.test.ts`: real HTTP/DB dispatch, cross-tenant
  and same-tenant denial with no data, forged metadata/mode attempts, provider-spy ordinary
  controls, retirement/worker race coverage, and artifact cleanup proof. Prove reset can
  retire a run without changing ordinary run behavior. No preview UI activation.
- Parent criteria covered: 1, 4, 6 and the server foundations of 5. Acceptance 4 requires
  provider-boundary tests before claiming isolation; static searches are not sufficient.

**CB-9a-2 — Make preview submissions authoritative and replay-safe (open; after 9a-1).**

- Own `RunExecutionCoordinator`, existing run persistence/service/route contracts, and
  definition resolution. Reuse the identity/policy from 9a-1; no new preview execution engine.
- Acceptance: one logical submit returns committed answers, computed values, block states,
  and authoritative navigation; serialized duplicate/retry requests cannot double-evaluate
  `always` blocks or completion; a new intentional submit still obeys its repeat policy.
  Explicitly handle lost responses and crash/retry behavior rather than promising exactly
  once from a client-side pending flag. Separate navigation-only moves from execution.
- Add `tests/integration/preview.execution.test.ts`: three-page row/value transitions,
  paired pure ordinary/preview scenarios, invalid submit, concurrent duplicate requests,
  lost-response replay, computed navigation, start/completion triggers, and frozen draft
  behavior. Guard the existing standalone next contract; fix duplicate evaluation at the
  shared logical-operation boundary rather than changing the meaning of `onChange`.
- Parent criteria covered: server portions of 2, 3, 5. Report any parity discrepancy that
  requires a separate ordinary-run behavior change before expanding that change.

**CB-9a-3 — Connect the preview UI and prove the complete experience (open; after 9a-2).**

- Own `PreviewRunner`, existing runner session/value/navigation hooks, preview adapters,
  and mechanically required query/runtime types. Remove replaced local execution state;
  retain presentation state and unsaved input drafts only.
- Acceptance: use the server session throughout; apply results only to the active session;
  preserve edits on failure; reset/snapshot load retire and replace sessions; ignore late
  responses; restart on definition change; preserve every tool in parent criterion 7.
- Add `tests/unit/client/previewExecution.test.tsx` for submit/retry, stale responses,
  reset/snapshot replacement, restart, and tools. Extend the prerequisite integration
  suite for UI-driven contracts if needed. Complete desktop/mobile browser proof and
  fixture cleanup; prove simulated actions are visibly labeled.
- Parent criteria covered: client portions of 2 and 5, plus 7–10. Re-run all parent
  acceptance checks and gates after final integration. Then reviewer verifies/commits the
  umbrella completion before CB-9 resumes with fresh baselines.

### Preferred fix and boundaries

Make preview a server-owned execution session using the existing coordinator, validation,
readiness/change gates, visibility logic, and run-definition provider. The browser owns
unsaved edits and presentation; persisted answers, computed outputs, block state, and
navigation come from the server through query hooks. Do not mirror server state into a
UI store or maintain a second execution engine.

Use an explicit, server-established preview identity that survives subsequent requests
and queued work. Authorize creation and access against the workflow and tenant. Ordinary
run credentials or a caller-supplied mode flag must not switch a session's execution mode.
Reuse existing persistence and preview adapters where they satisfy these requirements;
do not introduce a parallel run-table family by default.

Before implementation, trace start, submit, next, complete, background jobs, and all
reachable side-effect dispatchers. Record a concrete execution/isolation map in this
ticket's verification notes. Preview evaluates pure code and ordinary workflow rules,
while outbound actions use existing preview adapters or explicit simulated results.
Unsupported external actions must report that limitation visibly, never silently execute
live. Document rendering may produce preview-only artifacts; delivery, external writes,
email, and signature requests must remain simulated. The policy applies to script helpers
and queued completion work as well as visible blocks.

Use a stable definition for a preview session. A builder definition change requires an
explicit restart; do not silently combine new steps with old execution hashes. Reset and
snapshot loading create fresh execution state. Preserve existing preview tools, including
page auto-fill, full-workflow auto-fill, document preview, and section navigation, through
the shared submission path. Do not turn rail/back navigation into a submit.

**Out of scope:** the variables inspector UI/read endpoint (CB-9), Monaco work (CB-8),
new integration providers, production execution redesign, and a general analytics rewrite.
If the side-effect audit requires a broader architectural change, stop with the exact
missing boundary and split that work before enabling server-backed preview.

### Ties and implementation footprint

- Depends on the completed Phase 2 Gate; blocks CB-9 and the Phase 3 Gate.
- Read `add-api-endpoint`, `run-tests`, `verify`, and `design`; read `db-schema-change`
  before any persistence marker or lifecycle migration.
- Client responsibility: `client/src/components/preview/PreviewRunner.tsx`,
  `client/src/hooks/runner/useRunSession.ts`, `useRunNavigation.ts`, `useRunValues.ts`,
  and the existing `client/src/lib/previewRunner/` adapters. Follow existing query hooks.
- Server responsibility: existing preview/run routes, `RunService`,
  `server/services/runs/RunExecutionCoordinator.ts`, run persistence/definition handling,
  and the completion/side-effect boundaries identified by the audit. Schema metadata,
  route registration, and shared types mechanically required by the implementation are
  included. A new service or different architecture remains a decision to review.
- Tests owned by this prerequisite: `tests/integration/preview.isolation.test.ts`,
  `tests/integration/preview.execution.test.ts`, and `tests/unit/client/previewExecution.test.tsx`. Do not repurpose CB-9's named tests or
  change CB-8's tests. If a regression requires another ticket's tests, identify it first.
- Work sequentially with CB-9 in an isolated worktree and local test database. Establish
  fresh suite baselines on the actual implementation base; CB-9's original baselines
  cannot be reused after this prerequisite lands.

### Acceptance criteria (umbrella gate; owned by the units above)

1. **Identity and authorization:** an authenticated workflow author can create and use a
   preview session. Missing authentication, malformed requests, cross-tenant access, and
   unauthorized same-tenant access are denied. Denial bodies contain no run/answer/block
   data. Ordinary run paths cannot bypass preview isolation or promote a preview to live.
2. **One execution path:** preview Next persists the validated current-page answers,
   executes the shared engine, and applies server-authoritative values and navigation.
   A failed request leaves the user on the page with edits intact and a retryable error.
   Prevent duplicate in-flight submits; prove a retry of the same submission cannot
   double-fire `always` blocks or completion actions. Back/rail moves remain non-submits.
3. **Execution parity:** a real three-page fixture yields `skipped_unready` with
   `pending_inputs = ['num_children']` after page 1, `fired` with the expected output
   after page 2, and `skipped_unchanged` after page 3. Assert persisted rows and returned
   values at each boundary. Submit plus navigation must not reevaluate the same logical
   submission and erase its fired result before the client can read it. Compare a preview
   and an ordinary run for identical pure inputs: values, readiness, block errors,
   visibility, and next-page decisions match. Include computed-output-driven navigation
   and `runStart`/`runComplete` trigger coverage.
4. **Side-effect isolation:** using real execution dispatch with provider-boundary spies,
   prove zero live delivery/external-write calls during preview start, submit, navigation,
   completion, and queued work. Cover each reachable effect family in the audit map,
   including script helpers. Assert simulated/unsupported outcomes are visible. A paired
   ordinary-run control reaches the provider spy, proving the guard did not disable live
   behavior. Never use real external services for this proof.
5. **Fresh state:** reset and snapshot load create a fresh execution session; old answers,
   hashes, fired timestamps, errors, visited pages, and pending requests cannot contaminate
   it. Snapshot answers hydrate ordinary inputs, while computed values are recomputed by
   the engine. Late responses from the retired session are ignored. A definition change
   prompts restart and cannot silently alter an active session's definition.
6. **Lifecycle and isolation:** preview records/artifacts are distinguishable from real
   submissions and excluded from ordinary submission lists and business counts. Exit
   retires the session; abandoned sessions have a documented finite expiry and cleanup
   mechanism. Test cleanup of only expired/retired preview fixtures, including dependent
   values/block states/artifacts; preserve active previews and ordinary runs. Cleanup
   cannot race a live request or pending job into recreating retired preview data.
7. **Existing tools:** page fill, full-workflow fill, snapshot load, reset, section/back
   navigation, and document preview still function. Full-workflow fill submits through
   the shared engine rather than jumping directly to the end. Loading, failed creation,
   submit failure, expiry, and unsupported-action states have useful visible feedback.
8. **Named tests:** all three prerequisite test files named above exist and pass with discriminating
   assertions covering 1–7. Server tests use the real local database/HTTP execution path;
   client tests drive submit, failure/retry, reset, and stale-response behavior rather
   than supplying final state to the component under test.
9. **Live proof:** start the worktree's own server and verify it serves the edited source.
   Drive the three-page fixture in a real browser and capture UI plus the corresponding
   real response/row evidence at all three boundaries. Exercise reset, snapshot loading,
   and one simulated external action. Save evidence under an explicit `.playwright-mcp/`
   path; inspect desktop/mobile layout and console errors. CB-9 separately supplies the
   final inspector screenshots; this ticket does not pretend that panel already exists.
10. **Gates and handoff:** type-check, lint, strict-zone checks, `test:fast`, and
    `test:integration` pass after the last edit, with no count decrease against the measured
    base. Report exact files, output, count arithmetic, cleanup proof, evidence paths,
    execution/isolation map, and deviations. Leave changes unstaged and uncommitted for
    reviewer approval. The reviewer verifies and commits CB-9a before dispatching CB-9.

### Vertical proof

Create isolated tenant-owned preview and ordinary-run fixtures against the local test
DB. Submit the same pure three-page scenario through their real HTTP routes and compare
execution results after each logical submit. Drive the preview in the browser; reconcile
its displayed values/navigation with persisted rows. Exercise a simulated external action
through the real dispatcher, and cross-tenant denial through HTTP. Delete only the created
fixtures in `finally` and prove no named fixtures remain. No production testing.

---

## CB-9 — Preview variable inspector 🔲 (blocked on CB-9a)

**Priority: P1** · Size: M · File: `client/src/components/preview/DevToolbar.tsx`

### Finding

There is no way to see the current key/value state while testing a workflow. `DevToolbar`'s
only data hook is snapshots:

```tsx
const { data: snapshots } = useSnapshots(workflowId);
```

No variable panel exists anywhere in `client/src/components/preview/`. This is the piece that
makes "leave the power to the dev" viable — without it, a block that silently skipped is
indistinguishable from one that ran and produced nothing.

The original render-only assumption was disproved during dispatch: preview does not
submit ordinary pages to the server. **CB-9a must land first.** Consume its server-owned
preview session and authoritative values; do not infer execution state from local answers.
`RunDataService.fromStepIdData` provides `byStepId`, `byAlias`, and per-step metadata
(`id`, `alias`, `type`, `pageId`, `isVirtual`); verify the final runtime contract after CB-9a.

### Preferred fix

Add a variables panel to the preview dev tools. Load the **`design`** skill first.

Each row shows: **alias · current value · declared type · source**, where source is
`question` / `code block` / `inbound`. Reuse the existing icon/type conventions in
`client/src/components/builder/variables/utils.tsx` rather than inventing new ones, and the
existing filter/search shape in `VariablesInspector` and `useFilteredVariables`.

For rows produced by a Code Block, additionally show the block's state from CB-2's
`code_block_runs` row: **fired** · **waiting on `<pending_inputs>`** · **skipped, unchanged**
· **errored: `<message>`**. That readout is the entire debugging payoff of the change gate —
it turns "why didn't my block run" into a line of text.

Values update live as the preview run progresses.

### Ties

- **Depends on CB-2 and completed CB-9a** (real preview execution plus persisted block state).
- Coordinate shared route module and registration edits with CB-8; do not run with CB-9a.
- Load the **`design`** skill (mandatory for UI work) and **`run-tests`**.
- Donor patterns: `client/src/components/builder/VariablesInspector.tsx`,
  `client/src/components/builder/variables/useFilteredVariables.ts`,
  `client/src/components/builder/variables/utils.tsx`.
- File footprint: `client/src/components/preview/DevToolbar.tsx`,
  `client/src/components/preview/PreviewRunner.tsx`,
  `client/src/components/preview/variables/*` (new).
- Approved API footprint: extend existing `server/routes/codeBlocks.routes.ts`; its
  registration in `server/routes/index.ts` is already present after CB-8 and needs no
  duplicate import/call. Also `server/repositories/CodeBlockRunRepository.ts`
  (`findByRunId`), `server/services/codeBlocks/CodeBlockService.ts` (read + tenancy), and
  `client/src/hooks/api/useCodeBlockRuns.ts`. Extend CB-8's route module if it exists.
- Test footprint: the two files named in AC 7. Cross-tenant denial must assert no data.
- Refresh values and block state after each successful submission using CB-9a's lifecycle;
  test the panel changing across a submit and virtual markers absent on answered questions.
- Collides with CB-8 at the route module/registration; keep edits minimal. Re-measure
  baselines after CB-9a lands. Original dispatch baseline was 3801 fast / 1328 integration
  passed (3 skipped), which is historical context, not the new acceptance floor.

### Vertical proof

- **Path:** run the owner's page-1/2/3 scenario in preview. After page 1, the panel shows the
  computed variable as *waiting on `num_children`*. After page 2, it shows the fired value.
  After page 3, it shows *skipped, unchanged*. The states come from real `code_block_runs`
  rows, not client-side inference.
- **Real, not mocked:** the API hop that surfaces `code_block_runs`. Inferring state on the
  client voids this proof — the point is to show what the server actually did.
- **Cross-tenant denial:** the endpoint serving block state refuses a run in another tenant.
- **Suite:** `tests/integration/codeBlocks.inspector.test.ts` for the endpoint;
  `tests/unit/client/previewVariables.test.tsx` for the render.

### Acceptance criteria

1. The preview dev tools show a variables panel listing every variable with alias, current
   value, declared type, and source.
2. Code Block outputs additionally show block state: fired / waiting on named inputs /
   skipped-unchanged / errored with message.
3. Block state is read from `code_block_runs` via an API, not inferred client-side.
4. Values and states update live as the preview run advances.
5. Search/filter works, following the existing `useFilteredVariables` shape.
6. Virtual (computed) steps are visually distinguished from answered questions.
7. New tests: `tests/integration/codeBlocks.inspector.test.ts` (endpoint + cross-tenant denial)
   and `tests/unit/client/previewVariables.test.tsx` (render of 1, 2, 6).
8. **Live proof required:** screenshot of the panel mid-run showing a *waiting on* state and,
   after the next submit, the same variable *fired*.
9. `npm run type-check` 0 errors · `npm run lint` clean · `test:fast` + `test:integration` green.

---

## Phase 3 Gate

- [ ] CB-9a verified and committed before CB-9; CB-8, CB-9a, CB-9 all ✅ with dated notes
- [ ] `npm run type-check` → 0 errors · `npm run lint` → clean
- [ ] `test:fast` + `test:integration` → green
- [ ] **Live proof (batched):** one drive-through of the running app authoring a 2-block
      chained workflow in the new modal and watching both resolve in the inspector.
- [ ] Reviewer has committed each passed ticket + this gate

---

# Phase 4 — Cleanup: retire old surfaces, Python parity

**CB-10 and CB-11 have disjoint footprints — dispatch in parallel.**

## CB-10 — Retire `transform_blocks` and the dead transform UI 🔲

**Priority: P2** · Size: M · File: `server/services/TransformBlockService.ts`

### Finding

`transform_blocks` is the middle child of three implementations of one idea, and once
Phases 1–3 land it duplicates the Code Step entirely while offering strictly less (single
output, manual ordering, no gates). Alongside it sits a set of UI components that are
already unreferenced — `grep` for each returns no importer outside its own file:

- `client/src/components/builder/TransformBlocksPanel.tsx`
- `client/src/components/builder/transforms/TransformBlockEditorDialog.tsx`
- `client/src/components/builder/transforms/TransformBlockForm.tsx`
- `client/src/components/builder/TransformSummary.tsx`

(The *live* transform path is `PageCanvas` → `BlockEditorDialog` →
`client/src/components/builder/forms/TransformBlockForm.tsx` — a different file from the dead
`transforms/TransformBlockForm.tsx`. Do not confuse them.)

The repo owner confirmed on 2026-09-04 that all databases hold only test data, so this is a
deletion, not a data migration.

⚠️ **`STB-B8` explicitly warns against deleting `server/services/scripting/`** — commit
`fbe212fa` over-removed feature routes on exactly this kind of inference and admin plus
marketplace had to be restored. `scripting/` is the engine this initiative is built on and
**stays**. Only `transform_blocks` and the dead transform UI go.

### Preferred fix

Remove, in one ticket: the `transform_blocks` and `transform_block_runs` tables (migration —
load **`db-schema-change`**), `TransformBlockService`, `TransformBlockRepository`,
`transformBlocks.routes.ts` and its registration in `server/routes/index.ts`, the transform
branch of `BlockRunner`, the four dead UI files above, the live
`forms/TransformBlockForm.tsx` + its `BlockTypeSelector` "Code Transform" mode, and
`useTransformBlocks`.

Keep `AdvancedTransformUI` — it is used by `ListToolsTransform`, which is unrelated.

**Verify before deleting, do not infer.** For each file, `grep` for its importers and paste
the result in the turn-in. Anything with a live importer stays and is reported as a blocker.

### Ties

- **Depends on Phases 1–3** being ✅ — the replacement must exist first.
- **Parallel with CB-11** — disjoint files.
- Load **`db-schema-change`** and **`run-tests`**.
- File footprint: `server/services/TransformBlockService.ts`,
  `server/repositories/TransformBlockRepository.ts`, `server/routes/transformBlocks.routes.ts`,
  `server/routes/index.ts`, `server/services/BlockRunner.ts`, `shared/schema/workflow.ts`,
  `shared/schema/run.ts`, `shared/schema/relations.ts`, `migrations/0045_*.sql`,
  the five client files above.
- Collides with: nothing in Phase 4.

### Vertical proof

- **Path:** after the removal, a workflow that uses Code Blocks still runs end to end —
  create run → submit pages → blocks fire → outputs reach `RunDataService.byAlias` →
  a document renders with a computed value in it. Nothing in that path may reference
  `transform_blocks`.
- **Real, not mocked:** the DB (the dropped tables must genuinely be gone and the run must
  still work), the sandbox, and the document renderer. This is a deletion ticket, so the
  proof is that the *replacement* path is intact — not that the deletion compiled.
- **Cross-tenant denial:** unchanged from CB-2; assert it still holds after the route removal.
- **Suite:** `tests/integration/codeBlocks.afterTransformRemoval.test.ts` (integration, needs DB).

### Acceptance criteria

1. `transform_blocks` and `transform_block_runs` are dropped by migration; `npm run db:migrate`
   applies cleanly.
2. `grep -rn "transformBlock" server/ shared/ client/src/` returns no results except
   `AdvancedTransformUI`'s unrelated list-tools usage.
3. `server/services/scripting/` is **untouched** — `git diff --stat` shows no changes under it.
4. `AdvancedTransformUI` and `ListToolsTransform` still work; their tests still pass.
5. The builder no longer offers a "Code Transform" block category; the Code Block step is the
   only code surface.
6. Every deletion is justified by a pasted `grep` showing no live importer.
7. New test `tests/integration/codeBlocks.afterTransformRemoval.test.ts` walks the Vertical
   proof path — run → Code Block fires → computed value reaches a rendered document — with
   the DB, sandbox and renderer hops real.
8. Existing suites green with no test count decrease — state the arithmetic. Tests that
   existed **only** to cover deleted transform-block code may be removed; name each one and
   why, and prove no Code Block behavior lost coverage.
9. `npm run type-check` 0 errors · `npm run lint` clean · `test:fast` + `test:integration` green.

---

## CB-11 — Python: fix runtime availability, then expose the language switch 🔲

**Priority: P1** · Size: S · File: `Dockerfile`

### Finding

**Python transform code cannot run in production today.** The `Dockerfile` installs `python3`
in the *builder* stage only, for native module compilation:

```dockerfile
# Install python/make/g++ for potential native module builds (bcrypt, isolated-vm).
RUN apt-get update && apt-get install -y python3 make g++ unzip
```

The runtime stage starts fresh from `node:24-bookworm-slim` and installs only `qpdf`:

```dockerfile
RUN apt-get update \
    && apt-get install -y --no-install-recommends qpdf \
```

`enhancedSandboxExecutor` executes Python via `spawn(PYTHON_EXECUTABLE, ["-c", pythonWrapper])`
where `PYTHON_EXECUTABLE` resolves to `python3` on Linux — so it `ENOENT`s in the deployed
image. **No test in this repo can catch this**; it is a Dockerfile gap, and the repo's own
`runtime-cwd-files-vs-docker-stage` lesson is exactly this class of bug.

### Preferred fix

Add `python3` to the **runtime** stage's `apt-get install` line. Then, and only then, expose
the JS/Python switch on the Code Block editor, reusing the existing
`transformBlockLanguageEnum` values (`javascript` | `python`) that the executor already
handles on both paths.

Add a startup readiness probe alongside the existing `isolated-vm` build-time check —
`/health` already reports `db` and `pdfConverter`; add `pythonSandbox` so a missing
interpreter is visible in production rather than discovered by a failing run.

### Ties

- **Depends on Phase 1** (the config must carry `language`). **Parallel with CB-10.**
- Load **`run-tests`**. Deployment context: see the repo owner's Railway notes — the image is
  what ships, and `npm run build` locally proves nothing about it.
- File footprint: `Dockerfile`, `server/routes/health.ts` (note: `health.ts`, not `health.routes.ts`),
  `shared/types/steps.ts` (language field),
  `client/src/components/blocks/js-editor/*` (the switch).
- Collides with: CB-8 if both edit the editor — CB-8 lands first; add the switch to CB-8's modal.

### Vertical proof

- **Path:** build the production image, run it, and execute a Python Code Block end to end →
  emitted value lands in `step_values`. `/health` reports `pythonSandbox: ok`.
- **Real, not mocked:** the built Docker image. Running Python on the dev machine proves
  nothing — the whole finding is that the *image* lacks the interpreter.
- **Cross-tenant denial:** inherited from CB-2; no new surface.
- **Suite:** manual/live against a locally built production image; capture the command and output.

### Acceptance criteria

1. `python3` is present in the runtime stage of the built image — proven by
   `docker run --rm <image> python3 --version`, output pasted.
2. A Python Code Block executes successfully inside the built production image and writes its
   output to `step_values`.
3. `/health` reports a `pythonSandbox` readiness field.
4. The editor exposes a JS/Python switch that persists `language` on the config.
5. An existing JavaScript block is unaffected by the switch's introduction.
6. New test asserting the health endpoint reports the python field
   (`tests/integration/health.test.ts` or the existing health test file).
7. **Live proof required** for 1 and 2 — this touches an external runtime no test can prove.
8. `npm run type-check` 0 errors · `npm run lint` clean · `test:fast` green.

---

## Phase 4 Gate

- [ ] CB-10, CB-11 both ✅ with dated verification notes
- [ ] `npm run type-check` → 0 errors · `npm run lint` → clean
- [ ] `test:fast` + `test:integration` → green, count not lower than the Phase 3 baseline
- [ ] `server/services/scripting/` untouched across the whole initiative
- [ ] **Live proof:** a Python Code Block running in a locally built production image
- [ ] Reviewer has committed each passed ticket + this gate

---

# Backlog / observations

Not phase-gated. Promote to a ticket only if it earns dispatch in this initiative.

### CB-B1 — `js_question` `display: "visible"` never had a renderer
**Tag:** `informational`. Resolved by CB-1 deleting the field. Recorded here because the
config advertised a visible mode for the life of the feature and nothing in
`client/src/components/runner/` ever handled `js_question` or `computed`. If a *visible*
computed display is ever wanted, it is a new feature with a new renderer, not a revival.

### CB-B2 — Timeout ceiling is 100–3000ms
**Tag:** `product-decision`. `TransformBlockService.createBlock` enforces
`"Timeout must be between 100ms and 3000ms"`. Child-support-scale arithmetic is far inside
this, so nothing is blocked today. Revisit only if a real block hits the ceiling — raising it
holds a request open longer, and the repo owner should make that call against a real case.

### CB-B3 — External-state reads have no declared dependency
**Tag:** `needs-initiative`. CB-6 forces `always` for impure blocks, which is correct but
blunt: a block reading DataVault re-runs at every evaluation rather than when the underlying
row changes. A finer model would let a block declare an external dependency that participates
in the hash. Only worth building if `always` proves too expensive in practice.

### CB-B4 — `emit()` may still only be called once
**Tag:** `informational`. Both engines enforce single-emit — the Python wrapper raises
`"emit() can only be called once"` and the JS path keeps a single `emittedValue`. With CB-1's
object-shaped multi-output this is the right constraint (one object, many keys) and needs no
change. Noted so nobody "fixes" it into multi-emit and reintroduces ordering ambiguity.
