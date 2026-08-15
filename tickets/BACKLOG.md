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

> **As of 2026-08-09 the live board is `tickets/ROADMAP_TICKETS.md`** (the GH-146..174
> epics). The Workflow Map initiative (MAP-1..10, epic **GH-153**) closed and retired into
> `backlog/WORKFLOW_MAP.md` on 2026-08-09 — **all ten tickets and all eight of its backlog
> observations shipped, so it parks nothing.** Its detail file is kept for the
> `Closed — do not re-file` table, the six standing decisions D-1..D-6, and the process
> lessons. Logic Unification (LU-1..6c, epic **GH-154**) retired the day before into
> `backlog/LOGIC_UNIFICATION.md`; all DataVault rounds and every earlier initiative are
> likewise closed and retired. Check this index before auditing anything, so a settled
> question is not re-filed as a new finding.
>
> **The AI Service Layer initiative (AISL-1..12) closed and retired into
> `backlog/AI_SERVICE_LAYER.md` on 2026-08-10.** All twelve tickets and all three
> phase gates passed; it parks eleven entries, `AISL-B1..B11`. Before auditing
> anything in `server/services/ai/`, `server/lib/ai/`, or the `/api/ai/*` routes,
> read that file — **`AISL-B7` in particular**, because
> `WorkflowOptimizationService` looks like an AI service, is served at
> `/api/ai/workflows/optimize/*`, and makes no model call at all.
>
> **Read `LU-B1` first if you are about to run a migration.** Local development and
> production share one Neon database; a local `db:migrate` hits production immediately.

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
| LU-B1 | `operational` | **Local dev and production share one Neon database — a local `db:migrate` hits prod** | `backlog/LOGIC_UNIFICATION.md` |
| LU-B2 | `informational` | LU Phase 1 gate never drive-through'd; two changes went live unwatched | `backlog/LOGIC_UNIFICATION.md` |
| LU-B3 | `informational` | Dead-store-action guardrail tests references, not reachability | `backlog/LOGIC_UNIFICATION.md` |
| LU-B4 | `informational` | Builder store is global but conceptually per-workflow — latent if tabs land | `backlog/LOGIC_UNIFICATION.md` |
| DEBT-11 | `product-decision` | RLS policies defined but not enforced | `backlog/TECH_DEBT.md` |
| ~~DEBT-OPS1~~ | **RESOLVED** | ~~`STORAGE_DRIVER=s3` unset in Railway~~ — **stale entry, do not re-file.** Measured 2026-08-13: production has `STORAGE_DRIVER=s3` with `AWS_S3_*` configured. Already recorded as **O-3 closed 2026-08-04** in `ROADMAP_TICKETS.md`; this index was never updated and misled a reviewer into citing it as a live incident | `backlog/TECH_DEBT.md` |
| DEBT-OPS2 | `operational` | Branch protection is off | `backlog/TECH_DEBT.md` |
| DEBT-OPS3 | `operational` | Delete `origin/debt9-typecheck-proof` | `backlog/TECH_DEBT.md` |
| AISL-B1 | `needs-initiative` | Structured outputs would *delete* the JSON-parse/truncation subsystem; provider-coupled, Size L | `backlog/AI_SERVICE_LAYER.md` |
| AISL-B2 | `needs-initiative` | Model tiering by `TaskType`; unevaluable until `/usage` has real data, and **conflicts with AISL-B3** | `backlog/AI_SERVICE_LAYER.md` |
| AISL-B3 | `needs-initiative` | Enable provider prompt caching — **measured: prefix is only ~1,168 tokens, below several model floors; value far smaller than the audit claimed** | `backlog/AI_SERVICE_LAYER.md` |
| AISL-B4 | `enhancement` | Three duplicated definitions in the AI layer (step types, truncation, default-model resolution) — re-verified 2026-08-10 | `backlog/AI_SERVICE_LAYER.md` |
| AISL-B5 | `enhancement` | `__qualityScore` passed as an `as any` side channel then deleted by the caller | `backlog/AI_SERVICE_LAYER.md` |
| AISL-B6 | `enhancement` | `callLLM` retry loop has no wall-clock deadline and no circuit breaker | `backlog/AI_SERVICE_LAYER.md` |
| AISL-B7 | `informational` | `WorkflowOptimizationService` makes **no LLM call** despite its name/path — do not "fix" | `backlog/AI_SERVICE_LAYER.md` |
| AISL-B8 | `product-decision` | `ai_settings.scope` supports org/user but only global is implemented | `backlog/AI_SERVICE_LAYER.md` |
| AISL-B9 | `enhancement` | Anonymous public-link runs still call AI untenanted (no budget, no ledger row) | `backlog/AI_SERVICE_LAYER.md` |
| AISL-B10 | `needs-initiative` | Nothing *writes* `workflow_personalization_settings`, so AISL-12's toggles are unsettable; four sibling columns still dead | `backlog/AI_SERVICE_LAYER.md` |
| AISL-B11 | `needs-initiative` | `IntegrationHub` order-dependent flake — three devs in a row had to judge whether red meant red | `backlog/AI_SERVICE_LAYER.md` |
| ~~G171-B1..B5~~ | ✅ all fixed | Template filter family + the dead `unresolved_variables` report (filed as G171-O1..O3 by a concurrent session). **Parks nothing** | `backlog/TEMPLATE_VERSIONING.md` |
| BIZ-O1 | `enhancement` | Other import-side jsonb blobs (`sections.config`, `steps.config`, `graphJson`) validated by shape only; `fieldSchemas` is the hook if they need more | `backlog/BUSINESS_DAYS.md` |

---

## GH-171 template versioning (G171) — [detail](backlog/TEMPLATE_VERSIONING.md) — retired 2026-08-12

**GH-171 closed with all 4 ACs met; follow-ups G171-0..6 all closed — and every parked
entry has since been fixed too, so this parks nothing.**

Two sessions retired this initiative in parallel on 2026-08-12 and filed the same
observations under different IDs. **`G171-O1..O3` are the same findings as `G171-B*`;
the detail file uses the `-B` IDs.** All are now closed:

- **G171-O1 / the dead `unresolved_variables` report** — fixed in `f99110d4`. It was
  *structurally* always `[]`; the names of unanswered variables now travel to the renderer
  instead of their nulls, so no generated document changed. Guarded by **two** DOC-104
  integration cases that must not be collapsed into one (unanswered-but-known → blank and
  recorded; unknown tag → raises) plus a no-DB companion suite.
- **G171-O2 / immutability** — `deactivateVersion` deleted as dead code (`30f26d23`), so no
  mutation path remains. It also never did what its name implied: the pinned lookup ignores
  `isActive`.
- **G171-B1/B2/B5 — the numeric filter family**, found while fixing the above. `percent`
  threw on *every* string containing a number, failing whole documents for real answers
  (`48201b74`); `{{ fee | currency }}` rendered `$0.00` for a fee nobody entered, against
  the authoring guide's own blank-on-empty rule; and `add('1200','300')` concatenated to
  `'1200300'` (`73c9e0b6`).
- **G171-O3 / reviewer process** — kept in the detail file, not as work.

## Business-day date math (BIZ) — [detail](backlog/BUSINESS_DAYS.md) — retired 2026-08-12

**2 of 2 tickets closed**, gate fully satisfied including a live real-DOCX render across a
federal holiday. Parks one entry. Carries the settled ruling that **the holiday calendar is
configuration, not a filter argument**, and that the render-time throw on an invalid calendar
**stays** (a wrong date on a legal deadline is worse than a loud failure).

- **BIZ-O1 — the other import-side jsonb blobs are unvalidated** · `enhancement`. BIZ-2 added
  a `fieldSchemas` hook to the portability entity graph and used it only for
  `workflows.settings`. `sections.config`, `steps.config`, `blocks.config` and
  `workflow_versions.graphJson` still pass with nothing but a shape check. Nothing is known
  to be broken — this records that the same class of bug may exist next door.

## Scripting hooks (SCRIPT) — [detail](backlog/SCRIPTING_HOOKS.md) — retired 2026-08-12

**3 of 3 tickets closed and it parks nothing.** Two document-generation lifecycle phases
(`beforeFinalBlock`, `afterDocumentsGenerated`) could never fire; they now fire, in order,
with their output provably reaching the renderer. The detail file is kept for the
`Closed — do not re-file` table and one reusable lesson: **for any hook, ask whether a test
proves existence, ordering, or effect** — those were SCRIPT-1, -2 and -3 respectively, and
only the third is worth much. Also records that **`isolated-vm` is installed locally**, so
hook paths are verifiable live.

## Template Language (TPL) — [detail](backlog/TEMPLATE_LANGUAGE.md) — retired 2026-08-10

**11 of 11 tickets closed.** `test:fast` 2814 → 3031. One grammar now serves DOCX templates
and runner answer-piping, parsed only in `server/services/document/RenderCore.ts`. Closed
roadmap **GH-161** and unblocked **GH-171** and **GH-173**.

One item needs a ruling before other work depends on it:

- ~~**TPL-O7 — business-day / holiday date math**~~ · **RESOLVED 2026-08-12 — do not
  re-promote.** The ruling it was waiting for was given on 2026-08-11 (the calendar is
  *configuration*, selectable between `weekends-only` and `us-federal`) and shipped as the
  **BIZ** initiative — `addBusinessDays`, `nextBusinessDay`, `businessDaysBetween` and
  `addWeekdays`, with algorithmic federal-holiday observation. "30 business days" and
  weekend-rolling deadlines are now expressible. Detail: [backlog/BUSINESS_DAYS.md](backlog/BUSINESS_DAYS.md).
  Per-workspace calendars were **not** built and nobody has asked for them.

Parked, not dispatchable:

- **TPL-O1 — object key/value iteration** · `enhancement`. Needs a `VariableNormalizer`
  transform to `[{key, value}]`, not a grammar change. No current template needs it.
- **TPL-O3 — clause library** · `needs-initiative`. Reusable clause blocks; probably a builder
  content feature rather than template inheritance (docxtemplater's subtemplate module is
  commercial).
- **TPL-O5 — no upload → store → generate integration test** · `enhancement`. Every test in
  the initiative built buffers in memory; this gap is how the smart-quote bug survived.
- **Filter vocabulary near-duplicates** · `informational`. `titleCase`/`titlecase`,
  `default`/`defaultValue`, three currency and four date spellings all render. Documented in
  `docs/guides/SCRIPTING_VS_TEMPLATE_FILTERS.md`; prefer the preset names.

Open the detail file for the `Closed — do not re-file` table, the four settled decisions
(D1–D4), and the seam lessons — **every defect in this initiative lived between tickets and
passed its own ticket's gates**.

## Workflow Map (MAP) — [detail](backlog/WORKFLOW_MAP.md) — retired 2026-08-09

Epic **GH-153**. Opened at grade **C**, closed with **all ten tickets and all eight
backlog observations shipped** — it parks no work. `test:fast` 2677 → ~2795.

Nothing here is dispatchable. Open the detail file only for:

- The **`Closed — do not re-file` table** — every MAP ticket and B-entry with its commit,
  so a later audit does not rediscover shipped work.
- **Standing decisions D-1..D-6.** Two are load-bearing beyond the map: **D-5** (a
  backward `skip_to` stays a publish-blocking error; backward *navigation* is a runner
  feature, not a logic-rule one) and **D-6** (`sections.skip_if` was dropped as redundant
  with `visible_if`'s `not` flag — do not reintroduce a parallel skip dialect).
- The **seam lesson**: every defect in this initiative lived *between* tickets, invisible
  to per-ticket gates. Budget reviewer time for cross-seam probes on any multi-ticket
  initiative.
- **Environment facts** — the four-gate rule (`check:strict-zones` is not implied by
  `type-check`), the tmpfs test-DB trap, and the Playwright-not-Browser-pane recipe for
  live proof.

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
## Logic Unification (LU) — retired 2026-08-08

Epic **GH-154**. Four condition languages became one: `ConditionExpression` is now the only
one, and `skip_to`/`require`/`make_optional` became authorable for the first time. Detail and
the full closed-ticket table: `backlog/LOGIC_UNIFICATION.md`.

- **LU-B1 — local dev and production share one Neon database** · `operational`. `railway
  status` reports environment `production` and its `DATABASE_URL` resolves to the same host
  and database as local `.env`. A dev's routine `npm run db:migrate` therefore ran against
  production and, with the matching code unpushed, left **starting or resuming a run**
  returning 500 for hours; `/health` stayed green because it only checks connectivity.
  Unblocked by the repo owner's planned DB-setup change. Until then, every local migration is
  a production migration.
- **LU-B2 — LU's Phase 1 gate was never drive-through'd** · `informational`. LU-4's combobox
  is tested and proven *served*, but never eyeballed in the real builder; the attempt was
  blocked by the a11y defect it then found (O-5). Advanced UI in the Final Documents editor
  and the logout token-clearing change also went live unwatched.
- **LU-B3 — the dead-store-action guardrail finds entry points, not whole clusters** ·
  `informational`. It tests references, not reachability: it flagged `startPreview` but not
  `stopPreview`, whose only caller was itself unreachable. Its `KNOWN_DEAD` allowlist is
  deliberately empty — keep it that way.
- **LU-B4 — builder store state is global but conceptually per-workflow** · `informational`.
  Only `selection` and `inspectorTab` remain, both harmless. The two that would have collided
  across concurrent builders are gone. Revisit only if builder tabs or split-view are designed.

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

- ~~**RM-1 — `run_document_deliveries.tenant_id` should be NOT NULL**~~ ·
  **DONE 2026-08-06** in `77212a68`. Closed at all three layers: migration
  `0016_delivery_tenant_not_null` (via `db:generate`, so journal and snapshot
  stay in lockstep), `.notNull()` mirrored in the Drizzle schema, and
  `enqueueDeliveriesForRun` now throwing instead of inserting — its only caller
  already catches and logs, so an unattributable run completes with a logged
  failure rather than a silent invisible delivery. No backfill or DELETE, by
  design: the table shipped in the same commit as the feature and is empty, so
  a `23502` here means orphans exist and a human should decide.
  Reviewer verification: the chain applied to a clean database (105 tables,
  `information_schema` reports `tenant_id` `is_nullable = NO`); delivery unit
  tests 4 files / 41; `unit:db` 15 files / **145** (was 143); delivery
  integration 1 file / 3; `test:fast` **2526** (was 2524). Note the submission
  also bumped the `SchemaManager` cache token `_v20` → `_v21`, without which the
  new real-DB test would have passed against a stale schema.
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
- ~~**RM-5 — the `Auth Tests` workflow has never passed**~~ · **DONE
  2026-08-06.** Failed on every push since at least 2026-07-14 (8 consecutive
  runs checked). Three independent config faults, no product bug:
  1. Its fallback `VL_MASTER_KEY` decoded to **41 bytes**, not 32. MfaService
     encrypts the TOTP secret with it and a wrong length throws — that alone
     failed two `generateTotpSecret()` cases. `tests/setup.auth.ts` already had
     a *valid* fallback; the workflow was overriding it with a broken one.
  2. Two jobs ran `vitest.config.integration.ts`, whose five `*.real.test.ts`
     files need real external credentials — the same pattern
     `vitest.config.ts` excludes for that reason. Removed; the files stay and
     still run locally via `test:auth:integration`.
  3. `auth-test-summary` printed "✅ Completed" whenever an artifact merely
     existed, so a failed run still summarised as a pass. Removed.
  The surviving job runs `test:auth:coverage`, so vitest actually enforces the
  80/80/75/80 thresholds instead of the old no-op step that echoed them in a
  comment, and `json-summary` was added to the reporters because the step
  summary read a `coverage-summary.json` that was never generated.
  **Lesson worth keeping:** the first fix dropped the postgres service *and*
  `DATABASE_URL`, on a local run that appeared to prove no database was needed.
  It proved nothing — `server/config/env.ts` calls `dotenv.config()` on
  `process.cwd()/.env`, so the local `.env` silently re-supplied the variable
  that CI lacks. `DATABASE_URL` is a required schema field with **no** test
  fallback (unlike `JWT_SECRET`/`SESSION_SECRET`, which `parseEnv()` fills in
  when `NODE_ENV=test`), so `AuthService.test.ts` died at import. The
  connection genuinely is not needed; the variable is. To test env-var
  sufficiency in this repo you must run from a cwd with no `.env` — anything
  else is masked.
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
- **RM-7 — an idle-connection drop crashes the whole server** · `bug` · P1 ·
  **live production impact.** `server/db.ts:63` does
  `pool = new pg.default.Pool({ connectionString, max: poolSize })` and **no
  `pool.on('error')` handler exists anywhere in `server/`** (grep for
  `.on('error'` finds handlers for the queue, websockets, redis, archiver and
  file streams — never the pg pool). pg documents that an idle client emitting
  an error with no pool listener becomes an unhandled `'error'` event, which
  terminates the process. Observed for real 2026-08-06 while verifying the Node
  24 upgrade: a dev server that had been healthy died with
  `Error: Connection terminated unexpectedly` at `pg/lib/client.js:350`, having
  served requests fine minutes earlier. Neon closes idle connections routinely,
  so this is a matter of when, not if. Railway's `restartPolicyType:
  ON_FAILURE` (max 10 retries) masks it as a restart blip rather than an
  outage, which is likely why it has gone unnoticed.
  Fix is a few lines — attach a handler that logs and lets the pool evict the
  client instead of letting the event reach the process — but it wants a test,
  and the accompanying `MaxListenersExceededWarning: 11 connect listeners added
  to [BoundPool]` seen in the same log suggests something is also attaching
  per-connection listeners without removing them. Worth looking at both
  together. **Not** caused by the Node 24 bump: that diff changes only
  `@types/node`, `undici-types`, `isolated-vm` and version declarations —
  nothing in the pg path.
