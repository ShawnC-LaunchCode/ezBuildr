# Blocks RLS (BLK) — retired

**Retired 2026-09-20**, the day after it was filed. One ticket, BLK-1, promoted from
`RLS-B6` when the ENV/RLS initiative retired. It closed the last structural gap that
initiative left: `blocks` was the only workflow-owned table with no RLS policy.

**Recovering the ticket's full text** — Finding, the trap, vertical proof and acceptance
criteria:

```bash
git log -p -- tickets/BLOCKS_RLS_TICKETS.md
```

The durable material is in the code and docs, not here:
`migrations/0050_rls_blocks.sql`, `tests/integration/rls-blocks.test.ts`, and
[`docs/architecture/TENANT_ISOLATION_RLS.md`](../../docs/architecture/TENANT_ISOLATION_RLS.md).

---

## Closed — do not re-file

| ID | Title | Closed |
|---|---|---|
| BLK-1 | `blocks` tenant-isolation policy (migration `0050`, ownership-derived like `steps`) **plus** the read paths that had to be scoped with it — `a984b1fe` | 2026-09-20 |

**What the ticket predicted, and it was right:** adding the policy alone would have
stopped every block executing, silently. `BlockService.getBlocksForPhase` read on the
bare pool, `BlockRunner.runPhase` treats an empty list as "nothing to run", and the
caller still reports success.

**What the ticket did NOT predict, and is the more useful lesson:** the same shape
existed in `blocks.routes.ts`, where `PUT` and `DELETE` looked the block up on the bare
pool for the auto-revert middleware **before any service ran**. The ticket's file
footprint named the service and the runner, not the routes. It was caught only because
`blocks.rls.test.ts` (CLN-7) already drove block CRUD through the real routes under
enforcement and went 5/5 → 2/5. **A per-table policy needs every reader walked, not the
ones the ticket lists** — and the thing that found it was an existing route-level suite,
not the new one.

---

## Parked entries

### BLK-B1 — a route-level cross-tenant test can pass against a broken policy · `informational`

`rls-blocks.test.ts`'s isolation half passes with the policy replaced by `USING (true)`,
because `BlockService.verifyAccess` refuses first. Measured, not assumed. That does not
make it worthless — it is the defence-in-depth regression test for the service check —
but it is **not** proof of the policy, and its header says so. The policy proof is
`rls10-policyIsolation.test.ts`, which enumerates `blocks` from `pg_policies` and does go
red against `USING (true)`.

**Next step:** none. Recorded because "the cross-tenant test is green" is exactly the
evidence someone will cite for a policy that does nothing, and this initiative measured
a case where it would have been wrong.

### BLK-B2 — `app_owner_tenant` is not `SECURITY DEFINER` · `informational`

Every ownership-derived policy (`workflows`, `pages`, `sections`, `steps`, and now
`blocks`) calls `app_owner_tenant(...)`, a plain `STABLE SQL` function whose body reads
`users`, `organizations` and `projects`. Those reads are evaluated **as the calling
role**, so they are themselves subject to those tables' policies. It works today because
every caller that can see the parent workflow can also see the owning user/project row.

**Next step:** none, and do not "fix" it by adding `SECURITY DEFINER` without checking
what that would expose — the current behaviour is fail-closed, and a definer function
here would evaluate ownership with privileges the caller does not have. Recorded so the
next person reading a derived policy knows the inner reads are not free of RLS.

### BLK-B3 — `DatavaultColumnsService.checkColumnUsage` falls back to the bare pool · `informational`

`const database = tx ?? db`, and it reads `blocks` to guard against deleting a column a
block still references. Its only caller passes a scoped `tx`, so the fallback is
unreachable today. If a second caller ever omits the `tx`, the guard would find zero
matching blocks under enforcement and silently permit the delete.

**Next step:** if anyone adds a caller, pass the transaction. Not worth a change on its
own.
