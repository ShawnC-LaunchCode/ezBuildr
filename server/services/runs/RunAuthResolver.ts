import { WorkflowRun, type Workflow } from "@shared/schema";

import { workflowRepository, workflowRunRepository, projectRepository, type DbTransaction } from "../../repositories";
import { createError } from "../../utils/errors";
import { workflowService } from "../WorkflowService";
import { workflowTenantResolver } from "../WorkflowTenantResolver";
import { getCurrentTenantId, setCurrentTenantId, withCurrentTenant, withVerifiedIdentifier } from "../../utils/rlsContext";
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
    /**
     * RLS-5: this is a tenant DISCOVERY function, so it must not require a
     * tenant to already be in context — and it used to read `workflows` and
     * `projects` (both RLS-covered) on the bare pool. Under enforcement both
     * came back empty, `tenantId` was undefined, and `RunResumeService.authorize`
     * refused every legitimate caller with "Access denied - run has no tenant":
     * the fail-closed direction, where an isolation bug denies the owner rather
     * than leaking to a stranger.
     *
     * Delegates to the shared `WorkflowTenantResolver` rather than re-deriving
     * project -> tenant here. That resolver also handles `ownerType`/`ownerUuid`,
     * which this copy ignored — so a transferred workflow resolved to the wrong
     * tenant even before RLS. It runs under `app.current_workflow_id`
     * (migration 0030) so the ownership-derived read succeeds with no ambient
     * tenant, which is exactly the run-token and webhook case.
     */
    private async getTenantId(workflowId: string): Promise<string | undefined> {
        try {
            const tenantId = await withVerifiedIdentifier(
                'app.current_workflow_id',
                workflowId,
                (tx) => workflowTenantResolver.resolveForWorkflowId(workflowId, tx)
            );
            return tenantId ?? undefined;
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
        const lookupWorkflow = async (tx?: DbTransaction): Promise<Workflow | null | undefined> => (
            isUuid
                ? this.workflowRepo.findById(idOrSlug, tx)
                : (await this.workflowRepo.findByPublicLink(idOrSlug, tx))
                    ?? this.workflowRepo.findBySlug(idOrSlug, tx)
        );
        // RLS-4 precondition 2 (closed): `workflows` is RLS-covered. A
        // PUBLIC workflow is visible on the bare pool regardless (0031's
        // declared-visibility clause needs no tenant), which is why this
        // lookup already worked for the anonymous public-link path. A
        // PRIVATE workflow does not carry that clause — it needs the
        // requester's real tenant, which `hybridAuth` already resolved into
        // the async context (0028) for an authenticated caller. Use it via
        // `withCurrentTenant` when one exists; when none does (anonymous),
        // run unscoped exactly as before — `withCurrentTenant` only THROWS
        // for a missing tenant once `RLS_ENFORCED=true`, and forcing a
        // tenant requirement here would break the anonymous public-link path
        // this method exists to serve.
        const workflow = getCurrentTenantId() !== undefined
            ? await withCurrentTenant((tx) => lookupWorkflow(tx))
            : await lookupWorkflow();

        // RLS-2e (reviewer fix): this is the earliest point at which the run's
        // workflow — and therefore its tenant — is known, and it runs BEFORE
        // any RLS-converted service. An anonymous public-link run has no
        // authenticated user, and a run-token request is not a tenant JWT, so
        // nothing upstream has populated the async tenant context; without this
        // every converted service below throws "RLS: no tenant in context." and
        // the public runner 500s.
        //
        // Only fills an EMPTY context — never overrides a real authenticated
        // tenant — and is best-effort: if resolution fails the context stays
        // empty and the downstream service fails closed rather than running
        // against an invented tenant.
        if (workflow && getCurrentTenantId() === undefined) {
            try {
                const { tenantId } = await workflowTenantResolver.resolveForWorkflow(workflow);
                if (tenantId) {
                    setCurrentTenantId(tenantId);
                }
            } catch {
                // fall through; downstream fails closed
            }
        }

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
