/**
 * Route a save-time rejection to the field that caused it (CB-8 AC 7).
 *
 * The server already speaks in specific, author-facing sentences — CB-4's cycle
 * report, CB-6's impure-helper refusal, CB-7's alias collision, CB-3's missing
 * trigger page. All of them arrive as a 400 whose `message` survives
 * `classifyRouteError` intact. What was missing was somewhere to PUT them: a
 * toast tells an author that something is wrong and then disappears, leaving
 * them to guess which of four panels to look at.
 *
 * Matching on message text is deliberate. The server's error contract here is
 * the string (see the `add-api-endpoint` skill), and every phrase below is
 * asserted in `tests/unit/client/codeBlockEditor.test.tsx` so a reworded server
 * error fails a test rather than silently falling back to the summary line.
 */

export type CodeBlockField = 'code' | 'inputs' | 'outputs' | 'trigger' | 'repeat' | 'general';

const FIELD_RULES: ReadonlyArray<{ field: CodeBlockField; match: RegExp }> = [
    // CB-3: firing policy.
    { field: 'trigger', match: /triggerPageId/i },
    // CB-6: impure helpers cannot be tracked by the change gate.
    { field: 'repeat', match: /impure helper/i },
    // CB-4: the dependency graph is a property of the outputs.
    { field: 'outputs', match: /form a cycle/i },
    // CB-7: append-only. Every variable has exactly one writer.
    { field: 'outputs', match: /already in use/i },
    // CB-5: a derived output key that is not a legal variable name.
    { field: 'outputs', match: /^Variable names /i },
    // CB-5: the AST pass refused the script itself.
    { field: 'code', match: /^Script validation failed/i },
    // The route's own Zod shape check, which names the offending path — e.g.
    // "config.outputs: Array must contain at least 1 element(s)".
    { field: 'outputs', match: /config\.outputs/ },
    { field: 'inputs', match: /config\.inputs/ },
    { field: 'code', match: /config\.code/ },
];

/** Which field a save rejection belongs against. `general` = show in the footer. */
export function classifySaveError(message: string): CodeBlockField {
    return FIELD_RULES.find(rule => rule.match.test(message))?.field ?? 'general';
}

/**
 * CB-5's dynamic-access warnings, routed the same way.
 *
 * These are the debt CB-5 left behind: `ScriptEngine.validate()` has always
 * returned them and nothing rendered them, so an author whose keys cannot all
 * be derived shipped the block believing derivation had covered them.
 */
export function classifyWarning(message: string): CodeBlockField {
    if (/^Dynamic input/i.test(message)) { return 'inputs'; }
    if (/^Dynamic output/i.test(message)) { return 'outputs'; }
    return 'code';
}

export function collectByField<T>(
    items: readonly T[],
    classify: (item: T) => CodeBlockField
): Record<CodeBlockField, T[]> {
    const byField: Record<CodeBlockField, T[]> = {
        code: [], inputs: [], outputs: [], trigger: [], repeat: [], general: [],
    };
    for (const item of items) { byField[classify(item)].push(item); }
    return byField;
}
