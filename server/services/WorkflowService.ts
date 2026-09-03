import { and, eq, inArray } from "drizzle-orm";
import crypto from "crypto";

import type { Workflow, InsertWorkflow, Step, WorkflowAccess, PrincipalType, AccessRole } from "@shared/schema";
import { workflowVersions, workflows, auditLogs, projects, workflowRuns } from "@shared/schema";
import type { IntakeConfig } from "@shared/types/intake";
import type { ConditionExpression } from "@shared/types/conditions";
import { resolveMode, type Mode } from "@shared/mode";

interface GraphConfig {
  title?: string;
  message?: string;
  [key: string]: unknown;
}
interface GraphNode {
  type: string;
  data?: {
    config?: GraphConfig;
  };
}
interface GraphJson {
  nodes?: GraphNode[];
}
interface WorkflowStepData {
  id?: string;
  type: string;
  title: string;
  description?: string;
  required?: boolean;
  options?: string[];
  order?: number;
  alias?: string;
}
interface WorkflowPageData {
  id?: string;
  title: string;
  description?: string;
  order?: number;
  // O-4: a ConditionExpression, not a string. This shadows the ingest
  // service's type of the same name, so the two must be kept in step.
  visibleIf?: ConditionExpression | null;
  config?: Record<string, unknown>;
  steps?: WorkflowStepData[];
}
interface WorkflowContentData {
  title?: string;
  description?: string;
  pages?: WorkflowPageData[];
  // LU-6c: a rule's trigger condition is `when` (a ConditionExpression) -
  // the legacy flat `operator`/`conditionValue` shape is gone.
  logicRules?: Array<{
    conditionStepAlias?: string;
    when: unknown;
    targetType: string;
    targetAlias: string;
    action: string;
  }>;
}
import { workflowContentIngestService, type WorkflowContentData as IngestWorkflowContentData } from "./WorkflowContentIngestService";
import { logger } from "../logger";
import {
  workflowRepository,
  pageRepository,
  stepRepository,
  logicRuleRepository,
  userRepository,
  workflowAccessRepository,
  projectRepository,
  type DbTransaction,
} from "../repositories";
import { canCreateWithOwnership, canManageOrg } from "../utils/ownershipAccess";
import { withCurrentTenant, getCurrentTenantId } from "../utils/rlsContext";

import { aclService } from "./AclService";
import { BrandingService, brandingService } from "./BrandingService";
/**
 * Service layer for workflow-related business logic
 *
 * RLS-2e: `workflows` has no `tenant_id` column of its own (tenancy is
 * derived from ownership — see docs/architecture/TENANT_ISOLATION_RLS.md
 * §2d) and no method here takes a `tenantId` argument to cross-check —
 * Variant 1 from §2c, same shape as `CollectionFieldService`/
 * `OrganizationService`. `withTx` is the reuse-or-open-ambient half of the
 * pilot's shape only: reuse a caller-supplied `tx`, otherwise open exactly
 * one transaction via `withCurrentTenant` (fails closed with no tenant in
 * context). No second helper.
 */
export class WorkflowService {
  private workflowRepo: typeof workflowRepository;
  private pageRepo: typeof pageRepository;
  private stepRepo: typeof stepRepository;
  private logicRuleRepo: typeof logicRuleRepository;
  private workflowAccessRepo: typeof workflowAccessRepository;
  private projectRepo: typeof projectRepository;
  private brandingSvc: BrandingService;
  // eslint-disable-next-line max-params
  constructor(
    workflowRepo?: typeof workflowRepository,
    pageRepo?: typeof pageRepository,
    stepRepo?: typeof stepRepository,
    logicRuleRepo?: typeof logicRuleRepository,
    workflowAccessRepo?: typeof workflowAccessRepository,
    projectRepo?: typeof projectRepository,
    brandingSvc?: BrandingService
  ) {
    this.workflowRepo = workflowRepo ?? workflowRepository;
    this.pageRepo = pageRepo ?? pageRepository;
    this.stepRepo = stepRepo ?? stepRepository;
    this.logicRuleRepo = logicRuleRepo ?? logicRuleRepository;
    this.workflowAccessRepo = workflowAccessRepo ?? workflowAccessRepository;
    this.projectRepo = projectRepo ?? projectRepository;
    this.brandingSvc = brandingSvc ?? brandingService;
  }

  /**
   * Run `fn` inside a tenant-scoped transaction opened at this service
   * boundary (RLS-2e). Reuses a caller-supplied `tx` if given (never
   * nests); otherwise opens exactly one via `withCurrentTenant`.
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

  private async requireOrgAdminForOrgOwnedWorkflow(
    workflow: Workflow,
    userId: string,
    action: string,
    tx?: DbTransaction
  ): Promise<void> {
    if (workflow.ownerType === 'org' && workflow.ownerUuid && !(await canManageOrg(userId, workflow.ownerUuid, tx))) {
      throw new Error(`Access denied: Organization admin role required to ${action} organization workflows`);
    }
  }
  /**
   * Verify user owns the workflow (accepts UUID or slug)
   * @deprecated Use verifyAccess instead - this method only checks creatorId
   */
  async verifyOwnership(idOrSlug: string, userId: string, tx?: DbTransaction): Promise<Workflow> {
    return this.withTx(tx, async (scopedTx) => {
      const workflow = await this.workflowRepo.findByIdOrSlug(idOrSlug, scopedTx);
      if (!workflow) {
        throw new Error("Workflow not found");
      }
      if (workflow.creatorId && workflow.creatorId !== userId) {
        throw new Error("Access denied - you do not own this workflow");
      }
      return workflow;
    });
  }
  /**
   * Verify user has required access level to workflow (uses ACL system + ownership)
   * @param idOrSlug - Workflow ID or slug
   * @param userId - User ID to check access for
   * @param minRole - Minimum required role ('view', 'edit', or 'owner')
   */
  async verifyAccess(
    idOrSlug: string,
    userId: string,
    minRole: Exclude<AccessRole, 'none'> = 'view',
    tx?: DbTransaction
  ): Promise<Workflow> {
    return this.withTx(tx, async (scopedTx) => {
      const workflow = await this.workflowRepo.findByIdOrSlug(idOrSlug, scopedTx);
      if (!workflow) {
        throw new Error("Workflow not found");
      }
      const hasAclAccess = await aclService.hasWorkflowRole(userId, workflow.id, minRole, scopedTx);
      if (!hasAclAccess) {
        throw new Error("Access denied - insufficient permissions for this workflow");
      }
      return workflow;
    });
  }
  /**
   * Create a new workflow with a default first page
   */
  async createWorkflow(data: InsertWorkflow, creatorId: string, tx?: DbTransaction): Promise<Workflow> {
    return this.withTx(tx, async (scopedTx) => {
      let ownerType = data.ownerType ?? 'user';
      let ownerUuid = data.ownerUuid ?? creatorId;

      if (data.projectId) {
        const project = await this.projectRepo.findById(data.projectId, scopedTx);
        if (!project) {
          throw new Error("Project not found");
        }
        const hasProjectAccess = await aclService.hasProjectRole(creatorId, data.projectId, 'edit', scopedTx);
        if (!hasProjectAccess) {
          throw new Error("Access denied - insufficient permissions for this project");
        }
        ownerType = project.ownerType ?? 'user';
        ownerUuid = project.ownerUuid ?? project.ownerId ?? creatorId;
      } else if (ownerType === 'org') {
        const canManage = await canManageOrg(creatorId, ownerUuid, scopedTx);
        if (!canManage) {
          throw new Error('Access denied: Organization admin role required to create organization workflows');
        }
      } else {
        const canCreate = await canCreateWithOwnership(creatorId, ownerType, ownerUuid, scopedTx);
        if (!canCreate) {
          throw new Error('Access denied: You do not have permission to create assets with this ownership');
        }
      }

      // Create workflow
      const workflow = await this.workflowRepo.create(
        {
          ...data,
          creatorId,
          ownerId: creatorId, // Creator is also the initial owner (legacy)
          ownerType,
          ownerUuid,
          status: 'draft',
        },
        scopedTx
      );
      // Create default first page
      await this.pageRepo.create(
        {
          workflowId: workflow.id,
          title: 'Page 1',
          order: 1,
        },
        scopedTx
      );
      return workflow;
    });
  }
  /**
   * Get workflow by ID with full details (pages, steps, rules)
   *
   * PERFORMANCE OPTIMIZED (Dec 2025):
   * - Uses Map for O(n) step grouping instead of O(n*m) filter
   * - Batch loads all data in parallel where possible
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async getWorkflowWithDetails(workflowId: string, userId: string, tx?: DbTransaction) {
    const result = await this.withTx(tx, async (scopedTx) => {
      const workflow = await this.verifyAccess(workflowId, userId, 'view', scopedTx);
      // OPTIMIZATION: Run independent queries in parallel
      const [pages, logicRules, transformBlocks] = await Promise.all([
        this.pageRepo.findByWorkflowId(workflowId, scopedTx),
        this.logicRuleRepo.findByWorkflowId(workflowId, scopedTx),
        scopedTx.query.transformBlocks.findMany({
          where: (tb, { eq: eqOp }) => eqOp(tb.workflowId, workflowId),
        }),
      ]);
      const pageIds = pages.map((s) => s.id);
      const steps = pageIds.length > 0
        ? await this.stepRepo.findByPageIds(pageIds, scopedTx)
        : [];
      // Debug logging for preview issue
      logger.info({
        workflowId,
        userId,
        pagesCount: pages.length,
        stepsCount: steps.length,
        logicRulesCount: logicRules.length
      }, 'getWorkflowWithDetails called');
      // OPTIMIZATION: Group steps by page using Map (O(n) instead of O(n*m))
      const stepsByPageMap = new Map<string, Step[]>();
      for (const step of steps) {
        if (!stepsByPageMap.has(step.pageId)) {
          stepsByPageMap.set(step.pageId, []);
        }
        stepsByPageMap.get(step.pageId)!.push(step);
      }
      const pagesWithSteps = pages.map((page) => ({
        ...page,
        steps: stepsByPageMap.get(page.id) ?? [],
      }));
      // OPTIMIZATION: Single query for current version (if exists)
      let currentVersion = null;
      if (workflow.currentVersionId !== null || workflow.status === 'draft') {
        currentVersion = await scopedTx.query.workflowVersions.findFirst({
          where: workflow.currentVersionId
            ? eq(workflowVersions.id, workflow.currentVersionId)
            : eq(workflowVersions.workflowId, workflowId),
          orderBy: workflow.currentVersionId
            ? undefined
            : (v, { desc }) => [desc(v.versionNumber)],
        });
      }
      return {
        ...workflow,
        pages: pagesWithSteps,
        logicRules,
        transformBlocks,
        currentVersion,
      };
    });

    // GH-158 / O-9: the builder preview renders from this payload and has no
    // run, so without a server-resolved value it could only see the workflow's
    // own branding and would silently miss tenant-level fallbacks — showing the
    // author something their participants never get. Resolved through the same
    // service the runtime payload uses, so preview and production agree.
    //
    // RLS-4 precondition 4 (closed): `BrandingService.resolveForWorkflow` now
    // takes the same optional `tx` this method does and threads it straight
    // through — reusing an already-open caller transaction (e.g.
    // `VersionService.serializeWorkflowInTx`) instead of opening a second one,
    // which is what used to deadlock the size-1 test pool. When `tx` is
    // undefined (the ordinary top-level case), `BrandingService` opens its own
    // short transaction against the ambient tenant, so the `workflows` read
    // inside `resolveTenantIdForWorkflow` succeeds under FORCE instead of
    // silently returning zero rows. Real tenant-aware branding either way, no
    // synchronous fallback needed.
    const branding = await this.brandingSvc.resolveForWorkflow(workflowId, result.settings, tx);

    return { ...result, branding };
  }
  /**
   * List workflows for a user (Owner OR Shared)
   */
  async listWorkflows(userId: string, tx?: DbTransaction): Promise<Workflow[]> {
    // Stage 15: Updated to include shared workflows
    return this.withTx(tx, (scopedTx) => this.workflowRepo.findByUserAccess(userId, undefined, scopedTx));
  }
  /**
   * Update workflow
   */
  async updateWorkflow(
    workflowId: string,
    userId: string,
    data: Partial<InsertWorkflow>,
    tx?: DbTransaction
  ): Promise<Workflow> {
    return this.withTx(tx, async (scopedTx) => {
      await this.verifyAccess(workflowId, userId, 'edit', scopedTx);
      // If slug is being updated, ensure it's unique
      const updateData = { ...data };
      if (updateData.slug) {
        updateData.slug = await this.ensureUniqueSlug(updateData.slug, workflowId, scopedTx);
      }
      return this.workflowRepo.update(workflowId, updateData, scopedTx);
    });
  }
  // ... (keep existing methods)
  /**
   * Ensure slug is unique by appending counter if necessary.
   * Uses a single DB query (LIKE prefix) instead of up to 100 sequential queries.
   */
  async ensureUniqueSlug(slug: string, workflowId: string, tx?: DbTransaction): Promise<string> {
    return this.withTx(tx, async (scopedTx) => {
      // 1. Sanitize the base slug
      let baseSlug = slug
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      if (!baseSlug) { baseSlug = 'workflow'; }
      // 2. Single query: fetch all slugs starting with this prefix
      const existing = await this.workflowRepo.findSlugsByPrefix(baseSlug, scopedTx);
      const takenByOthers = new Set(
        existing.filter(r => r.id !== workflowId).map(r => r.slug)
      );
      // 3. Resolve conflict in-memory
      if (!takenByOthers.has(baseSlug)) { return baseSlug; }
      for (let counter = 2; counter <= 101; counter++) {
        const candidate = `${baseSlug}-${counter}`;
        if (!takenByOthers.has(candidate)) { return candidate; }
      }
      return `${baseSlug}-${crypto.randomUUID().replace(/-/g, '').substring(0, 6)}`;
    });
  }
  /**
   * Ensure a generated public link is unique against the `public_link` column.
   *
   * ensureUniqueSlug cannot stand in for this: it queries `workflows.slug`,
   * which is a separate (and DB-unique) column, while public links live in the
   * non-unique `public_link`. Using the slug check to mint a public link means
   * two workflows sharing a title get the same link, and findByPublicLink
   * resolves it to whichever row Postgres returns first.
   */
  async ensureUniquePublicLink(title: string, workflowId: string, tx?: DbTransaction): Promise<string> {
    return this.withTx(tx, async (scopedTx) => {
      let baseLink = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .substring(0, 50)
        .replace(/^-+|-+$/g, '');
      if (!baseLink) { baseLink = 'workflow'; }

      const existing = await this.workflowRepo.findPublicLinksByPrefix(baseLink, scopedTx);
      const takenByOthers = new Set(
        existing.filter(r => r.id !== workflowId).map(r => r.publicLink)
      );

      if (!takenByOthers.has(baseLink)) { return baseLink; }
      for (let counter = 2; counter <= 101; counter++) {
        const candidate = `${baseLink}-${counter}`;
        if (!takenByOthers.has(candidate)) { return candidate; }
      }
      return `${baseLink}-${crypto.randomUUID().replace(/-/g, '').substring(0, 6)}`;
    });
  }
  /**
   * Delete workflow
   */
  async deleteWorkflow(workflowId: string, userId: string, tx?: DbTransaction): Promise<void> {
    await this.withTx(tx, async (scopedTx) => {
      const workflow = await this.verifyAccess(workflowId, userId, 'owner', scopedTx);
      await this.requireOrgAdminForOrgOwnedWorkflow(workflow, userId, 'delete', scopedTx);
      await this.workflowRepo.delete(workflowId, scopedTx);
    });
  }
  /**
   * Change workflow status
   */
  async changeStatus(
    workflowId: string,
    userId: string,
    status: 'draft' | 'active' | 'archived',
    tx?: DbTransaction
  ): Promise<Workflow> {
    return this.withTx(tx, async (scopedTx) => {
      const workflow = await this.verifyAccess(workflowId, userId, 'edit', scopedTx);
      if (status === 'archived') {
        await this.requireOrgAdminForOrgOwnedWorkflow(workflow, userId, 'archive', scopedTx);
      }

      const updateData: Partial<InsertWorkflow> = { status };
      if (status === 'active') {
              // eslint-disable-next-line import/no-cycle
        const { versionService } = await import("./VersionService");
        const version = await versionService.publishVersion(workflowId, userId, 'Published from builder', false, scopedTx);
        updateData.currentVersionId = version.id;

        // Publishing is what makes a workflow reachable by participants, so it
        // turns on public access and mints the participant link in the same
        // transaction. Doing this only in Settings -> Publishing left activated
        // workflows in a state that looks published in the builder but that
        // createAnonymousRun still rejects with "Workflow is not public", with
        // no URL surfaced anywhere.
        updateData.isPublic = true;
        updateData.publicLink = workflow.publicLink
          ?? await this.ensureUniquePublicLink(workflow.title, workflowId, scopedTx);
      }

      return this.workflowRepo.update(workflowId, updateData, scopedTx);
    });
  }
  /**
   * Ensure workflow is in draft status before editing
   * Auto-reverts active/archived workflows to draft
   * Returns true if workflow was auto-reverted, false otherwise
   */
  async ensureDraftForEditing(
    workflowId: string,
    userId: string,
    tx?: DbTransaction
  ): Promise<boolean> {
    return this.withTx(tx, async (scopedTx) => {
      await this.verifyAccess(workflowId, userId, 'edit', scopedTx);
      const workflow = await this.workflowRepo.findById(workflowId, scopedTx);
      if (!workflow) {
        throw new Error('Workflow not found');
      }
      // If already draft, no action needed
      if (workflow.status === 'draft') {
        return false;
      }
      // Auto-revert to draft
      await this.workflowRepo.update(workflowId, { status: 'draft' }, scopedTx);
      return true;
    });
  }
  /**
   * Move workflow to a project (or unfiled if projectId is null)
   * Verifies:
   * - User owns the workflow
   * - If moving to a project, user has access to that project
   */
  async moveToProject(
    workflowId: string,
    userId: string,
    projectId: string | null,
    tx?: DbTransaction
  ): Promise<Workflow> {
    return this.withTx(tx, async (scopedTx) => {
      // Verify user has owner access to the workflow
      await this.verifyAccess(workflowId, userId, 'owner', scopedTx);
      // If moving to a project (not unfiled), verify user has access to target project
      let ownerType: Workflow['ownerType'];
      let ownerUuid: Workflow['ownerUuid'];
      if (projectId !== null) {
        const project = await this.projectRepo.findById(projectId, scopedTx);
        if (!project) {
          throw new Error("Target project not found");
        }
        const hasProjectAccess = await aclService.hasProjectRole(userId, projectId, 'edit', scopedTx);
        if (!hasProjectAccess) {
          throw new Error("Access denied - you do not have access to the target project");
        }
        ownerType = project.ownerType ?? 'user';
        ownerUuid = project.ownerUuid ?? project.ownerId ?? userId;
      } else {
        // Unfiled: reset to personal/user ownership, mirroring the no-projectId
        // branch of createWorkflow (ownerType 'user', ownerUuid = the acting user).
        ownerType = 'user';
        ownerUuid = userId;
      }
      const workflow = await this.workflowRepo.update(workflowId, {
        projectId,
        ownerType,
        ownerUuid,
      }, scopedTx);
      await scopedTx
        .update(workflowRuns)
        .set({
          ownerType,
          ownerUuid,
        })
        .where(eq(workflowRuns.workflowId, workflowId));
      return workflow;
    });
  }
  /**
   * Get unfiled workflows (workflows with no project) for a creator
   */
  async listUnfiledWorkflows(creatorId: string, tx?: DbTransaction): Promise<Workflow[]> {
    return this.withTx(tx, (scopedTx) => this.workflowRepo.findUnfiledByCreatorId(creatorId, undefined, scopedTx));
  }
  /**
   * Get resolved mode for a workflow (modeOverride ?? user.defaultMode)
   */
  async getResolvedMode(
    workflowId: string,
    userId: string,
    tx?: DbTransaction
  ): Promise<{ mode: 'easy' | 'advanced', source: 'workflow' | 'user' }> {
    return this.withTx(tx, async (scopedTx) => {
      const workflow = await this.verifyAccess(workflowId, userId, 'view', scopedTx);
      const user = await userRepository.findById(userId, scopedTx);
      if (!user) {
        throw new Error("User not found");
      }
      const workflowMode = workflow.modeOverride as Mode | null;
      const userMode = user.defaultMode as Mode;
      return {
        mode: resolveMode(workflowMode, userMode),
        source: workflowMode === null ? 'user' as const : 'workflow' as const,
      };
    });
  }
  /**
   * Set or clear workflow mode override
   */
  async setModeOverride(
    workflowId: string,
    userId: string,
    modeOverride: 'easy' | 'advanced' | null,
    tx?: DbTransaction
  ): Promise<Workflow> {
    return this.withTx(tx, async (scopedTx) => {
      await this.verifyAccess(workflowId, userId, 'edit', scopedTx);
      // Validate mode value if not null
      if (modeOverride !== null && !['easy', 'advanced'].includes(modeOverride)) {
        throw new Error("Invalid mode value. Must be 'easy', 'advanced', or null");
      }
      return this.workflowRepo.update(workflowId, { modeOverride }, scopedTx);
    });
  }
  // ===================================================================
  // ACL MANAGEMENT METHODS
  // ===================================================================
  /**
   * Get all ACL entries for a workflow
   */
  async getWorkflowAccess(workflowId: string, userId: string, tx?: DbTransaction): Promise<WorkflowAccess[]> {
    return this.withTx(tx, async (scopedTx) => {
      await this.verifyAccess(workflowId, userId, 'view', scopedTx);
      return this.workflowAccessRepo.findByWorkflowId(workflowId, scopedTx);
    });
  }
  /**
   * Grant or update access to a workflow
   * Only owner can grant 'owner' role to others
   */
  async grantWorkflowAccess(
    workflowId: string,
    requestorId: string,
    entries: Array<{ principalType: PrincipalType; principalId: string; role: string }>,
    tx?: DbTransaction
  ): Promise<WorkflowAccess[]> {
    return this.withTx(tx, async (scopedTx) => {
      await this.verifyAccess(workflowId, requestorId, 'owner', scopedTx);
      const results: WorkflowAccess[] = [];
      for (const entry of entries) {
        const acl = await this.workflowAccessRepo.upsert(
          workflowId,
          entry.principalType,
          entry.principalId,
          entry.role,
          scopedTx
        );
        results.push(acl);
      }
      return results;
    });
  }
  /**
   * Revoke access from a workflow (batch delete — single query instead of N sequential deletes)
   */
  async revokeWorkflowAccess(
    workflowId: string,
    requestorId: string,
    entries: Array<{ principalType: PrincipalType; principalId: string }>,
    tx?: DbTransaction
  ): Promise<void> {
    await this.withTx(tx, async (scopedTx) => {
      await this.verifyAccess(workflowId, requestorId, 'owner', scopedTx);
      await this.workflowAccessRepo.deleteManyByPrincipals(workflowId, entries, scopedTx);
    });
  }
  /**
   * Transfer workflow ownership to another user
   * Only current owner can transfer ownership
   */
  async transferWorkflowOwnership(
    workflowId: string,
    currentOwnerId: string,
    newOwnerId: string,
    tx?: DbTransaction
  ): Promise<Workflow> {
    return this.withTx(tx, async (scopedTx) => {
      const workflow = await this.verifyAccess(workflowId, currentOwnerId, 'owner', scopedTx);
      await this.requireOrgAdminForOrgOwnedWorkflow(workflow, currentOwnerId, 'transfer', scopedTx);
      // Additionally verify this user is the actual owner (not just has 'owner' role via ACL)
      if (workflow.ownerId !== currentOwnerId) {
        throw new Error("Only the current owner can transfer ownership");
      }
      return this.workflowRepo.update(
        workflowId,
        {
          ownerId: newOwnerId,
        },
        scopedTx
      );
    });
  }
  /**
   * Update workflow intake configuration (Stage 12.5)
   * Owner and edit access can update intake config
   */
  async updateIntakeConfig(
    workflowId: string,
    userId: string,
    intakeConfig: IntakeConfig,
    tx?: DbTransaction
  ): Promise<Workflow> {
    return this.withTx(tx, async (scopedTx) => {
      // Verify user has edit access
      await this.verifyAccess(workflowId, userId, 'edit', scopedTx);

      return this.workflowRepo.update(
        workflowId,
        {
          intakeConfig,
        },
        scopedTx
      );
    });
  }
  /**
   * Generate or retrieve public link for a workflow
   * Creates a unique slug-based link if one doesn't exist
   */
  async getOrGeneratePublicLink(workflowId: string, userId: string, tx?: DbTransaction): Promise<string> {
    return this.withTx(tx, async (scopedTx) => {
      const workflow = await this.verifyAccess(workflowId, userId, 'owner', scopedTx);
      // Reuse an existing link, but still assert isPublic: a link that exists
      // while is_public is false is dead — createAnonymousRun rejects it — and
      // this method's whole contract is "hand back a usable public link".
      if (workflow.publicLink) {
        if (!workflow.isPublic) {
          await this.workflowRepo.update(workflowId, { isPublic: true }, scopedTx);
        }
        return this.constructPublicUrl(workflow.publicLink);
      }
      // Generate a link unique within the public_link namespace
      const link = await this.ensureUniquePublicLink(workflow.title, workflowId, scopedTx);
      // Update workflow with new publicLink
      await this.workflowRepo.update(workflowId, {
        publicLink: link,
        isPublic: true
      }, scopedTx);
      return this.constructPublicUrl(link);
    });
  }
  /**
   * Generate a URL-friendly slug from workflow title and ID
   * @deprecated logic moved to ensureUniqueSlug
   */
  private generateSlug(title: string, workflowId: string): string {
    // Take first 6 characters of workflow ID for uniqueness
    const shortId = workflowId.substring(0, 6);
    // Convert title to lowercase, replace spaces and special chars with hyphens
    const titleSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
      .substring(0, 50); // Limit length
    return `${titleSlug}-${shortId}`;
  }
  /**
   * Construct full public URL from slug
   */
  constructPublicUrl(slug: string): string {
    const baseUrl = process.env.BASE_URL ?? process.env.VITE_BASE_URL ?? 'http://localhost:5000';
    return `${baseUrl}/w/${slug}`;
  }
  /**
   * Specifically ensures 'final' nodes are converted to Final Pages for the Runner
   */
  async syncWithGraph(workflowId: string, graphJson: GraphJson, _userId: string, tx?: DbTransaction): Promise<void> {
    if (!graphJson?.nodes) { return; }
    await this.withTx(tx, async (scopedTx) => {
      // 1. Find 'final' node in graph
      const finalNode = graphJson.nodes!.find((n) => n.type === 'final');
      // 2. Manage Final Document Page
      const existingPages = await this.pageRepo.findByWorkflowId(workflowId, scopedTx);
      const finalPage = existingPages.find(s => (s.config as Record<string, unknown>)?.finalBlock === true);
      if (finalNode) {
        const pageConfig = {
          finalBlock: true,
          title: finalNode.data?.config?.title ?? "Completion",
          screenTitle: finalNode.data?.config?.title ?? "Completion", // Legacy
          message: finalNode.data?.config?.message ?? "",
          markdownMessage: finalNode.data?.config?.message ?? "", // Legacy
          ...finalNode.data?.config
        };
        if (finalPage) {
          // Update existing
          await this.pageRepo.update(finalPage.id, {
            title: pageConfig.screenTitle,
            config: pageConfig
          }, scopedTx);
        } else {
          // Create new
          // Determine order: last + 1
          const maxOrder = existingPages.length > 0 ? Math.max(...existingPages.map(s => s.order)) : 0;
          await this.pageRepo.create({
            workflowId,
            title: pageConfig.screenTitle,
            order: maxOrder + 1,
            config: pageConfig
          }, scopedTx);
        }
      } else if (finalPage) {
        // If the final node was removed from the graph, soft-delete the final
        // page (ICW2-B1/ICW2-B11) so respondent step_values on its steps
        // survive; cascade to its own steps first, mirroring the manual
        // delete path in PageService.deletePage.
        await this.stepRepo.softDeleteByPageId(finalPage.id, scopedTx);
        await this.pageRepo.softDelete(finalPage.id, scopedTx);
      }
    });
  }
  /**
   * Replace full workflow content (Deep Update)
   * Used by AI Assistant to apply full structural changes
   */

  async replaceWorkflowContent(
    workflowId: string,
    userId: string,
    data: WorkflowContentData,
    tx?: DbTransaction
  ): Promise<Workflow> {
    return this.withTx(tx, async (scopedTx) => {
      // 1. Authorization
      const hasAccess = await aclService.hasWorkflowRole(userId, workflowId, 'edit', scopedTx);
      if (!hasAccess) {
        throw new Error("Access denied - you do not have permission to edit this workflow");
      }
      // 2. Update Workflow Metadata
      const [updatedWorkflow] = await scopedTx
        .update(workflows)
        .set({
          title: data.title,
          description: data.description,
          updatedAt: new Date(),
        })
        .where(eq(workflows.id, workflowId))
        .returning();
        
      if (updatedWorkflow === undefined) {
        throw new Error("Workflow not found");
      }

      // 3. Sync Pages and everything else. `data`'s `logicRules[].when` is
      // `unknown` here (this route accepts loosely-typed deep-update JSON,
      // validated only by `updateWorkflowSchema`'s `z.any()` pages field) —
      // `normalizeContent` inside `apply()` re-validates the actual shape via
      // `validateWorkflowStructure`/`extractConditionReferences` before any
      // of it is trusted.
      await workflowContentIngestService.apply(workflowId, data as unknown as IngestWorkflowContentData, { source: 'ai', tx: scopedTx });

      // 4. Audit Log
      await scopedTx.insert(auditLogs).values({
        // RLS-5: without this `tenant_id` defaults to NULL, and a NULL tenant
        // inside a transaction pinned to a real one fails WITH CHECK
        // (`NULL IS NOT DISTINCT FROM '<tenant>'` is false). Same
        // missing-field bug RLS-2e fixed across VersionService's six inserts.
        tenantId: getCurrentTenantId(),
        userId: userId,
        entityType: 'workflow',
        entityId: workflowId,
        action: 'ai_revision_apply',
        details: { summary: 'Full content replaced by AI' },
      });

      return updatedWorkflow;
    });
  }
  /**
   * Transfer workflow ownership (new ownership model)
   * Detaches from project if transferring to different owner than project
   *
   * @param workflowId - Workflow to transfer
   * @param userId - User requesting transfer
   * @param targetOwnerType - 'user' or 'org'
   * @param targetOwnerUuid - UUID of target owner
   * @returns Workflow with optional detachment warning
   */
  async transferOwnership(
    workflowId: string,
    userId: string,
    targetOwnerType: 'user' | 'org',
    targetOwnerUuid: string,
    tx?: DbTransaction
  ): Promise<Workflow & { detachedFromProject?: boolean; detachmentReason?: string }> {
    return this.withTx(tx, async (scopedTx) => {
      const { transferService } = await import('./TransferService');
      const workflow = await this.verifyAccess(workflowId, userId, 'owner', scopedTx);
      await this.requireOrgAdminForOrgOwnedWorkflow(workflow, userId, 'transfer', scopedTx);
      // Transfer-into-org requires org membership (not admin); validateTransfer
      // checks target existence first ("not found") then membership ("not a member").
      await transferService.validateTransfer(
        userId,
        workflow.ownerType ?? 'user',
        workflow.ownerUuid ?? workflow.ownerId ?? workflow.creatorId ?? userId,
        { ownerType: targetOwnerType, ownerUuid: targetOwnerUuid },
        scopedTx
      );
      // Check if workflow is in a project
      let shouldDetachFromProject = false;
      if (workflow.projectId) {
        const project = await scopedTx.query.projects.findFirst({
          where: eq(projects.id, workflow.projectId),
        });
        // Detach if project ownership differs from target ownership
        if (project && (project.ownerType !== targetOwnerType || project.ownerUuid !== targetOwnerUuid)) {
          shouldDetachFromProject = true;
        }
      }
      // Update workflow ownership
      const updateData: Partial<InsertWorkflow> = {
        ownerType: targetOwnerType,
        ownerUuid: targetOwnerUuid,
      };
      // Detach from project if needed
      if (shouldDetachFromProject) {
        updateData.projectId = null;
      }
      // Update workflow ownership
      const updatedWorkflow = await this.workflowRepo.update(workflowId, updateData, scopedTx);
      await scopedTx
        .update(workflowRuns)
        .set({
          ownerType: targetOwnerType,
          ownerUuid: targetOwnerUuid,
        })
        .where(eq(workflowRuns.workflowId, workflowId));
      await this.transferWorkflowDatavaultResources(workflowId, targetOwnerType, targetOwnerUuid, scopedTx);
      // Return workflow with detachment notification if applicable
      if (shouldDetachFromProject) {
        return {
          ...updatedWorkflow,
          detachedFromProject: true,
          detachmentReason: 'Workflow was removed from its project because the project has different ownership',
        };
      }
      return updatedWorkflow;
    });
  }

  private async transferWorkflowDatavaultResources(
    workflowId: string,
    targetOwnerType: 'user' | 'org',
    targetOwnerUuid: string,
    tx: DbTransaction
  ): Promise<void> {
    const { datavaultDatabases, datavaultTables, workflowDataSources } = await import('@shared/schema');
    const linkedDatabases = await tx
      .select({ id: workflowDataSources.dataSourceId })
      .from(workflowDataSources)
      .where(eq(workflowDataSources.workflowId, workflowId));
    const databaseIds = new Set<string>(linkedDatabases.map((row) => row.id));
    const scopedDatabases = await tx
      .select({ id: datavaultDatabases.id })
      .from(datavaultDatabases)
      .where(and(eq(datavaultDatabases.scopeType, 'workflow'), eq(datavaultDatabases.scopeId, workflowId)));
    scopedDatabases.forEach((row) => databaseIds.add(row.id));
    if (databaseIds.size === 0) {
      return;
    }
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
}
// Singleton instance
export const workflowService = new WorkflowService();
