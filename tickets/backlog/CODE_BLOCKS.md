# Backlog detail — Code Blocks (CB)

Full text for the `CB-*` entries indexed in [`../BACKLOG.md`](../BACKLOG.md).
**Read this file only when promoting one of them.**

The Code Blocks initiative (CB-1..11, split into 20 units) **closed 2026-09-11**,
with all four phase gates signed. It discharged `STB-B8` ("sandboxed JS/Python
transforms, rebuilt"). It replaced three parallel implementations of one idea
(`js_question`, Transform Blocks, and the AI transform subsystem) with a single
**Code Block** step. A Code Block has:

- multiple outputs, each its own virtual step
- inputs and outputs derived from the code by the AST pass
- readiness and change gates, and trigger × repeat firing
- topological ordering with save-time cycle detection
- append-only outputs
- a Monaco editor and a server-backed preview with a live variable inspector
- Python in production

Transform Blocks were then retired end to end. Their tables were dropped in
migration `0049`, which runs on each environment **when it deploys**, so
production loses its single row at the `main` promotion.

Audit grade at open: **C+**. The engine was good; the authoring model on top of
it was the problem.

Closed ticket entries (Findings, preferred fixes, acceptance criteria, and dated
reviewer verification notes including mutation proofs) are in git history:

```bash
git log -p -- tickets/CODE_BLOCKS_TICKETS.md
```

**Re-verify before promoting.** These were written against a tree that has since
moved.

---

## Standing decisions — D-1..D-7

These bind anything that touches Code Blocks. They are the initiative's
"Decisions" section, kept verbatim in substance.

- **D-1 Append-only.** A block creates *new* variables and never overwrites an
  existing one. Each variable has exactly one writer, which is what makes the
  dependency graph static and knowable at author time.
- **D-2 Two gates decide every execution.**
  - *Readiness:* all *required* inputs must be resolved. Optional inputs pass as
    `null` and do not gate. A step that logic made unreachable counts as
    resolved-absent, not pending.
  - *Change:* the canonicalized input tuple must have changed since the last run,
    compared by hash. Otherwise the block skips.
- **D-3 Firing = trigger × repeat**, two independent choices:
  - trigger: `everySubmit` (default), `atPage` (a floor, "not before this page"),
    `runStart` or `runComplete`
  - repeat: `onChange` (default), `once`, or `always`
- **D-4 The readiness gate always wins.** `atPage` sets the earliest moment a
  block may fire. It never forces an unready block to fire.
- **D-5 Errors null the block's entire output set** and mark it errored. A wrong
  number in a legal document is worse than a blank one.
- **D-6 Recompute is idempotent.** The change gate makes it a no-op when nothing
  changed, so it is safe to call from every navigation point.
- **D-7 The AST pass is the workhorse.** Input and output derivation,
  dynamic-access warnings, impure-helper detection and cycle detection all ride
  on the one `ASTValidator` traversal. All of them report in the editor, never at
  runtime.

⚠️ **`server/services/scripting/` is dormant, not dead.** This initiative built
on it, and its gate asserted the directory untouched from `b0b79c5a` to close.
Do not delete it.

---

## CB-B7 — The pinned run definition omits virtual steps · `needs-initiative`

*Filed 2026-09-08. Rediscovered twice, each time costing a dev a full
investigation cycle. Read this first.*

`WorkflowService.getWorkflowWithDetails` calls
`stepRepo.findByPageIds(pageIds, scopedTx)` with no `includeVirtual`, so
virtual computed steps are excluded. `VersionService.serializeWorkflowInTx`
serializes that result into the pinned version graph. So
`RunDefinitionProvider`, and therefore `runtime.steps`, never carries a Code
Block's output step, its alias, or its `isVirtual` flag.

CB-4 deferred this deliberately, and its reasoning still stands. It is recorded
at the top of `CodeBlockService`: the same definition also feeds navigation,
page validation, visibility and progress counts, so widening it is not a local
change.

**The established workaround is `findByWorkflowIdWithAliases`, whose
`includeVirtual` defaults to true.** CB-4 uses it to resolve Code Block inputs,
and CB-9 uses it to give the inspector alias and `isVirtual` metadata.

**Next step:** Decide whether the run definition should carry virtual steps at
all. If yes, re-check every navigation, validation, visibility and progress
consumer.

## CB-B5 — Live-run document blobs leak · `needs-initiative`

*Filed 2026-09-06 during CB-9a-1 as `triage`, which is not a backlog tag. It was
retagged at retirement: it needs a retention ruling before it can be designed.
Overlaps `ZR-B1`/`ZR-B3` (retention, no run deletion) in
[`ZERO_RETENTION.md`](ZERO_RETENTION.md). Read them together.*

Evidence as of `76de5596`:

- `FinalBlockRenderer` uploads documents before
  `RunLifecycleService.generateDocuments` persists their rows. That persistence
  failure is caught and only logged, orphaning the upload.
- `FinalBlockRenderer` also uploads a ZIP, but lifecycle persistence iterates
  only `generationResult.documents`, so the archive never gets a row.
- `RunStateService` deletes document rows through `deleteByRunId` without
  deleting their storage objects. That leaks even successfully recorded files.

Preview isolation deliberately did not change live retention.

**Next step:** Rule on retention and download-link expectations, then design
durable ownership and retryable blob cleanup. Only then ticket it.

## CB-B2 — Timeout ceiling is 100–3000 ms, and the config silently allows 30000 · `product-decision`

*Filed at audit; the evidence was re-verified at retirement.*

The originally cited enforcement point, `TransformBlockService.createBlock`, is
deleted. The ceiling now lives in `server/utils/enhancedSandboxExecutor.ts`
(`MAX_TIMEOUT_MS = 3000`), which **clamps** rather than rejects. Meanwhile the
Code Block config schema (`shared/validation/stepConfigSchemas.ts`,
`timeoutMs: z.number().int().min(100).max(30000)`) accepts up to 30000, and
`CodeBlockService` passes `config.timeoutMs ?? 1000` straight through. **An
author who saves 10000 gets 3000, with no message.** The hook routes use a
matching 100–3000 range, so only the Code Block schema disagrees.

Child-support-scale arithmetic sits far inside 3 s, so nothing is blocked today.

**Next step:** There are two separate choices:
- The cheap one: align the schema's max to 3000, or surface the clamp. This is
  enhancement-sized and needs no ruling.
- The real one: raising the ceiling holds a request open longer, and should be
  weighed against a real block that hits it.

## CB-B3 — External-state reads have no declared dependency · `needs-initiative`

CB-6 forces `always` for impure blocks. That is correct but blunt: a block
reading DataVault re-runs at every evaluation, not when the underlying row
changes. A finer model would let a block declare an external dependency that
participates in the hash.

**Next step:** Only worth building if `always` proves too expensive in practice.
Measure first.

## CB-B6 — Client field errors are never populated · `informational`

*Filed 2026-09-07 during CB-9a-3a.* `useRunNavigation` accepts `fieldErrors`
and has `focusFirstFieldError` ready, but nothing supplies them from a page
submit:

- `server/workflows/validation.ts` builds a per-field structure.
- `RunExecutionCoordinator.runSubmitPage` flattens it to strings.
- `BlockRunner` has no `fieldErrors` concept.
- `ValidateBlockRunner` does produce them, but its output is not threaded out.

Restoring this is a real UX improvement and a small contract change on the
submit response. It was deliberately not done inside a preview ticket, where the
shape would have been guessed rather than designed.

**Next step:** Design the submit response's field-error shape, then thread it
from `validatePage` through the coordinator.

## CB-B8 — Inspector denial rests on RLS, not its own guards · `informational`

*Found by reviewer mutation testing during CB-9.*
`CodeBlockService.readInspector` checks `record.tenantId !== tenantId` and then
calls `workflowService.verifyAccess(..., 'edit')`. Disabling **both** still
leaves `codeBlocks.inspector.test.ts` green, because RLS filters
`findRunOwnership` first. So those service checks are untested defence in depth.

They become load-bearing only if RLS is relaxed on `workflow_runs`, which is
today the one table in that path *without* RLS enabled (see `RLS-B5`). The same
shape likely applies to other services that check tenancy behind an RLS-scoped
read.

**Next step:** Worth a unit test that exercises the service checks with the
repository stubbed, if anyone touches `readInspector` again.

## CB-B9 — Switching language leaves the other language's code · `informational`

*Found while implementing CB-11.* The JS/Python switch changes
`config.language`, the Monaco grammar, the placeholder and the labels, but
deliberately does **not** touch `config.code`. So the author finds out at save
(`Script validation failed`) or at run. Clearing the editor on a toggle would
destroy work, and a mis-click would be unrecoverable.

**Next step:** Either warn inline when the code is non-empty and the language
changed, offering to clear, or keep a per-language draft. Neither is urgent: the
failure is loud and self-inflicted.

## CB-B1 — `js_question` `display: "visible"` never had a renderer · `informational`

Resolved by CB-1 deleting the field. Recorded because the config advertised a
visible mode for the life of the feature, while nothing in
`client/src/components/runner/` ever handled `js_question` or `computed`. A
*visible* computed display would be a new feature with a new renderer, not a
revival.

## CB-B4 — `emit()` may still only be called once · `informational`

Both engines enforce single-emit. The Python wrapper raises
`"emit() can only be called once"`, and the JS path keeps a single
`emittedValue` (`enhancedSandboxExecutor.ts`, re-verified at retirement). With
CB-1's object-shaped multi-output (one object, many keys) this is the right
constraint. **Do not "fix" it into multi-emit**, which would reintroduce
ordering ambiguity.

---

## Closed — do not re-file

| Ticket | What shipped | Commit |
|---|---|---|
| CB-1 | Multi-output config, one virtual step per output | `1b9db7fc` |
| CB-2 | Readiness gate, change gate, per-run block state (`code_block_runs`) | `345976b9` |
| CB-3 | Firing model, trigger × repeat, wired to five call sites | `95cefd81` |
| CB-4 | Topological execution order, save-time cycle detection | `ca1ae9fe` |
| Phase 1 Gate | | `5a024426` |
| CB-5 | Inputs and outputs derived from the code | `e04228bb` |
| CB-6 | Impure helper detection forces `once`/`always` | `b168a1d5` |
| CB-7 | Named alias-collision errors, `mutationMode` retired | `33447a46` |
| Phase 2 Gate | | `12b2ff65` |
| CB-8 | Monaco editor modal with a live test panel | `fa7ba562` |
| CB-9a-1 | Persisted preview identity, isolated lifecycle | `12d424d0` |
| CB-9a-2 | Replay-safe submissions (`run_submissions`) | `5ba15489` |
| CB-9a-3 pt 1 | One submission returns the authoritative state | `7ec4399c` |
| CB-9a-3a | One request per submission; a preview id is a session | `c072d69b` |
| CB-9a-3b | Preview runs through the server session | `06e4bb74` |
| CB-9 | Preview variable inspector | `fb4cfd25` |
| CB-11 | Python in production, language switch exposed | `01395b43` |
| CB-10a | In-memory preview execution path deleted | `47ef2442` |
| CB-10b | Builder no longer offers transform blocks | `b464b8a2` |
| CB-10c | AI transform subsystem and both transform contracts retired | `73fb28b7` |
| CB-10d1 | Remaining transform-block consumers cleared | `2cebe259` |
| CB-10d2 | `transform_blocks` + `transform_block_runs` dropped (migration `0049`) | `d208aee1` |
| Phase 4 Gate | Signed 2026-09-11 | see `git log -- tickets/CODE_BLOCKS_TICKETS.md` |
| `STB-B8` | Discharged by this initiative | — |

**Withdrawn / corrected during the initiative:**

- **"The four transform UI files are already unreferenced"** (CB-10's original
  Finding). Wrong: `forms/TransformBlockForm.tsx` was live, and 67 files
  outside the stated footprint referenced transform blocks. CB-10 was
  re-scoped into 10a..d.
- **`RLS-B1` "probably a CB-9a-1 fixture problem."** Wrong: it was production
  code, fixed in `760353b6`. See `RLS-B1` in `../BACKLOG.md`.
- **"`docs/claude/SCHEMA.md` is missing 40 of 108 tables."** Wrong: 107 of 108
  were present. `code_block_runs` was added in `de7bf066`.
