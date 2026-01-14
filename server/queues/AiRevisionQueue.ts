import Bull, { Job, Queue } from 'bull';

import { createLogger } from '../logger';
import { createAIServiceFromEnv } from '../services/AIService';
import { sectionService } from '../services/SectionService';
import { stepService } from '../services/StepService';
import { workflowService } from '../services/WorkflowService';

import type { AIWorkflowRevisionRequest } from '../../shared/types/ai';

const logger = createLogger({ module: 'ai-revision-queue' });

// ============================================================================
// TYPES
// ============================================================================

export interface AiRevisionJobData extends AIWorkflowRevisionRequest {
    userId: string;
}

export interface AiRevisionJobResult {
    success: boolean;
    updatedWorkflow?: any;
    diff?: any;
    error?: string;
    metadata?: {
        duration: number;
        changeCount: number;
    };
}

// ============================================================================
// QUEUE CONFIGURATION
// ============================================================================

const QUEUE_NAME = 'ai-revision';

const REDIS_CONFIG = {
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD,
        ...(process.env.REDIS_URL && { redis: process.env.REDIS_URL }),
    },
};

const JOB_OPTIONS = {
    attempts: 1, // Don't retry AI jobs automatically as they are expensive/non-idempotent often
    removeOnComplete: 100, // Keep last 100
    removeOnFail: 100,
    timeout: 600000, // 10 minutes timeout
};

// ============================================================================
// WORKER IMPLEMENTATION
// ============================================================================

const processRevisionJob = async (job: Job<AiRevisionJobData>): Promise<AiRevisionJobResult> => {
    const startTime = Date.now();
    const { userId, ...requestData } = job.data;

    logger.info({ jobId: job.id, workflowId: requestData.workflowId, userId }, 'Starting AI revision job');

    try {
        // 1. Verify Access (Double check in worker)
        await workflowService.verifyAccess(requestData.workflowId, userId, 'edit');

        // 2. Perform Revision
        const aiService = createAIServiceFromEnv();
        const revisionResult = await aiService.reviseWorkflow(requestData);

        // 3. Apply Changes to Database
        logger.info({
            jobId: job.id,
            workflowId: requestData.workflowId,
            changesCount: revisionResult.diff.changes.length
        }, 'Applying AI changes to database');

        const existingWorkflow = await workflowService.getWorkflowWithDetails(requestData.workflowId, userId);

        // Map existing IDs for updates vs creates
        const existingSectionIds = new Set((existingWorkflow.sections || []).map((s: any) => s.id));
        const existingStepIds = new Set(
            (existingWorkflow.sections || [])
                .flatMap((s: any) => (s.steps || []).map((step: any) => step.id))
        );

        // Process Workflow Properties
        const aiWorkflow = revisionResult.updatedWorkflow;
        const workflowUpdates: any = {};
        if (aiWorkflow.title && aiWorkflow.title !== existingWorkflow.title) {workflowUpdates.title = aiWorkflow.title;}
        if (aiWorkflow.description !== undefined && aiWorkflow.description !== existingWorkflow.description) {workflowUpdates.description = aiWorkflow.description;}

        if (Object.keys(workflowUpdates).length > 0) {
            await workflowService.updateWorkflow(requestData.workflowId, userId, workflowUpdates);
        }

        const processedSectionIds = new Set<string>();
        const processedStepIds = new Set<string>();
        const existingStepsByAlias = new Map<string, string>();

        // Build alias map
        for (const section of (existingWorkflow.sections || [])) {
            for (const step of (section.steps || [])) {
                if (step.alias) {existingStepsByAlias.set(step.alias, step.id);}
            }
        }

        // Process Sections & Steps
        for (const aiSection of (aiWorkflow.sections || [])) {
            const sectionData: any = {
                title: aiSection.title,
                description: aiSection.description || null,
                order: aiSection.order,
            };

            let sectionId: string;
            if (aiSection.id && existingSectionIds.has(aiSection.id)) {
                await sectionService.updateSectionById(aiSection.id, userId, sectionData);
                sectionId = aiSection.id;
            } else {
                const newSection = await sectionService.createSection(requestData.workflowId, userId, sectionData);
                sectionId = newSection.id;
            }
            processedSectionIds.add(sectionId);

            for (const aiStep of (aiSection.steps || [])) {
                const stepData: any = {
                    type: aiStep.type,
                    title: aiStep.title,
                    description: aiStep.description || null,
                    alias: aiStep.alias || null,
                    required: aiStep.required ?? false,
                    config: aiStep.config || {},
                    order: aiStep.order,
                    visibleIf: aiStep.visibleIf || null,
                    defaultValue: aiStep.defaultValue || null,
                };

                let existingStepId: string | undefined;
                if (aiStep.id && existingStepIds.has(aiStep.id)) {
                    existingStepId = aiStep.id;
                } else if (aiStep.alias && existingStepsByAlias.has(aiStep.alias)) {
                    existingStepId = existingStepsByAlias.get(aiStep.alias);
                }

                if (existingStepId) {
                    await stepService.updateStepById(existingStepId, userId, stepData);
                    processedStepIds.add(existingStepId);
                } else {
                    const newStep = await stepService.createStepBySectionId(sectionId, userId, stepData);
                    processedStepIds.add(newStep.id);
                }
            }
        }

        // Cleanup Orphans
        for (const existingSection of (existingWorkflow.sections || [])) {
            if (!processedSectionIds.has(existingSection.id)) {
                await sectionService.deleteSectionById(existingSection.id, userId);
            }
        }
        for (const existingSection of (existingWorkflow.sections || [])) {
            for (const existingStep of (existingSection.steps || [])) {
                if (!processedStepIds.has(existingStep.id)) {
                    await stepService.deleteStepById(existingStep.id, userId);
                }
            }
        }

        const duration = Date.now() - startTime;
        return {
            success: true,
            updatedWorkflow: revisionResult.updatedWorkflow,
            diff: revisionResult.diff,
            metadata: {
                duration,
                changeCount: revisionResult.diff.changes.length
            }
        };

    } catch (error: any) {
        logger.error({ error, jobId: job.id }, 'AI revision job failed');
        throw error; // Let Bull handle failure state
    }
};

// ============================================================================
// QUEUE INSTANCE
// ============================================================================

let queueInstance: Queue<AiRevisionJobData> | null = null;

export function getAiRevisionQueue(): Queue<AiRevisionJobData> {
    if (queueInstance) {return queueInstance;}

    queueInstance = new Bull<AiRevisionJobData>(QUEUE_NAME, REDIS_CONFIG);

    queueInstance.process(processRevisionJob);

    queueInstance.on('completed', (job) => {
        logger.info({ jobId: job.id }, 'AI revision job completed');
    });

    queueInstance.on('failed', (job, err) => {
        logger.error({ jobId: job.id, error: err.message }, 'AI revision job failed');
    });

    return queueInstance;
}

export async function enqueueAiRevision(data: AiRevisionJobData): Promise<Job<AiRevisionJobData>> {
    const queue = getAiRevisionQueue();
    return queue.add(data, JOB_OPTIONS);
}

export async function getAiRevisionJob(jobId: string): Promise<Job<AiRevisionJobData> | null> {
    const queue = getAiRevisionQueue();
    return queue.getJob(jobId);
}
