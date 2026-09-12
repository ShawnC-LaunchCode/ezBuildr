import type { ReviewTask, InsertReviewTask } from "@shared/schema";

import { reviewTaskRepository, workflowRepository, projectRepository, type DbTransaction } from "../repositories";
import { createError } from "../utils/errors";
import { withCurrentTenant, getCurrentTenantId } from "../utils/rlsContext";

import { aclService as defaultAclService } from "./AclService";

/**
 * Service layer for review task-related business logic
 * Stage 14: E-Signature Node + Document Review Portal
 *
 * RLS-2c: `review_tasks` has a direct NOT NULL `tenant_id` column and an RLS
 * policy (it is one of `0001`'s 24 tenant tables). `createReviewTask`'s `data`
 * carries one (required by the insert type), so it gets the pilot's full
 * ambient-vs-argument mismatch guard. Every other method here is userId/ACL
 * only — no second value to cross-check — so `withTx`'s `expectedTenantId` is
 * optional, and those calls skip straight to `withCurrentTenant`. Same
 * primitives throughout, no second helper.
 */
export class ReviewTaskService {
  private reviewTaskRepo: typeof reviewTaskRepository;
  private workflowRepo: typeof workflowRepository;
  private projectRepo: typeof projectRepository;
  private aclService: typeof defaultAclService;

  constructor(
    reviewTaskRepo?: typeof reviewTaskRepository,
    workflowRepo?: typeof workflowRepository,
    projectRepo?: typeof projectRepository,
    aclService?: typeof defaultAclService
  ) {
    this.reviewTaskRepo = reviewTaskRepo ?? reviewTaskRepository;
    this.workflowRepo = workflowRepo ?? workflowRepository;
    this.projectRepo = projectRepo ?? projectRepository;
    this.aclService = aclService ?? defaultAclService;
  }

  private async withTx<T>(
    tx: DbTransaction | undefined,
    fn: (tx: DbTransaction) => Promise<T>,
    expectedTenantId?: string
  ): Promise<T> {
    if (tx) {
      return fn(tx);
    }
    if (expectedTenantId !== undefined) {
      const ambientTenantId = getCurrentTenantId();
      if (ambientTenantId !== undefined && ambientTenantId !== expectedTenantId) {
        throw new Error(
          `RLS: tenant mismatch — operation requested for tenant "${expectedTenantId}" but the ` +
          `request's async context is tenant "${ambientTenantId}". Refusing to run rather than ` +
          `silently scoping to the wrong tenant.`
        );
      }
    }
    return withCurrentTenant(fn);
  }

  /**
   * Create a review task
   */
  async createReviewTask(data: InsertReviewTask, tx?: DbTransaction): Promise<ReviewTask> {
    return this.withTx(tx, async (scopedTx) => {
      // Validate workflow exists
      const workflow = await this.workflowRepo.findById(data.workflowId, scopedTx);
      if (!workflow) {
        throw createError.notFound("Workflow not found");
      }

      // Validate project exists
      const project = await this.projectRepo.findById(data.projectId, scopedTx);
      if (!project) {
        throw createError.notFound("Project not found");
      }

      // Create the review task
      // TODO: Send notification email to reviewer
      // This would integrate with the email service to notify the reviewer

      return this.reviewTaskRepo.create(data, scopedTx);
    }, data.tenantId);
  }

  /**
   * Get review task by ID
   * Verifies the user has access to the project
   */
  async getReviewTask(taskId: string, userId: string, tx?: DbTransaction): Promise<ReviewTask> {
    return this.withTx(tx, async (scopedTx) => {
      const task = await this.reviewTaskRepo.findById(taskId, scopedTx);
      if (!task) {
        throw createError.notFound("Review task not found");
      }

      // Verify user has access to the project
      const project = await this.projectRepo.findById(task.projectId, scopedTx);
      if (!project) {
        throw createError.notFound("Project not found");
      }

      // Verify user has at least view access to the project (Dec 2025 - Security fix)
      const hasAccess = await this.aclService.hasProjectRole(userId, task.projectId, 'view', scopedTx);
      if (!hasAccess) {
        throw createError.forbidden("Access denied - insufficient permissions for this project");
      }

      return task;
    });
  }

  /**
   * Get review tasks for a user (as reviewer)
   */
  async getTasksForReviewer(reviewerId: string, tx?: DbTransaction): Promise<ReviewTask[]> {
    return this.withTx(tx, (scopedTx) => this.reviewTaskRepo.findByReviewerId(reviewerId, scopedTx));
  }

  /**
   * Get pending review tasks for a project
   */
  async getPendingTasksByProject(projectId: string, userId: string, tx?: DbTransaction): Promise<ReviewTask[]> {
    return this.withTx(tx, async (scopedTx) => {
      // Verify user has access to the project
      const project = await this.projectRepo.findById(projectId, scopedTx);
      if (!project) {
        throw createError.notFound("Project not found");
      }

      // Verify user has at least view access to the project (Dec 2025 - Security fix)
      const hasAccess = await this.aclService.hasProjectRole(userId, projectId, 'view', scopedTx);
      if (!hasAccess) {
        throw createError.forbidden("Access denied - insufficient permissions for this project");
      }

      return this.reviewTaskRepo.findPendingByProjectId(projectId, scopedTx);
    });
  }

  /**
   * Approve a review task
   * Returns the updated task
   */
  async approveTask(
    taskId: string,
    userId: string,
    comment?: string,
    tx?: DbTransaction
  ): Promise<ReviewTask> {
    return this.withTx(tx, async (scopedTx) => {
      const task = await this.getReviewTask(taskId, userId, scopedTx);

      // Only allow approval if task is pending
      if (task.status !== 'pending') {
        throw createError.validation("Task is not pending");
      }

      // Verify user is the designated reviewer (or has admin access)
      if (task.reviewerId && task.reviewerId !== userId) {
        // TODO: Add admin override check
        throw createError.forbidden("You are not the designated reviewer for this task");
      }

      // Update task status
      // TODO: Trigger workflow resume
      // This will be handled by the run resume mechanism

      return this.reviewTaskRepo.updateStatus(
        taskId,
        'approved',
        comment,
        scopedTx
      );
    });
  }

  /**
   * Request changes on a review task
   */
  async requestChanges(
    taskId: string,
    userId: string,
    comment: string,
    tx?: DbTransaction
  ): Promise<ReviewTask> {
    return this.withTx(tx, async (scopedTx) => {
      const task = await this.getReviewTask(taskId, userId, scopedTx);

      // Only allow requesting changes if task is pending
      if (task.status !== 'pending') {
        throw createError.validation("Task is not pending");
      }

      // Verify user is the designated reviewer
      if (task.reviewerId && task.reviewerId !== userId) {
        throw createError.forbidden("You are not the designated reviewer for this task");
      }

      // Comment is required for requesting changes
      if (!comment || comment.trim().length === 0) {
        throw createError.validation("Comment is required when requesting changes");
      }

      // Update task status
      // TODO: Send notification to workflow creator

      return this.reviewTaskRepo.updateStatus(
        taskId,
        'changes_requested',
        comment,
        scopedTx
      );
    });
  }

  /**
   * Reject a review task
   */
  async rejectTask(
    taskId: string,
    userId: string,
    comment?: string,
    tx?: DbTransaction
  ): Promise<ReviewTask> {
    return this.withTx(tx, async (scopedTx) => {
      const task = await this.getReviewTask(taskId, userId, scopedTx);

      // Only allow rejection if task is pending
      if (task.status !== 'pending') {
        throw createError.validation("Task is not pending");
      }

      // Verify user is the designated reviewer
      if (task.reviewerId && task.reviewerId !== userId) {
        throw createError.forbidden("You are not the designated reviewer for this task");
      }

      // Update task status
      // TODO: Mark workflow run as failed

      return this.reviewTaskRepo.updateStatus(
        taskId,
        'rejected',
        comment,
        scopedTx
      );
    });
  }

  /**
   * Make a decision on a review task (approve/changes_requested/rejected)
   */
  async makeDecision(
    taskId: string,
    userId: string,
    decision: 'approved' | 'changes_requested' | 'rejected',
    comment?: string
  ): Promise<ReviewTask> {
    switch (decision) {
      case 'approved':
        return this.approveTask(taskId, userId, comment);
      case 'changes_requested':
        if (!comment) {
          throw createError.validation("Comment is required when requesting changes");
        }
        return this.requestChanges(taskId, userId, comment);
      case 'rejected':
        return this.rejectTask(taskId, userId, comment);
      default:
        throw createError.validation("Invalid decision");
    }
  }
}

// Singleton instance
export const reviewTaskService = new ReviewTaskService();
