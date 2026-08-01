/**
 * Pure helpers that expand a `list` step's variable into the alias tree
 * shown by VariablesInspector and VariablePalette (LIST-7). No React — kept
 * testable in isolation, mirroring client/src/components/builder/cards/list/listEditorHelpers.ts.
 */
import type { ApiStep, ApiWorkflowVariable } from "@/lib/vault-api";

import type { ListConfig, ListField } from "@shared/types/stepConfigs";

export interface ListVariableNode {
  id: string;
  alias: string;
  title: string;
  kind: "question" | "list";
  fieldType?: string;
  children?: ListVariableNode[];
  /** Document-template form, e.g. `{{#children}}{{name}}{{/children}}`. */
  templateSnippet: string;
}

function isListConfig(config: unknown): config is ListConfig {
  return typeof config === "object" && config !== null && Array.isArray((config as { fields?: unknown }).fields);
}

function wrapInAncestors(ancestorAliases: readonly string[], inner: string): string {
  const opens = ancestorAliases.map((alias) => `{{#${alias}}}`).join("");
  const closes = [...ancestorAliases].reverse().map((alias) => `{{/${alias}}}`).join("");
  return `${opens}${inner}${closes}`;
}

function buildFieldNodes(fields: readonly ListField[], ancestorAliases: readonly string[]): ListVariableNode[] {
  return [...fields]
    .sort((a, b) => a.order - b.order)
    .map((field): ListVariableNode => {
      if (field.kind === "list") {
        const scopeAliases = [...ancestorAliases, field.alias];
        return {
          id: field.id,
          alias: field.alias,
          title: field.title,
          kind: "list",
          children: buildFieldNodes(field.list.fields, scopeAliases),
          templateSnippet: wrapInAncestors(scopeAliases, ""),
        };
      }
      return {
        id: field.id,
        alias: field.alias,
        title: field.title,
        kind: "question",
        fieldType: field.type,
        templateSnippet: wrapInAncestors(ancestorAliases, `{{${field.alias}}}`),
      };
    });
}

/**
 * Expands a `list`-typed workflow variable into its field tree, rooted at
 * the step's own alias (falling back to its id, matching how the document
 * engine keys the loop collection — see LIST-11 and
 * server/services/document/VariableNormalizer.ts's getListConfigsByAlias).
 *
 * Returns null when the variable isn't a list step, or its config is
 * missing/malformed — callers render the plain (non-expandable) row then.
 */
export function buildListVariableTree(
  variable: Pick<ApiWorkflowVariable, "key" | "alias" | "type">,
  steps: readonly ApiStep[]
): ListVariableNode[] | null {
  if (variable.type !== "list") {
    return null;
  }
  const step = steps.find((candidate) => candidate.id === variable.key);
  if (!step || !isListConfig(step.config)) {
    return null;
  }
  const rootAlias = variable.alias ?? variable.key;
  return buildFieldNodes(step.config.fields, [rootAlias]);
}
