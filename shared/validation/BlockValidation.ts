import { evaluateConditionExpression } from "../conditionEvaluator";
import { isRunnerRequirableStepType } from "../types/runnerStepTypes";
import {
    getBooleanStorageValue,
    StepConfig,
    ListConfig,
    ListItem,
    ListValue,
    resolveBooleanConfig,
    resolveNumberConfig,
    resolveTextConfig,
} from "../types/stepConfigs";

import { ValidationRule } from "./ValidationRule";
import { ValidationSchema } from "./ValidationSchema";
import { validateValueSync } from "./Validator";

export interface StepLike {
    id: string;
    type: string;
    config: unknown;
    required?: boolean;
}

/**
 * Type guard helpers for config validation
 */

interface SimpleChoiceConfig {
    min?: number;
    max?: number;
    minSelections?: number;
    maxSelections?: number;
}


function hasChoiceConstraints(config: unknown): config is SimpleChoiceConfig {
    return typeof config === 'object' && config !== null;
}

/**
 * Generates a runtime ValidationSchema from a step's type and configuration.
 */
// eslint-disable-next-line complexity, sonarjs/cognitive-complexity
export function getValidationSchema(step: StepLike): ValidationSchema {
    const rules: ValidationRule[] = [];
    const config = step.config as StepConfig;

    // Base requirement — only for step types the runner can actually render
    // a fillable control for. A "required" rule on an unsupported/unknown
    // type (e.g. file_upload) can never be satisfied
    // by a respondent, since the runner shows only a skip notice (RUN2-3).
    const isRequired = Boolean(step.required) && isRunnerRequirableStepType(step.type);
    if (isRequired) {
        rules.push({ type: "required" });
    }

    if (!config) {
        return { rules, required: isRequired };
    }

    const booleanConfig = step.type === "boolean" ? resolveBooleanConfig(config) : undefined;
    const requiredValue = isRequired && booleanConfig?.displayStyle === "checkbox"
        ? getBooleanStorageValue(true, booleanConfig)
        : undefined;

    // Type-specific rules
    switch (step.type) {
        case "text":
        case "short_text":
        case "long_text": {
            // The aliases are read compatibility for pre-STB-19 rows. Both
            // root-level and nested legacy constraints resolve canonically.
            const c = resolveTextConfig(step.type, config);
            if (c.validation) {
                if (c.validation.minLength) { rules.push({ type: "minLength", value: c.validation.minLength }); }
                if (c.validation.maxLength) { rules.push({ type: "maxLength", value: c.validation.maxLength }); }
                if (c.validation.pattern) {
                    rules.push({
                        type: "pattern",
                        regex: c.validation.pattern,
                        message: c.validation.patternMessage
                    });
                }
            }
            break;
        }

        case "number":
        case "number_advanced":
        case "currency": {
            // One resolver for every stored number dialect, so the rules the
            // client enforces cannot drift from the config the runner reads.
            const c = resolveNumberConfig(step.type, config);
            if (c.validation?.min !== undefined) { rules.push({ type: "minValue", value: c.validation.min }); }
            if (c.validation?.max !== undefined) { rules.push({ type: "maxValue", value: c.validation.max }); }
            // `precision` is deliberately NOT a rule here: it is a display
            // constraint, not a storage one (Decision 13). Legal work routinely
            // mixes values rounded to the dollar with values to the cent, so the
            // platform collects and stores exactly what the respondent entered
            // and leaves rounding to the author's formulas. Constraining storage
            // here would silently corrupt the base of every downstream
            // calculation.
            break;
        }

        case "email":
        case "email_advanced": {
            rules.push({ type: "email" });
            break;
        }

        case "website":
        case "website_advanced": {
            rules.push({ type: "url" });
            break;
        }

        case "phone":
        case "phone_advanced": {
            rules.push({ type: "pattern", regex: "^[+]?[(]?[0-9]{3}[)]?[-\\s.]?[0-9]{3}[-\\s.]?[0-9]{4,6}$", message: "Invalid phone number" });
            break;
        }

        case "choice":
        case "multiple_choice": {
            // Check for min/max selections
            if (hasChoiceConstraints(config)) {
                if (config.min) { rules.push({ type: "minLength", value: config.min }); }
                if (config.max) { rules.push({ type: "maxLength", value: config.max }); }
                if (config.minSelections) { rules.push({ type: "minLength", value: config.minSelections }); }
                if (config.maxSelections) { rules.push({ type: "maxLength", value: config.maxSelections }); }
            }
            break;
        }

        case "list": {
            // Structural type (LIST-3): minItems/maxItems are checked against
            // the actual submitted item count, `required` is per-field-per-item,
            // and results must be keyed by path (e.g. `children[0].dob`) so a
            // caller can point a badge at one row — none of that is
            // expressible as a flat ValidationRule[]/ValidationResult.errors
            // list, which is why there is no rule pushed here. Callers
            // validate list values directly via `validateListValue`, exported
            // below, which recurses through nested list fields to a hard
            // depth cap (LIST-9 consumes its path-keyed errors).
            break;
        }
    }

    return {
        rules,
        required: isRequired,
        ...(requiredValue !== undefined ? { requiredValue } : {}),
    };
}

/**
 * Errors for a `list` value, keyed by path rather than returned as a flat
 * list — e.g. `children[0].dob`, `children[0].addresses[1].street` — so a
 * caller (LIST-9) can attach a badge to the exact row/field that failed.
 * Multiple messages can land on the same path.
 */
export type ListValidationErrors = Record<string, string[]>;

/**
 * Hard server-side caps (LIST-3). A crafted payload could otherwise nest
 * arbitrarily deep and blow the stack in this recursive validator (and in
 * `projectListValue`), or submit an unbounded item count. These must not be
 * enforceable only in the client, so they are checked here unconditionally.
 *
 * Depth is capped at 3 (Shawn, 2026-08-01) — the same number the builder
 * enforces at authoring time (LIST-6) and the runner's breadcrumb is designed
 * around (LIST-8), so all three agree on one bound instead of the original
 * warn-at-3 / block-at-10 two-tier rule. The *types* stay unboundedly
 * recursive (`ListField` in shared/types/stepConfigs.ts); this is a runtime
 * policy constant, deliberately in one place, so raising it later is a
 * one-line change. Raising a cap is backward-compatible; lowering one is not
 * — which is why it starts low.
 *
 * Note the item budget below, not this, is what actually bounds a hostile
 * payload: depth 3 vs 10 barely changes the stack, 5,000 items does.
 */
export const LIST_VALIDATION_MAX_DEPTH = 3;
export const LIST_VALIDATION_MAX_TOTAL_ITEMS = 5000;

/** Mutable budget threaded through the recursion so the item cap applies across ALL levels combined, not per level. */
interface ListItemBudget {
    remaining: number;
}

/** Depth + budget bundled into one object so recursive helpers stay under the 5-param lint limit. */
interface ListRecursionState {
    depth: number;
    budget: ListItemBudget;
}

function isListValueShape(value: unknown): value is ListValue {
    return typeof value === "object" && value !== null && Array.isArray((value as { items?: unknown }).items);
}

function isListItemShape(item: unknown): item is ListItem {
    if (typeof item !== "object" || item === null) {
        return false;
    }
    const values = (item as { values?: unknown }).values;
    return typeof values === "object" && values !== null && !Array.isArray(values);
}

function isEmptyListFieldValue(value: unknown): boolean {
    return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

function addListError(errors: ListValidationErrors, path: string, message: string): void {
    (errors[path] ??= []).push(message);
}

function mergeListErrors(target: ListValidationErrors, source: ListValidationErrors): void {
    for (const [path, messages] of Object.entries(source)) {
        (target[path] ??= []).push(...messages);
    }
}

/**
 * Validates one list item's fields (required + recursion into nested list
 * fields), skipping any field hidden by its `visibleIf` — mirrors
 * the retired RepeaterService's per-instance validation (deleted in LIST-13),
 * evaluated against that item's own values as context.
 */
function validateListItemFields(
    item: ListItem,
    config: ListConfig,
    itemPath: string,
    state: ListRecursionState,
    errors: ListValidationErrors
): void {
    for (const field of config.fields) {
        // `visibleIf` only exists on the "question" variant of ListField — a
        // nested list field has no visibility expression of its own.
        const visibleIf = field.kind === "question" ? field.visibleIf : undefined;
        const isVisible = visibleIf ? evaluateConditionExpression(visibleIf, item.values) : true;
        if (!isVisible) {
            continue;
        }

        const fieldPath = `${itemPath}.${field.alias}`;
        const raw: unknown = item.values[field.alias];

        if (field.kind === "list") {
            mergeListErrors(errors, validateListValue(raw, field.list, fieldPath, state.depth + 1, state.budget));
            continue;
        }

        if (field.required === true && isEmptyListFieldValue(raw)) {
            addListError(errors, fieldPath, `${field.title} is required`);
        }

        // LIST2-2: run the same type-level validation (email format, number
        // min/max, pattern, length, ...) a top-level page step gets via
        // `getValidationSchema`. `required: false` is passed deliberately —
        // the explicit required check above already owns the
        // field-titled required message, and letting the schema also carry
        // `required: true` would emit a second, generically-worded one.
        // `getValidationSchema` returns early on a falsy `config` (used to
        // mean "no step config row yet"), which would silently skip
        // config-independent rules like `email`/`url`/`phone` for a list
        // field that has never had its settings configured. A list field
        // always conceptually has a config — it is just empty — so default
        // to `{}` rather than passing `field.config` (often `undefined`)
        // straight through.
        const schema = getValidationSchema({
            id: field.id,
            type: field.type,
            config: field.config ?? {},
            required: false,
        });
        const result = validateValueSync({ schema, value: raw, values: item.values });
        if (!result.valid) {
            for (const message of result.errors) {
                addListError(errors, fieldPath, message);
            }
        }
    }
}

/**
 * Recursively validates a `list` step's submitted value against its config
 * (LIST-3). A `ListField` may itself be `kind: "list"`, so this recurses to
 * `LIST_VALIDATION_MAX_DEPTH` levels; deeper values are rejected with an
 * error instead of being recursed into, and total item count across every
 * level combined is capped at `LIST_VALIDATION_MAX_TOTAL_ITEMS` — both are
 * denial-of-service guards, not just correctness checks. A malformed value
 * (anything other than `{ items: [...] }`, e.g. a bare string, `null`, or an
 * item without a `values` map) is reported as an error and never throws.
 *
 * `path` is the caller-supplied name for this list (e.g. a step alias like
 * `"children"`); omit it to key top-level errors under `"$root"`.
 */
export function validateListValue(
    value: unknown,
    config: ListConfig,
    path = "",
    depth = 1,
    budget: ListItemBudget = { remaining: LIST_VALIDATION_MAX_TOTAL_ITEMS }
): ListValidationErrors {
    const errors: ListValidationErrors = {};
    const rootKey = path || "$root";

    if (depth > LIST_VALIDATION_MAX_DEPTH) {
        addListError(errors, rootKey, `List nesting exceeds the maximum depth of ${LIST_VALIDATION_MAX_DEPTH} levels`);
        return errors;
    }

    if (!isListValueShape(value)) {
        addListError(errors, rootKey, 'Invalid list value: expected an object with an "items" array');
        return errors;
    }

    const minItems = config.minItems ?? 0;
    const maxItems = config.maxItems ?? Infinity;
    if (value.items.length < minItems) {
        addListError(errors, rootKey, `At least ${minItems} item(s) required`);
    }
    if (value.items.length > maxItems) {
        addListError(errors, rootKey, `Maximum ${maxItems} item(s) allowed`);
    }

    for (let index = 0; index < value.items.length; index++) {
        if (budget.remaining <= 0) {
            addListError(errors, rootKey, `Total item count exceeds the maximum of ${LIST_VALIDATION_MAX_TOTAL_ITEMS} across all levels combined`);
            break;
        }
        budget.remaining -= 1;

        const itemPath = `${path}[${index}]`;
        const item: unknown = value.items[index];
        if (!isListItemShape(item)) {
            addListError(errors, itemPath, 'Invalid list item: expected an object with a "values" map');
            continue;
        }

        validateListItemFields(item, config, itemPath, { depth, budget }, errors);
    }

    return errors;
}
