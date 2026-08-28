/**
 * Display formatting for the canonical `number` control (STB-9).
 *
 * Kept out of the component so the fiddly parts — intermediate text, caret
 * arithmetic under live grouping — are unit-testable without a DOM.
 *
 * The rule this file exists to hold: grouping, prefix and suffix are display
 * only (Decision 8). Nothing here ever changes the stored value, which stays
 * `number | null`.
 */

const GROUP_SEPARATOR = ",";

/**
 * Insert thousands separators into a run of digits.
 *
 * Done by slicing rather than the usual `/\B(?=(\d{3})+(?!\d))/` lookahead:
 * that pattern nests a quantifier inside a quantifier, which backtracks
 * catastrophically on a long digit run and is rejected by the repo's
 * `security/detect-unsafe-regex` rule. This is linear and needs no escape.
 */
export function groupDigits(digits: string): string {
  if (digits.length <= 3) { return digits; }
  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= 3) {
    groups.unshift(digits.slice(Math.max(0, end - 3), end));
  }
  return groups.join(GROUP_SEPARATOR);
}

/** True when every character is a digit. Linear, no backtracking. */
function isAllDigits(text: string): boolean {
  if (text === "") { return false; }
  for (const char of text) {
    if (char < "0" || char > "9") { return false; }
  }
  return true;
}

/** Strip everything the respondent may see but must never be stored. */
export function stripDisplay(text: string): string {
  return text.split(GROUP_SEPARATOR).join("");
}

/**
 * Parse what is currently typed.
 *
 * `intermediate` marks text that is on the way to a number but is not one yet
 * — "", "-", "1.", "-." — so the caller can keep the characters on screen
 * without emitting a value. Rejecting these is what makes a numeric field feel
 * broken: you cannot type a negative or a decimal if the first keystroke is
 * discarded.
 */
export function parseNumericInput(text: string): { value: number | null; intermediate: boolean } {
  const cleaned = stripDisplay(text).trim();
  if (cleaned === "") { return { value: null, intermediate: false }; }

  const unsigned = cleaned.startsWith("-") ? cleaned.slice(1) : cleaned;
  const parts = unsigned.split(".");
  if (parts.length > 2) { return { value: null, intermediate: true }; }

  const [intPart = "", decimalPart] = parts;
  const intOk = intPart === "" || isAllDigits(intPart);
  const decimalOk = decimalPart === undefined || decimalPart === "" || isAllDigits(decimalPart);
  if (!intOk || !decimalOk) { return { value: null, intermediate: true }; }

  // On the way to a number but not one yet: bare sign, bare dot, trailing dot.
  if (intPart === "" || decimalPart === "") { return { value: null, intermediate: true }; }

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) { return { value: null, intermediate: true }; }
  return { value: parsed, intermediate: false };
}

export interface NumberDisplayOptions {
  thousandsSeparator?: boolean;
  precision?: number;
}

/** Render a stored value for display when the field does not have focus. */
export function formatNumberForDisplay(
  value: number | null | undefined,
  options: NumberDisplayOptions = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) { return ""; }

  const fixed = options.precision !== undefined ? value.toFixed(options.precision) : String(value);
  if (options.thousandsSeparator !== true) { return fixed; }

  const negative = fixed.startsWith("-");
  const unsigned = negative ? fixed.slice(1) : fixed;
  const [intPart, decimalPart] = unsigned.split(".");
  const grouped = groupDigits(intPart) + (decimalPart !== undefined ? `.${decimalPart}` : "");
  return negative ? `-${grouped}` : grouped;
}

/**
 * Re-group text while it is being typed, keeping the caret on the same digit.
 *
 * Caret position is expressed in digits-before-caret rather than characters,
 * because inserting a separator shifts every character index after it. Without
 * this the caret jumps backwards a character each time a group boundary is
 * crossed, which is the classic broken money input.
 */
export function applyLiveGrouping(
  text: string,
  caret: number,
): { text: string; caret: number } {
  const digitsBeforeCaret = stripDisplay(text.slice(0, caret)).replace(/[^\d]/g, "").length;
  const cleaned = stripDisplay(text);

  const negative = cleaned.startsWith("-");
  const unsigned = negative ? cleaned.slice(1) : cleaned;
  const [intPart = "", ...decimalRest] = unsigned.split(".");
  const hasDecimal = unsigned.includes(".");
  const decimalPart = decimalRest.join("");

  const groupedInt = groupDigits(intPart);
  const rebuilt = `${negative ? "-" : ""}${groupedInt}${hasDecimal ? "." : ""}${decimalPart}`;

  let seen = 0;
  let nextCaret = rebuilt.length;
  for (let i = 0; i < rebuilt.length; i += 1) {
    if (seen === digitsBeforeCaret) { nextCaret = i; break; }
    if (/\d/.test(rebuilt[i])) { seen += 1; }
    if (seen === digitsBeforeCaret) { nextCaret = i + 1; break; }
  }

  return { text: rebuilt, caret: nextCaret };
}

/** Tailwind padding that clears an adornment of a given length. */
export function adornmentPadding(text: string | undefined, side: "left" | "right"): string | null {
  if (text === undefined || text === "") { return null; }
  const scale = text.length <= 1 ? 7 : text.length <= 3 ? 10 : 14;
  return side === "left" ? `pl-${scale}` : `pr-${scale}`;
}
