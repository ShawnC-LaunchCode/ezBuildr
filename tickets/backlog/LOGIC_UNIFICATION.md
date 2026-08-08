# Logic Unification (LU) — retired initiative detail

The Logic Unification initiative closed **2026-08-08**. Its ticket file was
`tickets/LOGIC_UNIFICATION_TICKETS.md`; recover the full text — every Finding, every
acceptance criterion, every dated verification note and both failed review passes — with:

```bash
git log -p -- tickets/LOGIC_UNIFICATION_TICKETS.md
```

## What it was

The decomposition of GitHub epic **GH-154** ("Unify conditional logic editing across the
builder"). GH-154 arrived as an epic, not a ticket — Size L, no `file:line` evidence, no
preferred fix — and two of its five acceptance criteria described work that was **already
built**. It was audited into 7 dispatchable tickets across two phases.

**The audit's central finding:** there were not two condition languages but **four**, and
three of them were adapters or corpses feeding the one real evaluator.

| | Model | Fate |
|---|---|---|
| A | `ConditionExpression` (28 operators, nested groups) — `shared/conditionEvaluator.ts` | **survived; now the only one** |
| B | `logic_rules` flat columns (9 operators) + actions incl. `skip_to` | reshaped to hold a `ConditionExpression` (LU-6a), then its flat shape retired (LU-6c) |
| C | `server/workflows/conditions.ts` (472 lines) + an A↔C adapter | deleted — no production importer; only tests kept it alive (LU-1) |
| D | `LogicExpression` (`{key, op, value}`) for document conditions | deleted; its "adapter" only translated into A and called A's evaluator (LU-5) |

**Outcome:** `ConditionExpression` is the only condition language in the codebase. Steps,
sections, list fields, workflow rules and documents all speak it through one evaluator.
`skip_to`, `require` and `make_optional` — fully implemented in `shared/workflowLogic.ts` all
along — became authorable by a human for the first time (LU-6b); nothing but AI generation
could previously write a rule, which is why `logic_rules` held **0 rows across 84 workflows**.

`test:fast` 2277 → **2681** · `test:unit` **2826** · `test:integration` 108 files / 1075 tests.

**Measurement drove the scope repeatedly.** `logic_rules` 0 rows and all 57 published
versions carrying empty `logicRules` arrays turned LU-6c from a data migration into a drop;
0 `final_documents` steps turned LU-5's config widening into a no-migration change; 0
string-shaped `visible_if` rows made O-4's dead branch safe to delete. Each was measured
before dispatch so devs would not write untestable defensive code.

---

## LU-B1 — Local development and production share one database · `operational`

**This is the entry to read first, and the one that caused a production outage.**

`railway status` reports environment `production`, and its `DATABASE_URL` resolves to the
**same Neon host and database** as local `.env`. There is no separate dev database.

During LU-6b a dev ran `npm run db:migrate` to unblock its live verification — a reasonable
act against what everyone believed was a dev database. It ran against production. Because
nothing had been pushed yet, production then spent hours running deployed code that queried
`logic_rules.operator` after the column had been dropped: any path through
`RunDefinitionProvider` — **starting or resuming a run** — returned a 500. `/health` stayed
green throughout, because it only checks connectivity.

Resolved by pushing the matching code (deploy `b96489ad`), verified afterwards: the old query
fails, the new one succeeds, 84 workflows and 52 `visible_if` rows intact. Nothing was lost,
because the dropped columns were empty — which was luck of timing, not design.

**The lasting risk is the topology, not the dev's judgement: any schema change made locally
hits production immediately, before any code ships.**

**Next step:** the repo owner has a planned DB-setup change that separates them. Until it
lands, treat every local migration as a production migration, and keep the dispatch-prompt
rule that schema changes, pushes and anything outward-facing are the reviewer's call — devs
were told not to touch files outside their ticket, but nothing said anything about shared
infrastructure.

---

## LU-B2 — Phase 1 gate live drive-through never completed · `informational`

The Phase 1 gate is marked `[~]`, not `[x]`. LU-4's searchable operand combobox was proven
to be *served* by the running app (grepped the transformed bundle in both directions — new
code present, replaced code gone) and is covered by 20 component tests exercising real
pointer and keyboard interaction, but its **rendered appearance in the real builder was never
eyeballed**.

The drive-through was blocked by an icon-only expand button with no accessible name — filed
as O-5 and since fixed — and then by builder chrome that was mid-refactor in the working
tree (the Easy/Advanced control had become `role="radio"`, not a button).

Two changes also went to production without a live look: **Advanced UI in the Final Documents
editor became reachable for the first time** (O-10), and the logout token-clearing change
(O-11).

**Next step:** one drive-through of the builder's condition editor and the Final Documents
editor. If the newly-visible Advanced surface looks half-finished, that is a signal it was
gated deliberately — `git revert b8749dd5`.

---

## LU-B3 — The dead-store-action guardrail tests references, not reachability · `informational`

`tests/unit/client/store.deadSetters.test.ts` asserts every zustand action has a caller
outside its store. It exists because **no standard tool catches this**: to `tsc` and ESLint an
uncalled store action is a *used property of an object literal*, not an unused export, which
is how `setMode` sat dead for months while builder Advanced mode was unreachable.

Its known limit: it flagged `startPreview` but not `stopPreview`, because `RunnerPreview.tsx`
referenced the latter — while being itself unreachable. It finds the *entry point* of a dead
cluster, which is enough to pull the thread, but a pass is not proof that everything
reachable is alive.

Its `KNOWN_DEAD` allowlist is deliberately **empty**: all five actions it shipped with were
resolved rather than tolerated. Keep it empty.

**Next step:** none. Recorded so a future reader does not over-trust a green run.

---

## LU-B4 — Builder store state is global but conceptually per-workflow · `informational`

`client/src/store/workflow-builder.ts` now holds only `selection` and `inspectorTab`. Both are
genuinely ephemeral "what am I looking at right now" and harmless if reset. The two fields
that would actually have collided across concurrent builders — `mode` (server-owned,
per-workflow) and `previewRunId` (a live run id) — are gone.

**Next step:** nothing now. If builder tabs or split-view are ever designed, scope the
remaining two per builder instance at that point rather than retrofitting.

---

## Closed — do not re-file

Shipped tickets, with commits. Recover any ticket's full text via the `git log -p` command at
the top of this file.

| ID | What | Commit |
|---|---|---|
| LU-1 | Deleted the dead third condition model (`server/workflows/conditions.ts` + adapter) | `0d5c498d` |
| LU-2 | Un-forked list-field visibility; `LogicBuilder` takes an injected variable list | `2da2feb6` |
| LU-3 | Cycle + dangling-reference detection wired into the publish gate | `01e88b2e` |
| LU-4 | Searchable operand pickers replacing plain `Select`s | `5060d20f` |
| LU-6a | `logic_rules` carries a `when` `ConditionExpression`; flat columns dropped | `e7e106e9` |
| LU-6b | Rule CRUD + authoring UI — `skip_to`/`require`/`make_optional` usable at last | `5c6d35b2` |
| LU-6c | Retired the flat condition language; AI emits `when` natively | `0db2e2a3` |
| LU-5 | Deleted `LogicExpression`; document conditions authorable | `3826b5f7` |

Observations, all resolved:

| ID | Outcome | Commit |
|---|---|---|
| O-1 | **Not a defect** — `LogicPanel`'s two `LogicBuilder` call sites are the section and step branches | — |
| O-2 | Choices served with `WorkflowVariable`; deleted a whole-workflow steps fetch + client helper | `a532c780` |
| O-3 | Resolved by LU-6b — `logicRuleAPI`/`useLogicRules` properly typed | `5c6d35b2` |
| O-4 | `visibleIf`'s type was a lie in three files; a string would have silently hidden a question forever | `a532c780` |
| O-5 | Step-card expand toggle had no accessible name (blocked the gate's own drive-through) | `f576fbc3` |
| O-6 | Resolved by LU-6c — unreferenced `detectCycles` stub deleted | `0db2e2a3` |
| O-7 | Resolved by LU-6b — `conditionStepId` drift made *unrepresentable*, not merely tested | `5c6d35b2` |
| O-8 | Severity was wrong: the migrated database was **production**. Carried forward as **LU-B1** | — |
| O-9 | ~541 log sites lost their error messages; pino only auto-serializes a key named `err` | `f56a5b60` |
| O-10 | Builder mode had two sources of truth; the global copy was never written | `b8749dd5` |
| O-11 | Run tokens outlived logout in two stores; dead preview cluster deleted | `659aa731` |
| O-12 | Resolved by consequence of O-10/O-11 . Residual noted as **LU-B4** | `659aa731` |

Withdrawn / corrected findings, kept so they are not re-argued:

- **"AC2 and AC3 of GH-154 are unbuilt."** They were already built. `OPERATORS_BY_STEP_TYPE`
  covered the full 28-operator union, and `ConditionValueInput` already branched on
  `valueType` to render date/number/choice inputs. Only alias autocompletion was missing.
- **"O-9 is caused by the logger's wildcard `redact` paths."** LU-6c's diagnosis, disproved by
  a three-way pino probe: redaction was innocent. The cause was a missing serializer plus
  `Error.message` being non-enumerable.
- **"O-10 affects six components."** Two. The original count came from a grep matching files
  containing both `useWorkflowBuilder()` and the substring "mode", which caught local
  variables like `config.mode`.
- **"Fold Model B into A means dropping the `logic_rules` table."** Decision #5 reversed the
  mechanism: the duplication was the condition *language*, not the rules table. Reshaping it
  to hold a `ConditionExpression` kept the entity that versioning, portability, cloning and
  run serialization already understood, and cut LU-6c from L to M.
