# Blocks: the last workflow-owned table with no RLS policy (BLK)

**Status:** BLK-1 open · **Filed:** 2026-09-19 · Promoted from `RLS-B6` in `tickets/BACKLOG.md`

One ticket. It closes the last structural gap left by the ENV/RLS initiative
(retired 2026-09-19, see [`backlog/ENVIRONMENTS_AND_RLS.md`](backlog/ENVIRONMENTS_AND_RLS.md)).

## How to work this document

- Read this header and the ticket. Line numbers are advisory — **the quoted code plus
  the symbol name is the locator**; grep for the quote.
- Load the project skills named in **Ties** before touching code.
- **Do not commit or stage.** The reviewer commits.
- Gates: `npx tsc --noEmit`, scoped `npx eslint <your files> --max-warnings 0
  --report-unused-disable-directives`, `npm run test:fast`, and the integration
  project **in both modes** — plain and `RLS_RESTRICTED=true`. A green normal-mode run
  proves nothing here: this ticket is entirely about behaviour under enforcement.
- `npm run test:docker:up` first, and re-run it after any pull — it starts Postgres
  (5434) **and** gotenberg (3009).
- Baseline before you start: `npm run test:fast` must report **4025 passed / 354 files**.
  Anything else means your tree is not what this ticket was written against — **stop**.

---

## BLK-1 — Give `blocks` a tenant-isolation policy, and scope the paths that read it

**Priority: P2** (no live exposure today — see Finding) · **Size: M** ·
**Files:** a new `migrations/00NN_rls_blocks.sql`, `server/services/BlockService.ts`,
`server/services/BlockRunner.ts`, a new `tests/integration/rls-blocks.test.ts`,
`tests/integration/rls10-policyIsolation.test.ts` (one seeder). No client files.

### Finding

**`blocks` carries no RLS policy anywhere in the migration chain, and row security is
off on the table.** Measured read-only against the production Neon branch, 2026-09-19:

| `relname` | `relrowsecurity` | `relforcerowsecurity` | policies | rows |
|---|---|---|---|---|
| `blocks` | `false` | `false` | **0** | **0** |

Every other workflow-owned table is covered: `steps`, `pages` and `sections` all get an
ownership-derived policy (migrations `0031`, `0038`/`0039`), and the 38 policy tables
are enabled and forced in all three environments. `blocks` is the one exception.

So a block row's tenant isolation rests **entirely** on the service layer's
`verifyAccess`, with nothing underneath it. That is precisely the posture the ENV/RLS
initiative existed to remove, and `blocks.config` is not empty of interest: it holds
DataVault table ids, query ids and external-send configuration.

`blocks` has the same shape the `steps` policy was written for — `workflow_id uuid NOT
NULL` referencing `workflows` (`shared/schema/workflow.ts`, `export const blocks`) — so
the tenant is derived through the parent workflow, not stored on the row.

**Why this is P2 and not P0:** production holds **zero** block rows (measured above; the
same was true on 2026-09-10 when `RUN-P1` was investigated), and every block route goes
through `BlockService.verifyAccess` today. There is no known live exposure. This is
closing a structural hole before the table starts carrying data, which is the cheap
moment to do it.

### ⚠️ The trap: adding the policy alone will silently stop blocks executing

`BlockService.getBlocksForPhase` — the method the runner uses to load what to execute —
takes **no `tx`** and runs on the bare pool:

```ts
    if (pageId) {
      // Get page-specific blocks and workflow-scoped blocks for this phase
      const [pageBlocks, workflowBlocks] = await Promise.all([
        this.blockRepo.findByPagePhase(pageId, phase),
        this.blockRepo.findByWorkflowPhase(workflowId, phase).then((blocks: Block[]) =>
```

Its caller is `BlockRunner.runPhase`:

```ts
    const blocks = await this.blockSvc.getBlocksForPhase(
      context.workflowId,
      context.phase,
      context.pageId
    );
```

Under enforcement, a read on a covered table outside a tenant transaction returns
**zero rows, not an error**. So the moment the policy lands, that call returns `[]`,
`blocks.length === 0` is treated as "nothing to run", and `runPhase` returns
`{ success: true }`. **Every block in the product would stop executing, and every caller
would report success.** That is the exact failure shape this initiative documented
about twenty times (see `TENANT_ISOLATION_RLS.md` §3).

`BlockService`'s CRUD methods are already scoped (CLN-7) and its header says so — it is
`getBlocksForPhase` and the runner path that are not. Note the header's other warning
while you are in there: `verifyAccess` must stay **outside** the transaction, because a
transaction opened inside another deadlocks the size-1 test pool.

### Preferred fix

1. **A new migration, copying `0031`'s `steps` policy verbatim in shape**, substituting
   `blocks.workflow_id` for `steps.workflow_id`:

   ```sql
   CREATE POLICY tenant_isolation ON blocks
     USING (
       CASE WHEN app_current_tenant() IS NULL THEN false
            ELSE EXISTS (
              SELECT 1 FROM workflows w
              WHERE w.id = blocks.workflow_id
                AND app_owner_tenant(w.owner_type, w.owner_uuid, w.owner_id, w.creator_id, w.project_id)
                      = app_current_tenant()
            )
       END
       OR EXISTS (
         SELECT 1 FROM workflows w
         WHERE w.id = blocks.workflow_id
           AND w.is_public = true AND w.status = 'active'
       )
     )
     WITH CHECK ( /* the tenant branch only — never the is_public disjunct */ );
   ```

   The `is_public` disjunct belongs in `USING` **only**, exactly as `0031` has it: an
   anonymous public-link run must be able to read the blocks it executes, but nothing
   anonymous may ever write one. Include `ENABLE` **and** `FORCE` — a policy without
   `ENABLE` is inert, which is the 2026-08-25 defect that cost this initiative a week
   (`rls-coverage.test.ts` will fail if you forget, by design).

2. **Scope the read paths.** `getBlocksForPhase` takes an optional `tx` like its
   siblings, and `BlockRunner.runPhase` calls it inside the tenant transaction it
   already has, or opens one with `withCurrentTenant`. Follow the pattern in
   `BlockService`'s already-converted CRUD methods; do not invent a new one.

3. **Check the other readers** before declaring done — `grep -rl "blockRepository\|from(blocks)" server/`
   currently reaches `blocks.routes.ts`, `WorkflowClonerService`, `VersionService`,
   `ExportService`, `entityGraph.ts`, `WorkflowDiffService`, `WorkflowChangeAnalyzer`,
   `WorkflowOptimizationService` and `DatavaultColumnsService`. Each one either already
   runs in a tenant transaction (most do — they were swept in RLS-2) or needs to. Copy
   a workflow, export one, and diff one under `RLS_RESTRICTED=true` to find out, rather
   than reasoning about it.

### Vertical proof

Route → service → repository → **runner**, unmocked, under `RLS_RESTRICTED=true`:

1. Tenant A creates a workflow with a page and a `prefill` block through
   `POST /api/workflows/:id/blocks` (the real route, real auth).
2. Tenant B requests that block by id and gets **404**, and B's block list for A's
   workflow is empty. (404, not 403 — the row is invisible, and that ruling is
   settled: `RLS_HANDOFF.md` §0b. Use `expectCrossTenantDenied`.)
3. **A starts a run of A's workflow and the block actually executes** — assert the
   effect in the stored data, never a 200. This is the half that catches the trap
   above, and a test that only checks steps 1–2 will pass on a completely broken
   runner.
4. An anonymous public-link run of a `is_public = true, status = 'active'` workflow
   still executes its blocks, proving the `USING` disjunct works.

### Ties

- **Load `db-schema-change` first** — migration numbering collides when two devs
  generate at once, and this repo has been bitten by it. Also `run-tests` (the gate is
  the integration project under `RLS_RESTRICTED=true`) and `verify` if you drive the
  live app.
- Read `docs/architecture/TENANT_ISOLATION_RLS.md` §2h and §7 before starting.
- `migrations/0031_rls_public_workflow_visibility.sql` is the template. `0027` explains
  the NULL-safe comparison; do not hand-roll a different predicate shape.
- **File footprint:** no other open ticket touches these files (this is the only open
  board). `rls10-policyIsolation.test.ts` gains one seeder — that suite fails by design
  until it has one, which is the mechanism working.

### Acceptance criteria

1. A new migration adds `tenant_isolation` on `blocks` with `ENABLE` + `FORCE`, the
   `USING` disjunct for public active workflows, and a `WITH CHECK` **without** it.
   Follows `0031`'s shape; fails loudly (`RAISE EXCEPTION`) if the table is missing.
2. `tests/integration/rls-coverage.test.ts` and `rls10-policyIsolation.test.ts` both
   pass with `blocks` included, and `SKIPPED` stays empty in the latter.
3. A new `tests/integration/rls-blocks.test.ts` asserts the four vertical-proof steps
   above, and passes in **both** modes.
4. **Proven non-vacuous:** show the cross-tenant test failing against the policy
   replaced with `USING (true)`, and show the runner test failing with the
   `getBlocksForPhase` scoping reverted. Paste both outputs. A check that has never
   failed is not known to work.
5. `npm run audit:rls-surface` stays green with no new allowlist entries. Adding one to
   close this ticket is an automatic fail.
6. `npm run test:fast` is **4025 or higher** (state the arithmetic), the integration
   project is green in both modes, `npx tsc --noEmit` is clean, and scoped eslint is
   clean on every file you touched.
7. If any of the readers in Preferred fix step 3 turns out to be broken under
   enforcement, **stop and report it** rather than expanding this ticket — it is a
   finding for the reviewer, and possibly its own ticket.

---
