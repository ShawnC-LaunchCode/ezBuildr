import { isJsQuestionConfig } from "@shared/types/steps";
import { evaluateWorkflowVisibility } from "@shared/workflowLogic";

import { logger } from "../../logger";
import { workflowRepository, stepRepository, sectionRepository, logicRuleRepository } from "../../repositories";
import { createError } from "../../utils/errors";
import { validatePage } from "../../workflows/validation";
import { blockRunner } from "../BlockRunner";
import { logicService, type NavigationResult } from "../LogicService";
import { scriptEngine } from "../scripting/ScriptEngine";

import { runPersistenceWriter } from "./RunPersistenceWriter";
export interface ExecutionContext {
    workflowId: string;
    runId: string;
    userId?: string;
    mode: 'live' | 'preview';
}
export class RunExecutionCoordinator {
    // Not constructor-injected: the constructor is already at the project's
    // max-params limit (5). Tests mock this via the shared repositories
    // module singleton instead (see RunExecutionCoordinator.test.ts).
    private logicRuleRepo = logicRuleRepository;
    constructor(
        private persistence = runPersistenceWriter,
        private logicSvc = logicService,
        private stepRepo = stepRepository,
        private sectionRepo = sectionRepository,
        private workflowRepo = workflowRepository
    ) { }
    /**
     * Calculate next step/section
     */
    async next(context: ExecutionContext, currentSectionId: string | null): Promise<NavigationResult> {
        const { runId, workflowId, mode } = context;
        // Get current data
        const dataMap = await this.persistence.getRunValues(runId);
        // 1. Execute JS Questions for current section (if any)
        if (currentSectionId) {
            await this.executeJsQuestions(runId, currentSectionId, dataMap, context);
        }
        // 2. Execute onNext blocks
        // Note: BlockRunner still needs refactoring to accept Mode, but for now we pass context
        // Ideally BlockRunner should be stateless or accept context
        const aliasMap = await this.getAliasMap(workflowId);
        const blockResult = await blockRunner.runPhase({
            workflowId,
            runId,
            phase: "onNext",
            sectionId: currentSectionId ?? undefined,
            data: dataMap,
            mode, // Pass execution mode
            aliasMap,
        });
        // 3. Determine Navigation
        // Compute the logic engine's navigation first. It is the source of
        // truth for visibleSections/visibleSteps/requiredSteps/currentProgress
        // in BOTH branches below, and it also validates a branch block's
        // target: block config is author-controlled JSONB, so a stale or
        // typo'd id must never be written to the run's cursor unchecked
        // (RUN2-12).
        const computedNavigation = await this.logicSvc.evaluateNavigation(
            workflowId,
            runId,
            currentSectionId
        );
        let navigation: NavigationResult;
        if (blockResult.nextSectionId && computedNavigation.visibleSections.includes(blockResult.nextSectionId)) {
            navigation = {
                ...computedNavigation,
                nextSectionId: blockResult.nextSectionId,
            };
        } else {
            if (blockResult.nextSectionId) {
                logger.warn(
                    {
                        workflowId,
                        runId,
                        sectionId: currentSectionId,
                        invalidNextSectionId: blockResult.nextSectionId,
                        ...(blockResult.nextSectionBlockId ? { blockId: blockResult.nextSectionBlockId } : {}),
                    },
                    "Branch block targeted a section that is not visible in this workflow; falling back to computed navigation"
                );
            }
            navigation = computedNavigation;
        }
        // 4. Update Run State (RunService usually does this, but Coordinator can orchestrate)
        // Coordinator returns the result, caller (RunService façade) might save state?
        // Or Coordinator delegates to Persistence?
        // Let's delegate to Persistence to keep it "Coordinator"
        if (navigation.nextSectionId !== currentSectionId) {
            await this.persistence.updateRun(runId, {
                currentSectionId: navigation.nextSectionId,
                progress: navigation.currentProgress
            });
        }
        return navigation;
    }
    /**
     * Submit data for a section
     */
    async submitSection(
        context: ExecutionContext,
        sectionId: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- step values have dynamic types from workflow data
        values: Array<{ stepId: string, value: any }>
    ): Promise<{ success: boolean; errors?: string[] }> {
        const { runId, workflowId } = context;
        const steps = await this.stepRepo.findBySectionId(sectionId);
        const sectionStepIds = new Set(steps.map(step => step.id));
        const acceptedValues = await this.partitionSubmittedValues(
            values,
            sectionStepIds,
            workflowId,
            runId,
            sectionId
        );

        // 1. Persist Values
        await this.persistence.bulkSaveValues(runId, acceptedValues, workflowId);
        // 2. Get updated data map
        const dataMap = await this.persistence.getRunValues(runId);
        const aliasMap = await this.getAliasMap(workflowId);
        // 3. Validate required fields (respecting visibility)
        const visibleStepIds = await this.getVisibleStepIds(workflowId, dataMap);
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
                // Take first error message for each field
                return `${fieldName}: ${err.errors[0]}`;
            });
            logger.warn({ runId, sectionId, errors: errorMessages }, "Section validation failed");
            return { success: false, errors: errorMessages };
        }
        // 4. Execute JS Questions
        const jsResult = await this.executeJsQuestions(runId, sectionId, dataMap, context, aliasMap);
        if (!jsResult.success) {
            return { success: false, errors: jsResult.errors };
        }
        // 5. Execute onSectionSubmit blocks
        const blockResult = await blockRunner.runPhase({
            workflowId,
            runId,
            phase: "onSectionSubmit",
            sectionId,
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
     * Execute JS questions using ScriptEngine
     */
    private async executeJsQuestions(
        runId: string,
        sectionId: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dataMap holds dynamic workflow step values
        dataMap: Record<string, any>,
        context: ExecutionContext,
        aliasMap?: Record<string, string>
    ): Promise<{ success: boolean; errors?: string[] }> {
        const errors: string[] = [];
        // Find JS questions
        const allSteps = await this.stepRepo.findBySectionId(sectionId);
        const jsQuestions = allSteps.filter(step => step.type === 'js_question');
        for (const step of jsQuestions) {
            if (step.config === null || step.config === undefined || !isJsQuestionConfig(step.config)) { continue; }
            const config = step.config;
            const result = await scriptEngine.execute({
                language: 'javascript',
                code: config.code,
                inputKeys: config.inputKeys,
                data: dataMap,
                context: {
                    workflowId: context.workflowId,
                    runId,
                    phase: 'question_execution',
                    metadata: { stepId: step.id }
                },
                timeoutMs: config.timeoutMs ?? 1000,
                aliasMap,
            });
            if (!result.ok) {
                errors.push(`JS Question "${step.title}" failed: ${result.error}`);
                continue;
            }
            // Save output
            await this.persistence.saveStepValue(
                runId,
                step.id,
                result.output,
                context.workflowId
            );
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, no-param-reassign -- updating local data map with JS question output
            dataMap[step.id] = result.output; // Update local map
        }
        return {
            success: errors.length === 0,
            errors: errors.length > 0 ? errors : undefined
        };
    }
    /**
     * Determine which steps are currently visible for the workflow, using the
     * same logic-rule + visibleIf engine (`evaluateWorkflowVisibility`) that
     * navigation (`LogicService.evaluateNavigation`) and completion
     * (`LogicService.validateCompletion`) already use. Section submit must
     * not compute visibility any other way — a second engine here is what
     * let hidden-required steps block submission (RUN2-1).
     */
    private async getVisibleStepIds(
        workflowId: string,
        data: Record<string, unknown>
    ): Promise<string[]> {
        const sections = await this.sectionRepo.findByWorkflowId(workflowId);
        const sectionIds = sections.map(section => section.id);
        const steps = await this.stepRepo.findBySectionIds(sectionIds);
        const rules = await this.logicRuleRepo.findByWorkflowId(workflowId);
        const visibility = evaluateWorkflowVisibility({
            sections,
            steps,
            rules,
            data,
            resolveAlias: (name) => steps.find(step => step.alias === name)?.id,
        });
        return Array.from(visibility.visibleSteps);
    }
    /**
     * Build alias map for workflow
     */
    /**
     * Split submitted values into what this section will persist (RUN2-15).
     *
     * The client renders from the run's pinned version snapshot while this
     * check reads the LIVE tables, so the two disagree the moment an author
     * edits a published workflow. Three cases:
     *
     *  - id is in this section  -> persist, as before.
     *  - id belongs to a DIFFERENT section of this workflow -> still an error.
     *    That is the mass-assignment case this guard exists for: a caller must
     *    not write values into a section they are not on.
     *  - id exists nowhere on this workflow -> the author deleted the question
     *    mid-run. Drop it with a warning and let the respondent continue;
     *    throwing here bricked them on that page with no way to recover.
     *
     * The proper fix is to resolve steps from the run's pinned version instead
     * of the live tables (escalation RUN2-E1, deferred to its own initiative);
     * this keeps an author's edit from trapping in-flight respondents until
     * then.
     */
    private async partitionSubmittedValues(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- step values have dynamic types from workflow data
        values: Array<{ stepId: string, value: any }>,
        sectionStepIds: Set<string>,
        workflowId: string,
        runId: string,
        sectionId: string
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mirrors the values parameter
    ): Promise<Array<{ stepId: string, value: any }>> {
        const unknownToSection = values.filter(value => !sectionStepIds.has(value.stepId));
        if (unknownToSection.length === 0) {
            return values;
        }

        const workflowStepIds = await this.getWorkflowStepIds(workflowId);
        const crossSectionIds = unknownToSection
            .map(value => value.stepId)
            .filter(stepId => workflowStepIds.has(stepId));

        if (crossSectionIds.length > 0) {
            throw createError.validation(
                `Section submit contains out-of-section stepIds: ${crossSectionIds.join(', ')}`,
                { stepIds: crossSectionIds }
            );
        }

        const droppedIds = unknownToSection.map(value => value.stepId);
        logger.warn(
            { runId, sectionId, workflowId, droppedStepIds: droppedIds },
            'Dropping submitted values for steps that no longer exist on this workflow (edited mid-run)'
        );
        return values.filter(value => sectionStepIds.has(value.stepId));
    }

    /** Every step id on the workflow, across all its sections. */
    private async getWorkflowStepIds(workflowId: string): Promise<Set<string>> {
        const sections = await this.sectionRepo.findByWorkflowId(workflowId);
        const steps = await this.stepRepo.findBySectionIds(sections.map(section => section.id));
        return new Set(steps.map(step => step.id));
    }

    private async getAliasMap(workflowId: string): Promise<Record<string, string>> {
        const sections = await this.sectionRepo.findByWorkflowId(workflowId);
        const sectionIds = sections.map(s => s.id);
        const steps = await this.stepRepo.findBySectionIds(sectionIds);
        const map: Record<string, string> = {};
        for (const step of steps) {
            if (step.alias) {
                map[step.alias] = step.id;
            }
        }
        return map;
    }
}
export const runExecutionCoordinator = new RunExecutionCoordinator();
