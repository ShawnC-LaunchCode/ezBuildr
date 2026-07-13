# Interview Runner Hardening — Tickets (RUN-1..12)

Source: interview-runner condition report, 2026-07-13. Four parallel code audits
(client runner, server run lifecycle, document engine, workflow/step data
contract) plus first-hand tracing of the completion→document seam. RUN-2 is
verified with a reproducible proof (see its ticket).

## Goal (the target architecture)

Three clean layers with hard boundaries between them:

```
Creation (AI / manual / template)
        │  ── break 1 ──
        ▼
Run the interview  ──►  ONE canonical answer object (key/value)
        │  ── break 2 ──
        ▼
Document generation (consumes that object, resolves {{alias}})
```

The run's entire job is to gather key/value pairs into one all-encompassing
object; documents consume that object and nothing else. The runner must behave
identically regardless of how the interview was authored.

## Conformance summary (current state)

| Boundary | Status | Note |
|---|---|---|
| Creation → Run | ✅ Conforms | Runner never branches on authoring origin; dispatches purely on `step.type` + generic `section.config`. |
| Run gathers ONE object | ⚠️ Not yet | No canonical object; two on-demand projections keyed differently (stepId vs alias); alias not persisted. |
| Run → Document break | ⚠️ Violated | Renderer seam is clean, but the two entry points feed differently-keyed objects and the primary (completion) path is wrong (RUN-2). |

**Overall grade at time of writing: C+.** Strong skeleton; the specific weak
spots are the two boundaries this product depends on most.

## Relationship to DOC-101..112

This backlog is runner/handoff-focused and deliberately does **not** duplicate
`DOCUMENT_AUTOMATION_TICKETS.md`. Cross-references:

- **Autosave reliability** → covered by **DOC-101** (note: `useAutoSave` is now
  wired in `useRunValues.ts`; DOC-101's "wired to nothing" premise is stale —
  reframe it as *reliability* (retry/queue) rather than *existence*).
- **Runner decomposition + single visibility/validation path** → **DOC-102**.
- **One condition engine** → **DOC-103** (RUN-11 is a concrete subset).
- **Missing-variable visibility** → **DOC-104** (shipped).
- **Shared foundations for the AI path** → **DOC-105** (RUN-1 and RUN-4 are the
  data-object and single-pipeline halves of this).
- **PDF strategy** → **DOC-107** (RUN-5 is a concrete crash under this umbrella).
- **Completion-phase transform outputs** → **DOC-108** — *superseded/corrected by
  RUN-2* (see RUN-2: DOC-108(b) was implemented but stepId-keyed, which
  regressed all alias variables, not just computed ones).
- **Accessibility** → **DOC-111**. **Loading/error polish** → **DOC-112**
  (RUN's "top-level error boundary + no raw error text to end users" belongs
  here).

---

## RUN-1 — Define one canonical Run Data Object

**Priority: P1 (this IS "break 2" done right; foundation for AI path).** Size: M
**Depends on: RUN-6 (assume the step config field is `config`).**

### What's wrong

There is no single "collected answers" object. The run's answers are re-derived
on demand in two different shapes, and each caller picks whichever it happens to
use:
- `getRunDataAsJson(runId)` → `{ [stepId]: value }`
  (`server/repositories/StepValueRepository.ts:48-55`) — used by block execution
  and completion validation (which key on stepId; see RUN-2 design constraint).
- `getRunDataWithAliases(runId, steps)` → `{ [alias ?? stepId]: value }`
  (`:60-72`) — used by document rendering (templates key on alias).

The alias is never stored on `step_values` (`shared/schema/run.ts:86-98`); it's a
runtime join off `steps`. Consequences: (a) the stepId↔alias split is the root
enabler of RUN-2 (a caller can forward the wrong shape); (b) renaming an alias
mid-run silently changes the document key space for that run; (c) there is no one
place that defines "the object the interview produces," which is exactly the
artifact the product concept ("gather key/values into one all-encompassing
object") calls for.

### Recommended design (my call)

Introduce one owner of run data — e.g. `RunDataService` (or extend
`StepValueRepository` with a single public builder) — that produces **one object,
two labeled views from the same source**, built once per request:

```ts
interface RunData {
  byStepId: Record<string, unknown>;   // for logic/validation/blocks
  byAlias:  Record<string, unknown>;   // for documents (alias, else stepId)
  steps:    StepMeta[];                // the alias/type map used to build both
}
```

- `byStepId` is what blocks + `LogicService` + `workflowLogic` consume (they key
  on stepId — do not change that).
- `byAlias` is what document generation consumes; it is `byStepId` mapped through
  the same `toAliasKeyed` logic RUN-2 introduces (stepId→alias, other keys pass
  through so transform/computed outputs survive).
- Build it once and thread it, rather than each site re-querying `step_values`
  (also helps DOC-106's N+1 concern).

Then: completion validation uses `runData.byStepId`; `generateDocuments` and
`/generate-final` use `runData.byAlias`. Delete direct calls to
`getRunDataAsJson`/`getRunDataWithAliases` from those call sites (keep them as
private internals of the builder if convenient).

My comment: keep the two views explicit rather than pretending one object with
mixed keys serves everyone — the stepId vs alias split is real (logic needs ids,
docs need names), and hiding it behind a single ambiguous map is how RUN-2
happened. One builder, two named views, one source of truth.

### Acceptance criteria
- [ ] Exactly one service/function builds run data; `getRunDataAsJson` / `getRunDataWithAliases` are not called directly by completion, `/generate-final`, or block execution (they may remain private internals).
- [ ] The builder exposes both a stepId-keyed view (logic/validation) and an alias-keyed view (documents) derived from one fetch.
- [ ] Document generation consumes the alias-keyed view on BOTH the completion and manual paths (closes RUN-2 structurally).
- [ ] Logic/validation consume the stepId-keyed view (no behavior change).
- [ ] Unit test: a run with mixed aliased/un-aliased steps + a computed/transform output produces the documented shapes, with the computed output present in the alias view.
- [ ] The key contract ("alias, else stepId") and the two-views rationale are documented next to the builder.

---

## RUN-2 — Completion auto-generates BLANK documents (stepId vs alias) ✅ VERIFIED

**Priority: P0 (silent data loss on the primary end-user path).** Size: S–M
**Status: root cause confirmed + reproduced. Ready to implement.**

### What's wrong

When a run completes, documents are generated from a **stepId-keyed** object, but
templates reference variables by **alias** (`{{clientName}}`), so every variable
renders blank.

Trace:
1. `RunCompletionService.complete` builds `dataMap = getRunDataAsJson(runId)` —
   keyed by **stepId** (`server/repositories/StepValueRepository.ts:48-55`).
2. It runs `onRunComplete` blocks: `blockResult = blockRunner.runPhase({ data: dataMap })`.
   `runPhase` seeds `currentData = { ...context.data }` and only *spread-merges*
   hook/transform outputs onto it — it **never re-keys to aliases**
   (`server/services/BlockRunner.ts:114,143,183,221`).
3. It passes that stepId-keyed result straight to generation:
   `generateDocuments(runId, blockResult.data)`
   (`server/services/workflow-runs/RunCompletionService.ts:101`).
4. `generateDocumentsInner` uses the passed `currentData` verbatim when present:
   `const stepValues = currentData ?? getRunDataWithAliases(...)`
   (`server/services/workflow-runs/RunLifecycleService.ts:377`) — so the
   alias-keyed fallback is skipped exactly on the completion path.
5. `normalizeVariables` cannot recover an alias from a stepId key, so
   `{{alias}}` hits the `nullGetter` → renders `''` and is logged as unresolved.

The manual `/generate-final` route does this correctly — it was fixed in
`bb048426` to use `getRunDataWithAliases`
(`server/routes/finalBlock.routes.ts:161-168`). So the two paths disagree, and
the **primary** (auto-on-completion) path is the broken one. This also
supersedes **DOC-108**: DOC-108(b) ("thread completion's post-block data into
generateDocuments") was implemented, but stepId-keyed — which regressed *all*
variables, not just the computed ones DOC-108 was about.

### Verified (2026-07-13)

Ran the real `enhancedDocumentEngine.renderFinalBlock` against a template
`"Client name: {{clientName}}"`, value `"Ada Lovelace"`, changing only the key:
- alias-keyed `{ clientName: "Ada Lovelace" }` → `"Client name: Ada Lovelace"`, `unresolvedVariables: []`
- stepId-keyed `{ "<uuid>": "Ada Lovelace" }` → `"Client name:"` (blank) + `unresolvedVariables: ["clientName"]`

### Design constraint (do NOT just switch everything to alias keys)

Run validation and logic **require stepId keys**: `LogicService.validateCompletion`
reads `data[rule.conditionStepId]` off `getRunDataAsJson`
(`server/services/LogicService.ts:129,166,200,…`) and `shared/workflowLogic.ts`
reads `data[stepId]` (`:135,364`). So the stepId-keyed map must keep feeding
blocks + validation. Only the **document handoff** needs alias keys. The fix is a
conversion at that one boundary, not a global change.

### Recommended fix (my call)

Convert to alias keys **only** where completion hands off to generation, and
preserve the `onRunComplete` outputs already merged into `blockResult.data`.
Concretely, a small pure helper (which RUN-1 should own once it lands):

```ts
// key by alias when the key is a stepId that has an alias; otherwise keep it
// (transform output names, virtual-step aliases, already-aliased keys pass through)
function toAliasKeyed(data, steps) {
  const aliasByStepId = new Map(steps.filter(s => s.alias).map(s => [s.id, s.alias]));
  const out = {};
  for (const [k, v] of Object.entries(data)) out[aliasByStepId.get(k) ?? k] = v;
  return out;
}
```

Then `RunCompletionService.complete` calls
`generateDocuments(runId, toAliasKeyed(blockResult.data, steps))`. This keeps
DOC-108's intent (transform outputs survive because they were merged into
`blockResult.data`) **and** resolves `{{alias}}`. I strongly prefer doing this
as part of RUN-1 (one canonical builder) rather than a standalone patch, so the
two paths can't drift again — but if RUN-1 slips, ship the helper now; it's the
same code RUN-1 will absorb.

### Acceptance criteria
- [ ] Completing a run auto-generates documents with `{{alias}}` values populated (not blank).
- [ ] Un-aliased steps still key by stepId (documents can't reference them anyway) — no crash, no key collision.
- [ ] `onRunComplete` transform/computed outputs still appear in the document under their alias (DOC-108 intent preserved) — covered by a test with a compute transform.
- [ ] Run validation/logic still operate on stepId-keyed data (no regression in required-step or visibility checks).
- [ ] Completion and `/generate-final` produce identical variable resolution for the same run — assert equality in a test.
- [ ] Regression test completes a real run end-to-end and asserts the generated DOCX contains the answer text and `unresolvedVariables` is empty for collected fields.
- [ ] Duplicate-alias behavior is defined (last-wins or rejected) and noted; ties into RUN-3.

---

## RUN-3 — Alias integrity (present + unique per workflow)

**Priority: P2.** Size: M
**Related: RUN-1/RUN-2 (alias is the document key; its integrity must be guaranteed).**

### What's wrong

Aliases are the key space documents resolve against, but their integrity isn't
guaranteed at two levels:

- **Scope mismatch.** The DB unique index is **per section** —
  `steps_section_alias_unique` on `(sectionId, alias)`
  (`shared/schema/workflow.ts:272`) — while application code enforces
  **per-workflow** uniqueness (`StepService.validateAliasUniqueness`). So two
  steps in different sections can share an alias and the DB won't stop it. Since
  the client alias resolver returns the *first* match
  (`client/src/hooks/runner/useSectionVisibility.ts:13-17`) and the document
  builder keys by alias, a cross-section duplicate silently misroutes values.
- **Nullability.** `steps.alias` is nullable and Postgres treats NULLs as
  distinct, so many null-alias steps coexist. A document-referenceable step with
  a null alias can't be addressed in a template at all.
- **Enforcement gap.** Any insert path that bypasses `StepService`
  (bulk ingest, AI apply, direct writes) can create duplicate/null aliases the
  app-level check never sees.

### Recommended fix (my call)

- Replace the per-section index with a **partial unique index on
  `(workflowId, alias) WHERE alias IS NOT NULL`** via the `db-schema-change`
  skill. (Note: `alias` lives on `steps` but `workflowId` is reached via
  `section`; either denormalize `workflowId` onto `steps` for the index, or
  enforce via a trigger/constraint. Denormalizing `workflowId` onto `steps` is
  the cleaner long-term move and helps other queries — flag this sub-decision in
  the PR.)
- Guarantee a non-null alias for every non-virtual question step at creation
  (route all insert paths through the same alias-generation used by
  `StepService.createStep`).
- Builder rejects duplicate aliases inline with a clear message.

My comment: pair this with RUN-1 — the canonical object's alias view is only
trustworthy if aliases are unique and present. Do the `workflowId`-on-`steps`
denormalization here rather than fighting a cross-table unique constraint.

### Acceptance criteria
- [ ] DB rejects two steps in the same workflow sharing a non-null alias (partial unique index enforced at the DB, not just app code).
- [ ] Every non-virtual question step gets a non-null alias on creation, through every insert path (per-step, bulk ingest, AI apply).
- [ ] Builder surfaces a clear inline error on duplicate alias.
- [ ] Migration added and validated per the `db-schema-change` skill, including how existing duplicate/null aliases are resolved before the constraint is applied.
- [ ] A test proves the alias resolver has exactly one target per alias in a workflow.

---

## RUN-4 — Unify the two document-generation entry points

**Priority: P1.** Size: M
**Depends on: RUN-1 (data object), RUN-2 (keying). Absorbs RUN-12.**

### What's wrong

There are two independent implementations of "turn a completed run into
documents," and they have already drifted:

- **Automatic:** `RunLifecycleService.generateDocumentsInner`
  (`server/services/workflow-runs/RunLifecycleService.ts:332-441`) — discovers
  final-block configs from step `options` for types `'final'`/`'final_documents'`
  **and** synthesizes a legacy config from `section.config.finalBlock`
  (`buildLegacyFinalBlockConfig`, `:449-481`), renders, and persists
  `run_generated_documents` including `unresolvedVariables` + `pdfStrategy`
  (`:405-420`).
- **Manual:** `POST /api/runs/:runId/generate-final`
  (`server/routes/finalBlock.routes.ts`) — its own resolve/render/persist.

Drift already present:
- Manual validates `step.type !== 'final'` only, missing `'final_documents'`
  (`finalBlock.routes.ts:151`).
- Manual persistence omits `unresolvedVariables`/`pdfStrategy` (`:212-221`) that
  the automatic path writes — so a doc made via `/generate-final` has an empty
  unresolved list even when tags were missing (undercuts DOC-104).
- Legacy config resolution uses `findById` (no tenancy scope) vs the primary
  `findByIdAndProjectId` — that's RUN-12, fix it here.

### Recommended fix (my call)

One shared `generateRunDocuments(runData, opts)` that both callers invoke:
- takes the alias-keyed view from RUN-1 (no re-reading `step_values`);
- discovers configs from ALL shapes in one place (`final` + `final_documents`
  step `options` + legacy `section.config.finalBlock`);
- renders via `finalBlockRenderer` and persists `run_generated_documents`
  identically (always writing `unresolvedVariables` + `pdfStrategy`);
- uses tenancy-scoped template resolution everywhere (closes RUN-12).
The route becomes a thin auth+params wrapper over it; completion calls the same
function.

My comment: sequence this right after RUN-1/RUN-2 — it's mostly deletion once the
data object exists, and it's the structural guarantee that "the run→document
break behaves the same no matter who triggers it." Fold RUN-12 in rather than
shipping it separately; they touch the same code.

### Acceptance criteria
- [ ] Both callers invoke one function; no duplicated resolve/render/persist logic remains.
- [ ] Both `final` and `final_documents` step types + legacy section config are discovered in one place.
- [ ] Documents from either path carry identical `unresolvedVariables`/`pdfStrategy` and identical variable resolution for the same run.
- [ ] All template resolution is tenancy-scoped (`findByIdAndProjectId`); RUN-12 closed.
- [ ] Test asserts completion and `/generate-final` yield byte-identical document content + metadata for one run.

---

## RUN-5 — `pdfStrategy` ReferenceError crashes PDF generation

**Priority: P2 (hard crash on the PDF path).** Size: S — concrete case of DOC-107

### What's wrong

`FinalBlockRenderer.render` accepts `pdfStrategy` in its request interface
(`server/services/document/FinalBlockRenderer.ts:60-61`) but does **not**
destructure it in the method body (`:130-139` pulls out `finalBlockConfig`,
`stepValues`, `workflowId`, `runId`, `resolveTemplate`, `toPdf`, `outputDir` —
not `pdfStrategy`). Then `prepareResponseDocuments(results, toPdf)` — whose
signature has no `pdfStrategy` param (`:332-335`) — references a bare
`pdfStrategy` at `:355`. When `toPdf === true`, that line evaluates the
identifier and throws `ReferenceError: pdfStrategy is not defined`, aborting
response prep for every PDF generation.

(It hasn't bitten the completion path yet only because that path calls `render`
without `toPdf`, so `toPdf` defaults false and the branch is skipped. The manual
`/generate-final` route passes `toPdf`/`pdfStrategy` from the request, so it
crashes when a user asks for PDF.)

### Recommended fix (my call)

Thread the value: destructure `pdfStrategy` (with a `'puppeteer'` default) in
`render`, and pass it into `prepareResponseDocuments(results, toPdf, pdfStrategy)`
(add the param). Trivial. While here, add a regression test that actually
exercises `toPdf: true` end-to-end so this can't silently regress — DOC-107
("PDF strategy honesty") is the natural home for broader PDF-fidelity work, but
this crash should be fixed immediately regardless.

### Acceptance criteria
- [ ] A `toPdf: true` generation completes without `ReferenceError`.
- [ ] The persisted `pdfStrategy` on `run_generated_documents` reflects the strategy actually used.
- [ ] A test exercises the `toPdf: true` path through `finalBlockRenderer.render` and asserts a PDF (or the intended fallback) is produced.

---

## RUN-6 — `steps.options` (storage) vs `step.config` (code): the config contract is broken ✅ VERIFIED

**Priority: P1 (authored settings silently don't persist or apply).** Size: M–L
**Status: root cause confirmed + reproduced. Fix = full rename to `config` (Option B, chosen). Affects the builder too, not just the runner.**

### What's wrong

The step-configuration field name split during the easy/advanced-mode work and
was never reconciled:

- **Storage + schema + every persist path use `options`.** The column is
  `steps.options` — there is no `config` column
  (`shared/schema/workflow.ts:261`). `insertStepSchema = createInsertSchema(steps)`
  therefore has no `config` key (`:443`). All write paths use `options`:
  per-step create/update routes (`server/routes/steps.routes.ts:96,189,256`),
  and the bulk ingest service (`server/services/WorkflowContentIngestService.ts:160,175`
  — it even declares a `config?` field on its input type but ignores it).
  `StepService` is a passthrough; `StepRepository` selects/returns `options`
  and nothing maps `options`→`config` (the only such mapping in the server is
  the AI-representation shim `server/routes/ai/workflowEdit.routes.ts:388`, not
  the runner/builder read path).
- **All client code uses `config`.** Every card editor writes `{ config }` and
  reads `step.config` (e.g. `AddressCardEditor.tsx:34,60`; same in Boolean,
  Number, Choice, Email, Phone, Scale, MultiField, Display editors). Every
  runner block reads `step.config` (e.g. `DateBlock.tsx:31`,
  `BooleanBlock.tsx:47-57`). `SectionSteps` does not map `options`→`config`
  (`SectionSteps.tsx:44-57`).

### Proven consequences

- **Write drops config (tested).** `insertStepSchema.partial().parse({ type, config, options })`
  returns `{ type, options }` — Zod strips the unknown `config` key (no
  `.passthrough()`). So `PUT /api/steps/:id` **silently discards** the `config`
  every card editor sends. Verified by executing the schema directly.
- **Read never provides config.** The server returns `options`; `step.config`
  is always null/undefined to editors and the runner.
- **Why the builder still "seems to work" — it's masked, type-dependent:**
  - `ChoiceBlock` falls back to the persisted column:
    `config?.options || legacyStep.options?.options`
    (`client/src/components/runner/blocks/choice/useChoiceOptions.ts:150`).
    Choices genuinely live in `options`, so choice authoring survives.
  - `BooleanBlock` (and Number/Date/Scale/etc.) read `step.config?.…` with
    **hardcoded defaults and no `options` fallback**
    (`BooleanBlock.tsx:47-57`). Their settings (custom yes/no labels, min/max,
    date format, scale range) are lost — dropped on write *and* absent on read.
    So a boolean with custom labels silently reverts to "Yes/No" both in the
    builder (after refetch) and in the runner.

Net: this directly breaks "renders identically regardless of how it was
authored" — but more importantly, **most non-choice authored settings never take
effect at runtime at all.**

### Secondary finding (verify + likely fold in)

The runner fetches `GET /api/workflows/:workflowId/steps`
(`client/src/pages/WorkflowRunner.tsx:50`), but **no route handler with that
path exists** (only section-scoped `…/sections/:sectionId/steps`,
`/api/sections/:sectionId/steps`, and `/api/steps/:stepId`). Could not confirm
live because a blanket `/api/*` auth guard returns 401 for unauthenticated
requests regardless of route existence, and `WorkflowRunner.tsx` is mid-refactor
(uncommitted). **Confirm whether this fetch 404s in production** — if so the
runner's whole step-load path is broken/dead and steps come from elsewhere. Fix
here (add the endpoint or point the runner at the section-scoped one) and make
it return the `config`-populated shape (below).

### Chosen fix — full unification on ONE name (`config`), end to end

Decision (2026-07-13, product owner): do NOT use a translation shim. Rename the
field to `config` everywhere so there is exactly one name and no hidden mapping
that a future endpoint can forget. Rationale: the bug exists *because* of the
dual-name/implicit-mapping situation; a shim would contain that duplication but
preserve the trap. This is genuinely ONE field (the jsonb type-specific config
blob — the `options` column already holds config-shaped objects like
`{ options: [...] }`, `{ dateTimeType }`, and full advanced-choice configs), so
a rename is honest, not a conflation. Cost is one-time churn plus a short
bug-flushing tail; the reward is permanent.

Good news that shrinks the churn: **the client already speaks `config`** — every
card editor and every runner block reads/writes `config`. So this is mostly a
*server-side + legacy-panel* unification, not a whole-codebase rename.

Work items:
1. **DB migration (`db-schema-change` skill):** rename column `steps.options` →
   `steps.config`. Renaming a jsonb column preserves data as-is (no value
   transformation). Handle the migration journal per the skill.
2. **Schema/repo/service:** rename in `shared/schema/workflow.ts` (`options` →
   `config`, so `insertStepSchema` now has `config`), `StepRepository`
   selects/returns `config`, `StepService` passes `config`.
3. **All server writers use `config`:** per-step routes
   (`server/routes/steps.routes.ts`), `WorkflowContentIngestService`
   (`:160,175` — and actually USE its already-declared `config` field), the AI
   shim (`workflowEdit.routes.ts:388`).
4. **Legacy client writers (the ~3 that still send `options:`):** migrate
   `StepPropertiesPanel.tsx:121,126` (and any peers) to send `config:`. All card
   editors already send `config` — no change.
5. **Data normalization for legacy rows:** existing rows store choice options as
   `{ options: [...] }` under the (now-renamed) column, and `ChoiceBlock` reads
   `config?.options || legacyStep.options?.options`. After the rename,
   `legacyStep.options` no longer exists — either (a) migrate old rows so choice
   options consistently live at `config.options`, then delete the
   `.options?.options` fallback, or (b) keep the fallback reading `config.options`
   only. Prefer (a): flush the legacy shape as part of this ticket.
6. **Runner steps endpoint (secondary finding):** add/repair it (see below) so
   the runner receives `config`.
7. **Grep gate:** after the change, `grep -rn "\.options" server/ shared/ client/src`
   for step-related `options` usages should return only the choice-option
   sub-key inside a `config` object (or nothing) — no top-level step `options`.

My comment: this is the right destination and RUN-1 should be written assuming
the field is `config`. Do it as an isolated PR (rename + migration + legacy-panel
switch + data normalization) BEFORE RUN-1/RUN-2 build on it, so the canonical
object work starts on a clean field. Expect a tail of "this spot still said
options" fixes — that's the healthy surfacing of the hidden assumptions that
caused the bug.

### Secondary finding to close in this ticket

Confirm/repair the runner's step fetch: `GET /api/workflows/:workflowId/steps`
(`client/src/pages/WorkflowRunner.tsx:50`) has no matching route handler (only
section-scoped routes exist). Either add that endpoint or point the runner at the
existing section-scoped one; either way it must return `config`-shaped steps.

### Acceptance criteria
- [ ] `steps.options` is renamed to `steps.config` (column + Drizzle schema + all selects); migration added and validated per the `db-schema-change` skill, existing data preserved.
- [ ] No top-level step `options` field remains in server, shared, or client code (grep gate passes); the only surviving `options` is the choice sub-key under `config`.
- [ ] Authoring a non-choice setting (custom boolean labels, number min/max, date format, scale range) persists and survives a full reload/refetch.
- [ ] The runner renders that authored setting at run time (not the default) for boolean, number, date, scale, and choice types.
- [ ] Legacy `StepPropertiesPanel` writes go through `config`; legacy choice-option rows are normalized to `config.options` and the `.options?.options` fallback is removed.
- [ ] The runner's step fetch resolves to a real endpoint returning `config`-shaped steps.
- [ ] Integration test: author → reload → run for boolean, number, and choice, asserting the setting is honored end-to-end.

---

## RUN-7 — Step-type ↔ runner-renderer coverage

**Priority: P2 (origin-independence guarantee).** Size: S–M

### What's wrong

`stepTypeEnum` has 38 values (`shared/schema/workflow.ts:38-47`);
`BlockRenderer`'s `switch (step.type)` explicitly handles ~24
(`client/src/components/runner/blocks/BlockRenderer.tsx:96-173`). There is **no
runtime type-normalization layer**, so any type without a case falls to the
`default` "Unsupported block type" placeholder (`:166-172`) — a dead control for
the end user, regardless of how the step was authored.

Handled: short_text, long_text, text, yes_no, true_false, boolean, phone, email,
website, date, time, date_time, number, currency, scale, radio, multiple_choice,
choice, address, multi_field, display, final_documents, signature_block
(+ js_question / isVirtual → null).

Not handled (fall through to the placeholder):
- **Real inputs with no renderer:** `file_upload`, `repeater`, `loop_group`,
  `computed` (non-virtual).
- **Alternate spellings of handled types:** `datetime` (only `date_time` is
  cased), `final` (only `final_documents` is cased — note completion-side doc gen
  *does* handle `final`, so builder and runner disagree).
- **Orphaned "advanced" variants:** `phone_advanced`, `email_advanced`,
  `number_advanced`, `scale_advanced`, `website_advanced`, `address_advanced`,
  `display_advanced`, `datetime_unified` — the builder palette appears to emit
  base-type strings, making these likely dead enum members, but nothing proves
  it.

### Recommended fix (my call)

Two parts:
1. **Decide each orphan.** For every unhandled enum value, determine whether the
   builder can actually persist it. If yes → add a renderer or normalize it to a
   handled base type at the read boundary (e.g. `datetime`→`date_time`,
   `*_advanced`→base). If no → remove it from `stepTypeEnum` (via
   `db-schema-change`) so the type system stops lying about what's possible.
2. **Add a guard test** that enumerates `stepTypeEnum` and asserts each value is
   either rendered, normalized, or intentionally virtual/null — so a newly added
   enum value can't ship without a renderer.

Specific calls: `file_upload` and `repeater` are real features referenced
elsewhere (`repeaterConfig` column, dedicated condition operators) — they need
either a renderer or an explicit, testable "not supported in this runner" stance,
not a silent placeholder. Reconcile `final` vs `final_documents` so the builder
and completion agree.

My comment: this is the enforcement half of the "renders identically regardless
of origin" guarantee — the guard test is what keeps it true over time. Prefer
*removing* dead enum values over quietly normalizing, so the schema reflects
reality; only normalize where the value is genuinely still produced.

### Acceptance criteria
- [ ] A test enumerates `stepTypeEnum` and asserts every value is rendered, normalized to a rendered type, or intentionally virtual/null — failing on any new unhandled value.
- [ ] Each orphaned value is resolved: handled, normalized at the read boundary, or removed from the enum (with migration).
- [ ] `datetime`/`date_time` and `final`/`final_documents` no longer diverge between builder, runner, and completion.
- [ ] `file_upload` and `repeater` either render or are explicitly, testably out of scope (no silent "Unsupported" placeholder for anything the builder can emit).

---

## RUN-8 — Version-pin anonymous / public runs

**Priority: P3.** Size: M

### What's wrong

`RunService.createRun` pins a version (`workflow.pinnedVersionId ??
workflow.currentVersionId`, `server/services/RunService.ts:165`), but
`createAnonymousRun` sets `workflowVersionId: undefined` and runs blocks against
the literal `'draft'` (`:478,497`). So public/anonymous runs — often the
highest-volume, least-controlled path — render, branch, and generate documents
against the **live-editable** definition. A creator editing a published workflow
can silently change questions or documents for runs already in progress.

### Recommended fix (my call)

Make `createAnonymousRun` capture a concrete `workflowVersionId` at creation, the
same way `createRun` does, and ensure every downstream read for that run (steps,
sections, logic, final-block config) resolves against the pinned version rather
than `'draft'`. Confirm the version-resolution path used by
`RunStateService.getSharedRunDetails` (which already reads versioned
`graphJson`-vs-draft differently) is consistent with this.

My comment: lower urgency than the data-contract bugs, but it's a correctness/
trust issue for public links and it's cheap once a workflow has a current
version. Watch for workflows with no published version — decide whether anon runs
are even allowed there, or fall back to a snapshot.

### Acceptance criteria
- [ ] Anonymous runs capture a concrete `workflowVersionId` at creation (not `undefined`/`'draft'`).
- [ ] Steps, sections, logic, and document generation for that run resolve against the pinned version even after the workflow is edited.
- [ ] Test: start an anon run, edit the workflow (add/remove a step + change a template mapping), assert the run's questions and generated documents are unchanged.
- [ ] Defined behavior for workflows with no published version (allowed with snapshot, or rejected).

---

## RUN-9 — Decide visibility fail-mode (currently fails OPEN)

**Priority: P3 (potential data exposure / logic surprise).** Size: S — relates to DOC-102/103

### What's wrong

Visibility evaluation defaults to *visible* on any problem:
- Section `visibleIf` error → `return true` (`client/src/hooks/runner/useSectionVisibility.ts:33`).
- Step `visibleIf` error → `return true` (`:67`).
- The shared evaluator's unknown-operator path → `default: return true`
  (`shared/conditionEvaluator.ts`, see RUN-11).

So a malformed or unsupported condition *reveals* content the author intended to
hide. For a step gated behind "only show if X", a broken condition exposes it —
that's a logic-correctness issue and, depending on content, a data-exposure one.

### Recommended fix (my call)

Fail **closed** by default: on evaluation error or unknown operator, treat the
element as hidden (and log loudly), so a misconfiguration errs toward *not*
showing content rather than leaking it. This is a deliberate product decision —
if there's a reason to prefer open (e.g. "never trap a user by hiding
everything"), document it explicitly and make it uniform across section, step,
and the evaluator (today they're incidentally-consistent, not intentionally so).

My comment: I recommend fail-closed for gated content; pair with RUN-11 so
"unknown operator" stops being a silent `true`. Coordinate with DOC-102/103,
which already plan to unify the visibility/condition path — this decision should
live in that single path, not be re-scattered.

### Acceptance criteria
- [ ] Evaluation errors and unknown operators fail *closed* (hidden) by default — or the open default is documented as a deliberate, uniform decision with rationale.
- [ ] Section, step, and evaluator fail-modes are consistent and set in one place.
- [ ] Errors are logged (not silently swallowed).
- [ ] Tests cover a malformed condition and an unknown operator, asserting the chosen behavior.

---

## RUN-10 — Cross-instance document-generation idempotency

**Priority: P3.** Size: M

### What's wrong

`generateDocuments` de-dupes with two mechanisms
(`server/services/workflow-runs/RunLifecycleService.ts:316,343-348`): an
in-process `Map` of in-flight runIds, and an "already has documents" DB check.
Neither is a true cross-process guard:
- The in-flight `Map` is per-process, so on multiple instances two triggers
  (e.g. auto-completion on instance A racing an explicit `/generate-final` on
  instance B) don't see each other.
- The "existing docs" check is a read, not a lock — both callers can read "no
  docs yet" before either writes, then both generate → duplicate document sets.

Low probability today (single instance likely), but a latent duplicate-output
bug as soon as the app scales horizontally.

### Recommended fix (my call)

Move idempotency to a DB-level guard. Options: a unique constraint that makes the
second insert fail (e.g. a per-run generation marker / unique key on
`(runId, …)`), or an advisory lock / conditional status transition
(`generationStatus: pending → generating` as a compare-and-set, only the winner
proceeds — mirrors how `markCompleted` already guards completion). The existing
in-process `Map` can stay as a cheap fast-path but must not be the correctness
boundary.

My comment: P3 — fine to defer until multi-instance is real, but note it in the
generation code now so nobody assumes the current guard is safe under scale. The
compare-and-set on `generationStatus` is the least-invasive option and reuses the
pattern already in the codebase.

### Acceptance criteria
- [ ] Concurrent completion + manual generation for one run produces exactly one document set, enforced at the DB (not the in-process map).
- [ ] The in-process map, if kept, is a fast-path only — removing it does not break correctness.
- [ ] Test simulates two concurrent triggers and asserts a single set of `run_generated_documents`.

---

## RUN-11 — Silent no-op condition operators

**Priority: P3.** Size: S — concrete subset of DOC-103

### What's wrong

`shared/conditionEvaluator.ts` declares more operators (in its type + label
tables) than it implements, and the gaps fail silently:
- **Date operators** `before`, `after`, `on_or_before`, `on_or_after`,
  `diff_days`, `diff_weeks`, `diff_months`, `diff_years` are declared
  (`shared/types/conditions.ts:61-70`, labels `conditionEvaluator.ts:573-580`)
  but have no case in `evaluateOperator` — they hit `default: return true`
  (`:280-283`). So a date condition an author built in the UI silently evaluates
  to *visible/true* regardless of the data.
- **Group negation** `ConditionGroup.not` (`conditions.ts:271`) is never applied
  in `evaluateGroup` (`:114-142`) — a "NOT (…)" group is silently ignored.
- **Script conditions** (`type: "script"`) are unimplemented — treated as
  `false`/hidden (`:132-134`).

This interacts with RUN-9: an unimplemented operator doesn't just misbehave, it
defaults to *shown*.

### Recommended fix (my call)

Implement every operator the logic-builder UI can emit (the date ops are
straightforward with date-fns, mirroring the doc-inclusion evaluator), apply
`not` in `evaluateGroup`, and decide `script` (implement or remove from the UI).
Anything genuinely unsupported must throw/log and honor RUN-9's fail-closed
default rather than silently returning `true`. Best done as part of DOC-103's
"one condition engine" unification so there's a single evaluator to complete.

My comment: small and mechanical, but it's a correctness landmine — authors think
their date logic works. Pair with RUN-9 so the "unknown operator" default flips
from open to closed.

### Acceptance criteria
- [ ] Every operator exposed in the logic-builder UI is implemented in the evaluator (or removed from the UI).
- [ ] `ConditionGroup.not` is applied (or removed from the type if truly unused).
- [ ] `script` conditions are implemented or explicitly removed from the UI — not silently coerced.
- [ ] Unknown/unsupported operators log and follow RUN-9's fail-mode, not a silent `true`.
- [ ] Unit tests cover each date operator, a negated group, and the unknown-operator path.

---

## RUN-12 — Legacy final-block templates bypass tenancy scope

**Priority: P2 (security).** Size: S — **fold into RUN-4** (same code)

### What's wrong

When synthesizing a config from a legacy Final-Documents section,
`buildLegacyFinalBlockConfig` resolves templates with
`documentTemplateRepository.findById(templateId)`
(`server/services/workflow-runs/RunLifecycleService.ts:465`) — **no project
scope**. The primary path resolves with `findByIdAndProjectId`
(`:385`). So a legacy section whose `config.templates` references a template id
belonging to another project would resolve and render it: a cross-tenant/-project
document-template read. Given this is a run-completion path that also runs on
anonymous/token auth, it's worth treating as a security fix, not just cleanup.

### Recommended fix (my call)

Route all template resolution — including the legacy path — through the
tenancy-scoped `findByIdAndProjectId` using the run's workflow project. This is
literally the same resolver the main path already uses, so it's a one-line-ish
change; do it as part of **RUN-4** (which unifies the two generation paths) so
there's a single scoped resolver rather than fixing this spot in isolation and
leaving the duplication.

My comment: independently shippable as a fast security fix if RUN-4 slips, but
ideally they land together. Add a test that a cross-project template id throws
`not found` rather than rendering.

### Acceptance criteria
- [ ] Legacy final-block template resolution is project/tenant-scoped (`findByIdAndProjectId`), matching the primary path.
- [ ] No document-template resolution path in run completion is unscoped.
- [ ] Test proves a cross-project template id fails to resolve (throws not-found), on both authed and run-token completion.

---

## Suggested sequencing

Both P1 config/data-contract bugs (RUN-2, RUN-6) are **verified** and should go
first — until they're fixed, authored data does not reliably reach documents or
the runtime, so everything downstream is built on sand.

1. **RUN-2 + RUN-6** (the two verified data-contract bugs) — RUN-2 stops blank
   auto-generated documents; RUN-6 makes authored settings actually persist and
   apply. Do RUN-6's secondary finding (missing runner steps endpoint) here too.
2. **RUN-1 + RUN-4** (canonical object + one pipeline) — makes RUN-2's fix
   structural, absorbs the `toAliasKeyed` helper, assumes RUN-6's `config` shape,
   and unblocks the AI path (DOC-105).
3. **RUN-3, RUN-7, RUN-12** (alias integrity / step-type coverage / tenancy).
4. **RUN-5, RUN-8, RUN-9, RUN-10, RUN-11** (robustness).
