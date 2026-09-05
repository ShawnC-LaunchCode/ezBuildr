import { logger } from "../../logger";
import { workflowRepository, workflowRunRepository } from "../../repositories";
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
}
export class RunExecutionCoordinator {
    private codeBlockSvc = codeBlockService;

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
        const { runId, workflowId, mode } = context;
        const definition = await this.getDefinition(context);
        // Get current data
        const dataMap = await this.persistence.getRunValues(runId);
        // 1. Evaluate Code Blocks before navigation is computed (CB-3, AC 7),
        // so a value produced on this submit can gate the next page's
        // visibility on the same request rather than one navigation late.
        // `dataMap` is mutated in place with the new outputs.
        await this.codeBlockSvc.evaluateAll(runId, workflowId, 'submit', dataMap);
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
    ): Promise<{ success: boolean; errors?: string[] }> {
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
