import type { WorkflowTemplate, InsertWorkflowTemplate } from "@shared/schema";

import { workflowTemplateRepository } from "../repositories/WorkflowTemplateRepository";
import { createError } from "../utils/errors";

import { documentTemplateService } from "./DocumentTemplateService";

import type { DbTransaction } from "../repositories/BaseRepository";

/**
 * Stage 21: Workflow Template Service
 *
 * Business logic for mapping templates to workflow versions
 * Handles multi-template workflows (e.g., engagement letter + schedule + annex)
 */
export class WorkflowTemplateService {
  /**
   * Attach a template to a workflow version
   */
  async attachTemplate(
    data: {
      workflowVersionId: string;
      templateId: string;
      projectId: string; // For template validation
      key: string;
      isPrimary?: boolean;
    },
    tx?: DbTransaction
  ): Promise<WorkflowTemplate> {
    const { workflowVersionId, templateId, projectId, key, isPrimary = false } = data;

    // Validate template exists and user has access
    await documentTemplateService.getTemplate(templateId, projectId, tx);

    // Check if key already exists
    const exists = await workflowTemplateRepository.existsByKey(
      workflowVersionId,
      key,
      undefined,
      tx
    );

    if (exists) {
      throw createError.conflict(
        `Template with key '${key}' already attached to this workflow version`
      );
    }

    // If isPrimary is true, ensure no other primary exists
    if (isPrimary) {
      const existingPrimary = await workflowTemplateRepository.findPrimaryByWorkflowVersionId(
        workflowVersionId,
        tx
      );

      if (existingPrimary) {
        throw createError.conflict(
          'A primary template is already set. Use updateTemplate to change primary status.'
        );
      }
    }

    // Create mapping
    return workflowTemplateRepository.create(
      {
        workflowVersionId,
        templateId,
        key,
        isPrimary,
      },
      tx
    );
  }

  /**
   * List all templates attached to a workflow version
   */
  async listTemplates(
    workflowVersionId: string,
    tx?: DbTransaction
  ): Promise<WorkflowTemplate[]> {
    return workflowTemplateRepository.findByWorkflowVersionId(workflowVersionId, tx);
  }

  /**
   * Get template mapping by ID
   */
  async getTemplateMapping(
    id: string,
    workflowVersionId: string,
    tx?: DbTransaction
  ): Promise<WorkflowTemplate> {
    const mapping = await workflowTemplateRepository.findById(id, tx);

    if (!mapping || mapping.workflowVersionId !== workflowVersionId) {
      throw createError.notFound('Workflow template mapping');
    }

    return mapping;
  }

  /**
   * Get template mapping by key
   */
  async getTemplateByKey(
    workflowVersionId: string,
    key: string,
    tx?: DbTransaction
  ): Promise<WorkflowTemplate> {
    const mapping = await workflowTemplateRepository.findByWorkflowVersionAndKey(
      workflowVersionId,
      key,
      tx
    );

    if (!mapping) {
      throw createError.notFound(`Template with key '${key}'`);
    }

    return mapping;
  }

  /**
   * Get primary template for workflow version
   */
  async getPrimaryTemplate(
    workflowVersionId: string,
    tx?: DbTransaction
  ): Promise<WorkflowTemplate | null> {
    const mapping = await workflowTemplateRepository.findPrimaryByWorkflowVersionId(
      workflowVersionId,
      tx
    );

    return mapping || null;
  }

  /**
   * Update template mapping
   */
  async updateTemplateMapping(
    id: string,
    workflowVersionId: string,
    updates: { key?: string; isPrimary?: boolean },
    tx?: DbTransaction
  ): Promise<WorkflowTemplate> {
    // Verify mapping exists
    await this.getTemplateMapping(id, workflowVersionId, tx);

    // Check key uniqueness if updating key
    if (updates.key) {
      const exists = await workflowTemplateRepository.existsByKey(
        workflowVersionId,
        updates.key,
        id, // Exclude current mapping
        tx
      );

      if (exists) {
        throw createError.conflict(
          `Template with key '${updates.key}' already exists in this workflow version`
        );
      }
    }

    // If setting as primary, use dedicated method to ensure only one primary
    if (updates.isPrimary === true) {
      await workflowTemplateRepository.setPrimary(id, workflowVersionId, tx);

      // Fetch updated mapping
      const updated = await workflowTemplateRepository.findById(id, tx);
      if (!updated) {
        throw createError.notFound('Workflow template mapping');
      }

      // If also updating key, apply that separately
      if (updates.key) {
        return workflowTemplateRepository.update(
          id,
          { key: updates.key },
          tx
        );
      }

      return updated;
    }

    // Otherwise, use regular update
    return workflowTemplateRepository.update(id, updates, tx);
  }

  /**
   * Detach template from workflow version
   */
  async detachTemplate(
    id: string,
    workflowVersionId: string,
    tx?: DbTransaction
  ): Promise<void> {
    const deleted = await workflowTemplateRepository.deleteByIdAndWorkflowVersion(
      id,
      workflowVersionId,
      tx
    );

    if (!deleted) {
      throw createError.notFound('Workflow template mapping');
    }
  }

  /**
   * Check if template is attached to workflow
   */
  async isTemplateAttached(
    workflowVersionId: string,
    templateId: string,
    tx?: DbTransaction
  ): Promise<boolean> {
    const mappings = await workflowTemplateRepository.findByWorkflowVersionId(
      workflowVersionId,
      tx
    );

    return mappings.some((m) => m.templateId === templateId);
  }

  /**
   * Set template as primary (unsets other primaries)
   */
  async setPrimaryTemplate(
    id: string,
    workflowVersionId: string,
    tx?: DbTransaction
  ): Promise<WorkflowTemplate> {
    // Verify mapping exists
    await this.getTemplateMapping(id, workflowVersionId, tx);

    // Set as primary (unsets others)
    await workflowTemplateRepository.setPrimary(id, workflowVersionId, tx);

    // Fetch updated mapping
    const updated = await workflowTemplateRepository.findById(id, tx);
    if (!updated) {
      throw createError.notFound('Workflow template mapping');
    }

    return updated;
  }
}

// Singleton instance
export const workflowTemplateService = new WorkflowTemplateService();
