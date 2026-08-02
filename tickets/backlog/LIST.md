# Backlog detail — List question type (LIST / LIST2)

Full text for the `LIST-*` entries indexed in [`../BACKLOG.md`](../BACKLOG.md).
**Read this file only when promoting one of them.**

Both List initiatives are closed:

- **Round 1 (LIST-1..14 + ORG-001)** shipped the `list` step type end to end —
  shared contracts, builder tree editor, runner drill-in, review-step rendering,
  document loop projection, dropdown binding, and removal of the dead
  `repeater`/`loop_group` types it replaced. Closed 2026-08-01.
- **Round 2 (LIST2-1..16)** closed the field-parity gap the round-1 audit graded
  **B−**: type-level validation inside lists, a server-side `list` config schema,
  the per-field settings panel, static choice options, document label resolution,
  screen-reader focus handling, debounced config saves, and end-to-end lifecycle
  coverage. Closed 2026-08-02. Final `test:fast` **2277**.

Delivery commits (round 2): `4abc9048`..`65403610` (Phase 1), `704566b6` +
`a73e5363` (Phase 2), `428d379c`, `62a0d7f2`, `90eccf90`, `fb8f1144`,
`d31a926d`, `7dc78958`, `963c1db9`.

Closed ticket entries — Findings, preferred fixes, acceptance criteria and dated
reviewer verification notes including the mutation proof recorded for every
ticket — are in git history:

```bash
git log -p -- tickets/LIST_QUESTION_2_TICKETS.md   # round 2
git log -p -- tickets/LIST_QUESTION_TICKETS.md     # round 1
```

The settled design decisions live there too, in the `Decisions` section of any
pre-closure revision: a list field is **not** a step row (no id to PATCH, so
every authoring component is controlled); the storage-envelope-vs-projection
split; the depth cap at `LIST_VALIDATION_MAX_DEPTH`; and `ListField.config`
being the existing `StepConfig` union rather than a parallel type. **The shipped
code is now the source of truth.**

**Re-verify before promoting.** These were written against a tree that has since
moved. B12 is the cautionary example: it was fixed before anyone re-read it.

---

## LIST-B5 — Dynamic options for list fields · `product-decision`

*Highest value of what's left.*

Filed by LIST2-8, which ships an explicit "dynamic options aren't available for
list fields" note — honest, but still a dead end for authors.

Blocked on a **product decision**, not plumbing: what does binding to a list or
table mean for a field inside a repeating item? Does every item share one option
set, or can the options depend on sibling answers within the same item?

The runner is already ready — LIST2-5 threaded `aliasMap` into the drilled
editor, so a bound dropdown would resolve the moment the authoring side writes
the config.

**Next step:** Shawn answers the semantics question, then this becomes a normal
ticket against the authoring surface.

---

## LIST-B4 — Run detail dumps list answers as raw JSON · `enhancement`

*Cheapest real win in this file.*

`ExecutionDetailView.tsx` renders every step value through `JSON.stringify`
because `runAPI.getWithValues` returns no step type or config. A list answer
therefore shows the raw `{ items: [{ itemId, values }] }` storage envelope.

Internal staff surface, not respondent-facing — which is why it was parked
rather than fixed.

`ListAnswerView` and `formatAnswerValue` are reusable as-is; the work is
plumbing `ListConfig` through the endpoint so the view can pick a renderer.

**Next step:** ready to ticket as-is. Size S–M, touches the run-detail endpoint
and one client view.

---

## LIST-B6 — No `file_upload` or `signature_block` per list item · `needs-initiative`

Both are deliberately excluded from `LIST_FIELD_QUESTION_TYPES`.

`file_upload` is in `RUNNER_INTENTIONALLY_UNSUPPORTED_STEP_TYPES` platform-wide,
so this is **not a list problem** — the runner cannot render it anywhere. Fixing
it inside lists first would be building on a hole.

Real for enterprise intake ("upload each child's birth certificate").

**Next step:** needs its own initiative covering runner file upload generally;
list support falls out of that, not the other way around.

---

## LIST-B7 — Cross-item references in conditions · `needs-initiative`

Logic is scoped to top-level item count. Referencing `children[0].name` from
outside the list — or one item from another — is deferred.

**Next step:** design work on the condition path grammar first; there is no
partial version of this worth shipping.

---

## LIST-B8 — Script helpers for list data · `enhancement`

Scripts and hooks see the raw `{ items: [{ itemId, values }] }` envelope, not the
projection the document engine gets. Every script author therefore re-implements
the same unwrap.

See `docs/scripting/helper-library.md` for where a helper would land.

**Next step:** ready to ticket. The projection function already exists; this is
exposing it through the script context plus docs.

---

## LIST-B13 — Prefill a list from a DataVault query · `product-decision`

*Carried from round 1 (LIST-B4), where it was dropped in the round-2
carry-forward.*

**Its original citations are stale:** `RepeaterService.createFromList` was
deleted in LIST-13, and `ListConfig` has no `listSource` field. Kept as a
product idea, **not** as an implementation pointer — anyone picking it up starts
from scratch.

**Next step:** re-audit against the shipped `list` implementation before writing
a single line of ticket text.

---

## LIST-B11 — Drill state is not URL-addressable · `informational`

Refreshing mid-drill returns to the section rather than the open item.

**Deliberate** — `ListDrillProvider key={section.id}`. Recorded so it is not
rediscovered as a bug. Not work.

---

## LIST-B14 — Should the abuse caps bypass the warn gate? · `wont-fix`

**CLOSED, won't fix (2026-08-01).** *Carried from round 1 (LIST-B7).* Retained
deliberately because an earlier reviewer recommendation argued the opposite and
was wrong on the facts. Three findings closed it:

1. **No crash risk in either mode** — the depth guard `return`s and the item
   budget `break`s structurally, independent of `SERVER_FIELD_VALIDATION`, so
   stack exhaustion was never exposed.
2. **The stated motive was false.** "An oversized list would be persisted in
   warn mode" is wrong: `RunExecutionCoordinator.submitSection` persists
   *before* it validates (`bulkSaveValues`, then `validatePage`), so the payload
   is already written in **both** modes. Unconditional caps would block
   advancement, not storage.
3. `express.json({ limit: MAX_REQUEST_SIZE })` already caps a request at 10 MB
   (`server/middleware/securityConfig.ts`), bounding the blast radius to one
   run's row.

Against that, making lists the one step type that hard-fails while every other
type warns would break the uniformity LIST-14's AC6 protects and muddy the
RUN2-16 logs the enforce rollout depends on. The caps start blocking
automatically once `SERVER_FIELD_VALIDATION=enforce` lands.

If oversized *storage* ever matters, the correct fix is a size check **before**
`bulkSaveValues` — a different change, on evidence rather than speculation.

---

## Closed backlog entries — do not re-file

Six round-2 backlog items were closed by work that shipped:

| Entry | Closed by |
|---|---|
| B1 — `MappingValidator` doesn't project list values | LIST2-14 (`d31a926d`) |
| B2 — `intakeStateMachine` truncates multi-path errors | LIST2-10 (`428d379c`) — deleted as dead code |
| B3 — a second page validator has no list handling | LIST2-10 (`428d379c`) — confirmed advisory, deleted |
| B9 — debounce List config saves | LIST2-13 (`90eccf90`), unified onto the shared hook by LIST2-16 (`963c1db9`) |
| B10 — no screen-reader announcement on drill-in | LIST2-12 (`62a0d7f2`) |
| B12 — `db-schema-change` / `add-step-type` skills stale | Already fixed in `1bbb0b9a` and `74fc9cbb`; re-verified 2026-08-02 |
