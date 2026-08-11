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

/**
 * TPL-11: the set of filter names the render path (RenderCore.ts) actually
 * registers -- every key of the `docxHelpers` object, the same object
 * RenderCore iterates with `Object.entries(docxHelpers)` to build
 * angular-expressions filters. Deliberately **not**
 * `TEMPLATE_FILTER_VOCABULARY` (TPL-3, docxHelpers.ts): that constant's own
 * doc comment calls it "a curated subset of docxHelpers, not every key in
 * it" -- helpers like `add`, `round`, `join`, `length` and `formatDate`
 * work today as pipe filters (TPL-2 AC1 renders all 31 through the real
 * engine) but are not part of the *documented* preset list. Validating
 * against the curated subset would flag every one of those as "unknown"
 * on a template that renders correctly, which is a worse failure mode than
 * the bug this ticket fixes. `docxHelpers` can't drift from the renderer's
 * own registry because both import the same object.
 */
const KNOWN_FILTERS = new Set(Object.keys(docxHelpers));

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

/**
 * Split a tag body on top-level `|` characters (quote-aware, so a filter
 * argument like `default:"N/A"` -- or a hypothetical one containing a
 * literal `|` -- never gets split mid-argument). Segment 0 is always the
 * variable path; segments 1+ are filters, in application order.
 */
function splitPipeSegments(content: string): string[] {
  const segments: string[] = [];
  let current = '';
  let quote: string | null = null;

  for (const ch of content) {
    if (quote !== null) {
      current += ch;
      if (ch === quote) {
        quote = null;
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === '|') {
      segments.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  segments.push(current);

  return segments.map((s) => s.trim());
}

/** A filter segment is `name` or `name:arg1:arg2`; only the name matters here. */
function filterName(segment: string): string {
  const colonIdx = segment.indexOf(':');
  return (colonIdx === -1 ? segment : segment.slice(0, colonIdx)).trim();
}

/**
 * TPL-11 AC5 decision: an indexed path (`Children[0].name`) is reported as
 * its root alias (`Children`), not verbatim.
 *
 * Why: TPL-5's forthcoming variable inventory diffs extracted names against
 * the workflow's alias inventory, where the alias is `Children` -- the
 * array itself, never an indexed accessor (aliases name steps, and a step
 * doesn't know at design time which loop iteration will read it). Reporting
 * `Children[0].name` verbatim would make every single indexed tag in a
 * template -- the exact shape the repo owner's `docxtpl` estate table uses
 * throughout -- raise a false "unmapped variable" warning, on a variable
 * that unambiguously *is* mapped. The cost of this choice is precision: we
 * lose the trailing field/index in the reported name (`Children[0].name`
 * collapses to the same `Children` as `Children[9].guardian`). That's an
 * acceptable trade here -- alias-diffing only needs to know *which step*
 * the tag depends on, not which array element -- and it mirrors how
 * `TemplateValidationService.buildReport` already treats dotted paths
 * (`client.address.city` matches alias `client` via a root-segment split).
 * A verbatim-name option was considered and rejected for the false-warning
 * reason above.
 */
function stripArrayIndex(pathStr: string): string {
  const bracketIdx = pathStr.indexOf('[');
  return bracketIdx === -1 ? pathStr : pathStr.slice(0, bracketIdx);
}

/**
 * Handle a section-opening tag: `{{#items}}` (loop), `{{^flag}}` (inverted),
 * or a comparison (`{{#a == b}}`, TPL-2). The old helper-driven
 * (`{{#isEmpty addOns}}`) and control-word (`{{#each items}}`) indirection
 * this used to special-case belonged to the prefix grammar TPL-3 deleted
 * (D1) and no longer renders, so it is not parsed specially here either --
 * `name` is always the section's first token, index-stripped like a value
 * tag's path.
 */
function processSectionTag(state: ExtractionState, prefix: string, content: string): void {
  const firstToken = tokenizeTag(content)[0] ?? '';
  const name = stripArrayIndex(firstToken);
  const sectionScope = currentScope(state);

  addPlaceholder(
    state,
    { name, raw: `${prefix}${content}`, kind: 'section', loopScope: sectionScope },
    `#${name}|${sectionScope.join('>')}`
  );

  // '#' sections scope their inner fields to the loop/array item. Inverted
  // ('^') sections render at the current scope — push a '^'-marked entry
  // that only balances the closing tag.
  state.loopStack.push(prefix === '#' ? name : `^${name}`);
}

/**
 * Handle a value tag: `{{name}}`, `{{client.city}}`, `{{ x | upper }}`,
 * `{{ x | trim | upper }}`, `{{ Children[0].name }}`. The variable path is
 * whatever precedes the first `|`; everything after is a filter, checked
 * against `KNOWN_FILTERS`. A tag with no `|` is a plain path — unaffected by
 * the grammar this ticket fixes.
 */
function processValueTag(state: ExtractionState, content: string): void {
  const segments = splitPipeSegments(content);
  const name = stripArrayIndex(segments[0]);

  if (name === '' || name === '.') {
    return;
  }

  const filters = segments.slice(1).map(filterName).filter((f) => f !== '');
  const unknownFilter = filters.find((f) => !KNOWN_FILTERS.has(f));

  let kind: PlaceholderInfo['kind'] = 'variable';
  let helper: string | undefined;
  if (filters.length > 0) {
    // AC3/AC4: a chained tag reports one placeholder for the variable, never
    // one per filter. `helper` names the problem filter when one is unknown,
    // else the first applied filter (single-filter is the common case; for a
    // chain of all-known filters this is a representative name, not a full
    // list — nothing downstream needs the full chain today).
    kind = unknownFilter !== undefined ? 'unknown_helper' : 'helper';
    helper = unknownFilter ?? filters[0];
  }

  const scope = currentScope(state);
  addPlaceholder(
    state,
    { name, raw: content, kind, helper, loopScope: scope },
    `${name}|${scope.join('>')}`
  );
}

/**
 * Extract placeholders from a DOCX template buffer, tracking loop nesting so
 * fields that resolve against loop items are not reported as missing
 * workflow variables.
 *
 * @param fileContent - Buffer containing the .docx file
 * @throws TemplateSyntaxError when the template is malformed
 */
export async function extractPlaceholdersDetailedFromBuffer(
  fileContent: Buffer
): Promise<PlaceholderInfo[]> {
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

  const fileContent = await fs.readFile(templatePath);
  return extractPlaceholdersDetailedFromBuffer(fileContent);
}
