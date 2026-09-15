/**
 * Phone numbers: stored as digits only, formatted for display.
 *
 * The same rule the money control follows (numberFormat.ts): formatting is
 * display only and never reaches storage, so every surface -- the runner input,
 * the review screen, validation -- reads one canonical value.
 *
 * Display is right-filled, like entering money from the pennies: the last four
 * digits are the line number, the three before them the exchange, the three
 * before those the area code, and anything earlier an international prefix.
 * 120987654321 displays as "+12 (098) 765-4321"; 7654321 as "765-4321".
 */

/** Shortest number accepted: a seven-digit local number. */
export const PHONE_MIN_DIGITS = 7;
/** Longest number accepted: the E.164 maximum. */
export const PHONE_MAX_DIGITS = 15;

/** Every digit in the value, in order. Anything that is not a string or number has none. */
export function extractPhoneDigits(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }
  return String(value).replace(/\D/g, "");
}

/** Right-filled display form of a phone value, e.g. "+12 (098) 765-4321". */
export function formatPhoneNumber(value: unknown): string {
  const digits = extractPhoneDigits(value);
  if (digits.length <= 4) {
    return digits;
  }
  const line = digits.slice(-4);
  const exchange = digits.slice(-7, -4);
  const area = digits.slice(-10, -7);
  const prefix = digits.slice(0, -10);

  let formatted = `${exchange}-${line}`;
  if (area !== "") {
    formatted = `(${area}) ${formatted}`;
  }
  if (prefix !== "") {
    formatted = `+${prefix} ${formatted}`;
  }
  return formatted;
}

/**
 * Why a phone value is not acceptable, or null when it is. An empty value is
 * not this rule's concern: whether the question must be answered is `required`.
 */
export function phoneValidationError(value: unknown): string | null {
  const count = extractPhoneDigits(value).length;
  if (count === 0) {
    return null;
  }
  if (count < PHONE_MIN_DIGITS) {
    return `Phone numbers need at least ${PHONE_MIN_DIGITS} digits`;
  }
  if (count > PHONE_MAX_DIGITS) {
    return `Phone numbers can have at most ${PHONE_MAX_DIGITS} digits`;
  }
  return null;
}
