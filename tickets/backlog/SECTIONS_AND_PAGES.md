# Sections above Pages (SECT) — retired 2026-08-24

**All 11 tickets shipped** (SECT-1..10, with 8A/8B), across five phase gates.
The initiative renamed the existing "section" concept to **page** across ~511
files, then built **sections** as a genuine group layer above pages: authored in
the builder, carried through publish/export/import/diff, evaluated for
visibility, persisted as run reached-state, and navigable in the runner.

Recover any closed ticket's Finding, acceptance criteria and dated verification
notes with:

```bash
git log -p -- tickets/SECTIONS_AND_PAGES_TICKETS.md
```

That command keeps working after the file's deletion; it is the recovery path
for everything summarised here.

---

## Standing decisions (D-1..D-10)

Settled by the repo owner 2026-08-18 and **still binding** on anything that
touches sections, pages or runner navigation. Re-litigating one is an automatic
send-back.

| # | Decision |
|---|---|
| **D-1** | **Rename first.** `sections` → `pages` lands as Phase 0, before any feature work. The new group layer is then called `sections` in **both** code and UI, so the two vocabularies match permanently. The alternative (build as `chapters`, live with a split vocabulary) was measured at ~511 files either way and rejected — the rename is the same size whenever it happens, and doing it first means the feature is never written in the wrong words. |
| **D-2** | **One flat page order; a Section is a contiguous span over it.** `pages.order` stays the single source of truth for run order. A Section is a label over a contiguous run of it, and its position is derived from its first page. There is no `sections.order` column or Section-reorder endpoint: reordering a Section moves its page span through the atomic page-reorder endpoint. Nothing that consumes run order today (`skip_to`, the reorder warning, the workflow map, the simulator) learns a composite sort. |
| **D-3** | **A page does not need a Section.** `pages.section_id` is nullable. An ungrouped page can sit anywhere in the order — before, between, or after Sections. It renders at the top level of the outline and the runner nav. |
| **D-4** | **Runner nav: jump back freely, forward only to reached pages.** Unreached pages and Sections are **shown but greyed out and non-interactive** — not hidden. The respondent can see the whole shape of the interview; they just cannot skip ahead. This preserves the existing validate-then-advance contract, where forward movement runs server-side submit + `skip_to` resolution that decides the real next page. |
| **D-5** | **Sections carry their own `visible_if` in v1.** Precedence is explicit and one-directional: **a hidden Section hides every page inside it, regardless of that page's own `visibleIf`.** A visible Section does not override a page's own `visibleIf`. |
| **D-6** | **Greyed ≠ hidden.** A page excluded by `visibleIf` is not part of this run and does not appear in the nav at all. A page that is *visible but not yet reached* appears greyed. Conflating these is the most likely way SECT-8B gets sent back. |
| **D-7** | **Deleting a Section unassigns its pages; it never deletes them.** Pages keep their order and become ungrouped. Sections are **hard**-deleted — the soft-delete on `pages`/`steps` exists to protect cascaded `step_values` (ICW2-B1), and a Section holds no respondent answers, so copying that pattern here would be cargo-culting. |
| **D-8** | **Logic *rules* cannot target a Section in v1.** `logic_rules.targetType` stays `page`/`step`. Section-level show/hide is expressed through `sections.visible_if` only. Extending the rule engine is backlog SECT-B2. |
| **D-9** | **Sections are never empty.** Creating a Section assigns at least one page in the same transaction. A reorder that would remove a Section's last page is rejected unless the request explicitly names that Section for deletion; the UI obtains confirmation before retrying with that authorization. On confirmation the Section is hard-deleted and the moved page completes its requested move. This keeps the invariant enforceable for API clients and concurrent edits, not merely as UI etiquette. |
| **D-10** | **Visibility lint is conservative, not a theorem prover.** V1 does not attempt to prove whether an arbitrary condition can ever be true. A Section may reference answers only from pages strictly before its first page; self/later dependencies and script conditions (whose dependencies are opaque) are publish-blocking. Existing structural, dangling-reference and cycle lints also apply. A `skip_to` page inside any conditionally visible Section is publish-blocking; authors must target an unconditional Section or remove the Section condition. These rules may reject a logically safe advanced case, but cannot approve a Section the respondent cannot reveal or a jump that strands the run. Smarter implication/script dependency analysis is future work. |

---

## Parked entries

## SECT-B1 — Review screen grouped by Section · `enhancement`

`ReviewSection.tsx` lists
  every answer flat. Once Sections exist, grouping the review by Section is the
  obvious follow-on, and it is where a respondent checking a 100-page petition
  actually spends their time. Deliberately out of Phase 4 to keep SECT-8B/9
  reviewable.

**Next step:** Ticket it against `ReviewSection.tsx`; the grouping data it needs already ships in the runtime payload.

## SECT-B2 — `logic_rules` targeting a Section · `product-decision`

D-8 restricts v1 to
  `sections.visible_if`. Extending `logic_rules.targetType` to `section` would
  let a rule show/hide/skip-to a whole Section. Needs a decision on what
  `skip_to` a Section means (its first visible page, presumably) and a
  `conditionalActionEnum`/enum migration.

**Next step:** The repo owner rules on what `skip_to` a Section means (presumably its first visible page). Blocked on that, not on code.

## SECT-B3 — Workflow map draws Section containers · `needs-initiative`

`MapTab` renders page
  nodes with no grouping. React Flow supports parent nodes; grouping the map by
  Section would make a 100-page map readable. Check `mapLayout.ts` — the
  existing layout algorithm may need real work, so size it before promoting.

**Next step:** Size `mapLayout.ts` first — the ticket warns the existing layout algorithm may need real work before React Flow parent nodes are viable.

## SECT-B4 — AI generation emits Sections · `enhancement`

`shared/types/ai.ts`'s
  `AIGeneratedSectionSchema` produces a flat page list. An AI-generated
  100-page interview arriving ungrouped undercuts the feature for exactly the
  workflows that need it most. Needs prompt work in `AIPromptBuilder` plus
  schema changes, and should follow real usage of Phase 2 so the AI groups the
  way authors actually do.

**Next step:** Now unblocked: Phase 2 shipped, so real authoring usage exists to model the prompt on.

## SECT-B5 — Marketplace/blueprint templates ship with Sections · `enhancement`

The curated
  catalog (TM-1/TM-2) generates bundles at build time. Once SECT-4 lands, the
  curated templates should be re-authored with Sections — otherwise the
  showcase content demonstrates the flat model.

**Next step:** Now unblocked: SECT-4 landed, so bundles can carry Sections. Re-author the curated catalog.

## SECT-B6 — Per-Section progress in the runner header · `enhancement`

The header shows
  `Step N of M` over the whole workflow. With Sections, "Page 3 of 11 in Assets"
  is a better signal. Left out of SECT-8B to keep that ticket's scope on the rail
  itself.

**Next step:** Straightforward against the shipped rail, which already computes per-Section reached/visible counts.

## SECT-B7 — `PreviewRouter` is a dead visibility stub · `wont-fix`

`client/src/lib/previewRunner/PreviewRouter.ts`'s `isPageVisible()` is a
  `return true` placeholder with commented-out example logic, so it ignores both
  page and Section `visibleIf`. It is reachable only from `AutoTestRunner`,
  which nothing instantiates — so this is dead code, not a live defect, and
  SECT-1 merely renamed through it. Delete both, or wire `PreviewRouter` to
  `computeVisibility` if the auto-test runner is ever revived. Found during the
  SECT-1..7 retrospective, 2026-08-24.

**Next step:** Delete `PreviewRouter` and `AutoTestRunner` together, or wire the router to `computeVisibility` if the auto-test runner is ever revived. Not a live defect either way.

## SECT-B8 — Cross-tenant concealment is asymmetric on the Section routes · `product-decision`

`SectionService.createSection` deliberately converts a foreign-tenant
  "Access denied" into "Workflow not found" (404), but `updateSection` and
  `deleteSection` do not — they surface 403, which confirms the Section exists.
  This matches `PageService`, which conceals nowhere, so the inconsistency is
  repo-wide and pre-dates this board rather than being a SECT-3 regression.
  Settle it as one ruling across the builder-authoring routes, most naturally
  inside the RLS initiative's boundary work, not here.

**Next step:** Belongs to the RLS initiative's boundary work: one ruling on whether builder-authoring routes conceal cross-tenant as 404 or answer 403, applied repo-wide.

## SECT-B9 — `updateProgress` is now an RLS throw-point on the anonymous path · `informational`

SECT-8A converted `RunStateService.updateProgress` to `withCurrentTenant`,
  which is the correct post-RLS pattern — but it is reachable from
  `createAnonymousRun`, whose public-link route is unauthenticated and therefore
  has no ambient tenant. Today that only logs the "running unscoped" warning;
  under `RLS_ENFORCED=true` it will throw. The whole anonymous path is already
  unscoped (`runRepo.create` included), so this is one more instance of what
  RLS-5 exists to sweep, not a new hole — but RLS-5 should know it is there.

**Next step:** No action. RLS-5 sweeps every unscoped path; this is recorded so it is not rediscovered as a SECT-8A defect.

## SECT-B10 — `optionalHybridAuth` is still missing on several run routes · `enhancement`

SECT-8A restored it ahead of `creatorOrRunTokenAuth` on `POST
  /api/runs/:runId/next`, matching `runtime`, `submit`, `values` and
  `values/bulk`. Still unconverted: `GET /api/runs/:runId`, `GET
  /api/runs/:runId/values`, `PUT /api/runs/:runId/complete`, the two
  `documents` routes and `POST /api/runs/:runId/share`. On those, a foreign
  tenant's JWT is still misread as a run token instead of reaching the
  service's concealed-404 boundary. Deliberately left out of SECT-8A's scope,
  which was the `next` path only.

**Next step:** Add `optionalHybridAuth` ahead of `creatorOrRunTokenAuth` on the six named routes, mirroring what SECT-8A did for `next`. Small and mechanical.

## SECT-B11 — `/opacity` modifiers on `--primary` are silently dead repo-wide · `needs-initiative`

`--primary` is defined as a complete `hsl(...)` string rather than the channel
  triple Tailwind's `/opacity` modifier compiles against, so `bg-primary/10`
  and friends resolve to transparent instead of a 10% tint. Found while
  building the SECT-8B rail (which uses the solid `accent` token instead);
  **45 existing usages in `client/src` are affected** and are currently
  rendering nothing where a subtle fill was intended. The fix is a token
  change (`--primary` → channel triple, plus `hsl(var(--primary))` at every
  consumption site), which is a repo-wide styling change and needs its own
  ticket rather than riding along with a feature.

**Next step:** Change `--primary` to a channel triple and wrap every consumption site in `hsl(var(--primary))`. 45 affected usages — repo-wide styling change, needs its own ticket and a visual pass.

## SECT-B12 — `setCurrentPageIndex` on `LoadedRunnerScreenProps` is dead · `enhancement`

No screen consumes the prop, and it predates SECT-9 (the dev flagged it and
  correctly left it alone rather than widening scope). Three test mocks still
  declare it, which is exactly how dead props survive — the same shape as the
  `RunPersistenceWriter.updateRun` orphan removed during the SECT-8A review.
  Removing it means touching those mocks, so it wants its own small change.

**Next step:** Remove the prop and the three test mocks that declare it.

## SECT-B13 — Stale probe rows in the shared `dev` Neon branch · `operational`

Three `tenants` rows named "TM Gate Probe Tenant"/"TM Install Probe Tenant"
  (2026-08-18, from the Template Marketplace work) and two probe users are still
  sitting in the dev database. Harmless but untidy, and they are the residue of
  the same failure mode SECT-9 hit and cleaned: a verification probe writing to
  the shared branch. Deleting rows from a shared database is the repo owner's
  call, so they were left in place. Pairs with the `verify`-skill note recorded
  in SECT-9.

**Next step:** The repo owner deletes the five stale rows, or leaves them. No code.

## SECT-B14 — Dead links in two closed security audit records · `product-decision`

`docs/security/SECURITY_BACKLOG.md` (16) and
  `docs/security/PROACTIVE_HARDENING_TICKETS.md` (5–6) cite migration filenames
  and service paths that the migration baseline compaction and later renames
  removed. Both files are dated, self-labelled **CLOSED** point-in-time records,
  so repointing the links would misrepresent what was true when the audit ran.
  The options are to convert the citations to `git log -p -- <path>` form (as
  retired ticket files already do), to mark the sections as historical, or to
  leave them. Needs a small decision, not a sweep.

**Next step:** Decide between converting the citations to `git log -p -- <path>` form, marking the sections historical, or leaving them. Small decision, not a sweep.

## SECT-B15 — ~26 documents still say "VaultLogic"/"Vault-Logic" · `enhancement`

Surfaced during SECT-10 and correctly *not* fixed there: it is a repo-wide
  rebrand sweep, not vocabulary drift from this initiative, and chasing it would
  have been exactly the scope expansion that ticket warned against. Includes
  `docs/api/API.md` and `docs/api/TRANSFORM_BLOCKS.md`, both linked from
  CLAUDE.md's Documentation Index, so it is reader-facing. Mechanical and safe
  — a good small ticket.

**Next step:** Mechanical find-and-replace across ~26 documents, two of which are linked from CLAUDE.md's Documentation Index.

---

## Closed — do not re-file

| Ticket | What shipped | Commit |
|---|---|---|
| SECT-1 | Renamed `sections` → `pages` in TypeScript, API paths and JSON contracts (~511 files), DB names still pinned via Drizzle | `a87e8786`, `36c86f38` |
| SECT-2 | Physical DDL rename of the table and drop of the name pins | `f2ff9c1c` |
| **Phase 0 gate** | Vocabulary migration proven green | `706b54f8` |
| SECT-3 | `sections` table, nullable `pages.section_id`, contiguous-span invariant, CRUD routes (migration `0039`) | `d52af401` |
| SECT-4 | Sections travel through publish, run runtime, export/import and diff | `1c6f85ca` |
| **Phase 1 gate** | Sections persist end to end | `a7fae7d5` |
| SECT-5 | Document Outline nests pages under Sections | `1728480d` |
| SECT-6 | Drag pages into and out of Sections; reorder by span | `c203046b` |
| **Phase 2 gate** | Builder authoring proven | `137b33e5` |
| SECT-7 | `sections.visible_if` evaluated; a hidden Section hides its pages (D-5) | `1ee0ffa7` |
| **Phase 3 gate** | Section visibility live-verified (folded into the SECT-7 commit) | `1ee0ffa7` |
| SECT-8A | `workflow_runs.visited_page_ids` insertion-ordered reached set (migration `0040`) | `5a916395` |
| SECT-8B | Persistent runner Section nav rail, read-only, three states | `a65f750f` |
| SECT-9 | Click-to-navigate to reached pages, guarded in `useRunNavigation` | `14c4aa5d` |
| **Phase 4 gate** | Reached state + rail + navigation live-verified together | `78e5f7a8` |
| SECT-10 | Documentation aligned with shipped product; 16 documents corrected | `0b175796` |

### Withdrawn during review — do not re-file as findings

| Finding | Why it was wrong |
|---|---|
| "The `dev` Neon branch must be hand-migrated for `0040`" | Reported by the SECT-8B dev. The missing column was real, but `railway.json` runs `npm run db:migrate` as a `preDeployCommand`, so every environment migrates on its next deploy. The only real consequence was that *local* verification pointed at the dev branch could not create runs. Never hand-migrate a shared branch to unblock yourself. |
| "`PreviewRouter.isPageVisible` ignores Section visibility" | True but inert — `PreviewRouter` is reachable only from `AutoTestRunner`, which nothing instantiates. Dead code, not a live defect. Recorded as `SECT-B7`. |
| "Cross-tenant concealment is missing on Section update/delete" | Real inconsistency, but `PageService` conceals nowhere either, so it is a repo-wide posture question that pre-dates this board, not a SECT-3 regression. Recorded as `SECT-B8`. |

### Cross-reference correction

`backlog/WORKFLOW_MAP.md` D-5 describes backward navigation as "a runner feature
(`ReviewSection`'s Edit buttons)". As of SECT-9 that is generalised: both the
Review edit jump and the Section rail run through `jumpToPage` in
`useRunNavigation`. D-5's actual ruling — that a backward `skip_to` **rule**
stays publish-blocking — is unchanged and was deliberately not touched.

### Process lessons

- **Dead code hides behind test mocks.** `RunPersistenceWriter.updateRun` lost
  its only production caller in SECT-8A and survived review only because two
  test files still mocked it — one of which mocked the *deleted* method and not
  its replacement. Grep for production callers, not for references.
- **A verification probe does not inherit the server's `DATABASE_URL`.** A probe
  importing `server/db` reads `.env` and writes to the shared dev branch even
  when the app under test points at a throwaway. SECT-9 leaked a tenant row this
  way; the Phase 4 gate fixture guarded against it by refusing to start unless
  its own `DATABASE_URL` was localhost.
- **An absence assertion needs a falsifiability proof.** "The excluded page is
  not in the DOM" passes trivially against a fixture that never contained it.
  SECT-8B's AC4 required the same fixture to render the page with the exclusion
  lifted, which is what made the test worth having.

