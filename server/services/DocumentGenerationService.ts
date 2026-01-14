/**
 * Document Generation Service
 * Handles document generation for Final Documents sections
 */

import path from 'path';

import { evaluateConditionExpression } from '@shared/conditionEvaluator';
import { type WorkflowRun } from '@shared/schema';

import { logger } from '../logger';
import {
  workflowRunRepository,
  sectionRepository,
  stepValueRepository,
  stepRepository,
  documentTemplateRepository,
  runGeneratedDocumentsRepository,
  workflowRepository,
  workflowTemplateRepository,
} from '../repositories';
import { createError } from '../utils/errors';

import { documentEngine } from './document/DocumentEngine';
import { applyMapping, type DocumentMapping } from './document/MappingInterpreter';
import { getTemplateFilePath } from './templates';





const DEFAULT_TO_PDF = false;
const PDF_STRATEGY = 'puppeteer';

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
        // Log config for debugging
        // logger.debug({ sectionId: section.id, config }, 'Checking section config');
        return config?.finalBlock === true;
      });

      if (finalDocsSections.length === 0) {
        log.warn({
          allSections: sections.map(s => ({ id: s.id, config: s.config })),
          runId
        }, 'No Final Documents sections found, skipping generation. This might cause the frontend to hang.');
        return;
      }

      log.info({ sectionCount: finalDocsSections.length }, 'Found Final Documents sections');

      // 4. Get step values for data interpolation
      const stepValues = await stepValueRepository.findByRunId(runId);
      const allSteps = await stepRepository.findByWorkflowIdWithAliases(run.workflowId);

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
            await this.generateDocument(run, templateId, data);
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
      log.error({
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : error,
        errorType: typeof error,
        errorConstructor: error?.constructor?.name
      }, 'Document generation failed');
      throw error;
    }
  }

  /**
   * Generate a single document from a template
   */
  private async generateDocument(
    run: WorkflowRun,
    templateId: string,
    data: Record<string, any>
  ): Promise<void> {
    const log = logger.child({ runId: run.id, templateId, service: 'DocumentGenerationService' });

    try {
      // 1. Get template record
      const template = await documentTemplateRepository.findById(templateId);
      if (!template) {
        // Log warning instead of throwing, to avoid failing entire run for one missing template
        log.warn('Template not found, skipping generation');
        return;
      }

      log.info({ templateName: template.name }, 'Rendering template');

      // 2. Check conditional visibility (templates.metadata.visibleIf)
      const metadata = template.metadata as any;
      if (metadata?.visibleIf) {
        try {
          const isVisible = evaluateConditionExpression(metadata.visibleIf, data);
          if (!isVisible) {
            log.info(
              { templateId, condition: metadata.visibleIf },
              'Document skipped due to conditional visibility (visibleIf evaluated to false)'
            );
            return; // Skip document generation
          }
          log.debug('Document visibility condition passed');
        } catch (error) {
          log.warn(
            { error, condition: metadata.visibleIf },
            'Failed to evaluate document visibility condition, proceeding with generation'
          );
          // Proceed with generation if condition evaluation fails (fail-open)
        }
      }

      // 3. Apply field mapping (templates.mapping)
      let mappedData = data;
      if (template.mapping) {
        const mappingResult = applyMapping(data, template.mapping as DocumentMapping);
        mappedData = mappingResult.data;

        log.info(
          {
            mapped: mappingResult.mapped.length,
            missing: mappingResult.missing.length,
            unused: mappingResult.unused.length,
          },
          'Applied document field mapping'
        );

        if (mappingResult.missing.length > 0) {
          log.warn(
            { missingFields: mappingResult.missing },
            'Some mapped fields had no source data'
          );
        }
      }

      // 4. Get template file path
      const templatePath = await getTemplateFilePath(template.fileRef);

      // 5. Render document using new DocumentEngine
      const result = await documentEngine.generate({
        templatePath,
        data: mappedData, // Use mapped data
        outputName: `${template.name}-run-${run.id}`,
        toPdf: DEFAULT_TO_PDF, // Default to false for now, can be enabled via config later
        pdfStrategy: PDF_STRATEGY
      });

      log.info({ docxPath: result.docxPath, size: result.size }, 'Document rendered successfully');

      // 4. Generate Secure Download URL
      const fileName = path.basename(result.docxPath);
      const fileUrl = `/api/files/download/${fileName}`;

      // 5. Resolve Workflow Template ID
      // run_generated_documents requires a workflow_templates.id, not templates.id
      let workflowTemplateId: string | null = null;
      try {
        const workflow = await workflowRepository.findById(run.workflowId);
        if (workflow?.currentVersionId) {
          const workflowTemplate = await workflowTemplateRepository.findByWorkflowVersionAndTemplateId(
            workflow.currentVersionId,
            templateId
          );
          if (workflowTemplate) {
            workflowTemplateId = workflowTemplate.id;
          } else {
            log.warn({ workflowVersionId: workflow.currentVersionId }, 'Workflow template mapping not found for template');
          }
        } else {
          // This is expected for Draft runs (no version yet)
          log.info('Workflow has no current version (Draft mode), skipping template link');
        }
      } catch (err) {
        log.warn({ err }, 'Failed to resolve workflow template ID');
      }

      // 6. Save record to database
      await runGeneratedDocumentsRepository.createDocument({
        runId: run.id,
        fileName: `${template.name}.docx`,
        fileUrl,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileSize: result.size,
        templateId: workflowTemplateId as any, // Cast to any if type mismatch, but schema allows null?
        // Schema says: templateId: uuid("template_id").references(() => workflowTemplates.id, { onDelete: 'set null' }),
        // So it is nullable.
      });

      log.info('Document record saved to database');
    } catch (error) {
      log.error({
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : error,
        templateId,
        errorType: typeof error,
        errorConstructor: error?.constructor?.name
      }, 'Failed to generate document');
      throw error;
    }
  }
}

// Singleton instance
export const documentGenerationService = new DocumentGenerationService();
