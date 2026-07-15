# Interview Creation Workflow — Hardening Tickets (ICW-1..20 + backlog)

Source: full-stack audit of the interview (workflow) creation path, 2026-07-14.
Scope: manual builder UI, AI-assisted creation, backend create/update API,
tests & security posture. Overall grade at audit time: **B-** (strong
authorization and AI-output containment; defects are follow-through, not design).

Every finding below was verified against the working tree at audit time with
file:line evidence. Line numbers may drift as fixes land — search for the quoted
code if a reference is stale.

---

## How to work this document

- **Tickets are grouped into 4 phases.** Phases are ordered by risk and
  dependency. Do not start a phase until the previous phase's **Phase Gate**
  has been verified and committed by the reviewer (Shawn).
- Each ticket has: **Finding** (what is wrong, with evidence), **Preferred fix**
  (the approach the reviewer expects — deviate only with a stated reason),
  **Ties** (related tickets/systems), and **Acceptance criteria** (all must pass).
- **Before touching `server/routes|services|repositories`**, load the
  `add-api-endpoint` skill. **Before running any tests**, load the `run-tests`
  skill (`npm test` naively gives wrong results in this repo). For schema work,
  `db-schema-change`. For proving things against the live app, `verify`.
- Status legend: 🔲 Open · 🔄 In progress · ✅ Done (verified at phase gate)

### Phase overview

| Phase | Theme | Tickets | Est. effort |
|---|---|---|---|
| 1 | Bug sweep (correctness) | ICW-1..6 | ~1 day |
| 2 | Builder UX & input robustness | ICW-7..12 | ~3–5 days |
| 3 | AI infrastructure | ICW-13..16 | ~3–4 days |
| 4 | Test coverage & consolidation | ICW-17..20 | ~1–2 days |
| Backlog | Separate projects (not phase-gated) | ICW-B1, ICW-B2 | weeks each |

---

# Phase 1 — Bug sweep (correctness)

Small, independent, low-risk fixes. All are actual bugs or trivially wrong
artifacts. No behavior redesign in this phase.

## Verification pass — 2026-07-14 (post-implementation)

Reviewed every Phase 1 ticket against the working tree, closed three gaps found
during review, and ran the full gate.

- **Gate:** `npm run type-check` → 0 errors · `npm run lint --max-warnings 0` →
  clean · `npm run test:fast` → 1652 passed / 15 skipped ·
  `tests/integration/ai/workflowEdit.test.ts` +
  `tests/integration/workflow-content-ingest-parity.test.ts` → all passing
  (Docker PG 5434).
- **Gaps closed during review:**
  1. ICW-5: leftover scratch comment (`// ... existing hooks ...`,
     `WorkflowBuilder.tsx:48`) removed.
  2. ICW-3 AC3: atomicity test added to
     `workflow-content-ingest-parity.test.ts` — an invalid logic-rule enum
     value fails the insert **mid-transaction** (after the metadata UPDATE);
     test proves title unchanged + no audit row + happy path still lands.
  3. ICW-4 AC4: `tests/unit/services/stepAlias.test.ts` added (13 tests:
     validate/sanitize/generate/dedupe), plus an ingest-level integration case
     proving invalid aliases are stored sanitized.
- **ICW-1 AC5 deferral:** the route-level 400/403/404/201 integration tests are
  deferred to **ICW-17** per the ticket's deferral clause — noted there.
- **Live spot-check (2026-07-14, dev server, real JWT):** `POST /api/workflows`
  malformed body → **400** with Zod issues · nonexistent projectId → **404**
  "Project not found" (was 500 pre-fix) · happy path → **201** · no auth →
  **401** · zero server-side errors logged. The 403 (foreign project) case was
  not exercised live — fresh registrations lack a tenant, so project bootstrap
  needs the integration helper; it rides the identical
  `classifyRouteError` path proven by the 404 case and is locked in at ICW-17.
- **Review observation (non-blocking, for ICW-17/19):** ingest logic rules pass
  `operator`/`action` through to the insert unvalidated
  (`WorkflowContentIngestService.ts:449-451`) — only the pg enum backstops bad
  values (raises a 500-flavored error). The AI edit path is protected by its
  discriminated-union schema; the revision/template path is not. Consider a
  Zod enum check in `normalizeContent` when ICW-17 lands.

**Result: ICW-1..6 closed.**

---

## ICW-1 — `POST /api/workflows` returns 500 for every error ✅

**Priority: P0 (bug)** · Size: S · File: `server/routes/workflows.routes.ts`

### Finding

The primary create endpoint's catch block ignores `classifyRouteError` and
returns 500 unconditionally (`workflows.routes.ts:62-68`):

```ts
} catch (error) {
  logger.error({ error, userId: (req as AuthRequest).userId }, "Error creating workflow");
  res.status(500).json({ message: "Failed to create workflow", ... });
}
```

Consequences:
- A malformed body (`ZodError` from `insertWorkflowSchema.parse` at `:54`) → 500, should be **400**.
- `WorkflowService.createWorkflow` deliberately throws `"Access denied..."` /
  `"Project not found"` (`WorkflowService.ts:146-163`) per the repo's
  error-string contract → both surface as 500, should be **403** / **404**.

Every sibling handler in the same file uses `classifyRouteError` correctly.
This was independently confirmed by two audit passes.

### Preferred fix

Mirror the catch block of `PUT /api/workflows/:workflowId` in the same file:
handle `ZodError` → 400 with flattened issues, then delegate to
`classifyRouteError(error, res, ...)` for everything else. Do not invent a new
pattern — copy the sibling.

### Ties

- The error-string contract is documented in the `add-api-endpoint` skill and
  `server/utils/routeErrors.ts:18-43`.
- ICW-17 adds the integration test that locks this in.

### Acceptance criteria

1. `POST /api/workflows` with a malformed body (e.g. `title: 123`) returns **400** with validation details.
2. `POST /api/workflows` with a `projectId` the user cannot edit returns **403**.
3. `POST /api/workflows` with a nonexistent `projectId` returns **404**.
4. Happy path still returns **201** with the workflow.
5. New/updated integration test asserts 1–4 (may be delivered here or deferred to ICW-17 — if deferred, note it on the ticket).
6. `npm run type-check` → 0 errors; `npm run test:fast` green.

---

## ICW-2 — AI edit route: dead error-classification branch ✅

**Priority: P0 (bug)** · Size: S · File: `server/routes/ai/workflowEdit.routes.ts`

### Finding

The catch block hardcodes the message *before* inspecting the error, so the
classification is checked against a constant and is always false
(`workflowEdit.routes.ts:228-237`):

```ts
} catch (error) {
  logger.error({ error, workflowId: req.params.workflowId }, "Error in AI workflow edit");
  const message = "Failed to process AI edit";
  const isUserError = message.includes("Access denied") || ...   // always false
  const status = isUserError ? ... : 500;                        // always 500
```

Every failure — access denied, duplicate alias, Gemini validation error —
surfaces as a 500. Fails safe (access is still denied upstream) but is a real
observability/UX bug, already acknowledged as a "non-security note" in
`AI_SECURITY_REMEDIATION_TICKETS.md`.

### Preferred fix

Classify from the **actual** error:

```ts
const actual = error instanceof Error ? error.message : "";
```

Map `Access denied` → 403; `already exists` / `Duplicate` / `duplicate key` /
`VALIDATION_ERROR` → 400; else 500. Keep the **response body** generic for 500s
(`"Failed to process AI edit"`) — do not echo internal messages on the 500
path. For 400/403 it is fine to return the sanitized service message (these are
the deliberate contract phrasings).

Note: project memory records this route as *intentionally not converted* to
`classifyRouteError` — respect that; fix the inline classification rather than
converting the whole handler.

Also remove the no-op `try { ... } catch (applyError) { throw applyError; }`
block at `:141-159` (currently suppressed with `no-useless-catch`).

### Ties

- ICW-19 adds the tests that exercise these branches.
- ICW-16 (snapshot-failure policy) touches the same handler — coordinate if
  worked concurrently.

### Acceptance criteria

1. An access-denied failure from `verifyAccess`/patch service returns **403**.
2. A duplicate-alias apply failure returns **400** (existing rollback test at `tests/integration/ai/workflowEdit.test.ts:390` should now see 400 semantics preserved — it already expects 400 from the ops path; confirm no regression).
3. An unexpected internal error returns **500** with the generic message and no internal detail in the body.
4. The `no-useless-catch` block at `:141-159` is gone.
5. `npm run test:integration -- tests/integration/ai/workflowEdit.test.ts` green (see `run-tests` skill for invocation).

---

## ICW-3 — `replaceWorkflowContent` is non-atomic ✅

**Priority: P0 (correctness)** · Size: S–M · File: `server/services/WorkflowService.ts`

### Finding

`replaceWorkflowContent` (`WorkflowService.ts:617-655`) — the deep-update path
used by the AI assistant — performs three separately-committed operations:

1. `db.update(workflows)` for title/description (`:628-636`) — **commits immediately**
2. `workflowContentIngestService.apply(...)` (`:643`) — its own internal `db.transaction`
3. `db.insert(auditLogs)` (`:646`)

If step 2 throws (e.g. duplicate alias, structural validation failure), step 1
is already committed: the interview's title/description are updated but its
sections/steps are not — a torn write, and the "rollback on failure" the AI
route's tests rely on is only partial.

### Preferred fix

Wrap all three in a single `db.transaction`, threading `tx` through:

- `WorkflowContentIngestService.apply` must accept an optional `tx` and use it
  instead of opening its own transaction when provided (keep its own
  transaction as the default for other callers).
- The metadata update and audit insert use the same `tx`.

⚠️ **Deadlock hazard (documented in project memory):** repository/service
methods that run **pool** queries while inside a caller's transaction deadlock
the size-1 test pool. Every query inside the new transaction boundary must use
`tx`, not `db`. Grep `apply`'s full call graph before declaring done.

### Ties

- The AI route (`workflowEdit.routes.ts:143` via `WorkflowPatchService`) is a
  *different* apply path — this ticket only covers `replaceWorkflowContent` /
  ingest. Do not touch `WorkflowPatchService` here.
- ICW-4 modifies `WorkflowContentIngestService` too — sequence them or merge PRs.

### Acceptance criteria

1. A forced failure inside `workflowContentIngestService.apply` (e.g. inject a duplicate alias in test data) leaves the workflow's `title`/`description`/`updatedAt` **unchanged** and writes **no** audit log row.
2. Happy path unchanged: metadata updated, content synced, audit row written.
3. New integration (or unit-db) test proves criterion 1.
4. Full ingest call graph inside the transaction uses `tx` (reviewer will check for pool-query-inside-tx).
5. `npm run test:integration -- tests/integration/workflow-content-ingest-parity.test.ts` and `tests/integration/ai/workflowEdit.test.ts` green.

---

## ICW-4 — Ingest path skips alias **format** validation ✅

**Priority: P1** · Size: XS · File: `server/services/WorkflowContentIngestService.ts`

### Finding

The incremental path enforces `ALIAS_FORMAT = /^[a-zA-Z_][a-zA-Z0-9_]*$/`
(`StepService.ts:18`, applied at create/update). The ingest path
(`WorkflowContentIngestService.resolveStepAlias`, `:368-387`) dedupes aliases
in-memory but never calls `validateAliasFormat` — an AI- or template-supplied
alias like `my.alias` or `1st-question` is stored verbatim. Invalid aliases
break the `{{alias}}` variable system downstream (logic, transforms, documents).

### Preferred fix

Call the same `validateAliasFormat` used by `StepService` inside
`resolveStepAlias`. On invalid format, **sanitize rather than reject** on the
ingest path (AI output should degrade gracefully): strip invalid chars /
prefix with `_` using the same auto-generation rules `StepService` uses for
missing aliases, then run the existing dedupe. Export the sanitizer from one
place so both services share it — do not copy the regex.

### Ties

- ICW-3 touches the same file.
- The partial unique index `steps_workflow_alias_unique`
  (`shared/schema/workflow.ts:274-276`) already backstops *uniqueness*; this
  ticket is only about *format*.

### Acceptance criteria

1. Ingesting content with an invalid alias (e.g. `foo.bar`) results in a stored alias matching `ALIAS_FORMAT` (sanitized, deduped), not the raw string.
2. Valid aliases pass through unchanged.
3. The format rule lives in exactly one exported location, used by both `StepService` and the ingest service.
4. Unit test covers the sanitize path; parity test (`workflow-content-ingest-parity.test.ts`) still green.

---

## ICW-5 — AI-generation scratch debris in the builder shell ✅

**Priority: P2 (hygiene)** · Size: XS · File: `client/src/pages/WorkflowBuilder.tsx`

### Finding

The top-level builder component ships left-in AI scratch comments and unsafe casts:

- `// ... existing hooks ...` (`:47`)
- Stream-of-consciousness block: `Wait, API requires two version IDs. / Does 'Draft' have a version ID?` (`:110-117`)
- `// Re-implementing them briefly to ensure context is valid...` (`:125`)
- `workflow as any` casts (`:151-154`)

### Preferred fix

Delete the scratch comments. For the two `as any` casts, type them properly —
if the shape genuinely mismatches, that is a finding to raise, not to cast
away. If the "two version IDs" comment reflects a real unresolved question
about the publish/compare API, extract it into a tracked TODO with an issue
reference or resolve it — do not leave musings in code.

**Note:** this is a UI file — per repo policy, load the design skill before
any change that alters rendered UI. Comment/type cleanup alone does not alter
UI, so the skill is only needed if you end up changing markup.

### Acceptance criteria

1. No scratch/meta comments remain in `WorkflowBuilder.tsx` (reviewer greps for `Wait,`, `existing hooks`, `Re-implementing`).
2. Zero `as any` in the file, or each remaining one has a one-line justification comment and a tracked ticket reference.
3. `npm run type-check` → 0 errors; `npm run lint` → 0 errors; builder loads and publishes in the dev app (see `verify` skill).

---

## ICW-6 — Documentation drift: builder tab count & creation docs ✅

**Priority: P3** · Size: XS · Files: `CLAUDE.md`, `docs/claude/PAGES.md` (check others)

### Finding

`CLAUDE.md` describes a "5-tab nav"; the builder renders **7 tabs**
(`sections`, `templates`, `data-sources`, `review`, `snapshots`, `settings`,
`assignment` — `WorkflowBuilder.tsx:259-281`). CLAUDE.md's own maintenance rule
says quick-reference docs must be kept in sync.

### Preferred fix

Update the tab description in `CLAUDE.md` (directory-structure section) and
sweep `docs/claude/PAGES.md` + `docs/guides/FRONTEND.md` for the same stale
claim. Do not rewrite anything else.

### Acceptance criteria

1. `grep -ri "5-tab" CLAUDE.md docs/` returns nothing (or only historical changelog entries).
2. The builder description names the actual 7 tabs.

---

## ✅ PHASE 1 GATE — reviewer verification & commit

Reviewer (Shawn) runs before committing:

```bash
npm run type-check          # 0 errors
npm run lint                # 0 errors
npm run test:fast           # green
npm run test:integration -- tests/integration/ai/workflowEdit.test.ts tests/integration/workflow-content-ingest-parity.test.ts
```

Plus a manual spot-check in the dev app (`verify` skill): create a workflow
with a bad project id → observe 404, not 500.

Suggested commit: `fix(creation): phase 1 bug sweep — route error contracts, atomic deep-update, ingest alias format (ICW-1..6)`

> Coordination note: this repo is edited concurrently from a second IDE —
> commit promptly at the gate, stage files explicitly (no `git add -A`), and
> confirm before any push.

---

# Phase 2 — Builder UX & input robustness

User-facing reliability and abuse limits. ICW-7 must land **before** ICW-8
(debouncing without error surfacing widens the silent-loss window).

---

## ICW-7 — Silent save failures in the builder 🔲

**Priority: P0 (UX)** · Size: S · Files: `client/src/lib/queryClient.ts`, `client/src/hooks/api/useSteps.ts`, `useSections.ts`

### Finding

The builder saves on every change with optimistic updates, but a failed save is
invisible to the user:

- `queryClient.ts:161-174`: mutations have `retry: false` and there is **no
  global `MutationCache` `onError`**.
- `useUpdateStep` (`useSteps.ts:70-119`) and `useUpdateSection`
  (`useSections.ts:29-100`) roll back optimistic state in `onError` but fire
  **no toast**.
- Call sites are fire-and-forget `.mutate(...)` (e.g. `StepCard.tsx:125-127`).

Net effect: a network blip or 4xx during editing silently reverts the user's
typing. Delete/create handlers *do* toast, so error UX is inconsistent.

### Preferred fix

Two layers:

1. **Global backstop:** construct `queryClient` with a
   `mutationCache: new MutationCache({ onError: ... })` that shows a destructive
   toast ("Change could not be saved — it has been reverted") unless the
   mutation's `meta.suppressGlobalError` is set. This covers every current and
   future mutation without touching 40 call sites.
2. **Targeted copy:** in `useUpdateStep` / `useUpdateSection` `onError`, set a
   contextual message via `meta` (e.g. which step failed) so the global handler
   can show something better than the generic line.

Keep `retry: false` for now (retries interact badly with per-keystroke writes);
ICW-8's debounce is the right fix for transient blips.

**UI change → load the design skill** for the toast styling/wording pass.

### Ties

- **Blocks ICW-8.** The debounce work must not merge first.
- Consistent with existing toast usage in create/delete handlers.

### Acceptance criteria

1. With the dev server running and the network deliberately failed (e.g. kill server mid-edit, or force a 500 via devtools), editing a step title shows a visible error toast and the field reverts. Screenshot or preview-pane proof attached to the PR (see `verify` skill).
2. Optimistic rollback still works (no stale value left in the cache).
3. Mutations that intentionally handle their own errors can opt out via `meta` and do not double-toast.
4. No toast storm: N failed keystroke-mutations within a short window produce a bounded number of toasts (dedupe by mutation key or debounce the toast itself).
5. `npm run test:fast` green.

---

## ICW-8 — Per-keystroke PATCH storm: debounce builder writes 🔲

**Priority: P1** · Size: M · Files: `client/src/components/builder/**` (card editors, `StepTitleRow.tsx`, `PageCard.hooks.ts`), new shared hook

### Finding

Every keystroke in a step title, section title/description, or config text
field fires an immediate PATCH mutation:

- Step title: `StepCard.tsx:125-127` → `StepTitleRow.tsx:46` (`onChange` → `mutate`)
- Config fields: e.g. `BooleanCardEditor.tsx:70-101`
- Section title/description: `PageCard.hooks.ts:108-113`

Zero debounce exists anywhere under `components/builder` (grep confirmed).
Typing a 40-char title = 40 PATCH requests + 40 DB writes. This is write
amplification, and it magnifies ICW-7 (any one of the 40 can fail).

### Preferred fix

Create **one** shared hook — suggested `useDebouncedFieldMutation` in
`client/src/hooks/` — wrapping a TanStack mutation with:

- Local state as the immediate source of truth while typing (the card editors
  already keep a `localConfig` mirror — reuse that pattern, don't add a second
  mirror).
- ~600 ms trailing debounce before firing the mutation with the **latest** value.
- **Flush on blur and on unmount** (critical — navigating away mid-debounce
  must not lose the pending write; `useEffect` cleanup flush).
- Coalescing: a new keystroke during an in-flight mutation queues exactly one
  trailing write (do not stack).

Apply it to text inputs only (titles, labels, descriptions, placeholder text).
Discrete controls (switches, selects, reorder) stay immediate — they are
one-shot by nature.

Roll out incrementally: `StepTitleRow` + `PageCard.hooks` first (highest
traffic), then the card editors. Multiple PRs are fine within the phase.

### Ties

- **Depends on ICW-7** (errors must surface before writes become less frequent).
- Interacts with the optimistic-update pattern in `useSteps.ts:70-119`: the
  optimistic cache write should happen on flush (with the final value), not per
  keystroke — verify rollback still restores the correct pre-edit value.
- The `localConfig` `useEffect`-sync pattern in every card editor
  (`BooleanCardEditor.tsx:47-68`) risks echo/stale reconciliation — the hook
  should make it safe to *ignore* server echoes while the field is focused.

### Acceptance criteria

1. Typing a sentence into a step title produces **≤ 2** PATCH requests (verify via browser network pane; attach evidence).
2. Blur immediately flushes the pending value; navigating to another builder tab or unmounting the editor mid-debounce does not lose the edit (test: type, immediately click another page, reload — value persisted).
3. Rapid type-then-delete-everything ends with the server holding the final (empty or last) value — no out-of-order writes (latest-wins proven).
4. Failed flush still surfaces the ICW-7 toast and reverts local state to server truth.
5. A unit test for the hook covers: debounce, flush-on-blur, flush-on-unmount, coalescing, latest-wins.
6. `npm run test:fast` green; manual editor pass in the dev app for at least: title, boolean labels, choice options.

---

## ICW-9 — Step `config` accepted unvalidated: wire validation in log-only mode 🔲

**Priority: P1** · Size: M · Files: `server/services/StepService.ts`, `server/utils/stepConfigUtils.ts`

### Finding

Per-step-type config validation is fully built and unit-tested — and never
called:

- `validateAndNormalizeConfig` (`server/utils/stepConfigUtils.ts:56`) wraps
  `validateStepConfig` from `shared/validation/stepConfigSchemas`.
- Grep of `server/` shows the **only** references are the definition file
  itself. No service or route invokes it.
- `insertStepSchema.partial().parse(req.body)` passes the `config` jsonb
  through untouched (`steps.routes.ts:97`), so any shape lands in the DB.

Not an RCE risk (config is never executed) but it is exactly the
`record(any)`-through-`jsonb` red flag the repo's own threat model
(`docs/architecture/SECURITY_THREAT_MODEL.md` §2) calls out, and malformed
configs surface later as runner rendering bugs.

### Preferred fix

Two-stage rollout because existing rows may fail validation. **This ticket is
stage 1 (observe); ICW-10 is stage 2 (enforce).**

1. Call `validateAndNormalizeConfig(stepType, config)` in
   `StepService.createStep` and `updateStep` (and the ingest path's step
   writes). On failure: **log a structured warning** (`stepType`, `workflowId`,
   Zod issue paths — no config values, they may hold tenant data) and store the
   config as-is (current behavior).
2. Write an audit script (`scripts/auditStepConfigs.ts`, tsx) that runs
   `validateStepConfig` across all existing `steps` rows and prints a summary
   by step type + failure reason. This tells us the blast radius before ICW-10.

### Ties

- **Blocks ICW-10.**
- Coordinate with ICW-4/ICW-3 if the ingest service is being touched
  concurrently.
- `tests/unit/shared/validation/stepConfigSchemas.test.ts` already covers the
  schemas themselves.

### Acceptance criteria

1. Creating/updating a step with a config that violates its type schema logs exactly one structured warning and still succeeds (behavior unchanged).
2. Valid configs log nothing.
3. Log payload contains no config **values** (issue paths and types only).
4. `scripts/auditStepConfigs.ts` runs against the dev DB and prints a per-type pass/fail summary; output pasted into ICW-10 before it starts.
5. Unit test proves the service calls the validator on create and update.
6. `npm run test:fast` and StepService tests green.

---

## ICW-10 — Step `config` validation: strict enforcement 🔲

**Priority: P1** · Size: S–M (depends on ICW-9 audit results) · Files: `server/services/StepService.ts`, `shared/validation/stepConfigSchemas.ts`

### Finding

Stage 2 of ICW-9. Once the audit shows existing data is clean (or schemas have
been loosened where reality disagrees with them), flip validation from
log-to-store to reject.

### Preferred fix

- Review the ICW-9 audit output. Where legitimate stored configs fail the
  schema, fix the **schema** (schemas were written in isolation and may be
  stricter than real usage) — do not mass-migrate data unless the data is
  genuinely wrong.
- Then: on validation failure in create/update, throw an error whose message
  starts with a phrasing `classifyRouteError` maps to **400** (check
  `server/utils/routeErrors.ts` — if no 400 phrasing exists, extend the
  classifier per the `add-api-endpoint` skill rather than special-casing the
  route).
- Use the **normalized** config returned by `validateAndNormalizeConfig` as
  the stored value (that is what the utility is for).
- Ingest/AI path: **sanitize-or-reject per op** — a single bad AI-proposed step
  config should fail that op with a clear message (the AI route already
  surfaces per-op errors as 400), not 500 the whole edit.

### Acceptance criteria

1. `POST .../steps` with an invalid config for its type returns **400** with the field-level issues; nothing is written.
2. `PUT /api/steps/:stepId` same.
3. Valid configs are stored **normalized**.
4. AI edit with one invalid `step.create` config op returns the existing per-op 400 error shape naming the op index.
5. Audit script from ICW-9 re-run post-deploy: 0 failures on the schemas as shipped.
6. Integration tests cover 1, 2, and 4. Full step-related test files green.

---

## ICW-11 — No aggregate size cap on manual creation 🔲

**Priority: P1** · Size: S · Files: `server/services/SectionService.ts`, `server/services/StepService.ts`, `server/services/WorkflowContentIngestService.ts`, `shared/` (constants)

### Finding

`validateWorkflowSize` (50 sections / 50 steps-per-section) exists but guards
**only AI routes** (`server/middleware/ai.middleware.ts:15`, applied in
`api.ai.optimization.routes.ts:23,41`, `ai.routes.ts:84+`) and only inspects
`req.body.currentWorkflow`. The manual path — `POST .../sections`,
`POST .../steps`, and the deep-update ingest — has **no aggregate ceiling**.
Only the global 10 MB body limit (`securityConfig.ts:118`) and the 20/min
`createLimiter` bound interview size; a scripted loop can create thousands of
steps, which the builder UI, runner, and `getWorkflowWithDetails` will then try
to load wholesale.

### Preferred fix

- Define shared constants in one place (suggested
  `shared/limits.ts`): `MAX_SECTIONS_PER_WORKFLOW = 100`,
  `MAX_STEPS_PER_SECTION = 200`, `MAX_STEPS_PER_WORKFLOW = 1000`, each
  overridable via env (`LIMIT_MAX_SECTIONS`, etc.) for enterprise flexibility.
  Manual limits deliberately ≥ the AI 50/50 so the AI path stays the stricter
  one.
- Enforce in the **services** (`createSection`, `createStep`, ingest
  `normalizeContent`), not routes — count via a cheap `COUNT(*)` scoped query
  before insert. Throw a 400-mapped error (same classifier note as ICW-10):
  e.g. `"Section limit reached (100 per workflow)"`.
- Point the existing AI `validateWorkflowSize` at the same constants so there
  is one source of truth.

### Ties

- ICW-10 shares the "400 phrasing in classifyRouteError" prerequisite — land
  that extension once, in whichever ticket goes first.
- Repeater/nested-config depth is **not** in scope here (config depth is
  bounded by ICW-9/10 schema validation).

### Acceptance criteria

1. Creating section #101 in one workflow returns **400** with the limit message; #100 succeeds.
2. Creating a step beyond per-section or per-workflow cap returns **400**.
3. Ingest/deep-update rejects content exceeding the caps with a 400 (whole apply rejected — atomicity per ICW-3 means nothing partial is written).
4. Limits are env-overridable and covered by a unit test each (default + override).
5. AI `validateWorkflowSize` reads from the shared constants (no second copy of the numbers).
6. Integration test covers 1 and 3.

---

## ICW-12 — Reorders: N sequential un-transacted updates 🔲

**Priority: P2** · Size: S · Files: `server/services/SectionService.ts`, `server/services/StepService.ts`

### Finding

`reorderSections` (`SectionService.ts:97-99`) and `reorderSteps`
(`StepService.ts:281-283`) loop over items issuing one `updateOrder` call each,
with **no wrapping transaction** — a mid-loop failure leaves a
partially-reordered interview. Additionally there is no unique constraint on
`(workflowId, order)` / `(sectionId, order)` (`shared/schema/workflow.ts:243,265`),
so duplicate order values are already possible and must be tolerated by readers.

### Preferred fix

Wrap each reorder in a single `repo.transaction()` threading `tx` (⚠️ same
size-1 pool deadlock hazard as ICW-3 — every inner call takes `tx`). Prefer a
single batched SQL `UPDATE ... FROM (VALUES ...)` if straightforward with
Drizzle; otherwise the loop inside one tx is acceptable.

**Do not** add the unique order constraint in this ticket — duplicate orders
exist in the wild and readers sort stably; making it unique is a data-migration
project. Note it as a possible follow-up only.

### Acceptance criteria

1. A forced failure mid-reorder (test hook or invalid id in the middle of the list) leaves **all** original order values intact.
2. Happy-path reorder persists correctly (existing dnd-kit flows in the builder still work — quick manual check).
3. Unit-db or integration test proves criterion 1 for both sections and steps.
4. No pool-query-inside-tx (reviewer greps the call graph).

---

## ✅ PHASE 2 GATE — reviewer verification & commit

```bash
npm run type-check && npm run lint
npm run test:fast
npm run test:unit
npm run test:integration    # full — phase 2 touches wide surface
```

Manual pass in the dev app (`verify` skill), with the network pane open:
1. Edit a step title → ≤2 PATCHes, value persists after reload.
2. Kill the server mid-edit → toast appears, field reverts.
3. Try to exceed a section/step cap via a quick script → 400.
4. Create a step with a junk config via curl → 400 with issues (post ICW-10).

Suggested commits (two, if ICW-9/10 straddle a data audit):
- `feat(builder): surface save failures + debounce field writes (ICW-7, ICW-8)`
- `feat(creation): enforce step-config validation, size caps, transactional reorders (ICW-9..12)`

---

# Phase 3 — AI infrastructure

The AI creation path is the stated next focus; this phase pays down the
infrastructure debt before building on it.

## Implementation pass — 2026-07-15

All four Phase 3 tickets implemented. Highlights:

- **ICW-13:** `callGeminiForWorkflowEdit` → `callAiForWorkflowEdit`, routed through
  `AIProviderClient` (retry/backoff/timeout/telemetry). New
  `server/services/ai/providerConfig.ts` (`resolveAiProviderConfig`) is the single
  env→config resolver (prefers `GEMINI_API_KEY`/`GEMINI_MODEL`, registry-known
  default `gemini-2.0-flash`). Hardcoded `gemini-1.5-pro` removed from the route
  **and** `schemaAlign.ts`. Current Gemini ids added to `ModelRegistry`
  (2.5-pro/flash, 1.5-flash). The three load-bearing properties preserved:
  system/user role separation (system prompt → `systemMessage` →
  `systemInstruction`), `fenceUntrusted` on context + user message, and
  `aiModelResponseSchema.safeParse`. Cost/token telemetry now logged per edit via
  the client's `ai_request_success` line. SEC-038 caps made env-configurable
  (`shared/limits.ts` → `ai.middleware.ts`).
- **ICW-14:** SEC-039 closed — raw response slices / full-response file write
  gated behind `AI_LOG_RAW_RESPONSES` (default off); `lastChar` slice dropped.
- **ICW-15:** single `DEFAULT_SYSTEM_PROMPT` (inline fallback deleted); admin PUT
  `.max(20_000)` + non-blocking placeholder `warnings`; `getEffectivePrompt()`
  dead params removed; `AdminAiSettings.tsx` mirrors the max/counter/warning.
- **ICW-16:** BEFORE-snapshot failure now fails closed (503, no mutation);
  AFTER-snapshot stays log-and-continue at error level; `// Continue? Or fail?`
  comment gone.

**Gate run (Claude, 2026-07-15):** `npm run type-check` → 0 errors ·
lint on all touched files → clean · `npm run test:fast` → 1670 passed / 15
skipped · new unit tests `tests/unit/services/ai/{AIProviderClient,providerConfig}.test.ts`
green · `tests/integration/ai/workflowEdit.test.ts` → 9/9 (incl. new ICW-16
snapshot-fail-closed case), Docker PG 5434. Left for reviewer: full
`npm run test:integration` + a live AI edit spot-check per the phase gate.

Status docs updated: SEC-038 → fully resolved, SEC-039 → resolved
(`AI_SECURITY_REMEDIATION_TICKETS.md`).

---

## ICW-13 — AI edit route bypasses the provider registry ✅

**Priority: P1** · Size: M · Files: `server/routes/ai/workflowEdit.routes.ts`, `server/services/ai/*`

### Finding

A mature provider abstraction exists — `ProviderFactory`, `BaseAIProvider`,
`ModelRegistry` (context windows, per-token pricing, `estimateCost`), and
`AIProviderClient` with retry/exponential backoff/rate-limit/timeout handling,
`maxRetries = 6` (`AIProviderClient.ts:68-174`) — and the flagship interview
edit route uses **none of it**. `callGeminiForWorkflowEdit`
(`workflowEdit.routes.ts:245-334`):

- constructs `GoogleGenerativeAI` directly and **hardcodes `gemini-1.5-pro`** (`:267`)
- has no timeout, no retry, no backoff, no token pre-check, no cost estimate/telemetry
- model-id drift across the codebase: this route and `schemaAlign.ts:32` pin
  `gemini-1.5-pro`; `AIService.ts` / `AiController.ts` use
  `process.env.GEMINI_MODEL ?? "gemini-2.0-flash"`

### Preferred fix

Refactor `callGeminiForWorkflowEdit` to go through
`ProviderFactory`/`AIProviderClient`, preserving three properties that are
**security-load-bearing and must not regress**:

1. System prompt passed with true role separation (`systemInstruction`-equivalent), per SEC-040.
2. `fenceUntrusted` wrapping of workflow context and user message (`:279-282`).
3. Strict `aiModelResponseSchema.safeParse` on the output (`:324-331`), including the markdown-fence fallback parse.

Model selection: read from `GEMINI_MODEL` env with a registry-known default —
same convention as `AIService.ts` — and delete the hardcoded string here and in
`schemaAlign.ts:32`. Add the current Gemini model ids to `ModelRegistry` if
missing (several registry entries are dated).

If the registry's chat interface can't express `systemInstruction` for Gemini,
extend the provider — do **not** fall back to concatenating the system prompt
into the user turn (that reverts SEC-040).

Split into two PRs if cleaner: (a) route through registry, (b) registry model-id
refresh.

### Ties

- Unlocks the remaining **SEC-038** criterion: with cost estimation available,
  make the AI rate-limit caps env-configurable (currently hardcoded 20/min,
  500/day in `ai.middleware.ts:100-125`). Include the env-configurability here
  and mark SEC-038 fully closed in `AI_SECURITY_REMEDIATION_TICKETS.md`.
- ICW-19's tests should be written against the refactored path.

### Acceptance criteria

1. `workflowEdit.routes.ts` contains no direct `GoogleGenerativeAI` construction and no hardcoded model id; `schemaAlign.ts` likewise.
2. A transient provider error (simulate 429/timeout in a unit test with the client's retry hooks) is retried per `AIProviderClient` policy; a hard failure returns the ICW-2 error shape.
3. The three security properties above each have a test or an assertion in review notes (fencing: see ICW-19).
4. Request cost/token telemetry is logged per edit call (model, tokens in/out, estimated cost — no prompt content).
5. AI rate-limit caps read from env with the current values as defaults; `AI_SECURITY_REMEDIATION_TICKETS.md` updated (SEC-038 → fully resolved).
6. `tests/integration/ai/workflowEdit.test.ts` green (mock now targets the provider client seam instead of the Gemini SDK — update the mock, keep the assertions).

---

## ICW-14 — SEC-039: model-output slices still logged ✅

**Priority: P2 (the one open AI security ticket)** · Size: S · Files: `server/services/ai/BaseAIProvider.ts`, `server/services/WorkflowRevisionService.ts`, `server/services/AIServiceUtils.ts`

### Finding

SEC-039 (Low) is the only AI-remediation ticket without a Resolved status:
bounded 50–500-char slices of raw model output — which can echo tenant step
titles/aliases — are still written to logs. Sites found:
`BaseAIProvider.ts:131,159`, `WorkflowRevisionService.ts:261,291-292`
(`AIServiceUtils.ts` previously logged slices; verify its current state — one
audit pass noted it may now log lengths only).

### Preferred fix

Replace sliced-content logging with structural metadata: response length,
parse success/failure, Zod issue paths, finish reason. Where a debugging
escape hatch is genuinely wanted, gate raw-slice logging behind an explicit env
flag that defaults off (`AI_LOG_RAW_RESPONSES=false`) and note it in the ticket
file. Update SEC-039's status in `AI_SECURITY_REMEDIATION_TICKETS.md` when done.

### Acceptance criteria

1. Grep of `server/` finds no unconditional logging of model response content (slices or full).
2. Parse-failure logs still carry enough structure to debug (length, issue paths, finish reason).
3. Optional env-gated raw logging defaults off.
4. `AI_SECURITY_REMEDIATION_TICKETS.md` marks SEC-039 resolved with file:line evidence, matching the format of the other closed tickets.

---

## ICW-15 — Prompt-config hygiene: duplication, bounds, stub ✅

**Priority: P2** · Size: S · Files: `server/services/AiSettingsService.ts`, `server/routes/ai/workflowEdit.routes.ts`, `server/routes/admin.aiSettings.routes.ts`

### Finding

1. **Duplicated default prompt:** `DEFAULT_SYSTEM_PROMPT` lives in
   `AiSettingsService.ts:6-23` **and** is re-inlined as the fallback template
   in `buildSystemPrompt` (`workflowEdit.routes.ts:342-359`). Two copies will
   drift.
2. **Unbounded admin input:** `PUT /api/admin/ai-settings` validates only
   `z.string().min(10)` (`admin.aiSettings.routes.ts:44`) — no max length, no
   placeholder validation. An admin can store a multi-megabyte or
   placeholder-less prompt that silently degrades every AI edit.
3. **Stub hierarchy:** `getEffectivePrompt(userId, orgId)` ignores both params
   (prefixed `_`) and only returns the global row or the default
   (`AiSettingsService.ts:32`).

### Preferred fix

- Delete the inline fallback in `buildSystemPrompt`; import
  `DEFAULT_SYSTEM_PROMPT` from the service (single source).
- Admin PUT: add `.max(20_000)` and a warning-level response field if none of
  the three documented placeholders (`{{interviewerRole}}`, `{{readingLevel}}`,
  `{{tone}}`) appear — warn, don't reject (an admin may legitimately want a
  static prompt). Mirror the max in the `AdminAiSettings.tsx` textarea
  (`maxLength` + counter). **UI change → design skill.**
- The per-user/per-org hierarchy: **do not build it now.** Replace the dead
  params with a documented TODO referencing this ticket, or remove them —
  reviewer preference is to *remove* the unused params and re-add when the
  feature is scheduled (dead parameters imply behavior that doesn't exist).

### Acceptance criteria

1. Exactly one definition of `DEFAULT_SYSTEM_PROMPT` in the codebase (grep-proven).
2. PUT with a >20k-char prompt → 400; a valid prompt missing all placeholders → 200 with a `warnings` array; UI shows the warning.
3. `getEffectivePrompt`'s signature matches what it actually does.
4. Existing AI settings tests + `AdminAiSettings` behavior verified in dev app.

---

## ICW-16 — AI edit: snapshot-failure policy is an unanswered question in code ✅

**Priority: P2** · Size: XS–S · File: `server/routes/ai/workflowEdit.routes.ts`

### Finding

The BEFORE snapshot (`:104`) is the rollback safety net for AI edits, but its
failure path just logs and proceeds — with the literal comment
`// Continue? Or fail?` (`:110`). As shipped, an AI edit can mutate a workflow
with **no** pre-edit snapshot, breaking the rollback story the feature is sold on.

### Preferred fix

**Fail closed.** If the BEFORE snapshot cannot be created, abort the edit with
a 503-style "try again" error before any mutation. Rationale: the whole AI-edit
trust model (audit metadata + before/after snapshots) presumes the snapshot
exists; proceeding without it is silent data-safety erosion. The AFTER-snapshot
failure (`:193-207`) may remain log-and-continue (the edit is already applied
and versioned; losing the after-snapshot degrades convenience, not safety) —
but log it at `error`, not lower.

### Acceptance criteria

1. Simulated BEFORE-snapshot failure → request aborts with a clear retriable error; workflow unmodified (no ops applied, no version created).
2. The `// Continue? Or fail?` comment is gone, replaced by a one-line rationale.
3. Integration test covers criterion 1 (mock the snapshot service to throw).

---

## ✅ PHASE 3 GATE — reviewer verification & commit

```bash
npm run type-check && npm run lint
npm run test:fast
npm run test:integration -- tests/integration/ai/   # all AI integration files
```

Manual (`verify` skill): run one real AI edit in the dev app (needs
`GEMINI_API_KEY`); confirm the edit works end-to-end through the registry path
and the telemetry log line appears.

Suggested commit: `refactor(ai): route interview edit through provider registry; close SEC-038/SEC-039; prompt-config hygiene (ICW-13..16)`

Also update `AI_SECURITY_REMEDIATION_TICKETS.md` statuses in the same commit.

---

# Phase 4 — Test coverage & consolidation

Locks in Phases 1–3 and closes the audit's coverage gaps.

## Implementation pass — 2026-07-15

All four Phase 4 tickets implemented. Highlights:

- **ICW-17:** new `tests/integration/creation-routes.test.ts` (16 cases) exercises
  `POST /api/workflows` (201/400/403/404), `POST .../sections` (201+auto-order/401/403/404),
  `POST .../steps` + the simplified `POST /api/sections/:id/steps` (201/invalid-alias/dup-alias/
  invalid-config), and the ICW-11 caps (400). Real HTTP via `setupIntegrationTest`. Caps are
  tested by mutating the shared (non-frozen) `LIMITS` object with restore in `afterEach` —
  env overrides resolve once at import, so direct mutation is the reliable equivalent and hits
  the same service code path. **Contract fix landed here:** invalid-alias-format and duplicate-alias
  errors were returning **500** (their messages match no `classifyRouteError` 4xx trigger); they now
  carry `statusCode: 400` (`stepAlias.validateAliasFormat`, `StepService.validateAliasUniqueness`) —
  the idiomatic `statusCode` path, same mechanism as `LimitExceededError`, message preserved.
- **ICW-18:** extended `tests/unit/services/SectionService.test.ts` to 5 `createSection` cases
  (explicit happy-path + order-1-when-empty + verifyAccess arg check, auto-order, ICW-11 cap,
  access-denied, workflow-not-found).
- **ICW-19:** new `tests/unit/services/ai/AIServiceUtils.test.ts` (6 `fenceUntrusted` cases) plus
  7 integration cases added to `tests/integration/ai/workflowEdit.test.ts`: prompt-injection fencing
  assertion on the captured provider call, non-JSON→500 and schema-fail→400 (no ops/version),
  cross-workflow section IDOR, foreign `logicRule.delete`, foreign `datavault.createTable` databaseId,
  and an isolated rate-limit 429 (fresh app + re-imported route at `AI_TENANT_RPM_LIMIT=2`, so the
  shared per-tenant bucket isn't drained). SEC-035/037/040 annotated with the new coverage in
  `AI_SECURITY_REMEDIATION_TICKETS.md`.
- **ICW-20:** shared `CreateWorkflowForm` (RHF + Zod) now backs both `NewWorkflow` (manual tab) and
  the `ProjectView` create dialog; `useCreateSectionAtEnd(workflowId)` backs both `PageCanvas` and
  `SidebarTree` (fixes the SidebarTree trailing-space title). AI tab derives the title from the
  first ~40 chars of the prompt; empty title now surfaces as an inline field error (not just a toast).
  Verified live (dev app): inline empty-title error, manual create → 201 → builder, dialog create →
  201 → dialog closes + workflow appears, and builder "Add Page" → 201.

**Gate run (Claude, 2026-07-15):** `npm run type-check` → 0 errors · lint on all touched files →
clean · `npm run test:fast` → 1678 passed / 15 skipped (incl. new SectionService + fenceUntrusted) ·
`tests/integration/creation-routes.test.ts` → 16/16 · `tests/integration/ai/workflowEdit.test.ts` →
17/17 (Docker PG 5434). Left for reviewer: full `npm run test:integration` + `npm test` per the phase gate.

> Environment note surfaced during live verification: the **dev DB** was missing the post-baseline
> `users.is_active` column (and a few other known-drift columns), which 500s all registration/login.
> Fixed additively (`ADD COLUMN IF NOT EXISTS`, mirroring the test-harness failsafes) — `drizzle-kit push`
> can't run here (it requires a TTY and wanted to resolve table conflicts). Unrelated to Phase 4.

---

## ICW-17 — E2E HTTP tests for the manual create routes ✅

**Priority: P1** · Size: S–M · New file: `tests/integration/creation-routes.test.ts` (suggested)

### Finding

No integration test exercises the routes users hit most:
`POST /api/workflows/:id/sections` (`sections.routes.ts:57`) and
`POST /api/workflows/:id/sections/:sectionId/steps` (`steps.routes.ts:90`) —
including their simplified variants. Existing coverage is service-unit
(`StepService.test.ts`) and AI-op level only. The `POST /api/workflows` error
branches (ICW-1) also lack tests.

### Preferred fix

One integration file covering the manual creation lifecycle over HTTP
(supertest, per the patterns in `tests/integration/api.workflows.test.ts`;
follow the `run-tests` skill for DB setup):

- workflow create: 201 happy path; 400 malformed; 403 foreign project; 404 missing project (ICW-1's contract)
- section create: 201 + auto-order; 401 unauth; 403 non-editor; 404 foreign workflow
- step create: 201 with alias; 400 invalid alias format; 400 duplicate alias; 400 invalid config (post ICW-10); simplified-route parity
- caps: 400 at the ICW-11 limits (use env overrides to set tiny limits for the test)

### Acceptance criteria

1. All listed cases implemented and green in the integration project.
2. Tests use real HTTP through the app (route + middleware exercised), not service calls.
3. File runs green in the full `npm run test:integration` pass, not just standalone (per run-tests skill's known ordering caveats).

---

## ICW-18 — `SectionService.createSection` unit tests ✅

**Priority: P2** · Size: XS · New/extended file: `tests/unit/services/SectionService.test.ts`

### Finding

`StepService.createStep` has thorough unit coverage
(`tests/unit/services/StepService.test.ts:58-256`); its sibling
`SectionService.createSection` (`SectionService.ts:33`) has none.

### Preferred fix

Mirror the StepService test structure (note the project-memory gotcha: the
shared `vi.mock` of repositories exposes ONE `findById` mock across repo
singletons — dispatch by id). Cover: happy path, auto-order increment,
workflow-not-found, access-denied, and the ICW-11 cap.

### Acceptance criteria

1. ≥5 cases above green in unit-fast.
2. Follows the existing mock-dispatch-by-id pattern (no cross-test mock bleed).

---

## ICW-19 — AI route security tests: injection, malformed output, authz ✅

**Priority: P1** · Size: M · File: `tests/integration/ai/workflowEdit.test.ts` (+ unit tests near the fencing utility)

### Finding

The AI edit tests mock auth and the model entirely, so the security-critical
code is never exercised. Missing (several are named acceptance criteria of
already-"closed" SEC tickets):

- **No prompt-injection test** — nothing asserts `fenceUntrusted`
  (`AIServiceUtils.ts:273`) neutralizes fence/role markers in `userMessage` or
  step titles (SEC-040's core concern).
- **No malformed-AI-JSON test** — the `aiModelResponseSchema` rejection path
  (`workflowEdit.routes.ts:324`) is untested.
- **No 403 test** (verifyAccess denied), no cross-workflow IDOR test at route
  level (SEC-035/037 criteria), no `logicRule.delete` foreign-rule test, no
  foreign `databaseId` datavault test, no rate-limit test.

### Preferred fix

Write against the post-ICW-13 provider seam:

1. **Unit tests for `fenceUntrusted`:** inputs containing the fence delimiter
   itself, `system:`/role-marker strings, and markdown fences must come out
   neutralized per the function's contract. Then one integration assertion that
   the prompt sent to the (mocked) provider has both untrusted segments fenced.
2. **Malformed output:** provider mock returns non-JSON / JSON failing the
   schema → route responds 4xx/5xx per ICW-2's mapping, **no ops applied, no
   version created**.
3. **Authz:** editor-role-missing user → 403; op referencing a step id from a
   *different* workflow → per-op error, nothing applied (locks in
   `assertEntityBelongsToWorkflow`); `logicRule.delete` on a foreign rule and
   `datavault.createTable` with a foreign `databaseId` → rejected.
4. **Rate limit:** exceed `aiWorkflowRateLimit` in-test (lower the cap via env
   if configurable post-ICW-13) → 429.

### Acceptance criteria

1. All four groups implemented and green.
2. The IDOR tests satisfy the written acceptance criteria of SEC-035/SEC-037; note this in `AI_SECURITY_REMEDIATION_TICKETS.md`.
3. Green in the full integration pass.

---

## ICW-20 — Consolidate duplicated creation logic in the builder UI ✅

**Priority: P3** · Size: S · Files: `client/src/pages/NewWorkflow.tsx`, `client/src/pages/ProjectView.tsx`, `client/src/components/builder/sections/PageCanvas.tsx`, `SidebarTree.tsx`

### Finding

- Workflow-create logic exists twice: the `NewWorkflow` page (`:36-68`) and an
  independent inline dialog in `ProjectView.tsx:507-511` (which also passes
  `projectId: ""` as a string literal on the template path — `NewWorkflow.tsx:107-129`).
- Section-create handler implemented independently in `PageCanvas.tsx:55-62`
  and `SidebarTree.tsx:44-51`.
- `NewWorkflow`'s AI tab hardcodes the title `"AI Generated Workflow"` (`:83`).
- Hand-rolled `useState` validation instead of the stack's React Hook Form + Zod.

### Preferred fix

- Extract one `useCreateSectionAtEnd(workflowId)` hook used by both canvas and
  sidebar.
- Extract a shared `CreateWorkflowForm` (RHF + Zod: title required ≤255,
  description optional) used by both the page and the ProjectView dialog;
  ProjectView passes its `projectId`.
- AI tab: derive a title from the first ~40 chars of the prompt instead of the
  hardcoded constant (the AI edit can rename it later, but the list view
  shouldn't fill with identical names).
- **UI change → design skill required.**

### Acceptance criteria

1. One section-create implementation, one workflow-create form (grep shows no duplicates).
2. Both entry points work in the dev app (screenshot/manual pass per `verify` skill).
3. Empty-title submit is blocked with an inline field error (not just a toast).
4. AI-created workflows get a prompt-derived title.
5. `npm run type-check`, `npm run lint`, `npm run test:fast` green.

---

## ✅ PHASE 4 GATE — reviewer verification & commit

```bash
npm run type-check && npm run lint
npm test        # full suite, single-fork + coverage — the CI-equivalent run
```

Suggested commit: `test(creation): e2e create-route coverage, AI security tests, builder consolidation (ICW-17..20)`

After this gate, re-grade: Phases 1–4 complete should move the creation
workflow from **B-** to **A-** territory. Remaining distance to A is the backlog below.

---

# Backlog — separate projects (not phase-gated)

These are pre-existing roadmap items surfaced by the audit. They are **not**
part of the 4-phase commitment; each needs its own plan.

## ICW-B1 — Complete the step-editor migration (retire `LegacyStepBody`)

Size: L. The per-type card editors + `LegacyStepBody` catch-all
(`StepEditorRouter.tsx:101-104`) is an incomplete migration held together by 9
`import/no-cycle` eslint-disables (circular imports between router and
editors). Finish migrating remaining step types to card editors, break the
cycles (extract shared types to a leaf module), delete `LegacyStepBody`.
Inventory which of the 38 step types still hit the fallback before estimating.

## ICW-B2 — RLS Phase 4 for `workflows`/`sections`/`steps` (SEC-051)

Size: L. These tables have no `tenant_id` and **no RLS policy at all** — they
are the "indirectly-scoped" tables deferred to Phase 4 in
`docs/architecture/TENANT_ISOLATION_RLS.md` §5. Creation isolation currently
rests entirely on the service-layer `verifyAccess` convention (which the audit
found correctly and uniformly applied — but it is a single point of failure).
Follow the staged plan in the RLS doc; never set the tenant GUC session-level
(SEC-051). Requires deriving tenancy through the ownership model
(`ownerType`/`ownerUuid` → org/workspace), which is design work, not a
mechanical policy add.

---

## Audit cross-reference (what closed what)

| Audit finding | Ticket |
|---|---|
| `POST /api/workflows` always 500 | ICW-1 |
| AI edit dead error branch | ICW-2 |
| `replaceWorkflowContent` non-atomic | ICW-3 |
| Ingest skips alias format check | ICW-4 |
| Scratch comments / `as any` in builder shell | ICW-5 |
| CLAUDE.md "5-tab" drift | ICW-6 |
| Silent save failures | ICW-7 |
| Per-keystroke PATCH storm | ICW-8 |
| Step config jsonb unvalidated | ICW-9, ICW-10 |
| No manual-path size caps | ICW-11 |
| Un-transacted reorders | ICW-12 |
| AI route bypasses provider registry / hardcoded model / SEC-038 residual | ICW-13 |
| SEC-039 open (model output in logs) | ICW-14 |
| Duplicated default prompt / unbounded admin prompt / stub hierarchy | ICW-15 |
| Snapshot-failure `// Continue? Or fail?` | ICW-16 |
| No e2e tests for manual create routes | ICW-17 |
| No SectionService unit tests | ICW-18 |
| No prompt-injection / malformed-JSON / IDOR route tests | ICW-19 |
| Duplicated create logic, hardcoded AI title, no RHF+Zod | ICW-20 |
| Legacy editor migration debt | ICW-B1 |
| RLS gap on creation tables | ICW-B2 |

**Maintainer:** audit of 2026-07-14 · Reviewer signs off each phase gate before the next phase starts.
