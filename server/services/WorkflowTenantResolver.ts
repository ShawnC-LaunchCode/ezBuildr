import { sql } from 'drizzle-orm';

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

/**
 * RLS-5: read one user row during tenant BOOTSTRAP.
 *
 * This resolver answers "given a workflow, which tenant owns it?" — a question
 * that by definition must be answerable BEFORE a tenant is known, so no tenant
 * GUC is pinned while it runs. Migration `0030` makes the *workflow* readable
 * that way, but deriving its tenant then needs `users` (and `projects`, and
 * `organizations`), which are RLS-covered in their own right — so resolution
 * found the workflow and still returned null, and every caller treated that as
 * "deny". Measured: `RunLifecycleService` failed 8/8 document generations with
 * "Workflow not found" on workflows that plainly existed, and `runTokenAuth`
 * has the same hole but swallows it as best-effort, so no test ever showed it.
 *
 * The user ids reached here (`ownerUuid`, `creatorId`, `ownerId`) all come off
 * a workflow row that was itself legitimately read, so pinning one is the same
 * verified-foreign-key shape `0030` already uses — and `users`' existing
 * self-identification clause (`0028`) is what makes it visible. No new
 * migration is needed for this path.
 *
 * The GUC is transaction-local. When the caller supplied a `tx` it stays set
 * for the remainder of THAT transaction, which is deliberate and bounded: the
 * clause is read-only and exposes exactly the one row already being read.
 */
async function readUserForBootstrap(
  userId: string,
  tx?: DbTransaction
): Promise<{ tenantId: string | null } | undefined> {
  if (tx) {
    await tx.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
    return userRepository.findById(userId, tx);
  }
  const { withCurrentUserId } = await import('../utils/rlsContext');
  return withCurrentUserId(userId, (scopedTx) => userRepository.findById(userId, scopedTx));
}

/**
 * The same bootstrap read for `projects` / `organizations` (migration 0033).
 *
 * These two are why the user-only fix was not enough. `resolveForWorkflow`
 * tries the PROJECT tenant FIRST, so with only `users` reachable a filed
 * workflow did not fail — it fell through to the creator and resolved THAT
 * person's tenant, which is usually the same one and silently is not after a
 * project transfer. Resolving confidently wrong is worse than resolving
 * nothing, so this closes the fall-through rather than relying on it.
 *
 * `gucName` is a literal chosen here, never derived from input, and the id is
 * always one read off an already-legitimately-read workflow row.
 */
async function readOwnerTableForBootstrap<T>(
  gucName: 'app.current_project_id' | 'app.current_org_id',
  id: string,
  read: (tx?: DbTransaction) => Promise<T>,
  tx?: DbTransaction
): Promise<T> {
  if (tx) {
    await tx.execute(sql`SELECT set_config(${gucName}, ${id}, true)`);
    return read(tx);
  }
  const { withVerifiedIdentifier } = await import('../utils/rlsContext');
  return withVerifiedIdentifier(gucName, id, (scopedTx) => read(scopedTx));
}

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
      const user = await readUserForBootstrap(ownerUuid, tx);
      return isValidUuid(user?.tenantId) ? user!.tenantId : null;
    }

    if (ownerType === 'org') {
      const organization = await readOwnerTableForBootstrap(
        'app.current_org_id',
        ownerUuid,
        (scopedTx) => organizationRepository.findById(ownerUuid, scopedTx),
        tx
      );
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
      const projectId = workflow.projectId;
      const project = await readOwnerTableForBootstrap(
        'app.current_project_id',
        projectId,
        (scopedTx) => projectRepository.findById(projectId, scopedTx),
        tx
      );
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
      const user = await readUserForBootstrap(userId, tx);
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
