import { InsertWorkflowRun, InsertStepValue, WorkflowRun } from "@shared/schema";

import { logger } from "../../logger";
import { workflowRunRepository, stepValueRepository, stepRepository, sectionRepository } from "../../repositories";
import { DbTransaction } from "../../repositories/BaseRepository";

export class RunPersistenceWriter {
    constructor(
        private runRepo = workflowRunRepository,
        private valueRepo = stepValueRepository,
        private stepRepo = stepRepository,
        private sectionRepo = sectionRepository
    ) { }

    /**
     * Create a new run record
     */
    async createRun(data: InsertWorkflowRun, tx?: DbTransaction): Promise<WorkflowRun> {
        return this.runRepo.create(data, tx);
    }

    /**
     * Update run properties
     */
    async updateRun(runId: string, data: Partial<WorkflowRun>): Promise<void> {
        await this.runRepo.update(runId, data as any);
    }

    /**
     * Save a single step value
     */
    async saveStepValue(runId: string, stepId: string, value: any, workflowId: string): Promise<void> {
        // Validate step belongs to workflow
        const step = await this.stepRepo.findById(stepId);
        if (!step) {throw new Error(`Step not found: ${stepId}`);}

        const section = await this.sectionRepo.findById(step.sectionId);
        if (!section || section.workflowId !== workflowId) {
            throw new Error(`Step ${stepId} does not belong to workflow ${workflowId}`);
        }

        await this.valueRepo.upsert({
            runId,
            stepId,
            value
        });
    }

    /**
     * Bulk save values
     */
    async bulkSaveValues(runId: string, values: Array<{ stepId: string, value: any }>, workflowId: string): Promise<void> {
        for (const v of values) {
            await this.saveStepValue(runId, v.stepId, v.value, workflowId);
        }
    }

    /**
     * Get all values for a run
     */
    async getRunValues(runId: string): Promise<Record<string, any>> {
        const values = await this.valueRepo.findByRunId(runId);
        return values.reduce((acc, v) => {
            acc[v.stepId] = v.value;
            return acc;
        }, {} as Record<string, any>);
    }
}

export const runPersistenceWriter = new RunPersistenceWriter();
