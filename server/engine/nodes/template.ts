import fs from 'fs/promises';
import path from 'path';

import { eq, and } from 'drizzle-orm';

import * as schema from '@shared/schema';

import { db } from '../../db';
import { logger } from '../../logger';
import { pdfService } from '../../services/document/PdfService';
import { renderDocx2 } from '../../services/docxRenderer2';
import { renderTemplate , getTemplateFilePath } from '../../services/templates';
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
  templateId?: string;             // Direct reference to template (legacy)
  templateKey?: string;            // Key to resolve from workflowTemplates mapping (new)
  bindings: Record<string, string>; // Map of template placeholders to expressions
  outputName?: string;             // Optional output file name
  condition?: string;              // Optional conditional execution
  skipBehavior?: 'skip' | 'hide' | 'disable';
  toPdf?: boolean;                 // Generate PDF version (Stage 21)
  engine?: 'legacy' | 'v2';        // Which rendering engine to use (default: v2)
}
export interface TemplateNodeInput {
  nodeId: string;
  config: TemplateNodeConfig;
  context: EvalContext;
  tenantId: string;
  runId?: string;                  // Run ID for output tracking (Stage 21)
  workflowVersionId?: string;      // Workflow version for template key resolution (Stage 21)
}
export interface TemplateNodeOutput {
  status: 'executed' | 'skipped';
  outputRef?: {
    fileRef: string;
    pdfRef?: string;
    format: string;
    size?: number;
  };
  bindings?: Record<string, any>;  // Resolved binding values
  skipReason?: string;
  error?: string;
}
/**
 * Execute a template node (Stage 21 - Multi-Template Support)
 *
 * @param input - Node configuration and execution context
 * @returns Execution result
 */
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
    const resolvedBindings: Record<string, any> = {};
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
    let template: any;
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
    if (template.project.tenantId !== tenantId) {
      throw new Error(`Access denied to template ${template.id}`);
    }
    // Choose rendering engine (default to v2)
    const engine = config.engine || 'v2';
    const toPdf = config.toPdf || false;
    let result: { fileRef: string; pdfRef?: string; size: number; format: string };
    if (template.type === 'pdf') {
      // Stage 22: PDF Form Filling
      const templatePath = getTemplateFilePath(template.fileRef);
      const fileBuffer = await fs.readFile(templatePath);
      // Resolve mappings
      const pdfData: Record<string, string> = {};
      const mapping = (template.mapping as Record<string, string>) || {};
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
    } else if (engine === 'v2') {
      // Use new docxRenderer2 with loops, conditionals, helpers
      const templatePath = getTemplateFilePath(template.fileRef);
      const outputDir = path.join(process.cwd(), 'server', 'files', 'outputs');
      // Ensure output directory exists
      await fs.mkdir(outputDir, { recursive: true });
      const renderResult = await renderDocx2({
        templatePath,
        data: resolvedBindings,
        outputDir,
        outputName: config.outputName,
        toPdf,
      });
      result = {
        fileRef: path.basename(renderResult.docxPath),
        pdfRef: renderResult.pdfPath ? path.basename(renderResult.pdfPath) : undefined,
        size: renderResult.size,
        format: 'docx',
      };
    } else {
      // Legacy rendering engine
      result = await renderTemplate(template.fileRef, resolvedBindings, {
        outputName: config.outputName,
        toPdf,
      });
    }
    // Store output in runOutputs table if runId is provided
    if (runId && workflowVersionId) {
      const fileType = toPdf && result.pdfRef ? 'pdf' : 'docx';
      const storagePath = toPdf && result.pdfRef ? result.pdfRef : result.fileRef;
      await db.insert(schema.runOutputs).values({
        runId,
        workflowVersionId,
        templateKey: templateKey || 'default',
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
        templateKey: config.templateKey || 'default',
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
    bindings: Record<string, any>,
    tenantId: string
  ): Promise<{ fileRef: string; format: string; size: number }> {
    // Placeholder for actual implementation
    return {
      fileRef: `template-${templateId}-${Date.now()}.docx`,
      format: 'docx',
      size: 1024,
    };
  },
};