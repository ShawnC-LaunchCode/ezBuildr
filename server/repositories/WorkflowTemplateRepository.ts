import { eq, and, desc, sql } from "drizzle-orm";

import { workflowTemplates, type WorkflowTemplate, type InsertWorkflowTemplate } from "@shared/schema";

import { db } from "../db";

import { BaseRepository, type DbTransaction } from "./BaseRepository";

/**
 * Stage 21: Workflow Template Repository
 *
 * Repository for workflow_templates table (multi-template mapping per workflow)
 */
export class WorkflowTemplateRepository extends BaseRepository<
  typeof workflowTemplates,
  WorkflowTemplate,
  InsertWorkflowTemplate
> {
  constructor(dbInstance?: typeof db) {
    super(workflowTemplates, dbInstance);
  }

  /**
   * Find all templates attached to a workflow version
   */
  async findByWorkflowVersionId(
    workflowVersionId: string,
    tx?: DbTransaction
  ): Promise<WorkflowTemplate[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(workflowTemplates)
      .where(eq(workflowTemplates.workflowVersionId, workflowVersionId))
      .orderBy(desc(workflowTemplates.createdAt));
  }

  /**
   * Find template mapping by key
   */
  async findByWorkflowVersionAndKey(
    workflowVersionId: string,
    key: string,
    tx?: DbTransaction
  ): Promise<WorkflowTemplate | undefined> {
    const database = this.getDb(tx);
    const [mapping] = await database
      .select()
      .from(workflowTemplates)
      .where(
        and(
          eq(workflowTemplates.workflowVersionId, workflowVersionId),
          eq(workflowTemplates.key, key)
        )
      );
    return mapping;
  }

  /**
   * Find template mapping by template ID
   */
  async findByWorkflowVersionAndTemplateId(
    workflowVersionId: string,
    templateId: string,
    tx?: DbTransaction
  ): Promise<WorkflowTemplate | undefined> {
    const database = this.getDb(tx);
    const [mapping] = await database
      .select()
      .from(workflowTemplates)
      .where(
        and(
          eq(workflowTemplates.workflowVersionId, workflowVersionId),
          eq(workflowTemplates.templateId, templateId)
        )
      );
    return mapping;
  }

  /**
   * Find primary template for workflow version
   */
  async findPrimaryByWorkflowVersionId(
    workflowVersionId: string,
    tx?: DbTransaction
  ): Promise<WorkflowTemplate | undefined> {
    const database = this.getDb(tx);
    const [mapping] = await database
      .select()
      .from(workflowTemplates)
      .where(
        and(
          eq(workflowTemplates.workflowVersionId, workflowVersionId),
          eq(workflowTemplates.isPrimary, true)
        )
      );
    return mapping;
  }

  /**
   * Set primary template (unsets others)
   */
  async setPrimary(
    id: string,
    workflowVersionId: string,
    tx?: DbTransaction
  ): Promise<void> {
    const database = this.getDb(tx);

    // First, unset all primary flags for this workflow version
    await database
      .update(workflowTemplates)
      .set({ isPrimary: false, updatedAt: new Date() })
      .where(eq(workflowTemplates.workflowVersionId, workflowVersionId));

    // Then, set the specified one as primary
    await database
      .update(workflowTemplates)
      .set({ isPrimary: true, updatedAt: new Date() })
      .where(eq(workflowTemplates.id, id));
  }

  /**
   * Delete by ID and workflow version (for authorization)
   */
  async deleteByIdAndWorkflowVersion(
    id: string,
    workflowVersionId: string,
    tx?: DbTransaction
  ): Promise<boolean> {
    const database = this.getDb(tx);
    const result = await database
      .delete(workflowTemplates)
      .where(
        and(
          eq(workflowTemplates.id, id),
          eq(workflowTemplates.workflowVersionId, workflowVersionId)
        )
      )
      .returning({ id: workflowTemplates.id });
    return result.length > 0;
  }

  /**
   * Check if key exists in workflow version
   */
  async existsByKey(
    workflowVersionId: string,
    key: string,
    excludeId?: string,
    tx?: DbTransaction
  ): Promise<boolean> {
    const database = this.getDb(tx);

    const baseConditions = [
      eq(workflowTemplates.workflowVersionId, workflowVersionId),
      eq(workflowTemplates.key, key)
    ];

    if (excludeId) {
      baseConditions.push(sql`${workflowTemplates.id} != ${excludeId}`);
    }

    const [result] = await database
      .select({ id: workflowTemplates.id })
      .from(workflowTemplates)
      .where(and(...baseConditions))
      .limit(1);

    return !!result;
  }
}

// Singleton instance
export const workflowTemplateRepository = new WorkflowTemplateRepository();
