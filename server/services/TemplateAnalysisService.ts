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

import fs from 'fs/promises';

import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

import { createError } from '../utils/errors';

import { docxHelpers } from './docxHelpers';
import { templateFileExists, getTemplateFilePath } from './templates';

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

/**
 * Analyze a DOCX template
 */
export async function analyzeTemplate(fileRef: string): Promise<TemplateAnalysis> {
  // Verify file exists
  const exists = await templateFileExists(fileRef);
  if (!exists) {
    throw createError.notFound('Template file');
  }

  const templatePath = getTemplateFilePath(fileRef);

  try {
    // Read template file
    const content = await fs.readFile(templatePath, 'binary');
    const zip = new PizZip(content);

    // Create docxtemplater instance
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    // Get full text
    const fullText = doc.getFullText();

    // Extract all placeholders
    const placeholders = extractAllPlaceholders(fullText);

    // Categorize placeholders
    const variables: PlaceholderInfo[] = [];
    const loops: LoopInfo[] = [];
    const conditionals: ConditionalInfo[] = [];
    const helpersUsed = new Set<string>();

    for (const ph of placeholders) {
      if (ph.type === 'loop') {
        loops.push({
          variable: ph.name,
          depth: ph.depth || 0,
        });
      } else if (ph.type === 'conditional') {
        conditionals.push({
          variable: ph.name,
          type: ph.conditionalType as 'if' | 'unless',
        });
      } else if (ph.type === 'helper') {
        if (ph.helperName) {
          helpersUsed.add(ph.helperName);
        }
      }
      variables.push(ph);
    }

    // Calculate stats
    const uniqueVars = new Set(
      variables.filter((v) => v.type === 'variable').map((v) => v.name)
    );

    const stats = {
      totalPlaceholders: placeholders.length,
      uniqueVariables: uniqueVars.size,
      loopCount: loops.length,
      conditionalCount: conditionals.length,
      helperCallCount: Array.from(helpersUsed).length,
      maxNestingDepth: calculateMaxDepth(loops),
    };

    return {
      variables,
      loops,
      conditionals,
      helpers: Array.from(helpersUsed).sort(),
      stats,
    };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw createError.notFound('Template file', templatePath);
    }
    throw createError.internal(
      `Failed to analyze template: ${error.message || 'Unknown error'}`
    );
  }
}

/**
 * Extract all placeholders from template text
 */
function extractAllPlaceholders(text: string): PlaceholderInfo[] {
  const placeholders: PlaceholderInfo[] = [];
  const regex = /\{([#\/]?)([^{}]+?)\}/g;
  let match;

  const loopStack: { name: string; depth: number }[] = [];

  while ((match = regex.exec(text)) !== null) {
    const prefix = match[1]; // '#' for opening, '/' for closing, '' for simple
    const content = match[2].trim();

    if (prefix === '/') {
      // Closing tag - pop from loop stack
      loopStack.pop();
      continue;
    }

    const parts = content.split(/\s+/);
    const currentDepth = loopStack.length;

    if (prefix === '#') {
      // Control structure
      const controlType = parts[0];

      if (['if', 'unless'].includes(controlType)) {
        // Conditional
        const varName = parts[1] || '';
        placeholders.push({
          name: varName,
          type: 'conditional',
          conditionalType: controlType,
        } as PlaceholderInfo);
      } else if (['each', 'for'].includes(controlType)) {
        // Loop with explicit keyword
        const varName = parts[1] || '';
        loopStack.push({ name: varName, depth: currentDepth });
        placeholders.push({
          name: varName,
          type: 'loop',
          depth: currentDepth,
        } as PlaceholderInfo);
      } else {
        // Simple loop syntax: {#items}
        loopStack.push({ name: controlType, depth: currentDepth });
        placeholders.push({
          name: controlType,
          type: 'loop',
          depth: currentDepth,
        } as PlaceholderInfo);
      }
    } else {
      // Simple variable or helper call
      if (parts.length > 1 && parts[0] in docxHelpers) {
        // Helper call: {helper variable}
        placeholders.push({
          name: parts[1],
          type: 'helper',
          helperName: parts[0],
          path: parts[1].includes('.') ? parts[1] : undefined,
        });
      } else {
        // Simple variable: {variable} or {user.name}
        placeholders.push({
          name: parts[0],
          type: 'variable',
          path: parts[0].includes('.') ? parts[0] : undefined,
        });
      }
    }
  }

  return placeholders;
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
export async function validateTemplateWithData(
  fileRef: string,
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
export async function generateSampleData(fileRef: string): Promise<Record<string, any>> {
  const analysis = await analyzeTemplate(fileRef);
  const sampleData: Record<string, any> = {};

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
): Promise<{
  added: string[];
  removed: string[];
  unchanged: string[];
}> {
  const analysis1 = await analyzeTemplate(fileRef1);
  const analysis2 = await analyzeTemplate(fileRef2);

  const vars1 = new Set(analysis1.variables.map((v) => v.name));
  const vars2 = new Set(analysis2.variables.map((v) => v.name));

  const added = Array.from(vars2).filter((v) => !vars1.has(v));
  const removed = Array.from(vars1).filter((v) => !vars2.has(v));
  const unchanged = Array.from(vars1).filter((v) => vars2.has(v));

  return {
    added: added.sort(),
    removed: removed.sort(),
    unchanged: unchanged.sort(),
  };
}
