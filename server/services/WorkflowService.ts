import { and, eq, inArray } from "drizzle-orm";
import crypto from "crypto";

import type { Workflow, InsertWorkflow, Step, WorkflowAccess, PrincipalType, AccessRole } from "@shared/schema";
import { workflowVersions, workflows, auditLogs, projects, workflowRuns } from "@shared/schema";
import type { IntakeConfig } from "@shared/types/intake";

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
interface WorkflowSectionData {
  id?: string;
  title: string;
  description?: string;
  order?: number;
  visibleIf?: string;
  config?: Record<string, unknown>;
  steps?: WorkflowStepData[];
}
interface WorkflowContentData {
  title?: string;
  description?: string;
  sections?: WorkflowSectionData[];
  logicRules?: Array<{
    conditionStepAlias: string;
    when?: unknown;
    operator?: string;
    conditionValue?: string;
    targetType: string;
    targetAlias: string;
    action: string;
  }>;
}
import { db } from "../db";
import { workflowContentIngestService } from "./WorkflowContentIngestService";
import { logger } from "../logger";
import {
  workflowRepository,
  sectionRepository,
  stepRepository,
  logicRuleRepository,
  userRepository,
  workflowAccessRepository,
  projectRepository,
  type DbTransaction,
} from "../repositories";
import { canCreateWithOwnership, canManageOrg } from "../utils/ownershipAccess";

import { aclService } from "./AclService";
import { BrandingService, brandingService } from "./BrandingService";
/**
 * Service layer for workflow-related business logic
 */
export class WorkflowService {
  private workflowRepo: typeof workflowRepository;
  private sectionRepo: typeof sectionRepository;
  private stepRepo: typeof stepRepository;
  private logicRuleRepo: typeof logicRuleRepository;
  private workflowAccessRepo: typeof workflowAccessRepository;
  private projectRepo: typeof projectRepository;
  private brandingSvc: BrandingService;
  // eslint-disable-next-line max-params
  constructor(
    workflowRepo?: typeof workflowRepository,
    sectionRepo?: typeof sectionRepository,
    stepRepo?: typeof stepRepository,
    logicRuleRepo?: typeof logicRuleRepository,
    workflowAccessRepo?: typeof workflowAccessRepository,
    projectRepo?: typeof projectRepository,
    brandingSvc?: BrandingService
  ) {
    this.workflowRepo = workflowRepo ?? workflowRepository;
    this.sectionRepo = sectionRepo ?? sectionRepository;
    this.stepRepo = stepRepo ?? stepRepository;
    this.logicRuleRepo = logicRuleRepo ?? logicRuleRepository;
    this.workflowAccessRepo = workflowAccessRepo ?? workflowAccessRepository;
    this.projectRepo = projectRepo ?? projectRepository;
    this.brandingSvc = brandingSvc ?? brandingService;
  }

  private async requireOrgAdminForOrgOwnedWorkflow(workflow: Workflow, userId: string, action: string): Promise<void> {
    if (workflow.ownerType === 'org' && workflow.ownerUuid && !(await canManageOrg(userId, workflow.ownerUuid))) {
      throw new Error(`Access denied: Organization admin role required to ${action} organization workflows`);
    }
  }
  /**
   * Verify user owns the workflow (accepts UUID or slug)
   * @deprecated Use verifyAccess instead - this method only checks creatorId
   */
  async verifyOwnership(idOrSlug: string, userId: string): Promise<Workflow> {
    const workflow = await this.workflowRepo.findByIdOrSlug(idOrSlug);
    if (!workflow) {
      throw new Error("Workflow not found");
    }
    if (workflow.creatorId && workflow.creatorId !== userId) {
      throw new Error("Access denied - you do not own this workflow");
    }
    return workflow;
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
    minRole: Exclude<AccessRole, 'none'> = 'view'
  ): Promise<Workflow> {
    const workflow = await this.workflowRepo.findByIdOrSlug(idOrSlug);
    if (!workflow) {
      throw new Error("Workflow not found");
    }
    const hasAclAccess = await aclService.hasWorkflowRole(userId, workflow.id, minRole);
    if (!hasAclAccess) {
      throw new Error("Access denied - insufficient permissions for this workflow");
    }
    return workflow;
  }
  /**
   * Create a new workflow with a default first section
   */
  async createWorkflow(data: InsertWorkflow, creatorId: string): Promise<Workflow> {
    let ownerType = data.ownerType ?? 'user';
    let ownerUuid = data.ownerUuid ?? creatorId;

    if (data.projectId) {
      const project = await this.projectRepo.findById(data.projectId);
      if (!project) {
        throw new Error("Project not found");
      }
      const hasProjectAccess = await aclService.hasProjectRole(creatorId, data.projectId, 'edit');
      if (!hasProjectAccess) {
        throw new Error("Access denied - insufficient permissions for this project");
      }
      ownerType = project.ownerType ?? 'user';
      ownerUuid = project.ownerUuid ?? project.ownerId ?? creatorId;
    } else if (ownerType === 'org') {
      const canManage = await canManageOrg(creatorId, ownerUuid);
      if (!canManage) {
        throw new Error('Access denied: Organization admin role required to create organization workflows');
      }
    } else {
      const canCreate = await canCreateWithOwnership(creatorId, ownerType, ownerUuid);
      if (!canCreate) {
        throw new Error('Access denied: You do not have permission to create assets with this ownership');
      }
    }

    return this.workflowRepo.transaction(async (tx) => {
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
        tx
      );
      // Create default first section
      await this.sectionRepo.create(
        {
          workflowId: workflow.id,
          title: 'Section 1',
          order: 1,
        },
        tx
      );
      return workflow;
    });
  }
  /**
   * Get workflow by ID with full details (sections, steps, rules)
   *
   * PERFORMANCE OPTIMIZED (Dec 2025):
   * - Uses Map for O(n) step grouping instead of O(n*m) filter
   * - Batch loads all data in parallel where possible
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async getWorkflowWithDetails(workflowId: string, userId: string) {
    const workflow = await this.verifyAccess(workflowId, userId, 'view');
    // OPTIMIZATION: Run independent queries in parallel
    const [sections, logicRules, transformBlocks] = await Promise.all([
      this.sectionRepo.findByWorkflowId(workflowId),
      this.logicRuleRepo.findByWorkflowId(workflowId),
      db.query.transformBlocks.findMany({
        where: (tb, { eq }) => eq(tb.workflowId, workflowId),
      }),
    ]);
    const sectionIds = sections.map((s) => s.id);
    const steps = sectionIds.length > 0
      ? await this.stepRepo.findBySectionIds(sectionIds)
      : [];
    // Debug logging for preview issue
    logger.info({
      workflowId,
      userId,
      sectionsCount: sections.length,
      stepsCount: steps.length,
      logicRulesCount: logicRules.length
    }, 'getWorkflowWithDetails called');
    // OPTIMIZATION: Group steps by section using Map (O(n) instead of O(n*m))
    const stepsBySectionMap = new Map<string, Step[]>();
    for (const step of steps) {
      if (!stepsBySectionMap.has(step.sectionId)) {
        stepsBySectionMap.set(step.sectionId, []);
      }
      stepsBySectionMap.get(step.sectionId)!.push(step);
    }
    const sectionsWithSteps = sections.map((section) => ({
      ...section,
      steps: stepsBySectionMap.get(section.id) ?? [],
    }));
    // OPTIMIZATION: Single query for current version (if exists)
    let currentVersion = null;
    if (workflow.currentVersionId !== null || workflow.status === 'draft') {
      currentVersion = await db.query.workflowVersions.findFirst({
        where: workflow.currentVersionId
          ? eq(workflowVersions.id, workflow.currentVersionId)
          : eq(workflowVersions.workflowId, workflowId),
        orderBy: workflow.currentVersionId
          ? undefined
          : (v, { desc }) => [desc(v.versionNumber)],
      });
    }
    // GH-158 / O-9: the builder preview renders from this payload and has no
    // run, so without a server-resolved value it could only see the workflow's
    // own branding and would silently miss tenant-level fallbacks — showing the
    // author something their participants never get. Resolved through the same
    // service the runtime payload uses, so preview and production agree.
    const branding = await this.brandingSvc.resolveForWorkflow(workflowId, workflow.settings);

    return {
      ...workflow,
      sections: sectionsWithSteps,
      logicRules,
      transformBlocks,
      currentVersion,
      branding,
    };
  }
  /**
   * List workflows for a user (Owner OR Shared)
   */
  async listWorkflows(userId: string): Promise<Workflow[]> {
    // Stage 15: Updated to include shared workflows
    return this.workflowRepo.findByUserAccess(userId);
  }
  /**
   * Update workflow
   */
  async updateWorkflow(
    workflowId: string,
    userId: string,
    data: Partial<InsertWorkflow>
  ): Promise<Workflow> {
    await this.verifyAccess(workflowId, userId, 'edit');
    // If slug is being updated, ensure it's unique
    const updateData = { ...data };
    if (updateData.slug) {
      updateData.slug = await this.ensureUniqueSlug(updateData.slug, workflowId);
    }
    return this.workflowRepo.update(workflowId, updateData);
  }
  // ... (keep existing methods)
  /**
   * Ensure slug is unique by appending counter if necessary.
   * Uses a single DB query (LIKE prefix) instead of up to 100 sequential queries.
   */
  async ensureUniqueSlug(slug: string, workflowId: string): Promise<string> {
    // 1. Sanitize the base slug
    let baseSlug = slug
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!baseSlug) { baseSlug = 'workflow'; }
    // 2. Single query: fetch all slugs starting with this prefix
    const existing = await this.workflowRepo.findSlugsByPrefix(baseSlug);
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
  }
  /**
   * Delete workflow
   */
  async deleteWorkflow(workflowId: string, userId: string): Promise<void> {
    const workflow = await this.verifyAccess(workflowId, userId, 'owner');
    await this.requireOrgAdminForOrgOwnedWorkflow(workflow, userId, 'delete');
    await this.workflowRepo.delete(workflowId);
  }
  /**
   * Change workflow status
   */
  async changeStatus(
    workflowId: string,
    userId: string,
    status: 'draft' | 'active' | 'archived'
  ): Promise<Workflow> {
    const workflow = await this.verifyAccess(workflowId, userId, 'edit');
    if (status === 'archived') {
      await this.requireOrgAdminForOrgOwnedWorkflow(workflow, userId, 'archive');
    }
    
    const updateData: Partial<InsertWorkflow> = { status };
    if (status === 'active') {
            // eslint-disable-next-line import/no-cycle
      const { versionService } = await import("./VersionService");
      const version = await versionService.publishVersion(workflowId, userId, 'Published from builder');
      updateData.currentVersionId = version.id;
    }
    
    return this.workflowRepo.update(workflowId, updateData);
  }
  /**
   * Ensure workflow is in draft status before editing
   * Auto-reverts active/archived workflows to draft
   * Returns true if workflow was auto-reverted, false otherwise
   */
  async ensureDraftForEditing(
    workflowId: string,
    userId: string
  ): Promise<boolean> {
    await this.verifyAccess(workflowId, userId, 'edit');
    const workflow = await this.workflowRepo.findById(workflowId);
    if (!workflow) {
      throw new Error('Workflow not found');
    }
    // If already draft, no action needed
    if (workflow.status === 'draft') {
      return false;
    }
    // Auto-revert to draft
    await this.workflowRepo.update(workflowId, { status: 'draft' });
    return true;
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
    projectId: string | null
  ): Promise<Workflow> {
    // Verify user has owner access to the workflow
    await this.verifyAccess(workflowId, userId, 'owner');
    // If moving to a project (not unfiled), verify user has access to target project
    let ownerType: Workflow['ownerType'];
    let ownerUuid: Workflow['ownerUuid'];
    if (projectId !== null) {
      const project = await this.projectRepo.findById(projectId);
      if (!project) {
        throw new Error("Target project not found");
      }
      const hasProjectAccess = await aclService.hasProjectRole(userId, projectId, 'edit');
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
    return this.workflowRepo.transaction(async (tx) => {
      const workflow = await this.workflowRepo.update(workflowId, {
        projectId,
        ownerType,
        ownerUuid,
      }, tx);
      await tx
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
  async listUnfiledWorkflows(creatorId: string): Promise<Workflow[]> {
    return this.workflowRepo.findUnfiledByCreatorId(creatorId);
  }
  /**
   * Get resolved mode for a workflow (modeOverride ?? user.defaultMode)
   */
  async getResolvedMode(
    workflowId: string,
    userId: string
  ): Promise<{ mode: 'easy' | 'advanced', source: 'workflow' | 'user' }> {
    const workflow = await this.verifyAccess(workflowId, userId, 'view');
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }
    // If workflow has a mode override, use it
    if (workflow.modeOverride) {
      return {
        mode: workflow.modeOverride as 'easy' | 'advanced',
        source: 'workflow',
      };
    }
    // Otherwise, use user's default mode
    return {
      mode: (user.defaultMode as 'easy' | 'advanced') || 'easy',
      source: 'user',
    };
  }
  /**
   * Set or clear workflow mode override
   */
  async setModeOverride(
    workflowId: string,
    userId: string,
    modeOverride: 'easy' | 'advanced' | null
  ): Promise<Workflow> {
    await this.verifyAccess(workflowId, userId, 'edit');
    // Validate mode value if not null
    if (modeOverride !== null && !['easy', 'advanced'].includes(modeOverride)) {
      throw new Error("Invalid mode value. Must be 'easy', 'advanced', or null");
    }
    return this.workflowRepo.update(workflowId, { modeOverride });
  }
  // ===================================================================
  // ACL MANAGEMENT METHODS
  // ===================================================================
  /**
   * Get all ACL entries for a workflow
   */
  async getWorkflowAccess(workflowId: string, userId: string, tx?: DbTransaction): Promise<WorkflowAccess[]> {
    await this.verifyAccess(workflowId, userId, 'view');
    return this.workflowAccessRepo.findByWorkflowId(workflowId, tx);
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
    await this.verifyAccess(workflowId, requestorId, 'owner');
    const results: WorkflowAccess[] = [];
    for (const entry of entries) {
      const acl = await this.workflowAccessRepo.upsert(
        workflowId,
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
   * Revoke access from a workflow (batch delete — single query instead of N sequential deletes)
   */
  async revokeWorkflowAccess(
    workflowId: string,
    requestorId: string,
    entries: Array<{ principalType: PrincipalType; principalId: string }>,
    tx?: DbTransaction
  ): Promise<void> {
    await this.verifyAccess(workflowId, requestorId, 'owner');
    await this.workflowAccessRepo.deleteManyByPrincipals(workflowId, entries, tx);
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
    const workflow = await this.verifyAccess(workflowId, currentOwnerId, 'owner');
    await this.requireOrgAdminForOrgOwnedWorkflow(workflow, currentOwnerId, 'transfer');
    // Additionally verify this user is the actual owner (not just has 'owner' role via ACL)
    if (workflow.ownerId !== currentOwnerId) {
      throw new Error("Only the current owner can transfer ownership");
    }
    return this.workflowRepo.update(
      workflowId,
      {
        ownerId: newOwnerId,
      },
      tx
    );
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
    // Verify user has edit access
    await this.verifyAccess(workflowId, userId, 'edit');

    return this.workflowRepo.update(
      workflowId,
      {
        intakeConfig,
      },
      tx
    );
  }
  /**
   * Generate or retrieve public link for a workflow
   * Creates a unique slug-based link if one doesn't exist
   */
  async getOrGeneratePublicLink(workflowId: string, userId: string): Promise<string> {
    const workflow = await this.verifyAccess(workflowId, userId, 'owner');
    // If publicLink already exists, return it
    if (workflow.publicLink) {
      return this.constructPublicUrl(workflow.publicLink);
    }
    // Generate a unique slug (using robust logic now)
    const slug = await this.ensureUniqueSlug(workflow.title, workflowId);
    // Update workflow with new publicLink
    await this.workflowRepo.update(workflowId, {
      publicLink: slug,
      isPublic: true
    });
    return this.constructPublicUrl(slug);
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
  private constructPublicUrl(slug: string): string {
    const baseUrl = process.env.BASE_URL ?? process.env.VITE_BASE_URL ?? 'http://localhost:5000';
    return `${baseUrl}/w/${slug}`;
  }
  /**
   * Specifically ensures 'final' nodes are converted to Final Sections for the Runner
   */
  async syncWithGraph(workflowId: string, graphJson: GraphJson, _userId: string): Promise<void> {
    if (!graphJson?.nodes) { return; }
    // 1. Find 'final' node in graph
    const finalNode = graphJson.nodes.find((n) => n.type === 'final');
    // 2. Manage Final Document Section
    const existingSections = await this.sectionRepo.findByWorkflowId(workflowId);
    const finalSection = existingSections.find(s => (s.config as Record<string, unknown>)?.finalBlock === true);
    if (finalNode) {
      const sectionConfig = {
        finalBlock: true,
        title: finalNode.data?.config?.title ?? "Completion",
        screenTitle: finalNode.data?.config?.title ?? "Completion", // Legacy
        message: finalNode.data?.config?.message ?? "",
        markdownMessage: finalNode.data?.config?.message ?? "", // Legacy
        ...finalNode.data?.config
      };
      if (finalSection) {
        // Update existing
        await this.sectionRepo.update(finalSection.id, {
          title: sectionConfig.screenTitle,
          config: sectionConfig
        });
      } else {
        // Create new
        // Determine order: last + 1
        const maxOrder = existingSections.length > 0 ? Math.max(...existingSections.map(s => s.order)) : 0;
        await this.sectionRepo.create({
          workflowId,
          title: sectionConfig.screenTitle,
          order: maxOrder + 1,
          config: sectionConfig
        });
      }
    } else if (finalSection) {
      // If the final node was removed from the graph, soft-delete the final
      // section (ICW2-B1/ICW2-B11) so respondent step_values on its steps
      // survive; cascade to its own steps first, mirroring the manual
      // delete path in SectionService.deleteSection.
      await db.transaction(async (tx) => {
        await this.stepRepo.softDeleteBySectionId(finalSection.id, tx);
        await this.sectionRepo.softDelete(finalSection.id, tx);
      });
    }
  }
  /**
   * Replace full workflow content (Deep Update)
   * Used by AI Assistant to apply full structural changes
   */

  async replaceWorkflowContent(
    workflowId: string,
    userId: string,
    data: WorkflowContentData
  ): Promise<Workflow> {
    // 1. Authorization
    const hasAccess = await aclService.hasWorkflowRole(userId, workflowId, 'edit');
    if (!hasAccess) {
      throw new Error("Access denied - you do not have permission to edit this workflow");
    }
    return db.transaction(async (tx) => {
      // 2. Update Workflow Metadata
      const [updatedWorkflow] = await tx
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

      // 3. Sync Sections and everything else
      await workflowContentIngestService.apply(workflowId, data, { source: 'ai', tx });

      // 4. Audit Log
      await tx.insert(auditLogs).values({
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
    targetOwnerUuid: string
  ): Promise<Workflow & { detachedFromProject?: boolean; detachmentReason?: string }> {
    const { transferService } = await import('./TransferService');
    const workflow = await this.verifyAccess(workflowId, userId, 'owner');
    await this.requireOrgAdminForOrgOwnedWorkflow(workflow, userId, 'transfer');
    // Transfer-into-org requires org membership (not admin); validateTransfer
    // checks target existence first ("not found") then membership ("not a member").
    await transferService.validateTransfer(
      userId,
      workflow.ownerType ?? 'user',
      workflow.ownerUuid ?? workflow.ownerId ?? workflow.creatorId ?? userId,
      targetOwnerType,
      targetOwnerUuid
    );
    // Check if workflow is in a project
    let shouldDetachFromProject = false;
    if (workflow.projectId) {
      const project = await db.query.projects.findFirst({
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
    const updatedWorkflow = await this.workflowRepo.update(workflowId, updateData);
    await db
      .update(workflowRuns)
      .set({
        ownerType: targetOwnerType,
        ownerUuid: targetOwnerUuid,
      })
      .where(eq(workflowRuns.workflowId, workflowId));
    await this.transferWorkflowDatavaultResources(workflowId, targetOwnerType, targetOwnerUuid);
    // Return workflow with detachment notification if applicable
    if (shouldDetachFromProject) {
      return {
        ...updatedWorkflow,
        detachedFromProject: true,
        detachmentReason: 'Workflow was removed from its project because the project has different ownership',
      };
    }
    return updatedWorkflow;
  }

  private async transferWorkflowDatavaultResources(
    workflowId: string,
    targetOwnerType: 'user' | 'org',
    targetOwnerUuid: string
  ): Promise<void> {
    const { datavaultDatabases, datavaultTables, workflowDataSources } = await import('@shared/schema');
    const linkedDatabases = await db
      .select({ id: workflowDataSources.dataSourceId })
      .from(workflowDataSources)
      .where(eq(workflowDataSources.workflowId, workflowId));
    const databaseIds = new Set<string>(linkedDatabases.map((row) => row.id));
    const scopedDatabases = await db
      .select({ id: datavaultDatabases.id })
      .from(datavaultDatabases)
      .where(and(eq(datavaultDatabases.scopeType, 'workflow'), eq(datavaultDatabases.scopeId, workflowId)));
    scopedDatabases.forEach((row) => databaseIds.add(row.id));
    if (databaseIds.size === 0) {
      return;
    }
    await db
      .update(datavaultDatabases)
      .set({
        ownerType: targetOwnerType,
        ownerUuid: targetOwnerUuid,
        updatedAt: new Date(),
      })
      .where(inArray(datavaultDatabases.id, [...databaseIds]));
    await db
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
