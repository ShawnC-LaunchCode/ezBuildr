# DataVault — retired initiative detail

The DataVault audit initiative (DV-1..14) closed **2026-08-03**. Its ticket file was
`tickets/DATAVAULT_TICKETS.md`; recover the full text, every verification note and
every review pass with:

```bash
git log -p -- tickets/DATAVAULT_TICKETS.md
```

Opened 2026-08-02 at grade **D+**, closed at **B−**. `test:fast` 2313 → 2381,
integration 992 → 1031, zero failures.

**Live follow-on:** `tickets/DATAVAULT_HARDENING_TICKETS.md` (DVH-1..4) holds the
four dispatchable items that stand between B− and B+. Anything in *this* file is
parked, not scheduled.

---

## Closed — do not re-file

Every one of these was fixed and verified with pre-fix regression proof. If an audit
rediscovers one, it is a regression, not a finding.

| Ticket | What was wrong | Commit |
|---|---|---|
| DV-1 | `ReadTableBlockRunner` filtered/sorted on a `data->>'col'` column that does not exist on `datavault_rows` — 42703 on any filter, all-null cells otherwise | `be94a727` |
| DV-2 | `QueryRunner` called `.where()` twice and discarded the result; Drizzle **overwrites**, erasing table + tenant scoping — a reachable cross-tenant read | `5a9b39d3` |
| DV-3 | Choice questions resolved `table_column` options against `/api/tables/:id/rows`, which never existed; DataVault-backed dropdowns always rendered empty | `efc1e3f3` |
| DV-4 | `isUnique` / `isPrimaryKey` were validated when set and never enforced on write | `bb99c2a0` |
| DV-5 | Partial `PATCH` failed on required columns and regenerated `auto_number`, burning the sequence per edit | `a1b6f5c1` |
| DV-6 | `autonumber` was never generated; one type now, with prefix + zero-padding (`INV-0001`) | `30fc602c` |
| DV-7 | Upsert-update bypassed validation, matched archived rows, and its documented race fix did not hold | `d00e006d` |
| DV-8 | The server ignored the `filters` query param while the panel reported filters applied | `7386e22a` |
| DV-9 | `countByTableId` / `countByTableIds` included archived rows, so table cards disagreed with the grid footer | `013c7637` |
| DV-10 | The declarative writeback path was deleted (decision D-2), along with its AI operation | `abce0e9b` |
| DV-11 | DataVault API tokens were mintable but authenticated nothing; UI gated off (decision D-3) | `7b59181f` |
| DV-12 | `QueryService` had no tenant scoping on any method and a mass-assignment `updateQuery` | `63fd1511` |
| DV-13 | No DataVault mutation wrote an audit entry; all 29 now do | `e2dcf55e` |
| DV-14 | Both unarchive endpoints 404'd on archived rows — archive was a one-way door | `595c10b0` |

Also shipped along the way:

| | | |
|---|---|---|
| DV-B9 | Numeric-cast guard on sorts (descoped, then shipped in DV-9 anyway) | `013c7637` |
| — | An `// eslint-disable` rendering as literal text on the DataVault table page | `5dc8375b` |
| — | Two org-invite integration tests stale since the invite rework | `52a824c9` |
| — | `autonumber`-type assertions in the v4 regression suite, stale after D-4 | `78347240` |
| — | `scripts/new-worktree.ps1`: copy `node_modules`, per-worktree DB, honest teardown | `c8127592` |
| — | `.claude/skills/verify/SKILL.md` rebuilt against tested reality | `530b2ba0` |

## Standing decisions (do not re-litigate)

- **D-1** — DataVault-backed dropdown options are resolved **server-side**, by an
  endpoint accepting both `hybridAuth` and a run token, returning only the bound
  label/value pairs. Rejected: pointing the client at the rows endpoint (breaks
  public run links, ships whole rows to the browser).
- **D-2** — The declarative writeback path is **deleted**, not built. The
  Send-Data-To-Table block is the one supported way an interview writes to DataVault.
  Consequence to remember: **AI workflow edits can no longer create writeback
  mappings** (`datavault.createWritebackMapping` is gone). Verified 2026-08-03 that
  it is referenced nowhere — no prompt, no doc, no example.
- **D-3** — DataVault API tokens are **hidden, not implemented**
  (`VITE_ENABLE_DATAVAULT_API_TOKENS`, fail-closed). A real external API is DV-B1.
- **D-4** — There is **one** auto-number type. `auto_number` carries the optional
  prefix and padding; `autonumber` is retired in code with the enum value kept as an
  inert tombstone, because Postgres cannot drop an enum value and there were zero
  rows to justify recreating the type.

## Parked — with the reason

- **DV-B1 — build the external DataVault API** · `needs-initiative`. The token
  lifecycle exists and is inert (DV-11 hid the UI). A real API means token-auth
  middleware enforcing `scopes`, row read/write endpoints under it, rate limiting,
  and a new public attack surface. Own initiative, own threat review. Blocked on
  product demand, not code.
- **DV-B3 — `collections` / `collection_fields` / `records` look like a parallel
  unused data model** · `informational`. A second, jsonb-blob-shaped store lives in
  `shared/schema/datavault.ts` ("Legacy / Stage 19 Collections") with its own
  `CollectionBlockRunner`. **This is the likely origin of the `data`-blob confusion
  behind DV-1 and DV-3** — code written for `records` and pointed at
  `datavault_rows`. **Never investigated.** Worth a scoped "is Collections live, and
  if not, delete it" pass; do not assume it is dead.
- **DV-B4 — `getRowsWithValues` fetches every value for every row** ·
  `enhancement`. Column selection is applied after the query, so a 60-column table
  ships 60 values per row even when the grid shows 5. Fix is small (push the column
  filter into the values query). Will surface alongside DVH-4 on the first wide
  customer table.
- **DV-B5 — the choice-options fetch bypasses `apiRequest`'s 401 refresh** ·
  `enhancement`. DV-3 used raw `fetch` with `getAuthHeaders()` deliberately, to keep
  run-token precedence scoped to that one request. Cost: no token refresh, so an
  expired JWT makes a DataVault-backed dropdown show its error state. Fix: let
  `apiRequest` take per-request headers, then move the call back onto it.
- **DV-B6 — yearly reset for auto-numbers** · `enhancement`.
  `autonumberResetPolicy` and `datavault_number_sequences.last_reset` exist unread.
  Descoped by D-4 — prefix + padding was already more than needed. Small and
  well-bounded, but note it changes uniqueness expectations, since `INV-0001` would
  recur in a later year and DV-4 now enforces uniqueness.
- **DV-B7 — six copies of workflow→tenant resolution, with two different failure
  semantics** · `enhancement`. `workflowId → project.tenantId → fall back to
  creator.tenantId` is reimplemented in `QueryService`, `options.routes.ts`,
  `QueryBlockRunner`, `ReadTableBlockRunner`, `CollectionBlockRunner` and
  `ExternalSendBlockRunner`. **They disagree on failure:** the two DataVault-facing
  ones *throw* (403/404), the block runners *return null and warn* (failed block).
  Parked rather than ticketed because the right semantics is a judgment call and
  changing the runners is a behavioural change needing its own tests.
  ⚠️ **The creator-tenant fallback is itself a security-relevant heuristic** — a
  workflow with no project resolves its tenant from whoever created it. Load-bearing
  in all six places and **never audited**.
- **DV-B8 — promoted.** Became **DVH-1**; it turned out to also break `required`
  (an empty string satisfies it) and to disagree with the `is_empty` filter.

## Reviewer lessons worth keeping

Recorded because they were each paid for once.

- **Sweep the same eight DataVault integration suites every time**, regardless of
  what a ticket says it touches. Scoping the sweep per ticket committed a red test
  twice (DV-6's stale `autonumber` assertions, DV-13's `dataBlocks` cleanup).
- **Re-scope a ticket before cutting its worktree, not after.** DV-9's dev worked the
  pre-re-scope version because the worktree predated the re-scope commit.
- **Re-verify the finding, not the line numbers.** DV-9 lost half its scope to work
  that had already landed; DV-13's donor, its AC7 and its placement ruling were all
  stale.
- **Prove a test fails before the fix.** Two ACs in this initiative were satisfiable
  by doing nothing — DV-7's concurrency test (the test pool is capped at 1
  connection, so `Promise.all` serialises) and the pre-existing unarchive tests
  (which unarchived a row that was never archived, certifying DV-14's bug as fixed).
- **Scoped greps stated as absolute claims** caused three audit errors: a reachable
  AI producer called dead, an invented method name (`validateTokenAndScope`), and an
  endpoint undercount that missed `app.put`.
- **Read an input's value back**, don't infer it from an accessibility snapshot — it
  does not surface a value when a placeholder is present, which nearly produced a
  false bug report in DV-6.
- **A probe script must `throw`, not `process.exit()`**, or its `finally` cleanup is
  skipped and fixture rows leak into the shared dev DB. Clean up by **pattern**, not
  by captured ids — successive runs accumulate.
