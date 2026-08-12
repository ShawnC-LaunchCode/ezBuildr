import type { Workflow, WorkflowRun } from '@shared/schema';

import { createLogger } from '../logger';
import {
  type DbTransaction,
  organizationRepository,
  projectRepository,
  userRepository,
  workflowRepository,
} from '../repositories';

const logger = createLogger({ module: 'workflow-tenant-resolver' });

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(val?: string | null): boolean {
  return !!val && UUID_REGEX.test(val);
}

/**
 * Which rule produced the tenant. Callers that need to log or assert *why* a
 * tenant was chosen should read this rather than re-deriving it.
 */
export type TenantResolutionSource =
  | 'run-owner'
  | 'project'
  | 'workflow-owner'
  | 'workflow-creator'
  | 'run-creator'
  | 'unresolved';

export interface TenantResolution {
  tenantId: string | null;
  source: TenantResolutionSource;
}

/**
 * Resolves the tenant that scopes a workflow's data access.
 *
 * ## Why this is centralized
 *
 * `workflows` has no `tenant_id` column — the tenant is *derived* from
 * ownership. Before this service there were seven private copies of that
 * derivation (five block runners, `BrandingService`, `DocumentDeliveryService`)
 * and they did not agree. Two failure modes came out of that:
 *
 * 1. **`ownerUuid` read as a tenant id.** It is a *user or organization* id
 *    discriminated by `ownerType`; using it directly as `tenant_id` produced an
 *    IDOR and FK failures (GH-170).
 * 2. **Ownership ignored entirely.** Six of the seven resolved only
 *    `project → creator` and never looked at `ownerType`/`ownerUuid`. That is
 *    wrong for any transferred workflow: `WorkflowService.transferOwnership()`
 *    rewrites `ownerType`/`ownerUuid`, **nulls `projectId`** when the project's
 *    owner differs, moves the linked DataVault databases/tables to the new
 *    owner — and deliberately leaves `creatorId` alone. Those six therefore
 *    resolved the *original creator's* tenant while the data they were about to
 *    read and write had moved to the *new owner's* tenant.
 *
 * ## Precedence
 *
 * Ordered most-specific to most-legacy. This matches the order reviewed and
 * shipped in `DocumentDeliveryService` (GH-170), which was the only correct
 * copy; the others are migrated onto it.
 *
 * 1. **Run owner** — a run carries its own `ownerType`/`ownerUuid`, kept in
 *    sync by `transferOwnership`, so it is the most current principal.
 * 2. **Project** — a filed workflow inherits its project's tenant.
 * 3. **Workflow owner** — an unfiled workflow's user/org principal. This is the
 *    step the six older copies were missing.
 * 4. **Workflow creator** — legacy `creatorId`/`ownerId` rows predating
 *    ownership columns.
 * 5. **Run creator** — an authenticated respondent (`creator:<userId>`).
 *
 * Every step is fail-closed: a missing or non-UUID tenant falls through rather
 * than being returned, and exhausting all five yields `null`. Callers must
 * treat `null` as "deny", never as "unscoped".
 */
export class WorkflowTenantResolver {
  /**
   * Resolve the tenant for a principal, discriminated by `ownerType`.
   *
   * `ownerUuid` is a users.id when `ownerType === 'user'` and an
   * organizations.id when `ownerType === 'org'`. It is never a tenant id.
   */
  async resolvePrincipalTenantId(
    ownerType: string | null | undefined,
    ownerUuid: string | null | undefined,
    tx?: DbTransaction
  ): Promise<string | null> {
    if (!ownerUuid) {
      return null;
    }

    if (ownerType === 'user') {
      const user = await userRepository.findById(ownerUuid, tx);
      return isValidUuid(user?.tenantId) ? user!.tenantId : null;
    }

    if (ownerType === 'org') {
      const organization = await organizationRepository.findById(ownerUuid, tx);
      return isValidUuid(organization?.tenantId) ? organization!.tenantId : null;
    }

    return null;
  }

  /**
   * Resolve the tenant for a workflow, with no run in context.
   *
   * This is the entry point for block runners and branding — anything keyed on
   * a workflow id alone.
   */
  async resolveForWorkflowId(
    workflowId: string,
    tx?: DbTransaction
  ): Promise<string | null> {
    const workflow = await workflowRepository.findById(workflowId, tx);
    if (!workflow) {
      logger.warn({ workflowId }, 'Tenant resolution failed: workflow not found');
      return null;
    }
    const { tenantId, source } = await this.resolveForWorkflow(workflow, tx);
    if (!tenantId) {
      logger.warn(
        { workflowId, creatorId: workflow.creatorId, ownerType: workflow.ownerType },
        'Tenant resolution failed: no project, owner, or creator tenant'
      );
    } else {
      logger.debug({ workflowId, source }, 'Resolved workflow tenant');
    }
    return tenantId;
  }

  /** Steps 2-4, given an already-loaded workflow. */
  async resolveForWorkflow(
    workflow: Workflow | null | undefined,
    tx?: DbTransaction
  ): Promise<TenantResolution> {
    // 2. Project tenant.
    if (workflow?.projectId) {
      const project = await projectRepository.findById(workflow.projectId, tx);
      if (isValidUuid(project?.tenantId)) {
        return { tenantId: project!.tenantId, source: 'project' };
      }
    }

    // 3. Workflow owner principal (user or org).
    const ownerTenantId = await this.resolvePrincipalTenantId(
      workflow?.ownerType,
      workflow?.ownerUuid,
      tx
    );
    if (ownerTenantId) {
      return { tenantId: ownerTenantId, source: 'workflow-owner' };
    }

    // 4. Legacy creator/owner user columns.
    const userId = workflow?.creatorId ?? workflow?.ownerId;
    if (userId) {
      const user = await userRepository.findById(userId, tx);
      if (isValidUuid(user?.tenantId)) {
        return { tenantId: user!.tenantId, source: 'workflow-creator' };
      }
    }

    return { tenantId: null, source: 'unresolved' };
  }

  /**
   * Resolve the tenant for a run, preferring the run's own principal.
   *
   * Used by delivery, where the run outlives the builder session and may have
   * been transferred after it started.
   */
  async resolveForRun(
    run: WorkflowRun,
    workflow: Workflow | null | undefined,
    tx?: DbTransaction
  ): Promise<string | null> {
    // 1. Runs inherit the workflow's real principal after ownership transfers.
    const runOwnerTenantId = await this.resolvePrincipalTenantId(
      run.ownerType,
      run.ownerUuid,
      tx
    );
    if (runOwnerTenantId) {
      return runOwnerTenantId;
    }

    const { tenantId } = await this.resolveForWorkflow(workflow, tx);
    if (tenantId) {
      return tenantId;
    }

    // 5. Authenticated respondent who created the run.
    if (run.createdBy?.startsWith('creator:')) {
      const runUserId = run.createdBy.slice('creator:'.length);
      const user = await userRepository.findById(runUserId, tx);
      if (isValidUuid(user?.tenantId)) {
        return user!.tenantId;
      }
    }

    return null;
  }
}

export const workflowTenantResolver = new WorkflowTenantResolver();
