# List Question Type — backlog only (initiative closed 2026-08-01)

**The LIST initiative is complete: LIST-1..14 all ✅, plus ORG-001.** The
`list` step type ships end to end — shared contracts, builder tree editor,
runner drill-in with incomplete badges and Next enforcement, review-step
rendering, document loop projection, dropdown binding, and removal of the dead
`repeater`/`loop_group` types it replaced.

Per the convention that `tickets/` holds **open work only**, the closed tickets
have been removed from this file. Their Findings, Preferred fixes, acceptance
criteria and dated reviewer verification notes are all in git history:

```bash
git log -p -- tickets/LIST_QUESTION_TICKETS.md
```

The settled design decisions (naming, the two-shapes storage-vs-projection
split, the depth cap, the deliberate Choice-Value-Model departure for dropdown
values) are recorded there too, in the `Decisions` section of any pre-closure
revision. The shipped code is now the source of truth.

**Only the backlog below remains.** None of it is phase-gated; each item is an
observation that can be promoted to a real ticket when it earns dispatch. Per
the ticket-flow skill, a backlog entry is *not* a ticket — promoting one means
re-verifying the finding first, since these were written against a tree that
has since moved.

**LIST-B7 is closed won't-fix** and its entry is retained deliberately: it
records why an earlier recommendation of mine was wrong, so it does not get
re-proposed.

---

# Backlog / observations (not phase-gated)

**LIST-B1 — Cross-item references in conditions.** LIST-4 scopes logic to
top-level count only. Referencing `children[0].name` from outside the list is
deferred. The plumbing precedent exists in `RepeaterService.flattenRepeaterData`
(`server/services/RepeaterService.ts:99-107`) — read it from git history after
LIST-13 deletes it.

**LIST-B2 — Script helpers for list data.** Decision 7 scoped v1 documents to
template loop tags. First-class helpers in the JS/Python scripting library for
walking list data are a natural follow-on. See `docs/scripting/helper-library.md`.

**LIST-B3 — `add-step-type` skill has a stale reference.** §3 names
`client/src/components/runner/blocks/validation.ts:22`, which does not exist —
verified against the tree 2026-07-31. Client-side value validation lives in
`shared/validation/BlockValidation.ts`. Fix the skill so future sessions don't
chase it. Small, independent, can be done any time.

**LIST-B5 — `intakeStateMachine` truncates multi-path list errors.** Found
reviewing LIST-14 (2026-08-01). `server/workflows/intakeStateMachine.ts:172-175`
collapses the error array into a `Map` keyed by `fieldId`:

```ts
    for (const error of validationResult.errors) {
      errors.set(error.fieldId, error.errors);
    }
```

Before LIST-14 one step produced at most one `ValidationError`, so `set` was
safe. A list now produces **one entry per failing path**, all sharing the same
`fieldId` — so every path but the last is silently discarded, and the new
`path` field is dropped entirely. `RunExecutionCoordinator:157` has a milder
version (N identical-titled messages, no path context). Not reachable until
LIST-8 makes lists fillable. Best fixed alongside **LIST-9**, which designs how
list errors surface; sequence it there rather than as standalone work.

**LIST-B6 — a second page validator has no list handling.**
`server/routes/validation.routes.ts:114` calls a *different* `validatePage`,
from `shared/validation/PageValidator.ts`, which LIST-14 did not touch (its
`listKey` references are an unrelated cross-field rule mechanism, not the
`list` step type). The run-submission enforcement path
(`RunExecutionCoordinator`) does go through the wired validator, so this is
very likely an advisory/pre-submit endpoint rather than an enforcement
boundary — **but that was not confirmed.** Confirm before Phase 3 ships; if it
is an enforcement path, it needs the same wiring as LIST-14.

**LIST-B7 — should the abuse caps bypass the warn gate? ❌ CLOSED, won't fix
(2026-08-01).** Kept here briefly because the earlier entry recommended the
opposite and was wrong on the facts.

Three findings closed it. (1) There is **no crash risk in either mode** — the
depth guard `return`s and the item budget `break`s structurally, independent of
`SERVER_FIELD_VALIDATION`, so stack exhaustion was never exposed. (2) The stated
motive — "an oversized list would be persisted in warn mode" — was **false**:
`RunExecutionCoordinator.submitSection` persists *before* it validates
(`bulkSaveValues` then `validatePage`), so the payload is already written in
**both** modes. Making the caps unconditional would block advancement, not
storage. (3) `express.json({ limit: MAX_REQUEST_SIZE })` already caps a request
at 10 MB (`server/middleware/securityConfig.ts`, under "PAYLOAD SIZE LIMITS
(DoS Protection)"), bounding the blast radius to one run's row.

Against that, making lists the one step type that hard-fails while every other
type warns would break the uniformity LIST-14's AC6 was written to protect, and
muddy the RUN2-16 logs the enforce rollout depends on. The caps also start
blocking automatically once `SERVER_FIELD_VALIDATION=enforce` lands. If
oversized *storage* ever matters, the correct fix is a size check **before**
`bulkSaveValues` — a different change, on evidence, not speculation.

**LIST-B10 — `MappingValidator` does not project list values.** Noted
reviewing LIST-11 (2026-08-01). `MappingValidator.ts:150` and `:332` call
`normalizeVariables(testStepValues)` with no options, so list steps are not
projected there. Template mapping *validation* therefore sees the raw storage
envelope while actual *rendering* sees the projected array — a mapping onto a
list variable could report a false warning even though the document renders
correctly. Output is unaffected; this is a validation-surface inconsistency
only. Fix by threading `getListConfigsByAlias` into both call sites, the same
way LIST-11 did for the render paths.

**LIST-B9 — the `db-schema-change` skill is stale and gave wrong guidance twice.**
It documents the migration chain as `0000`–`0002` and states "The next new
migration is `0003_...`" — the chain is now at `0009`. It also says Postgres
"can't remove enum values — plan additions carefully", which led both LIST-1 and
LIST-13 to specify `db:generate --custom` when plain `db:generate` handles both
cases natively (and `--custom` is *harmful* for removals, since it copies the
previous snapshot instead of regenerating). Fix the skill: correct the chain
position, and document that drizzle-kit emits the text-round-trip enum
recreate on its own.

**LIST-B8 — Debounce List config saves.** Noted reviewing LIST-6
(2026-08-01). `ListCardEditor` fires a full `updateStep` mutation on every
change with no debounce. This is *correct* as delivered — it matches
`MultiFieldCardEditor`, the donor pattern the ticket named — but the scale
differs: MultiField carries 2–6 flat fields, whereas a 3-level List can hold
dozens, and each keystroke PATCHes the entire nested config object. Worth
debouncing (`ChoiceCardEditor` already has a debounce queue, per its comment at
`ChoiceCardEditor.tsx:185`, and is the better donor for this one aspect).
Cosmetic today; revisit if authoring feels laggy on a large list.

**LIST-B4 — Prefill a list from a DataVault query.** `RepeaterService.createFromList`
(`server/services/RepeaterService.ts:126-152`) could seed items from a
`QueryListVariable`, and `ListConfig` deliberately leaves room for a
`listSource`. Not scoped here; worth considering once List is in real use.

**LIST-B11 — Run-detail (`ExecutionDetailView.tsx`) dumps list answers as raw
JSON.** Noted reviewing LIST-10, whose Finding named run-detail alongside the
review step. The dev correctly left it alone and flagged it: that view renders
every step value via `JSON.stringify(val.value)` for *all* types, because
`runAPI.getWithValues` returns `ApiStepValue[]` (`client/src/lib/vault-api.ts:966`)
— `{id, runId, stepId, value, ...}` with no step type or config. Rendering a
list properly there needs step definitions plumbed into the view (or a widened
endpoint), which is a real scope expansion beyond LIST-10's Size S. Note this
is an internal/staff surface, not respondent-facing, which is why it did not
block LIST-10. Reusable pieces already exist: `ListAnswerView` +
`formatAnswerValue`, both of which only need `ListConfig` to render.
