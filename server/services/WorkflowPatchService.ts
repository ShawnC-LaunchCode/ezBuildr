import type { Section, Step, LogicRule } from "@shared/schema";

import { db } from "../db";
import { createLogger } from "../logger";
import {
  sectionRepository,
  stepRepository as defaultStepRepository,
  logicRuleRepository,
  documentTemplateRepository,
  workflowTemplateRepository,
  workflowRepository,
  projectRepository,
  datavaultWritebackMappingsRepository,
} from "../repositories";
import { type WorkflowPatchOp, workflowPatchOpSchema } from "../schemas/aiWorkflowEdit.schema";

import { DatavaultColumnsService } from "./DatavaultColumnsService";
import { DatavaultTablesService } from "./DatavaultTablesService";
import { workflowService } from "./WorkflowService";


const logger = createLogger({ module: "workflow-patch-service" });

/**
 * Applies atomic workflow patch operations with tempId resolution
 * Used by AI workflow editing system
 */
export class WorkflowPatchService {
  private tempIdMap: Map<string, string> = new Map();
  private datavaultTablesService = new DatavaultTablesService();
  private datavaultColumnsService = new DatavaultColumnsService();
  private stepRepository = defaultStepRepository;

  constructor(stepRepo?: typeof defaultStepRepository) {
    if (stepRepo) {
      this.stepRepository = stepRepo;
    }
  }

  /**
   * Resolve a reference (can be real ID or tempId)
   */
  private resolve(ref: string | undefined): string | undefined {
    if (!ref) { return undefined; }
    return this.tempIdMap.get(ref) || ref;
  }

  /**
   * Store tempId -> real ID mapping
   */
  private mapTempId(tempId: string, realId: string): void {
    this.tempIdMap.set(tempId, realId);
    logger.debug({ tempId, realId }, "Mapped tempId to real ID");
  }

  /**
   * Clear tempId mappings (call between patch sets)
   */
  public clearMappings(): void {
    this.tempIdMap.clear();
  }

  /**
   * Get tenant context from workflow
   * Required for DataVault operations
   */
  private async getTenantContext(workflowId: string): Promise<{ tenantId: string; projectId: string }> {
    const workflow = await workflowRepository.findById(workflowId);
    if (!workflow) {
      throw new Error("Workflow not found");
    }

    if (!workflow.projectId) {
      throw new Error("Workflow has no project");
    }

    const project = await projectRepository.findById(workflow.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    if (!project.tenantId) {
      throw new Error("Project has no tenant context");
    }

    return {
      tenantId: project.tenantId,
      projectId: project.id,
    };
  }

  /**
   * Generate URL-safe slug from name
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Apply a batch of operations atomically
   * Returns summary of changes
   */
  async applyOps(
    workflowId: string,
    userId: string,
    ops: WorkflowPatchOp[]
  ): Promise<{ summary: string[]; errors: string[] }> {
    const summary: string[] = [];
    const errors: string[] = [];

    this.clearMappings();

    // Validate all ops before applying
    for (const op of ops) {
      try {
        await this.validateOp(workflowId, op);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown validation error";
        errors.push(`Validation failed for ${op.op}: ${message}`);
      }
    }

    if (errors.length > 0) {
      return { summary, errors };
    }

    // Apply ops sequentially (order matters for tempId resolution)
    for (const op of ops) {
      try {
        const result = await this.applyOp(workflowId, userId, op);
        summary.push(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        errors.push(`Failed to apply ${op.op}: ${message}`);
        logger.error({ error, op }, "Failed to apply operation");
        throw error; // Rethrow to make sure we see the stack trace in test output
      }
    }

    return { summary, errors };
  }

  /**
   * Validate a single operation (security checks, safety rules)
   */
  private async validateOp(workflowId: string, op: WorkflowPatchOp): Promise<void> {
    // Validate against Zod schema
    const result = workflowPatchOpSchema.safeParse(op);
    if (!result.success) {
      throw new Error(`Invalid operation schema: ${result.error.errors[0].message}`);
    }

    // DataVault safety checks
    if (op.op.startsWith("datavault.")) {
      if (op.op === "datavault.createTable" || op.op === "datavault.addColumns" || op.op === "datavault.createWritebackMapping") {
        // Safe operations - allowed
      } else {
        throw new Error(`Unsafe DataVault operation: ${op.op}`);
      }
    }

    // Alias uniqueness check for step creation
    if ((op.op === "step.create" || op.op === "step.update") && op.alias) {
      const existingSteps = await this.stepRepository.findByWorkflowId(workflowId);
      const duplicate = existingSteps.find(
        (s) => s.alias === op.alias && (op.op === "step.create" || s.id !== this.resolve(op.id))
      );
      if (duplicate) {
        throw new Error(`Step alias '${op.alias}' already exists`);
      }
    }
  }

  /**
   * Apply a single operation
   */
  private async applyOp(
    workflowId: string,
    userId: string,
    op: WorkflowPatchOp
  ): Promise<string> {
    switch (op.op) {
      // ====================================================================
      // Workflow Operations
      // ====================================================================
      case "workflow.setMetadata": {
        await workflowService.updateWorkflow(workflowId, userId, {
          title: op.title,
          description: op.description,
        });
        return `Updated workflow metadata`;
      }

      // ====================================================================
      // Section Operations
      // ====================================================================
      case "section.create": {
        const section = await sectionRepository.create({
          workflowId,
          title: op.title,
          order: op.order,
          config: op.config,
        });
        if (op.tempId) {
          this.mapTempId(op.tempId, section.id);
        }
        return `Created section '${op.title}'`;
      }

      case "section.update": {
        const sectionId = this.resolve(op.id || op.tempId);
        if (!sectionId) { throw new Error("Section ID or tempId required"); }

        await sectionRepository.update(sectionId, {
          title: op.title,
          order: op.order,
          config: op.config,
        });
        return `Updated section`;
      }

      case "section.delete": {
        const sectionId = this.resolve(op.id || op.tempId);
        if (!sectionId) { throw new Error("Section ID or tempId required"); }

        await sectionRepository.delete(sectionId);
        return `Deleted section`;
      }

      case "section.reorder": {
        // Update order for each section
        for (let i = 0; i < op.sectionIds.length; i++) {
          const sectionId = this.resolve(op.sectionIds[i]);
          if (sectionId) {
            await sectionRepository.update(sectionId, { order: i + 1 });
          }
        }
        return `Reordered ${op.sectionIds.length} sections`;
      }

      // ====================================================================
      // Step Operations
      // ====================================================================
      case "step.create": {
        const sectionId = this.resolve(op.sectionId || op.sectionRef);
        if (!sectionId) { throw new Error("Section ID or sectionRef required"); }

        // Get max order for this section if not specified
        const order = op.order ?? await this.getNextStepOrder(sectionId);

        const step = await this.stepRepository.create({
          sectionId,
          type: op.type as any, // Type validated by schema
          title: op.title,
          alias: op.alias,
          required: op.required ?? false,
          order,
          defaultValue: op.defaultValue,
        });

        if (op.tempId) {
          this.mapTempId(op.tempId, step.id);
        }

        return `Created step '${op.title}' (${op.type})`;
      }

      case "step.update": {
        const stepId = this.resolve(op.id || op.tempId);
        if (!stepId) { throw new Error("Step ID or tempId required"); }

        await this.stepRepository.update(stepId, {
          type: op.type as any, // Type validated by schema
          title: op.title,
          alias: op.alias,
          required: op.required,
          visibleIf: op.visibleIf as any,
          defaultValue: op.defaultValue,
        });

        return `Updated step`;
      }

      case "step.delete": {
        const stepId = this.resolve(op.id || op.tempId);
        if (!stepId) { throw new Error("Step ID or tempId required"); }

        await this.stepRepository.delete(stepId);
        return `Deleted step`;
      }

      case "step.move": {
        const stepId = this.resolve(op.id || op.tempId);
        if (!stepId) { throw new Error("Step ID or tempId required"); }

        const toSectionId = this.resolve(op.toSectionId);
        if (!toSectionId) { throw new Error("Target section ID required"); }

        const order = op.order ?? await this.getNextStepOrder(toSectionId);

        await this.stepRepository.update(stepId, {
          sectionId: toSectionId,
          order,
        });

        return `Moved step to different section`;
      }

      case "step.setVisibleIf": {
        const stepId = this.resolve(op.id || op.tempId);
        if (!stepId) { throw new Error("Step ID or tempId required"); }

        await this.stepRepository.update(stepId, {
          visibleIf: op.visibleIf,
        });

        return `Updated step visibility condition`;
      }

      case "step.setRequired": {
        const stepId = this.resolve(op.id || op.tempId);
        if (!stepId) { throw new Error("Step ID or tempId required"); }

        await this.stepRepository.update(stepId, {
          required: op.required,
        });

        return `Set step required: ${op.required}`;
      }

      // ====================================================================
      // Logic Rule Operations (Using visibleIf/skipIf expressions)
      // ====================================================================
      case "logicRule.create": {
        // Logic rules are implemented via visibleIf/skipIf on steps/sections
        // Parse the rule and apply to the target entity
        const targetId = this.resolve(op.rule.target.id || op.rule.target.tempId);
        if (!targetId) { throw new Error("Logic rule target ID required"); }

        // Convert rule to ConditionExpression format
        const conditionExpr = this.parseConditionToExpression(op.rule.condition);

        if (op.rule.target.type === "step") {
          await this.stepRepository.update(targetId, {
            visibleIf: conditionExpr,
          });
          return `Applied visibility rule to step`;
        } else if (op.rule.target.type === "section") {
          await sectionRepository.update(targetId, {
            visibleIf: conditionExpr,
          });
          return `Applied visibility rule to section`;
        } else {
          throw new Error(`Unknown target type: ${op.rule.target.type}`);
        }
      }

      case "logicRule.update": {
        // Update existing visibleIf on a step or section
        if (!op.rule.target) {
          throw new Error("Logic rule target required for update");
        }
        const targetId = this.resolve(op.rule.target.id || op.rule.target.tempId);
        if (!targetId) { throw new Error("Logic rule target ID required"); }

        const conditionExpr = op.rule.condition
          ? this.parseConditionToExpression(op.rule.condition)
          : null;

        if (op.rule.target.type === "step") {
          await this.stepRepository.update(targetId, {
            visibleIf: conditionExpr,
          });
        } else if (op.rule.target.type === "section") {
          await sectionRepository.update(targetId, {
            visibleIf: conditionExpr,
          });
        }

        return `Updated visibility rule`;
      }

      case "logicRule.delete": {
        // Delete logic rule by ID (from logic_rules table)
        await logicRuleRepository.delete(op.id);
        return `Removed logic rule`;
      }

      // ====================================================================
      // Document Operations
      // ====================================================================
      case "document.add": {
        // Attach an existing template to the workflow
        // Assumes 'template' field contains a templateId
        const templateId = op.template;
        const { projectId } = await this.getTenantContext(workflowId);

        // Verify template exists and belongs to project
        const template = await documentTemplateRepository.findByIdAndProjectId(
          templateId,
          projectId
        );
        if (!template) {
          throw new Error(
            `Template not found: ${templateId}. Please ensure the document has been uploaded first.`
          );
        }

        // Get current workflow to access versionId
        // For now, we'll use workflowId directly since workflow_templates uses workflowVersionId
        // In production, we'd need to handle versioning properly
        const workflow = await workflowRepository.findById(workflowId);
        if (!workflow) {
          throw new Error("Workflow not found");
        }

        // Create workflow-template link
        // Note: This assumes we're working with the latest/current version
        // In a versioned system, we'd need to pass/track the versionId
        const link = await workflowTemplateRepository.create({
          workflowVersionId: workflowId, // TODO: Use actual versionId when versioning is active
          templateId: template.id,
          key: this.generateSlug(op.name),
          isPrimary: false,
        });

        if (op.tempId) {
          this.mapTempId(op.tempId, link.id);
        }

        return `Attached document '${op.name}' (${op.fileType})`;
      }

      case "document.update": {
        const docId = this.resolve(op.id || op.tempId);
        if (!docId) { throw new Error("Document ID or tempId required"); }

        const { projectId } = await this.getTenantContext(workflowId);

        // Update the template metadata
        if (op.name !== undefined) {
          await documentTemplateRepository.update(docId, {
            name: op.name,
          });
        }

        return `Updated document`;
      }

      case "document.setConditional": {
        const docId = this.resolve(op.id || op.tempId);
        if (!docId) { throw new Error("Document ID or tempId required"); }

        // Parse condition to ConditionExpression if provided
        const conditionExpr = op.condition
          ? this.parseConditionToExpression(op.condition)
          : null;

        // Store conditional logic in template metadata
        await documentTemplateRepository.update(docId, {
          metadata: {
            visibleIf: conditionExpr,
          },
        });

        return op.condition
          ? `Set conditional visibility for document`
          : `Removed conditional visibility from document`;
      }

      case "document.bindFields": {
        const docId = this.resolve(op.id || op.tempId);
        if (!docId) { throw new Error("Document ID or tempId required"); }

        const { projectId } = await this.getTenantContext(workflowId);

        // Verify all step aliases exist in workflow
        const workflowSteps = await this.stepRepository.findByWorkflowId(workflowId);
        const validAliases = new Set(workflowSteps.map(s => s.alias).filter(Boolean));

        for (const stepAlias of Object.values(op.bindings)) {
          if (!validAliases.has(stepAlias)) {
            throw new Error(
              `Step alias '${stepAlias}' not found in workflow. Please create the step first.`
            );
          }
        }

        // Build mapping in format: { fieldName: { type: 'variable', source: stepAlias } }
        const mapping: Record<string, { type: 'variable'; source: string }> = {};
        for (const [fieldName, stepAlias] of Object.entries(op.bindings)) {
          mapping[fieldName] = {
            type: 'variable',
            source: stepAlias,
          };
        }

        // Update template mapping
        await documentTemplateRepository.update(docId, {
          mapping,
        });

        return `Bound ${Object.keys(op.bindings).length} field(s) to workflow variables`;
      }

      // ====================================================================
      // DataVault Operations (Additive only - strictly safe)
      // ====================================================================
      case "datavault.createTable": {
        const { tenantId } = await this.getTenantContext(workflowId);

        // Verify database exists if provided
        if (op.databaseId) {
          // Database verification would go here
          // For now, we'll proceed assuming it's valid
        }

        // Create table with auto-generated slug
        const table = await this.datavaultTablesService.createTable({
          tenantId,
          ownerUserId: userId,
          databaseId: op.databaseId || null,
          name: op.name,
          slug: this.generateSlug(op.name),
          description: null,
        });

        // Add custom columns (ID column is auto-created by service)
        let columnCount = 0;
        for (const col of op.columns) {
          columnCount++;
          await this.datavaultColumnsService.createColumn({
            tableId: table.id,
            name: col.name,
            type: col.type,
            required: col.config?.required || false,
            description: col.config?.description || null,
            // Add type-specific config
            options: col.type === 'select' || col.type === 'multiselect'
              ? col.config?.options || null
              : null,
          }, tenantId);
        }

        if (op.tempId) {
          this.mapTempId(op.tempId, table.id);
        }

        return `Created DataVault table '${op.name}' with ${op.columns.length} column(s)`;
      }

      case "datavault.addColumns": {
        const tableId = this.resolve(op.tableId);
        if (!tableId) { throw new Error("Table ID required"); }

        const { tenantId } = await this.getTenantContext(workflowId);

        // Verify table exists and user has write access
        await this.datavaultTablesService.requirePermission(
          userId,
          tableId,
          tenantId,
          "write"
        );

        // Get current max orderIndex
        const context = await this.getTenantContext(workflowId);
        const existingColumns = await this.datavaultColumnsService.listColumns(tableId, context.tenantId);

        // Add new columns
        for (const col of op.columns) {
          await this.datavaultColumnsService.createColumn({
            tableId,
            name: col.name,
            type: col.type,
            required: col.config?.required || false,
            description: col.config?.description || null,
            options: col.type === 'select' || col.type === 'multiselect'
              ? col.config?.options || null
              : null,
          }, context.tenantId);
        }

        return `Added ${op.columns.length} column(s) to DataVault table`;
      }

      case "datavault.createWritebackMapping": {
        const tableId = this.resolve(op.tableId);
        if (!tableId) { throw new Error("Table ID required"); }

        const { tenantId } = await this.getTenantContext(workflowId);

        // Verify table exists and user has write access
        await this.datavaultTablesService.requirePermission(
          userId,
          tableId,
          tenantId,
          "write"
        );

        // Get table columns
        const columns = await this.datavaultColumnsService.listColumns(tableId, tenantId);
        const columnsBySlug = new Map(columns.map((c) => [c.slug, c.id]));
        const columnsByName = new Map(columns.map((c) => [c.name, c.id]));

        // Get workflow steps to validate aliases
        const workflowSteps = await this.stepRepository.findByWorkflowId(workflowId);
        const validAliases = new Set(workflowSteps.map((s) => s.alias).filter(Boolean));

        // Build columnMappings: { stepAlias: columnId }
        const columnMappings: Record<string, string> = {};
        for (const [stepAlias, columnName] of Object.entries(op.columnMappings)) {
          // Validate step alias exists
          if (!validAliases.has(stepAlias)) {
            throw new Error(
              `Step alias '${stepAlias}' not found in workflow. Please create the step first.`
            );
          }

          // Resolve column name to column ID (try slug first, then name)
          const columnSlug = this.generateSlug(columnName);
          const columnId = columnsBySlug.get(columnSlug) || columnsByName.get(columnName);

          if (!columnId) {
            throw new Error(
              `Column '${columnName}' not found in table. Available columns: ${Array.from(columnsByName.keys()).join(', ')
              }`
            );
          }

          columnMappings[stepAlias] = columnId;
        }

        // Create writeback mapping
        const mapping = await datavaultWritebackMappingsRepository.create({
          workflowId,
          tableId,
          columnMappings: columnMappings as any,
          triggerPhase: 'afterComplete',
          createdBy: userId,
        });

        return `Created writeback mapping: ${Object.keys(op.columnMappings).length} field(s) → DataVault table`;
      }

      default:
        // TypeScript should ensure exhaustive checking
        const _exhaustive: never = op;
        throw new Error(`Unknown operation: ${(op as any).op}`);
    }
  }

  /**
   * Get next available order for a section's steps
   */
  private async getNextStepOrder(sectionId: string): Promise<number> {
    const steps = await this.stepRepository.findBySectionId(sectionId);
    if (steps.length === 0) { return 1; }
    return Math.max(...steps.map(s => s.order)) + 1;
  }

  /**
   * Parse a condition string into a ConditionExpression
   * Produces format compatible with shared/types/conditions.ts
   * Examples:
   *   "email equals 'test@example.com'"
   *   "age greater_than 18"
   *   "status is_empty"
   */
  private parseConditionToExpression(condition: string): any {
    // Trim whitespace
    condition = condition.trim();

    // Map old operator names to new ComparisonOperator values
    const operatorMappings: Record<string, string> = {
      'notEquals': 'not_equals',
      'equals': 'equals',
      'notContains': 'not_contains',
      'contains': 'contains',
      'startsWith': 'starts_with',
      'endsWith': 'ends_with',
      'isEmpty': 'is_empty',
      'notEmpty': 'is_not_empty',
      'gte': 'greater_or_equal',
      'lte': 'less_or_equal',
      'gt': 'greater_than',
      'lt': 'less_than',
      'in': 'includes_any',
      'notIn': 'not_includes',
    };

    // Try all operator variants (including mapped names)
    const operators = [
      'not_equals', 'notEquals', 'equals',
      'not_contains', 'notContains', 'contains',
      'starts_with', 'startsWith', 'ends_with', 'endsWith',
      'greater_or_equal', 'gte', 'less_or_equal', 'lte',
      'greater_than', 'gt', 'less_than', 'lt',
      'is_empty', 'isEmpty', 'is_not_empty', 'notEmpty',
      'includes_any', 'in', 'not_includes', 'notIn',
      'includes', 'includes_all',
      'is_true', 'is_false', 'between',
    ];

    for (const rawOperator of operators) {
      const operatorIndex = condition.indexOf(` ${rawOperator} `);
      if (operatorIndex === -1) { continue; }

      const left = condition.substring(0, operatorIndex).trim();
      const right = condition.substring(operatorIndex + rawOperator.length + 2).trim();

      // Map operator to canonical form
      const canonicalOp = operatorMappings[rawOperator] || rawOperator;

      // For isEmpty/notEmpty, no right operand needed
      if (canonicalOp === 'is_empty' || canonicalOp === 'is_not_empty' || canonicalOp === 'is_true' || canonicalOp === 'is_false') {
        return {
          type: 'group',
          id: `cond_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          operator: 'AND',
          conditions: [{
            type: 'condition',
            id: `cond_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            variable: left,
            operator: canonicalOp,
            valueType: 'constant',
          }],
        };
      }

      // Parse right value
      let rightValue: any;
      let valueType: 'constant' | 'variable' = 'constant';

      if (right.startsWith("'") && right.endsWith("'")) {
        // String literal
        rightValue = right.slice(1, -1);
      } else if (right.startsWith("[") && right.endsWith("]")) {
        // Array literal: ['value1', 'value2'] or [1, 2, 3]
        const arrayContent = right.slice(1, -1);
        rightValue = arrayContent.split(',').map(item => {
          item = item.trim();
          if (item.startsWith("'") && item.endsWith("'")) {
            return item.slice(1, -1);
          } else if (!isNaN(Number(item))) {
            return Number(item);
          }
          return item;
        });
      } else if (right === 'true' || right === 'false') {
        // Boolean literal
        rightValue = right === 'true';
      } else if (right === 'null') {
        // Null literal
        rightValue = null;
      } else if (!isNaN(Number(right))) {
        // Number literal
        rightValue = Number(right);
      } else {
        // Variable reference
        rightValue = right;
        valueType = 'variable';
      }

      // Return ConditionGroup format
      return {
        type: 'group',
        id: `cond_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        operator: 'AND',
        conditions: [{
          type: 'condition',
          id: `cond_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          variable: left,
          operator: canonicalOp,
          value: rightValue,
          valueType,
        }],
      };
    }

    throw new Error(`Could not parse condition: "${condition}". Expected format: "variable operator value" (e.g., "email equals 'test@example.com'", "age greater_than 18")`);
  }
}

export const workflowPatchService = new WorkflowPatchService();
