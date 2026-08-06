# Backlog — parked work across closed initiatives

**This file is the whole index.** Every entry is a few lines: what it is, why it
is parked, and what unblocks it. Full text lives in
[`backlog/`](backlog/) — one file per retired initiative — and is read **only
when promoting an entry**, never on a routine sweep.

**A backlog entry is not a ticket.** It is not sized, not on a board, and not
dispatchable. Promoting one means re-verifying the finding first: these were
written against trees that have since moved. `LIST-B12` is the cautionary
example — it was fixed before anyone re-read it.

This file is deliberately **not** named `*_TICKETS.md`, because that glob is
what agents scan for dispatchable work (`AGENTS.md` §5). Open tickets live in
`tickets/*_TICKETS.md`; parked observations live here.

> **As of 2026-08-04 there is no open initiative.** `tickets/` holds this index and
> `backlog/` only. All three DataVault rounds closed and retired into
> `backlog/DATAVAULT.md` — the audit (DV-1..14, 2026-08-03), hardening (DVH-1..3 and
> DVH-5, 2026-08-04) and performance (DVP-1..3, 2026-08-04). Every earlier initiative is
> likewise closed and retired. The next piece of work starts with a fresh
> `*_TICKETS.md`; check this index first so a settled question is not re-filed as a new
> finding.

### Why an entry is parked

| Tag | Meaning | What unblocks it |
|---|---|---|
| `product-decision` | Blocked on what it *should* do, not on how | Shawn rules |
| `needs-initiative` | Real work, too large to promote to one ticket | Scheduling + a fresh audit |
| `enhancement` | Ready to ticket, just not prioritized | Anyone picking it up |
| `operational` | A config or repo-settings change; no code, no dispatch | Shawn does it |
| `informational` | Recorded so it is not rediscovered as a bug. **Not work** | — |
| `wont-fix` | Closed with reasoning, kept to prevent re-litigation | — |

### Scan table

To open an entry, grep its ID in the detail file named in the last column — the
IDs are stable, heading anchors are not.

| Entry | Why | One line | Detail |
|---|---|---|---|
| DV-B3 | `informational` | `records`/Collections parallel data model — never investigated, likely origin of the DV-1/DV-3 bugs | `backlog/DATAVAULT.md` |
| DV-B7 | `enhancement` | Six copies of workflow→tenant resolution, two failure semantics; creator-tenant fallback unaudited | `backlog/DATAVAULT.md` |
| DV-B1 | `needs-initiative` | External DataVault API — token lifecycle exists but is inert | `backlog/DATAVAULT.md` |
| DV-B5 | `enhancement` | Choice-options fetch bypasses `apiRequest`'s 401 refresh | `backlog/DATAVAULT.md` |
| DV-B6 | `enhancement` | Yearly reset for auto-numbers (descoped by D-4) | `backlog/DATAVAULT.md` |
| DVP-B1 | `enhancement` | Numeric/date range filters still unindexed after DVP-2 — 3 of 5 filter families accelerated; revisit >100k rows/table | `backlog/DATAVAULT.md` |
| DVP-B2 | `informational` | Every index benchmark measures a 12.5%-selectivity filter, so it cannot show what the truncated btree is actually for | `backlog/DATAVAULT.md` |
| LIST-B5 | `product-decision` | Dynamic options for list fields — highest value left | `backlog/LIST.md` |
| LIST-B4 | `enhancement` | Run detail dumps list answers as raw JSON — cheapest win | `backlog/LIST.md` |
| LIST-B8 | `enhancement` | Script helpers for list data | `backlog/LIST.md` |
| LIST-B6 | `needs-initiative` | No file upload / signature per list item | `backlog/LIST.md` |
| LIST-B7 | `needs-initiative` | Cross-item references in conditions | `backlog/LIST.md` |
| LIST-B13 | `product-decision` | Prefill a list from a DataVault query | `backlog/LIST.md` |
| LIST-B11 | `informational` | Drill state is not URL-addressable — deliberate | `backlog/LIST.md` |
| LIST-B14 | `wont-fix` | Abuse caps should not bypass the warn gate | `backlog/LIST.md` |
| IEX-D7 | `needs-initiative` | Replace `adm-zip` on the read side — gates Phase 3 | `backlog/PORTABILITY.md` |
| IEX-B1 | `needs-initiative` | Re-point `WorkflowClonerService` at the portability engine | `backlog/PORTABILITY.md` |
| IEX-B2 | `product-decision` | Import into an existing object (merge / overwrite) | `backlog/PORTABILITY.md` |
| IEX-B3 | `product-decision` | Restore mode (reuse original UUIDs) | `backlog/PORTABILITY.md` |
| IEX-B4 | `product-decision` | Passphrase-wrapped secrets sidecar | `backlog/PORTABILITY.md` |
| IEX-B7 | `operational` | Real DR: Neon PITR + scheduled `pg_dump` | `backlog/PORTABILITY.md` |
| IEX3-B1 | `enhancement` | List field aliases are outside collision detection | `backlog/PORTABILITY.md` |
| IEX3-B2 | `informational` | `remapJsonIds` never remaps object keys — nothing needs it yet | `backlog/PORTABILITY.md` |
| IEX3-B3 | `enhancement` | A `.ezb` has no human-readable `README.txt` | `backlog/PORTABILITY.md` |
| Phase 3 | `needs-initiative` | Client-wide export/import (ask #2) | `backlog/PORTABILITY.md` |
| Phase 4 | `needs-initiative` | Admin multi-tenant archive (ask #1) | `backlog/PORTABILITY.md` |
| DEBT-11 | `product-decision` | RLS policies defined but not enforced | `backlog/TECH_DEBT.md` |
| DEBT-OPS1 | `operational` | **`STORAGE_DRIVER=s3` unset in Railway — live 404s** | `backlog/TECH_DEBT.md` |
| DEBT-OPS2 | `operational` | Branch protection is off | `backlog/TECH_DEBT.md` |
| DEBT-OPS3 | `operational` | Delete `origin/debt9-typecheck-proof` | `backlog/TECH_DEBT.md` |

---

## DataVault — [detail](backlog/DATAVAULT.md)

Audit initiative DV-1..14, closed 2026-08-03. Opened at grade **D+**, closed at
**B−**. All fourteen tickets shipped and verified; the detail file carries a
`Closed — do not re-file` table so a later audit does not rediscover fixed work,
plus standing decisions **D-1..D-4** which should not be re-litigated.

The performance round **DVP-1..3** closed 2026-08-04 and is retired into the same
detail file — harness + `EXPLAIN` plans (`f0903bdd`), column narrowing (`f24e7182`),
and two size-bounded filter indexes (`68d6b949`).

The hardening round **DVH-1..3 + DVH-5** also closed 2026-08-04 and is retired into the
same detail file, taking DataVault from **B−** toward B+: blank cells stored as `NULL`
(`2dbcfa32`), staged RLS for the six uncovered tables (`8ac5e3be`), a real
`datavault_unique_keys` constraint behind unique columns (`e60b4eb7`, a live P0 found at
ticket review), and the clone path backfilling those keys (`ebcff7e0`). **No live
follow-on.**

**DV-B8 was promoted** into that round as DVH-1 — it turned out to break `required` as
well. **DV-B9 shipped** inside DV-9. **DV-B4 shipped as DVP-3** — it had been
double-tracked, parked here *and* promoted, for two days; it is struck through in the
detail file so a later audit does not rediscover it.

The two entries worth reading before touching DataVault again:

- **DV-B3** — the `records`/Collections model was never investigated and is the
  likely origin of the `data`-blob confusion that broke both the read-table block
  and DataVault-backed dropdowns. Do not assume it is dead.
- **DV-B7** — the creator-tenant fallback is a security-relevant heuristic,
  load-bearing in six places and never audited.

## List question type — [detail](backlog/LIST.md)

Rounds 1 (LIST-1..14) and 2 (LIST2-1..16) both closed 2026-08-02. Nothing below
is a bug; all are enhancements or deferred design.

- **LIST-B5 — dynamic options for list fields** · `product-decision` · *highest
  value of what's left.* LIST2-8 ships an honest "not available for list fields"
  note, which is still a dead end for authors. Blocked on semantics, not
  plumbing: what does binding to a table mean for a field inside a repeating
  item? The runner is already ready.
- **LIST-B4 — run detail dumps list answers as raw JSON** · `enhancement` ·
  *cheapest real win.* `ExecutionDetailView` `JSON.stringify`s everything
  because the endpoint returns no step type or config. Internal staff surface.
  `ListAnswerView` is reusable as-is; the work is plumbing `ListConfig` through.
- **LIST-B8 — script helpers for list data** · `enhancement`. Scripts see the
  raw storage envelope, not the projection, so every author re-implements the
  same unwrap.
- **LIST-B6 — no file upload / signature per list item** · `needs-initiative`.
  `file_upload` is unsupported in the runner platform-wide, so this is not a
  list problem and cannot be fixed inside lists first.
- **LIST-B7 — cross-item references in conditions** · `needs-initiative`. Needs
  condition-path grammar design; no partial version is worth shipping.
- **LIST-B13 — prefill a list from a DataVault query** · `product-decision`.
  Carried from round 1. **Its citations are stale** — the service it named was
  deleted in LIST-13. A product idea, not an implementation pointer.
- **LIST-B11 — drill state is not URL-addressable** · `informational`.
  Deliberate; recorded so it is not re-filed as a bug.
- **LIST-B14 — abuse caps bypassing the warn gate** · `wont-fix`, 2026-08-01.
  Retained because a prior reviewer argued the opposite and was wrong on the
  facts — the detail file records all three.

## Portability / import-export — [detail](backlog/PORTABILITY.md)

**All three rounds are closed — there is no active portability ticket file.**
Round 3 (`IEX3-1..11`) shipped the complete bundle and its UI, closing
2026-08-02 through `59dd30c5`; recover its detail with
`git log -p -- tickets/IMPORT_EXPORT_3_TICKETS.md`. The detail file also holds
the **standing decisions D-1..D-5**, which govern any future portability work —
read them before ruling on anything portability-shaped, and check its
`Closed — do not re-file` table before filing a finding.

- **IEX-D7 — replace `adm-zip` on the read side** · `needs-initiative`. Ruled
  2026-07-29 as its own initiative, **sequenced before Phase 3**: adm-zip has no
  per-entry read stream, so a tenant-scope export cannot stream. *Was tracked
  three times (as `IEX-B8`, `D-7`, `IEX3-B4`); merged here 2026-08-02.*
- **IEX-B1 — re-point `WorkflowClonerService` at the engine** ·
  `needs-initiative`. Retires ~1 000 lines and collapses two entity graphs into
  one. Size L per decision D-5; blocked on round 3 closing.
- **IEX-B2 — import into an existing object** · `product-decision`. Merge
  semantics (match by alias? by id? what wins?) is a design question.
- **IEX-B3 — restore mode, reuse original UUIDs** · `product-decision`. Needed
  for same-system recovery and deep links. Blocked behind IEX-B2's conflict
  policy.
- **IEX-B4 — passphrase-wrapped secrets sidecar** · `product-decision`. Would
  allow cross-system DR without exporting `VL_MASTER_KEY`. Depends on D-2
  holding.
- **IEX-B7 — real DR: Neon PITR + scheduled `pg_dump`** · `operational`. Per
  D-4 this, not the admin archive, is the backup story. Ops task; **was tracked
  nowhere until now.**
- **IEX3-B1 — List field aliases outside collision detection** · `enhancement`.
  The duplicate-alias check reads `steps.alias` only and never descends into
  `steps.config.fields[]`. Low impact (those aliases are item-scoped), cheap
  now that the config walker exists.
- **IEX3-B2 — `remapJsonIds` never remaps object keys** · `informational`.
  Nothing in the schema uses id-keyed jsonb, so there is nothing to fix.
  Recorded so it is not re-filed as a finding; re-check if such a column
  appears.
- **IEX3-B3 — a `.ezb` has no human-readable file** · `enhancement`. A
  generated `README.txt` would make a received bundle self-describing without
  the app. Mostly assembly — `EXCLUSION_CATEGORIES` and `requiresReentry`
  already hold the prose.
- **Phase 3 — client-wide export/import** · `needs-initiative`. Scope settled
  (D-1, D-3). Sequenced after IEX-D7. Extend round 3's UI, don't build a second.
- **Phase 4 — admin multi-tenant archive** · `needs-initiative`. Tenant
  multi-select, one job per tenant. Explicitly **not** the DR mechanism.
  ⚠️ Both outlines carry ticket IDs that collide with shipped tickets —
  renumber when carved.

## Tech debt — [detail](backlog/TECH_DEBT.md)

15 of the 16 DEBT tickets shipped. What remains is one decision and three
things a dev cannot do from a worktree.

- **DEBT-11 — RLS defined but not enforced** · `product-decision`. Deliberate
  (prod connects as table owner), but the second line of defence is inert and
  more code is written each week assuming it stays that way. Decide this
  quarter or say so in the docs.
- **DEBT-OPS1 — `STORAGE_DRIVER=s3` unset in Railway** · `operational` ·
  **live customer impact.** DEBT-15's code landed and is driver-agnostic, but
  the default is `disk`, so generated documents still land on the ephemeral
  container filesystem and **customers get 404s after every deploy**. Blocks
  GitHub #169 (P0).
- **DEBT-OPS2 — branch protection is off** · `operational`. CI ran red across
  four consecutive pushes on 2026-07-31, including two feature merges, and
  nothing blocked them.
- **DEBT-OPS3 — delete `origin/debt9-typecheck-proof`** · `operational`. Its
  only commit is a deliberate type error; the gate it proved is proven.

## Roadmap follow-ups filed at merge time (2026-08-06)

Carved while merging GH-158/159/160 and retiring the duplicate GH-170 branch.

- **RM-1 — `run_document_deliveries.tenant_id` should be NOT NULL** ·
  `bug` · P2. `DocumentDeliveryService.resolveTenantId` can return `null` and
  `enqueueDeliveriesForRun` inserts the row anyway. Both read paths are
  tenant-scoped in SQL and the RLS policy compares `tenant_id =
  current_setting(...)`, which never matches NULL — so such a delivery is still
  processed by the worker using the destination's credentials, but is invisible
  and un-retryable through the API for everyone. A discarded second
  implementation of GH-170 (branch `gh-170`, deleted 2026-08-06 in favour of
  what landed in `58965756`) had fixed exactly this with a
  `0015_delivery_tenant_not_null` migration; redo it on top of `main`.
- **RM-2 — `RunService.createAnonymousRun` is dead code** · `cleanup` · P3.
  `grep -rn "createAnonymousRun" server/` returns only the definition. It was
  the `/intake/*` pipeline's helper; O-12 removed that pipeline, and
  `POST /api/workflows/public/:slug/start` uses `createRun` instead. It still
  carries its own publish/`isPublic` gate and an `createdBy: 'anon'` convention
  that no live path writes, so it reads as a supported entrypoint and isn't one.
- ~~**RM-3 — two new high advisories block CI on `main`**~~ · **DONE
  2026-08-06.** `Security Scan → Dependency Scanning` was failing on
  `GHSA-rgw5-rvv9-x895` (brace-expansion) and `GHSA-mwp4-54f8-5fhr`
  (**ip-address**: `Address4` decodes leading-zero octets as decimal while
  resolvers use octal → SSRF / trust-boundary bypass). Both were **lockfile
  staleness, not dependency conflicts**: every patched release sits inside a
  major that consumers already admit, so `npm update ip-address
  brace-expansion` fixed all ten install paths with no `overrides` and no
  `package.json` change. `ip-address` 10.2.0 → 10.4.0 also cleared two further
  advisories in the same family (`GHSA-4xrf-jv44-h6hh`,
  `GHSA-22jq-vg5j-6vgg`). The `GHSA-mh99` exception was **removed** rather than
  left to expire, since its stated premise — that only a breaking-major
  eslint-plugin-import upgrade could fix it — is no longer true. Gate now
  reports `2 allowlisted, 0 blocking`.
  Note the advisory's SSRF wording never applied to this codebase directly:
  no first-party file imports `ip-address` (`ssrfValidator` uses `node:net`'s
  `isIP` plus its own octet checks). The runtime exposure was
  `express-rate-limit` → `ip-address`, which keys rate limiting off client IPs.
  See **RM-6** for the same bug class found hand-rolled in our own validator.
- **RM-4 — dependabot PRs can never go green** · `operational` · P3. Their
  `Tests` job passes (299 files) then dies on the `Slack Notification Suite`
  step, which needs a secret dependabot PRs do not receive. Either guard that
  step on secret availability or accept the red and merge on the Tests result.
- **RM-5 — the `Auth Tests` workflow has never passed** · `operational` · P2.
  It has failed on **every push since at least 2026-07-14** (8 consecutive
  runs checked, all `failure`). Root cause is configuration, not code: it runs
  `tests/integration/auth.flows.real.test.ts` and `auth.routes.real.test.ts`,
  which `vitest.config.ts` deliberately lists in `excludedIntegrationTests`
  because `*.real.test.ts` needs real external credentials — plus
  `tests/unit/services/MfaService.test.ts`. A workflow that is permanently red
  provides no signal and trains everyone to ignore red CI, which is how
  DEBT-OPS2 happened. Either give it the credentials, drop the `.real` files
  from its matrix, or delete the workflow.
- **RM-6 — `isInternalIp`'s IPv4-mapped branch skips its own `isIP` gate** ·
  `security` · P2 · **not currently exploitable.** Found while fixing the
  `ip-address` advisory (RM-3), which is the same bug class in a library.
  `server/utils/ssrfValidator.ts:23-35` classifies plain IPv4 only after
  `isIP(normalized) === 4` — and Node's `isIP` rejects every leading-zero and
  hex form (`010.0.0.1`, `0177.0.0.1`, `0x7f.0.0.1` all return 0), so the
  hand-rolled `ipv4.split('.').map(Number)` never sees an ambiguous octet on
  that path. The IPv4-mapped branch one line earlier does **not** have that
  gate: `/^::ffff:(\d+\.\d+\.\d+\.\d+)$/` happily captures `0177`, and
  `Number("0177")` is 177, so `::ffff:0177.0.0.1` is classified **public**
  while a resolver reading `0177` as octal reaches `127.0.0.1`.
  Both callers (`safeFetch.ts:37`, `resolveSafeUrl` at `ssrfValidator.ts:58`)
  only ever pass `dns.lookup()` output, which is resolver-normalized, so
  nothing reaches it today. But `isInternalIp` is exported and reads like a
  general-purpose predicate: the first caller that hands it a user-supplied
  string gets a genuine SSRF bypass. Apply the same `isIP` gate to the mapped
  branch and add a test table of the leading-zero/hex forms. Deliberately not
  bundled into the dependency bump — SSRF logic changes deserve their own
  reviewed commit.
