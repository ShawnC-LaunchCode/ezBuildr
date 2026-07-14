/**
 * Template Validation Service
 *
 * Compares the placeholders in an uploaded DOCX template against the
 * variables (step aliases) of a workflow, so authors find typos and
 * unmapped fields at upload time instead of in a blank generated document.
 *
 * Composes existing building blocks: placeholder extraction (docxtemplater
 * full text), the docxHelpers registry (to recognize helper tags), and
 * fuzzy alias suggestions.
 */

import { getTemplateFilePath } from './templates';
import {
  extractPlaceholdersDetailed,
  TemplateSyntaxError,
  type PlaceholderInfo,
} from './templatePlaceholders';
import { variableService } from './VariableService';

import type { WorkflowVariable } from '@shared/schema';

// The placeholder parser lives in the shared leaf module; re-exported here so
// existing importers (and the client-mirrored report types) keep one entry point.
export { extractPlaceholdersDetailed, TemplateSyntaxError };
export type { PlaceholderInfo };

// ============================================================================
// TYPES
// ============================================================================

export interface MissingPlaceholderReport {
  placeholder: string;
  raw: string;
  suggestions: string[];
}

export interface TemplateValidationReport {
  templateId: string;
  workflowId: string;
  /** Every distinct tag found in the template */
  placeholders: PlaceholderInfo[];
  /** Placeholder names that resolve to a workflow variable */
  matched: string[];
  /** Top-level placeholders with no matching variable */
  missing: MissingPlaceholderReport[];
  /**
   * Placeholders inside a loop whose fields come from the loop items;
   * they cannot be statically checked against workflow variables
   */
  loopScoped: string[];
  /** Workflow variables never referenced by the template (informational) */
  unusedVariables: Array<{ alias: string; label: string }>;
  /**
   * Steps that have no alias: their answers are excluded from document
   * data entirely (SnapshotService only exports aliased values)
   */
  stepsWithoutAlias: Array<{ stepId: string; label: string; sectionTitle: string }>;
  /** Malformed template tags (unclosed/mismatched); analysis is skipped */
  syntaxErrors: string[];
  /** Helpers referenced in tags but not defined in docxHelpers */
  unknownHelpers: string[];
  /** True when the template parses and every top-level placeholder resolves */
  valid: boolean;
}

// ============================================================================
// FUZZY SUGGESTIONS
// ============================================================================

function normalizeFieldName(name: string): string {
  return name.toLowerCase().replace(/[_-]/g, '');
}

function levenshtein(a: string, b: string): number {
  if (a.length === 0) { return b.length; }
  if (b.length === 0) { return a.length; }

  let prev = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j++) {
    const curr = [j];
    for (let i = 1; i <= a.length; i++) {
      curr[i] = Math.min(
        prev[i] + 1,
        curr[i - 1] + 1,
        prev[i - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = curr;
  }
  return prev[a.length];
}

/**
 * Rank candidate aliases for an unmatched placeholder: case-insensitive
 * match first, then underscore/dash-insensitive, then edit distance <= 3.
 */
export function suggestAliases(placeholder: string, aliases: string[]): string[] {
  const lower = placeholder.toLowerCase();
  const normalized = normalizeFieldName(placeholder);

  const scored = aliases
    .map((alias) => {
      const aliasLower = alias.toLowerCase();
      if (aliasLower === lower) { return { alias, score: 0 }; }
      if (normalizeFieldName(alias) === normalized) { return { alias, score: 1 }; }
      const distance = levenshtein(lower, aliasLower);
      if (distance <= 3) { return { alias, score: 1 + distance }; }
      if (aliasLower.includes(lower) || lower.includes(aliasLower)) {
        return { alias, score: 6 };
      }
      return null;
    })
    .filter((entry): entry is { alias: string; score: number } => entry !== null)
    .sort((a, b) => a.score - b.score);

  return scored.slice(0, 3).map((entry) => entry.alias);
}

// ============================================================================
// SERVICE
// ============================================================================

/** Step types that never contribute a value to document data */
const VALUELESS_STEP_TYPES = new Set(['display', 'final_documents']);

export class TemplateValidationService {
  /**
   * Validate a template's placeholders against a workflow's variables.
   *
   * @param templateId - Template row id (for the report)
   * @param fileRef - Template file reference (templates.fileRef)
   * @param workflowId - Workflow whose variables to check against
   * @param userId - User for workflow access verification
   */
  async validate(
    templateId: string,
    fileRef: string,
    workflowId: string,
    userId: string
  ): Promise<TemplateValidationReport> {
    const variables = await variableService.listVariables(workflowId, userId);

    let placeholders: PlaceholderInfo[];
    try {
      placeholders = await extractPlaceholdersDetailed(getTemplateFilePath(fileRef));
    } catch (error) {
      if (error instanceof TemplateSyntaxError) {
        const report = this.buildReport(templateId, workflowId, [], variables);
        return { ...report, syntaxErrors: error.syntaxErrors, valid: false };
      }
      throw error;
    }

    return this.buildReport(templateId, workflowId, placeholders, variables);
  }

  /** Pure comparison, separated for testability */
  buildReport(
    templateId: string,
    workflowId: string,
    placeholders: PlaceholderInfo[],
    variables: WorkflowVariable[]
  ): TemplateValidationReport {
    const aliases = variables
      .map((v) => v.alias)
      .filter((alias): alias is string => alias !== null && alias !== '');
    const aliasSet = new Set(aliases);

    const matched = new Set<string>();
    const loopScoped = new Set<string>();
    const unknownHelpersSet = new Set<string>();
    const missing: MissingPlaceholderReport[] = [];
    const referenced = new Set<string>();

    for (const placeholder of placeholders) {
      if (placeholder.kind === 'unknown_helper') {
        unknownHelpersSet.add(placeholder.helper ?? placeholder.name);
      }

      // The engine resolves dot paths from the root scope, so a placeholder
      // matches when its first segment is a workflow alias
      const rootSegment = placeholder.name.split('.')[0];
      const isMatch = aliasSet.has(placeholder.name) || aliasSet.has(rootSegment);

      if (isMatch) {
        matched.add(placeholder.name);
        referenced.add(aliasSet.has(placeholder.name) ? placeholder.name : rootSegment);
        continue;
      }

      if (placeholder.loopScope.length > 0) {
        // Fields inside {{#loop}} resolve against loop items; they cannot
        // be statically verified against workflow variables
        loopScoped.add(placeholder.name);
        continue;
      }

      missing.push({
        placeholder: placeholder.name,
        raw: placeholder.raw,
        suggestions: suggestAliases(placeholder.name, aliases),
      });
    }

    const unusedVariables = variables
      .filter(
        (v) =>
          v.alias !== null &&
          v.alias !== '' &&
          !referenced.has(v.alias) &&
          !VALUELESS_STEP_TYPES.has(v.type)
      )
      .map((v) => ({ alias: v.alias as string, label: v.label }));

    const stepsWithoutAlias = variables
      .filter((v) => (v.alias === null || v.alias === '') && !VALUELESS_STEP_TYPES.has(v.type))
      .map((v) => ({ stepId: v.stepId, label: v.label, sectionTitle: v.sectionTitle }));

    const unknownHelpers = Array.from(unknownHelpersSet).sort();

    return {
      templateId,
      workflowId,
      placeholders,
      matched: Array.from(matched).sort(),
      missing,
      loopScoped: Array.from(loopScoped).sort(),
      unusedVariables,
      stepsWithoutAlias,
      syntaxErrors: [],
      unknownHelpers,
      valid: missing.length === 0 && unknownHelpers.length === 0,
    };
  }
}

export const templateValidationService = new TemplateValidationService();
