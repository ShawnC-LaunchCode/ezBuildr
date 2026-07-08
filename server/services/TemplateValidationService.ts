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

import fs from 'fs/promises';

// eslint-disable-next-line @typescript-eslint/naming-convention
import Docxtemplater from 'docxtemplater';
// eslint-disable-next-line @typescript-eslint/naming-convention
import PizZip from 'pizzip';

import { createError } from '../utils/errors';

import { docxHelpers, tokenizeTag } from './docxHelpers';
import { getTemplateFilePath } from './templates';
import { variableService } from './VariableService';

import type { WorkflowVariable } from '@shared/schema';

// ============================================================================
// TYPES
// ============================================================================

export interface PlaceholderInfo {
  /** Variable name the tag resolves against (loop collection for sections) */
  name: string;
  /** Raw tag content as written in the document */
  raw: string;
  kind: 'variable' | 'section' | 'helper';
  /** Helper name when kind === 'helper' */
  helper?: string;
  /** Enclosing loop collections ([] when at top level) */
  loopScope: string[];
}

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
  /** True when the template parses and every top-level placeholder resolves */
  valid: boolean;
}

// ============================================================================
// PLACEHOLDER EXTRACTION (loop-scope aware)
// ============================================================================

const TAG_REGEX = /\{\{([#/^]?)([^{}]+?)\}\}/g;
const CONTROL_WORDS = new Set(['if', 'unless', 'with', 'each', 'for']);

/** Raised when the template itself is malformed (unclosed/mismatched tags) */
export class TemplateSyntaxError extends Error {
  readonly syntaxErrors: string[];

  constructor(syntaxErrors: string[]) {
    super(`Template syntax error: ${syntaxErrors.join(' | ')}`);
    this.name = 'TemplateSyntaxError';
    this.syntaxErrors = syntaxErrors;
  }
}

interface DocxtemplaterErrorShape {
  message?: string;
  properties?: {
    explanation?: string;
    errors?: Array<{ message?: string; properties?: { explanation?: string; xtag?: string } }>;
  };
}

function describeTemplateErrors(error: unknown): string[] {
  const err = error as DocxtemplaterErrorShape;
  const inner = err.properties?.errors;
  if (inner !== undefined && inner.length > 0) {
    return inner.map((e) => {
      const explanation = e.properties?.explanation ?? e.message ?? 'Unknown template error';
      const tag = e.properties?.xtag;
      return tag !== undefined ? `${explanation} (tag: ${tag})` : explanation;
    });
  }
  return [err.properties?.explanation ?? err.message ?? 'Unknown template error'];
}

interface ExtractionState {
  placeholders: PlaceholderInfo[];
  seen: Set<string>;
  /** Open sections; '^'-prefixed entries balance closing tags without scoping fields */
  loopStack: string[];
}

function currentScope(state: ExtractionState): string[] {
  return state.loopStack.filter((s) => !s.startsWith('^'));
}

function addPlaceholder(state: ExtractionState, info: PlaceholderInfo, dedupeKey: string): void {
  if (!state.seen.has(dedupeKey)) {
    state.seen.add(dedupeKey);
    state.placeholders.push(info);
  }
}

/** Handle a section-opening tag ({{#items}}, {{^flag}}, {{#isEmpty x}}) */
function processSectionTag(state: ExtractionState, prefix: string, content: string): void {
  const parts = tokenizeTag(content);
  // Helper-driven sections ({{#isEmpty addOns}}) and legacy control-flow
  // sections ({{#each items}}) name the underlying variable second
  const usesIndirection =
    parts[1] !== undefined && (CONTROL_WORDS.has(parts[0]) || parts[0] in docxHelpers);
  const name = usesIndirection ? parts[1] : parts[0];
  const sectionScope = currentScope(state);

  addPlaceholder(
    state,
    { name, raw: `${prefix}${content}`, kind: 'section', loopScope: sectionScope },
    `#${name}|${sectionScope.join('>')}`
  );

  // '#' array sections scope their inner fields to the loop items.
  // Inverted ('^') and helper-driven sections render at the current
  // scope — push a '^'-marked entry that only balances the closing tag.
  const scopesFields = prefix === '#' && !usesIndirection;
  state.loopStack.push(scopesFields ? name : `^${name}`);
}

/** Handle a value tag ({{name}}, {{client.city}}, {{upper name}}) */
function processValueTag(state: ExtractionState, content: string): void {
  const parts = tokenizeTag(content);
  let name = parts[0];
  let kind: PlaceholderInfo['kind'] = 'variable';
  let helper: string | undefined;

  if (parts.length > 1 && parts[0] in docxHelpers) {
    helper = parts[0];
    name = parts[1];
    kind = 'helper';
  }

  if (name === undefined || name === '' || name === '.') {
    return;
  }

  const scope = currentScope(state);
  addPlaceholder(
    state,
    { name, raw: content, kind, helper, loopScope: scope },
    `${name}|${scope.join('>')}`
  );
}

/**
 * Extract placeholders from a DOCX template, tracking loop nesting so
 * fields that resolve against loop items are not reported as missing
 * workflow variables.
 */
export async function extractPlaceholdersDetailed(
  templatePath: string
): Promise<PlaceholderInfo[]> {
  try {
    await fs.access(templatePath);
  } catch {
    throw createError.notFound('Template file', templatePath);
  }

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const fileContent = await fs.readFile(templatePath, 'binary');
  const zip = new PizZip(fileContent);

  let doc: Docxtemplater;
  try {
    doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '{{', end: '}}' },
    });
  } catch (error) {
    throw new TemplateSyntaxError(describeTemplateErrors(error));
  }

  const state: ExtractionState = { placeholders: [], seen: new Set(), loopStack: [] };

  for (const match of doc.getFullText().matchAll(TAG_REGEX)) {
    const prefix = match[1];
    const content = match[2].trim();

    if (prefix === '/') {
      state.loopStack.pop();
    } else if (prefix === '#' || prefix === '^') {
      processSectionTag(state, prefix, content);
    } else {
      processValueTag(state, content);
    }
  }

  return state.placeholders;
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
    const missing: MissingPlaceholderReport[] = [];
    const referenced = new Set<string>();

    for (const placeholder of placeholders) {
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
      valid: missing.length === 0,
    };
  }
}

export const templateValidationService = new TemplateValidationService();
