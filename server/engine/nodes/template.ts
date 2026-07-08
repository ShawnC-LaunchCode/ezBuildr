import fs from 'fs/promises';
import path from 'path';

import { eq, and } from 'drizzle-orm';

import * as schema from '@shared/schema';

import { db } from '../../db';
import { logger } from '../../logger';
import { pdfService } from '../../services/document/PdfService';
import { enhancedDocumentEngine } from '../../services/document/EnhancedDocumentEngine';
import { getTemplateFilePath } from '../../services/templates';
import { evaluateExpression } from '../expr';

import type { EvalContext } from '../expr';
/**
 * Template Node Executor (Stage 21 - Multi-Template Support)
 * Handles document generation from templates with support for:
 * - Direct templateId (backward compatible)
 * - Template key resolution via workflowTemplates mapping (new)
 * - Enhanced DOCX rendering with loops/conditionals/helpers
 * - Output tracking in runOutputs table
 */
export interface TemplateNodeConfig {
  templateId?: string;
  templateKey?: string;
  bindings: Record<string, string>;
  outputName?: string;
  condition?: string;
  skipBehavior?: 'skip' | 'hide' | 'disable';
  toPdf?: boolean;
  engine?: 'legacy' | 'v2';
}
export interface TemplateNodeInput {
  nodeId: string;
  config: TemplateNodeConfig;
  context: EvalContext;
  tenantId: string;
  runId?: string;
  workflowVersionId?: string;
}
export interface TemplateNodeOutput {
  status: 'executed' | 'skipped';
  outputRef?: {
    fileRef: string;
    pdfRef?: string;
    format: string;
    size?: number;
  };
  bindings?: Record<string, unknown>;
  skipReason?: string;
  error?: string;
}
/**
 * Execute a template node (Stage 21 - Multi-Template Support)
 *
 * @param input - Node configuration and execution context
 * @returns Execution result
 */
// eslint-disable-next-line complexity, sonarjs/cognitive-complexity
export async function executeTemplateNode(
  input: TemplateNodeInput
): Promise<TemplateNodeOutput> {
  const { nodeId, config, context, tenantId, runId, workflowVersionId } = input;
  try {
    // Check condition if present
    if (config.condition) {
      const conditionResult = evaluateExpression(config.condition, context);
      if (!conditionResult) {
        return {
          status: 'skipped',
          skipReason: 'condition evaluated to false',
        };
      }
    }
    // Resolve bindings by evaluating expressions
    const resolvedBindings: Record<string, unknown> = {};
    for (const [placeholder, expression] of Object.entries(config.bindings)) {
      try {
        resolvedBindings[placeholder] = evaluateExpression(expression, context);
      } catch (error) {
        throw new Error(
          `Failed to resolve binding '${placeholder}': ${error instanceof Error ? error.message : 'unknown error'}`
        );
      }
    }
    // Resolve template: either by templateKey (new) or templateId (legacy)
    let template: unknown;
    let templateKey: string | undefined;
    if (config.templateKey && workflowVersionId) {
      // New path: resolve template from workflowTemplates mapping
      templateKey = config.templateKey;
      const mapping = await db.query.workflowTemplates.findFirst({
        where: and(
          eq(schema.workflowTemplates.workflowVersionId, workflowVersionId),
          eq(schema.workflowTemplates.key, config.templateKey)
        ),
        with: {
          template: {
            with: {
              project: true,
            },
          },
        },
      });
      if (!mapping) {
        throw new Error(
          `Template with key '${config.templateKey}' not found in workflow version ${workflowVersionId}`
        );
      }
      template = mapping.template;
    } else if (config.templateId) {
      // Legacy path: direct templateId lookup
      template = await db.query.templates.findFirst({
        where: eq(schema.templates.id, config.templateId),
        with: {
          project: true,
        },
      });
      if (!template) {
        throw new Error(`Template ${config.templateId} not found`);
      }
    } else {
      throw new Error(
        'Template node must specify either templateKey (with workflowVersionId) or templateId'
      );
    }
    // Verify tenant access
    if ((template as { project: { tenantId: string }; id: string }).project.tenantId !== tenantId) {
      throw new Error(`Access denied to template ${(template as { id: string }).id}`);
    }
    // All DOCX rendering goes through the shared render core (via
    // renderDocx2); the 'legacy' engine option is accepted but ignored
    if (config.engine === 'legacy') {
      logger.info({ nodeId }, "Template node requested 'legacy' engine; rendering with the shared core");
    }
    const toPdf = config.toPdf ?? false;
    let result: { fileRef: string; pdfRef?: string; size: number; format: string };
    const templateTyped = template as { type: string; fileRef: string; mapping?: Record<string, string> };
    if (templateTyped.type === 'pdf') {
      // Stage 22: PDF Form Filling
      const templatePath = getTemplateFilePath(templateTyped.fileRef);
      const fileBuffer = await fs.readFile(templatePath);
      // Resolve mappings
      const pdfData: Record<string, string> = {};
      const mapping = templateTyped.mapping ?? {};
      for (const [field, variable] of Object.entries(mapping)) {
        try {
          // Resolve value. If it's a direct variable name or simple expression, evaluate it.
          // We assume the stored mapping is an expression or variable path.
          const val = evaluateExpression(variable, context);
          if (val !== undefined && val !== null) {
            pdfData[field] = String(val);
          }
        } catch (e) {
          logger.warn({ field, variable, error: e }, "Failed to resolve PDF mapping");
        }
      }
      const filledBuffer = await pdfService.fillPdf(fileBuffer, pdfData);
      // Save output
      const outputName = config.outputName
        ? (config.outputName.endsWith('.pdf') ? config.outputName : `${config.outputName}.pdf`)
        : `output-${nodeId}-${Date.now()}.pdf`;
      const outputDir = path.join(process.cwd(), 'server', 'files', 'outputs');
      await fs.mkdir(outputDir, { recursive: true });
      const outputPath = path.join(outputDir, outputName);
      await fs.writeFile(outputPath, filledBuffer);
      result = {
        fileRef: outputName,
        pdfRef: outputName,
        size: filledBuffer.length,
        format: 'pdf'
      };
    } else {
      // DOCX rendering via the shared core (loops, conditionals, helpers)
      const templatePath = getTemplateFilePath(templateTyped.fileRef);
      const outputDir = path.join(process.cwd(), 'server', 'files', 'outputs');
      // Ensure output directory exists
      await fs.mkdir(outputDir, { recursive: true });
      const renderResult = await enhancedDocumentEngine.generateWithMapping({
        templatePath,
        rawData: resolvedBindings,
        outputDir,
        outputName: config.outputName ?? 'generated-document',
        toPdf,
        normalize: false, // data is already resolved bindings
        templateId: (template as { id: string }).id,
        runId, // graph run id — matches template_generation_metrics.run_id FK
      });
      if (!renderResult.docxPath) {throw new Error('Document generation failed to produce a DOCX path');}
      result = {
        fileRef: path.basename(renderResult.docxPath),
        pdfRef: renderResult.pdfPath ? path.basename(renderResult.pdfPath) : undefined,
        size: renderResult.size,
        format: 'docx',
      };
    }
    // Store output in runOutputs table if runId is provided
    if (runId && workflowVersionId) {
      const fileType = toPdf && result.pdfRef ? 'pdf' : 'docx';
      const storagePath = toPdf && result.pdfRef ? result.pdfRef : result.fileRef;
      await db.insert(schema.runOutputs).values({
        runId,
        workflowVersionId,
        templateKey: templateKey ?? 'default',
        fileType,
        storagePath,
        status: 'ready',
      });
    }
    return {
      status: 'executed',
      outputRef: {
        fileRef: result.fileRef,
        pdfRef: result.pdfRef,
        format: result.format,
        size: result.size,
      },
      bindings: resolvedBindings,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'unknown error';
    // Store failed output in runOutputs table if runId is provided
    if (runId && workflowVersionId) {
      await db.insert(schema.runOutputs).values({
        runId,
        workflowVersionId,
        templateKey: config.templateKey ?? 'default',
        fileType: config.toPdf ? 'pdf' : 'docx',
        storagePath: '',
        status: 'failed',
        error: errorMessage,
      });
    }
    // Return error status instead of throwing
    // This allows the workflow to continue and log the error
    return {
      status: 'executed', // Mark as executed even on error
      error: errorMessage,
      bindings: {},
    };
  }
}
/**
 * Stub for future docx service integration
 */
export const docxService = {
  async render(
    templateId: string,
    _bindings: Record<string, unknown>,
    _tenantId: string
  ): Promise<{ fileRef: string; format: string; size: number }> {
    // Placeholder for actual implementation
    return {
      fileRef: `template-${templateId}-${Date.now()}.docx`,
      format: 'docx',
      size: 1024,
    };
  },
};