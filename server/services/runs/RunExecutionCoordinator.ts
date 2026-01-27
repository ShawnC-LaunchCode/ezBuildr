import { isJsQuestionConfig } from "@shared/types/steps";

import { logger } from "../../logger";
import { workflowRepository, stepRepository, sectionRepository } from "../../repositories";
import { validatePage } from "../../workflows/validation";
import { blockRunner } from "../BlockRunner";
import { intakeQuestionVisibilityService } from "../IntakeQuestionVisibilityService";
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
        let navigation: NavigationResult;
        if (blockResult.nextSectionId) {
            navigation = {
                nextSectionId: blockResult.nextSectionId,
                currentProgress: 0,
                visibleSections: [],
                visibleSteps: [],
                requiredSteps: [],
            };
        } else {
            navigation = await this.logicSvc.evaluateNavigation(
                workflowId,
                runId,
                currentSectionId
            );
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
        values: Array<{ stepId: string, value: any }>
    ): Promise<{ success: boolean; errors?: string[] }> {
        const { runId, workflowId } = context;
        // 1. Persist Values
        await this.persistence.bulkSaveValues(runId, values, workflowId);
        // 2. Get updated data map
        const dataMap = await this.persistence.getRunValues(runId);
        const aliasMap = await this.getAliasMap(workflowId);
        // 3. Validate required fields (respecting visibility)
        const steps = await this.stepRepo.findBySectionId(sectionId);
        const visibility = await intakeQuestionVisibilityService.evaluatePageQuestions(
            sectionId,
            runId,
            dataMap
        );
        const validationResult = validatePage(
            steps,
            dataMap,
            visibility.visibleQuestions
        );
        if (!validationResult.valid) {
            // Format errors for user-friendly display
            const errorMessages = validationResult.errors.map(err => {
                const step = steps.find(s => s.id === err.fieldId);
                const fieldName = step?.title || 'Field';
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
        dataMap: Record<string, any>,
        context: ExecutionContext,
        aliasMap?: Record<string, string>
    ): Promise<{ success: boolean; errors?: string[] }> {
        const errors: string[] = [];
        // Find JS questions
        const allSteps = await this.stepRepo.findBySectionId(sectionId);
        const jsQuestions = allSteps.filter(step => step.type === 'js_question');
        for (const step of jsQuestions) {
            if (!step.options || !isJsQuestionConfig(step.options)) { continue; }
            const config = step.options;
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
                timeoutMs: config.timeoutMs || 1000,
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
            dataMap[step.id] = result.output; // Update local map
        }
        return {
            success: errors.length === 0,
            errors: errors.length > 0 ? errors : undefined
        };
    }
    /**
     * Build alias map for workflow
     */
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