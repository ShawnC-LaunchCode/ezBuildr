/**
 * Template placeholder extraction (shared leaf module).
 *
 * The single, loop-scope-aware DOCX placeholder parser used by both
 * TemplateValidationService (workflow-alias validation) and
 * TemplateAnalysisService (structural analysis). It lives in its own leaf
 * module — importing only docxtemplater, docxHelpers, and the error helpers —
 * so both services can share it without an import cycle (TemplateValidation
 * -> templates.ts -> TemplateAnalysisService would otherwise close a loop).
 */

import fs from 'fs/promises';


import Docxtemplater from 'docxtemplater';

import PizZip from 'pizzip';

import { createError } from '../utils/errors';

import { docxHelpers, tokenizeTag } from './docxHelpers';

export interface PlaceholderInfo {
  /** Variable name the tag resolves against (loop collection for sections) */
  name: string;
  /** Raw tag content as written in the document */
  raw: string;
  kind: 'variable' | 'section' | 'helper' | 'unknown_helper';
  /** Helper name when kind === 'helper' */
  helper?: string;
  /** Enclosing loop collections ([] when at top level) */
  loopScope: string[];
}

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

  if (parts.length > 1) {
    if (parts[0] in docxHelpers) {
      helper = parts[0];
      name = parts[1];
      kind = 'helper';
    } else {
      helper = parts[0];
      name = parts[1];
      kind = 'unknown_helper';
    }
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
 *
 * @param templatePath - Absolute path to the .docx file
 * @throws TemplateSyntaxError when the template is malformed
 */
export async function extractPlaceholdersDetailed(
  templatePath: string
): Promise<PlaceholderInfo[]> {
  try {
    await fs.access(templatePath);
  } catch {
    throw createError.notFound('Template file', templatePath);
  }


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
