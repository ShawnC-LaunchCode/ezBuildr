# Post-promotion cleanup (CLN-1..6)

Source: open items left after the 2026-09-12 production promotion (PR #185, `0d31887d`), gathered from
`tickets/BACKLOG.md` plus the Dependabot queue. Owner ruling 2026-09-12: bundle the tiny items into one
ticket and finish the lot today.

Scope: RLS-B5, CB-B2, RUN-B1, CB-B8, RUN-P1, LIST-B15, STB-B14, the OpenTelemetry advisory upgrade, and
Dependabot triage.

Findings were verified against the working tree on 2026-09-12. **The locator is the quoted code and the
named symbol. Line numbers are advisory.**

## How to work this document

- Each ticket has **Finding**, **Preferred fix**, **Ties** and **Acceptance criteria**, plus **Vertical
  proof** if it spans more than one layer.
- Devs do not commit. The reviewer commits once per passed ticket, **and the reviewer alone edits
  `tickets/BACKLOG.md`**, so parallel devs never collide on it.
- **You derive the file footprint.** Each ticket names *starting points* and *boundaries*, not an exhaustive
  file list. Lists written at ticket time have been wrong often enough in this repo that they are not
  trusted. Find every affected file yourself, including `tests/` and `scripts/`, and **report the full list
  in your turn-in**.
- Load the **`run-tests`** skill before running anything. Plain `npm test` gives wrong results here.
- **Baseline on `dev` (`885dc8d3`):** `test:fast` **338 files / 3890 passed**. `test:integration`
  **148 files / 1383 passed + 3 skipped**. The one known flake is `portability.export`'s temp-file test,
  which CLN-1 fixes.
- **DB-backed suites:** your worktree has its own test database. Run **only the integration files your
  ticket names or adds**, never the whole integration project. The reviewer runs the full suites.
- **`npm run type-check` is not the commit gate.** Also run `npm run check:strict-zones`, and lint every
  file you touched with `npx eslint <files> --max-warnings 0 --report-unused-disable-directives`.
- Status legend: 🔲 Open · 🔄 In progress · ✅ Done (verified at review)

| Ticket | Title | Priority | Size | Status |
|---|---|---|---|---|
| CLN-1 | Small cleanups bundle (RLS-B5, CB-B2, RUN-B1, CB-B8, portability flake) | P2 | S | 🔄 dispatched 2026-09-12 (`cln-1`) |
| CLN-2 | `onPageEnter` blocks and `beforePage` hooks never run (RUN-P1) | P1 | M | 🔄 dispatched 2026-09-12 (`cln-2`) |
| CLN-3 | A `list` question as a List Tools source (LIST-B15) | ENH | M | 🔄 dispatched 2026-09-12 (`cln-3`) |
| CLN-4 | Canonicalizer: convert and audit `sections[]` version graphs (STB-B14) | P2 | S–M | 🔄 dispatched 2026-09-12 (`cln-4`) |
| CLN-5 | OpenTelemetry major upgrade; drop the two allowlisted advisories | P1 | M | ✅ 2026-09-12 |
| CLN-6 | Dependabot triage and retarget to `dev` | P2 | S | 🔲 |

**Sequencing.** CLN-1 to CLN-5 have disjoint footprints and can run in parallel. **CLN-6 runs after CLN-5**,
because both change `package.json` and `package-lock.json`.

---

## CLN-1 — Small cleanups bundle 🔲

**Priority: P2** · Size: S · Bundles backlog `RLS-B5`, `CB-B2`, `RUN-B1`, `CB-B8` and the portability flake.

### Finding

**A. RLS-B5: `authorizeRun` reads `workflow_runs` on the bare pool.** In `server/routes/esign.routes.ts`,
`authorizeRun` calls:

```ts
const signatureRun = await workflowRunRepository.findById(request.runId);
...
const run = await workflowRunRepository.findById(runId);
```

These run with no transaction and no tenant GUC. That is the shape RLS-B1 fixed in `EnvelopeBuilder`
(`760353b6`). It is harmless today only because `workflow_runs` has no RLS enabled, and it breaks
e-sign execute/status authorization the day it does.

**B. CB-B2: a Code Block's timeout is silently clamped.** Three things disagree:
- The config schema accepts up to 30 s. In `shared/validation/stepConfigSchemas.ts`, the js_question
  schema has `timeoutMs: z.number().int().min(100).max(30000).optional()`.
- The builder's timeout input invites values up to 30 s. `CodeBlockPanels.tsx` has `max={30000}`.
- The executor caps silently. `server/utils/enhancedSandboxExecutor.ts` has `const MAX_TIMEOUT_MS = 3000;`
  and `Math.min(Math.max(timeoutMs, MIN_TIMEOUT_MS), MAX_TIMEOUT_MS)`.

So an author who saves 10000 gets 3000, with no message. The lifecycle and document hook routes already
use `.max(3000)`. Production has **0** Code Blocks, so no stored value can break.

**C. The portability flake.** In `tests/integration/portability.export.test.ts`, *"AC 1: returns the
manifest as JSON and leaves no temp file behind"* counts every `export_*` file in the **shared**
`os.tmpdir()`:

```ts
const before = (await fs.promises.readdir(os.tmpdir())).filter((f) => f.startsWith("export_")).length;
...
expect(after).toBe(before);
```

A parallel worker creating or cleaning its own export file between the two reads fails the test.
Observed 2026-09-11: the count went `1 → 0` mid-test, and the test passed 19/19 twice in isolation.

**D. RUN-B1: nothing tests that the client applies authoritative navigation.** In
`client/src/hooks/runner/useRunNavigation.ts`, `applyAdvanceNavigation` resolves
`result.navigation.nextPageId` to an index with
`visiblePages.findIndex((page) => page.id === nextPageId)`. Replacing that with `currentPageIndex + 1`
leaves the entire unit suite green, so skip logic could silently break.

**E. CB-B8: `readInspector`'s own guards are untested.** In
`server/services/codeBlocks/CodeBlockService.ts`, `readInspector` checks:

```ts
if (record.tenantId !== tenantId) { throw new Error('Access denied - run belongs to different tenant'); }
await this.workflowSvc.verifyAccess(record.run.workflowId, userId, 'edit', tx);
```

Disabling **both** leaves `codeBlocks.inspector.test.ts` green, because RLS answers first. They are
defence in depth that nothing proves.

### Preferred fix

- **A.** Run both reads inside `withCurrentTenant((tx) => workflowRunRepository.findById(id, tx))`. Mirror
  `SignatureBlockService.executeSignatureBlock`. Keep the route's existing 403/404 behaviour exactly.
- **B.** Set `.max(3000)` in the js_question schema **and** `max={3000}` on the input. That makes it a loud
  validation error, not a silent clamp. Do **not** raise the executor ceiling; that stays an owner decision.
- **C.** Make the assertion about this request's own artifacts: compare file **names**, and fail only if a
  **new** name appeared that wasn't there before. Better still, if the export code names its temp file after
  the workflow or export id, match on that. Read the export service before choosing.
- **D.** Add a `useRunNavigation` case where the server's `nextPageId` is **not** `currentPageIndex + 1`
  (for example, a skip to page 3 from page 1), and assert the index set is page 3's.
- **E.** Add a unit test that stubs the repository to return a record from another tenant, and one that
  makes `verifyAccess` reject. Each must throw the documented error.

### Ties

- Load **`run-tests`** and **`add-api-endpoint`** (for A's error contract).
- Starting points: the files named above. **Derive the full footprint**, including the test files.
- Collides with nothing else in this file.

### Acceptance criteria

1. **A.** Both `workflowRunRepository.findById` calls in `authorizeRun` receive a tenant transaction. Their
   existing responses are unchanged: 403 for a run/envelope mismatch, 404 for a missing run.
2. **B.** A js_question config with `timeoutMs: 3001` fails `validateCanonicalStepConfig`, and 3000 passes.
   A unit test covers both. The builder input's `max` is 3000.
3. **C.** The portability test no longer counts files it didn't create. State how you proved it can still
   fail, for example by making the route leave a temp file behind.
4. **D.** A new `useRunNavigation` test fails when `applyAdvanceNavigation` is mutated to
   `currentPageIndex + 1`, and passes on the real code. **Show the red run.**
5. **E.** New tests fail when either guard in `readInspector` is removed. **Show both red runs.**
6. `test:fast` passes. The count rises by exactly your new tests; state the arithmetic.
   `codeBlocks.inspector.test.ts`, `portability.export.test.ts` and the esign integration tests pass.
7. Type-check 0, strict-zones pass, scoped lint clean.

---

## CLN-2 — `onPageEnter` blocks and `beforePage` hooks never run (RUN-P1) 🔲

**Priority: P1 (latent bug)** · Size: M · Starting point: `server/services/runs/RunExecutionCoordinator.ts`

### Finding

`blockRunner.runPhase` is called with only four phases:
- `onNext` and `onPageSubmit` in `RunExecutionCoordinator`
- `onRunComplete` in `RunCompletionService`
- `onRunStart` in `RunLifecycleService.executeOnRunStart`

**`onPageEnter` is never passed**, so a block in that phase never runs. Yet it is the seeded phase for every
new Read Table block (`client/src/components/builder/pages/newBlockDefaults.ts`), and it is hard-coded for
the Choice→List Tools conversion (`server/routes/blocks.routes.ts`, `phase: 'onPageEnter'`).

It also kills a lifecycle-hook phase. `runPhase` maps `onPageEnter: "beforePage"` inside its own body, so
**`beforePage` lifecycle hooks can never fire**.

Production and dev have **0** `blocks` rows, so nothing depends on this today, and no data migration is
needed.

### Preferred fix

Add **one** page-entry execution point, and call it from the two places a run arrives on a page:

1. **Navigation.** In `runNext`, once `navigation` is final, run
   `blockRunner.runPhase({ phase: "onPageEnter", pageId: navigation.nextPageId, … })` for the page being
   entered. Do this only when there is a next page and it is not the current one. Handle its outputs exactly
   as `onNext`'s outputs are handled (find where they are persisted, and follow that).
2. **Run start.** After `executeOnRunStart`'s `onRunStart` phase and Code Block evaluation, run
   `onPageEnter` for the run's **first visible page**.

Semantics (owner-contestable; record them in a comment at the call site):
- It fires on every **navigation arrival**, including arriving again via back-navigation.
- It does **not** fire on a refresh or on any GET.
- In **preview** it follows the same suppression rules every other phase follows. Pass `mode` through.
  Don't invent new rules.

Keep Code Blocks out of this: `evaluateAll` already runs on its own triggers, and must not run twice
because page entry was added.

### Ties

- Load **`run-tests`**. Derive the full footprint, including where block outputs are persisted after
  `onNext`, and the existing integration tests for run navigation.
- Collides with nothing else in this file. (CLN-3 changes `ListToolsBlockRunner`, not phase dispatch.)

### Vertical proof

- **Path:** create a run on a 2-page workflow → `POST` the page-1 submit/next through the real route →
  the server navigates to page 2 → page 2's `beforePage` lifecycle hook runs, and so does an `onPageEnter`
  block if one fits the test → the hook's output reaches the run data, and `script_execution_log` records
  phase `beforePage`.
- **Run start:** creating the run fires page 1's `beforePage` hook exactly once.
- **Real, not mocked:** the DB, `BlockRunner`, `LifecycleHookService` and the sandbox. Mocking the
  coordinator or the runner voids the proof.
- **Cross-tenant denial:** another tenant's user calling the same next/submit route gets 403 or 404, and
  **no** `beforePage` log row is written.
- **Suite:** a new `tests/integration/runs.pageEnter.test.ts` (integration project).

### Acceptance criteria

1. Navigating from page 1 to page 2 runs page 2's `onPageEnter` phase exactly once, and its `beforePage`
   hooks run.
2. Creating a run runs the first page's `onPageEnter` phase exactly once.
3. Back-navigation re-fires on re-arrival. A GET or refresh does not fire. A test covers each.
4. Preview runs pass `mode: 'preview'`, and inherit the existing suppression. A test shows a preview
   navigation still fires the hook, but a write block does not write.
5. Code Blocks are not evaluated additionally: the `code_block_runs` state per submit is unchanged versus
   the baseline.
6. **Remove the phase call and show the new test go red.**
7. The Vertical proof passes in the named suite, including the denial case.
8. `test:fast` and the named integration file pass. Type-check 0, strict-zones pass, scoped lint clean.

---

## CLN-3 — A `list` question as a List Tools source (LIST-B15) 🔲

**Priority: ENH** · Size: M · Starting point: `server/services/blockRunners/ListToolsBlockRunner.ts`

### Finding

The List Tools source picker offers `computed` steps only. In
`client/src/components/blocks/list-tools/listSourceVariables.ts`:

```ts
const LIST_SOURCE_STEP_TYPES = new Set<string>(["computed"]);
```

That is deliberate, because a `list` question's stored value is a `ListValue` (`{ items: [...] }`), and block
context receives raw step values. `ListToolsBlockRunner` fails `isListVariable` and `Array.isArray`, and
returns:

```ts
errors: [`Input variable "${listConfig.sourceListVar}" is not a valid list or array`]
```

So an author cannot filter, sort or de-duplicate the rows of a repeating question. The broken configuration
is **already reachable** today through the Choice editor's convert-to-List-Tools action.

### Preferred fix

**Normalize at the runner's input boundary. Do NOT project on the read path.** Projecting
`ListValue` → rows where block context is built would silently change what conditional logic, document
list loops, choice labels and Code Blocks see.

1. Lift the envelope→rows conversion that already exists in `client/src/lib/choice-utils.ts` into a shared
   function, `listValueToListVariable`, in `shared/listPipeline.ts` (create it if needed). **Keep `itemId`**
   on each row; `projectListValue` strips it. Have `choice-utils` call the shared version, so there is one
   implementation.
2. In `ListToolsBlockRunner`, before the "not a valid list" rejection, convert a `ListValue` input with that
   function.
3. Add `"list"` to `LIST_SOURCE_STEP_TYPES`, and update that file's comment explaining why it was excluded.

### Ties

- Load **`run-tests`** and **`add-step-type`** (the `list` type conventions).
- `tests/unit/client/ListToolsBlockEditor.sourcePicker.test.tsx` currently **asserts that `list` is
  excluded**. It must be inverted, with the reason stated. That is a legitimate test change, not a weakening.
- Derive the full footprint (grep every consumer of the choice-utils function you lift).
- Collides with nothing else in this file.

### Vertical proof

- **Path:** a workflow with a `list` question plus a List Tools block (source: the list alias; a filter on
  one field; output alias `filtered`) → create a run → submit list answers through the real route → the
  block runs → `filtered`'s virtual step value holds only the matching rows, with `itemId` preserved.
- **Real, not mocked:** the DB, `RunExecutionCoordinator` and `ListToolsBlockRunner`.
- **Cross-tenant denial:** submitting to another tenant's run gets 403 or 404, and no `filtered` value is
  written.
- **Suite:** a new `tests/integration/listTools.listSource.test.ts`.

### Acceptance criteria

1. List Tools accepts a `list` question's `ListValue` as its source. The output rows carry `itemId`.
2. `list` steps appear in the source picker. The inverted picker test passes.
3. There is exactly one envelope→rows implementation. The client and server share it, and `choice-utils`'s
   behaviour is unchanged (its existing tests pass).
4. Conditional logic, documents and Code Blocks still receive the raw `ListValue`. A test asserts block
   context is unchanged for a non-List-Tools consumer.
5. The Vertical proof passes in the named suite, including denial.
6. Remove the runner conversion and show the integration test go red.
7. `test:fast` passes. Type-check 0, strict-zones pass, scoped lint clean.

---

## CLN-4 — Canonicalizer: convert and audit `sections[]` version graphs (STB-B14) 🔲

**Priority: P2** · Size: S–M · Starting point: `scripts/canonicalizeStepTypes.ts`

### Finding

`canonicalizeGraphJson` converts only the `pages[].steps[]` shape:

```ts
if (!Array.isArray(clonedGraph.pages)) {
  stats.unrecognizedShape = true;
  stats.unconvertedDefinitions = Array.isArray(clonedGraph.blocks) ? … : 0;
```

A `sections[]` graph counts as neither converted nor unconverted, so **`--audit` passes**. On production,
**57 of 58 `workflow_versions` use `sections[]`, and 56 still hold legacy type names** (`yes_no`,
`short_text`, …) in `graph_json`. `test` and `dev` carry the same rows.

### Preferred fix

1. **Investigate first.** Find every reader of `workflow_versions.graph_json` (and blueprints): at least
   `RunDefinitionProvider`, version restore, diff and export. Report, with file:line, whether each handles
   the `sections[]` shape and legacy type names, via `LEGACY_STEP_ADAPTERS`, or rejects them.
2. Teach `canonicalizeGraphJson` to convert `sections[].steps[]` exactly as it converts
   `pages[].steps[]`. **Preserve the key name**: do not rename `sections` → `pages` in stored graphs.
   Readers depend on it, per step 1.
3. Make the audit honest. Any step-like definition left unconverted in an unrecognized shape must fail
   `--audit`.

**Do not run the script against any shared database (dev, test or production).** The reviewer runs it
against each environment.

### Ties

- Load **`run-tests`**. Test the pure functions with fixtures, and add a unit test file if none exists.
- Collides with nothing else in this file.

### Acceptance criteria

1. The investigation report lists every reader with file:line and its handling of `sections[]` and legacy
   type names.
2. `canonicalizeGraphJson` converts a `sections[].steps[]` fixture containing `yes_no`, `short_text` and
   `currency`, and preserves the `sections` key.
3. A graph with step definitions in an unrecognized shape makes `--audit` exit non-zero. A test proves it.
4. The existing `pages[]` behaviour is unchanged. A fixture test proves it.
5. Unit tests cover 2–4 and fail against the pre-change script. **Show the red run.**
6. `test:fast` passes. Type-check 0, strict-zones pass, scoped lint clean.

---

## CLN-5 — OpenTelemetry major upgrade; drop the two allowlisted advisories ✅

> **Verification pass, 2026-09-12 (reviewer). Code complete and live-verified by the dev.**
>
> **Versions.** `api` 1.9.1, `sdk-node` and `exporter-prometheus` 0.222.0, `auto-instrumentations-node`
> 0.80.0. `npm ls @opentelemetry/api` shows one copy. `telemetry.ts` is unchanged (the APIs carried over),
> and `preventServerStart: true` is kept.
>
> **Gates, re-run by the reviewer in the worktree.** `audit-check.mjs`: *passed, 0 allowlisted,
> 0 blocking*. Type-check 0. `metrics.test.ts` 2/2. `test:fast` 338/3890, unchanged.
>
> **Mutation proof of the gate.** The pre-upgrade `package.json`/lockfile, paired with the new emptied
> allowlist and run through the same `audit-check.mjs`, **exits 1 naming both GHSA-45rx-2jwx-cxfr and
> GHSA-q7rr-3cgh-j5r3**. So the upgrade, not the allowlist edit, is what clears the audit.
>
> **Lockfile scope, audited package by package.** 96 OpenTelemetry entries changed. The 36 non-OTel
> entries all trace to the OTel tree, or to npm de-duplication around it:
> - `systeminformation` via `instrumentation-host-metrics`
> - `yargs` 17.7.3 via `sdk-node` → gRPC → `proto-loader`
> - `gaxios`/`gcp-metadata`/`node-fetch` hoisted from `google-auth-library` 10.5.0, whose version is
>   unchanged
>
> `npm ls` flags nothing invalid.
>
> **Live (dev).** Booted with telemetry on. `/metrics` served Prometheus text with
> `otel_scope_version="0.222.0"`. The server was killed and the port confirmed free.
>
> **Side finding, pre-existing and not CLN-5's.** `scripts/test-captcha.mjs` imports `node-fetch`, which is
> not in `package.json`; it resolves only through `google-auth-library`. ESM default import works on v3.
> Filed below the Gate as a note.

**Priority: P1** · Size: M · **Deadline: the allowlist entries expire 2026-10-11**, after which the Security
Scan, a required check on `main`, fails on every branch. Starting point: `server/observability/telemetry.ts`

### Finding

`package.json` pins the vulnerable line:

```json
"@opentelemetry/api": "^1.9.0",
"@opentelemetry/auto-instrumentations-node": "^0.50.0",
"@opentelemetry/exporter-prometheus": "^0.53.0",
"@opentelemetry/sdk-node": "^0.53.0",
```

`.audit-allowlist.json` accepts **GHSA-q7rr-3cgh-j5r3** (a Prometheus exporter HTTP-server crash) and
**GHSA-45rx-2jwx-cxfr** (a JaegerPropagator DoS) until 2026-10-11, noting both are "only patched by a
breaking-major OTel upgrade" (follow-up `SEC-056`). Dependabot #177 bumps only `exporter-prometheus` to
`0.221.0`, which is not a coherent set on its own.

### Preferred fix

Upgrade the OpenTelemetry packages together, to one mutually compatible patched release set (the
`sdk-node` / `exporter-prometheus` / `auto-instrumentations-node` family plus `@opentelemetry/api`). Adapt
`telemetry.ts` to any API changes. **Keep `preventServerStart: true`** on the Prometheus exporter. Then
delete both allowlist entries.

**Boundaries:** change no other dependency. Keep the lockfile diff to the OpenTelemetry tree, and report
its size.

### Ties

- Load **`run-tests`**. Read `scripts/ci/audit-check.mjs` (the gate) and every `@opentelemetry` import (at
  least `telemetry.ts` and `MetricsService.ts`).
- **CLN-6 runs after this ticket** (lockfile).
- The reviewer closes Dependabot #177 as superseded.

### Acceptance criteria

1. All `@opentelemetry/*` packages are on one compatible patched set. `npm ls @opentelemetry/api` shows a
   single version.
2. `.audit-allowlist.json` no longer lists either GHSA. `node scripts/ci/audit-check.mjs` passes with
   **0 allowlisted OpenTelemetry advisories**. Paste its output.
3. **Live proof:** the server boots with telemetry enabled and no OpenTelemetry errors in the startup log.
   If metrics are served (find how), they return Prometheus text containing an app metric. Paste the
   evidence.
4. The tests touching telemetry or metrics (`MetricsService`, `metrics.test.ts`, any others you find) pass.
5. `test:fast` passes. Type-check 0, strict-zones pass, scoped lint clean.

---

## CLN-6 — Dependabot triage and retarget to `dev` 🔲

**Priority: P2** · Size: S · **Runs after CLN-5.** Starting point: `.github/dependabot.yml`

### Finding

`.github/dependabot.yml` has no `target-branch`, so every Dependabot PR opens against `main`. That skips
`dev → test` and bypasses the promotion model. Open now:
- **#181** docxtemplater `3.67.6 → 3.69.3`. This is the template engine: `RenderCore` owns the grammar.
- **#180** `@radix-ui/react-navigation-menu` `1.2.14 → 1.2.22`
- **#179** tailwindcss `3.4.19 → 4.3.3`, a major version and a migration
- **#178** `@types/google.maps` `3.58.1 → 3.65.4`
- **#177** is CLN-5's.

### Preferred fix

1. Add `target-branch: "dev"` to **both** ecosystems (npm and github-actions).
2. On your worktree (off `dev`), apply the three non-major bumps with `npm install <pkg>@<version>`:
   docxtemplater, the Radix navigation menu, and `@types/google.maps`. **Do not apply tailwind 4.**
3. docxtemplater is load-bearing. Run the template and document suites (read CLAUDE.md convention 9 and
   `tests/unit/services/document/docSamples.test.ts`), not just `test:fast`.

The reviewer closes #178, #180 and #181 as superseded, closes #179 with a note, and files tailwind 4 in the
backlog.

### Ties

- Load **`run-tests`**. Sequenced after **CLN-5** (both change the lockfile).

### Acceptance criteria

1. `dependabot.yml` targets `dev` for both ecosystems.
2. The three packages are at the PRs' versions. There is no tailwind change, and no other dependency moves
   (report the lockfile diff).
3. The document/template suites pass: `docSamples.test.ts`, the `RenderCore` tests, and
   `tests/integration/docs.autogeneration.test.ts`.
4. `test:fast` passes. Type-check 0, strict-zones pass, lint clean on anything touched.

---

## Gate

- [ ] All six tickets ✅ with dated verification notes
- [ ] Repo-wide: `npm run lint`, `npm run type-check`, `npm run check:strict-zones` clean
- [ ] `test:fast`, `test:integration` and the RLS gate green, with counts reconciled against the baseline
- [ ] CI green on `dev`
- [ ] Reviewer has committed each passed ticket and updated `tickets/BACKLOG.md`

## Notes found during review (not tickets)

- **Phantom `node-fetch` dependency** (found reviewing CLN-5). `scripts/test-captcha.mjs` does
  `import fetch from 'node-fetch'`, but `node-fetch` is not declared in `package.json`. It resolves only
  because `google-auth-library` → `gaxios` pulls it in, now as v3.3.2 at the top level. The file is ESM, so
  the default import works on v3. If `google-auth-library` ever stops depending on it, the script breaks.
  Either declare it, or switch the script to the global `fetch` (Node ≥ 18). One line; fold into any
  future scripts cleanup.
