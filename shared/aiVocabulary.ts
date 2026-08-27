/**
 * AI prompt vocabulary, derived from the platform's own sources of truth
 * (ICW2-12).
 *
 * The system prompt used to hand-list ~19 of the 38 step types and no config
 * or operator information at all, so the model could not generate most of the
 * platform's capability — and every hand-written list drifts the moment
 * someone adds an enum value. Everything below is generated at module load
 * from `stepTypeEnum`, `getConfigSchema`, `comparisonOperatorSchema`,
 * `conditionalActionEnum`, and the ops discriminated union itself, so a new
 * step type or op shows up in the prompt with no prompt edit.
 *
 * Budget note: this text ships on every AI request, so entries are names plus
 * a one-line config key summary — never full JSON schemas.
 */

import { z } from "zod";

import { conditionalActionEnum, stepTypeEnum } from "./schema/workflow";
import { comparisonOperatorSchema } from "./types/conditions";
import { getConfigSchema } from "./validation/stepConfigSchemas";
import { workflowPatchOpSchema } from "./validation/aiWorkflowEdit.schema";

/** Unwrap optionals/defaults/nullables to reach the underlying type. */
function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current = schema;

  while (current instanceof z.ZodOptional || current instanceof z.ZodDefault || current instanceof z.ZodNullable) {
    current = (current as unknown as { _def: { innerType: z.ZodTypeAny } })._def.innerType;
  }
  return current;
}

/** Short human label for a config field's type, e.g. `options[]`, `min`. */
function describeField(key: string, schema: z.ZodTypeAny): string {
  const inner = unwrap(schema);
  if (inner instanceof z.ZodArray) { return `${key}[]`; }
  if (inner instanceof z.ZodEnum) {
    const values = (inner as z.ZodEnum<[string, ...string[]]>).options;
    return values.length <= 4 ? `${key}(${values.join('|')})` : key;
  }
  return key;
}

/** Config keys a step type accepts, or null when its config is freeform. */
export function getConfigKeys(stepType: string): string[] | null {
  const schema = getConfigSchema(stepType);
  if (!schema) { return null; }
  const unwrapped = unwrap(schema);
  if (!(unwrapped instanceof z.ZodObject)) { return null; }
  const shape = unwrapped.shape as Record<string, z.ZodTypeAny>;
  return Object.keys(shape).map((key) => describeField(key, shape[key]));
}

/**
 * One line per step type: `- radio: options[], layout(vertical|horizontal)`.
 * Every value in `stepTypeEnum` appears, including types with no config schema.
 */
export function buildStepTypeCatalog(): string {
  return stepTypeEnum.enumValues
    .map((type) => {
      const keys = getConfigKeys(type);
      if (keys === null) { return `- ${type}`; }
      if (keys.length === 0) { return `- ${type}: (no config)`; }
      return `- ${type}: ${keys.join(', ')}`;
    })
    .join('\n');
}

/** Every comparison operator the condition engine can evaluate. */
export function buildOperatorCatalog(): string {
  return comparisonOperatorSchema.options.join(', ');
}

/** Every conditional action the logic engine supports. */
export function buildActionCatalog(): string {
  return conditionalActionEnum.enumValues.join(', ');
}

/** Every op name in the patch union, in declaration order. */
export function getOpNames(): string[] {
  return workflowPatchOpSchema.options
    .map((option) => (option.shape.op as z.ZodLiteral<string>).value);
}

/** Every op name in the patch union, so the list cannot drift from the schema. */
export function buildOpCatalog(): string {
  return getOpNames()
    .map((op) => `- ${op}`)
    .join('\n');
}

/**
 * The full vocabulary block spliced into the system prompt.
 */
export function buildWorkflowVocabulary(): string {
  return `Available operations:
${buildOpCatalog()}

Step types and their config keys (use the exact type string; put config keys in the op's "config" object):
${buildStepTypeCatalog()}

Condition operators (for visibleIf conditions and logic rules):
${buildOperatorCatalog()}

Logic rule actions:
${buildActionCatalog()}

Sections group pages. A Section always covers a CONTIGUOUS span of pages in the
workflow's page order and can never be empty, so:
- Create the pages first, then group them with one section.create naming those
  pages (by id, or by the tempId each page.create was given), in page order.
- To put an existing page into a Section, use page.setSection. It must sit
  directly beside that Section's existing pages, or the op is rejected.
- page.setSection with "sectionId": null takes a page out of its Section. Doing
  that to a Section's last page is rejected — delete the Section instead.
- section.delete keeps every page; they simply become ungrouped.
- A patch that would split a Section, or leave one empty, fails and is not
  applied. Reorder pages so the span stays whole rather than working around it.

Condition expressions are objects, not strings. Shape:
{"type":"group","id":"<uuid>","operator":"AND","conditions":[{"type":"condition","id":"<uuid>","variable":"<step alias>","operator":"equals","value":<value>,"valueType":"constant"}]}
Use null to clear a condition (always visible).

Exception: logicRule.create/update take "condition" as a "<alias> <operator> <value>"
string (e.g. "age greater_than 18", "email is_not_empty", "has_pet is_true"),
which the server parses into the object form above.`;
}
