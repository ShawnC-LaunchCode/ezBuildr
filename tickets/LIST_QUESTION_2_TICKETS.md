# List Question Type — backlog only (rounds 1 and 2 both closed 2026-08-02)

**Both List initiatives are complete.**

- **Round 1 (LIST-1..14 + ORG-001)** shipped the `list` step type end to end —
  shared contracts, builder tree editor, runner drill-in, review-step rendering,
  document loop projection, dropdown binding, and removal of the dead
  `repeater`/`loop_group` types it replaced. Closed 2026-08-01.
- **Round 2 (LIST2-1..16)** closed the field-parity gap the round-1 audit graded
  **B−**: type-level validation inside lists, a server-side `list` config schema,
  the per-field settings panel, static choice options, document label resolution,
  screen-reader focus handling, debounced config saves, and end-to-end lifecycle
  coverage. Closed 2026-08-02. Final `test:fast` **2277**.

Per the convention that `tickets/` holds **open work only**, the closed tickets
have been removed from this file. Their Findings, Preferred fixes, acceptance
criteria and dated reviewer verification notes — including the mutation proof
recorded for every ticket — are in git history:

```bash
git log -p -- tickets/LIST_QUESTION_2_TICKETS.md   # round 2 (this file)
git log -p -- tickets/LIST_QUESTION_TICKETS.md     # round 1 (deleted 2026-08-02)
```

The settled design decisions live there too, in the `Decisions` section of any
pre-closure revision: a list field is **not** a step row (no id to PATCH, so
every authoring component is controlled); the storage-envelope-vs-projection
split; the depth cap at `LIST_VALIDATION_MAX_DEPTH`; and `ListField.config`
being the existing `StepConfig` union rather than a parallel type. **The shipped
code is now the source of truth.**

Round-2 delivery commits: `4abc9048`..`65403610` (Phase 1), `704566b6` +
`a73e5363` (Phase 2), `428d379c`, `62a0d7f2`, `90eccf90`, `fb8f1144`,
`d31a926d`, `7dc78958`, `963c1db9`.

---

## Closed backlog entries — do not re-file

Six round-2 backlog items were closed by work that shipped. Recorded so they are
not rediscovered as new findings:

| Entry | Closed by |
|---|---|
| B1 — `MappingValidator` doesn't project list values | LIST2-14 (`d31a926d`) |
| B2 — `intakeStateMachine` truncates multi-path errors | LIST2-10 (`428d379c`) — deleted as dead code |
| B3 — a second page validator has no list handling | LIST2-10 (`428d379c`) — confirmed advisory, deleted |
| B9 — debounce List config saves | LIST2-13 (`90eccf90`), unified onto the shared hook by LIST2-16 (`963c1db9`) |
| B10 — no screen-reader announcement on drill-in | LIST2-12 (`62a0d7f2`) |
| B12 — `db-schema-change` / `add-step-type` skills stale | Already fixed in `1bbb0b9a` and `74fc9cbb`; re-verified 2026-08-02 |

---

# Backlog / observations (not phase-gated)

A backlog entry is **not** a ticket. Promoting one means re-verifying the
finding first — these were written against a tree that has since moved, and B12
above is the cautionary example: it was fixed before anyone re-read it.

**None of these are bugs.** All are enhancements or deferred design.

- **B5 — dynamic options for list fields.** *Highest value of what's left.*
  Filed by LIST2-8, which ships an explicit "dynamic options aren't available
  for list fields" note — honest, but still a dead end for authors. Blocked on a
  **product decision**, not plumbing: what does binding to a list or table mean
  for a field inside a repeating item? The runner is already ready — LIST2-5
  threaded `aliasMap` into the drilled editor, so a bound dropdown would resolve
  the moment the authoring side writes the config.

- **B4 — run-detail dumps list answers as raw JSON.** *Cheapest real win.*
  `ExecutionDetailView.tsx` renders every step value through `JSON.stringify`
  because `runAPI.getWithValues` returns no step type or config. Internal staff
  surface, not respondent-facing. `ListAnswerView` + `formatAnswerValue` are
  reusable as-is; the work is plumbing `ListConfig` through the endpoint.

- **B6 — no `file_upload` or `signature_block` per list item.** Both are
  deliberately excluded from `LIST_FIELD_QUESTION_TYPES`. `file_upload` is in
  `RUNNER_INTENTIONALLY_UNSUPPORTED_STEP_TYPES` platform-wide, so this is not a
  list problem. Real for enterprise intake ("upload each child's birth
  certificate"); needs its own initiative.

- **B7 — cross-item references in conditions.** Logic is scoped to top-level
  item count; referencing `children[0].name` from outside the list is deferred.

- **B8 — script helpers for list data.** Scripts and hooks see the raw
  `{ items: [{ itemId, values }] }` envelope, not the projection. See
  `docs/scripting/helper-library.md`.

- **B13 — prefill a list from a DataVault query.** *Carried from round 1
  (LIST-B4), where it was dropped in the round-2 carry-forward.* **Its original
  citations are stale:** `RepeaterService.createFromList` was deleted in
  LIST-13, and `ListConfig` has no `listSource` field. Kept as a product idea,
  not as an implementation pointer — anyone picking it up starts from scratch.

---

## Informational — not work

- **B11 — drill state is not URL-addressable.** Refreshing mid-drill returns to
  the section. Deliberate (`ListDrillProvider key={section.id}`), recorded so it
  is not rediscovered as a bug.

- **B14 — should the abuse caps bypass the warn gate? CLOSED, won't fix
  (2026-08-01).** *Carried from round 1 (LIST-B7).* Retained deliberately
  because an earlier reviewer recommendation argued the opposite and was wrong
  on the facts. Three findings closed it:

  1. **No crash risk in either mode** — the depth guard `return`s and the item
     budget `break`s structurally, independent of `SERVER_FIELD_VALIDATION`, so
     stack exhaustion was never exposed.
  2. **The stated motive was false.** "An oversized list would be persisted in
     warn mode" is wrong: `RunExecutionCoordinator.submitSection` persists
     *before* it validates (`bulkSaveValues`, then `validatePage`), so the
     payload is already written in **both** modes. Unconditional caps would
     block advancement, not storage.
  3. `express.json({ limit: MAX_REQUEST_SIZE })` already caps a request at 10 MB
     (`server/middleware/securityConfig.ts`), bounding the blast radius to one
     run's row.

  Against that, making lists the one step type that hard-fails while every other
  type warns would break the uniformity LIST-14's AC6 protects and muddy the
  RUN2-16 logs the enforce rollout depends on. The caps start blocking
  automatically once `SERVER_FIELD_VALIDATION=enforce` lands. If oversized
  *storage* ever matters, the correct fix is a size check **before**
  `bulkSaveValues` — a different change, on evidence rather than speculation.
