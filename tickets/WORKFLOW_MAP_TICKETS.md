# Workflow Map & Path Simulation Tickets (MAP-1..9 + backlog)

Source: code audit of GH-153 ("Add a visual workflow map with deterministic path
simulation", Size XL, P1) against the working tree at `dd1784cd`, 2026-08-08.
Scope: the builder's section/step/logic data path, `shared/workflowLogic.ts`,
`shared/conditionGraph.ts`, `server/services/workflowLintRules.ts`, the builder
tab shell, the collaboration client, and the deleted Stage-7 visual builder in
git history. Overall grade at audit time: **C** — every input the map needs
already exists and is already correct after GH-154, but nothing composes them,
one previous attempt at this feature was deleted wholesale and left a dependency
behind, and the only surface that claims to do AC4 today asks an LLM to do it.

Every finding below was verified against the working tree at audit time. **Line
numbers are advisory** — they were accurate when written and drift as fixes
land. The locator is the quoted code and the named symbol; grep for those. A
stale line number is not a broken ticket and does not need re-issuing.

**Baseline moves as tickets land — always use the number for YOUR base commit.**
A clean worktree reports: **2677** off `ffef0fd8` (audit time), **2690** off
`6dbbeb17` (after MAP-1 −2 and MAP-2 +15). The worktree script prints the real
number when it creates your tree; trust that over any number written here.
Note the main checkout reads ~4 higher than a clean worktree because the repo
owner has uncommitted test files in it — never take your baseline from main.

**One known-flaky area:** `tests/unit/services/PdfConverter.test.ts` and the
ClamAV `VirusScanner` tests use real sockets and timers and produced one
non-reproducible failure across three consecutive runs of this baseline. If a
single failure appears there, re-run before reporting it — but re-run and *say
so*, never assume.

---

## ⚠️ Read before you run anything

**Local development and production share one Neon database** (`LU-B1` in
`tickets/BACKLOG.md`). A local `npm run db:migrate` hits production immediately;
this caused a real outage on 2026-08-07. **No ticket in this file requires a
schema change** — if you believe yours does, that is a blocker to report, not a
migration to run.

---

## How to work this document

- **Tickets are grouped into 4 phases**, ordered by risk and dependency. Do not
  start a phase until the previous phase's **Phase Gate** has been verified and
  committed by the reviewer.
- Each ticket has: **Finding**, **Preferred fix**, **Ties**, and **Acceptance
  criteria** (all must pass).
- **Load the project skills named in your ticket's Ties before touching code.**
  At minimum every ticket here needs `run-tests` — `npm test` naively gives
  wrong results in this repo. UI tickets additionally need `design`; the Map is
  a new primary surface and the repo owner's standing instruction is that the
  design skill is loaded for *any* visual change.
- **Do not write a second condition evaluator or a second navigation
  resolver.** GH-154's predecessor spent eight tickets collapsing four condition
  languages into one. `shared/conditionEvaluator.ts` and `shared/workflowLogic.ts`
  are the only implementations; everything here composes them.
- **Four gates, not three.** `npm run type-check`, `npm run lint`,
  **`npm run check:strict-zones`**, `npm run test:fast`. The strict-zones check is
  not implied by `type-check`: `tsconfig.strict.json` enables
  `noUncheckedIndexedAccess` and its six zones pull files in **transitively**, so
  editing something a zone imports (e.g. `workflowLintRules.ts`,
  `conditionGraph.ts`) puts your code under stricter rules than `tsc` applied.
  The pre-commit hook runs it, so a tree failing here cannot be committed at all.
  MAP-3 turned in green on three gates and red on this one. The house fix is
  destructure-and-check — see the `const [firstNode] = cycle.path;` comment in
  `detectCycles` — never `!` and never `as`.
- Devs do not commit; the reviewer commits per passed ticket.
- Status legend: 🔲 Open · 🔄 In progress · ✅ Done (verified at review)

### Decisions already made — do not re-litigate

| # | Decision | Ruled |
|---|---|---|
| D-1 | The map renders with **`@xyflow/react` v12**. The legacy `reactflow@11` dependency is migrated off, not kept. | 2026-08-08 |
| D-2 | A map **node is a section**. `final_documents` steps get their own node type, and one synthetic terminal "Complete" node stands in for AC1's "endings" — there is no ending entity in this schema. Step-level detail is expand-on-demand, never the default view. | 2026-08-08 |
| D-3 | AC4's analysis lives in **`shared/conditionGraph.ts` and surfaces through `lintWorkflowContent`**, so the publish gate and Review tab get it too. The map renders those same findings. The AI-powered `LogicDebugTab` is **retired** (MAP-9). | 2026-08-08 |
| D-4 | The map is **read-only**. It navigates and simulates; it does not author. Node positions are derived by layout, never persisted. | 2026-08-08 |
| D-5 | A backward `skip_to` **stays a publish-blocking error** (`checkSkipDirection`), and MAP-3 emits no competing warning. Only its message changes — "would loop the interview forever" is false, since `isForwardSkipTarget` (RUN2-2) discards the skip and falls through to normal flow. Rationale: backward jump-back already exists as a *runner navigation* feature (`ReviewSection`'s per-section **Edit** buttons → `setCurrentSectionIndex`), which bypasses the logic engine entirely — so no legitimate authoring need is lost. And the realistic trigger is a **page reorder** silently turning a working forward rule backward (`SectionService.reorderSections` validates nothing), which is a regression; warnings publish and get ignored, so a dead rule would ship unnoticed. See MAP-B4. | 2026-08-08 |

### Phase overview

| Phase | Theme | Tickets | Est. effort |
|---|---|---|---|
| 1 | Foundation — dependency, graph model, analysis engine | MAP-1..3 | ~2 days |
| 2 | The map surface | MAP-4..6 | ~2 days |
| 3 | Deterministic path simulation | MAP-7..8 | ~2 days |
| 4 | Retire the surface this replaces | MAP-9 | ~0.5 day |
| Backlog | Not phase-gated | MAP-B1..B3 | |

### File footprint at a glance (dispatch lookup)

| Ticket | Primary files | Collides with |
|---|---|---|
| MAP-1 | `package.json`, `client/src/hooks/collab/useCollabClient.ts`, `client/src/components/collab/CollaborationContext.tsx` | none |
| MAP-2 | `shared/workflowMap.ts` (new), `tests/fixtures/workflowMap.ts` (new) | none |
| MAP-3 | `shared/conditionGraph.ts`, `server/services/workflowLintRules.ts`, `shared/types/workflowLint.ts` | MAP-6 (type only) |
| MAP-4 | `client/src/components/builder/map/**` (new), `BuilderTabNav.tsx`, `WorkflowBuilder.tsx` | MAP-5, MAP-6 |
| MAP-5 | `client/src/components/builder/map/**` | MAP-4, MAP-6 |
| MAP-6 | `client/src/components/builder/map/**`, `shared/types/workflowLint.ts` | MAP-3, MAP-4, MAP-5 |
| MAP-7 | `shared/workflowSimulation.ts` (new), `tests/unit/` | none |
| MAP-8 | `client/src/components/builder/map/**` | MAP-4..6 |
| MAP-9 | `server/routes/ai.routes.ts`, `server/controllers/AiController.ts`, `server/services/ai/`, `shared/types/ai.ts`, `client/src/components/builder/logic/` | none |
| MAP-10 | `server/routes/auth.routes.ts`, `client/src/hooks/useAuth.ts` | none |

MAP-1, MAP-2, MAP-3 have disjoint footprints and **may be dispatched in
parallel** in separate worktrees — MAP-3 is decoupled from MAP-2 on purpose
(structural parameters + its own adapter), so neither touches the other's files.
MAP-4, MAP-5, MAP-6 and MAP-8 all live in `client/src/components/builder/map/`
and **must be sequenced**.

---

# Phase 1 — Foundation

No user-visible change lands in this phase. It produces the dependency the map
renders with, the pure graph model it renders *from*, and the analysis engine
behind AC4. Explicitly out of scope: any React component under
`client/src/components/builder/map/`, which is Phase 2.

## MAP-1 — Migrate `reactflow@11` to `@xyflow/react` v12 and delete the dead collab canvas sync ✅

> **Verified 2026-08-08.** ACs 1–4 and 6–7 met; **AC5 deferred to MAP-10**, see
> below. Reviewer re-ran all four gates in the worktree rather than accepting the
> report: `type-check` exit 0, `lint` exit 0, `check:strict-zones`
> `✅ ALL PASSED`, `test:fast` **231 files / 2675 passed** — exactly the 2677
> baseline minus the two deleted node/edge tests. The diff is **1 insertion,
> 189 deletions** across three files: a pure removal, as intended. No debug
> leftovers, no commented-out code, presence/cursor/mode paths byte-identical.
> `grep -rn "reactflow" client server shared tests` → zero. `@xyflow/react@^12.11.2`
> installed via real npm commands, not a hand-edited manifest.
>
> **AC5 (live collaboration presence) could not be verified, and that is not this
> ticket's fault.** The dev ran the worktree's own dev server on port 5271, seeded
> a tenant, two users and a shared workflow, and drove two genuinely independent
> browser contexts — then found no presence avatar in either, and root-caused it
> instead of guessing or fabricating. Reviewer confirmed the diagnosis at the
> source: `POST /api/auth/refresh-token` returns a four-field user with no
> `tenantId`, while `WorkflowBuilder.tsx` gates collaboration on
> `!!user?.tenantId`. **Presence is therefore off for every user after any page
> reload, and was already off before this ticket.** Filed as **MAP-10** (P0).
> AC5 is carried there as its AC6, with the reload step made explicit — that is
> what makes the bug reproduce.
>
> Reviewer note: the honest "unverified, here is why" turn-in is exactly the
> behaviour wanted. A dev who had quietly marked AC5 green would have buried a
> live P0.

**Priority: P2** · Size: M · Files: `package.json`, `client/src/hooks/collab/useCollabClient.ts`, `client/src/components/collab/CollaborationContext.tsx`

### Finding

`package.json` carries `"reactflow": "^11.11.4"`. It was added by commit
`7204c163` ("feat: Implement Stage 7 - Full Visual Workflow Builder"), whose
entire client surface was then deleted in `0cbcf479` ("chore(graph-builder):
delete client graph builder + run-observability UI (phase 3)"). The dependency
was never removed. `reactflow` v11 is superseded by `@xyflow/react` v12 and
receives no new development.

What survives of the deleted builder is a Yjs sync layer for canvas nodes and
edges with **no callers**. In `useCollabClient()`
(`client/src/hooks/collab/useCollabClient.ts`):

```ts
import type { Node, Edge } from 'reactflow';
...
  updateNodes: (nodes: Node[]) => void;
  updateEdges: (edges: Edge[]) => void;
```

`grep -rn "\bupdateNodes\b" client server tests` returns only the interface
declaration, the `useCallback` definition, the return-object property, and one
assertion in `tests/unit/collab.client.test.tsx`. The same holds for
`updateEdges`. The consumer-side callbacks in `CollaborationProvider`
(`client/src/components/collab/CollaborationContext.tsx`) are optional and
default to a no-op:

```ts
        onNodesChange: onNodesChange ?? noOp,
        onEdgesChange: onEdgesChange ?? noOp,
```

`WorkflowBuilder.tsx` — the only place that renders `CollaborationProvider` —
passes neither prop. So the Yjs `nodes`/`edges` arrays are written by nothing,
read by nothing, and exist only to give two `import type` statements something
to resolve. They are the *sole* reason `reactflow` is still installed.

Consequence: the map cannot be built on a current library without first
untangling this, and a dev who migrates the import naively will preserve dead
Yjs plumbing into the new dependency.

### Preferred fix

Two steps, in this order:

1. **Delete the dead canvas sync.** Remove `updateNodes`, `updateEdges`,
   `updateSelectedNode`, `onNodesChange`, `onEdgesChange`, and the Yjs
   `yNodes` / `yEdges` arrays they operate on, from `useCollabClient` and
   `CollaborationContext`. Remove the corresponding assertions from
   `tests/unit/collab.client.test.tsx` rather than leaving them asserting
   against nothing. **Leave presence, cursors, and mode sync alone** — those
   have live callers (`PresenceAvatars`, `CollabSync` in `WorkflowBuilder.tsx`).
   `server/realtime/awareness.ts`'s `updateSelectedNode` is the server side of
   the same dead channel; see MAP-B2 — **do not** remove it in this ticket, note
   it and move on.
2. **Swap the dependency.** `npm uninstall reactflow && npm install
   @xyflow/react`. With step 1 done, no `import type { Node, Edge }` remains, so
   this should leave zero source imports of either package — verify that, do not
   assume it.

Do not add any map component here. This ticket ends with the new dependency
installed and unimported; MAP-4 is its first consumer.

The v12 stylesheet import path is `@xyflow/react/dist/style.css` (v11's was
`reactflow/dist/style.css`). Nothing imports it today; MAP-4 will.

### Ties

- **Load first:** `run-tests` skill. This touches a client test file and the
  fast suite is the gate.
- **Blocks MAP-4**, which imports `@xyflow/react`. MAP-4 must not start until
  this is ✅ and committed.
- **Parallel-safe with MAP-2 and MAP-3** — disjoint files.
- Related: **MAP-B2** (`server/realtime/awareness.ts` selected-node channel) —
  file an observation, do not fix.
- File footprint: `package.json`, `package-lock.json`,
  `client/src/hooks/collab/useCollabClient.ts`,
  `client/src/components/collab/CollaborationContext.tsx`,
  `tests/unit/collab.client.test.tsx`.

### Acceptance criteria

1. `grep -rn "reactflow" client server shared tests` (excluding
   `package-lock.json`) returns **zero** matches.
2. `package.json` lists `@xyflow/react` and no longer lists `reactflow`.
3. `updateNodes`, `updateEdges`, `updateSelectedNode`, `onNodesChange`, and
   `onEdgesChange` no longer exist in `client/src/hooks/collab/useCollabClient.ts`
   or `client/src/components/collab/CollaborationContext.tsx`, and neither file
   declares a Yjs array for nodes or edges.
4. `tests/unit/collab.client.test.tsx` still passes and no longer references the
   removed methods. Its **presence and cursor assertions are unchanged** — a
   diff that also weakens those is a fail, not a pass.
5. Collaboration still works end-to-end: with the dev server running, open the
   same workflow in two browser contexts and confirm presence avatars appear in
   both. Attach the evidence (screenshot or the `PresenceAvatars` DOM from both
   contexts). The `verify` skill documents how to get an authenticated local
   session without Google OAuth.
6. `npm run type-check` → 0 errors; `npm run lint` → 0 problems.
7. `npm run test:fast` ≥ **2677** passing tests (the audit baseline), with the
   collab file's own count reduced only by the assertions deleted in AC4.

---

## MAP-2 — Build the pure workflow-graph model in `shared/` ✅

> **Verified 2026-08-08.** All nine ACs met. Reviewer re-ran every gate in the
> worktree rather than accepting the report: `type-check` exit 0, `lint` exit 0,
> `check:strict-zones` 6 zones / 11 files all passed, `test:fast` **232 files /
> 2692 passed** (clean baseline 2677, +15 new). Three new files, nothing existing
> touched.
>
> **Defect found at review and sent back — a cross-ticket seam neither ticket's
> own gate could see.** The `final_documents` node was built with **zero outgoing
> edges**. Reviewer probed the dev's own fixture:
>
> ```
> section          section-a      outgoing=2 step-doc,section-b
> final_documents  step-doc       outgoing=0
> section          section-b      outgoing=1 __complete__
> terminal         __complete__   outgoing=0
> ```
>
> MAP-3's AC3 makes any non-terminal node with no outgoing edge an error-severity
> `deadEnds` finding, and dead ends are publish-blocking — so once MAP-3 and MAP-6
> landed, **every workflow containing final documents would have been blocked from
> publishing**. Fixed by giving each `final_documents` node a sequential edge to
> the terminal node, which is also the semantically right model: documents are an
> ending, and `section.config.finalBlock === true` already marks their section as
> the final one. Re-probed after the fix — the terminal node is now the only
> zero-out-degree node in all three fixtures.
>
> The regression test asserts *"the terminal node is the only node with zero
> outgoing edges"* against `workflowWithFinalDocuments()` specifically, not a
> linear fixture where it would pass trivially.
>
> **Ticket bug found by the dev, and they were right.** The `Preferred fix` code
> sample omitted `conditionStepId` from the rule input, but a rule's origin
> section is only reachable via `conditionStepId → steps.sectionId`, so AC4's
> "from = the section holding the rule's condition" was not computable as
> written. Added to the input type only; the two output interfaces MAP-3 consumes
> structurally are unchanged and unnarrowed.
>
> Both absence-assertions (AC4's dangling target, AC6's `skipIf`) carry explicit
> sanity checks proving the fixture contains the thing being excluded.

**Priority: P1** · Size: M · Files: `shared/workflowMap.ts` (new), `tests/fixtures/workflowMap.ts` (new)

### Finding

Nothing turns a workflow into a graph. The builder has every input already
loaded client-side — `useSections(workflowId)`, `useWorkflowSteps(workflowId)`
and `useLogicRules(workflowId)` in `client/src/hooks/api/` — and the server has
the same shapes via `RunDefinitionProvider`. But there is no function anywhere
that answers "what are the nodes and edges of this workflow", so the map would
have to invent one inside a React component, where it cannot be unit-tested
against the evaluator and cannot be reused by the lint pipeline (MAP-3) or the
simulator (MAP-7).

Three edge sources exist in the data and must be distinguished, because they
mean different things to an author:

- **Sequential** — `sections.order`. The default path.
- **Skip** — a `logic_rules` row with `action: 'skip_to'` and
  `targetType: 'section'`. Resolved by `resolveNextSection()` in
  `shared/workflowLogic.ts`, first-firing-by-`rule.order` wins.
- **Conditional visibility** — `sections.visible_if` / `steps.visible_if`, plus
  `show` / `hide` rules. These do not create a *route*; they gate whether a node
  is on it. Drawing them as edges would misrepresent the model.

A fourth is a trap: **`sections.skip_if` is stored but never evaluated.** It is
in the Drizzle schema (`shared/schema/workflow.ts`, `skipIf: jsonb("skip_if")`),
is cloned (`WorkflowClonerService.ts`), versioned (`VersionService.ts`),
exported (`portability/entityGraph.ts`) and carried through
`RunDefinitionProvider`, and `LogicContextSection` declares it:

```ts
export interface LogicContextSection {
  ...
  visibleIf?: unknown;
  skipIf?: unknown;
```

But `evaluateWorkflowVisibility()` in `shared/workflowLogic.ts` reads only
`visibleIf`, and no authoring UI writes it — `SectionLogicSheet.tsx` sets
`visibleIf` only. It is a phantom field. See MAP-B1.

Finally, `logic_rules` holds **0 rows across 84 workflows** and only became
authorable last week (LU-6b), so there is no production data to develop against.
Fixtures are not optional here.

### Preferred fix

Add `shared/workflowMap.ts`: pure, framework-agnostic, no React, no imports from
`client/` or `server/`. Mirror the house style of `shared/conditionGraph.ts` —
plain data in, plain data out, so it unit-tests directly against small
hand-built inputs.

Export one builder plus its types:

```ts
export type WorkflowMapNodeKind = "section" | "final_documents" | "terminal";
export type WorkflowMapEdgeKind = "sequential" | "skip";

export interface WorkflowMapNode {
  id: string;
  kind: WorkflowMapNodeKind;
  label: string;
  order: number;
  /** Set when the node's own visibility is conditional (visibleIf, or a show/hide rule targets it). */
  conditional: boolean;
  /** Ids of steps inside this section whose own visibleIf is set — the expand-on-demand payload (D-2). */
  conditionalStepIds: string[];
}

export interface WorkflowMapEdge {
  id: string;
  from: string;
  to: string;
  kind: WorkflowMapEdgeKind;
  /** For `skip` edges, the rule that produces it — lets the UI link to the rule. */
  ruleId?: string;
}

export function buildWorkflowMap(input: {
  sections: { id: string; title: string; order: number; visibleIf?: unknown }[];
  steps: { id: string; sectionId: string; type: string; title: string; visibleIf?: unknown }[];
  rules: { id: string; action: string; targetType: string; targetSectionId: string | null; targetStepId: string | null; order: number }[];
}): { nodes: WorkflowMapNode[]; edges: WorkflowMapEdge[] };
```

Rules for the implementation, all of which are testable:

- Sections sort by `order`, exactly as `calculateNextSection()` does
  (`[...sections].sort((a, b) => a.order - b.order)`). Do not assume input order.
- A section containing a `final_documents` step yields **an additional
  `final_documents` node** downstream of that section, not a replacement for it.
- Exactly one `terminal` node, id `"__complete__"`, with an incoming sequential
  edge from the last section in order. This is D-2's stand-in for AC1's
  "endings".
- One `skip` edge per `skip_to` section rule, `from` = the section holding the
  rule's condition, `to` = `targetSectionId`. A rule whose target does not
  resolve to a known section produces **no edge** — MAP-3 reports it as a
  finding; a dangling edge is not the map's job to draw.
- **Emit nothing for `skipIf`.** It is dead (see Finding). A dev who "helpfully"
  wires it up is shipping a behaviour the runner does not have.

Also add `tests/fixtures/workflowMap.ts` exporting a small set of named
builders — at minimum: a linear 3-section workflow, one with a forward
`skip_to`, one with a backward `skip_to` (which `resolveNextSection` treats as a
no-op), one with an unreachable section, and one with a `final_documents` step.
MAP-3, MAP-4, MAP-7 and MAP-8 all consume these; build them to be reused, not
inlined.

### Ties

- **Load first:** `run-tests` skill.
- **Blocks MAP-4 and MAP-7**, which import `shared/workflowMap.ts` and
  `tests/fixtures/workflowMap.ts`.
- **Parallel-safe with MAP-1 and MAP-3.** MAP-3 deliberately takes structural
  parameters and builds its own adapter, so it shares no file with this ticket.
  Your `WorkflowMapNode` / `WorkflowMapEdge` must satisfy `analyzeWorkflowFlow`'s
  structural signature — `{ id, kind, order }` and `{ id, from, to, kind }` — so
  the client can pass this function's output straight in with no cast. The
  interface above already does; do not narrow it.
- Donor patterns: `shared/conditionGraph.ts` for module shape, doc-comment
  density and the pure-graph discipline; `calculateNextSection()` in
  `shared/workflowLogic.ts` for section ordering.
- Related: **MAP-B1** (`sections.skipIf` is dead) — file an observation, do not
  fix.
- File footprint: two new files. Touches nothing existing.

### Acceptance criteria

1. `shared/workflowMap.ts` exports `buildWorkflowMap`, `WorkflowMapNode`,
   `WorkflowMapEdge`, `WorkflowMapNodeKind`, `WorkflowMapEdgeKind` and imports
   nothing from `client/` or `server/`.
2. Sections are ordered by `order`, proven by a test whose input array is
   deliberately shuffled relative to its `order` values.
3. A workflow with a `final_documents` step yields a `final_documents` node
   **in addition to** its section node, and exactly one `terminal` node with id
   `"__complete__"`.
4. A `skip_to` section rule yields one `skip` edge carrying its `ruleId`; a
   `skip_to` rule whose `targetSectionId` matches no supplied section yields
   **no edge at all**. The test for the second case must build a rule with a
   real-looking-but-absent target — an empty rules array does not satisfy it.
5. A section with a non-null `visibleIf` has `conditional: true`; a section
   targeted by a `show` or `hide` rule also has `conditional: true`; a section
   with neither has `conditional: false`.
6. A section carrying a `skipIf` value produces **no edge and no node property
   derived from it** — asserted with a fixture that actually sets `skipIf`.
7. `tests/fixtures/workflowMap.ts` exports at least the five named builders
   listed in the Preferred fix, and the new unit tests consume them.
8. New test file `tests/unit/workflowMap.test.ts` covers AC2–AC6.
9. `npm run type-check` → 0 errors; `npm run lint` → 0 problems;
   `npm run test:fast` green and above the 2677 baseline.

---

## MAP-3 — Detect unreachable sections, dead ends and loop risks in the lint pipeline ✅

> **Verified 2026-08-08.** All nine ACs met, with AC5 as replaced by **D-5**.
> Reviewer fast-forwarded the worktree from its stale base `945c98ff` to current
> main (zero file overlap, verified first) and re-ran all four gates there:
> `type-check` 0, `lint` 0, `check:strict-zones` `✅ ALL PASSED`, `test:fast`
> **238 files / 2737 passed** (main was 2723, +14).
>
> `analyzeWorkflowFlow` reuses `detectCycles` — no second three-colour DFS — and
> takes structural parameters, so `shared/conditionGraph.ts` imports nothing from
> `shared/workflowMap.ts` and the two tickets ran in parallel without sharing a
> file. Scoping `loops` to `skip`-kind edges only is the dev's own call and is
> correct: over the combined graph a backward skip plus the ever-present forward
> sequential edge trivially closes a 2-cycle, which would have double-escalated
> exactly the case D-5 downgrades.
>
> **The adapter reads the serializer, not the schema.** `rule.targetId` and
> `conditionStepId ?? conditionStepAlias`, matching
> `VersionService.serializeWorkflow`. An adapter written against the DB column
> names (`targetSectionId`) would type-check, pass its own fixtures, and never
> fire in production. Reviewer confirmed it fires on real serialized content.
>
> **D-5 rework landed clean.** The competing backward-skip warning is deleted
> (along with its now-unused `skipEdges`/`FlowSkipEdgeMeta` plumbing, not left
> orphaned), and `checkSkipDirection`'s message is a one-line change to
> *"...so it can never fire. This usually happens after sections get reordered."*
> — no looping claim, still `error`, still blocking, now pinned by a test that
> asserts both the severity and that `validateWorkflow` still rejects.
>
> **Cross-seam probe (reviewer).** Ran MAP-2's `buildWorkflowMap` output through
> this ticket's `analyzeWorkflowFlow`: `deadEnds=[]` on the final-documents
> fixture, confirming MAP-2's terminal-edge fix holds end to end. Then ran
> `lintWorkflowContent` on the unreachable fixture and confirmed the finding
> carries `target.sectionId="section-b"`, which **attaches to a real MAP-2 node
> id** — so MAP-6 can render it. See the note added to MAP-6 about why the two
> graphs deliberately disagree on reachability.


**Priority: P1** · Size: M · Files: `shared/conditionGraph.ts`, `server/services/workflowLintRules.ts`, `shared/types/workflowLint.ts`

### Finding

GH-153 AC4 asks the map to flag "unreachable sections, dead ends, and infinite
loop risks". Two surfaces claim territory here today and neither delivers it.

**The lint pipeline is close but scoped to the wrong graph.**
`lintConditionDependencies()` in `server/services/workflowLintRules.ts` runs
`detectCycles` / `detectDanglingReferences` from `shared/conditionGraph.ts`, but
that graph is explicitly only the `visibleIf` dependency graph, as its own
header says:

```
 * Scoped to `visibleIf` (the pull model: an element carries its own condition).
 * Workflow logic rules are the push model — a rule acts on a target — and are
 * evaluated by `shared/workflowLogic.ts`. Both now speak the same
 * `ConditionExpression` language, but they are different shapes and this graph
 * deliberately covers only the first.
```

So a circular *reference* between two conditions is caught; an unreachable
*section* or a `skip_to` loop is not. `lintLogicRules()` checks only that a
rule's targets resolve — it never looks at where the rules send the run.

**The other surface asks an LLM.** `LogicDebugTab`
(`client/src/components/builder/logic/LogicDebugTab.tsx`) renders a "Run
Analysis" button over `useDebugLogic()` → `POST /api/ai/workflows/debug-logic`,
with the empty-state copy:

```tsx
Run debugging to check for unreachable pages, loops, and errors.
```

That is AC4, answered non-deterministically by a model, on a surface separate
from the publish gate — so an author can be told "no issues found" by the AI
tab and then blocked at publish, or vice versa. D-3 retires it (MAP-9).

Consequence: authors get no reliable reachability signal anywhere, and the
publish gate ships workflows with sections no respondent can ever be shown.

### Preferred fix

Extend the existing engine; do not start a new one.

**In `shared/conditionGraph.ts`**, add a second, clearly-separated block of pure
graph functions. Keep them O(V+E) and keep the header comment honest about the
new scope — the file currently states it covers only the pull model, and that
stops being true.

**Take structural parameters, not MAP-2's named types.** `conditionGraph.ts`'s
own header states its discipline: *"pure, framework-agnostic graph algorithms
operating on a plain adjacency list so they can be unit-tested directly against
small hand-built graphs, independent of how a workflow's sections/steps get
turned into node/edge data"*. Importing `WorkflowMapNode` would break that, and
it is also what lets this ticket run in parallel with MAP-2. MAP-2's types
satisfy these shapes structurally, so the client passes its output in directly
with no adapter and no cast.

```ts
export interface WorkflowFlowDiagnostics {
  unreachable: string[];      // node ids with no path from the first section
  deadEnds: string[];         // non-terminal node ids with no outgoing edge
  loops: { path: string[] }[]; // cycles reachable through `skip` edges
}
export function analyzeWorkflowFlow(
  nodes: { id: string; kind: string; order: number }[],
  edges: { id: string; from: string; to: string; kind: string }[]
): WorkflowFlowDiagnostics;
```

Reuse `detectCycles`' three-colour DFS for `loops` — build the adjacency list
with `buildConditionDependencyGraphFromEdges` and hand it to `detectCycles`.
Do not write a second cycle detector; the existing one already gets the diamond
case right (a re-reached BLACK node is a DAG merge, not a cycle) and that
subtlety is exactly what a reimplementation loses.

**Emit nothing of your own for a backward `skip_to` — see D-5.** An earlier
revision of this ticket asked for a `warning`; that was overturned at review on
2026-08-08 once it emerged that `checkSkipDirection` in
`server/services/workflowStructureRules.ts` already reports the same condition as
a blocking error. Your job on that case is limited to **fixing its message**,
which is factually wrong ("would loop the interview forever" — impossible, see
`isForwardSkipTarget`). Do not add a second finding.

**In `server/services/workflowLintRules.ts`**, add `lintWorkflowFlow()`
alongside `lintConditionDependencies()` and call it from `lintWorkflowContent()`.
Emit `category: "logic"` findings using the existing `WorkflowLintIssue` shape,
with `target` pointing at the offending section — mirror how
`lintConditionDependencies` builds its `target` from the node-info map. Severity:
unreachable = `error`, dead end = `error`.

**Read the serializer, not the schema, for rule field names.**
`lintWorkflowContent` receives `VersionService.serializeWorkflow`'s output, which
emits `targetId` / `targetAlias` / `conditionStepAlias` — **not** the DB column
names `targetSectionId` / `targetStepId`. An adapter written against the schema
type-checks, passes its own fixtures, and never fires in production.

**In `shared/types/workflowLint.ts`**, add `"map"` to `WorkflowLintBuilderTab`
so MAP-6 can target the map surface. (The union today is
`"sections" | "templates" | "data-sources" | "settings"` and already omits the
existing `review` and `snapshots` tabs — add only `"map"`; the rest is MAP-B3.)

Note `lintWorkflowContent` receives **serialized** content — sections with
nested `steps`, and a flat `logicRules` array. That is a *different* input shape
from the client's three separate queries, so build the node/edge arrays with a
small local adapter in `workflowLintRules.ts`, exactly as
`buildWorkflowConditionGraph` in that same file already does for the visibleIf
graph. **Do not import `buildWorkflowMap` from MAP-2** — it adapts the client's
shape, not this one, and this ticket must not depend on MAP-2's file. Two
adapters onto one analysis is the intended design here, not duplication.

### Ties

- **Load first:** `run-tests`, then `add-api-endpoint` — `workflowLintRules.ts`
  is service-layer and the error/finding contract matters.
- **Independent of MAP-2** by design (see Preferred fix: structural parameters,
  local adapter). The two may run in parallel and share no file. If you find
  yourself needing to create or edit `shared/workflowMap.ts`, stop and report a
  blocker — that file belongs to MAP-2 and a concurrent dev is writing it.
- **Blocks MAP-6**, which renders these findings on the map.
- **Shares `shared/types/workflowLint.ts` with MAP-6** (one added union member).
  Sequence MAP-3 → MAP-6.
- Existing tests to extend rather than duplicate: search
  `tests/unit/` for the current `workflowLintRules` / publish-gate coverage
  (`publish-document-readiness.test.ts`, `publish-lint-gate.test.ts`) and follow
  their arrangement.
- File footprint: `shared/conditionGraph.ts`, `server/services/workflowLintRules.ts`,
  `shared/types/workflowLint.ts`, plus test files.

### Acceptance criteria

1. `analyzeWorkflowFlow` is exported from `shared/conditionGraph.ts`, reuses
   `detectCycles` (`grep` shows no second three-colour DFS in the file), and
   `shared/conditionGraph.ts` imports nothing from `shared/workflowMap.ts`.
2. A section unreachable from the first section (its only inbound edge removed
   by a `hide` rule chain, or orphaned by ordering) appears in `unreachable`;
   a fully linear workflow yields `unreachable: []`.
3. A non-terminal node with no outgoing edge appears in `deadEnds`; the
   `terminal` node never does.
4. A `skip_to` cycle among sections is reported in `loops` with its path; a
   diamond (two forward skips converging on one section) is **not** reported —
   this test must construct a real diamond, not an empty graph.
5. **(Replaced at review 2026-08-08 — see D-5.)** `lintWorkflowFlow` emits **no**
   finding of its own for a backward `skip_to`. Instead `checkSkipDirection` in
   `server/services/workflowStructureRules.ts` keeps its blocking `error`, with
   its message rewritten to say the rule can never fire and to name reordering as
   the likely cause — the current "would loop the interview forever" wording is
   false. `tests/unit/services/workflowStructureRules.test.ts` asserts the new
   wording, plus a case pinning that the finding is still `error` severity and
   still blocks `validateWorkflow`.
6. `lintWorkflowContent` returns the new findings with `category: "logic"` and a
   `target` naming the offending `sectionId`.
7. `WorkflowLintBuilderTab` includes `"map"`.
8. New/extended tests cover AC2–AC6. Each reachability test must be proven to
   fail without the new code — state in the turn-in report which assertions were
   confirmed red first.
9. `npm run type-check` → 0 errors; `npm run lint` → 0 problems;
   **`npm run check:strict-zones` → `Status: ✅ ALL PASSED`**;
   `npm run test:fast` green and above the 2677 baseline.

   ⚠️ The strict-zones gate is **not** implied by `type-check`.
   `tsconfig.strict.json` turns on `noUncheckedIndexedAccess` and the zones pull
   files in **transitively** — the scripting zone imports the lint rules, so
   edits to `workflowLintRules.ts` or `conditionGraph.ts` land inside it. The
   pre-commit hook runs it, so a tree that fails here cannot be committed at all.
   `detectCycles` already carries the house fix (destructure-and-check, never
   `!` or `as`); copy it.

---

## MAP-10 — `refresh-token` drops `tenantId`, silently killing collaboration after any reload ✅

> **Verified 2026-08-08.** All seven ACs met. Reviewer re-ran all four gates:
> `type-check` 0, `lint` 0, `check:strict-zones` `✅ ALL PASSED`, `test:fast`
> **233 files / 2696 passed** (baseline 2690, +6). Dev confirmed the new tests red
> first, twice — 3 of 4 in round one, 5 of 6 in round two.
>
> **The audit was incomplete and the ticket was wrong; the fix is bigger than
> filed.** There were **three** divergent user projections, not two: login (9
> fields), refresh (4), and `POST /api/auth/google` (8, and the only one carrying
> `profileImageUrl`). My "do not add fields beyond login's existing nine"
> instruction led the dev to delete the avatar `<img>` branches in `Header.tsx`
> and `Sidebar.tsx` as dead code. They were not dead — Google users' avatars
> rendered after sign-in and vanished on the first reload, the identical bug to
> `tenantId`. Branches restored byte-for-byte, `profileImageUrl` added to
> `AuthUserPayload`, and all **three** endpoints now build from one exported
> `buildAuthUserPayload`.
>
> **A second bug fixed in passing, which the dev under-sold as a "minor side
> effect".** The Google response used to send `id: payload.sub` — the Google
> subject — while `authService.createToken(dbUser)` issued a JWT carrying
> `dbUser.id`. Those differ whenever an account existed before Google sign-in,
> because `dbUser` is fetched by **email** (`findByEmail(payload.email)`), so the
> row keeps its original uuid. The client cached one identity while the server
> authorized another; `WorkflowBuilder` feeds `user.id` straight into
> `collabUser.id`. Routing through the helper makes both `dbUser.id`.
>
> Reviewer note: the dev's honest "AC6 unverified, here is why" in round one is
> what surfaced this whole vertical. See **MAP-B5** — presence still cannot show
> a *second* person, because the websocket join admits only `workflow.creatorId`.


**Priority: P0 (bug)** · Size: S · Files: `server/routes/auth.routes.ts`, `client/src/hooks/useAuth.ts`

> **Filed at MAP-1's review, 2026-08-08.** Not map work, and not caused by MAP-1
> — but it is what made MAP-1's AC5 unverifiable, and it blocks the live-proof
> criteria on MAP-4, MAP-5, MAP-6 and MAP-8 too. Sequenced into Phase 1 for that
> reason.

### Finding

`POST /api/auth/refresh-token` returns a **four-field** user
(`server/routes/auth.routes.ts`, the `res.json` at the end of the handler):

```ts
      res.json({
        token: newAccessToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          tenantRole: user.tenantRole
        }
      });
```

`issueTokens()` — the **login** path in the same file — returns nine, including
the two that matter here:

```ts
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      tenantId: user.tenantId,
      ...
```

`useAuth()` (`client/src/hooks/useAuth.ts`) sources the app's entire user object
from the **refresh** endpoint, and nothing else:

```ts
        const res = await fetch("/api/auth/refresh-token", { ... });
        return await res.json() as AuthResponse;
```

with `staleTime: 1000 * 60 * 14` and `refetchOnWindowFocus: true`.

**Why nobody noticed.** `LoginPage.handleSuccess` seeds the `["auth"]` cache with
the *rich* login payload, so immediately after signing in `user.tenantId` is
present and everything works. The first page reload, window refocus, or 14-minute
staleness replaces it with the reduced refresh payload — and `tenantId` becomes
`undefined` for the rest of the session. It works exactly long enough to be
tested by hand, then stops.

**Consequences.** `WorkflowBuilder.tsx` gates real-time collaboration on it:

```ts
  const isCollabReady = !!collabToken && !authLoading && !!user?.tenantId;
```

so presence and cursors are **off for every user, on every workflow, after any
reload** — and when enabled at all, `CollaborationProvider` gets
`tenantId: user?.tenantId ?? ""`. `firstName` is missing from the same payload,
so `collabUser.name` falls back to `"Guest User"` for everybody. Five other
surfaces read `user?.tenantId` from the same hook and get `undefined`:
`BrandingSettingsPage`, `CollectionsPage`, `CollectionDetailPage`,
`DomainSettingsPage`, `IntakePreviewPage`, plus `AssignInterviewDialog`'s
`tenantId` prop.

**Why the type system does not catch it.** `useAuth` declares
`interface AuthResponse { user: User }` — the full Drizzle row — while the route
sends an untyped inline object literal. `issueTokens` is at least annotated
`Partial<User>`; the refresh handler has no annotation at all, so nothing
reconciles the two shapes.

Server-side requests are unaffected: `authService.createToken(user)` puts the
real `tenantId` in the JWT, so API authorization is correct throughout. This is
purely a client-state gap.

### Preferred fix

Make the refresh payload identical to the login payload. `issueTokens()` already
builds the correct object — extract that user projection into one shared helper
in `server/routes/auth.routes.ts` and have **both** call sites use it, so the two
can never drift again. Do not fix it by widening only `tenantId`; the same class
of bug is sitting in `firstName`/`lastName` right now.

Then make the contract type-checked rather than conventional: give the helper an
explicit named return type and annotate `AuthResponse["user"]` in
`client/src/hooks/useAuth.ts` with that same shape (imported from `@shared`, or a
type declared alongside it) instead of the full `User` row. `User` is a lie
there — the client has never received a complete row from either endpoint.

Do **not** change what goes into the JWT, and do not add fields beyond login's
existing nine — this ticket closes a gap, it does not widen an auth payload.

### Ties

- **Load first:** `run-tests`, then `add-api-endpoint` (auth route + response
  contract).
- **Blocks MAP-1's AC5** and the live-proof criteria on MAP-4, MAP-5, MAP-6 and
  MAP-8. MAP-1 is committed with AC5 explicitly deferred here.
- Disjoint from every other MAP ticket — **dispatch in parallel** with anything.
- Note `docs/guides/AUTH_SYSTEM.md` documents this flow; update it if it states
  the refresh response shape.
- File footprint: `server/routes/auth.routes.ts`, `client/src/hooks/useAuth.ts`,
  plus auth route tests.

### Acceptance criteria

1. `POST /api/auth/refresh-token` returns the same user fields as the login
   response, including `tenantId`, `firstName` and `lastName`.
2. Both endpoints build that object from **one** shared helper — asserted by
   `grep` showing a single projection, not two literals.
3. The helper has an explicit named return type, and `useAuth`'s `AuthResponse`
   uses that type rather than `User`.
4. A route test asserts the refresh response contains `tenantId` and that it
   equals the user's real tenant — it must fail against today's four-field
   payload. State in the turn-in that you confirmed it red first.
5. A test asserts the login and refresh user payloads have identical key sets, so
   the two cannot drift again.
6. **Live proof:** with the dev server running, sign in, **reload the page**, and
   show that collaboration presence still initialises — two independent browser
   contexts (separate cookie jars, not two tabs) on the same workflow, both
   showing a presence avatar with the user's real first name, not "Guest User".
   The reload is the point; without it the bug does not reproduce.
7. `npm run type-check` → 0 errors; `npm run lint` → 0 problems;
   `npm run check:strict-zones` → `Status: ✅ ALL PASSED`;
   `npm run test:fast` green and above the current baseline.

---

## Phase 1 Gate

- [ ] MAP-1, MAP-2, MAP-3 all ✅ with dated verification notes
- [ ] `npm run type-check` → 0 errors
- [ ] `npm run lint` → 0 problems
- [ ] `npm run test:fast` → ≥ 2677 passing (audit baseline), 0 failing
- [ ] `npm run test:unit` green (MAP-3 touches the publish gate)
- [ ] Collaboration presence verified live in two browser contexts (MAP-1 AC5)
- [ ] Reviewer has committed each passed ticket + this gate

---

# Phase 2 — The map surface

Phase 2 builds the read-only map. All three tickets live in
`client/src/components/builder/map/` and **must run sequentially**. Out of
scope: path simulation (Phase 3) and any authoring affordance — per D-4 the map
does not create, delete, reorder or reposition anything.

## MAP-4 — Add the Map tab and render the workflow graph ✅

> **Verified 2026-08-08.** ACs 1–9 and 11 met; **AC10 (pixel screenshots) deferred
> to the Phase 2 gate** — see below. Reviewer re-ran all four gates in the
> worktree: `type-check` 0, `lint` 0, `check:strict-zones` `✅ ALL PASSED`,
> `test:fast` **236 files / 2717 passed** (baseline 2703, +14).
>
> **The two shared files were kept surgical, as required, and hand-merged rather
> than copied.** `BuilderTabNav.tsx` +4/-1 (one icon import, one union member, one
> `TABS` entry); `WorkflowBuilder.tsx` +6/-0 (one import, one `BuilderTabPanel`
> block on the `review` pattern). The repo owner had **243 uncommitted lines** in
> `WorkflowBuilder.tsx`; `git apply --3way` refuses on a dirty index, so the five
> hunks were applied by hand and the result verified: their diff went 243 → 249
> (exactly MAP-4's +6) and their `scrollbar-hide` / `BuilderModeToggle` edits are
> intact. Type-check passes on the merged tree, and all 21 map + tab-nav tests
> pass in main.
>
> **AC10 is an environment blocker, confirmed by the reviewer, not a dev excuse.**
> The dev reported being unable to screenshot and diagnosed it: the Browser pane
> is not compositing, so `ResizeObserver` never fires, so `@xyflow/react` never
> marks nodes measured and leaves them `visibility:hidden`. Reviewer reproduced
> both halves independently — `computer{screenshot}` returns *"the Browser pane is
> not displayed, so the page is not compositing frames"*, and Playwright cannot
> reach the host's `localhost` at all (`ERR_CONNECTION_REFUSED` against a server
> demonstrably serving on 5000). **No route to pixel proof exists in this
> session.**
>
> What the dev *did* prove live, which is stronger than a screenshot for
> correctness though not for appearance: the a11y tree shows the conditional
> badge on the conditional section and not its neighbour, one `role="img"`
> "Workflow complete" node, and the `final_documents` node; the React fiber shows
> `<ReactFlow>` receiving all **7** correct edges (6 sequential + 1 skip) with
> correct `source`/`target`; and `getComputedStyle` on four elements resolves to
> genuinely different, correct values with `.dark` toggled — e.g. section
> background `rgb(255,255,255)` → `rgb(35,39,47)`. A diagnostic edit made while
> ruling out styling was reverted and confirmed clean.
>
> Per this file's own policy — *"batch it where tickets compose: several UI
> tickets landing on the same screen are proven by one drive-through at the phase
> gate"* — appearance verification moves to the Phase 2 gate, which needs a human
> or a working browser surface. **This is the one thing in the initiative that
> cannot be closed by an agent in this environment.**


**Priority: P1** · Size: **L** · Files: `client/src/components/builder/map/` (new), `client/src/components/builder/layout/BuilderTabNav.tsx`, `client/src/pages/WorkflowBuilder.tsx`

> **Size L — escalated to the repo owner at generation time and accepted as one
> ticket.** Splitting it would put two devs in the same new component tree
> before it has a shape.

### Finding

There is no map. GH-153 AC1 asks for "an interactive visual graph/node map
showing sections, conditional branches, skip targets, final documents, and
endings", and the builder's tab shell has six tabs, none of them a map:

```ts
export type BuilderTab = "sections" | "templates" | "data-sources" | "settings" | "snapshots" | "review";
```

(`BuilderTabNav.tsx`, `TABS` const directly below it.)

Everything needed is already in place after Phase 1: `buildWorkflowMap` produces
the nodes and edges, `@xyflow/react` is installed, and `WorkflowBuilder.tsx`
already loads nothing extra — `useSections(workflowId)`, `useWorkflowSteps(workflowId)`
and `useLogicRules(workflowId)` are existing TanStack Query hooks, so the map
needs **no new API endpoint**.

### Preferred fix

Add `client/src/components/builder/map/` containing at minimum a `MapTab.tsx`
entry component and one component per node kind. Wire it as a seventh
`BuilderTab` (`"map"`, icon `Waypoints` or `Network` from `lucide-react`)
between `sections` and `templates`, and add the matching `BuilderTabPanel` block
in `WorkflowBuilder.tsx` — copy the existing `review` tab's four-line pattern
exactly, including the `activeTab === "map" &&` guard that keeps the panel from
mounting when hidden.

Data: call `useSections` / `useWorkflowSteps` / `useLogicRules`, feed
`buildWorkflowMap`, and memoize. **Do not mirror any of it into the zustand
store** — CLAUDE.md convention 8 is explicit that server state belongs to its
query hook, and `tests/unit/client/store.deadSetters.test.ts` guards it.

Layout: sections are ordered, so a simple top-to-bottom layered layout computed
from `node.order` is sufficient and deterministic. Do not add a layout library
(`dagre`, `elk`) — that is a new dependency for a linear chain. Skip edges route
as curved edges alongside the spine.

Per D-4 the map is read-only: pass `nodesDraggable={false}`,
`nodesConnectable={false}`, `edgesFocusable={false}` and do not persist
positions. Pan, zoom and fit-view stay on.

**Load the `design` skill before writing any markup.** This is a new primary
builder surface and must read as part of the product, not a debug view: node
kinds distinguished by more than colour alone, and full light/dark support —
the Review tab shipped without `dark:` variants and it was filed as a defect
(O-13). Do not repeat it.

### Ties

- **Load first:** `design` (mandatory — new UI surface), then `run-tests`.
- **Preceded by MAP-1** (the `@xyflow/react` dependency) and **MAP-2** (the
  graph model). Both must be ✅ and committed.
- **Blocks MAP-5, MAP-6, MAP-8** — all extend this component tree. Sequential.
- ⚠️ **`WorkflowBuilder.tsx` and `BuilderTabNav.tsx` currently have uncommitted
  changes in the repo owner's tree.** Confirm with the reviewer before editing
  them; do not stash or reset.
- Donor patterns: the `review` tab's registration in `BuilderTabNav.tsx` `TABS`
  and `WorkflowBuilder.tsx` `BuilderTabPanel`; `tests/unit/client/BuilderTabNav.a11y.test.tsx`
  for the tab a11y contract; `tests/unit/client/ReviewIssueList.test.tsx` for
  builder-component RTL style.
- File footprint: new `client/src/components/builder/map/**`, plus two existing
  files touched minimally.

### Acceptance criteria

1. A **Map** tab appears in the builder tab bar and is reachable via
   `?tab=map`; `isBuilderTab("map")` returns true.
2. The map renders one node per section, labelled with the section title, in
   `order`, with sequential edges between consecutive sections.
3. A `final_documents` step renders as a visually distinct node, and exactly one
   terminal "Complete" node is present.
4. A `skip_to` section rule renders as a visually distinct edge from the
   condition's section to the skip target.
5. A section whose visibility is conditional is visually marked, and the marking
   is conveyed by something other than colour alone (icon, border style, or
   text) — asserted in the test by role/label, not by class name.
6. Nodes cannot be dragged, connected, or deleted, and no node position is
   written to any store or API.
7. The map renders correctly in both light and dark themes — every colour token
   used has a `dark:` counterpart or comes from a theme-aware CSS variable.
8. The existing tab-navigation a11y contract still holds: arrow keys move
   between all seven tabs and `tests/unit/client/BuilderTabNav.a11y.test.tsx`
   passes unmodified except for the added tab.
9. New component test `tests/unit/client/MapTab.test.tsx` covers AC2–AC6 using
   `tests/fixtures/workflowMap.ts`.
10. **Live proof required:** dev server running, a seeded workflow with at least
    one skip rule and one `final_documents` step, screenshot of the rendered map
    in **both** light and dark. RTL output is not live proof.
11. `npm run type-check` → 0 errors; `npm run lint` → 0 problems;
    `npm run test:fast` green and above the Phase 1 gate baseline.

---

## MAP-5 — Open the inspector from a map node ✅

> **Verified 2026-08-08.** All eight ACs met — including **AC7 live**, which is
> the first pixel-level proof obtained in this initiative. Reviewer
> fast-forwarded the worktree to current main (no overlap) and re-ran all four
> gates: `type-check` 0, `lint` 0, `check:strict-zones` `✅ ALL PASSED`,
> `test:fast` **238 files / 2744 passed** (main was 2737, +7).
>
> AC5 verified by the reviewer directly: `grep -rn "useWorkflowBuilder"
> client/src/components/builder/map/` returns nothing, and the tests mock `wouter`
> and assert the exact resulting URL string rather than spying on a store action —
> a store spy would have passed even against the wrong architecture. AC3 verified:
> `TerminalMapNode` renders `role="img"` with no button or link.
>
> **AC7 live proof was obtained, and it overturns the reviewer's earlier
> conclusion.** At MAP-4's review the reviewer tried `preview_start` on port 5000
> and got `ERR_CONNECTION_REFUSED` from Playwright, and concluded no route to
> pixel proof existed in this environment. That was wrong — most likely the server
> was still re-optimising Vite dependencies after the `reactflow` →
> `@xyflow/react` swap when the connection was attempted. This dev started the
> worktree's own server on port 5280 and drove it with Playwright cleanly:
> clicked a section node and saw the URL become `?tab=sections&sectionId=<id>`
> with the Sections tab genuinely opening on that section; clicked the
> final-documents node and saw `stepId` rather than a section id; focused a node
> and pressed **Enter**, then a different node and pressed **Space**, both
> navigating live; captured light, dark and focus-ring screenshots. Fixtures were
> cleaned up and proven gone. **MAP-4's deferred AC10 is therefore obtainable the
> same way — carry it into the Phase 2 gate rather than writing it off.**
>
> One deviation, accepted: the dev set xyflow's own `focusable` to `false` (MAP-4
> had `kind !== "terminal"`). Correct — once the node's content is a real
> `<button>`, the library's flag adds a second, unlabelled Tab stop ahead of it
> and its `onKeyDown` only manages internal selection, never the activation
> callback. Documented in the code.


**Priority: P1** · Size: S · Files: `client/src/components/builder/map/`

### Finding

GH-153 AC2: "Clicking any node opens the corresponding section/step inspector."
Nothing connects the map to the inspector, but the entire mechanism already
exists and is used by the Review tab's deep links. `WorkflowBuilder.tsx` reads
navigation intent straight off the query string:

```ts
  const requestedTab = searchParams.get("tab");
  const requestedSectionId = searchParams.get("sectionId");
  const requestedStepId = searchParams.get("stepId");
```

and applies it through the builder store's selection actions in a `useEffect`:

```ts
    if (requestedStepId) {
      selectStep(requestedStepId);
    } else if (requestedBlockId) {
      selectBlock(requestedBlockId);
    } else if (requestedSectionId) {
      selectSection(requestedSectionId);
    }
```

So AC2 is a wiring job, not a feature build — provided the dev uses this path
rather than reaching into the store from the map.

### Preferred fix

On node activation, navigate to `?tab=sections&sectionId=<id>` (and
`&stepId=<id>` when a step-level node is activated), using `useLocation` from
`wouter` exactly as `ReviewTab.tsx` does for its issue deep links. Let the
existing `useEffect` in `WorkflowBuilder.tsx` do the selecting. **Do not call
`selectSection` / `selectStep` directly from the map** — that would create a
second, divergent navigation path and would not survive a page reload or a
shared URL.

The terminal `"__complete__"` node has nothing to open: it must not be
activatable, and must not render as though it were.

Activation means click **and** keyboard. `@xyflow/react` nodes are not
interactive by default; give each node a focusable, labelled control and handle
Enter/Space. `tests/unit/client/StepCard.a11y.test.tsx` is the house pattern for
this assertion, and an unnamed toggle was a real defect here before (O-5).

### Ties

- **Load first:** `design` (interactive affordance + focus states), then
  `run-tests`.
- **Preceded by MAP-4.** Same component tree — strictly sequential.
- **Blocks nothing**, but MAP-6 and MAP-8 touch the same files; keep the diff
  tight.
- Donor pattern: `ReviewTab.tsx` / `ReviewIssueList.tsx` deep-link navigation,
  which already produces exactly these URLs.
- File footprint: `client/src/components/builder/map/**` only.

### Acceptance criteria

1. Activating a section node navigates to `?tab=sections&sectionId=<id>` and the
   builder selects that section.
2. Activating a `final_documents` node navigates with the `stepId` of that step.
3. The terminal node is not activatable and exposes no button/link role.
4. Every activatable node is reachable by Tab, has an accessible name containing
   its section title, and activates on both Enter and Space.
5. The map does not import the builder store; `grep -rn "useWorkflowBuilder"
   client/src/components/builder/map/` returns nothing.
6. Test additions in `tests/unit/client/MapTab.test.tsx` (or a sibling) cover
   AC1–AC5, asserting the resulting URL rather than a store call.
7. **Live proof required:** click a section node in the running app and
   screenshot the inspector open on that section.
8. `npm run type-check` → 0 errors; `npm run lint` → 0 problems;
   `npm run test:fast` green.

---

## MAP-6 — Surface flow diagnostics on the map ✅

> **Verified 2026-08-08.** All nine ACs met. Reviewer re-ran all four gates:
> `type-check` 0, `lint` 0, `check:strict-zones` `✅ ALL PASSED`, `test:fast`
> **239 files / 2756 passed** (main was 2744, +12).
>
> Reviewer-checked directly rather than from the report: `grep -rn
> "analyzeWorkflowFlow" client/` is empty (AC6 — the map computes nothing);
> exactly **one** real fetch of `/api/workflows/:id/lint` exists, in
> `client/src/hooks/api/useWorkflowLint.ts`, with every other match being a doc
> comment (AC1); and `tests/unit/client/ReviewIssueList.test.tsx` is byte-unchanged
> (AC2). AC5's unmatched-finding case uses a real `ghost` finding whose
> `target.sectionId` matches no node — not an empty array that would pass
> trivially.
>
> The dev flagged an honest literal-vs-intent deviation: the ticket's example grep
> used `'lint'` in single quotes, their code uses double quotes per the convention
> in `useSections.ts`/`useLogicRules.ts`. The substantive requirement — one shared
> fetch, one cache entry — holds and was verified by content.
>
> **Live proof captured** (Playwright against a worktree-local server on 5295):
> the unreachable section's node carries a red badge and the summary bar reads
> "1 blocking error", the Review tab shows the identical message under Logic as a
> blocking error, and dark mode repaints correctly through the `.dark` tokens.
> Fixtures cleaned up and proven zero. One caveat reported and accepted: Radix's
> `hasPointerMoveOpenedRef` latch stopped the tooltip reopening after a prior
> click in the same session, so the screenshots show the badge closed — hover and
> keyboard reachability are covered by two passing unit tests asserting
> `role="tooltip"`.


**Priority: P1** · Size: S · Files: `client/src/components/builder/map/`, `shared/types/workflowLint.ts`


> **⚠️ The map's own graph and the lint's graph deliberately disagree on
> reachability — do not "fix" it.** `buildWorkflowMap` (MAP-2, client) draws
> sequential edges between all consecutive sections regardless of `hide` rules,
> because those edges are structural. `lintWorkflowFlow` (MAP-3, server) drops
> always-hidden sections before analysing. So calling `analyzeWorkflowFlow`
> client-side on `buildWorkflowMap`'s output returns **`unreachable: []` even for
> a genuinely unreachable section** — verified by the reviewer. That is why AC6
> forbids the map computing anything: render the findings the lint endpoint
> returns, keyed by `target.sectionId`, which the reviewer confirmed matches
> MAP-2's node ids.

### Finding

MAP-3 produces the diagnostics (`analyzeWorkflowFlow`, surfaced as
`category: "logic"` findings through `lintWorkflowContent` and the existing
`GET /api/workflows/:id/lint` endpoint the Review tab already calls). Nothing
renders them on the map, so AC4's second half — "the *map* flags unreachable
sections, dead ends, and infinite loop risks" — is unmet.

The Review tab's fetch is the donor:

```tsx
    const { data: lintIssues = [], refetch: refetchLint, isLoading: isLinting } = useQuery({
        queryKey: ['workflow', workflowId, 'lint'],
```

Note this is a raw `useQuery` with an inline `apiRequest`, not a shared hook —
so today the map would duplicate it.

### Preferred fix

Extract the Review tab's inline lint query into a shared hook (e.g.
`useWorkflowLint(workflowId)` under `client/src/hooks/api/`), give it the same
query key `['workflow', workflowId, 'lint']` so both surfaces share one cache
entry, and consume it from both `ReviewTab.tsx` and the map. Extracting rather
than copying is the point of this ticket — two independent fetches of the same
endpoint would drift, which is the failure mode D-3 exists to prevent.

On the map: decorate the affected node from the finding's `target.sectionId` —
error and warning distinguished by icon and text, not colour alone, with the
message available on hover/focus. A finding whose target resolves to no node
must be counted somewhere visible (a summary affordance) rather than silently
dropped.

**Do not compute anything.** If the map needs a diagnostic the lint pipeline
does not emit, that is a MAP-3 change, not a local calculation.

### Ties

- **Load first:** `design`, then `run-tests`.
- **Preceded by MAP-3** (produces the findings) and **MAP-4/MAP-5** (same
  component tree). Strictly sequential.
- **Shares `shared/types/workflowLint.ts` with MAP-3** — MAP-3 adds `"map"` to
  `WorkflowLintBuilderTab`; if it is missing when you start, MAP-3 is not done.
- Donor pattern: `ReviewTab.tsx`'s lint `useQuery`; `ReviewIssueList.tsx` for
  finding presentation.
- File footprint: `client/src/components/builder/map/**`,
  new `client/src/hooks/api/useWorkflowLint.ts`, `ReviewTab.tsx` (call-site swap
  only), `shared/types/workflowLint.ts`.

### Acceptance criteria

1. A shared `useWorkflowLint(workflowId)` hook exists and is the **only** place
   `/api/workflows/:id/lint` is fetched — `grep -rn "'lint'" client/src` shows
   one query definition.
2. `ReviewTab.tsx` uses the hook and its existing behaviour is unchanged;
   `tests/unit/client/ReviewIssueList.test.tsx` passes unmodified.
3. An unreachable section's node is visibly flagged as an error, with the lint
   message reachable by hover **and** keyboard focus.
4. A backward-skip warning renders as a warning, visually distinct from an
   error by more than colour.
5. A finding whose `target.sectionId` matches no node is surfaced in a summary
   count rather than dropped — asserted with a fixture that produces one.
6. The map computes no diagnostics of its own; `grep -rn "analyzeWorkflowFlow"
   client/` returns nothing.
7. Test additions cover AC3–AC6.
8. **Live proof required:** a seeded workflow with one unreachable section,
   screenshot showing the flag on the map **and** the matching finding in the
   Review tab, from the same running app.
9. `npm run type-check` → 0 errors; `npm run lint` → 0 problems;
   `npm run test:fast` green.

---

## Phase 2 Gate

- [ ] MAP-4, MAP-5, MAP-6 all ✅ with dated verification notes
- [ ] `npm run type-check` → 0 errors
- [ ] `npm run lint` → 0 problems
- [ ] `npm run test:fast` green, above the Phase 1 gate baseline
- [ ] **One reviewer drive-through of the live map** covering all three tickets:
      render, node → inspector, diagnostics — light and dark. Batched
      deliberately; do not re-verify per ticket. (LU-B2 records what happens
      when a phase gate skips this.)
- [ ] Reviewer has committed each passed ticket + this gate

---

# Phase 3 — Deterministic path simulation

GH-153 AC3: "author inputs hypothetical answers and map highlights active route
in real time". The engine and the UI are split because the engine must be
provably identical to the server's navigation, and that proof is a unit-test
job, not a component-test job.

## MAP-7 — Add a shared deterministic path simulator ✅

> **Verified 2026-08-08.** All ten ACs met. Reviewer re-ran all four gates:
> `type-check` 0 errors, `lint` 0 problems, `check:strict-zones` `✅ ALL PASSED`,
> `test:fast` **233 files / 2703 passed** (baseline off `6dbbeb17` was 2690, +13).
>
> `simulateWorkflowPath` calls `evaluateWorkflowVisibility`,
> `calculateNextSection` and `resolveNextSection` in exactly the order
> `LogicService.evaluateNavigation()` calls them, and adds no comparison or
> ordering logic of its own — the one sort in the file is bookkeeping for
> `notVisited`'s presentation order, documented as such. AC7's parity test is an
> independent transcription of the server's call sequence driving the real shared
> functions, not a call back into the simulator; the ticket's DB escape hatch was
> used and disclosed. AC8's cap is proven with a genuine oscillation (a duplicate
> section id makes `calculateNextSection`'s `findIndex` always resolve to the
> first occurrence, so the walk cycles `a → b → a → b` forever without it).
>
> **Defect found at review and fixed at its source.** Traversed skip edges were
> labelled via `rules.find(...)` — first match in *array* order — while
> `evaluateRules` picks the winner by `rule.order`, among rules that actually
> fired. Reviewer probe with two rules targeting one section from different
> origins:
>
> ```
> traversedEdges: [ 'skip:rule-from-A', 'sequential:D->__complete__' ]
> The skip was triggered by rule-from-B (order 0, condition met).
> ```
>
> Not cosmetic: `buildWorkflowMap` sets a skip edge's `from` to the condition
> step's section, so that id is the **A→D** arrow while the run skipped **B→D** —
> MAP-8 highlights by edge id and would have lit an arrow leaving a section the
> respondent never skipped from. Fixed additively in `shared/workflowLogic.ts`:
> `WorkflowEvaluationResult` gained `skipToRuleId`, set in the same
> first-firing-wins branch that sets `skipToSectionId`, and the simulator reads it
> instead of searching. Reconstructing the winner simulator-side would have been a
> second implementation of a decision the engine already makes. Re-probed after
> the fix — correct. The now-orphaned `conditionStepId` on `SimulationRuleInput`
> was removed rather than left.
>
> Reviewer cross-check: widening `EvaluableLogicRule` to require `id` is safe on
> the production run path — `RunDefinitionProvider` projects
> `id: rule.id ?? \`runtime-rule-${index}\``, so a pinned rule always carries one.


**Priority: P1** · Size: M · Files: `shared/workflowSimulation.ts` (new)

### Finding

The pieces of a simulator exist and are already shared, but only the **server**
composes them. `LogicService.evaluateNavigation()`
(`server/services/LogicService.ts`) is the whole algorithm:

```ts
    const visibility = evaluateWorkflowVisibility({ sections, steps, rules: logicRules, data, resolveAlias: ... });
    const nextSectionId = calculateNextSection(currentSectionId, sections.map((s) => ({ id: s.id, order: s.order })), visibleSections);
    const resolvedNextSectionId = resolveNextSection(currentSectionId, nextSectionId, visibility.ruleEvaluation.skipToSectionId, sections.map((s) => ({ id: s.id, order: s.order })), visibleSections);
```

The client has **half** of it. `useSectionVisibility()`
(`client/src/hooks/runner/useSectionVisibility.ts`) already calls
`evaluateWorkflowVisibility` client-side — so visibility is shared — but nothing
client-side calls `calculateNextSection` or `resolveNextSection`:
`grep -rn "resolveNextSection" client/` returns nothing. The runner asks the
server via `POST /api/runs/:id/next` instead.

Consequence: a simulator written inside the map component would be the first
client-side implementation of *route* resolution, with no test tying it to the
server's. That is precisely the divergence GH-154's predecessor spent eight
tickets undoing, and it would be invisible until an author's simulated path
disagreed with a real run.

### Preferred fix

Add `shared/workflowSimulation.ts` exporting one function that walks a workflow
from the start to completion under a hypothetical answer set:

```ts
export interface SimulatedPath {
  /** Section ids in visit order, start to finish. */
  visited: string[];
  /** Ids of sections that exist but are not on this path. */
  notVisited: string[];
  /** Edges traversed, as `${from}->${to}`, so the map can highlight them. */
  traversedEdges: string[];
  /** True when the walk hit the iteration cap instead of completing. */
  truncated: boolean;
}
export function simulateWorkflowPath(input: {
  sections: ...; steps: ...; rules: ...;
  data: Record<string, unknown>;
  resolveAlias: (name: string) => string | undefined;
}): SimulatedPath;
```

Implement it as a loop that calls **exactly the same three functions in exactly
the same order** as `evaluateNavigation` above, starting from
`currentSectionId = null`. Do not inline, reimplement, or "simplify" any of
them.

Bound the loop with a hard iteration cap of `sections.length + 1` and set
`truncated: true` on hitting it. `isForwardSkipTarget`'s backward-skip guard
means a genuine infinite loop should be impossible, but a simulator that can
hang the author's browser on malformed data is worse than one that reports
truncation.

**Parity is the deliverable.** Add a test that runs `simulateWorkflowPath` and
`LogicService.evaluateNavigation` over the same fixtures and asserts the same
next-section decision at every step. If that test cannot be written without a
database, drive `evaluateNavigation`'s three underlying shared functions
directly and say so in the turn-in — but do not skip the parity assertion.

### Ties

- **Load first:** `run-tests` skill (this may need `test:unit`, not just
  `test:fast`, if the parity test touches `LogicService`).
- **Preceded by MAP-2** (consumes `tests/fixtures/workflowMap.ts`).
- **Blocks MAP-8.**
- **Parallel-safe with all of Phase 2** — disjoint files. May be dispatched
  during Phase 2 if a dev is free.
- Donor pattern: `LogicService.evaluateNavigation()` — mirror its call sequence
  literally. `useSectionVisibility.ts` for how the client supplies
  `resolveAlias`.
- File footprint: one new `shared/` file plus tests. Touches nothing existing.

### Acceptance criteria

1. `shared/workflowSimulation.ts` exports `simulateWorkflowPath` and
   `SimulatedPath`, and calls `evaluateWorkflowVisibility`,
   `calculateNextSection` and `resolveNextSection` from `shared/workflowLogic.ts`
   — asserted by `grep`, and by the absence of any new comparison or ordering
   logic in the file.
2. A linear workflow with no rules yields `visited` equal to all section ids in
   `order`, and `notVisited: []`.
3. A forward `skip_to` whose condition is met by `data` yields a `visited` array
   that omits the skipped sections, and lists them in `notVisited`.
4. A backward `skip_to` whose condition is met yields the **same** path as no
   rule at all — matching `isForwardSkipTarget`'s no-op guard.
5. A section hidden by `visibleIf` is absent from `visited`.
6. `traversedEdges` contains one entry per transition, matching the edge ids
   MAP-2's `buildWorkflowMap` produces for the same input.
7. A parity test asserts `simulateWorkflowPath` and the server's navigation
   agree on next-section at every step, over at least the linear, forward-skip
   and hidden-section fixtures.
8. The iteration cap sets `truncated: true` rather than looping, proven by a
   deliberately malformed fixture.
9. New test file `tests/unit/workflowSimulation.test.ts` covers AC2–AC8.
10. `npm run type-check` → 0 errors; `npm run lint` → 0 problems;
    `npm run test:fast` green (plus `test:unit` if the parity test needs it).

---

## MAP-8 — Add the simulation panel and highlight the live route 🔲

**Priority: P1** · Size: **L** · Files: `client/src/components/builder/map/`

> **Size L — escalated at generation time and accepted as one ticket.** The
> answer-input surface and the highlight are the same interaction; splitting
> them ships a panel that does nothing.

### Finding

GH-153 AC3 asks the author to input hypothetical answers and see the active
route highlighted in real time. After MAP-7 the engine exists; nothing drives
it. Two constraints shape the UI and both are easy to get wrong:

- **`logic_rules` holds 0 rows across 84 workflows** and only became authorable
  last week (LU-6b). An author opening the map on a real workflow today sees a
  straight line. The simulation panel must be useful and honest in that state,
  not look broken.
- The answer inputs must produce values keyed the way the evaluator reads them.
  `evaluateWorkflowVisibility` takes `data: Record<string, unknown>` keyed by
  **step id**, with alias resolution handled separately by `resolveAlias` —
  `useSectionVisibility.ts` builds that resolver as
  `allSteps.find((s) => s.alias === variableName)?.id`. A panel that keys by
  alias will silently evaluate every condition as unresolvable, which
  `conditionEvaluator` fails safe on — so it will look like "no rule fired"
  rather than like a bug.

### Preferred fix

Add a simulation panel to the map surface listing the steps that any condition
actually references — not every step in the workflow, which would be unusable.
Derive that set from the same reference extraction the lint pipeline uses
(`extractConditionReferences` in `shared/conditionGraph.ts`) plus the rules'
`when` expressions, so the panel offers exactly the inputs that can change the
route.

Render an input per referenced step, typed by the step's type — reuse the
existing condition-value input rather than inventing one:
`client/src/components/logic/ConditionValueInput.tsx` already does type-aware
value entry for this exact purpose (it was GH-154 AC3).

On every change, call `simulateWorkflowPath` and highlight `visited` nodes and
`traversedEdges`, dimming the rest. Debounce is optional; the simulation is pure
and O(V+E), so recompute in a `useMemo` keyed on the answer object.

Empty state: when no condition references any step, say so plainly and state
that the path is unconditional — do not render an empty panel.

`truncated: true` must surface as a visible warning on the map, not be swallowed.

**Load the `design` skill.** This is the map's primary interaction; the panel,
the highlight treatment and the dimmed state all need to work in light and dark.

### Ties

- **Load first:** `design` (mandatory), then `run-tests`.
- **Preceded by MAP-7** (the simulator) and **MAP-4/5/6** (the component tree).
  Strictly sequential — this is the last ticket to touch
  `client/src/components/builder/map/`.
- Donor patterns: `ConditionValueInput.tsx` for typed value entry;
  `useSectionVisibility.ts` for building `resolveAlias` and the step-id-keyed
  data object.
- File footprint: `client/src/components/builder/map/**` only.

### Acceptance criteria

1. The panel lists only steps referenced by some `visibleIf` or rule `when`
   expression, derived via `extractConditionReferences` — not all steps.
2. Answer values are keyed by **step id** in the object handed to
   `simulateWorkflowPath`, with alias resolution via a `resolveAlias` built the
   same way `useSectionVisibility.ts` builds it. Asserted directly on the object
   passed to the simulator.
3. Changing an answer that satisfies a `skip_to` condition re-highlights the
   route within the same render pass — visited nodes and traversed edges
   emphasised, others dimmed.
4. Highlight and dim states are distinguishable by more than colour and work in
   both light and dark themes.
5. A workflow with no condition references shows an explicit empty state stating
   the path is unconditional — not a blank panel.
6. `truncated: true` renders a visible warning.
7. Value inputs reuse `ConditionValueInput`; the map defines no new type-specific
   input component.
8. Component tests cover AC1–AC3, AC5 and AC6 using `tests/fixtures/workflowMap.ts`.
9. **Live proof required:** dev server, a seeded workflow with a forward
   `skip_to`; screenshots of the map before and after entering the answer that
   triggers the skip, showing the highlighted route change. Light and dark.
10. `npm run type-check` → 0 errors; `npm run lint` → 0 problems;
    `npm run test:fast` green.

---

## Phase 3 Gate

- [ ] MAP-7, MAP-8 ✅ with dated verification notes
- [ ] `npm run type-check` → 0 errors; `npm run lint` → 0 problems
- [ ] `npm run test:fast` green; `npm run test:unit` green
- [ ] Reviewer drive-through: simulate a forward skip and a hidden section on
      the live map and confirm the highlighted route matches an actual preview
      run of the same workflow with the same answers
- [ ] Reviewer has committed each passed ticket + this gate

---

# Phase 4 — Retire the surface this replaces

## MAP-9 — Retire the AI logic-debug tab and its endpoint ✅

> **Verified 2026-08-08. Worked by the reviewer directly** — dev dispatch was
> unavailable (the org hit its monthly API spend limit mid-initiative, killing
> MAP-8's agent before it wrote any code). Deletion is well-specified and
> mechanical, so it was done in the main checkout rather than left blocked.
>
> The whole vertical is gone: `LogicDebugTab.tsx` (deleted), its tab in
> `LogicInspectorPanel.tsx` (with `grid-cols-4` → `grid-cols-3`), `useDebugLogic`,
> the route, `AiController.debugLogic`, `AIService.debugLogic`,
> `WorkflowLogicService.debugLogic`, `AIPromptBuilder.buildLogicDebugPrompt`, and
> the Zod schemas. `LogicIssueSchema`/`LogicFixSchema` were orphaned by the
> removal and went with it; `LogicGraphSchema` stayed, because
> `AIVisualizeLogicResponseSchema` still uses it. `currentWorkflow` stays on the
> panel's props — `LogicGeneratorTab` still needs it.
>
> `grep -rn "debugLogic\|DebugLogic\|debug-logic" client server shared tests`
> returns exactly **one** match: a doc comment in `shared/types/ai.ts` recording
> why the types went and pointing at the deterministic replacement. That is
> deliberate.
>
> Gates: `type-check` 0, `lint` 0, `check:strict-zones` `✅ ALL PASSED`,
> `test:fast` **240 files / 2758 passed**. That count reconciles as 2756 (clean
> worktree) + 4 (the repo owner's uncommitted `SidebarTree` tests, present in the
> main checkout) − 2 (the deleted `debug-logic` cases).
>
> **Live proof, with a control:**
> ```
> POST /api/ai/workflows/debug-logic     -> 404
> POST /api/ai/workflows/visualize-logic -> 401
> ```
> The contrast is the evidence: a sibling route on the same router still
> authenticates, so the router is mounted and only this endpoint was removed —
> a bare 404 alone would also be consistent with having broken the whole router.


**Priority: P2** · Size: M · Files: `client/src/components/builder/logic/LogicDebugTab.tsx`, `client/src/components/builder/LogicInspectorPanel.tsx`, `client/src/hooks/api/useAi.ts`, `server/routes/ai.routes.ts`, `server/controllers/AiController.ts`, `server/services/ai/`, `server/services/AIService.ts`, `shared/types/ai.ts`

### Finding

Per D-3, the AI-powered logic debugger is superseded by MAP-3's deterministic
analysis. `LogicDebugTab.tsx` renders a "Run Analysis" button whose empty state
promises exactly AC4:

```tsx
                        Run debugging to check for unreachable pages, loops, and errors.
```

It calls `useDebugLogic()` → `POST /api/ai/workflows/debug-logic`, which asks a
model for a JSON list of issues (`buildLogicDebugPrompt` in
`server/services/ai/AIPromptBuilder.ts` ends with the instruction to output
`AIDebugLogicResponse`). Keeping it means two answers to the same question, one
of them non-deterministic and disconnected from the publish gate.

The footprint, verified by
`grep -rn "debugLogic\|DebugLogic\|debug-logic" client server shared tests`:

| Layer | Symbol |
|---|---|
| Client component | `LogicDebugTab.tsx` (whole file), its `TabsTrigger`/`TabsContent` in `LogicInspectorPanel.tsx` |
| Client hook | `useDebugLogic` in `client/src/hooks/api/useAi.ts` |
| Route | `POST /api/ai/workflows/debug-logic` in `server/routes/ai.routes.ts` |
| Controller | `AiController.debugLogic` |
| Service | `AIService.debugLogic` → `WorkflowLogicService.debugLogic`; `AIPromptBuilder.buildLogicDebugPrompt` |
| Types | `AIDebugLogicRequestSchema` / `AIDebugLogicResponseSchema` and their inferred types in `shared/types/ai.ts` |
| Tests | `tests/unit/api.ai.logic.test.ts`, `tests/unit/services/AIService.test.ts` |

Note `LogicInspectorPanel.tsx` hard-codes a four-column tab grid
(`className="m-4 grid grid-cols-4"`) — removing a tab without fixing that leaves
a gap.

### Preferred fix

Delete the whole vertical, top down: component → panel tab → hook → route →
controller → service method → prompt builder → Zod schemas and types. Delete the
tests that covered it rather than leaving them asserting a removed endpoint.
**Delete, do not comment out**, and remove anything the deletion orphans — the
other three Logic Inspector tabs (Generate, Rules, Variables) stay.

Fix `grid-cols-4` → `grid-cols-3` in `LogicInspectorPanel.tsx`.

Leave the rest of the AI surface alone: `AIService` has many other methods and
`ai.routes.ts` has many other routes. If removing `debugLogic` orphans a shared
helper in `WorkflowLogicService` or `AIPromptBuilder`, remove that too — but
verify it is genuinely unreferenced first, don't assume.

### Ties

- **Load first:** `run-tests`, then `add-api-endpoint` (a route and controller
  are being removed; the same conventions govern removal).
- **Preceded by MAP-3 and MAP-6** — do not delete the AI answer before the
  deterministic one is shipped and rendered. This is why it is Phase 4.
- **Parallel-safe with nothing in Phase 3** in principle, but sequence it last
  regardless: it is the only ticket that removes a user-visible capability.
- File footprint: 8 source files + 2 test files, listed in the Finding table.
- Related: **MAP-B3**.

### Acceptance criteria

1. `grep -rn "debugLogic\|DebugLogic\|debug-logic" client server shared tests`
   returns **zero** matches.
2. `LogicDebugTab.tsx` no longer exists.
3. The Logic Inspector panel shows three tabs (Generate, Rules, Variables), its
   grid class matches that count, and all three still work.
4. No commented-out code and no orphaned imports, props or Zod schemas remain in
   any touched file.
5. `tests/unit/api.ai.logic.test.ts` and `tests/unit/services/AIService.test.ts`
   still pass, with only the `debug-logic` cases removed — the other AI
   assertions in both files are unchanged.
6. **Live proof required:** open the Logic Inspector in the running app,
   screenshot the three remaining tabs, and confirm `POST
   /api/ai/workflows/debug-logic` returns 404.
7. `npm run type-check` → 0 errors; `npm run lint` → 0 problems.
8. `npm run test:fast` green; the count drops only by the deleted `debug-logic`
   cases, and the turn-in states the exact delta.

---

## Phase 4 Gate

- [ ] MAP-9 ✅ with a dated verification note
- [ ] Full gates: `type-check` 0, `lint` 0, `test:fast` green, `test:unit` green
- [ ] GH-153's five acceptance criteria each mapped to a ✅ ticket in the status
      table below, and `tickets/ROADMAP_TICKETS.md` GH-153 marked ✅
- [ ] Reviewer has committed the ticket + this gate

---

# GH-153 acceptance-criteria coverage

| GH-153 AC | Covered by |
|---|---|
| 1 — interactive graph of sections, branches, skip targets, final documents, endings | MAP-2 (model) + MAP-4 (render) |
| 2 — clicking a node opens the inspector | MAP-5 |
| 3 — deterministic path simulation with real-time highlight | MAP-7 (engine) + MAP-8 (UI) |
| 4 — flags unreachable sections, dead ends, loop risks | MAP-3 (analysis) + MAP-6 (render) + MAP-9 (retires the competing surface) |
| 5 — component tests prove rendering and simulation accuracy | Every ticket's test criteria; MAP-7 AC7 is the accuracy proof |

---

# Status

| Ticket | Title | Priority | Size | Status |
|---|---|---|---|---|
| MAP-1 | Migrate to `@xyflow/react`, delete dead collab canvas sync | P2 | M | ✅ |
| MAP-2 | Pure workflow-graph model in `shared/` | P1 | M | ✅ |
| MAP-3 | Reachability / dead-end / loop analysis in the lint pipeline | P1 | M | ✅ |
| MAP-4 | Map tab + graph rendering | P1 | L | ✅ |
| MAP-5 | Node → inspector navigation | P1 | S | ✅ |
| MAP-6 | Flow diagnostics on the map | P1 | S | ✅ |
| MAP-7 | Shared deterministic path simulator | P1 | M | ✅ |
| MAP-8 | Simulation panel + route highlight | P1 | L | 🚧 blocked — API spend limit |
| MAP-9 | Retire the AI logic-debug tab and endpoint | P2 | M | ✅ |
| MAP-10 | `refresh-token` drops `tenantId`, killing collaboration | **P0** | S | ✅ |

---

# Backlog / observations

Not tickets. Parked here while this initiative is open; they move to
`tickets/BACKLOG.md` when it is retired (ticket-flow Stage 7).

- **MAP-B1 — `sections.skip_if` is stored, cloned, versioned and exported, but
  never evaluated and never authored.** The column exists in
  `shared/schema/workflow.ts`; `WorkflowClonerService`, `VersionService`,
  `portability/entityGraph.ts` and `RunDefinitionProvider` all carry it;
  `LogicContextSection` declares it. But `evaluateWorkflowVisibility()` reads
  only `visibleIf`, and the only authoring surface (`SectionLogicSheet.tsx`)
  writes only `visibleIf`. Every row is therefore null and always will be. Three
  options — implement it, drop the column, or document it as reserved. Note
  LU-B1: dropping it is a migration, and local migrations hit production.
  Deliberately kept out of MAP-2, which is instructed to emit nothing for it.

- **MAP-B2 — `server/realtime/awareness.ts` still exports `updateSelectedNode`.**
  MAP-1 deletes the client half of the graph-builder collaboration channel; this
  is its server counterpart. Left in place deliberately so MAP-1 stays a client
  ticket with a client gate. Check for other callers before removing — the
  awareness module also serves presence and cursors, which are live.

- **MAP-B7 — the test Postgres container is tmpfs-backed, so every worktree
  database vanishes when it restarts.** `docker-compose` publishes it on 5434
  with tmpfs storage (see `npm run test:docker:up`). When it stopped and
  restarted mid-initiative, all six per-worktree databases created by
  `scripts/new-worktree.ps1` were silently gone — only `ezbuildr_test` survived,
  because something recreates that one. A worktree created *before* the restart
  therefore keeps a `TEST_DATABASE_URL` pointing at a database that no longer
  exists, and its `unit-db`/`integration` suites fail with a connection error
  that reads like a code problem. The creation-time proof cannot catch this
  either — same shape as the `node_modules/.vite` lesson in `CLAUDE.md`. Either
  give the container a volume, or have the worktree script re-create its database
  on demand rather than only at creation.

- **MAP-B5 — collaboration only admits the workflow's creator, so presence can
  never show two people.** `server/realtime/auth.ts` gates the websocket join on
  `const isCreator = workflow.creatorId === payload.userId;` and rejects everyone
  else with `'Access denied: User is not the creator'` — a user granted edit
  rights through `workflow_access` is still refused. Found by MAP-10's dev while
  trying to produce two-user live proof: they could only demonstrate presence for
  one account, and correctly reported that rather than claiming two. So real-time
  collaboration is doubly broken — MAP-10 fixes the client gate that turned it off
  entirely, and this is why it still will not show a *second* person afterwards.
  Not filed as a ticket because it is an authorization-model decision (should ACL
  edit-access imply collab access? what about org/workspace roles?), not a
  fix with an obvious shape. Note the file already carries a `DEBT-3b` comment
  nearby about a different role-check bug, so this area has form.

- **MAP-B6 — `scripts/new-worktree.ps1`'s verification gate produces false
  negatives under load.** Creating the `map-4` worktree failed with *"test:fast
  did not report any passing tests. The tree is broken — do not dispatch anyone
  into it."* while four other test runs were competing for the machine. Re-running
  `test:fast` in that same worktree immediately reported **233 files / 2703
  passed** — the tree was fine. The `map-3` worktree hit the same guard earlier
  for a different reason (one flaky socket-timing test). The guard is valuable and
  should stay, but its failure message asserts a conclusion it has not earned;
  it should distinguish "suite did not run" from "suite ran and something failed",
  and say to re-run before believing it.

- **MAP-B4 — reordering sections silently kills a working `skip_to` rule, and
  nothing checks.** `SectionService.reorderSections` writes orders in a
  transaction and validates nothing:

  ```ts
  await db.transaction(async (tx) => {
    for (const { id, order } of sectionOrders) {
      await this.sectionRepo.updateOrder(id, workflowId, order, tx);
    }
  });
  ```

  So dragging a section above another can turn a valid forward `skip_to` into a
  backward one, which `isForwardSkipTarget` then discards at run time — the rule
  stops firing and the author is told nothing until the next publish. Live runs
  are unaffected in the meantime (they pin `workflowVersionId`), so publish is a
  genuine chokepoint and D-5 keeps it blocking. But discovering a dead rule at
  publish is much worse than at drag time. Re-running the direction check on
  reorder and surfacing it in the builder is the real fix. Filed as an
  observation rather than a ticket because it is a builder-UX change, not map
  work, and D-5 already prevents the bad state from shipping.

- **MAP-B3 — `WorkflowLintBuilderTab` omits two real tabs.** The union is
  `"sections" | "templates" | "data-sources" | "settings"`, while `BuilderTab`
  has six (adding `"review"` and `"snapshots"`) and MAP-3 adds `"map"` for a
  seventh. No lint rule targets `review` or `snapshots` today, so nothing is
  broken — but the two types describing the same tab set have silently diverged,
  and the next person to add a lint target for either will find they cannot.
