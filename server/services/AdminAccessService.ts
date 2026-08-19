import { adminDb, isAdminDbConfigured } from "../db/adminDb";
import {
  adminAccessLogRepository,
  type AdminAccessLogRepository,
} from "../repositories/AdminAccessLogRepository";
import { isRlsEnforced } from "../utils/rlsContext";
import {
  userRepository,
  type UserRepository,
  type AdminUserListRow,
  type AdminUserWorkflowCountsRow,
} from "../repositories/UserRepository";
import { workflowRepository as defaultWorkflowRepository, type WorkflowRepository } from "../repositories/WorkflowRepository";

import type { Workflow } from "@shared/schema";

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

  constructor(
    userRepo?: UserRepository,
    workflowRepo?: WorkflowRepository,
    auditRepo?: AdminAccessLogRepository
  ) {
    this.userRepo = userRepo ?? userRepository;
    this.workflowRepo = workflowRepo ?? defaultWorkflowRepository;
    this.auditRepo = auditRepo ?? adminAccessLogRepository;
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
