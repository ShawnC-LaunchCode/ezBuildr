/**
 * Stage 21: Template Analysis Service
 *
 * Analyzes DOCX templates to extract:
 * - Variables and placeholders
 * - Loop structures
 * - Conditional blocks
 * - Helper function usage
 * - Nested data paths
 *
 * Provides validation against sample data and coverage analysis
 */

import path from 'path';
import { eq } from 'drizzle-orm';

import { db } from '../db';
import { workflows, workflowTemplates, templates } from '../../shared/schema';

import { createError } from '../utils/errors';

import { docxHelpers, tokenizeTag } from './docxHelpers';
import { getTemplateFilePath } from './templateFiles';
import {
  extractPlaceholdersDetailed,
  TemplateSyntaxError,
  type PlaceholderInfo as SharedPlaceholderInfo,
} from './templatePlaceholders';

export interface PlaceholderInfo {
  name: string;
  type: 'variable' | 'loop' | 'conditional' | 'helper';
  path?: string; // For nested paths like "user.address.city"
  helperName?: string; // For helper calls like "upper name"
  context?: string; // Location in template (paragraph, table, etc.)
  depth?: number; // Nesting depth for loops
  conditionalType?: 'if' | 'unless'; // Type of conditional
}

export interface LoopInfo {
  variable: string;
  depth: number; // Nesting level (0 = top level)
  children?: LoopInfo[]; // Nested loops
}

export interface ConditionalInfo {
  variable: string;
  type: 'if' | 'unless';
}

export interface TemplateAnalysis {
  variables: PlaceholderInfo[];
  loops: LoopInfo[];
  conditionals: ConditionalInfo[];
  helpers: string[]; // List of helper functions used
  stats: {
    totalPlaceholders: number;
    uniqueVariables: number;
    loopCount: number;
    conditionalCount: number;
    helperCallCount: number;
    maxNestingDepth: number;
  };
}

export interface ValidationResult {
  valid: boolean;
  coverage: number; // 0-100 percentage of placeholders covered
  missing: string[]; // Variables not provided in data
  extra: string[]; // Variables in data but not used in template
  warnings: ValidationWarning[];
}

export interface ValidationWarning {
  code: string;
  message: string;
  variable?: string;
  severity: 'info' | 'warning' | 'error';
}

export interface TemplatePlaceholderRename {
  from: string;
  to: string;
}

export interface TemplateComparison {
  added: string[];
  removed: string[];
  unchanged: string[];
  renamed: TemplatePlaceholderRename[];
}

/**
 * A shared meaningful token out of three total tokens is the minimum evidence
 * for a rename. Short tokens are ignored below so generic fragments such as
 * "id" or "var" cannot pair otherwise unrelated placeholders.
 */
const RENAMED_PLACEHOLDER_TOKEN_OVERLAP_THRESHOLD = 1 / 3;

/**
 * Analyze a DOCX template.
 * Accepts either a storage fileRef or an absolute file path — callers are
 * split between the two (extractPlaceholders passes fileRefs; the renderers
 * and test service pass resolved absolute paths).
 *
 * Placeholder extraction is delegated to the shared, loop-scope-aware parser
 * (templatePlaceholders); this function only categorizes the result into the
 * structural TemplateAnalysis shape (variables / loops / conditionals /
 * helpers / stats).
 */
export async function analyzeTemplate(fileRefOrPath: string): Promise<TemplateAnalysis> {
  const templatePath = path.isAbsolute(fileRefOrPath)
    ? fileRefOrPath
    : await getTemplateFilePath(fileRefOrPath);

  let extracted: SharedPlaceholderInfo[];
  try {
    extracted = await extractPlaceholdersDetailed(templatePath);
  } catch (error) {
    if (error instanceof TemplateSyntaxError) {
      throw createError.badRequest(`Failed to analyze template: ${error.message}`);
    }
    throw error;
  }

  const variables: PlaceholderInfo[] = [];
  const loops: LoopInfo[] = [];
  const conditionals: ConditionalInfo[] = [];
  const helpersUsed = new Set<string>();

  for (const raw of extracted) {
    const ph = toAnalysisPlaceholder(raw);
    if (ph.type === 'loop') {
      loops.push({ variable: ph.name, depth: ph.depth ?? 0 });
    } else if (ph.type === 'conditional') {
      conditionals.push({ variable: ph.name, type: ph.conditionalType ?? 'if' });
    } else if (ph.type === 'helper' && ph.helperName !== undefined) {
      helpersUsed.add(ph.helperName);
    }
    variables.push(ph);
  }

  const uniqueVars = new Set(
    variables.filter((v) => v.type === 'variable').map((v) => v.name)
  );

  const stats = {
    totalPlaceholders: extracted.length,
    uniqueVariables: uniqueVars.size,
    loopCount: loops.length,
    conditionalCount: conditionals.length,
    helperCallCount: helpersUsed.size,
    maxNestingDepth: calculateMaxDepth(loops),
  };

  return {
    variables,
    loops,
    conditionals,
    helpers: Array.from(helpersUsed).sort(),
    stats,
  };
}

/** Map a shared parser placeholder into the structural analysis shape. */
function toAnalysisPlaceholder(ph: SharedPlaceholderInfo): PlaceholderInfo {
  if (ph.kind === 'helper') {
    return {
      name: ph.name,
      type: 'helper',
      helperName: ph.helper,
      path: ph.name.includes('.') ? ph.name : undefined,
    };
  }

  if (ph.kind === 'section') {
    return classifySection(ph);
  }

  return {
    name: ph.name,
    type: 'variable',
    path: ph.name.includes('.') ? ph.name : undefined,
  };
}

/**
 * A section tag ({{#x}}, {{^x}}, {{#if x}}, {{#each rows}}) is either a loop
 * or a conditional. In this product `{{#x}}` is data-driven (array => loop,
 * truthy => conditional), so we classify by syntax: inverted ('^') and
 * if/unless read as conditionals; everything else reads as a loop, with its
 * nesting depth taken from the enclosing loop scope.
 */
function classifySection(ph: SharedPlaceholderInfo): PlaceholderInfo {
  const prefix = ph.raw.charAt(0);
  const keyword = tokenizeTag(ph.raw.slice(1))[0];

  if (prefix === '^') {
    return { name: ph.name, type: 'conditional', conditionalType: 'unless' };
  }
  if (keyword === 'if' || keyword === 'unless') {
    return { name: ph.name, type: 'conditional', conditionalType: keyword };
  }
  return { name: ph.name, type: 'loop', depth: ph.loopScope.length };
}

/**
 * Calculate max nesting depth
 */
function calculateMaxDepth(loops: LoopInfo[]): number {
  if (loops.length === 0) {return 0;}
  return Math.max(...loops.map((l) => l.depth)) + 1;
}

/**
 * Validate template with sample data
 */
// eslint-disable-next-line sonarjs/cognitive-complexity
export async function validateTemplateWithData(
  fileRef: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- sample data can contain any valid JSON structure for template variables
  sampleData: Record<string, any>
): Promise<ValidationResult> {
  // Analyze template
  const analysis = await analyzeTemplate(fileRef);

  // Extract unique variable names (excluding helpers and system vars)
  const templateVars = new Set<string>();
  for (const variable of analysis.variables) {
    if (variable.type === 'variable' || variable.type === 'loop' || variable.type === 'conditional') {
      // For nested paths, take the root variable
      const rootVar = variable.path ? variable.path.split('.')[0] : variable.name;
      templateVars.add(rootVar);
    }
  }

  // Get data keys (excluding helpers)
  const dataKeys = Object.keys(sampleData).filter((key) => !(key in docxHelpers));

  // Find missing variables
  const missing: string[] = [];
  for (const varName of Array.from(templateVars)) {
    if (!(varName in sampleData) && !(varName in docxHelpers)) {
      missing.push(varName);
    }
  }

  // Find extra keys
  const extra = dataKeys.filter((key) => !templateVars.has(key));

  // Generate warnings
  const warnings: ValidationWarning[] = [];

  // Check for type mismatches
  for (const variable of analysis.variables) {
    if (variable.type === 'loop') {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const value = sampleData[variable.name];
      if (value !== undefined && !Array.isArray(value)) {
        warnings.push({
          code: 'TYPE_MISMATCH',
          message: `Loop variable '${variable.name}' should be an array`,
          variable: variable.name,
          severity: 'error',
        });
      }
    }
  }

  // Check for potentially empty arrays
  for (const variable of analysis.variables) {
    if (variable.type === 'loop') {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const value = sampleData[variable.name];
      if (Array.isArray(value) && value.length === 0) {
        warnings.push({
          code: 'EMPTY_ARRAY',
          message: `Loop variable '${variable.name}' is an empty array`,
          variable: variable.name,
          severity: 'warning',
        });
      }
    }
  }

  // Check for unused helpers
  for (const helper of analysis.helpers) {
    warnings.push({
      code: 'HELPER_USED',
      message: `Helper function '${helper}' is used in template`,
      severity: 'info',
    });
  }

  // Calculate coverage
  const totalRequired = templateVars.size;
  const provided = totalRequired - missing.length;
  const coverage = totalRequired > 0 ? Math.round((provided / totalRequired) * 100) : 100;

  return {
    valid: missing.length === 0 && warnings.filter((w) => w.severity === 'error').length === 0,
    coverage,
    missing,
    extra,
    warnings,
  };
}

/**
 * Get suggested sample data for a template
 * Generates placeholder values based on variable names and types
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- sample data can generate any valid JSON type based on variable analysis
export async function generateSampleData(fileRef: string): Promise<Record<string, any>> {
  const analysis = await analyzeTemplate(fileRef);
  const sampleData: Record<string, unknown> = {};

  for (const variable of analysis.variables) {
    if (variable.type === 'variable') {
      // Generate sample value based on name
      sampleData[variable.name] = generateSampleValue(variable.name);
    } else if (variable.type === 'loop') {
      // Generate sample array
      sampleData[variable.name] = [
        { id: 1, name: `Sample ${variable.name} 1` },
        { id: 2, name: `Sample ${variable.name} 2` },
      ];
    } else if (variable.type === 'conditional') {
      // Generate boolean
      sampleData[variable.name] = true;
    }
  }

  return sampleData;
}

/**
 * Generate sample value based on variable name heuristics
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generates various JSON types based on heuristics (string, number, boolean, Date)
function generateSampleValue(varName: string): any {
  const lower = varName.toLowerCase();

  // Date fields
  if (lower.includes('date') || lower.includes('time')) {
    return new Date().toISOString();
  }

  // Numeric fields
  if (
    lower.includes('amount') ||
    lower.includes('price') ||
    lower.includes('total') ||
    lower.includes('quantity') ||
    lower.includes('count')
  ) {
    return 1234.56;
  }

  // Boolean fields
  if (
    lower.includes('is') ||
    lower.includes('has') ||
    lower.includes('should') ||
    lower.includes('enabled')
  ) {
    return true;
  }

  // Email fields
  if (lower.includes('email')) {
    return 'sample@example.com';
  }

  // Phone fields
  if (lower.includes('phone')) {
    return '(555) 123-4567';
  }

  // Name fields
  if (lower.includes('name')) {
    return 'Sample Name';
  }

  // Default: string
  return `Sample ${varName}`;
}

/**
 * Compare two templates and find differences
 */
export async function compareTemplates(
  fileRef1: string,
  fileRef2: string
): Promise<TemplateComparison> {
  const analysis1 = await analyzeTemplate(fileRef1);
  const analysis2 = await analyzeTemplate(fileRef2);

  const vars1 = new Set(analysis1.variables.map((v) => v.name));
  const vars2 = new Set(analysis2.variables.map((v) => v.name));

  const added = Array.from(vars2).filter((v) => !vars1.has(v));
  const removed = Array.from(vars1).filter((v) => !vars2.has(v));
  const unchanged = Array.from(vars1).filter((v) => vars2.has(v));
  const renamed = findPlaceholderRenames(removed, added);
  const renamedFrom = new Set(renamed.map((rename) => rename.from));
  const renamedTo = new Set(renamed.map((rename) => rename.to));

  return {
    added: added.filter((name) => !renamedTo.has(name)).sort(),
    removed: removed.filter((name) => !renamedFrom.has(name)).sort(),
    unchanged: unchanged.sort(),
    renamed,
  };
}

function getMeaningfulPlaceholderTokens(name: string): Set<string> {
  return new Set(
    name
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 4)
  );
}

function getPlaceholderTokenOverlap(from: string, to: string): number {
  const fromTokens = getMeaningfulPlaceholderTokens(from);
  const toTokens = getMeaningfulPlaceholderTokens(to);
  const union = new Set([...fromTokens, ...toTokens]);

  if (union.size === 0) {
    return 0;
  }

  const sharedCount = [...fromTokens].filter((token) => toTokens.has(token)).length;
  return sharedCount / union.size;
}

/**
 * Pair rename candidates globally by strongest similarity so an early weak
 * match cannot consume the best candidate for a later placeholder.
 */
function findPlaceholderRenames(
  removed: string[],
  added: string[]
): TemplatePlaceholderRename[] {
  const candidates = removed.flatMap((from) =>
    added.map((to) => ({ from, to, score: getPlaceholderTokenOverlap(from, to) }))
  );

  candidates.sort(
    (left, right) =>
      right.score - left.score ||
      left.from.localeCompare(right.from) ||
      left.to.localeCompare(right.to)
  );

  const matchedFrom = new Set<string>();
  const matchedTo = new Set<string>();
  const renamed: TemplatePlaceholderRename[] = [];

  for (const candidate of candidates) {
    if (candidate.score < RENAMED_PLACEHOLDER_TOKEN_OVERLAP_THRESHOLD) {
      break;
    }
    if (matchedFrom.has(candidate.from) || matchedTo.has(candidate.to)) {
      continue;
    }

    renamed.push({ from: candidate.from, to: candidate.to });
    matchedFrom.add(candidate.from);
    matchedTo.add(candidate.to);
  }

  return renamed.sort(
    (left, right) => left.from.localeCompare(right.from) || left.to.localeCompare(right.to)
  );
}

/**
 * Get all workflows that reference a specific template, categorized by whether they pin a version or follow latest.
 */interface WorkflowPinState {
  isPinned: boolean;
  isUnpinned: boolean;
}

interface TemplateConfig {
  templateId: string;
  pinnedVersionId?: string | null;
}

function processTemplateRef(t: unknown, templateId: string, normalizeFn: (t: unknown) => TemplateConfig | null, result: WorkflowPinState): void {
  const norm = normalizeFn(t);
  if (norm && norm.templateId === templateId) {
    if (norm.pinnedVersionId) {
      result.isPinned = true;
    } else {
      result.isUnpinned = true;
    }
  }
}

function checkSectionPinState(sectionsData: unknown[], templateId: string, normalizeFn: (t: unknown) => TemplateConfig | null): WorkflowPinState {
  const result: WorkflowPinState = { isPinned: false, isUnpinned: false };

  for (const sec of sectionsData) {
    if (!sec || typeof sec !== 'object' || !('config' in sec)) {
      continue;
    }
    
    const config = (sec as { config: unknown }).config;
    if (!config || typeof config !== 'object' || !('finalBlock' in config) || !('templates' in config)) {
      continue;
    }
    
    const finalBlock = (config as { finalBlock?: boolean }).finalBlock;
    const templates = (config as { templates?: unknown[] }).templates;
    
    if (finalBlock === true && Array.isArray(templates)) {
      for (const t of templates) {
        processTemplateRef(t, templateId, normalizeFn, result);
      }
    }
  }

  return result;
}

function processDocumentRef(doc: unknown, templateId: string, result: WorkflowPinState): void {
  if (!doc || typeof doc !== 'object' || !('documentId' in doc)) {
    return;
  }
  const typedDoc = doc as { documentId: string; pinnedVersionId?: string | null };
  if (typedDoc.documentId === templateId) {
    if (typedDoc.pinnedVersionId) {
      result.isPinned = true;
    } else {
      result.isUnpinned = true;
    }
  }
}

function checkStepPinState(stepsData: unknown[], templateId: string): WorkflowPinState {
  const result: WorkflowPinState = { isPinned: false, isUnpinned: false };

  for (const st of stepsData) {
    if (!st || typeof st !== 'object' || !('config' in st)) {
      continue;
    }
    
    const config = (st as { config: unknown }).config;
    if (!config || typeof config !== 'object' || !('type' in config) || !('documents' in config)) {
      continue;
    }
    
    const type = (config as { type?: string }).type;
    const documents = (config as { documents?: unknown[] }).documents;
    
    if (type === 'final_block' && Array.isArray(documents)) {
      for (const doc of documents) {
        processDocumentRef(doc, templateId, result);
      }
    }
  }

  return result;
}

export async function getActiveWorkflowsForTemplate(templateId: string): Promise<{
  active: Array<{ id: string; name: string }>;
  pinned: Array<{ id: string; name: string }>;
}> {
  const usages = await db
    .select({
      workflowId: workflows.id,
      workflowName: workflows.name,
      workflowTitle: workflows.title
    })
    .from(workflowTemplates)
    .innerJoin(workflows, eq(workflows.currentVersionId, workflowTemplates.workflowVersionId))
    .where(
      eq(workflowTemplates.templateId, templateId)
    );

  const uniqueWorkflows = new Map<string, { id: string; name: string }>();
  for (const row of usages) {
    uniqueWorkflows.set(row.workflowId, { id: row.workflowId, name: row.workflowName ?? row.workflowTitle });
  }

  const active = [];
  const pinned = [];

  const { sections, steps } = await import('../../shared/schema');
  const { normalizeFinalDocumentsTemplateEntry } = await import('../../shared/finalDocumentsTemplates');

  for (const wf of uniqueWorkflows.values()) {
    // Fetch sections (legacy final_documents)
    const wfSections = await db.select({ config: sections.config }).from(sections).where(eq(sections.workflowId, wf.id));
    const secState = checkSectionPinState(wfSections, templateId, normalizeFinalDocumentsTemplateEntry);

    // Fetch steps (final_block)
    const wfSteps = await db.select({ config: steps.config }).from(steps).where(eq(steps.workflowId, wf.id));
    const stState = checkStepPinState(wfSteps, templateId);

    const isUnpinned = secState.isUnpinned || stState.isUnpinned;
    const isPinned = secState.isPinned || stState.isPinned;

    if (isUnpinned) {
      active.push(wf);
    } else if (isPinned) {
      pinned.push(wf);
    } else {
      active.push(wf); // fallback to active if we can't find it (shouldn't happen)
    }
  }

  return { active, pinned };
}

/**
 * Analyze an impending template update and return impact warning data
 */
export async function analyzeTemplateUpdate(
  templateId: string,
  newFileRef: string
): Promise<{
  comparison: TemplateComparison;
  impact: { workflowsAffected: number; workflows: Array<{ id: string; name: string }>; pinnedWorkflows: Array<{ id: string; name: string }>; hasRemovedPlaceholders: boolean; requiresReview: boolean };
}> {
  const [template] = await db.select().from(templates).where(eq(templates.id, templateId));
  if (template === undefined) {
    throw createError.notFound('Template not found');
  }

  const comparison = await compareTemplates(template.fileRef, newFileRef);
  const { active: activeWorkflows, pinned: pinnedWorkflows } = await getActiveWorkflowsForTemplate(templateId);

  return {
    comparison,
    impact: {
      workflowsAffected: activeWorkflows.length,
      workflows: activeWorkflows,
      pinnedWorkflows: pinnedWorkflows,
      hasRemovedPlaceholders: comparison.removed.length > 0,
      requiresReview:
        activeWorkflows.length > 0 &&
        (comparison.removed.length > 0 || comparison.renamed.length > 0),
    }
  };
}
