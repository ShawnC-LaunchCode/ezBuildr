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

import { format as formatDateFns, addDays as fnsAddDays, differenceInDays, parseISO, isValid } from 'date-fns';

import { formatters } from '../utils/formatters';

/**
 * Capitalize first letter of string
 */
export function capitalize(s: string | null | undefined): string {
  if (!s) {return '';}
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
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
 * Format date with a Moment-style format string.
 * Supports: YYYY, YY, MMMM, MMM, MM, M, DD, D, Do, dddd, ddd, HH, H, hh, h,
 * mm, ss, A, a, and quoted literals ('at').
 */
export function formatDate(
  iso: string | Date | null | undefined,
  format: string = 'MM/DD/YYYY'
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
 * Add days to a date
 */
export function addDays(
  iso: string | Date | null | undefined,
  days: number = 0,
  format: string = 'MM/DD/YYYY'
): string {
  if (iso == null || iso === '') { return ''; }

  try {
    let d = typeof iso === 'string' ? parseISO(iso) : iso;
    if (typeof iso === 'string' && !isValid(d)) {
      d = new Date(iso);
    }
    if (isNaN(d.getTime())) { return ''; }

    const updated = fnsAddDays(d, days);
    return formatDateFns(updated, translateDateFormat(format));
  } catch (error) {
    return '';
  }
}

/**
 * Calculate difference in days between two dates
 */
export function daysBetween(
  date1: string | Date | null | undefined,
  date2: string | Date | null | undefined
): number {
  if (date1 == null || date1 === '' || date2 == null || date2 === '') { return 0; }

  try {
    let d1 = typeof date1 === 'string' ? parseISO(date1) : date1;
    if (typeof date1 === 'string' && !isValid(d1)) {
      d1 = new Date(date1);
    }
    let d2 = typeof date2 === 'string' ? parseISO(date2) : date2;
    if (typeof date2 === 'string' && !isValid(d2)) {
      d2 = new Date(date2);
    }
    
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) { return 0; }

    return Math.abs(differenceInDays(d1, d2));
  } catch (error) {
    return 0;
  }
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

  // Enhanced formatting
  formatDate,
  formatCurrency,
  formatNumber,

  // Math helpers
  add,
  subtract,
  multiply,
  divide,

  // Utility helpers
  pluralize,
  concat,
  addDays,
  daysBetween,
  round,
  percentage,
};

/**
 * Create a custom parser function for docxtemplater
 * This enables angular-like expressions with filters
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createAngularParser() {
  return {

    get(scope: Record<string, unknown>, context: string): unknown {
      // Handle dot notation (e.g., "user.name")
      const keys = context.split('.');
      let current: unknown = scope;

      for (const key of keys) {
        if (current == null) {return '';}
        current = (current as Record<string, unknown>)[key];
      }

      return current;
    },
  };
}
