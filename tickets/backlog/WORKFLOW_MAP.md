# Workflow Map (MAP) — retired 2026-08-09

Epic **GH-153**, "Add a visual workflow map with deterministic path simulation".
Audited 2026-08-08 at grade **C** and parted into MAP-1..10. **All ten tickets
and all eight backlog observations closed**, so nothing here is parked — this
file exists to stop finished work being rediscovered, and to keep the process
lessons that cost the most to learn.

Full ticket text, acceptance criteria and per-ticket verification notes:
`git log -p -- tickets/WORKFLOW_MAP_TICKETS.md`.

`test:fast` **2677 → ~2795** across the initiative.

---

## Closed — do not re-file

| ID | What | Commit |
|---|---|---|
| MAP-1 | Migrated `reactflow@11` → `@xyflow/react` v12; deleted the callerless Yjs canvas-sync layer that was the only thing keeping the old dep alive | `6dbbeb17` |
| MAP-2 | `shared/workflowMap.ts` — pure section/edge graph model + shared fixtures | `246b4fdd` |
| MAP-3 | `analyzeWorkflowFlow` in `shared/conditionGraph.ts`; unreachable sections and dead ends now surface through `lintWorkflowContent`, so the publish gate and Review tab get them too | `bf1a7de7` |
| MAP-4 | The Map tab and its rendering | `102299ec` |
| MAP-5 | Node → inspector navigation, by URL rather than store | `d1ef00c6` |
| MAP-6 | Flow diagnostics rendered on the map; `useWorkflowLint` shared with the Review tab | `916fea6a` |
| MAP-7 | `shared/workflowSimulation.ts` — the deterministic path simulator, proven at parity with `LogicService.evaluateNavigation` | `6c4a44c1` |
| MAP-8 | Simulation panel + live route highlight (GH-153 AC3) | `0ba1805e` |
| MAP-9 | Retired the AI logic-debug tab and `POST /api/ai/workflows/debug-logic` | `aa012bfd` |
| MAP-10 | **P0** — `refresh-token` returned a four-field user with no `tenantId`, silently disabling collaboration after any reload | `f0f9de64` |
| MAP-B1 | `sections.skip_if` — dropped. Column + all plumbing removed, migration `0023` | see below |
| MAP-B2 | Deleted `updateSelectedNode` from `server/realtime/awareness.ts` | `902d0415` |
| MAP-B3 | `WorkflowLintBuilderTab` / `BuilderTab` unions reunified, with a two-way sync guard | `902d0415` |
| MAP-B4 | Reordering sections now warns when it breaks a `skip_to` rule | `d9855b25` |
| MAP-B5 | Collaboration gated on the workflow ACL (`verifyAccess(..., 'edit')`), not creator-only | `a9bd42e5` |
| MAP-B6 | Worktree script no longer claims "the tree is broken" when the suite merely had a failure | `1dd55523` |
| MAP-B7 | `-EnsureDbs` recreates per-worktree test databases after the tmpfs container restarts | `1dd55523` |
| MAP-B8 | xyflow zoom controls themed for dark mode | `902d0415` |

## Standing decisions — do not re-litigate

| # | Decision |
|---|---|
| D-1 | The map renders with **`@xyflow/react` v12**. `reactflow@11` is gone. |
| D-2 | A map **node is a section**. `final_documents` steps get their own node kind; one synthetic `"__complete__"` terminal stands in for "endings" — **there is no ending entity in this schema**. |
| D-3 | Flow analysis lives in `shared/conditionGraph.ts` and surfaces through `lintWorkflowContent`, so the map, the Review tab and the publish gate read **one** answer. The AI logic-debugger that gave a second, non-binding one is gone. |
| D-4 | The map is **read-only**. Node positions are derived by layout, never persisted. |
| D-5 | A backward `skip_to` **stays a publish-blocking error**. Only its message was wrong — it claimed the run would "loop forever", which `isForwardSkipTarget` (RUN2-2) makes impossible. Backward *navigation* is a runner feature (`ReviewSection`'s Edit buttons), not a logic-rule one. |
| D-6 | **`sections.skip_if` is dropped** (2026-08-09). It was redundant, not missing: "skip if X" is `visible_if` with the group's existing `not` flag. 0 of 182 rows used it. Reintroducing a parallel dialect for section skipping would undo what GH-154 spent eight tickets achieving. |

---

## The lesson worth keeping: defects lived at the seams

Every defect found in this initiative sat **between** tickets, not inside one.
All had green gates, clean types, and a defensible self-grade of A:

| Ticket | The seam |
|---|---|
| MAP-2 | Its `final_documents` node had zero out-edges → MAP-3 would have flagged every document-generating workflow as a publish-blocking dead end |
| MAP-1 | An auth route's response shape vs a UI readiness gate → a **live P0**, collaboration off for every user |
| MAP-7 | Its edge labels vs MAP-2's edge ids → the map would have highlighted an arrow leaving a section the respondent never skipped from |
| MAP-10 | Two auth endpoints unified — a **third** existed (`/api/auth/google`), the only one sending `profileImageUrl` |
| MAP-8 | A skip edge's label rendered *on top of* the node it bypassed |

**What caught them: running one ticket's output through the next ticket's
rules.** Per-ticket gates structurally cannot see across that boundary. Budget
reviewer time for cross-seam probes on any multi-ticket initiative.

## Reviewer mistakes worth not repeating

1. **A conclusion drawn from one un-retried attempt.** The reviewer declared "no
   route to pixel proof exists in this environment" after a single Playwright
   call failed against a dev server that was still re-optimising Vite deps. Three
   later devs used Playwright successfully. Cost: MAP-8's review then found a
   visual defect that had been shipping since MAP-4. **Working recipe: a
   worktree-local dev server on a spare port, driven by Playwright MCP — never
   the Claude Browser pane, which does not composite frames here.**
2. **A ticket constraint that caused a dev to delete working UI.** MAP-10's
   ticket said "do not add fields beyond login's existing nine", written without
   knowing a third auth endpoint existed. The dev correctly followed it and
   removed the `profileImageUrl` avatar branches as dead code. They were not
   dead.
3. **Staging by path is not enough when the path is shared.** `git add
   client/src/pages/WorkflowBuilder.tsx` would have swept 243 lines of the repo
   owner's uncommitted work into a MAP-4 commit. The fix: rebuild a
   `HEAD + ticket-only` version, `git hash-object -w`, then `git update-index
   --cacheinfo` — stages the blob and leaves the working tree untouched.
   `git apply --3way` refuses on a dirty index.
4. **Contention manufactures false failures.** Running three suites at once
   produced a `VersionService.diff` failure at `5010ms` — a timeout, not a
   regression. It passed 5/5 alone. This is the same condition MAP-B6 fixed,
   reproduced by hand twenty minutes after fixing it.

## Environment facts that cost time

- **Four gates, not three.** `check:strict-zones` is **not** implied by
  `type-check` — `tsconfig.strict.json` enables `noUncheckedIndexedAccess` and
  the zones pull files in *transitively*, so editing anything a zone imports
  puts it under stricter rules. MAP-3 turned in green on three gates and red on
  this one. The house fix is destructure-and-check (see `detectCycles`), never
  `!` or `as`.
- **The test Postgres is tmpfs-backed.** Restarting it destroys every
  per-worktree database. `npm run test:docker:ensure-worktree-dbs` (MAP-B7)
  recreates them.
- **Baselines move per commit.** Never take one from the main checkout — it
  reads high whenever the repo owner has uncommitted test files.
