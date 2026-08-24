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

> **As of 2026-08-24 the only live board is `tickets/ENVIRONMENTS_AND_RLS_TICKETS.md`
> (ENV-1/ENV-3 remainders + RLS-1..5).**
>
> **The Sections-above-Pages board (SECT-1..10) closed and retired into
> `backlog/SECTIONS_AND_PAGES.md` on 2026-08-24** — all 11 tickets shipped across five
> phase gates, and Phase 4 was live-verified end to end. It parks fifteen entries,
> `SECT-B1..B15`, and carries ten standing decisions **D-1..D-10** that still bind
> anything touching sections, pages or runner navigation. ⚠️ **`SECT-B11` is the entry
> to look at first, and it is not a Sections issue:** `--primary` is a full `hsl(...)`
> string rather than the channel triple Tailwind's `/opacity` modifier compiles against,
> so `bg-primary/10` and every sibling render **transparent** — **45 live usages** in
> `client/src`. The sequencing note that used to sit here (RLS Phase 2 before the SECT
> rename, because RLS-3 and SECT-2 both rewrite the `sections` RLS policies) is now
> spent: SECT-2 and SECT-3 have shipped, and SECT-3's new `sections` table carries its
> own policy in migration `0039`.
>
> **The Template Marketplace board (TM-1..5) closed and retired into
> `backlog/TEMPLATE_MARKETPLACE.md` on 2026-08-18** — all five tickets shipped and the gate
> was proven against a real deployment. It parks six entries, `TM-B1..B6`. **Read `TM-B1`
> before writing any integration test that asserts a 403/404**: the integration harness builds
> its app from `registerRoutes`, which does **not** register the global `errorHandler` that
> `server/index.ts` and `server/production.ts` do — so a route relying on the global handler
> answers **500** to every denial under test and no test will say so.
>
> ⚠️ **Before adding any step to `npm run build`, check `.dockerignore` as well as the
> Dockerfile.** TM-1 wired a build-time generator in; `scripts/**` was excluded from the build
> context, and **every `dev` deploy failed for two days** while Railway kept serving the last
> good build. See `TM-B2`.
>
> **The Roadmap epics board (GH-146..174) closed and retired into `backlog/ROADMAP.md`
> on 2026-08-18** — 20 of 27 shipped. It parks six epics (**GH-163..173**) and twelve
> observations (**GH-O1..GH-O19**). ⚠️ **Those six epics are not tickets.** They came
> from a competitive audit written against the product's intended shape, and **5 of the
> 6 file paths they cite do not exist**; promoting one requires a fresh audit, not a
> re-read. **`GH-O4` is the one to look at first** — its stated precondition has since
> fired. GH-174 was carried to `SECT-10` rather than parked.
>
> The Workflow Map initiative (MAP-1..10, epic **GH-153**) closed and retired into
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
| SECT-B11 | `needs-initiative` | `/opacity` on `--primary` is silently transparent — **45 live usages** render no tint | `backlog/SECTIONS_AND_PAGES.md` |
| SECT-B2 | `product-decision` | `logic_rules` targeting a Section — needs a ruling on what `skip_to` a Section means | `backlog/SECTIONS_AND_PAGES.md` |
| SECT-B8 | `product-decision` | Cross-tenant concealment is 404 on Section create, 403 on update/delete and all of `PageService` | `backlog/SECTIONS_AND_PAGES.md` |
| SECT-B14 | `product-decision` | 22 dead links in two closed security audit records — repoint, mark historical, or leave | `backlog/SECTIONS_AND_PAGES.md` |
| SECT-B3 | `needs-initiative` | Workflow map draws Section containers — size `mapLayout.ts` before promoting | `backlog/SECTIONS_AND_PAGES.md` |
| SECT-B1 | `enhancement` | Review screen grouped by Section — where a 100-page respondent actually spends time | `backlog/SECTIONS_AND_PAGES.md` |
| SECT-B4 | `enhancement` | AI generation emits Sections — now unblocked, Phase 2 shipped | `backlog/SECTIONS_AND_PAGES.md` |
| SECT-B5 | `enhancement` | Curated marketplace templates should ship with Sections — now unblocked | `backlog/SECTIONS_AND_PAGES.md` |
| SECT-B6 | `enhancement` | Per-Section progress in the runner header ("Page 3 of 11 in Assets") | `backlog/SECTIONS_AND_PAGES.md` |
| SECT-B10 | `enhancement` | Six run routes still lack `optionalHybridAuth` before `creatorOrRunTokenAuth` | `backlog/SECTIONS_AND_PAGES.md` |
| SECT-B12 | `enhancement` | Dead `setCurrentPageIndex` prop on `LoadedRunnerScreenProps` + 3 test mocks | `backlog/SECTIONS_AND_PAGES.md` |
| SECT-B15 | `enhancement` | ~26 documents still say "VaultLogic" — two are linked from CLAUDE.md's index | `backlog/SECTIONS_AND_PAGES.md` |
| SECT-B13 | `operational` | Five stale probe rows in the shared `dev` Neon branch (from TM, 2026-08-18) | `backlog/SECTIONS_AND_PAGES.md` |
| SECT-B9 | `informational` | `updateProgress` is an RLS throw-point on the anonymous path — RLS-5 sweeps it | `backlog/SECTIONS_AND_PAGES.md` |
| SECT-B7 | `wont-fix` | `PreviewRouter.isPageVisible` ignores visibility — dead code, nothing instantiates it | `backlog/SECTIONS_AND_PAGES.md` |
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
| ~~DEBT-OPS1~~ | **RESOLVED** | ~~`STORAGE_DRIVER=s3` unset in Railway~~ — **stale entry, do not re-file.** Measured 2026-08-13: production has `STORAGE_DRIVER=s3` with `AWS_S3_*` configured. Already recorded as **O-3 closed 2026-08-04** on the Roadmap board (retired → `backlog/ROADMAP.md`); this index was never updated and misled a reviewer into citing it as a live incident | `backlog/TECH_DEBT.md` |
| ~~DEBT-OPS2~~ | **RESOLVED** | ~~Branch protection is off~~ — **stale entry, do not re-file.** Branch protection was *never* off; it uses a **repository ruleset** (`main-protection`), and the legacy `repos/.../branches/main/protection` API returns 404 *"Branch protection has been disabled"* even while the ruleset is active. Several audits concluded protection was off from that 404 alone. Query `gh api repos/ShawnC-LaunchCode/ezBuildr/rulesets` instead — see `CLAUDE.md` "The real boundary: rulesets, not the legacy API" | `backlog/TECH_DEBT.md` |
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
| LD-O1 | `enhancement` | No `spellNumber` filter — retainer renders "2 additional attorneys" where drafting convention spells small numbers | `backlog/LEGAL_DRAFTING.md` |
| LD-O2 | `informational` | Vestigial `/intake` rate-limiter registrations, and a security comment claiming to protect a route tree that no longer exists | `backlog/LEGAL_DRAFTING.md` |
| TM-B1 | `needs-initiative` | **Integration harness omits the global `errorHandler`, so every route trusting it answers 500 to denials under test — untested denial paths, repo-wide** | `backlog/TEMPLATE_MARKETPLACE.md` |
| TM-B2 | `operational` | A failed Railway build is invisible; `dev` failed for 2 days while serving stale code. Owner ruled: `Wait for CI` on for `production` only | `backlog/TEMPLATE_MARKETPLACE.md` |
| TM-B3 | `enhancement` | Login page renders API errors as `[object Object]`, so the commonest signup failure tells the user nothing | `backlog/TEMPLATE_MARKETPLACE.md` |
| TM-B4 | `needs-initiative` | User publishing (`POST /api/market/publish`) unbuilt — needs a data model, moderation, and a dev/test→prod visibility ruling | `backlog/TEMPLATE_MARKETPLACE.md` |
| TM-B5 | `product-decision` | Does the product want `usageCount`/`rating`/`isOfficial` at all? Removed in TM-4 because the curated catalog supplies none | `backlog/TEMPLATE_MARKETPLACE.md` |
| TM-B6 | `informational` | `workflow.json` stays the editable source of truth and is never itself installed; never add a second *install* path | `backlog/TEMPLATE_MARKETPLACE.md` |
| GH-O4 | `enhancement` | **⚠️ Precondition has fired.** `outputFileExists()` does a raw `fs.access`, bypassing the storage provider — was harmless "until O-3 happens", and O-3 closed 2026-08-04 with prod on S3 | `backlog/ROADMAP.md` |
| GH-O1 | `operational` | Production runs the `.env.example` placeholder `JWT_SECRET`/`SESSION_SECRET`. **Ruled deliberate by the repo owner — do not re-file as a finding** | `backlog/ROADMAP.md` |
| GH-O11 | `product-decision` | `/intake/preview` previews a hardcoded fake form, not the real branded runner — (a) re-point and delete the ~1,040-line `Themed*` stack, (b) delete the route, or (c) leave | `backlog/ROADMAP.md` |
| GH-O7 | `needs-initiative` | White-label can't be plan-gated until `subscriptions` can key on a user; gating today permanently denies every user-owned workflow. `tenants.plan` is vestigial — don't build on it | `backlog/ROADMAP.md` |
| GH-O8 | `product-decision` | No project-level branding; one tenant has many orgs, so where the tier sits is ambiguous | `backlog/ROADMAP.md` |
| GH-O10 | `enhancement` | Email, custom domains and the signature-transition screen are still unbranded — the remaining GH-158 criteria | `backlog/ROADMAP.md` |
| GH-O16 | `enhancement` | Two redirect paths, only one hardened — `FinalDocumentsSection` checks protocol only while `WorkflowRunner` uses `getSafeRedirectUrl` | `backlog/ROADMAP.md` |
| GH-O18 | `enhancement` | No test exercises a real AI provider call; every suite `vi.mock`s `createAIServiceFromEnv`, so a provider-side break is invisible | `backlog/ROADMAP.md` |
| GH-O19 | `enhancement` | Final Documents inspector's `draftConfig` never re-syncs, so a collaborator's concurrent edit is overwritten wholesale | `backlog/ROADMAP.md` |
| GH-O5 | `enhancement` | `pingClamd` misreads a `PONG\0` split across TCP segments as an unhealthy scanner | `backlog/ROADMAP.md` |
| GH-O15 | `informational` | `totalGenerated` counts output *files*, not documents — DOCX+PDF from one template reports 1 attempted, 2 generated | `backlog/ROADMAP.md` |
| GH-163..173 | `needs-initiative` | Six parked roadmap epics (blocks, kiosk, Easy Mode, mobile builder, OCR, legal drafting). **Not tickets — 5 of 6 cite files that don't exist.** GH-173 is substantially delivered by the LD and TM boards | `backlog/ROADMAP.md` |

---

## Sections above Pages (SECT) — [detail](backlog/SECTIONS_AND_PAGES.md) — retired 2026-08-24

**All 11 tickets shipped** (SECT-1..10, with 8A/8B) across five phase gates.
Phase 0 renamed the existing "section" concept to **page** across ~511 files;
Phases 1–4 then built **sections** as a real group layer above pages — authored
in the builder, carried through publish/export/import/diff, evaluated for
visibility, persisted as run reached-state, and navigable in the runner.

**The ten standing decisions D-1..D-10 are in the detail file and still bind
anything touching sections, pages or runner navigation.** The two most often
got wrong: **D-2** (a Section is a *contiguous span* over one flat `pages.order`
— there is no `sections.order`) and **D-6** (greyed ≠ hidden — a page excluded
by `visibleIf` is absent from the nav entirely, while visible-but-unreached is
greyed; conflating them is an information disclosure, not a cosmetic bug).

⚠️ **`SECT-B11` is the one worth promoting.** `--primary` is a complete
`hsl(...)` string, not the channel triple Tailwind's `/opacity` modifier
compiles against, so `bg-primary/10` and every sibling resolve to **transparent**.
**45 existing usages in `client/src`** are rendering nothing where a subtle fill
was intended. This is a live, repo-wide visual defect that the Sections work
merely surfaced — it is not a Sections issue and should not be promoted as one.

⚠️ **Do not hand-migrate a shared Neon branch.** A SECT-8B finding claimed the
`dev` branch needed manual migration for `0040`; `railway.json` runs
`npm run db:migrate` as a `preDeployCommand`, so every environment migrates on
its next deploy. A missing column on `dev` blocks *local* verification only.
Relatedly, a verification probe that imports `server/db` reads `.env` and writes
to the shared dev branch **even when the app under test points at a throwaway** —
SECT-9 leaked a tenant row that way.

## Environment split & tenant isolation (ENV / RLS) — [detail](backlog/ENVIRONMENTS_AND_RLS.md) — **partially** retired 2026-08-23

**⚠️ Still open: `RLS-4` for PRODUCTION**, on the live board at
[`ENVIRONMENTS_AND_RLS_TICKETS.md`](ENVIRONMENTS_AND_RLS_TICKETS.md). ENV-1..4 and
RLS-1, 2a–2f, 3, 5, 6, 7 all shipped. RLS enforcement is live on dev and test;
production still connects as `neondb_owner` (BYPASSRLS) and is 12 migrations
behind, so it is gated on a `test` → `main` promotion, not on RLS work.

The detail file's **Withdrawn findings** table is the important part: five claims
from earlier audits were disproved, and two of them ("branch protection is off",
"migration 0001 is broken") misled multiple passes before being caught.

- **RLS-B1 — the restricted integration suite is not deterministic** · `needs-initiative`.
  ~2 files per full run die in setup with `Registration failed`, different files each
  time. Three causes eliminated (async-context leak, session GUC, leaked transaction);
  same-connection instrumentation left in `auth.routes.ts` to catch the next occurrence.
  **This is why the RLS gate is advisory rather than a required check.**
- **`records`** — **not a separate entry.** Tracked as **`DV-B3`** (see the scan table
  above); this initiative only adds that it now carries an RLS policy. Recorded here so the
  next audit does not file it a third time — it has already been filed twice.
- **RLS-B3 — `DEBT-11` is superseded** · `wont-fix`. "RLS policies defined but not enforced"
  described exactly the state this initiative removed. Strike it from `backlog/TECH_DEBT.md`
  once production is cut over, or the next audit re-files it.
- **RLS-B4 — background workers are not requests** · `informational`, **delivered**. Predicted
  the failure and it happened; `server/utils/forEachTenant.ts` is the answer. Kept because the
  reasoning governs any new scheduled job and the failure mode is silent.
- **ENV-B1/B2 — `dev.`/`test.ezbuildr.com` do not resolve** · `operational`. DNS records were
  never created at the registrar. Owner decision 2026-08-15: leave. If ever activated,
  `BASE_URL`/`ALLOWED_ORIGIN` must move in the same change or OAuth and CORS break.
- **ENV-B3 — `/health` cannot tell you which environment you are on** · `informational`. All
  three run `NODE_ENV=production` and report `"environment": "production"`. Compare the host
  or the database instead.

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

## Template Marketplace (TM) — [detail](backlog/TEMPLATE_MARKETPLACE.md) — retired 2026-08-18

**5 of 5 tickets closed**, gate proven against deploy `cf12917f`: the deployed gallery returned
all three curated templates and `POST /api/templates/retainer-agreement/install` created a real
workflow in the caller's project. Parks six entries. Carries four settled decisions — curated
templates are **code-shipped, never database rows**; bundles are **generated at build time**
(a committed bundle rots as `migrationHead` moves); generated output lives in **`dist/`**,
never read from `templates/` at runtime; and **user publishing stays out of scope** with
`publishTemplate` still throwing behind a test.

**The two findings worth reading before similar work:**

- **TM-B1** (`needs-initiative`) — the integration harness omits the `errorHandler` that
  production registers, so **denial paths are untested repo-wide** for any route that does not
  call `classifyRouteError` itself. Security-shaped, not tidiness.
- **TM-B2** (`operational`) — a red Railway build is invisible; `dev` failed for two days while
  serving pre-TM-1 code, so the feature *looked* shipped. Owner ruled `Wait for CI` on for
  `production` only, and a deploy-status check is still worth building.

Its lesson for anyone adding a build step: **the gate criterion no test could satisfy is the
one that found the real bug.** All suites were green while the product was not shipping,
because `.dockerignore` excluded the generator from the build context.

## Legal drafting (LD) — [detail](backlog/LEGAL_DRAFTING.md) — retired 2026-08-18

**2 of 2 tickets closed**, gate fully satisfied — the repo owner opened a rendered curated
document on 2026-08-18, the one criterion neither dev nor reviewer could meet. Parks two
entries. Carries three settled rulings: **pronouns are explicit-only with a they/them
default and no inference path ever**, legal numbering is a **pure function of explicit
ordinals** (no hidden counter, so a skipped conditional section cannot renumber a contract),
and curated content lives at `templates/curated/<slug>/`.

⚠️ **The parent epic GH-173 is NOT closed by this board.** LD delivered the *authoring*; the
curated templates shipped **inert**, with no consumer in `server/` or `client/`. Delivery was
the TM board, which shipped and retired 2026-08-18 → `backlog/TEMPLATE_MARKETPLACE.md`.
**GH-173 is never getting flipped** — the Roadmap board retired first, leaving no file or
counter, and the owner ruled the item dropped. The epic stays parked as `needs-initiative`.

- **LD-O1 — no number-spelling filter** · `enhancement`. "2 additional attorneys" where
  convention wants "Two". A `spellNumber` primitive is the same pure-function shape as the
  existing ones; no grammar change.
- **LD-O2 — vestigial `/intake` rate-limiter registrations** · `informational`, P3.
  `server/index.ts:48` and `server/production.ts:56` still throttle a route tree O-12
  removed. The registration is harmless; the **security comment above it is misleading**,
  describing protection of a surface that does not exist. Distinct from `RM-2`, the same
  pipeline's other orphan.

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
