import { WorkflowRun } from "@shared/schema";

import { logger } from "../../logger";
import { workflowRepository, workflowRunRepository, projectRepository } from "../../repositories";
import { workflowService } from "../WorkflowService";

export interface RunAuthContext {
    run?: WorkflowRun;
    mode: 'live' | 'preview';
    access: 'owner' | 'creator' | 'public' | 'none';
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
    async verifyCreateAccess(idOrSlug: string, userId: string | undefined) {
        if (userId) {
            // Authenticated: verify ownership/access
            return this.workflowSvc.verifyAccess(idOrSlug, userId);
        } else {
            // Anonymous: verify public access
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
            let workflow;

            if (isUuid) {
                workflow = await this.workflowRepo.findById(idOrSlug);
            } else {
                workflow = await this.workflowRepo.findByPublicLink(idOrSlug);
            }

            if (!workflow) {throw new Error('Workflow not found');}
            if (workflow.status !== 'active') {throw new Error('Workflow is not active');}
            if (!workflow.isPublic) {throw new Error('Workflow is not public');}

            return workflow;
        }
    }
}

export const runAuthResolver = new RunAuthResolver();
