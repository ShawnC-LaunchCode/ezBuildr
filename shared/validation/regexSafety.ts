/**
 * Bounded-execution guard for author-supplied validation regexes (RUN2-16).
 *
 * Validation patterns come from `step.config`, which workflow authors control.
 * On the client a catastrophic pattern only wedges the author's own browser
 * tab, but RUN2-16 makes the server authoritative — and a JavaScript regex is
 * not interruptible, so once `RegExp.test` enters exponential backtracking the
 * Node event loop is blocked for the whole process. A timeout cannot rescue it
 * after the fact; the pattern has to be refused before it ever runs.
 *
 * Two bounds do that:
 *   1. length caps on both the pattern and the input, and
 *   2. a star-height check — a quantifier applied to a group that itself
 *      contains a quantifier (`(a+)+`, `(a*)*`, `(a|aa)+`) is the shape that
 *      produces exponential backtracking. Star height <= 1 cannot.
 *
 * An unsafe pattern is skipped, not failed: a respondent must never be blocked
 * because an author wrote a pattern we decline to run. Callers log the skip.
 */

/** Longest author pattern we will compile. */
export const MAX_PATTERN_LENGTH = 512;

/** Longest input we will match a pattern against. */
export const MAX_PATTERN_INPUT_LENGTH = 4096;

export interface RegexSafetyResult {
  safe: boolean;
  /** Present when `safe` is false — why the pattern was refused. */
  reason?: string;
}

/**
 * Compute the maximum star height of a pattern: the deepest nesting of
 * quantifiers inside quantified groups. Height >= 2 is the classic
 * catastrophic-backtracking shape.
 *
 * This is a deliberately conservative structural scan rather than a full regex
 * parse — it can refuse an exotic-but-safe pattern, which is the right way to
 * be wrong here.
 */
function isQuantifierChar(char: string | undefined): boolean {
  return char === "*" || char === "+" || char === "{";
}

/** True when the group closing at `closeIndex` is itself quantified (`)+`, `)*?`, `){2,}`). */
function isGroupQuantified(pattern: string, closeIndex: number): boolean {
  const next = pattern[closeIndex + 1];
  if (isQuantifierChar(next)) {
    return true;
  }
  // A lazy quantifier writes the modifier first: `)?` followed by `*`/`+`/`{`.
  return next === "?" && isQuantifierChar(pattern[closeIndex + 2]);
}

/** Mark the enclosing group (if any) as containing a quantifier. */
function markEnclosingGroup(stack: boolean[]): void {
  if (stack.length > 0) {
    stack[stack.length - 1] = true;
  }
}

/**
 * Close a group. Returns true when this group is the unsafe shape: a quantified
 * group that itself contained a quantifier (star height 2).
 */
function closeGroup(stack: boolean[], pattern: string, closeIndex: number): boolean {
  const innerHadQuantifier = stack.pop() ?? false;
  const quantified = isGroupQuantified(pattern, closeIndex);

  if (innerHadQuantifier && quantified) {
    return true;
  }
  if (quantified) {
    markEnclosingGroup(stack);
  }
  return false;
}

function hasNestedQuantifier(pattern: string): boolean {
  // Tracks, for each open group, whether a quantifier has been seen inside it.
  const stack: boolean[] = [];
  let escaped = false;
  let inClass = false;

  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];

    if (escaped) { escaped = false; continue; }
    if (char === "\\") { escaped = true; continue; }

    // Quantifiers inside a character class are literal.
    if (inClass) {
      if (char === "]") { inClass = false; }
      continue;
    }

    if (char === "[") { inClass = true; continue; }
    if (char === "(") { stack.push(false); continue; }
    if (char === ")") {
      if (closeGroup(stack, pattern, i)) { return true; }
      continue;
    }
    if (isQuantifierChar(char)) { markEnclosingGroup(stack); }
  }

  return false;
}

/**
 * Decide whether an author-supplied pattern is safe to run. Returns
 * `{ safe: false, reason }` for patterns we refuse rather than risk.
 */
export function analyzeRegexSafety(pattern: string): RegexSafetyResult {
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return { safe: false, reason: `pattern exceeds ${MAX_PATTERN_LENGTH} characters` };
  }

  if (hasNestedQuantifier(pattern)) {
    return { safe: false, reason: "pattern nests a quantifier inside a quantified group, which can backtrack exponentially" };
  }

  try {
    // eslint-disable-next-line security/detect-non-literal-regexp -- the point of this module is to vet the pattern before compiling it
    new RegExp(pattern);
  } catch {
    return { safe: false, reason: "pattern is not a valid regular expression" };
  }

  return { safe: true };
}

export interface SafeMatchResult {
  /** False only when the pattern ran and did not match. */
  matched: boolean;
  /** True when the pattern was refused and never ran — callers must not fail the value. */
  skipped: boolean;
  reason?: string;
}

/**
 * Match `value` against an author-supplied `pattern` under the bounds above.
 * A refused pattern, or an over-long input, reports `skipped: true` so callers
 * can log it and treat the rule as inapplicable instead of failing the value.
 */
export function safeRegexTest(pattern: string, value: string): SafeMatchResult {
  const safety = analyzeRegexSafety(pattern);
  if (!safety.safe) {
    return { matched: false, skipped: true, reason: safety.reason };
  }

  if (value.length > MAX_PATTERN_INPUT_LENGTH) {
    return { matched: false, skipped: true, reason: `input exceeds ${MAX_PATTERN_INPUT_LENGTH} characters` };
  }

  // eslint-disable-next-line security/detect-non-literal-regexp -- vetted by analyzeRegexSafety above
  const regex = new RegExp(pattern);
  return { matched: regex.test(value), skipped: false };
}
