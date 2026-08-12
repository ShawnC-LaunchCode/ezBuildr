# GH-171 Follow-up — Template Versioning & Impact Analysis

**Status:** handoff to a new senior reviewer · **Written:** 2026-08-11
**Parent ticket:** GH-171 in `tickets/ROADMAP_TICKETS.md` (still 🔲 — do **not** mark it ✅ yet)
**Ticket prefix:** `G171-1..5`

---

## ✅ RESOLVED — the work is committed and merged to `main`

All GH-171 implementation is on **`main`**. Base your work on `main`; there is no
branch or worktree to hunt for.

```
3ac6747d  wip(templates): preserve GH-171 work (G171-0)   21 files, +1083/-117
24491c3e  merge(gh-171): land template version pinning and impact analysis
```

The `gh-171` branch and its worktree were **deleted after the merge** — they were
redundant, and a stale side branch is how devs end up building against code that
is not on `main`. Both commits remain reachable from `main`.

Verified on merged `main`, by the reviewer rather than from a turn-in report:
`tsc --noEmit` 0 errors, `test:fast` **3039 passed**. (One run showed a single
failure in `tests/unit/external/ExternalSendRunner.test.ts` — a 5s timeout in an
unrelated file that passes 3/3 in 560ms in isolation. That is this repo's known
order-dependent flake, not a regression. Re-verify in isolation before blaming
your own change.)

**`main` is unpushed.** GH-171 stays 🔲 because AC3 is unmet — the merge preserved
the work and unblocked dispatch; it is not a claim the ticket passed review.

Tear the worktree down **only** with `pwsh scripts/new-worktree.ps1 -Name gh-171 -Remove`,
never a bare `git worktree remove` (CLAUDE.md explains why).

---

## How to work this document

- Read the **State of play** below, then your ticket only.
- Line numbers are advisory; the **quoted code + symbol name** is the locator. Grep for the quote.
- Load the project skills named in each ticket's **Ties** before touching code.
- Devs do not commit or stage. The reviewer commits, one commit per passed ticket.
- **`npm run test:fast` is not a sufficient gate for this initiative** — it is the
  no-DB project and cannot cover the routes and services this work touches.
  Run `npm run test:integration` too. This was skipped three times in a row.
- Clear the shared type-check cache before trusting `tsc`:
  `rm -f node_modules/typescript/tsbuildinfo`. Worktrees share one `tsbuildinfo`
  and it reports **false greens** as readily as stale errors. A round-2 turn-in
  reported "type-check: 0 errors" on a tree that had a real `TS2322`.

---

## State of play

GH-171 went through three review rounds. Two failed, the third passed on its
scope. The security half is **done and independently proven**; the analysis half
has one unmet acceptance criterion.

### ✅ Verified complete (reviewer re-ran every gate; do not redo)

| Item | Evidence |
|---|---|
| Pin reaches document generation | `createProjectTemplateResolver` in `server/services/document/FinalBlockRenderer.ts`; both call sites use it |
| Pinned lookup is tenant-safe | `getVersionForTemplate(templateId, versionId)` filters on **both** columns |
| `getVersionById` (unscoped) removed | zero references repo-wide |
| Project check is unconditional | resolver resolves the project-scoped template **before** the pin branch |
| Duplicate `GET /templates/:id/versions` removed | registrations back to 2 (baseline) |
| Dead schema reverted | migration `0024` deleted; `workflow_templates.pinned_version_id` gone |
| `documentEngine.test.ts` restored | 250 lines / 17 tests intact (a dev had deleted it; reviewer restored) |
| Rebased | 0 commits behind `main` |
| `tsc --noEmit` | **exit 0** (run with `tsbuildinfo` cleared) |
| `npm run test:fast` | **270 files, 3039 passed, 14 skipped, 0 failed** (deterministic over 2 runs) |
| Security tests are **not vacuous** | reviewer removed the `templateId` condition → both tests failed `expected 200 to be 404`; restored byte-identical (`diff` = IDENTICAL) |

### Acceptance criteria status (GH-171's four ACs)

| AC | Status |
|---|---|
| 1. Uploads create immutable versions with notes + timestamps | ✅ wired on POST and PATCH |
| 2. Dependency analyzer lists workflows referencing a template | ✅ reads section-config JSON |
| 3. Impact warning highlights added, removed, **or renamed** placeholders | ❌ **renamed not implemented** → [G171-1](#g171-1--implement-renamed-placeholder-detection-ac3) |
| 4. Workflows can pin to a version or follow latest | ✅ works end to end |

### ⚠️ Do not re-derive these — they cost real time to establish

1. **The 10 integration failures are pre-existing on `main`, not GH-171's doing.**
   Verified by running the same files on the clean main checkout — identical
   failures. See [G171-5](#g171-5--stale-known-failure-doc--10-undocumented-integration-failures-on-main); it is **independent of GH-171**.
2. **The preview route was never vulnerable.** `previewGenerateSchema` stripped
   `pinnedVersionId` (Zod drops unknown keys), so no pin ever reached the
   resolver there. The dev **added** that field, creating the vector, then
   secured it. The genuinely exploitable path was `RunLifecycleService`, where
   the pin comes from stored section config — see [G171-2](#g171-2--test-the-real-run-pin-path).
3. **Two turn-ins reported green gates that were not green.** Verify gates
   yourself; do not accept pasted output.

---

## Decision made by the repo owner (2026-08-11) — KEEP the preview pin

**Preview accepting a client-supplied pin was a scope expansion; it is confirmed
wanted and stays.** GH-171 as written says nothing about the preview endpoint,
and the implementation added `pinnedVersionId` to `previewGenerateSchema`.

Rationale, so nobody re-opens this: the preview payload *is* the unsaved builder
draft, so the pin can only come from the client. If preview ignored the pin, it
would render the latest version while the real run renders the pinned one — a
silent preview/run divergence, invisible in the builder and discovered when a
client receives the wrong document. Reverting the schema line would introduce
that bug, not remove a risk.

It is safe because resolution is scoped by two independent ownership hops, not
one — verified by reading the code, not the turn-in:

1. `createProjectTemplateResolver` → `documentTemplateRepository.findByIdAndProjectId(documentId, workflow.projectId)`
2. `templateVersionService.getVersionForTemplate(template.id, pinnedVersionId)`, whose
   `where` is `and(eq(id, versionId), eq(templateId, templateId))`

**Do not revert `pinnedVersionId` from `previewGenerateSchema`.** The residual
concern is coverage, not the feature, and it is folded into G171-2 AC6.

---

## G171-0 — Preserve the uncommitted work ✅ DONE 2026-08-11

**Priority: P0** · Size: S · Files: none (git only)
**Closed by:** commit `3ac6747d`, merged to `main` as `24491c3e` (both unpushed).
All 21 paths were staged individually by path, nothing else swept in, working tree
left clean. Pre-commit gates ESLint / `tsc` / strict-zones all passed. Nothing
below needs doing — kept for the record.

### Finding
Three rounds of GH-171 work exist only as uncommitted changes in
`.claude/worktrees/gh-171`. There is no commit, no branch snapshot, no stash.
A worktree removal, a `git checkout`, or a disk mishap loses all of it.

### Preferred fix
Commit the verified work to the `gh-171` branch as one commit. Stage **only**
GH-171's files by path — never `git add -A`; the repo owner works this repo from
a second IDE and unrelated changes are commonly present.

The 21 dirty paths are (17 modified, 4 untracked):

```
client/src/components/builder/final/FinalDocumentsSectionEditor.tsx
client/src/components/builder/tabs/TemplatesTab.tsx
client/src/components/builder/tabs/templates/TemplateCard.tsx
client/src/components/builder/tabs/templates/TemplateUpdateDialog.tsx   (new)
server/api/validators/templates.ts
server/routes/finalBlock.routes.ts
server/routes/templateAnalysis.routes.ts
server/routes/templates.routes.ts
server/routes/workflowTemplates.routes.ts
server/services/TemplateAnalysisService.ts
server/services/TemplateVersionService.ts
server/services/document/FinalBlockRenderer.ts
server/services/workflow-runs/RunLifecycleService.ts
shared/finalDocumentsTemplates.ts
shared/types/stepConfigs.ts
shared/validation/stepConfigSchemas.ts
tests/unit/services/FinalBlockRenderer.test.ts
tests/unit/shared/finalDocumentsTemplates.test.ts
tests/unit/client/TemplateVersionSelector.test.tsx                      (new)
tests/unit/services/TemplateAnalysisService.impact.test.ts              (new)
tests/integration/finalBlock.pinSecurity.test.ts                        (new)
```

### Ties
CLAUDE.md "Parallel work: use git worktrees"; memory note *parallel-IDE git coordination*.

### Acceptance Criteria
1. All 21 paths committed to branch `gh-171`, message referencing GH-171.
2. `git status` in the worktree is clean afterwards.
3. Nothing outside that list is staged or committed.
4. **Do not push** without the repo owner's explicit go-ahead.
5. Re-confirm gates on the committed tree: `tsc` exit 0 (clear `tsbuildinfo` first), `test:fast` ≥ 3039 passed / 0 failed.

---

## G171-1 — Implement renamed-placeholder detection (AC3) ✅ DONE 2026-08-11

**Closed by:** `6f28b585`, merged to `main` as `36cd2fa7` (unpushed). **This closed
GH-171's last unmet AC, so GH-171 is now ✅ in `tickets/ROADMAP_TICKETS.md`.**

**Reviewer verification** (all gates re-run, none accepted from the turn-in):
`type-check` 0 errors · `lint` 0 problems · `test:fast` **3043 passed / 0 failed**
(baseline 3039 + 4), 271 files + 1 skipped · `test:integration` **exactly** the
documented baseline — 4 files / 10 tests failed, 108 files / 1093 tests passed.
All 7 ACs met.

**Notes for whoever touches this next:**
- It *deleted* a pre-existing second rename heuristic (`findRenames`, used only by
  `analyzeTemplateUpdate` and never surfaced by `compareTemplates`). One heuristic
  in one place now — do not reintroduce a local one.
- `requiresReview` now also trips on renames. No AC asked for this; it is correct
  and was kept, because a rename previously passed review silently while breaking
  every workflow piping to the old alias. It changes when users see the prompt.
- The AC2 example (`client_name` → `customer_name`) scores **exactly** the
  threshold (1/3), so it passes on float equality at the boundary. The
  threshold-boundary test guards it, but retune the constant with care.
- The route needed no change: it already forwards the whole comparison object.

**Priority: P1** · Size: M · Files: `server/services/TemplateAnalysisService.ts`, `server/routes/templateAnalysis.routes.ts`, `client/src/components/builder/tabs/templates/TemplateUpdateDialog.tsx`

### Finding
GH-171 AC3 requires the impact warning to highlight *"added, removed, **or
renamed**"* placeholders. Only add/remove/unchanged is implemented.
`compareTemplates` in `server/services/TemplateAnalysisService.ts` returns:

```ts
comparison: { added: string[]; removed: string[]; unchanged: string[] };
```

There is no rename detection anywhere in the file — a renamed placeholder
appears as one entry in `added` and an unrelated entry in `removed`, so the
author sees two unrelated changes instead of one rename. This is the **only
unmet acceptance criterion on GH-171.**

### Preferred fix
Derive renames from the existing `added`/`removed` sets rather than adding a
second scan — the scan is the expensive part and it already runs.

Pair a removed placeholder with an added one by string similarity
(Levenshtein or a token-overlap ratio), require a confidence floor so unrelated
names are not paired, and pull matched entries **out** of `added`/`removed` into
a new `renamed: Array<{ from: string; to: string }>`. Keep `added`/`removed`
meaning what they mean today for everything unmatched, so existing consumers do
not change behavior.

A suggestion-matching helper may already exist for the template-validation
"did you mean" path (`useTemplateValidation` / `templatePlaceholders` produce
`suggestions`) — reuse it rather than writing a second similarity function.
Check `server/services/templatePlaceholders.ts` first.

Surface `renamed` in `TemplateUpdateDialog.tsx` as its own group ("2 renamed"),
distinct from added/removed.

### Ties
- `add-api-endpoint` skill (route/service layering, error contract).
- `run-tests` skill.
- Depends on nothing; can run in parallel with G171-2 and G171-3.
- **File footprint collides with G171-4** (both touch `TemplateAnalysisService.ts`) — sequence those two.

### Acceptance Criteria
1. `compareTemplates` (or its caller) returns `renamed: Array<{ from, to }>`.
2. A placeholder renamed `{{client_name}}` → `{{customer_name}}` appears **once** in `renamed`, and in neither `added` nor `removed`.
3. Genuinely unrelated add+remove pairs stay in `added`/`removed` — proven by a test with two dissimilar names.
4. The confidence threshold is a named constant with a comment, not a magic number inline.
5. `TemplateUpdateDialog` renders renames as their own group.
6. New unit tests cover 2, 3, and the threshold boundary.
7. `tsc` exit 0 (clear `tsbuildinfo`), `npm run lint` 0 errors/0 warnings, `test:fast` ≥ 3039 passed / 0 failed, **`npm run test:integration` run and its output pasted** (10 pre-existing failures are expected — see G171-5; any *new* failure is yours).

---

## G171-2 — Test the real-run pin path ✅ DONE 2026-08-11

**Closed by:** `9b9e4bc2`, merged to `main` as `a986b2ed` (unpushed). All 6 ACs met,
including the AC6 parity criterion added after this ticket was first written.

**Reviewer verification** (gates re-run, and the probe re-done by the reviewer rather
than accepted from the turn-in): `type-check` 0 errors · `lint` 0 problems · this file
**5/5** · `test:integration` at exactly the documented baseline — 4 files / 10 tests
failed, **1096 passed** (1093 + these 3), no new failures.

**Non-vacuity, re-proven independently:** dropping `eq(templateVersions.templateId,
templateId)` from `getVersionForTemplate` fails **4 of 5** tests (the dev reported 2).
Both new real-run tests fail with `expected 'done' to match /^failed:/` — generation
completed and rendered the foreign template. The mutation was confirmed present in the
file *before* the run, so the probe proves something; the file was restored
byte-identical after.

⚠️ **Do not mistake AC6 for a security test.** The parity test **still passes** under
the vulnerable lookup, because an unscoped lookup hands the same wrong row to both
preview and the run. AC6 guards preview/run *divergence*; ACs 1–3 guard authorization.

**Priority: P1** · Size: S · Files: `tests/integration/` (new or extend `finalBlock.pinSecurity.test.ts`)

### Finding
The cross-tenant pin vulnerability is **fixed**, but the two tests that prove it
(`tests/integration/finalBlock.pinSecurity.test.ts`) both drive the *preview*
endpoint:

```ts
.post(`/api/workflows/${workflowA.id}/preview/generate-final`)
```

Preview was never the vulnerable path — `previewGenerateSchema` stripped
`pinnedVersionId` until this change added it. The path that was genuinely
exploitable is a **real run completing**, where documents come from stored
section config (`FinalBlockConfigSchema` has always permitted `pinnedVersionId`)
and flow through `RunLifecycleService.createProjectTemplateResolver`.

That path shares the fixed resolver, so it *is* fixed — but it has no test, and
a future refactor could reintroduce the unscoped lookup there without any test
failing.

### Preferred fix
Add one integration test that completes a real run whose section config pins a
foreign-tenant `template_versions.id`, and assert generation fails rather than
rendering the foreign template. Mirror the existing fixtures in
`finalBlock.pinSecurity.test.ts` (two tenants via `setupIntegrationTest`,
`TestFactory`, a real DOCX built with `PizZip`).

**Prove the test is not vacuous**, exactly as the reviewer did for the preview
tests: temporarily drop `eq(templateVersions.templateId, templateId)` from
`getVersionForTemplate`, confirm the new test fails, restore, confirm it passes.
Paste both outputs.

### Ties
- `run-tests` skill (integration idioms: `setupIntegrationTest`, `TestFactory`, `createAuthenticatedAgent`).
- Same fixture file as the existing security tests; **no collision** with G171-1/G171-3/G171-4.
- Do **not** run DB-backed suites concurrently with another agent — schemas are per-worker, not per-process.

### Acceptance Criteria
1. A new integration test drives run completion (not preview) with a pinned foreign-tenant version.
2. It asserts the run does not render the foreign template.
3. A same-project-wrong-template pin is also covered on this path.
4. Failing-then-passing evidence pasted, per the probe above.
5. The test cleans up any files it writes (see G171-4 item 3).
6. **Preview/run parity.** One test asserts that the *same* valid pin, supplied
   to preview and to a real run, resolves to the **same** `template_versions`
   row. This is the coverage the kept preview-pin scope expansion needs (see the
   decision section above): the feature's whole justification is that preview
   shows what the run will produce, and nothing currently proves the two paths
   agree. A pin that preview honors and the run ignores — or vice versa — must
   fail this test.
6. `test:integration` run; no new failures beyond the 10 pre-existing.

---

## G171-3 — Account for the 2 missing unit tests

**Priority: P2** · Size: S · Files: investigation only; fix depends on findings

**Investigation result (2026-08-11): legitimate baseline correction; no coverage
hole.** Vitest collection JSON at clean parent `713045dc` contains **3036 tests
across 268 files**; the preserved GH-171 commit `3ac6747d` contains **3039 tests
across 270 files**. The complete per-file delta is
`TemplateVersionSelector.test.tsx` 0→1 and
`TemplateAnalysisService.impact.test.ts` 0→2. None of the source-scanned or
dynamically registered suites shrank. Therefore no suites account for a −2:
the reported 3041 run was from transient/uncommitted tree state rather than the
clean committed parent used for the comparison. Current `main` independently
confirms the corrected arithmetic at 3046 (3039 + four G171-1 tests + three
SCRIPT-2 tests). No production or test fix is warranted.

### Finding
`npm run test:fast` on the worktree reports **3039 passed**. The reviewer's own
verified baseline on the same tree, taken immediately after restoring
`documentEngine.test.ts` and before the security work, was **3041 passed**.
Both numbers are deterministic (3039 reproduced over two consecutive runs) and
both runs are fully green with an identical file count (270 passed / 1 skipped).

Ruled out already — do not redo:
- No test file was deleted (`git status` shows no deletions).
- Every modified test file has the same test count as `HEAD`:
  `FinalBlockRenderer.test.ts` 5→5, `finalDocumentsTemplates.test.ts` 6→6,
  `documentEngine.test.ts` 17→17.
- The two new unit test files still register 1 and 2 tests respectively.
- Skipped count is unchanged at 14, so nothing was `.skip`ped.

The implementing session's stated cause — *"cleaned up old tests asserting
against `createTemplateResolver`"* — is **contradicted by the diff**: the
`FinalBlockRenderer.test.ts` change adds a `getLocalPath` mock and a trailing
newline and removes nothing.

Leading hypothesis: a dynamically-registered suite (`it.each`) whose input set
shrank. Candidates that generate tests from scanned source:
`tests/unit/services/lifecycleHookPhaseCoverage.test.ts`,
`tests/unit/portability/schemaCoverage.test.ts`,
`tests/unit/portability/exportService.test.ts`,
`tests/unit/client/store.deadSetters.test.ts`,
`tests/unit/client/colorContrast.test.ts`.

### Preferred fix
Get per-file counts and diff them against the same run on `main`:

```bash
npx vitest run --project unit-fast --reporter=json --outputFile=/tmp/wt.json
# then the same in the clean main checkout → /tmp/main.json, and compare per-file totals
```

Two tests vanishing silently is only cosmetic **if** the cause is a coverage
generator whose input legitimately shrank. If instead a generator stopped seeing
a file it should still see, that is a real coverage hole and needs a fix.

### Ties
- `run-tests` skill.
- Investigation only — **no file collision** with any other ticket.
- Note: `schemaCoverage`/`exportService` scan the schema, and GH-171 removed
  `workflow_templates.pinned_version_id` — a plausible link worth checking first.

### Acceptance Criteria
1. The exact suite(s) accounting for the −2 are identified by name.
2. A one-paragraph written finding: legitimate shrink, or a coverage hole.
3. If a coverage hole: fixed, with the count restored to ≥ 3041.
4. If legitimate: recorded here so the next reviewer does not re-investigate.

---

## G171-4 — Cleanups carried over from review

**Priority: P2** · Size: S · Files: `server/routes/templates.routes.ts`, `server/services/TemplateAnalysisService.ts`, `tests/integration/finalBlock.pinSecurity.test.ts`, `tests/integration/publish-document-readiness.test.ts`

### Finding
Four small items surfaced across the three review rounds and were never closed:

1. **`force: true` bypasses the change-dedup on every PATCH.**
   `server/routes/templates.routes.ts`:

   ```ts
   await templateVersionService.createVersion({
     templateId: params.id,
     userId: authReq.userId ?? 'system',
     notes: notes ?? 'Template updated',
     force: true // Force version creation on upload/mapping change
   });
   ```

   `createVersion` implements a no-change check (compares `fileRef`, `metadata`,
   `mapping` against the latest version) that `force: true` skips. Pre-GH-171
   code relied on that dedup. Saving a mapping twice with no edits now records
   two identical versions, which pollutes the pinning dropdown this ticket added.

2. **Dead `?? 'system'`.** Same call: the enclosing guard is
   `if ((data.mapping !== undefined || req.file) && authReq.userId)`, so
   `authReq.userId` cannot be nullish there. `'system'` is not a valid
   `users.id` and would violate the `created_by` FK if it were ever reached.
   Remove the fallback rather than leaving a misleading default.

3. **The new integration test leaves files behind.**
   `tests/integration/finalBlock.pinSecurity.test.ts` writes four `.docx` files
   into `server/files/` via `process.cwd()` in `beforeAll` and never removes
   them — `afterAll` only calls the two ctx cleanups.

4. **Stale comment.** `tests/integration/publish-document-readiness.test.ts:10`
   still refers to `createTemplateResolver`, which no longer exists.

### Preferred fix
1. Drop `force: true` from the PATCH call so the dedup applies; keep it on the
   POST (initial-version) call, where there is no prior version to compare.
   If a file replacement must always version even when `fileRef` is unchanged,
   say so in a comment — do not force unconditionally.
2. Delete the `?? 'system'` fallback.
3. Add an `afterAll` that unlinks the four files it created.
4. Update the comment to name `createProjectTemplateResolver`.

### Ties
- `add-api-endpoint` skill.
- **Collides with G171-1** on `TemplateAnalysisService.ts` and with G171-2 on the
  security test file — sequence after both, or coordinate.

### Acceptance Criteria
1. Two consecutive PATCH saves with no changes record **one** version, proven by a test.
2. A PATCH that genuinely changes the mapping still records a version.
3. `?? 'system'` gone.
4. The integration test leaves `server/files/` as it found it.
5. Comment corrected.
6. `tsc` exit 0, `lint` clean, `test:fast` ≥ 3039 / 0 failed, `test:integration` run.

---

## G171-5 — Stale known-failure doc + 10 undocumented integration failures on main

**Priority: P1** · Size: M · Files: `.claude/skills/run-tests/SKILL.md`, plus whatever the root cause turns out to be

> **Independent of GH-171.** Filed here only because this review surfaced it.
> Move it to its own initiative file if that is cleaner.

> **⚠️ Raised in priority by an observation from the 2026-08-11 review.** The 10
> failures are not merely undocumented noise — **they are actively masking the area
> GH-171 just changed.** The 4 permanently-failing files are:
>
> ```
> tests/integration/ai/documentOnboarding.test.ts
> tests/integration/api.templates-runs.test.ts        <-- templates
> tests/integration/docs.autogeneration.test.ts
> tests/integration/templates.e2e.test.ts             <-- templates
> ```
>
> Two of the four are template tests. So for the whole of GH-171 — versioning,
> pinning, the cross-tenant fix, and now rename detection — the integration suite
> was **partially blind to regressions in exactly the code under change**, and every
> reviewer (including this one) accepted "matches the documented baseline" as proof
> of no regression. That inference is weaker than it looks and will stay weak until
> these are fixed.
>
> Fix the two template files first, ahead of the doc update.

### Finding
`.claude/skills/run-tests/SKILL.md:41` states:

> `excludedIntegrationTests` in `vitest.config.ts` now only excludes
> `*.real.test.ts` (needs real external credentials). The full integration
> project runs **744/744** locally against Docker PG on 5434.

Neither number holds. On a **clean `main` checkout** (2026-08-11):

```
Test Files  4 failed | 108 passed (112)
     Tests  10 failed | 1093 passed | 4 skipped (1107)
```

The failures, all pre-existing and none in the known-failure list:

| File | Failures |
|---|---|
| `tests/integration/api.templates-runs.test.ts` | 6 — create / list / get / placeholders / update / delete |
| `tests/integration/templates.e2e.test.ts` | 2 — Scenario 1 upload, Scenario 6 signed URL |
| `tests/integration/docs.autogeneration.test.ts` | 1 — DOC-104 unknown-tag reporting |
| `tests/integration/ai/documentOnboarding.test.ts` | 1 — GH-167 workflow persistence |

Root cause is almost certainly a single one: `POST /api/projects/:id/templates`
returns **400 Bad Request** instead of 201. The other five in that file cascade
(`templateId` is undefined, so `/api/templates/undefined` fails uuid validation).

This matters beyond tidiness: the whole Templates API CRUD is red on `main`, and
because the doc says the suite is 744/744 green, every dev who runs it concludes
they broke something. That is exactly what happened during this review.

### Preferred fix
1. Reproduce the 400 on `main` and capture the response body — it is a Zod
   validation error, so the body names the failing field.
2. Fix the root cause if it is a product bug; if the tests encode a stale
   contract, fix the tests.
3. Update `run-tests/SKILL.md` with the real counts and a dated known-failure
   list, so the next dev is not misled.

### Ties
- `run-tests` skill (the artifact being corrected).
- `add-api-endpoint` skill if the fix lands in the route.
- **No collision** with G171-1..4 — but it does touch `templates.routes.ts`, so
  sequence against G171-4 if the fix lands there.

### Acceptance Criteria
1. The 400's cause is identified and stated in one paragraph.
2. Either the product bug is fixed, or the stale tests are corrected — with a reason recorded for whichever path.
3. `test:integration` on `main` reports either 0 failures, or a documented, dated known-failure list matching reality.
4. `run-tests/SKILL.md` no longer claims 744/744.

---

## Backlog / observations

- **Preview scope expansion** — see *Decision needed* above. Not a defect; needs a product ruling.
- **`templateVersions` immutability is not enforced.** AC1 says "immutable
  versions", but `TemplateVersionService` still exposes a delete and an update
  on version rows. Nothing in GH-171 relied on it, and it predates this work —
  parked as an observation, not filed.
- **Process note for the next reviewer.** Across three rounds this dev reported
  green gates twice when they were not green (a real `TS2322`, and an
  integration suite where only one hand-picked file had been run), and once
  deleted a 250-line passing test file while reporting a lower test count as
  success. The work itself came good — the security fix is genuinely well built
  — but **verify every gate yourself**, and treat a test count that moves
  downward as a stop condition.
