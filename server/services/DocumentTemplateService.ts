import type { Template, InsertTemplate } from "@shared/schema";

import { documentTemplateRepository } from "../repositories/DocumentTemplateRepository";
import { createError } from "../utils/errors";

import {
  saveTemplateFile,
  deleteTemplateFile,
  templateFileExists,
} from "./templates";

import type { DbTransaction } from "../repositories/BaseRepository";

/**
 * Stage 21: Document Template Service
 *
 * Business logic layer for workflow document templates
 * Handles CRUD operations, validation, and file management
 */
export class DocumentTemplateService {
  /**
   * Create a new template
   */
  async createTemplate(
    data: {
      projectId: string;
      name: string;
      description?: string;
      fileBuffer: Buffer;
      originalFileName: string;
      mimeType: string;
      type: "docx" | "html";
      helpersVersion?: number;
    },
    tx?: DbTransaction
  ): Promise<Template> {
    const { projectId, name, description, fileBuffer, originalFileName, mimeType, type, helpersVersion } = data;

    // Validate file type
    if (type === "docx" && !mimeType.includes("wordprocessingml") && !mimeType.includes("msword")) {
      throw createError.invalidFileType("Only .docx files are supported for DOCX templates", { mimeType });
    }

    // Check if template name already exists in project
    const exists = await documentTemplateRepository.existsByNameInProject(name, projectId, undefined, tx);
    if (exists) {
      throw createError.conflict("Template with this name already exists in the project");
    }

    // Save file to storage
    let fileRef: string;
    try {
      fileRef = await saveTemplateFile(fileBuffer, originalFileName, mimeType);
    } catch (error) {
      throw createError.internal("Failed to save template file", {
        originalError: error instanceof Error ? error.message : "Unknown error",
      });
    }

    // Create database record
    try {
      return await documentTemplateRepository.create(
        {
          projectId,
          name,
          description: description || null,
          fileRef,
          type,
          helpersVersion: helpersVersion || 1,
        },
        tx
      );
    } catch (error) {
      // Rollback: delete uploaded file if DB insert fails
      await deleteTemplateFile(fileRef);
      throw error;
    }
  }

  /**
   * Get template by ID
   */
  async getTemplate(id: string, projectId: string, tx?: DbTransaction): Promise<Template> {
    const template = await documentTemplateRepository.findByIdAndProjectId(id, projectId, tx);

    if (!template) {
      throw createError.notFound("Template");
    }

    // Verify file exists
    const fileExists = await templateFileExists(template.fileRef);
    if (!fileExists) {
      throw createError.internal("Template file not found in storage", {
        templateId: id,
        fileRef: template.fileRef,
      });
    }

    return template;
  }

  /**
   * List templates for a project
   */
  async listTemplates(projectId: string, tx?: DbTransaction): Promise<Template[]> {
    return documentTemplateRepository.findByProjectId(projectId, tx);
  }

  /**
   * List templates by type
   */
  async listTemplatesByType(
    projectId: string,
    type: "docx" | "html",
    tx?: DbTransaction
  ): Promise<Template[]> {
    return documentTemplateRepository.findByType(projectId, type, tx);
  }

  /**
   * Update template metadata (name, description)
   */
  async updateTemplateMeta(
    id: string,
    projectId: string,
    updates: { name?: string; description?: string },
    tx?: DbTransaction
  ): Promise<Template> {
    // Validate template exists
    await this.getTemplate(id, projectId, tx);

    // Check name uniqueness if updating name
    if (updates.name) {
      const exists = await documentTemplateRepository.existsByNameInProject(
        updates.name,
        projectId,
        id, // Exclude current template
        tx
      );

      if (exists) {
        throw createError.conflict("Template with this name already exists in the project");
      }
    }

    const updated = await documentTemplateRepository.updateMetadata(id, projectId, updates, tx);

    if (!updated) {
      throw createError.notFound("Template");
    }

    return updated;
  }

  /**
   * Store or update template file
   */
  async storeTemplateFile(
    id: string,
    projectId: string,
    fileBuffer: Buffer,
    originalFileName: string,
    mimeType: string,
    tx?: DbTransaction
  ): Promise<Template> {
    // Get existing template
    const template = await this.getTemplate(id, projectId, tx);

    // Validate file type matches template type
    if (template.type === "docx" && !mimeType.includes("wordprocessingml") && !mimeType.includes("msword")) {
      throw createError.invalidFileType("File must be a .docx document", { mimeType });
    }

    // Save new file
    let newFileRef: string;
    try {
      newFileRef = await saveTemplateFile(fileBuffer, originalFileName, mimeType);
    } catch (error) {
      throw createError.internal("Failed to save template file", {
        originalError: error instanceof Error ? error.message : "Unknown error",
      });
    }

    // Update database record
    try {
      const updated = await documentTemplateRepository.updateFileRef(id, projectId, newFileRef, tx);

      if (!updated) {
        // Rollback: delete new file if update fails
        await deleteTemplateFile(newFileRef);
        throw createError.notFound("Template");
      }

      // Delete old file (best effort, don't fail if this errors)
      await deleteTemplateFile(template.fileRef);

      return updated;
    } catch (error) {
      // Rollback: delete new file if update fails
      await deleteTemplateFile(newFileRef);
      throw error;
    }
  }

  /**
   * Delete template
   */
  async deleteTemplate(id: string, projectId: string, tx?: DbTransaction): Promise<void> {
    // Get template to retrieve fileRef
    const template = await this.getTemplate(id, projectId, tx);

    // Delete from database
    const deleted = await documentTemplateRepository.deleteByIdAndProjectId(id, projectId, tx);

    if (!deleted) {
      throw createError.notFound("Template");
    }

    // Delete file from storage (best effort, don't fail if this errors)
    await deleteTemplateFile(template.fileRef);
  }

  /**
   * Check if template exists
   */
  async templateExists(id: string, projectId: string, tx?: DbTransaction): Promise<boolean> {
    const template = await documentTemplateRepository.findByIdAndProjectId(id, projectId, tx);
    return !!template;
  }
}

// Singleton instance
export const documentTemplateService = new DocumentTemplateService();
