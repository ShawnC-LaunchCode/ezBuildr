# GH-171 template versioning & impact analysis (G171) — retired 2026-08-12

**GH-171 closed with all 4 ACs met; follow-up tickets G171-0..6 all closed.** Document
templates now create immutable versions with notes, workflows pin a version or follow
latest, the dependency analyser lists affected workflows, and the impact warning reports
added, removed **and renamed** placeholders.

Original ticket file: `tickets/GH171_FOLLOWUP_TICKETS.md`. Recover full detail — including
each ticket's Finding, acceptance criteria and dated verification notes — with:

```bash
git log -p -- tickets/GH171_FOLLOWUP_TICKETS.md
```

## Settled rulings — do not re-litigate

**Preview accepts a client-supplied pin, and that is wanted** (repo owner, 2026-08-11). The
preview payload *is* the unsaved builder draft, so the pin can only come from the client. If
preview ignored it, preview would render the latest version while the run renders the pinned
one — a silent divergence, invisible in the builder and discovered when a client receives the
wrong document. **Do not revert `pinnedVersionId` from `previewGenerateSchema`.**

It is safe because resolution is scoped by two independent ownership hops:
`createProjectTemplateResolver` → `findByIdAndProjectId(documentId, projectId)`, then
`getVersionForTemplate(template.id, pinnedVersionId)` filtering on **both** `id` and
`templateId`.

**`requiresReview` trips on renames.** No AC asked for this; it was kept deliberately,
because a rename previously passed review silently while breaking every workflow piping to
the old alias.

**The AC2 rename example sits exactly on the threshold.** `client_name` → `customer_name`
scores precisely `1/3`, the configured minimum, so it passes on float equality at the
boundary. A boundary test guards it — retune
`RENAMED_PLACEHOLDER_TOKEN_OVERLAP_THRESHOLD` with care.

## Parked entries

## G171-O1 — `unresolved_variables` reporting is dead, and now untested · `informational`

`run_generated_documents.unresolved_variables` is **structurally always `[]`**. The chain,
verified by reading the source on 2026-08-12:

- `VariableNormalizer.ts:131` — `includeEmpty` defaults **true**, so null/undefined become `''`
- both document engines normalize unconditionally before rendering
- `RenderCore.ts:290-307` — `nullGetter` only fires for null/undefined, never for `''`

So the DB column, the service plumbing, and the behaviour `workflowStructureRules.ts`
documents as designed can never fire. The integration test that would have caught it was
**removed** upstream when skipped tests were eliminated, so the defect is currently
**untested and invisible**.

Why it went unnoticed for months: `tests/unit/services/FinalBlockRenderer.test.ts:58`
hardcodes `unresolvedVariables: ["missingField"]` inside a mock of the engine, so the test
asserts its own fixture.

**A fix was in flight in a separate session as of 2026-08-12 and its outcome was never
confirmed here.** **Next step:** check whether that landed. If it did, restore an integration
assertion so the feature cannot rot again. If it did not, this is real open work and should be
promoted to a ticket, not left as an observation. Either way, **do not "fix" the test by
asserting `[]`** — that locks the bug in.

## G171-O2 — template version immutability is *nearly* enforced · `informational`

Narrowed 2026-08-12; the original observation is now partly stale. AC1 says "immutable
versions", and at the time `TemplateVersionService` exposed both a delete and an update on
version rows.

- The hard delete (`pruneOldVersions`) was **removed** on 2026-08-12. It deleted the oldest
  N versions by recency with no `pinnedVersionId` awareness, so it would have broken every
  run pinned to a pruned version — and because `resolveTemplate` throws `notFound` on a
  missing pin, the failure would have surfaced at render time, not at prune time.
- What remains is `deactivateVersion`, which sets `isActive: false`. It does not rewrite
  version *content*, so immutability of the stored document is intact — but it has **zero
  callers**, and it carries the same pinned-run hazard as the deleted pruner: nothing stops
  it deactivating a version a run has pinned.

**Next step:** either delete `deactivateVersion` as dead code (the treatment `pruneOldVersions`
got, and the cheaper option), or, if retention/deactivation is genuinely wanted, exclude any
version referenced by a pinned run and cover it with a DB-backed test that pins then
deactivates.

## G171-O3 — process note for reviewers · `informational`

Across three rounds, the implementing dev reported green gates twice when they were not green
(a real `TS2322`, and an integration suite where only one hand-picked file had been run), and
once deleted a 250-line passing test file while reporting the lower test count as success. The
work came good — the security fix is genuinely well built — but the lesson generalises:
**verify every gate yourself, and treat a test count that moves downward as a stop
condition.**

Corollary learned later in the same initiative: **check a worktree's base commit before
calling its numbers wrong.** A dev reporting "10 pre-existing integration failures" was
correct, because their base predated the fixture fix that took the suite to 2 and then 0.

## Closed — do not re-file

| Ticket | Outcome | Commit |
|---|---|---|
| GH-171 (parent) — versioning + dependency impact analysis | ✅ all 4 ACs | `24491c3e`, `36cd2fa7` |
| G171-0 — preserve the uncommitted work | ✅ 21 paths committed | `3ac6747d` → `24491c3e` |
| G171-1 — renamed-placeholder detection (AC3) | ✅ closed GH-171's last AC; deleted a duplicate `findRenames` heuristic | `6f28b585` → `36cd2fa7` |
| G171-2 — test the real-run pin path + preview/run parity | ✅ 6 ACs; probe fails 4/5 without the scoping | `9b9e4bc2` → `a986b2ed` |
| G171-3 — account for the 2 missing unit tests | ✅ **no coverage hole** — a baseline measurement error | `50bfd24a` |
| G171-4 — carry-over cleanups | ✅ PATCH dedup restored (upload path keeps `force`), dead `?? 'system'` removed | `faee6e8a` |
| G171-5 — stale known-failure doc + 10 integration failures | ✅ stale DOCX fixtures, not a product bug; 10 → 2 | `cc427d65` → `e0eb69fe` |
| G171-6 — fix the last two integration failures | ✅ suite reached **0 failures**; DOC-104 reported as a real defect, not papered over | `150e3148` → `46848ba4` |

⚠️ **`unresolvedVariables` reporting is NOT among the shipped work** — see G171-O1. A green
integration suite does not mean it works.

**One security note worth keeping:** the preview route was **never** vulnerable —
`previewGenerateSchema` stripped `pinnedVersionId` (Zod drops unknown keys), so no pin ever
reached the resolver there. The dev *added* that field, creating the vector, then secured it.
The genuinely exploitable path was a real run completing, where the pin comes from stored
section config; that path is now covered (G171-2), and breaking the scoping fails 4 of its 5
tests with two runs rendering a foreign tenant's template.
