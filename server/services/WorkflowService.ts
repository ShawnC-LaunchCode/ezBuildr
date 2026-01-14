import { eq, inArray } from "drizzle-orm";

import type { Workflow, InsertWorkflow, Section, Step, LogicRule, WorkflowAccess, PrincipalType, AccessRole } from "@shared/schema";
import { workflowVersions, workflows, sections, steps, logicRules, auditEvents, projects } from "@shared/schema";

import { db } from "../db";
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
import { canAccessAsset, requireAssetAccess } from "../utils/ownershipAccess";

import { aclService } from "./AclService";


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

  constructor(
    workflowRepo?: typeof workflowRepository,
    sectionRepo?: typeof sectionRepository,
    stepRepo?: typeof stepRepository,
    logicRuleRepo?: typeof logicRuleRepository,
    workflowAccessRepo?: typeof workflowAccessRepository,
    projectRepo?: typeof projectRepository
  ) {
    this.workflowRepo = workflowRepo || workflowRepository;
    this.sectionRepo = sectionRepo || sectionRepository;
    this.stepRepo = stepRepo || stepRepository;
    this.logicRuleRepo = logicRuleRepo || logicRuleRepository;
    this.workflowAccessRepo = workflowAccessRepo || workflowAccessRepository;
    this.projectRepo = projectRepo || projectRepository;
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

    // First check ownership-based access (new model)
    const hasOwnershipAccess = await canAccessAsset(
      userId,
      workflow.ownerType,
      workflow.ownerUuid
    );

    // If ownership access granted, allow (for MVP, members can read+write)
    if (hasOwnershipAccess) {
      return workflow;
    }

    // Fallback to ACL service for shared workflows
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
    // Validate ownership before creating
    const ownerType = data.ownerType || 'user';
    const ownerUuid = data.ownerUuid || creatorId;

    const { canCreateWithOwnership } = await import('../utils/ownershipAccess');
    const canCreate = await canCreateWithOwnership(creatorId, ownerType, ownerUuid);
    if (!canCreate) {
      throw new Error('Access denied: You do not have permission to create assets with this ownership');
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
  async getWorkflowWithDetails(workflowId: string, userId: string) {
    const workflow = await this.verifyAccess(workflowId, userId, 'view');

    // OPTIMIZATION: Run independent queries in parallel
    const [sections, logicRules, transformBlocks] = await Promise.all([
      this.sectionRepo.findByWorkflowId(workflowId),
      this.logicRuleRepo.findByWorkflowId(workflowId),
      db.query.transformBlocks.findMany({
        where: (tb: any, { eq }: any) => eq(tb.workflowId, workflowId),
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
      steps: stepsBySectionMap.get(section.id) || [],
    }));

    // OPTIMIZATION: Single query for current version (if exists)
    let currentVersion = null;
    if (workflow.currentVersionId || workflow.status === 'draft') {
      currentVersion = await db.query.workflowVersions.findFirst({
        where: workflow.currentVersionId
          ? eq(workflowVersions.id, workflow.currentVersionId)
          : eq(workflowVersions.workflowId, workflowId),
        orderBy: workflow.currentVersionId
          ? undefined
          : (v: any, { desc }: any) => [desc(v.versionNumber)],
      });
    }

    return {
      ...workflow,
      sections: sectionsWithSteps,
      logicRules,
      transformBlocks,
      currentVersion,
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
    if (data.slug) {
      data.slug = await this.ensureUniqueSlug(data.slug, workflowId);
    }

    return this.workflowRepo.update(workflowId, data);
  }

  // ... (keep existing methods)

  /**
   * Ensure slug is unique by appending counter if necessary
   */
  async ensureUniqueSlug(slug: string, workflowId: string): Promise<string> {
    // 1. Sanitize the base slug
    let baseSlug = slug
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Ensure it's not empty
    if (!baseSlug) {baseSlug = 'workflow';}

    // 2. Check strict existence of the requested slug
    let candidate = baseSlug;
    let counter = 2;

    while (true) {
      const existing = await this.workflowRepo.findBySlug(candidate);

      // If no workflow has this slug, OR the one that has it is THIS workflow, it's safe
      if (!existing || existing.id === workflowId) {
        return candidate;
      }

      // Conflict found - try next counter
      candidate = `${baseSlug}-${counter}`;
      counter++;

      // Safety break to prevent infinite loops (unlikely but good practice)
      if (counter > 100) {
        // Fallback to random ID suffix if 100 collisions
        return `${baseSlug}-${Math.random().toString(36).substring(2, 8)}`;
      }
    }
  }

  /**
   * Delete workflow
   */
  async deleteWorkflow(workflowId: string, userId: string): Promise<void> {
    await this.verifyAccess(workflowId, userId, 'owner');
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
    await this.verifyAccess(workflowId, userId, 'edit');
    return this.workflowRepo.update(workflowId, { status });
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
    if (projectId !== null) {
      const project = await this.projectRepo.findById(projectId);

      if (!project) {
        throw new Error("Target project not found");
      }

      // Verify user owns or has access to the target project (use ACL)
      const hasProjectAccess = await aclService.hasProjectRole(userId, projectId, 'edit');
      if (!hasProjectAccess) {
        throw new Error("Access denied - you do not have access to the target project");
      }
    }

    return this.workflowRepo.moveToProject(workflowId, projectId);
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
    const workflow = await this.verifyAccess(workflowId, requestorId, 'owner');

    const results: WorkflowAccess[] = [];

    for (const entry of entries) {
      // Only owner can grant 'owner' role
      if (entry.role === 'owner' && workflow.ownerId !== requestorId) {
        throw new Error("Only the workflow owner can grant owner access to others");
      }

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
   * Revoke access from a workflow
   */
  async revokeWorkflowAccess(
    workflowId: string,
    requestorId: string,
    entries: Array<{ principalType: PrincipalType; principalId: string }>,
    tx?: DbTransaction
  ): Promise<void> {
    await this.verifyAccess(workflowId, requestorId, 'owner');

    for (const entry of entries) {
      await this.workflowAccessRepo.deleteByPrincipal(
        workflowId,
        entry.principalType,
        entry.principalId,
        tx
      );
    }
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
    intakeConfig: Record<string, any>,
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
    const workflow = await this.verifyAccess(workflowId, userId, 'edit');

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
    const baseUrl = process.env.BASE_URL || process.env.VITE_BASE_URL || 'http://localhost:5000';
    return `${baseUrl}/run/${slug}`;
  }
  /**
   * Sync workflow graph changes to sections/steps (Legacy Support)
   * Specifically ensures 'final' nodes are converted to Final Sections for the Runner
   */
  async syncWithGraph(workflowId: string, graphJson: any, userId: string): Promise<void> {
    if (!graphJson?.nodes) {return;}

    // 1. Find 'final' node in graph
    const finalNode = graphJson.nodes.find((n: any) => n.type === 'final');

    // 2. Manage Final Document Section
    const existingSections = await this.sectionRepo.findByWorkflowId(workflowId);
    const finalSection = existingSections.find(s => (s.config as any)?.finalBlock === true);

    if (finalNode) {
      const sectionConfig = {
        finalBlock: true,
        title: finalNode.data?.config?.title || "Completion",
        screenTitle: finalNode.data?.config?.title || "Completion", // Legacy
        message: finalNode.data?.config?.message || "",
        markdownMessage: finalNode.data?.config?.message || "", // Legacy
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
    } else {
      // If final node removed, remove final section? 
      // For safety, we might keep it or mark it invisible, but deleting is cleaner if we assume graph is truth.
      if (finalSection) {
        await this.sectionRepo.delete(finalSection.id);
      }
    }
  }
  /**
   * Replace full workflow content (Deep Update)
   * Used by AI Assistant to apply full structural changes
   */
  async replaceWorkflowContent(
    workflowId: string,
    userId: string,
    data: any
  ): Promise<any> {
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

      if (!updatedWorkflow) {
        throw new Error("Workflow not found");
      }

      // 3. Sync Sections
      const existingSections = await tx
        .select()
        .from(sections)
        .where(eq(sections.workflowId, workflowId));

      const existingSectionIds = new Set(existingSections.map(s => s.id));
      const incomingSectionIds = new Set<string>();

      if (Array.isArray(data.sections)) {
        data.sections.forEach((sectionData: any, index: number) => {
          sectionData.order = sectionData.order ?? index;
        });

        for (const sectionData of data.sections) {
          let sectionId = sectionData.id;
          const isExisting = sectionId && existingSectionIds.has(sectionId);

          if (isExisting) {
            incomingSectionIds.add(sectionId);
            await tx
              .update(sections)
              .set({
                title: sectionData.title,
                description: sectionData.description,
                order: sectionData.order,
                visibleIf: sectionData.visibleIf,
              })
              .where(eq(sections.id, sectionId));
          } else {
            const [newSection] = await tx
              .insert(sections)
              .values({
                workflowId,
                title: sectionData.title,
                description: sectionData.description,
                order: sectionData.order,
                visibleIf: sectionData.visibleIf,
              })
              .returning();
            sectionId = newSection.id;
          }

          // 4. Sync Steps
          if (Array.isArray(sectionData.steps)) {
            let existingStepIds = new Set<string>();
            if (isExisting) {
              const dbSteps = await tx.select().from(steps).where(eq(steps.sectionId, sectionId));
              existingStepIds = new Set(dbSteps.map(s => s.id));
            }
            const incomingStepIds = new Set<string>();

            for (const [stepIndex, stepData] of sectionData.steps.entries()) {
              const stepId = stepData.id;
              const isStepExisting = stepId && existingStepIds.has(stepId);

              if (isStepExisting) {
                incomingStepIds.add(stepId);
                await tx.update(steps).set({
                  title: stepData.title,
                  description: stepData.description,
                  type: stepData.type,
                  required: stepData.required,
                  options: stepData.options,
                  order: stepData.order ?? stepIndex,
                  sectionId,
                }).where(eq(steps.id, stepId));
              } else {
                await tx.insert(steps).values({
                  sectionId,
                  type: stepData.type,
                  title: stepData.title,
                  description: stepData.description,
                  required: stepData.required || false,
                  options: stepData.options || [],
                  order: stepData.order ?? stepIndex,
                });
              }
            }

            if (isExisting) {
              const stepsToDelete = [...existingStepIds].filter(id => !incomingStepIds.has(id));
              if (stepsToDelete.length > 0) {
                await tx.delete(steps).where(inArray(steps.id, stepsToDelete));
              }
            }
          }
        }
      }

      const sectionsToDelete = [...existingSectionIds].filter(id => !incomingSectionIds.has(id));
      if (sectionsToDelete.length > 0) {
        await tx.delete(sections).where(inArray(sections.id, sectionsToDelete));
      }

      // 5. Logic Rules
      await tx.delete(logicRules).where(eq(logicRules.workflowId, workflowId));

      if (Array.isArray(data.logicRules) && data.logicRules.length > 0) {
        await tx.insert(logicRules).values(
          data.logicRules.map((rule: any) => ({
            workflowId,
            conditionStepAlias: rule.conditionStepAlias,
            operator: rule.operator,
            conditionValue: rule.conditionValue,
            targetType: rule.targetType,
            targetAlias: rule.targetAlias,
            action: rule.action,
          }))
        );
      }

      await db.insert(auditEvents).values({
        actorId: userId,
        entityType: 'workflow',
        entityId: workflowId,
        action: 'ai_revision_apply',
        diff: { summary: 'Full content replaced by AI' },
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
    const workflow = await this.verifyAccess(workflowId, userId, 'edit');

    // Validate transfer permissions
    await transferService.validateTransfer(
      userId,
      workflow.ownerType,
      workflow.ownerUuid,
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
      if (project) {
        if (
          project.ownerType !== targetOwnerType ||
          project.ownerUuid !== targetOwnerUuid
        ) {
          shouldDetachFromProject = true;
        }
      }
    }

    // Update workflow ownership
    const updateData: any = {
      ownerType: targetOwnerType,
      ownerUuid: targetOwnerUuid,
    };

    // Detach from project if needed
    if (shouldDetachFromProject) {
      updateData.projectId = null;
    }

    // Update workflow ownership
    const updatedWorkflow = await this.workflowRepo.update(workflowId, updateData);

    // Cascade ownership to all runs for this workflow
    const { workflowRuns } = await import('@shared/schema');
    await db
      .update(workflowRuns)
      .set({
        ownerType: targetOwnerType,
        ownerUuid: targetOwnerUuid,
      })
      .where(eq(workflowRuns.workflowId, workflowId));

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
}

// Singleton instance
export const workflowService = new WorkflowService();
