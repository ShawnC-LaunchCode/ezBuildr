import type { EvalContext } from '../expr';
import { evaluateExpression } from '../expr';
import { db } from '../../db';
import * as schema from '@shared/schema';
import { eq } from 'drizzle-orm';
import { renderTemplate } from '../../services/templates';

/**
 * Template Node Executor
 * Handles document generation from templates
 */

export interface TemplateNodeConfig {
  templateId: string;              // Reference to template document
  bindings: Record<string, string>; // Map of template placeholders to expressions
  outputName?: string;             // Optional output file name
  condition?: string;              // Optional conditional execution
  skipBehavior?: 'skip' | 'hide' | 'disable';
}

export interface TemplateNodeInput {
  nodeId: string;
  config: TemplateNodeConfig;
  context: EvalContext;
  tenantId: string;
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
 * Execute a template node
 *
 * @param input - Node configuration and execution context
 * @returns Execution result
 */
export async function executeTemplateNode(
  input: TemplateNodeInput
): Promise<TemplateNodeOutput> {
  const { nodeId, config, context, tenantId } = input;

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

    // Fetch template from database
    const template = await db.query.templates.findFirst({
      where: eq(schema.templates.id, config.templateId),
      with: {
        project: true,
      },
    });

    if (!template) {
      throw new Error(`Template ${config.templateId} not found`);
    }

    // Verify tenant access
    if (template.project.tenantId !== tenantId) {
      throw new Error(`Access denied to template ${config.templateId}`);
    }

    // Render the template with bindings
    const result = await renderTemplate(
      template.fileRef,
      resolvedBindings,
      {
        outputName: config.outputName,
        toPdf: false, // Can be made configurable via node config
      }
    );

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
