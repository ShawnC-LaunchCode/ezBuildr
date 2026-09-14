import { eq } from "drizzle-orm";

import { projects, users, workflows } from "@shared/schema";

import { db } from "../db";
import { adminDb, isAdminDbConfigured } from "../db/adminDb";
import {
  adminAccessLogRepository,
  type AdminAccessLogRepository,
} from "../repositories/AdminAccessLogRepository";
import {
  adminOrgStatsRepository,
  type AdminOrgStatsRepository,
  type AdminOrgStatsQueryRow,
} from "../repositories/AdminOrgStatsRepository";
import { isRlsEnforced, withTenant } from "../utils/rlsContext";
import type { DbTransaction } from "../repositories/BaseRepository";
import {
  userRepository,
  type UserRepository,
  type AdminUserListRow,
  type AdminUserWorkflowCountsRow,
} from "../repositories/UserRepository";
import { workflowRepository as defaultWorkflowRepository, type WorkflowRepository } from "../repositories/WorkflowRepository";
import { workflowRunRepository as defaultWorkflowRunRepository, type WorkflowRunRepository } from "../repositories/WorkflowRunRepository";

import type { User, Workflow, WorkflowRun } from "@shared/schema";

/**
 * RLS-6: the ONLY service allowed to import `server/db/adminDb.ts` (see
 * `tests/unit/server/adminDb.containment.test.ts`). Every method here does
 * exactly two things, in order: read cross-tenant through `adminDb`, then
 * write one `admin_access_log` row for it. Callers (the admin routes) must
 * go through this service rather than calling the repositories directly with
 * `adminDb` themselves — that would scatter the audit-write obligation
 * across every route handler, where it is one missed call away from a
 * cross-tenant read nobody can account for.
 *
 * Scope is deliberately narrow (A2): only the three reads the admin console
 * already needs and cannot get any other way — listing every user, listing
 * every user with workflow counts, and listing a specific user's workflows.
 * Tenant-switching support sessions, impersonation, and time-boxed access are
 * a separate, later initiative; this service does not grow to cover them.
 */
export class AdminAccessService {
  private readonly userRepo: UserRepository;
  private readonly workflowRepo: WorkflowRepository;
  private readonly auditRepo: AdminAccessLogRepository;
  private readonly orgStatsRepo: AdminOrgStatsRepository;
  private readonly runRepo: WorkflowRunRepository;

  constructor(
    userRepo?: UserRepository,
    workflowRepo?: WorkflowRepository,
    auditRepo?: AdminAccessLogRepository,
    orgStatsRepo?: AdminOrgStatsRepository,
    runRepo?: WorkflowRunRepository
  ) {
    this.userRepo = userRepo ?? userRepository;
    this.workflowRepo = workflowRepo ?? defaultWorkflowRepository;
    this.auditRepo = auditRepo ?? adminAccessLogRepository;
    this.orgStatsRepo = orgStatsRepo ?? adminOrgStatsRepository;
    this.runRepo = runRepo ?? defaultWorkflowRunRepository;
  }

  /**
   * `ADMIN_DATABASE_URL` is documented as unset until RLS-4 lands (see
   * .env.example) — today the normal pool still sees every tenant because
   * nothing has set FORCE ROW LEVEL SECURITY yet, so there is nothing to
   * bypass. Falling back to the normal, unscoped repository call here keeps
   * every existing admin route working exactly as before in that interim
   * (proven by the pre-existing `tests/integration/api.admin-user-workflows.test.ts`,
   * which sets up no admin pool at all). Once an environment configures
   * `ADMIN_DATABASE_URL`, this switches to the bypass path automatically —
   * no code change needed at cutover.
   */
  private adminDbOrUndefined(): typeof adminDb | undefined {
    if (isAdminDbConfigured()) {
      return adminDb;
    }
    // Reviewer addition (RLS-6 review): fail LOUD rather than silently
    // truncating. The fallback above is correct only while nothing enforces
    // RLS. The moment enforcement is on and this environment never got an
    // `ADMIN_DATABASE_URL`, falling back to the normal pool gives the admin
    // console a tenant-scoped view — a short list that looks correct, which is
    // exactly the failure this whole ticket exists to prevent. Relocating that
    // failure from "no escape hatch" to "the escape hatch is silently
    // inactive" would not be an improvement.
    //
    // Known limitation: `RLS_ENFORCED` is an application flag and is NOT the
    // same thing as `FORCE ROW LEVEL SECURITY` being set on the tables. It is
    // the best signal available in-process — checking `pg_class.relforcerowsecurity`
    // on every admin read would be worse. **RLS-4 must therefore treat these
    // as one atomic step: provision `ADMIN_DATABASE_URL` FIRST, then set
    // `FORCE` and `RLS_ENFORCED` together.** Setting FORCE while
    // `RLS_ENFORCED` is still false leaves this guard blind.
    if (isRlsEnforced()) {
      throw new Error(
        'RLS: admin cross-tenant read requested while RLS_ENFORCED=true but ADMIN_DATABASE_URL ' +
        'is not configured. Refusing to fall back to the tenant-scoped pool, which would silently ' +
        'return a truncated admin view. Provision ADMIN_DATABASE_URL for this environment (RLS-6).'
      );
    }
    return undefined;
  }

  /**
   * Per-organization stats across every tenant. Backs `GET /api/admin/org-stats`.
   *
   * Added 2026-08-19 closing RLS-4's precondition 2. `AdminOrgStatsService` is
   * correctly *not* tenant-scoped — it is an admin cross-tenant aggregate, so a
   * tenant transaction would defeat its purpose — but it was still reading via
   * the **normal** pool, which under `FORCE` returns only the acting admin's own
   * tenant's organizations. Declaring a service unconvertible is only half the
   * question; the other half is whether it still works once RLS is enforced.
   */
  async listOrgStats(actorUserId: string, requestId: string | undefined): Promise<AdminOrgStatsQueryRow[]> {
    const rows = await this.orgStatsRepo.listOrgStats(this.adminDbOrUndefined());
    await this.auditRepo.record({
      actorUserId,
      action: "admin.orgStats.listAll",
      targetTenantId: null,
      targetUserId: null,
      requestId: requestId ?? null,
    });
    return rows;
  }

  /** Every user across every tenant. Backs `GET /api/admin/users/:userId/role`'s
   * last-admin check and `GET /api/admin/workflows`'s creator map. */
  async listAllUsers(actorUserId: string, requestId: string | undefined): Promise<AdminUserListRow[]> {
    const users = await this.userRepo.findAllUsers(undefined, this.adminDbOrUndefined());
    await this.auditRepo.record({
      actorUserId,
      action: "admin.users.listAll",
      targetTenantId: null,
      targetUserId: null,
      requestId: requestId ?? null,
    });
    return users;
  }

  /** Every user across every tenant, with workflow counts. Backs `GET /api/admin/users`. */
  async listAllUsersWithWorkflowCounts(actorUserId: string, requestId: string | undefined): Promise<AdminUserWorkflowCountsRow[]> {
    const users = await this.userRepo.findAllUsersWithWorkflowCounts(undefined, this.adminDbOrUndefined());
    await this.auditRepo.record({
      actorUserId,
      action: "admin.users.listAllWithWorkflowCounts",
      targetTenantId: null,
      targetUserId: null,
      requestId: requestId ?? null,
    });
    return users;
  }

  /**
   * One user, regardless of tenant. Backs the "verify the target exists" step
   * every `/api/admin/users/:userId/...` route starts with.
   *
   * Those lookups ran on the normal pool, so under a non-owner role a target
   * in another tenant was simply invisible and the route answered **404 "User
   * not found"** for an account that plainly exists — the admin console's
   * central job (managing OTHER people's accounts) failing in the way hardest
   * to distinguish from a genuinely deleted user.
   */
  async getUser(actorUserId: string, targetUserId: string, requestId: string | undefined): Promise<User | undefined> {
    const user = await this.userRepo.findByIdForAdmin(targetUserId, this.adminDbOrUndefined());
    await this.auditRepo.record({
      actorUserId,
      action: "admin.user.get",
      targetTenantId: user?.tenantId ?? null,
      // Null on a miss, not the requested id: `admin_access_log.target_user_id`
      // carries an FK, so recording a lookup of an id that does not exist
      // fails the insert and turns an honest 404 into a 500.
      targetUserId: user?.id ?? null,
      requestId: requestId ?? null,
    });
    return user;
  }

  /** One user by email, regardless of tenant. Backs the admin create-user
   * duplicate check, which would otherwise miss an address already taken in
   * another tenant and fail on the unique constraint instead. */
  async findUserByEmail(actorUserId: string, email: string, requestId: string | undefined): Promise<User | undefined> {
    const user = await this.userRepo.findByEmail(email, undefined, this.adminDbOrUndefined());
    await this.auditRepo.record({
      actorUserId,
      action: "admin.user.findByEmail",
      targetTenantId: user?.tenantId ?? null,
      targetUserId: user?.id ?? null,
      requestId: requestId ?? null,
    });
    return user;
  }

  /** One workflow, regardless of tenant. Backs the admin copy/delete/detail
   * routes, all of which exist precisely to reach another user's workflow. */
  async getWorkflow(actorUserId: string, workflowId: string, requestId: string | undefined): Promise<Workflow | undefined> {
    const workflow = await this.workflowRepo.findByIdForAdmin(workflowId, this.adminDbOrUndefined());
    await this.auditRepo.record({
      actorUserId,
      action: "admin.workflow.get",
      targetTenantId: null,
      targetUserId: null,
      requestId: requestId ?? null,
    });
    return workflow;
  }

  /** Run counts for a set of workflows, regardless of tenant. Unscoped these
   * came back as an empty map, so every admin listing showed 0 runs. */
  async countRunsByWorkflowIds(actorUserId: string, workflowIds: string[], requestId: string | undefined): Promise<Map<string, number>> {
    const counts = await this.runRepo.countByWorkflowIds(workflowIds, undefined, this.adminDbOrUndefined());
    await this.auditRepo.record({
      actorUserId,
      action: "admin.workflows.countRuns",
      targetTenantId: null,
      targetUserId: null,
      requestId: requestId ?? null,
    });
    return counts;
  }

  /** Every run of one workflow, regardless of tenant. Backs the admin
   * workflow-detail and delete routes. */
  async listRunsForWorkflow(actorUserId: string, workflowId: string, requestId: string | undefined): Promise<WorkflowRun[]> {
    const runs = await this.runRepo.findByWorkflowId(workflowId, undefined, undefined, this.adminDbOrUndefined());
    await this.auditRepo.record({
      actorUserId,
      action: "admin.workflow.listRuns",
      targetTenantId: null,
      targetUserId: null,
      requestId: requestId ?? null,
    });
    return runs;
  }

  /**
   * Resolve the tenant that owns a workflow, reading cross-tenant.
   *
   * `workflows` carries no `tenant_id` — its policy derives one via
   * `app_owner_tenant(owner_type, owner_uuid, owner_id, creator_id,
   * project_id)` — so a tenant-pinned WRITE against another user's workflow
   * needs that value resolved first, and resolving it means reading rows the
   * acting admin cannot see. Mirrors the SQL helper's precedence: the
   * workflow's project, then its creator.
   */
  private async resolveTenantForWorkflow(workflow: Workflow): Promise<string | null> {
    const database = this.adminDbOrUndefined() ?? db;
    if (workflow.projectId != null) {
      const [project] = await database
        .select({ tenantId: projects.tenantId })
        .from(projects)
        .where(eq(projects.id, workflow.projectId))
        .limit(1);
      if (project?.tenantId != null) { return project.tenantId; }
    }
    const ownerId = workflow.ownerUuid ?? workflow.creatorId;
    if (ownerId != null) {
      const [owner] = await database
        .select({ tenantId: users.tenantId })
        .from(users)
        .where(eq(users.id, ownerId))
        .limit(1);
      if (owner?.tenantId != null) { return owner.tenantId; }
    }
    return null;
  }

  /**
   * Delete any workflow, regardless of tenant.
   *
   * The BYPASSRLS pool is READ-ONLY by decision: it resolves WHICH tenant owns
   * the target, and the DELETE itself then runs on the NORMAL pool pinned to
   * that tenant. So the write is still checked by the same policy every other
   * write is checked by — an admin cannot write outside a tenant that actually
   * owns the row, and a bug here fails closed rather than silently writing
   * across the whole system.
   *
   * Before this, the delete ran unscoped and matched ZERO rows under
   * enforcement: no error, a 200 response, and the workflow still there.
   */
  async deleteWorkflow(actorUserId: string, workflow: Workflow, requestId: string | undefined): Promise<void> {
    const tenantId = await this.resolveTenantForWorkflow(workflow);
    if (tenantId == null) {
      throw new Error(
        `Cannot delete workflow ${workflow.id} as admin: no tenant could be resolved for it, ` +
        `so there is no scope to perform the write in.`
      );
    }
    await withTenant(tenantId, (tx) => this.workflowRepo.delete(workflow.id, tx));
    await this.auditRepo.record({
      actorUserId,
      action: "admin.workflow.delete",
      targetTenantId: tenantId,
      targetUserId: null,
      requestId: requestId ?? null,
    });
  }

  /**
   * Resolve the tenant a user belongs to, reading cross-tenant. `null` is a
   * real answer, not a miss: a placeholder or not-yet-assigned user has no
   * tenant, and `users`' policy is NULL-safe for exactly that row shape.
   */
  private async resolveTenantForUser(userId: string): Promise<{ found: boolean; tenantId: string | null }> {
    const database = this.adminDbOrUndefined() ?? db;
    const [row] = await database
      .select({ tenantId: users.tenantId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return { found: row !== undefined, tenantId: row?.tenantId ?? null };
  }

  /**
   * Run a write against one user, inside THAT user's tenant.
   *
   * Same read/write split as `deleteWorkflow`: the BYPASSRLS pool only
   * resolves the target's tenant, and the write runs on the normal pool pinned
   * to it, so `users`' policy still checks it. A tenant-less user is written
   * with no tenant pinned: `users`' USING and WITH CHECK are both
   * `tenant_id IS NOT DISTINCT FROM app_current_tenant()`, so with no GUC set
   * exactly the NULL-tenant rows are writable — which is that user.
   *
   * RLS-8: these writes used to run unscoped straight from admin.routes. Under
   * enforcement a user in any tenant was invisible to the UPDATE, so activate,
   * deactivate and role changes all failed with "User not found".
   */
  private async writeUserInOwnTenant<T>(
    targetUserId: string,
    write: (tx?: DbTransaction) => Promise<T>,
  ): Promise<{ result: T; tenantId: string | null }> {
    const { found, tenantId } = await this.resolveTenantForUser(targetUserId);
    if (!found) { throw new Error("User not found"); }
    const result = tenantId != null
      ? await withTenant(tenantId, (tx) => write(tx))
      : await write();
    return { result, tenantId };
  }

  /** Activate or deactivate any user. Backs `PUT /api/admin/users/:userId/active`. */
  async setUserActive(actorUserId: string, targetUserId: string, isActive: boolean, requestId: string | undefined): Promise<User> {
    const { result, tenantId } = await this.writeUserInOwnTenant(targetUserId,
      (tx) => this.userRepo.updateIsActive(targetUserId, isActive, tx));
    await this.auditRepo.record({
      actorUserId,
      action: "admin.user.setActive",
      targetTenantId: tenantId,
      targetUserId,
      requestId: requestId ?? null,
    });
    return result;
  }

  /** Change any user's system role. Backs `PUT /api/admin/users/:userId/role`. */
  async setUserRole(actorUserId: string, targetUserId: string, role: "admin" | "creator", requestId: string | undefined): Promise<User> {
    const { result, tenantId } = await this.writeUserInOwnTenant(targetUserId,
      (tx) => this.userRepo.updateRole(targetUserId, role, tx));
    await this.auditRepo.record({
      actorUserId,
      action: "admin.user.setRole",
      targetTenantId: tenantId,
      targetUserId,
      requestId: requestId ?? null,
    });
    return result;
  }

  /**
   * Every workflow in the system. Backs `GET /api/admin/workflows`.
   *
   * RLS-8: this was the repository's plain `findAll` on the normal pool, which
   * under enforcement returned only public + active workflows — a short list
   * that looked complete.
   */
  async listAllWorkflows(actorUserId: string, requestId: string | undefined): Promise<Workflow[]> {
    const database = this.adminDbOrUndefined() ?? db;
    const all = await database.select().from(workflows);
    await this.auditRepo.record({
      actorUserId,
      action: "admin.workflows.listAll",
      targetTenantId: null,
      targetUserId: null,
      requestId: requestId ?? null,
    });
    return all;
  }

  /**
   * Platform-wide user and workflow counts. Backs `GET /api/admin/stats`.
   *
   * RLS-8: read on the normal pool, both counts silently excluded every
   * tenant's rows under enforcement, so the dashboard reported ~0.
   */
  async getPlatformStats(actorUserId: string, requestId: string | undefined): Promise<{
    userStats: Awaited<ReturnType<UserRepository['getUserStats']>>;
    workflowStats: Awaited<ReturnType<WorkflowRepository['getWorkflowStats']>>;
  }> {
    const adminHandle = this.adminDbOrUndefined();
    const [userStats, workflowStats] = await Promise.all([
      this.userRepo.getUserStats(undefined, adminHandle),
      this.workflowRepo.getWorkflowStats(undefined, adminHandle),
    ]);
    await this.auditRepo.record({
      actorUserId,
      action: "admin.stats.read",
      targetTenantId: null,
      targetUserId: null,
      requestId: requestId ?? null,
    });
    return { userStats, workflowStats };
  }

  /** Every workflow attributable to one user, regardless of that user's tenant.
   * Backs `GET /api/admin/users/:userId/workflows`. */
  async listWorkflowsForUser(actorUserId: string, targetUserId: string, requestId: string | undefined): Promise<Array<Workflow & { ownerName: string | null }>> {
    const workflows = await this.workflowRepo.findAttributedToUser(targetUserId, undefined, this.adminDbOrUndefined());
    await this.auditRepo.record({
      actorUserId,
      action: "admin.user.listWorkflows",
      targetTenantId: null,
      targetUserId,
      requestId: requestId ?? null,
    });
    return workflows;
  }
}

export const adminAccessService = new AdminAccessService();
