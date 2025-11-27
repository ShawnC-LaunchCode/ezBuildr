/**
 * Document Generation Service
 * Handles document generation for Final Documents sections
 */

import { renderDocx } from './docxRenderer';
import { getTemplateFilePath } from './templates';
import {
  workflowRunRepository,
  sectionRepository,
  stepValueRepository,
  stepRepository,
  documentTemplateRepository,
  runGeneratedDocumentsRepository,
} from '../repositories';
import { createError } from '../utils/errors';
import { logger } from '../logger';
import path from 'path';

export class DocumentGenerationService {
  /**
   * Generate documents for a completed workflow run
   * Finds all Final Documents sections and generates their selected templates
   */
  async generateDocumentsForRun(runId: string): Promise<void> {
    const log = logger.child({ runId, service: 'DocumentGenerationService' });
    log.info('Starting document generation for run');

    try {
      // 1. Get the run
      const run = await workflowRunRepository.findById(runId);
      if (!run) {
        throw createError.notFound('Workflow run');
      }

      // 2. Get all sections for the workflow
      const sections = await sectionRepository.findByWorkflowId(run.workflowId);

      // 3. Find Final Documents sections
      const finalDocsSections = sections.filter((section) => {
        const config = section.config as any;
        return config?.finalBlock === true;
      });

      if (finalDocsSections.length === 0) {
        log.info('No Final Documents sections found, skipping generation');
        return;
      }

      log.info({ sectionCount: finalDocsSections.length }, 'Found Final Documents sections');

      // 4. Get step values for data interpolation
      const stepValues = await stepValueRepository.findByRunId(runId);
      const allSteps = await stepRepository.findByWorkflowId(run.workflowId);

      // Build data object with both stepId and alias keys
      const data: Record<string, any> = {};
      for (const stepValue of stepValues) {
        // Add by step ID
        data[stepValue.stepId] = stepValue.value;

        // Add by alias if step has one
        const step = allSteps.find((s) => s.id === stepValue.stepId);
        if (step?.alias) {
          data[step.alias] = stepValue.value;
        }
      }

      log.info({ dataKeys: Object.keys(data).length }, 'Built data object for template rendering');

      // 5. Generate documents for each Final Documents section
      for (const section of finalDocsSections) {
        const config = section.config as any;
        const templateIds = config?.templates || [];

        if (templateIds.length === 0) {
          log.info({ sectionId: section.id }, 'No templates selected for section, skipping');
          continue;
        }

        log.info(
          { sectionId: section.id, templateCount: templateIds.length },
          'Generating documents for section'
        );

        // Generate each template
        for (const templateId of templateIds) {
          try {
            await this.generateDocument(runId, templateId, data);
          } catch (error) {
            log.error(
              { error, templateId, sectionId: section.id },
              'Failed to generate document, continuing with next'
            );
            // Continue with other templates even if one fails
          }
        }
      }

      log.info('Document generation completed successfully');
    } catch (error) {
      log.error({ error }, 'Document generation failed');
      throw error;
    }
  }

  /**
   * Generate a single document from a template
   */
  private async generateDocument(
    runId: string,
    templateId: string,
    data: Record<string, any>
  ): Promise<void> {
    const log = logger.child({ runId, templateId, service: 'DocumentGenerationService' });

    try {
      // 1. Get template record
      const template = await documentTemplateRepository.findById(templateId);
      if (!template) {
        throw createError.notFound('Template', templateId);
      }

      log.info({ templateName: template.name }, 'Rendering template');

      // 2. Get template file path
      const templatePath = await getTemplateFilePath(template.fileRef);

      // 3. Render document
      const result = await renderDocx({
        templatePath,
        data,
        outputName: `${template.name}-run-${runId}`,
        toPdf: false, // Can be made configurable later
      });

      log.info({ docxPath: result.docxPath, size: result.size }, 'Document rendered successfully');

      // 4. Determine public URL for the document
      // For now, use relative path - in production, upload to S3 and get URL
      const fileName = path.basename(result.docxPath);
      const fileUrl = `/api/files/outputs/${fileName}`; // Adjust based on your file serving setup

      // 5. Save record to database
      await runGeneratedDocumentsRepository.createDocument({
        runId,
        fileName: `${template.name}.docx`,
        fileUrl,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileSize: result.size,
        templateId,
      });

      log.info('Document record saved to database');
    } catch (error) {
      log.error({ error }, 'Failed to generate document');
      throw error;
    }
  }
}

// Singleton instance
export const documentGenerationService = new DocumentGenerationService();
