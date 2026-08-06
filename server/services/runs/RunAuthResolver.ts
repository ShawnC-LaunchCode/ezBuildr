import { WorkflowRun } from "@shared/schema";

import { workflowRepository, workflowRunRepository, projectRepository } from "../../repositories";
import { createError } from "../../utils/errors";
import { workflowService } from "../WorkflowService";
export interface RunAuthContext {
    run?: WorkflowRun;
    mode: 'live' | 'preview';
    access: 'owner' | 'creator' | 'assignee' | 'public' | 'none';
    userId?: string;
    tenantId?: string;
}
export class RunAuthResolver {
    constructor(
        private runRepo = workflowRunRepository,
        private workflowRepo = workflowRepository,
        private projectRepo = projectRepository,
        private workflowSvc = workflowService
    ) { }
    /**
     * Resolve access to a run
     */
    async resolveRun(runId: string, userId: string | undefined): Promise<RunAuthContext> {
        const run = await this.runRepo.findById(runId);
        if (!run) {
            // If not found, check if it's a "virtual" run (e.g. preview token)
            // For now, assume DB persistence is required for all runs.
            return { mode: 'live', access: 'none' };
        }
        // Determine access level
        let access: RunAuthContext['access'] = 'none';
        if (userId) {
            // 1. Check if user created the run
            if (run.createdBy === userId || run.createdBy === `creator:${userId}`) {
                access = 'creator';
            }
            else if (run.assignedToUserId === userId) {
                access = 'assignee';
            }
            // 2. Check if user owns the workflow
            else {
                try {
                    await this.workflowSvc.verifyAccess(run.workflowId, userId);
                    access = 'owner';
                } catch {
                    access = 'none';
                }
            }
        } else {
            // Anonymous access? Only if run allows it or it's public?
            // Usually anonymous users can only access their own session-based runs?
            // For now, if no user, check if public workflow?
            const workflow = await this.workflowRepo.findById(run.workflowId);
            if (workflow?.isPublic) {
                access = 'public';
            }
        }
        // Determine mode
        // (Could be stored on run or inferred)
        const mode = 'live'; // Default for now, can be enhanced
        // Get tenant context
        const tenantId = await this.getTenantId(run.workflowId);
        return {
            run,
            mode,
            access,
            userId,
            tenantId
        };
    }
    /**
     * Get tenant ID for a workflow
     */
    private async getTenantId(workflowId: string): Promise<string | undefined> {
        try {
            const workflow = await this.workflowRepo.findById(workflowId);
            if (!workflow?.projectId) {return undefined;}
            const project = await this.projectRepo.findById(workflow.projectId);
            return project?.tenantId ?? undefined;
        } catch {
            return undefined;
        }
    }
    /**
     * Verify access for creating a run
     */
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    async verifyCreateAccess(idOrSlug: string, userId: string | undefined) {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
        const workflow = isUuid
            ? await this.workflowRepo.findById(idOrSlug)
            : await this.workflowRepo.findByPublicLink(idOrSlug)
                ?? await this.workflowRepo.findBySlug(idOrSlug);

        if (workflow?.status === 'active' && workflow.isPublic) {
            if (workflow.requireLogin && !userId) {
                throw createError.unauthorized('Authentication required for this workflow');
            }
            return workflow;
        }

        if (userId && workflow) {
            // Private and draft launches remain creator-only and tenant-scoped.
            return this.workflowSvc.verifyAccess(workflow.id, userId);
        }

        // Do not reveal whether a public URL points at a private or inactive workflow.
        throw createError.notFound('Workflow');
    }
}
export const runAuthResolver = new RunAuthResolver();
