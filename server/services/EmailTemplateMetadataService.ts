import { eq } from 'drizzle-orm';

import { emailTemplateMetadata } from '@shared/schema';
import type { EmailTemplateMetadata } from '@shared/types/branding';

import { db } from '../db';
import { createLogger } from '../logger';


const logger = createLogger({ module: 'EmailTemplateMetadataService' });

/**
 * Stage 17: EmailTemplateMetadataService
 *
 * Service layer for managing email template metadata.
 * This is a registry/catalog of email templates with metadata only.
 * NO actual email rendering happens here - that's for future implementation.
 */
export class EmailTemplateMetadataService {
  /**
   * List all email template metadata
   */
  async listEmailTemplates(): Promise<EmailTemplateMetadata[]> {
    try {
      const templates = await db
        .select()
        .from(emailTemplateMetadata);

      logger.debug({ count: templates.length }, 'Listed email templates');
      return templates as unknown as EmailTemplateMetadata[];
    } catch (error) {
      logger.error({ error }, 'Failed to list email templates');
      throw error;
    }
  }

  /**
   * Get email template metadata by ID
   */
  async getTemplateById(templateId: string): Promise<EmailTemplateMetadata | null> {
    try {
      const [template] = await db
        .select()
        .from(emailTemplateMetadata)
        .where(eq(emailTemplateMetadata.id, templateId));

      if (!template) {
        logger.warn({ templateId }, 'Template not found');
        return null;
      }

      return template as unknown as EmailTemplateMetadata;
    } catch (error) {
      logger.error({ error, templateId }, 'Failed to get template');
      throw error;
    }
  }

  /**
   * Get email template metadata by key
   */
  async getTemplateByKey(templateKey: string): Promise<EmailTemplateMetadata | null> {
    try {
      const [template] = await db
        .select()
        .from(emailTemplateMetadata)
        .where(eq(emailTemplateMetadata.templateKey, templateKey));

      if (!template) {
        logger.warn({ templateKey }, 'Template not found');
        return null;
      }

      return template as unknown as EmailTemplateMetadata;
    } catch (error) {
      logger.error({ error, templateKey }, 'Failed to get template by key');
      throw error;
    }
  }

  /**
   * Update email template metadata
   * (only metadata fields, not the template key)
   */
  async updateTemplateMetadata(
    templateId: string,
    metadata: {
      name?: string;
      description?: string | null;
      subjectPreview?: string | null;
      brandingTokens?: Record<string, boolean> | null;
    }
  ): Promise<EmailTemplateMetadata> {
    try {
      const updateData: any = {
        updatedAt: new Date(),
      };

      if (metadata.name !== undefined) {updateData.name = metadata.name;}
      if (metadata.description !== undefined) {updateData.description = metadata.description;}
      if (metadata.subjectPreview !== undefined) {updateData.subjectPreview = metadata.subjectPreview;}
      if (metadata.brandingTokens !== undefined) {updateData.brandingTokens = metadata.brandingTokens;}

      const [updatedTemplate] = await db
        .update(emailTemplateMetadata)
        .set(updateData)
        .where(eq(emailTemplateMetadata.id, templateId))
        .returning();

      if (!updatedTemplate) {
        throw new Error('Template not found');
      }

      logger.info({ templateId, metadata }, 'Template metadata updated');
      return updatedTemplate as unknown as EmailTemplateMetadata;
    } catch (error) {
      logger.error({ error, templateId, metadata }, 'Failed to update template metadata');
      throw error;
    }
  }

  /**
   * Create a new email template metadata entry
   * (for future use - templates are seeded in migration)
   */
  async createTemplate(data: {
    templateKey: string;
    name: string;
    description?: string;
    subjectPreview?: string;
    brandingTokens?: Record<string, boolean>;
  }): Promise<EmailTemplateMetadata> {
    try {
      const [newTemplate] = await db
        .insert(emailTemplateMetadata)
        .values({
          templateKey: data.templateKey,
          name: data.name,
          description: data.description || null,
          subjectPreview: data.subjectPreview || null,
          brandingTokens: (data.brandingTokens || null) as any,
        })
        .returning();

      logger.info({ templateKey: data.templateKey }, 'Email template created');
      return newTemplate as unknown as EmailTemplateMetadata;
    } catch (error: any) {
      // Check for unique constraint violation
      if (error?.code === '23505') {
        logger.warn({ templateKey: data.templateKey }, 'Template key already exists');
        throw new Error('Template key already exists');
      }

      logger.error({ error, data }, 'Failed to create email template');
      throw error;
    }
  }

  /**
   * Delete an email template metadata entry
   */
  async deleteTemplate(templateId: string): Promise<boolean> {
    try {
      const result = await db
        .delete(emailTemplateMetadata)
        .where(eq(emailTemplateMetadata.id, templateId))
        .returning();

      if (result.length === 0) {
        logger.warn({ templateId }, 'Template not found for deletion');
        return false;
      }

      logger.info({ templateId }, 'Email template deleted');
      return true;
    } catch (error) {
      logger.error({ error, templateId }, 'Failed to delete email template');
      throw error;
    }
  }

  /**
   * Get templates that support a specific branding token
   * (useful for UI filtering)
   */
  async getTemplatesWithBrandingToken(tokenKey: string): Promise<EmailTemplateMetadata[]> {
    try {
      // Get all templates and filter in JS (simple approach for MVP)
      const allTemplates = await this.listEmailTemplates();

      const filtered = allTemplates.filter((template) => {
        if (!template.brandingTokens) {return false;}
        const tokens = template.brandingTokens;
        return tokens[tokenKey] === true;
      });

      logger.debug({ tokenKey, count: filtered.length }, 'Filtered templates by branding token');
      return filtered;
    } catch (error) {
      logger.error({ error, tokenKey }, 'Failed to get templates with branding token');
      throw error;
    }
  }
}

export const emailTemplateMetadataService = new EmailTemplateMetadataService();
