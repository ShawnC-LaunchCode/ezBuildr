import { InsertWorkflowRun, WorkflowRun } from "@shared/schema";

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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- Drizzle update type mismatch with Partial<WorkflowRun>
        await this.runRepo.update(runId, data as any);
    }
    /**
     * Save a single step value
     */
    async saveStepValue(runId: string, stepId: string, value: unknown, workflowId: string): Promise<void> {
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
     * Bulk save values.
     * One workflow-membership prefetch + one batched upsert, instead of
     * (step lookup + section lookup + upsert) sequentially per value.
     */
    async bulkSaveValues(runId: string, values: Array<{ stepId: string, value: unknown }>, workflowId: string): Promise<void> {
        if (values.length === 0) {return;}
        const workflowSteps = await this.stepRepo.findByWorkflowIdWithAliases(workflowId);
        const validStepIds = new Set(workflowSteps.map(s => s.id));
        // Dedupe by stepId (last write wins) — a single INSERT ... ON CONFLICT
        // cannot touch the same row twice
        const byStepId = new Map<string, unknown>();
        for (const v of values) {
            if (!validStepIds.has(v.stepId)) {
                throw new Error(`Step ${v.stepId} does not belong to workflow ${workflowId}`);
            }
            byStepId.set(v.stepId, v.value);
        }
        await this.valueRepo.upsertMany(
            Array.from(byStepId.entries(), ([stepId, value]) => ({ runId, stepId, value }))
        );
    }
    /**
     * Get all values for a run
     */
    async getRunValues(runId: string): Promise<Record<string, unknown>> {
        const values = await this.valueRepo.findByRunId(runId);
        return values.reduce<Record<string, unknown>>((acc, v) => {
            acc[v.stepId] = v.value;
            return acc;
        }, {});
    }
}
export const runPersistenceWriter = new RunPersistenceWriter();