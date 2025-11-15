import {
  workflowRepository,
  sectionRepository,
  stepRepository,
  logicRuleRepository,
  userRepository,
  workflowAccessRepository,
  type DbTransaction,
} from "../repositories";
import type { Workflow, InsertWorkflow, Section, Step, LogicRule, WorkflowAccess, PrincipalType } from "@shared/schema";

/**
 * Service layer for workflow-related business logic
 */
export class WorkflowService {
  private workflowRepo: typeof workflowRepository;
  private sectionRepo: typeof sectionRepository;
  private stepRepo: typeof stepRepository;
  private logicRuleRepo: typeof logicRuleRepository;
  private workflowAccessRepo: typeof workflowAccessRepository;

  constructor(
    workflowRepo?: typeof workflowRepository,
    sectionRepo?: typeof sectionRepository,
    stepRepo?: typeof stepRepository,
    logicRuleRepo?: typeof logicRuleRepository,
    workflowAccessRepo?: typeof workflowAccessRepository
  ) {
    this.workflowRepo = workflowRepo || workflowRepository;
    this.sectionRepo = sectionRepo || sectionRepository;
    this.stepRepo = stepRepo || stepRepository;
    this.logicRuleRepo = logicRuleRepo || logicRuleRepository;
    this.workflowAccessRepo = workflowAccessRepo || workflowAccessRepository;
  }

  /**
   * Verify user owns the workflow
   */
  async verifyOwnership(workflowId: string, userId: string): Promise<Workflow> {
    const workflow = await this.workflowRepo.findById(workflowId);

    if (!workflow) {
      throw new Error("Workflow not found");
    }

    if (workflow.creatorId !== userId) {
      throw new Error("Access denied - you do not own this workflow");
    }

    return workflow;
  }

  /**
   * Create a new workflow with a default first section
   */
  async createWorkflow(data: InsertWorkflow, creatorId: string): Promise<Workflow> {
    return await this.workflowRepo.transaction(async (tx) => {
      // Create workflow
      const workflow = await this.workflowRepo.create(
        {
          ...data,
          creatorId,
          ownerId: creatorId, // Creator is also the initial owner
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
   */
  async getWorkflowWithDetails(workflowId: string, userId: string) {
    const workflow = await this.verifyOwnership(workflowId, userId);
    const sections = await this.sectionRepo.findByWorkflowId(workflowId);
    const sectionIds = sections.map((s) => s.id);
    const steps = await this.stepRepo.findBySectionIds(sectionIds);
    const logicRules = await this.logicRuleRepo.findByWorkflowId(workflowId);

    // Group steps by section
    const sectionsWithSteps = sections.map((section) => ({
      ...section,
      steps: steps.filter((step) => step.sectionId === section.id),
    }));

    return {
      ...workflow,
      sections: sectionsWithSteps,
      logicRules,
    };
  }

  /**
   * List workflows for a user
   */
  async listWorkflows(creatorId: string): Promise<Workflow[]> {
    return await this.workflowRepo.findByCreatorId(creatorId);
  }

  /**
   * Update workflow
   */
  async updateWorkflow(
    workflowId: string,
    userId: string,
    data: Partial<InsertWorkflow>
  ): Promise<Workflow> {
    await this.verifyOwnership(workflowId, userId);
    return await this.workflowRepo.update(workflowId, data);
  }

  /**
   * Delete workflow
   */
  async deleteWorkflow(workflowId: string, userId: string): Promise<void> {
    await this.verifyOwnership(workflowId, userId);
    await this.workflowRepo.delete(workflowId);
  }

  /**
   * Change workflow status
   */
  async changeStatus(
    workflowId: string,
    userId: string,
    status: 'draft' | 'open' | 'closed'
  ): Promise<Workflow> {
    await this.verifyOwnership(workflowId, userId);
    return await this.workflowRepo.update(workflowId, { status });
  }

  /**
   * Move workflow to a project (or unfiled if projectId is null)
   */
  async moveToProject(
    workflowId: string,
    userId: string,
    projectId: string | null
  ): Promise<Workflow> {
    await this.verifyOwnership(workflowId, userId);
    return await this.workflowRepo.moveToProject(workflowId, projectId);
  }

  /**
   * Get unfiled workflows (workflows with no project) for a user
   */
  async listUnfiledWorkflows(creatorId: string): Promise<Workflow[]> {
    return await this.workflowRepo.findUnfiledByCreatorId(creatorId);
  }

  /**
   * Get resolved mode for a workflow (modeOverride ?? user.defaultMode)
   */
  async getResolvedMode(
    workflowId: string,
    userId: string
  ): Promise<{ mode: 'easy' | 'advanced', source: 'workflow' | 'user' }> {
    const workflow = await this.verifyOwnership(workflowId, userId);
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
    await this.verifyOwnership(workflowId, userId);

    // Validate mode value if not null
    if (modeOverride !== null && !['easy', 'advanced'].includes(modeOverride)) {
      throw new Error("Invalid mode value. Must be 'easy', 'advanced', or null");
    }

    return await this.workflowRepo.update(workflowId, { modeOverride });
  }

  // ===================================================================
  // ACL MANAGEMENT METHODS
  // ===================================================================

  /**
   * Get all ACL entries for a workflow
   */
  async getWorkflowAccess(workflowId: string, userId: string, tx?: DbTransaction): Promise<WorkflowAccess[]> {
    await this.verifyOwnership(workflowId, userId);
    return await this.workflowAccessRepo.findByWorkflowId(workflowId, tx);
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
    const workflow = await this.verifyOwnership(workflowId, requestorId);

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
    await this.verifyOwnership(workflowId, requestorId);

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
    const workflow = await this.verifyOwnership(workflowId, currentOwnerId);

    if (workflow.ownerId !== currentOwnerId) {
      throw new Error("Only the current owner can transfer ownership");
    }

    return await this.workflowRepo.update(
      workflowId,
      {
        ownerId: newOwnerId,
      },
      tx
    );
  }

  /**
   * Update workflow intake configuration (Stage 12.5)
   * Owner and builders can update intake config
   */
  async updateIntakeConfig(
    workflowId: string,
    userId: string,
    intakeConfig: Record<string, any>,
    tx?: DbTransaction
  ): Promise<Workflow> {
    // Verify user has owner or builder access
    const workflow = await (this as any).verifyAccess(workflowId, userId, ['owner', 'builder']);

    return await this.workflowRepo.update(
      workflowId,
      {
        intakeConfig,
      },
      tx
    );
  }
}

// Singleton instance
export const workflowService = new WorkflowService();
