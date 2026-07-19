/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { versionService } from "./VersionService";

export interface LintResult {
  type: "error" | "warning";
  message: string;
}

export class WorkflowLintService {
  async lint(workflowId: string, userId: string): Promise<LintResult[]> {
    const data = await versionService.serializeWorkflow(workflowId, userId);
    const results: LintResult[] = [];

    const sections = data.sections || [];
    if (sections.length === 0) {
      results.push({ type: "error", message: "Workflow must have at least one section." });
    }

    const validAliases = this.collectAliases(sections);
    const hasSteps = this.lintSections(sections, validAliases, results);

    if (sections.length > 0 && !hasSteps) {
      results.push({ type: "error", message: "Workflow must have at least one question." });
    }

    this.lintLogicRules(data.logicRules || [], validAliases, results);
    this.lintBlocksWithInputs(data.transformBlocks || [], "Transform block", validAliases, results);
    this.lintBlocksWithInputs(data.lifecycleHooks || [], "Lifecycle hook", validAliases, results);
    this.lintBlocksWithInputs(data.documentHooks || [], "Document hook", validAliases, results);

    return results;
  }

  private collectAliases(sections: Record<string, any>[]): Set<string> {
    const validAliases = new Set<string>();
    for (const section of sections) {
      if (section.alias) {validAliases.add(section.alias);}
      for (const step of section.steps || []) {
        if (step.alias) {validAliases.add(step.alias);}
      }
    }
    return validAliases;
  }

  private lintSections(sections: Record<string, any>[], validAliases: Set<string>, results: LintResult[]): boolean {
    let hasSteps = false;
    for (const section of sections) {
      const steps = section.steps || [];
      if (steps.length > 0) {hasSteps = true;}

      this.checkVisibleIf(section.visibleIf, validAliases, `Section "${section.title}"`, results);

      for (const step of steps) {
        if (!step.alias) {results.push({ type: "warning", message: `Step "${step.title ?? step.id}" has no alias.` });}
        if (!step.title) {results.push({ type: "warning", message: `A step in section "${section.title}" is missing a title.` });}

        this.checkVisibleIf(step.visibleIf, validAliases, `Step "${step.title ?? step.id}"`, results);
      }
    }
    return hasSteps;
  }

  private lintLogicRules(rules: Record<string, any>[], validAliases: Set<string>, results: LintResult[]): void {
    for (const rule of rules) {
      if (rule.conditionStepAlias && !validAliases.has(rule.conditionStepAlias)) {
        results.push({ type: "error", message: `Logic rule condition references unknown alias: "${rule.conditionStepAlias}"` });
      }
      if (rule.targetAlias && !validAliases.has(rule.targetAlias)) {
        results.push({ type: "error", message: `Logic rule target references unknown alias: "${rule.targetAlias}"` });
      }
    }
  }

  private lintBlocksWithInputs(blocks: Record<string, any>[], typeName: string, validAliases: Set<string>, results: LintResult[]): void {
    for (const b of blocks) {
      if (b.inputKeys) {
        for (const k of b.inputKeys) {
          if (!validAliases.has(k)) {
            results.push({ type: "error", message: `${typeName} "${b.name}" references unknown input alias: "${k}"` });
          }
        }
      }
    }
  }

  private checkVisibleIf(expression: unknown, validAliases: Set<string>, contextLabel: string, results: LintResult[]): void {
    if (!expression) { return; }

    // visibleIf is stored as a ConditionExpression object (jsonb), not a string:
    // { type: 'group', operator, conditions: [{ type: 'condition', variable, ... } | nested group] }.
    // Older/imported rows may still be a raw string expression — handle both.
    const referenced = typeof expression === "string"
      ? this.extractStringIdentifiers(expression)
      : this.collectConditionVariables(expression);

    const keywords = new Set(['true', 'false', 'null', 'undefined', 'and', 'or', 'not']);
    for (const id of referenced) {
      if (!keywords.has(id) && !validAliases.has(id)) {
        results.push({ type: "warning", message: `${contextLabel} visibleIf condition references unknown alias: "${id}"` });
      }
    }
  }

  private extractStringIdentifiers(expression: string): string[] {
    return expression.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) ?? [];
  }

  /** Walk a ConditionExpression tree collecting every `variable` it references. */
  private collectConditionVariables(node: unknown): string[] {
    if (node === null || typeof node !== "object") { return []; }
    const obj = node as Record<string, unknown>;
    const vars: string[] = [];

    if (typeof obj.variable === "string" && obj.variable.length > 0) {
      vars.push(obj.variable);
    }
    if (Array.isArray(obj.conditions)) {
      for (const child of obj.conditions) {
        vars.push(...this.collectConditionVariables(child));
      }
    }
    return vars;
  }
}

export const workflowLintService = new WorkflowLintService();
