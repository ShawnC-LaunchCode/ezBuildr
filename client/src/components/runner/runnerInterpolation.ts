import angularExpressionParser from "docxtemplater/expressions.js";

import { formatAnswerValue } from "@/lib/formatAnswerValue";

import { normalizeRunnerStepType } from "@shared/types/runnerStepTypes";

import { docxHelpers } from "../../../../server/services/docxHelpers";

export interface RunnerAnswerDefinition {
  type: string;
  config?: unknown;
}

export type RunnerAnswerDefinitions = Record<string, RunnerAnswerDefinition>;

type InterpolationOutput = "markdown" | "text";

interface InterpolateRunnerTextOptions {
  output?: InterpolationOutput;
}

interface ExpressionContext {
  scopeList: Record<string, unknown>[];
  scopePathItem: number[];
  scopeTypes: string[];
}

const parseRunnerExpression = angularExpressionParser.configure({
  // The browser-safe interpreter avoids angular-expressions' generated
  // function path, which references Node's `global` and fails in Vite.
  csp: true,
  filters: docxHelpers,
});

/**
 * Markdown is the only runner surface where an interpolated answer is parsed
 * as markup after interpolation. Escape CommonMark punctuation here so an
 * answer remains literal text, while the workflow author's surrounding
 * markdown continues to work. Plain React text nodes use `output: "text"`;
 * React performs the equivalent structural escaping for that boundary.
 */
function escapeMarkdown(value: string): string {
  return value.replace(/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g, "\\$&");
}

function formatScopeValue(
  value: unknown,
  definition: RunnerAnswerDefinition | undefined
): unknown {
  if (value === null || value === undefined || value === "" || definition === undefined) {
    return value;
  }

  const normalizedType = normalizeRunnerStepType(definition.type);
  if (normalizedType !== "address" && normalizedType !== "choice") {
    return value;
  }

  return formatAnswerValue(value, {
    type: normalizedType,
    config: definition.config,
  });
}

function buildExpressionScope(
  context: Record<string, unknown>,
  aliasMap: Record<string, string>,
  definitions: RunnerAnswerDefinitions
): Record<string, unknown> {
  const scope: Record<string, unknown> = Object.create(null) as Record<string, unknown>;

  for (const [key, value] of Object.entries(context)) {
    scope[key] = formatScopeValue(value, definitions[key]);
  }

  for (const [alias, answerKey] of Object.entries(aliasMap)) {
    scope[alias] = formatScopeValue(context[answerKey], definitions[answerKey]);
  }

  return scope;
}

function stringifyExpressionResult(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    return formatAnswerValue(value);
  }
  return String(value);
}

/**
 * Resolve runner answer references with the document template grammar.
 *
 * The parser and filter object are the same ones used by RenderCore, so pipe
 * syntax, chaining, arguments, smart quotes, and the complete helper
 * vocabulary cannot drift into a runner-only language. Missing answers are
 * deliberately left as nullish scope entries: angular-expressions resolves
 * them to blank, while `| default:"..."` can opt into a fallback.
 */
export function interpolateRunnerText(
  text: string,
  context: Record<string, unknown> = {},
  aliasMap: Record<string, string> = {},
  definitions: RunnerAnswerDefinitions = {},
  options: InterpolateRunnerTextOptions = {}
): string {
  if (!text) {
    return text;
  }

  const scope = buildExpressionScope(context, aliasMap, definitions);
  const expressionContext: ExpressionContext = {
    scopeList: [scope],
    scopePathItem: [],
    scopeTypes: [],
  };

  return text.replace(/\{\{([^{}]+)\}\}/g, (_match: string, expression: string) => {
    const trimmedExpression = expression.trim();
    // Preserve the pre-existing raw step-id fallback. UUIDs and legacy ids
    // contain hyphens, which are subtraction operators in the expression
    // grammar, so a bare exact context key must be resolved before parsing.
    let value: unknown;
    if (Object.prototype.hasOwnProperty.call(scope, trimmedExpression)) {
      value = scope[trimmedExpression];
    } else {
      value = parseRunnerExpression(trimmedExpression).get(
        scope,
        expressionContext as never
      ) as unknown;
    }
    const rendered = stringifyExpressionResult(value);
    return options.output === "text" ? rendered : escapeMarkdown(rendered);
  });
}
