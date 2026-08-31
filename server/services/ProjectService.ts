import { and, eq, inArray } from "drizzle-orm";

import type { Project, InsertProject, Workflow, ProjectAccess, PrincipalType, AccessRole } from "@shared/schema";
import { workflows, workflowRuns, datavaultDatabases, datavaultTables, workflowDataSources } from "@shared/schema";

import {
  projectRepository,
  workflowRepository,
  projectAccessRepository,
  type DbTransaction,
  type ProjectListOptions,
  type ProjectWithOwnerName,
} from "../repositories";
import { canCreateWithOwnership, canManageOrg, isOrgMember } from "../utils/ownershipAccess";
import { withCurrentTenant } from "../utils/rlsContext";

import { aclService } from "./AclService";
import { transferService } from "./TransferService";
/**
 * Service layer for project-related business logic
 *
 * RLS-2d: VARIANT 1 (§2c) — no method here takes an explicit `tenantId`
 * argument; authorization is ACL-based (`aclService.resolveRoleForProject`),
 * not a tenant comparison, so there is nothing to cross-check the ambient
 * tenant against. `withTx` is the two-argument form: reuse a caller-supplied
 * `tx`, otherwise open exactly one via `withCurrentTenant`. `projectRepo`,
 * `workflowRepo`, `projectAccessRepo` and `aclService.resolveRoleForProject`
 * already threaded `tx` through `BaseRepository.getDb(tx)` before this
 * ticket — no repository changes were needed. `transferOwnership` and
 * `grantProjectAccess`/`revokeProjectAccess` used to open their own
 * `db.transaction(...)` directly; that is now `withTx`, so the GUC actually
 * gets set on the transaction they already had.
 */
export class ProjectService {
  private projectRepo: typeof projectRepository;
  private workflowRepo: typeof workflowRepository;
  private projectAccessRepo: typeof projectAccessRepository;
  constructor(
    projectRepo?: typeof projectRepository,
    workflowRepo?: typeof workflowRepository,
    projectAccessRepo?: typeof projectAccessRepository
  ) {
    this.projectRepo = projectRepo ?? projectRepository;
    this.workflowRepo = workflowRepo ?? workflowRepository;
    this.projectAccessRepo = projectAccessRepo ?? projectAccessRepository;
  }

  /**
   * Run `fn` inside a tenant-scoped transaction opened at this service
   * boundary (RLS-2d, copying RLS-2a's `withTx` shape — see
   * docs/architecture/TENANT_ISOLATION_RLS.md §2b/§2c). Reuses a
   * caller-supplied `tx` if given; otherwise opens exactly one via
   * `withCurrentTenant`.
   */
  private async withTx<T>(
    tx: DbTransaction | undefined,
    fn: (tx: DbTransaction) => Promise<T>
  ): Promise<T> {
    if (tx) {
      return fn(tx);
    }
    return withCurrentTenant(fn);
  }

  private hasMinimumRole(userRole: AccessRole, minRole: Exclude<AccessRole, 'none'>): boolean {
    const rolePrecedence: Record<AccessRole, number> = {
      owner: 4,
      edit: 3,
      view: 2,
      none: 1,
    };
    return rolePrecedence[userRole] >= rolePrecedence[minRole];
  }

  private async requireOrgAdminForOrgOwnedProject(project: Project, userId: string, action: string, tx?: DbTransaction): Promise<void> {
    if (project.ownerType === 'org' && project.ownerUuid && !(await canManageOrg(userId, project.ownerUuid, tx))) {
      throw new Error(`Access denied: Organization admin role required to ${action} organization projects`);
    }
  }

  async verifyProjectAccess(
    projectId: string,
    userId: string,
    minRole: Exclude<AccessRole, 'none'> = 'view',
    tx?: DbTransaction
  ): Promise<Project> {
    return this.withTx(tx, async (tx) => {
      const project = await this.projectRepo.findById(projectId, tx);
      if (!project) {
        throw new Error("Project not found");
      }

      const userRole = await aclService.resolveRoleForProject(userId, projectId, tx);
      if (!this.hasMinimumRole(userRole, minRole)) {
        throw new Error("Access denied - insufficient permissions for this project");
      }

      return project;
    });
  }

  /**
   * Verify user owns or has access to the project (ownership-based access)
   */
  async verifyOwnership(projectId: string, userId: string, tx?: DbTransaction): Promise<Project> {
    return this.verifyProjectAccess(projectId, userId, 'view', tx);
  }
  /**
   * Create a new project
   */
  async createProject(data: InsertProject, creatorId: string): Promise<Project> {
    return this.withTx(undefined, async (tx) => {
      // Validate ownership before creating
      const ownerType = data.ownerType ?? 'user';
      const ownerUuid = data.ownerUuid ?? creatorId;

      if (ownerType === 'org') {
        const canManage = await canManageOrg(creatorId, ownerUuid, tx);
        if (!canManage) {
          throw new Error('Access denied: Organization admin role required to create organization projects');
        }
      } else {
        const canCreate = await canCreateWithOwnership(creatorId, ownerType, ownerUuid, tx);
        if (!canCreate) {
          throw new Error('Access denied: You do not have permission to create assets with this ownership');
        }
      }

      const title = data.title ?? data.name ?? 'Untitled Project';
      return this.projectRepo.create({
        ...data,
        title,
        name: data.name ?? title,
        creatorId: creatorId, // Legacy field (required)
        createdBy: creatorId,
        ownerId: creatorId, // Creator is also the initial owner (legacy)
        ownerType,
        ownerUuid,
        status: 'active',
      }, tx);
    });
  }
  /**
   * Get project by ID with contained workflows
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async getProjectWithWorkflows(projectId: string, userId: string) {
    return this.withTx(undefined, async (tx) => {
      const project = await this.verifyProjectAccess(projectId, userId, 'view', tx);
      const workflows = await this.workflowRepo.findByProjectId(projectId, undefined, tx);
      return {
        ...project,
        workflows,
      };
    });
  }
  /**
   * List all projects for a user
   */
  async listProjects(creatorId: string, options: ProjectListOptions = {}): Promise<ProjectWithOwnerName[]> {
    return this.withTx(undefined, (tx) => this.projectRepo.findByCreatorId(creatorId, options, tx));
  }
  /**
   * List active (non-archived) projects for a user
   */
  async listActiveProjects(creatorId: string, options: ProjectListOptions = {}): Promise<ProjectWithOwnerName[]> {
    return this.withTx(undefined, (tx) => this.projectRepo.findActiveByCreatorId(creatorId, options, tx));
  }
  /**
   * List projects owned by a specific organization.
   */
  async listOrganizationProjects(orgId: string, userId: string, activeOnly = true): Promise<ProjectWithOwnerName[]> {
    return this.withTx(undefined, async (tx) => {
      const isMember = await isOrgMember(userId, orgId, tx);
      if (!isMember) {
        throw new Error("Access denied - you do not have permission to access this organization");
      }
      return this.projectRepo.findByOwner('org', orgId, activeOnly, tx);
    });
  }
  /**
   * Update project
   */
  async updateProject(
    projectId: string,
    userId: string,
    data: Partial<InsertProject>
  ): Promise<Project> {
    return this.withTx(undefined, async (tx) => {
      const project = await this.verifyProjectAccess(projectId, userId, 'edit', tx);
      if (data.status !== undefined || data.archived !== undefined) {
        const willArchive = data.status === 'archived' || data.archived === true;
        await this.requireOrgAdminForOrgOwnedProject(project, userId, willArchive ? 'archive' : 'unarchive', tx);
      }
      return this.projectRepo.update(projectId, data, tx);
    });
  }
  /**
   * Shared write path for the project soft delete.
   *
   * Deleting a project does not remove the row — it flips it to the archived
   * state and leaves its workflows attached, so `?active=true` (the default the
   * UI reads) stops listing it while nothing is destroyed.
   *
   * This was once shared with a second, separate "archive project" entry point
   * gated at 'edit'. That action wrote a byte-identical row to delete's, which
   * made an owner-deleted project indistinguishable from an edit-role archive
   * and let an edit-role user resurrect what an owner had deleted (old Backlog
   * B6). It was removed rather than fixed: it duplicated delete at a weaker
   * permission level and had no reachable UI. This is now the only caller.
   */
  private async writeSoftDeletedState(projectId: string, tx?: DbTransaction): Promise<Project> {
    return this.projectRepo.update(projectId, {
      status: 'archived',
      archived: true,
    }, tx);
  }
  /**
   * Delete project (soft delete — workflows are retained, not detached or
   * destroyed). Gated at 'owner', plus org-admin for org-owned projects.
   */
  async deleteProject(projectId: string, userId: string): Promise<void> {
    await this.withTx(undefined, async (tx) => {
      const project = await this.verifyProjectAccess(projectId, userId, 'owner', tx);
      await this.requireOrgAdminForOrgOwnedProject(project, userId, 'delete', tx);
      await this.writeSoftDeletedState(projectId, tx);
    });
  }
  /**
   * Get workflows in a project
   */
  async getProjectWorkflows(projectId: string, userId: string): Promise<Workflow[]> {
    return this.withTx(undefined, async (tx) => {
      await this.verifyProjectAccess(projectId, userId, 'view', tx);
      return this.workflowRepo.findByProjectId(projectId, undefined, tx);
    });
  }
  /**
   * Count workflows in a project
   */
  async countProjectWorkflows(projectId: string, userId: string): Promise<number> {
    return this.withTx(undefined, async (tx) => {
      await this.verifyProjectAccess(projectId, userId, 'view', tx);
      const workflows = await this.workflowRepo.findByProjectId(projectId, undefined, tx);
      return workflows.length;
    });
  }
  // ===================================================================
  // ACL MANAGEMENT METHODS
  // ===================================================================
  /**
   * Get all ACL entries for a project
   */
  async getProjectAccess(projectId: string, userId: string, tx?: DbTransaction): Promise<ProjectAccess[]> {
    return this.withTx(tx, async (tx) => {
      await this.verifyProjectAccess(projectId, userId, 'view', tx);
      return this.projectAccessRepo.findByProjectId(projectId, tx);
    });
  }
  /**
   * Grant or update access to a project
   * Only owner can grant 'owner' role to others
   *
   * The authorization check and the write loop now run inside the SAME
   * `withTx`-opened transaction (RLS-2d) — previously the read ran outside
   * any transaction and the writes opened their own via `db.transaction`
   * directly, which never set the tenant GUC. Every entry must apply or none
   * do (PROJ-9); a mid-loop DB error rolls back all prior upserts in the
   * same call instead of leaving a partial ACL change.
   */
  async grantProjectAccess(
    projectId: string,
    requestorId: string,
    entries: Array<{ principalType: PrincipalType; principalId: string; role: Exclude<AccessRole, 'none'> }>,
    tx?: DbTransaction
  ): Promise<ProjectAccess[]> {
    return this.withTx(tx, async (tx) => {
      await this.verifyProjectAccess(projectId, requestorId, 'owner', tx);
      return this._grantProjectAccessImpl(projectId, entries, tx);
    });
  }
  /**
   * Internal implementation of grantProjectAccess.
   * Must be called within a transaction; every repo call below MUST use
   * `tx` (not the pool `db`) — a pool query issued while the transaction
   * still holds the connection deadlocks the size-1 test pool.
   */
  private async _grantProjectAccessImpl(
    projectId: string,
    entries: Array<{ principalType: PrincipalType; principalId: string; role: Exclude<AccessRole, 'none'> }>,
    tx: DbTransaction
  ): Promise<ProjectAccess[]> {
    const results: ProjectAccess[] = [];
    for (const entry of entries) {
      const acl = await this.projectAccessRepo.upsert(
        projectId,
        entry.principalType,
        entry.principalId,
        entry.role,
        tx
      );
      results.push(acl);
    }
    return results;
  }
  /**
   * Revoke access from a project
   *
   * Same tx-reuse/atomicity shape as `grantProjectAccess` — see its doc
   * comment.
   */
  async revokeProjectAccess(
    projectId: string,
    requestorId: string,
    entries: Array<{ principalType: PrincipalType; principalId: string }>,
    tx?: DbTransaction
  ): Promise<void> {
    await this.withTx(tx, async (tx) => {
      await this.verifyProjectAccess(projectId, requestorId, 'owner', tx);
      return this._revokeProjectAccessImpl(projectId, entries, tx);
    });
  }
  /**
   * Internal implementation of revokeProjectAccess.
   * Must be called within a transaction; every repo call below MUST use
   * `tx` (not the pool `db`) — see `_grantProjectAccessImpl` above.
   */
  private async _revokeProjectAccessImpl(
    projectId: string,
    entries: Array<{ principalType: PrincipalType; principalId: string }>,
    tx: DbTransaction
  ): Promise<void> {
    for (const entry of entries) {
      await this.projectAccessRepo.deleteByPrincipal(
        projectId,
        entry.principalType,
        entry.principalId,
        tx
      );
    }
  }
  /**
   * Transfer project ownership (new ownership model)
   * Cascades to all child workflows AND their runs
   *
   * @param projectId - Project to transfer
   * @param userId - User requesting transfer
   * @param targetOwnerType - 'user' or 'org'
   * @param targetOwnerUuid - UUID of target owner
   */
  async transferOwnership(
    projectId: string,
    userId: string,
    targetOwnerType: 'user' | 'org',
    targetOwnerUuid: string
  ): Promise<Project> {
    // Everything below — the authorization reads, the validation, and the
    // multi-table cascade — now runs inside ONE `withTx`-opened transaction
    // (RLS-2d). Previously the reads ran outside any transaction and the
    // cascade opened its own via `db.transaction` directly, which never set
    // the tenant GUC. A failure partway (network blip, constraint violation)
    // still cannot leave the project pointing at the new owner while
    // workflows, runs, or DataVault assets still belong to the old one.
    return this.withTx(undefined, async (tx) => {
      const project = await this.verifyProjectAccess(projectId, userId, 'owner', tx);
      await this.requireOrgAdminForOrgOwnedProject(project, userId, 'transfer', tx);
      // Transfer-into-org requires org membership (not admin); validateTransfer
      // checks target existence first ("not found") then membership ("not a member").
      await transferService.validateTransfer(
        userId,
        project.ownerType ?? 'user',
        project.ownerUuid ?? project.ownerId ?? project.createdBy ?? project.creatorId,
        { ownerType: targetOwnerType, ownerUuid: targetOwnerUuid },
        tx
      );
      // Update project ownership
      const updatedProject = await this.projectRepo.update(
        projectId,
        {
          ownerType: targetOwnerType,
          ownerUuid: targetOwnerUuid,
        },
        tx
      );
      // Cascade: Transfer all child workflows to same owner
      const projectWorkflows = await this.workflowRepo.findByProjectId(projectId, undefined, tx);
      const workflowIds = projectWorkflows.map(w => w.id);
      if (workflowIds.length > 0) {
        // Bulk-update every workflow in one round trip (mirrors the
        // workflowRuns update below, instead of one query per workflow).
        await tx
          .update(workflows)
          .set({
            ownerType: targetOwnerType,
            ownerUuid: targetOwnerUuid,
            updatedAt: new Date(),
          })
          .where(inArray(workflows.id, workflowIds));
        // Cascade ownership to all runs for these workflows
        await tx
          .update(workflowRuns)
          .set({
            ownerType: targetOwnerType,
            ownerUuid: targetOwnerUuid,
          })
          .where(inArray(workflowRuns.workflowId, workflowIds));
      }
      const linkedDatabaseRows = workflowIds.length > 0
        ? await tx
          .select({ id: workflowDataSources.dataSourceId })
          .from(workflowDataSources)
          .where(inArray(workflowDataSources.workflowId, workflowIds))
        : [];
      const databaseIds = new Set<string>(linkedDatabaseRows.map((row) => row.id));
      const scopedDatabases = await tx
        .select({ id: datavaultDatabases.id })
        .from(datavaultDatabases)
        .where(and(eq(datavaultDatabases.scopeType, 'project'), eq(datavaultDatabases.scopeId, projectId)));
      scopedDatabases.forEach((row) => databaseIds.add(row.id));
      if (workflowIds.length > 0) {
        const workflowScopedDatabases = await tx
          .select({ id: datavaultDatabases.id })
          .from(datavaultDatabases)
          .where(and(eq(datavaultDatabases.scopeType, 'workflow'), inArray(datavaultDatabases.scopeId, workflowIds)));
        workflowScopedDatabases.forEach((row) => databaseIds.add(row.id));
      }
      if (databaseIds.size > 0) {
        await tx
          .update(datavaultDatabases)
          .set({
            ownerType: targetOwnerType,
            ownerUuid: targetOwnerUuid,
            updatedAt: new Date(),
          })
          .where(inArray(datavaultDatabases.id, [...databaseIds]));
        await tx
          .update(datavaultTables)
          .set({
            ownerType: targetOwnerType,
            ownerUuid: targetOwnerUuid,
            updatedAt: new Date(),
          })
          .where(inArray(datavaultTables.databaseId, [...databaseIds]));
      }
      return updatedProject;
    });
  }
}
// Singleton instance
export const projectService = new ProjectService();
