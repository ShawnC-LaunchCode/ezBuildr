# Interview Runner Hardening — Tickets (RUN-1..13)

Source: interview-runner condition report, 2026-07-13. Twelve tickets were opened
against the run → document pipeline. **All twelve implementations were verified
complete on 2026-07-13** and are closed below. RUN-13 was added as close-out
coverage for the RUN-10/RUN-12 edge cases and is now closed too.

## Verification pass — 2026-07-13 (post-implementation)

Re-tested every RUN ticket against the actual tree after the implementation wave.

- **Baseline:** HEAD `f7e826b1` ("Resolve 7 release blockers") + working tree.
- **Build:** `npx tsc --noEmit` → **0 errors** (the earlier 67-error rename
  mid-flight is resolved).
- **Tests:** `npm run test:fast` → **94 files / 1626 tests passed**, 15 skipped.

**Result: RUN-1..13 closed** (implementations verified with file:line evidence
and passing tests). RUN-13 adds the two edge tests that were still missing from
RUN-10/RUN-12 acceptance coverage.

## Goal (the target architecture) — now largely met

```
Creation (AI / manual / template)
        │  ── break 1 ──  ✅ runner never branches on authoring origin
        ▼
Run the interview  ──►  ONE canonical answer object (RunDataService: byStepId + byAlias)
        │  ── break 2 ──  ✅ single generateDocuments pipeline; alias-keyed handoff
        ▼
Document generation (consumes byAlias, resolves {{alias}})
```

| Boundary | Before | Now |
|---|---|---|
| Creation → Run | ✅ Conforms | ✅ Conforms |
| Run gathers ONE object | ⚠️ two ad-hoc projections | ✅ `RunDataService` (`byStepId` for logic, `byAlias` for docs) |
| Run → Document break | ⚠️ two entry points, wrong keying | ✅ one `runService.generateDocuments`; alias-keyed on both paths |

---

## ✅ Closed — verified 2026-07-13

| Ticket | Verdict | Verified evidence |
|---|---|---|
| **RUN-1** canonical Run Data Object | ✅ Done | `server/services/workflow-runs/RunDataService.ts` (`buildForRun`, `fromStepIdData`, `byStepId`/`byAlias`, `toAliasKeyed`); consumed by completion + `generateDocumentsInner` (`RunLifecycleService.ts:393` `runData.byAlias`); `tests/unit/services/RunDataService.test.ts` asserts the mixed alias/computed mapping. |
| **RUN-2** completion rendered blank docs (P0) | ✅ Done | `RunCompletionService.ts:101-104` now passes `fromStepIdData(blockResult.data …).byAlias`; `generateDocumentsInner` uses `runData.byAlias` (`RunLifecycleService.ts:393`). Unit tests assert `byAlias` mapping; integration coverage in `docs.autogeneration` / `runtime-pipelines`. |
| **RUN-3** alias integrity | ✅ Done | Migration `0004_runner_hardening_steps.sql`: denormalizes `steps.workflow_id`, backfills null aliases, de-dups per `(workflow_id, lower(alias))`, drops per-section index, adds partial unique `steps_workflow_alias_unique`. `StepService.validateAliasUniqueness` + tests (`StepService.test.ts:140,304`, `AliasResolver.test.ts:67`). |
| **RUN-4** unify doc-gen entry points | ✅ Done | Manual route delegates to the shared pipeline: `finalBlock.routes.ts:134` `runService.generateDocuments(run.id, { finalStepId, toPdf, pdfStrategy })`; completion uses the same. |
| **RUN-5** `pdfStrategy` crash | ✅ Done | Threaded through `FinalBlockRenderer.ts` (destructured `:139`, used `:360`); `tests/unit/services/FinalBlockRenderer.test.ts`. |
| **RUN-6** `options`→`config` rename | ✅ Done | Column renamed in migration `0004` (data-preserving); schema/`insertStepSchema` on `config`; runner endpoint added (`steps.routes.ts:132` `GET /api/workflows/:workflowId/steps`); blocks/editors read `config`; ChoiceBlock legacy fallback removed (`useChoiceOptions.ts:140` `config?.options ?? []`); tsc 0. |
| **RUN-7** step-type ↔ renderer coverage | ✅ Done | `stepTypeRouting.ts` (`normalizeRunnerStepType`: `datetime→date_time`, `*_advanced→base`, `final→final_documents`; `file_upload`/`repeater` explicitly unsupported); `BlockRenderer` dispatches on normalized type; guard test `runnerStepTypeRouting.test.ts` (15 cases). |
| **RUN-8** version-pin anonymous runs | ✅ Done | `RunService.createAnonymousRun` stamps `workflowVersionId` (`RunService.ts:474-486`); `RunService.versioning.test.ts` covers pinned/current stamping + no-published-version rejection. |
| **RUN-9** visibility fail-mode | ✅ Done | Now fails **closed**: `useSectionVisibility.ts` catch → `sectionLevelVisible = false`; `conditionEvaluator` unknown-operator `default: return false`. |
| **RUN-10** doc-gen idempotency | ✅ Done | DB-level CAS gate `WorkflowRunRepository.tryMarkGenerationStarted` (conditional update on `generationStatus`); `generateDocumentsInner` bails when not claimed; RUN-13 integration coverage proves concurrent triggers persist one document set. |
| **RUN-11** silent no-op operators | ✅ Done | `conditionEvaluator`: `group.not` applied (`:100,152`), date operators implemented (`on_or_before`, `diff_days`, …), unknown-operator `default: return false`; `tests/unit/shared/conditionEvaluator.test.ts`. |
| **RUN-12** legacy template tenancy scope | ✅ Done | `buildLegacyFinalBlockConfig(workflowId, projectId)` uses `findByIdAndProjectId` (`RunLifecycleService.ts:495`); primary path also scoped; RUN-13 integration coverage proves cross-project legacy templates fail not-found for creator and run-token completion. |

---

## RUN-13 — Close-out test coverage ✅ VERIFIED

**Priority: P3.** Size: S
**Status:** Complete on 2026-07-13.

### What was added

`tests/integration/runner-hardening-run13.test.ts` adds the missing
negative/edge coverage from RUN-10 and RUN-12:

1. **RUN-10 concurrency test.** `tryMarkGenerationStarted` is the correctness
   boundary against double-generation. The test fires two separate
   `RunLifecycleService.generateDocuments` calls concurrently for one run and
   asserts exactly one generated document row is persisted.
2. **RUN-12 cross-project rejection test.** The legacy final-block resolver is
   `findByIdAndProjectId`-scoped. The tests prove a legacy config referencing a
   template id from another project fails not-found rather than rendering, for
   both creator completion and the real bearer run-token HTTP completion route.

During this work, the run-token test exposed a route-ordering bug:
`workflowTemplates.routes.ts` mounted an authenticated router at `/api`, which
pre-authenticated unrelated `/api/*` requests before their own route handlers.
That router is now split and guarded per route so `/api/runs/:runId/complete`
can reach `creatorOrRunTokenAuth`.

### Verified

- `npx vitest run --project integration tests/integration/runner-hardening-run13.test.ts`
  → **3 tests passed**.

### Acceptance criteria
- [x] A concurrency test proves one run yields exactly one document set under two simultaneous generation triggers.
- [x] A test proves a legacy final-block config referencing a cross-project template id throws not-found (both authed and run-token completion).
- [x] Both run in the appropriate Vitest project (see the `run-tests` skill) and pass.

---

## History

The full original ticket bodies (problem traces, file:line evidence, chosen fix
directions, and the RUN-6 Option-B decision) are preserved in git history at
commit `0a125a00` (`docs/features/RUNNER_HARDENING_TICKETS.md`) if the detailed
rationale is needed. Cross-references in `DOCUMENT_AUTOMATION_TICKETS.md`
(DOC-108 → RUN-2; the `options`→`config` decision) remain accurate.
