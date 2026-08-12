/**
 * Stage 21: DOCX Template Helpers
 *
 * Advanced helper functions for document generation with support for:
 * - String manipulation (upper, lower, capitalize, titleCase)
 * - Date formatting (with custom formats)
 * - Currency formatting (multi-currency)
 * - Number formatting (decimals, thousands)
 * - Array operations (join, length, first, last)
 * - Conditional helpers
 */

import {
  format as formatDateFns,
  addDays as fnsAddDays,
  addMonths as fnsAddMonths,
  addYears as fnsAddYears,
  startOfMonth as fnsStartOfMonth,
  endOfMonth as fnsEndOfMonth,
  differenceInDays,
  parseISO,
  isValid,
} from 'date-fns';

import {
  addBusinessDaysForCalendar,
  businessDaysBetweenForCalendar,
  formatters,
  nextBusinessDayForCalendar,
} from '../utils/formatters';
import {
  DEFAULT_BUSINESS_DAY_CALENDAR,
  resolveBusinessDayCalendar,
  type BusinessDayCalendar,
} from '../../shared/types/workflow';

/**
 * Capitalize first letter of string
 */
export function capitalize(s: string | null | undefined): string {
  if (!s) {return '';}
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Trim leading/trailing whitespace. Exists mainly as a filter for chaining
 * (`{{ name | trim | upper }}`) -- the old helper-prefix grammar had no
 * equivalent since a value was always resolved straight from scope.
 */
export function trim(s: string | null | undefined): string {
  return s?.trim?.() ?? '';
}

/**
 * Join array elements with separator
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- array can contain any template data types
export function join(arr: any[] | null | undefined, separator: string = ', '): string {
  if (!arr || !Array.isArray(arr)) {return '';}
  return arr.filter(item => item != null).join(separator);
}

/**
 * Get array length
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- array can contain any template data types
export function length(arr: any[] | null | undefined): number {
  if (!arr || !Array.isArray(arr)) {return 0;}
  return arr.length;
}

/**
 * Get first element of array
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- array can contain any template data types, returns any type
export function first(arr: any[] | null | undefined): any {
  if (!arr || !Array.isArray(arr) || arr.length === 0) {return null;}
  return arr[0];
}

/**
 * Get last element of array
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- array can contain any template data types, returns any type
export function last(arr: any[] | null | undefined): any {
  if (!arr || !Array.isArray(arr) || arr.length === 0) {return null;}
  return arr[arr.length - 1];
}

/**
 * Check if value is empty (null, undefined, '', [], {})
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- needs to check any template data type
export function isEmpty(value: any): boolean {
  if (value === null || value === undefined || value === '') {return true;}
  if (Array.isArray(value)) {return value.length === 0;}
  if (typeof value === 'object') {return Object.keys(value as object).length === 0;}
  return false;
}

/**
 * Check if value is not empty
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isNotEmpty(value: any): boolean {
  return !isEmpty(value);
}

/**
 * Default value if empty
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- needs to accept and return any template data type
export function defaultValue(value: any, defaultVal: any): any {
  return isEmpty(value) ? defaultVal : value;
}

/**
 * Moment-style tokens (used throughout existing templates and docs) mapped to
 * their date-fns equivalents. Tokens not listed (MMMM, MMM, MM, M, HH, H, hh,
 * h, mm, m, ss, s) are identical in both systems and pass through unchanged.
 */
const MOMENT_TO_DATE_FNS_TOKENS: Record<string, string> = {
  YYYY: 'yyyy',
  YY: 'yy',
  dddd: 'EEEE',
  ddd: 'EEE',
  Do: 'do',
  DD: 'dd',
  D: 'd',
  A: 'a',
  a: 'aaa',
};

/**
 * Translate a Moment-style format string to date-fns syntax.
 * Quoted literals ('at') pass through untouched (date-fns uses the same
 * quoting); a lone unmatched apostrophe (e.g. 'YY for "'25") becomes an
 * escaped literal quote.
 */
function translateDateFormat(momentFormat: string): string {
  let out = '';
  let i = 0;

  while (i < momentFormat.length) {
    if (momentFormat[i] === "'") {
      const close = momentFormat.indexOf("'", i + 1);
      if (close === -1) {
        out += "''";
        i += 1;
      } else {
        out += momentFormat.slice(i, close + 1);
        i = close + 1;
      }
    } else {
      let next = momentFormat.indexOf("'", i);
      if (next === -1) {next = momentFormat.length;}
      out += momentFormat
        .slice(i, next)
        .replace(/YYYY|YY|dddd|ddd|Do|DD|D|A|a/g, (token) => MOMENT_TO_DATE_FNS_TOKENS[token] ?? token);
      i = next;
    }
  }

  return out;
}

/**
 * Default output format for every date helper. Extracted as a constant because
 * TPL-9 added four more date helpers that share it, and six copies of the same
 * literal is both a lint error and a real drift hazard.
 */
const DEFAULT_DATE_FORMAT = 'MM/DD/YYYY';

/**
 * Format date with a Moment-style format string.
 * Supports: YYYY, YY, MMMM, MMM, MM, M, DD, D, Do, dddd, ddd, HH, H, hh, h,
 * mm, ss, A, a, and quoted literals ('at').
 */
export function formatDate(
  iso: string | Date | null | undefined,
  format: string = DEFAULT_DATE_FORMAT
): string {
  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  if (!iso) {return '';}

  try {
    let d = typeof iso === 'string' ? parseISO(iso) : iso;
    if (typeof iso === 'string' && !isValid(d)) {
      d = new Date(iso);
    }
    if (isNaN(d.getTime())) {return '';}

    return formatDateFns(d, translateDateFormat(format));
  } catch (error) {
    return '';
  }
}

/**
 * TPL-9 Finding (a): coerce a filter argument to a finite number, accepting
 * a real number (`addDays:30`) and a numeric string (`addDays:"30"`)
 * identically. Every other pipe-filter argument in the docs is quoted
 * (`| default:"N/A"`, `| replace:"world":"there"`), so authors reach for
 * quotes here out of habit -- and without this coercion, date-fns silently
 * does `date.getDate() + "30"`, which string-concatenates rather than adds
 * (a day-of-month of `5` becomes `"530"`, not `35`), rolling the date
 * forward roughly a year and a half with no error. Reproduced against the
 * real render path: `{{ '2026-01-05' | addDays:"30" }}` rendered
 * `06/14/2027` instead of `02/04/2026` before this fix. Raise on anything
 * that isn't a finite number rather than falling through to date-fns.
 */
function coerceAmount(filterName: string, raw: unknown): number {
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num)) {
    throw new Error(`${filterName}: amount must be a number, received ${JSON.stringify(raw)}`);
  }
  return num;
}

/**
 * Parse a date argument for the date-arithmetic/formatting filters
 * (addDays, addMonths, addYears, startOfMonth, endOfMonth). This is D3's
 * unknown-vs-empty split applied to a *value* rather than a variable path:
 * an empty/null input is a respondent who skipped an optional question --
 * a legitimate empty render (returns `undefined`; callers render `''`), not
 * an error. A non-empty input that still fails to parse is broken data or a
 * broken template (TPL-9 Finding (c)) and must raise rather than silently
 * rendering `''` as though nothing were wrong -- a blank is noticed in a
 * legal document; a plausible-looking wrong date is signed.
 */
function parseDateArg(filterName: string, iso: string | Date | null | undefined): Date | undefined {
  if (iso == null || iso === '') { return undefined; }

  let d = typeof iso === 'string' ? parseISO(iso) : iso;
  if (typeof iso === 'string' && !isValid(d)) {
    d = new Date(iso);
  }
  if (isNaN(d.getTime())) {
    throw new Error(`${filterName}: "${String(iso)}" is not a valid date`);
  }
  return d;
}

/**
 * Same parsing as `parseDateArg`, but for helpers where a missing operand
 * has no safe blank rendering. `daysBetween` returns a bare number, and `0`
 * is a plausible real answer -- "payment due 0 days after signing" reads as
 * a stated deadline, not as "unknown" -- so unlike the date-formatting
 * helpers above, a missing operand here must raise too (TPL-9 Finding (c)),
 * not quietly render as a number that looks like a real term.
 */
function requireDateArg(filterName: string, iso: string | Date | null | undefined, argLabel: string): Date {
  if (iso == null || iso === '') {
    throw new Error(`${filterName}: "${argLabel}" is required`);
  }
  let d = typeof iso === 'string' ? parseISO(iso) : iso;
  if (typeof iso === 'string' && !isValid(d)) {
    d = new Date(iso);
  }
  if (isNaN(d.getTime())) {
    throw new Error(`${filterName}: "${argLabel}" (${JSON.stringify(iso)}) is not a valid date`);
  }
  return d;
}

/**
 * Add days to a date. Empty input renders blank; an unparseable date or a
 * non-numeric `days` argument raises (see `parseDateArg`/`coerceAmount`).
 */
export function addDays(
  iso: string | Date | null | undefined,
  days: number | string = 0,
  format: string = DEFAULT_DATE_FORMAT
): string {
  const d = parseDateArg('addDays', iso);
  if (d === undefined) { return ''; }

  const amount = coerceAmount('addDays', days);
  const updated = fnsAddDays(d, amount);
  return formatDateFns(updated, translateDateFormat(format));
}

/**
 * Add whole months to a date, then format.
 *
 * TPL-9 AC7's month-end convention -- stated explicitly, not left emergent,
 * because a legal deadline cannot have an accidental answer: date-fns'
 * `addMonths` clamps an overflowing day to the last day of the target
 * month, so one month after 2026-01-31 is 2026-02-28 (February has no
 * 31st), not 2026-03-03 and not an error. Adopted as-is rather than
 * reimplemented, so every `| addMonths` in a document follows one rule.
 */
export function addMonths(
  iso: string | Date | null | undefined,
  months: number | string = 0,
  format: string = DEFAULT_DATE_FORMAT
): string {
  const d = parseDateArg('addMonths', iso);
  if (d === undefined) { return ''; }

  const amount = coerceAmount('addMonths', months);
  const updated = fnsAddMonths(d, amount);
  return formatDateFns(updated, translateDateFormat(format));
}

/**
 * Add whole years to a date, then format. Mirrors `addDays`'/`addMonths`'
 * signature and blank/raise rules; date-fns' `addYears` inherits the same
 * `addMonths` month-end clamp for Feb 29 -> Feb 28 on a non-leap target year.
 */
export function addYears(
  iso: string | Date | null | undefined,
  years: number | string = 0,
  format: string = DEFAULT_DATE_FORMAT
): string {
  const d = parseDateArg('addYears', iso);
  if (d === undefined) { return ''; }

  const amount = coerceAmount('addYears', years);
  const updated = fnsAddYears(d, amount);
  return formatDateFns(updated, translateDateFormat(format));
}

/**
 * Start of the month, optionally offset by whole months first --
 * `{{ signing_date | startOfMonth:1 }}` is the 1st of the month after
 * signing. The `amount` argument mirrors `addDays`/`addMonths` rather than
 * being dropped, so all four date-arithmetic filters share one calling
 * convention: `(value, amount, format)`.
 */
export function startOfMonth(
  iso: string | Date | null | undefined,
  monthsOffset: number | string = 0,
  format: string = DEFAULT_DATE_FORMAT
): string {
  const d = parseDateArg('startOfMonth', iso);
  if (d === undefined) { return ''; }

  const amount = coerceAmount('startOfMonth', monthsOffset);
  const updated = fnsStartOfMonth(fnsAddMonths(d, amount));
  return formatDateFns(updated, translateDateFormat(format));
}

/** End of the month, optionally offset by whole months first. See `startOfMonth`. */
export function endOfMonth(
  iso: string | Date | null | undefined,
  monthsOffset: number | string = 0,
  format: string = DEFAULT_DATE_FORMAT
): string {
  const d = parseDateArg('endOfMonth', iso);
  if (d === undefined) { return ''; }

  const amount = coerceAmount('endOfMonth', monthsOffset);
  const updated = fnsEndOfMonth(fnsAddMonths(d, amount));
  return formatDateFns(updated, translateDateFormat(format));
}

/**
 * Calculate difference in days between two dates. TPL-9 Finding (c): both
 * operands are required (see `requireDateArg`) -- a missing or unparseable
 * operand raises rather than returning `0`, because `0` is a plausible real
 * term ("due 0 days after signing") and would silently misstate the answer.
 */
export function daysBetween(
  date1: string | Date | null | undefined,
  date2: string | Date | null | undefined
): number {
  const d1 = requireDateArg('daysBetween', date1, 'date1');
  const d2 = requireDateArg('daysBetween', date2, 'date2');
  return Math.abs(differenceInDays(d1, d2));
}

function addBusinessDaysUsingCalendar(
  filterName: string,
  iso: string | Date | null | undefined,
  days: number | string,
  format: string,
  calendar: BusinessDayCalendar
): string {
  const d = parseDateArg(filterName, iso);
  if (d === undefined) { return ''; }

  const amount = coerceAmount(filterName, days);
  const updated = addBusinessDaysForCalendar(d, amount, calendar);
  return formatDateFns(updated, translateDateFormat(format));
}

/** Add business days using the workflow calendar (weekends-only by default). */
export function addBusinessDays(
  iso: string | Date | null | undefined,
  days: number | string = 0,
  format: string = DEFAULT_DATE_FORMAT
): string {
  return addBusinessDaysUsingCalendar(
    'addBusinessDays',
    iso,
    days,
    format,
    DEFAULT_BUSINESS_DAY_CALENDAR
  );
}

/** Escape hatch that always skips weekends only, regardless of workflow configuration. */
export function addWeekdays(
  iso: string | Date | null | undefined,
  days: number | string = 0,
  format: string = DEFAULT_DATE_FORMAT
): string {
  return addBusinessDaysUsingCalendar('addWeekdays', iso, days, format, 'weekends-only');
}

function nextBusinessDayUsingCalendar(
  iso: string | Date | null | undefined,
  format: string,
  calendar: BusinessDayCalendar
): string {
  const d = parseDateArg('nextBusinessDay', iso);
  if (d === undefined) { return ''; }

  const updated = nextBusinessDayForCalendar(d, calendar);
  return formatDateFns(updated, translateDateFormat(format));
}

/** Return an existing business day unchanged, or roll forward to the next one. */
export function nextBusinessDay(
  iso: string | Date | null | undefined,
  format: string = DEFAULT_DATE_FORMAT
): string {
  return nextBusinessDayUsingCalendar(iso, format, DEFAULT_BUSINESS_DAY_CALENDAR);
}

function businessDaysBetweenUsingCalendar(
  date1: string | Date | null | undefined,
  date2: string | Date | null | undefined,
  calendar: BusinessDayCalendar
): number {
  const d1 = requireDateArg('businessDaysBetween', date1, 'date1');
  const d2 = requireDateArg('businessDaysBetween', date2, 'date2');
  return businessDaysBetweenForCalendar(d1, d2, calendar);
}

/** Count business-day boundaries between two dates, excluding non-business endpoints. */
export function businessDaysBetween(
  date1: string | Date | null | undefined,
  date2: string | Date | null | undefined
): number {
  return businessDaysBetweenUsingCalendar(date1, date2, DEFAULT_BUSINESS_DAY_CALENDAR);
}

/**
 * Format currency with symbol
 */
export function formatCurrency(
  amount: number | null | undefined,
  currencyCode: string = 'USD',
  showSymbol: boolean = true
): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return showSymbol ? '$0.00' : '0.00';
  }

  try {
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
    }).format(amount);

    if (!showSymbol) {
      // Remove currency symbol
      // eslint-disable-next-line no-useless-escape
      return formatted.replace(/[^0-9.,\-]/g, '').trim();
    }

    return formatted;
  } catch (error) {
    // Fallback
    return showSymbol ? `${currencyCode} ${amount.toFixed(2)}` : amount.toFixed(2);
  }
}

/**
 * TPL-3 (D3's "named presets over format strings"): a closed, quote-free
 * filter vocabulary an author can write with no arguments and no quotes for
 * Word to mangle -- `{{ signing_date | longdate }}` rather than
 * `{{ signing_date | formatDate:"MMMM D, YYYY" }}`. Each wraps an existing
 * helper with a fixed argument; the argument form stays available as an
 * escape hatch (`formatDate`/`formatCurrency` still take one).
 */

/** "January 5, 2026" -- long-form date, no arguments. */
export function longdate(iso: string | Date | null | undefined): string {
  return formatDate(iso, 'MMMM D, YYYY');
}

/** "01/05/2026" -- named alias of formatDate's own default format. */
export function shortdate(iso: string | Date | null | undefined): string {
  return formatDate(iso);
}

/** "$1,234.50" -- USD with symbol; the common case needs no currency-code argument. */
export function usd(amount: number | null | undefined): string {
  return formatCurrency(amount);
}

/** "Hello World" -- lowercase-filter-name alias of formatters.titleCase for the preset vocabulary. */
export function titlecase(s: string | null | undefined): string {
  return formatters.titleCase(s);
}

/**
 * Format number with custom decimals
 */
export function formatNumber(
  n: number | null | undefined,
  decimals: number = 0,
  thousandsSep: boolean = true
): string {
  if (n === null || n === undefined || isNaN(n)) {
    return '0';
  }

  if (thousandsSep) {
    return n.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  return n.toFixed(decimals);
}

/**
 * Math operations
 */
export function add(a: number, b: number): number {
  return (a || 0) + (b || 0);
}

export function subtract(a: number, b: number): number {
  return (a || 0) - (b || 0);
}

export function multiply(a: number, b: number): number {
  return (a || 0) * (b || 0);
}

export function divide(a: number, b: number): number {
  if (!b || b === 0) {return 0;}
  return (a || 0) / b;
}

export function round(a: number, decimals: number = 0): number {
  if (a === null || a === undefined || isNaN(a)) { return 0; }
  const factor = Math.pow(10, decimals);
  return Math.round((a || 0) * factor) / factor;
}

export function percentage(value: number, total: number): string {
  if (value === null || value === undefined || isNaN(value)) { return '0%'; }
  if (!total || total === 0 || isNaN(total)) { return '0%'; }
  
  const pct = (value / total) * 100;
  return `${Math.round(pct)}%`;
}

/**
 * Pluralize word based on count
 */
export function pluralize(
  count: number,
  singular: string,
  plural?: string
): string {
  if (count === 1) {return singular;}
  return plural ?? `${singular}s`;
}

/**
 * Truncate string to length
 */
export function truncate(s: string | null | undefined, maxLength: number, suffix: string = '...'): string {
  if (!s) {return '';}
  if (s.length <= maxLength) {return s;}
  return s.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Replace string
 */
export function replace(
  s: string | null | undefined,
  search: string,
  replacement: string
): string {
  if (!s) {return '';}
  return s.replace(new RegExp(search, 'g'), replacement);
}

/**
 * Concatenate multiple strings
 */
export function concat(...args: unknown[]): string {
  return args.filter(a => a !== null && a !== undefined).map(String).join('');
}

/**
 * Split a template tag into tokens, keeping quoted segments intact.
 * Example: `formatDate dob "MMMM DD, YYYY"` -> ['formatDate', 'dob', '"MMMM DD, YYYY"']
 * Used by the expression parsers; not a template helper itself.
 */
export function tokenizeTag(tag: string): string[] {
  return tag.trim().match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
}

/**
 * Convert a raw helper-argument token to its runtime value:
 * quoted strings are unwrapped, numbers and booleans are coerced,
 * everything else passes through as-is.
 */
export function parseHelperArg(rawArg: string): unknown {
  if (
    rawArg.length >= 2 &&
    ((rawArg.startsWith('"') && rawArg.endsWith('"')) ||
      (rawArg.startsWith("'") && rawArg.endsWith("'")))
  ) {
    return rawArg.slice(1, -1);
  }
  if (rawArg === 'true') {return true;}
  if (rawArg === 'false') {return false;}
  if (rawArg !== '' && !Number.isNaN(Number(rawArg))) {return Number(rawArg);}
  return rawArg;
}

/**
 * Resolve a helper-argument token against the template scope:
 * quoted/numeric/boolean tokens are literals (via parseHelperArg); a bare
 * word that matches a variable path in scope resolves to that variable's
 * value ({{multiply basePrice quantity}}), otherwise it stays a literal
 * string ({{formatDate dob MM/DD/YYYY}}).
 */
export function resolveHelperArg(scope: Record<string, unknown>, rawArg: string): unknown {
  const parsed = parseHelperArg(rawArg);
  if (typeof parsed !== 'string' || parsed !== rawArg) {
    return parsed; // quoted string, number, or boolean literal
  }

  let current: unknown = scope;
  for (const key of rawArg.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return rawArg;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current === undefined ? rawArg : current;
}

/**
 * Join an array for scalar display in a document ({{tag}} used on an array
 * value). Primitives are joined with ", "; object elements are JSON-encoded.
 * Loop tags ({{#tag}}) receive the raw array instead — see the expression
 * parsers. Not a template helper itself.
 */
export function formatArrayForDisplay(arr: unknown[]): string {
  return arr
    .map((item) => {
      if (item === null || item === undefined) {return '';}
      if (typeof item === 'object') {return JSON.stringify(item);}
      return String(item);
    })
    .filter((item) => item !== '')
    .join(', ');
}

/**
 * Combine all helpers into single object
 * This includes both formatters from utils/formatters.ts and new helpers
 */
export const docxHelpers = {
  // From formatters.ts
  ...formatters,

  // String helpers
  capitalize,
  trim,
  truncate,
  replace,

  // Array helpers
  join,
  length,
  first,
  last,

  // Conditional helpers
  isEmpty,
  isNotEmpty,
  defaultValue,
  // TPL-3: the documented filter name (`{{ x | default:"N/A" }}`) -- same
  // function as defaultValue, registered under the shorter preset name.
  default: defaultValue,

  // Enhanced formatting
  formatDate,
  formatCurrency,
  formatNumber,

  // TPL-3 named preset vocabulary (see TEMPLATE_FILTER_VOCABULARY below)
  longdate,
  shortdate,
  usd,
  titlecase,

  // Math helpers
  add,
  subtract,
  multiply,
  divide,

  // Utility helpers
  pluralize,
  concat,
  addDays,
  addBusinessDays,
  addWeekdays,
  addMonths,
  addYears,
  startOfMonth,
  endOfMonth,
  daysBetween,
  nextBusinessDay,
  businessDaysBetween,
  round,
  percentage,
};

/**
 * Build the helper registry for one document render. Configuration-bound
 * wrappers keep the template syntax quote-free without mutable global state.
 */
export function createDocxHelpers(workflowSettings?: unknown): typeof docxHelpers {
  const calendar = resolveBusinessDayCalendar(workflowSettings);

  return {
    ...docxHelpers,
    addBusinessDays: (iso, days = 0, format = DEFAULT_DATE_FORMAT) =>
      addBusinessDaysUsingCalendar('addBusinessDays', iso, days, format, calendar),
    nextBusinessDay: (iso, format = DEFAULT_DATE_FORMAT) =>
      nextBusinessDayUsingCalendar(iso, format, calendar),
    businessDaysBetween: (date1, date2) =>
      businessDaysBetweenUsingCalendar(date1, date2, calendar),
  };
}

/**
 * TPL-3 (D3, "named presets over format strings"): the closed, documented
 * filter vocabulary template authors are expected to write -- one line per
 * preset, covering date, currency, number and case transforms plus the
 * strict-undefined escape hatch. TPL-5 imports this constant to validate an
 * uploaded template's filters rather than re-listing them.
 *
 * This is deliberately a curated subset of `docxHelpers`, not every key in
 * it: helpers like `add`/`round`/`replace` remain usable as the quoted
 * argument-form escape hatch (Preferred fix), but are not part of the
 * documented preset path.
 */
export const TEMPLATE_FILTER_VOCABULARY: Record<string, string> = {
  longdate: 'Long-form date, e.g. "January 5, 2026" -- {{ x | longdate }}',
  shortdate: 'Numeric date, e.g. "01/05/2026" -- {{ x | shortdate }}',
  usd: 'US dollar currency, e.g. "$1,234.50" -- {{ x | usd }}',
  currency: 'Currency in a given code (defaults USD) -- {{ x | currency }}',
  number: 'Thousands-separated number -- {{ x | number }}',
  percent: 'Percentage with a "%" suffix -- {{ x | percent }}',
  upper: 'UPPERCASE -- {{ x | upper }}',
  lower: 'lowercase -- {{ x | lower }}',
  titlecase: 'Title Case Each Word -- {{ x | titlecase }}',
  yesno: 'Boolean to "Yes"/"No" -- {{ x | yesno }}',
  trim: 'Strip leading/trailing whitespace -- {{ x | trim }}',
  default:
    'Fallback when the value is unknown or empty (D3 strict-undefined escape hatch) -- {{ x | default:"N/A" }}',
  addBusinessDays:
    'Add business days using the workflow calendar -- {{ x | addBusinessDays:30 }}',
  nextBusinessDay:
    'Keep a business day or roll forward to the next one -- {{ x | nextBusinessDay }}',
  businessDaysBetween:
    'Count business days between dates using the workflow calendar -- {{ x | businessDaysBetween:y }}',
  addWeekdays:
    'Add weekdays while always ignoring holidays -- {{ x | addWeekdays:30 }}',
};
