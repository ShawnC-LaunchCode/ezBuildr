import { logger } from "../../logger";
import { workflowRepository, workflowRunRepository } from "../../repositories";
import { codeBlockRunRepository } from "../../repositories/CodeBlockRunRepository";
import { runSubmissionRepository } from "../../repositories/RunSubmissionRepository";
import { createError } from "../../utils/errors";
import { validatePage } from "../../workflows/validation";
import { blockRunner } from "../BlockRunner";
import { codeBlockService } from "../codeBlocks/CodeBlockService";
import { logicService, type NavigationResult } from "../LogicService";
import { runDefinitionProvider, RunDefinitionProvider, type RunDefinition } from "../workflow-runs/RunDefinitionProvider";

import { runPersistenceWriter } from "./RunPersistenceWriter";
import { getVisibleStepIds } from "./RunVisibility";
export interface ExecutionContext {
    workflowId: string;
    runId: string;
    userId?: string;
    mode: 'live' | 'preview';
    /**
     * CB-9a-2: the client-generated key identifying ONE logical submission.
     *
     * Optional on purpose. Absent, both `submitPage` and `next` behave exactly
     * as they did before this ticket, which is what keeps the standalone `next`
     * contract intact for every existing caller. Present, the two requests are
     * recognised as halves of the same user action: the submit half executes
     * and records its result, the next half navigates without re-evaluating,
     * and a retry of either replays instead of executing.
     */
    submissionKey?: string;
}

export interface SubmitPageResult { success: boolean; errors?: string[]; notices?: string[] }

/** One Code Block's gate state, as the client should display it. */
export interface AdvanceBlockState {
    stepId: string;
    status: string;
    pendingInputs: string[];
    firedAt: string | null;
    errorMessage: string | null;
}

/**
 * CB-9a-2's remaining criterion, delivered in CB-9a-3 where its consumer lives:
 * ONE logical submission returning committed answers, computed values, block
 * states and authoritative navigation together.
 *
 * The value is not only one fewer round trip. Submit, then next, then a state
 * read is three windows in which a reset or a retirement can interleave; a
 * single response stamped with its own `submissionKey` lets the client discard
 * a late answer by identity instead of inferring staleness from request order.
 */
export interface AdvanceResult extends SubmitPageResult {
    /** Committed answers keyed by stepId — the server's copy, not the client's optimistic one. */
    values: Record<string, unknown>;
    blockStates: AdvanceBlockState[];
    /** Null when validation failed: there is no authoritative move to apply. */
    navigation: NavigationResult | null;
    submissionKey: string;
}

/** A submit or next request that arrived while its own key was still running. */
export const SUBMISSION_IN_FLIGHT = 'Validation error: this submission is already being processed';
export class RunExecutionCoordinator {
    private codeBlockSvc = codeBlockService;
    // A property rather than a sixth constructor parameter: `max-params` caps
    // the constructor at 5, and three suites already construct it positionally.
    private submissions = runSubmissionRepository;

    constructor(
        private persistence = runPersistenceWriter,
        private logicSvc = logicService,
        private workflowRepo = workflowRepository,
        // RVP-3: resolves the run so its pages/steps/logic-rules can be
        // sourced from `definitionProvider` below (the pinned version's
        // graph when the run has one, the live tables otherwise), instead of
        // each helper independently re-reading `stepRepo`/`pageRepo` --
        // see tickets/RUN_VERSION_PINNING_TICKETS.md, RVP-3.
        private runRepo = workflowRunRepository,
        private definitionProvider: RunDefinitionProvider = runDefinitionProvider
    ) { }

    /**
     * Resolve the run and its pages/steps/logic-rules from
     * `RunDefinitionProvider` (RVP-1): the pinned version's graph when the
     * run has one, the live tables otherwise (`source: 'live'`). Every
     * helper below that used to read `stepRepo`/`pageRepo` directly now
     * goes through this, so a live workflow edit cannot desync an in-flight
     * run's server-side decisions from what the respondent was actually
     * shown (RVP-3).
     */
    private async getDefinition(context: ExecutionContext): Promise<RunDefinition> {
        const run = await this.runRepo.findById(context.runId);
        if (!run || run.workflowId !== context.workflowId) {
            throw new Error("Run not found");
        }
        return this.definitionProvider.getDefinition(run);
    }

    /**
     * Calculate next step/page
     */
    async next(context: ExecutionContext, currentPageId: string | null): Promise<NavigationResult> {
        const { runId, submissionKey } = context;
        if (submissionKey === undefined) {
            // No key: the caller is using `next` standalone, exactly as every
            // pre-CB-9a-2 caller does. Evaluate as before.
            return this.runNext(context, currentPageId, true);
        }
        const existing = await this.submissions.find(runId, submissionKey);
        if (!existing) {
            // A key whose submit never landed. Treat it as a first execution
            // and claim it, so this navigation is still replay-protected.
            const claim = await this.submissions.claim(runId, submissionKey, currentPageId);
            if (!claim) { throw createError.validation(SUBMISSION_IN_FLIGHT); }
            const fresh = await this.runNext(context, currentPageId, true);
            await this.submissions.recordResponse(claim.id, 'succeeded', { success: true });
            await this.submissions.recordNavigation(claim.id, fresh);
            return fresh;
        }
        if (existing.status === 'in_progress') { throw createError.validation(SUBMISSION_IN_FLIGHT); }
        if (existing.navigation) {
            // Retry of the paired next after a lost response.
            return existing.navigation as NavigationResult;
        }
        // The normal path: this submission's submit half already ran
        // `evaluateAll`. Navigating must NOT run it a second time -- that is
        // what fired `always` blocks twice per user action and let the second
        // pass overwrite a `fired` state with `skipped_unchanged` before the
        // client could read it. The fix is here, at the logical-operation
        // boundary, rather than in what `onChange` means.
        const navigation = await this.runNext(context, currentPageId, false);
        await this.submissions.recordNavigation(existing.id, navigation);
        return navigation;
    }

    /**
     * Navigation itself. `evaluateCodeBlocks` is false when this move belongs to
     * a logical submission whose submit half already evaluated.
     */
    private async runNext(
        context: ExecutionContext,
        currentPageId: string | null,
        evaluateCodeBlocks: boolean
    ): Promise<NavigationResult> {
        const { runId, workflowId, mode } = context;
        const definition = await this.getDefinition(context);
        // Get current data
        const dataMap = await this.persistence.getRunValues(runId);
        // 1. Evaluate Code Blocks before navigation is computed (CB-3, AC 7),
        // so a value produced on this submit can gate the next page's
        // visibility on the same request rather than one navigation late.
        // `dataMap` is mutated in place with the new outputs.
        if (evaluateCodeBlocks) {
            await this.codeBlockSvc.evaluateAll(runId, workflowId, 'submit', dataMap);
        }
        // 2. Execute onNext blocks
        // Note: BlockRunner still needs refactoring to accept Mode, but for now we pass context
        // Ideally BlockRunner should be stateless or accept context
        const aliasMap = this.getAliasMap(definition);
        const blockResult = await blockRunner.runPhase({
            workflowId,
            runId,
            phase: "onNext",
            pageId: currentPageId ?? undefined,
            data: dataMap,
            mode, // Pass execution mode
            aliasMap,
        });
        // 3. Determine Navigation
        // Compute the logic engine's navigation first. It is the source of
        // truth for visiblePages/visibleSteps/requiredSteps/currentProgress
        // in BOTH branches below, and it also validates a branch block's
        // target: block config is author-controlled JSONB, so a stale or
        // typo'd id must never be written to the run's cursor unchecked
        // (RUN2-12). LogicService resolves its own copy of the run's
        // definition internally (RVP-2) -- this call needs no change here.
        const computedNavigation = await this.logicSvc.evaluateNavigation(
            workflowId,
            runId,
            currentPageId
        );
        let navigation: NavigationResult;
        if (blockResult.nextPageId && computedNavigation.visiblePages.includes(blockResult.nextPageId)) {
            navigation = {
                ...computedNavigation,
                nextPageId: blockResult.nextPageId,
            };
        } else {
            if (blockResult.nextPageId) {
                logger.warn(
                    {
                        workflowId,
                        runId,
                        pageId: currentPageId,
                        invalidNextPageId: blockResult.nextPageId,
                        ...(blockResult.nextPageBlockId ? { blockId: blockResult.nextPageBlockId } : {}),
                    },
                    "Branch block targeted a page that is not visible in this workflow; falling back to computed navigation"
                );
            }
            navigation = computedNavigation;
        }
        // 4. Update Run State (RunService usually does this, but Coordinator can orchestrate)
        // Coordinator returns the result, caller (RunService façade) might save state?
        // Or Coordinator delegates to Persistence?
        // Let's delegate to Persistence to keep it "Coordinator"
        if (navigation.nextPageId !== currentPageId) {
            await this.persistence.advanceRun(
                runId,
                navigation.nextPageId,
                navigation.currentProgress
            );
        }
        return navigation;
    }
    /**
     * Submit data for a page
     */
    async submitPage(
        context: ExecutionContext,
        pageId: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- step values have dynamic types from workflow data
        values: Array<{ stepId: string, value: any }>
    ): Promise<SubmitPageResult> {
        const { runId, submissionKey } = context;
        if (submissionKey === undefined) {
            return this.runSubmitPage(context, pageId, values);
        }
        // Race the unique index rather than checking first: two concurrent
        // requests with the same key both try, exactly one wins.
        const claim = await this.submissions.claim(runId, submissionKey, pageId);
        if (!claim) {
            const existing = await this.submissions.find(runId, submissionKey);
            if (!existing || existing.status === 'in_progress') {
                throw createError.validation(SUBMISSION_IN_FLIGHT);
            }
            // A retry after a lost response. Replay what the winning attempt
            // returned; do NOT execute again, or an `always` block fires twice
            // for one user action.
            return existing.response as SubmitPageResult;
        }
        let result: SubmitPageResult;
        try {
            result = await this.runSubmitPage(context, pageId, values);
        } catch (error) {
            // Nothing was recorded, so free the key: otherwise an unexpected
            // failure wedges it `in_progress` and every retry is refused.
            await this.submissions.releaseClaim(claim.id);
            throw error;
        }
        await this.submissions.recordResponse(claim.id, result.success ? 'succeeded' : 'failed', result);
        return result;
    }

    /**
     * One logical submission: persist, evaluate, navigate, and report the
     * server's authoritative state in a single response.
     *
     * Deliberately built on `submitPage` and `runNext` rather than beside them.
     * A second execution path for preview is exactly what CB-9a's audit refused,
     * and it is how preview and live silently drift apart.
     */
    async advance(
        context: ExecutionContext,
        pageId: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- step values have dynamic types from workflow data
        values: Array<{ stepId: string, value: any }>
    ): Promise<AdvanceResult> {
        const { runId, submissionKey } = context;
        if (submissionKey === undefined) {
            throw createError.validation('Validation error: submissionKey is required to advance');
        }
        const submitted = await this.submitPage(context, pageId, values);
        // A failed validation is still a completed submission: it is recorded,
        // it replays, and it must NOT navigate.
        const navigation = submitted.success
            ? await this.next(context, pageId)
            : null;
        return {
            ...submitted,
            navigation,
            submissionKey,
            values: await this.persistence.getRunValues(runId),
            blockStates: await this.readBlockStates(runId),
        };
    }

    private async readBlockStates(runId: string): Promise<AdvanceBlockState[]> {
        const rows = await codeBlockRunRepository.findByRunId(runId);
        return rows.map(row => ({
            stepId: row.stepId,
            status: row.status,
            pendingInputs: row.pendingInputs ?? [],
            firedAt: row.firedAt ? row.firedAt.toISOString() : null,
            errorMessage: row.errorMessage,
        }));
    }

    /** The actual page submission, unaware of idempotency. */
    private async runSubmitPage(
        context: ExecutionContext,
        pageId: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- step values have dynamic types from workflow data
        values: Array<{ stepId: string, value: any }>
    ): Promise<SubmitPageResult> {
        const { runId, workflowId } = context;
        const definition = await this.getDefinition(context);
        const steps = definition.steps.filter(step => step.pageId === pageId);
        const pageStepIds = new Set(steps.map(step => step.id));
        const acceptedValues = this.partitionSubmittedValues(
            values,
            pageStepIds,
            definition,
            context,
            pageId
        );

        // 1. Persist Values
        await this.persistence.bulkSaveValues(runId, acceptedValues, workflowId);
        // 2. Get updated data map
        const dataMap = await this.persistence.getRunValues(runId);
        const aliasMap = this.getAliasMap(definition);
        // 3. Validate required fields (respecting visibility)
        const visibleStepIds = getVisibleStepIds(definition, dataMap);
        const validationResult = await validatePage(
            steps,
            dataMap,
            visibleStepIds
        );
        if (!validationResult.valid) {
            // Format errors for user-friendly display
            const errorMessages = validationResult.errors.map(err => {
                const step = steps.find(s => s.id === err.fieldId);
                const fieldName = step?.title ?? 'Field';
                const fieldPath = err.path ? ` (${err.path})` : '';
                // Keep one message per validation entry so existing response
                // cardinality is stable; list validation already emits one
                // entry per failing path.
                return `${fieldName}${fieldPath}: ${err.errors[0]}`;
            });
            logger.warn({ runId, pageId, errors: errorMessages }, "Page validation failed");
            return { success: false, errors: errorMessages };
        }
        // 4. Evaluate Code Blocks.
        // CB-3: every eligible block in the run is considered, not just this
        // page's -- that is what `everySubmit` means, and it is what lets a
        // block on page 1 fire once page 2 supplies its last input. CB-2's
        // readiness and change gates make the sweep a no-op when nothing moved.
        const codeBlockResults = await this.codeBlockSvc.evaluateAll(runId, workflowId, 'submit', dataMap);
        // Only a failure in a block belonging to THIS page fails the submit.
        // A block erroring elsewhere nulls its own outputs and records
        // `status: 'error'` (Decisions 5) without blocking navigation --
        // otherwise one broken block anywhere makes every later page
        // un-submittable, which is strictly worse than a blank value.
        const pageErrors = codeBlockResults
            .filter(result => !result.success && pageStepIds.has(result.state.stepId))
            .map(result => result.error)
            .filter((error): error is string => error !== undefined);
        if (pageErrors.length > 0) {
            return { success: false, errors: pageErrors };
        }
        // 5. Execute onPageSubmit blocks
        const blockResult = await blockRunner.runPhase({
            workflowId,
            runId,
            phase: "onPageSubmit",
            pageId,
            data: dataMap,
            mode: context.mode, // Pass execution mode
            aliasMap,
        });
        return {
            success: blockResult.success,
            ...(blockResult.notices ? { notices: blockResult.notices } : {}),
            errors: blockResult.errors,
        };
    }
    /**
     * Split submitted values into what this page will persist (RUN2-15).
     *
     * The client renders from the run's pinned version snapshot. Before
     * RVP-3, this check read the LIVE tables, so the two could disagree the
     * moment an author edited a published workflow. Three cases:
     *
     *  - id is in this page  -> persist, as before.
     *  - id belongs to a DIFFERENT page of this workflow -> still an error.
     *    That is the mass-assignment case this guard exists for: a caller must
     *    not write values into a page they are not on.
     *  - id exists nowhere on this workflow's definition -> the author deleted
     *    the question mid-run. Drop it with a warning and let the respondent
     *    continue; throwing here bricked them on that page with no way to
     *    recover.
     *
     * RVP-3: `definition` (and therefore `pageStepIds`/`workflowStepIds`)
     * now comes from `RunDefinitionProvider`. For a PINNED run this is the
     * exact snapshot the respondent's client rendered from, so a submitted id
     * absent from it entirely is unreachable in practice -- the client cannot
     * submit an id it was never given. The "dropped ids" branch below
     * therefore survives only as a fallback for versionless runs
     * (`definition.source === 'live'`), whose definition is re-read fresh
     * from the live tables on every call and can still legitimately drift
     * mid-request. See RunExecutionCoordinator.pinnedDefinition.test.ts for
     * the regression proving a pinned run never takes this branch.
     */
    private partitionSubmittedValues(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- step values have dynamic types from workflow data
        values: Array<{ stepId: string, value: any }>,
        pageStepIds: Set<string>,
        definition: RunDefinition,
        context: ExecutionContext,
        pageId: string
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mirrors the values parameter
    ): Array<{ stepId: string, value: any }> {
        const unknownToPage = values.filter(value => !pageStepIds.has(value.stepId));
        if (unknownToPage.length === 0) {
            return values;
        }

        const workflowStepIds = this.getWorkflowStepIds(definition);
        const crossPageIds = unknownToPage
            .map(value => value.stepId)
            .filter(stepId => workflowStepIds.has(stepId));

        if (crossPageIds.length > 0) {
            throw createError.validation(
                `Page submit contains out-of-page stepIds: ${crossPageIds.join(', ')}`,
                { stepIds: crossPageIds }
            );
        }

        const droppedIds = unknownToPage.map(value => value.stepId);
        logger.warn(
            { runId: context.runId, pageId, workflowId: context.workflowId, droppedStepIds: droppedIds },
            'Dropping submitted values for steps that no longer exist on this workflow (edited mid-run)'
        );
        return values.filter(value => pageStepIds.has(value.stepId));
    }

    /** Every step id on the run's definition, across all its pages. */
    private getWorkflowStepIds(definition: RunDefinition): Set<string> {
        return new Set(definition.steps.map(step => step.id));
    }

    private getAliasMap(definition: RunDefinition): Record<string, string> {
        const map: Record<string, string> = {};
        for (const step of definition.steps) {
            if (step.alias) {
                map[step.alias] = step.id;
            }
        }
        return map;
    }
}
export const runExecutionCoordinator = new RunExecutionCoordinator();
