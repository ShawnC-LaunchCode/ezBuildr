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
export function join(arr: any[] | null | undefined, separator: string = ', '): string {
  if (!arr || !Array.isArray(arr)) {return '';}
  return arr.filter(item => item != null).join(separator);
}

/**
 * Get array length
 */
export function length(arr: any[] | null | undefined): number {
  if (!arr || !Array.isArray(arr)) {return 0;}
  return arr.length;
}

/**
 * Get first element of array
 */
export function first(arr: any[] | null | undefined): any {
  if (!arr || !Array.isArray(arr) || arr.length === 0) {return null;}
  return arr[0];
}

/**
 * Get last element of array
 */
export function last(arr: any[] | null | undefined): any {
  if (!arr || !Array.isArray(arr) || arr.length === 0) {return null;}
  return arr[arr.length - 1];
}

/**
 * Check if value is empty (null, undefined, '', [], {})
 */
export function isEmpty(value: any): boolean {
  if (value === null || value === undefined || value === '') {return true;}
  if (Array.isArray(value)) {return value.length === 0;}
  if (typeof value === 'object') {return Object.keys(value).length === 0;}
  return false;
}

/**
 * Check if value is not empty
 */
export function isNotEmpty(value: any): boolean {
  return !isEmpty(value);
}

/**
 * Default value if empty
 */
export function defaultValue(value: any, defaultVal: any): any {
  return isEmpty(value) ? defaultVal : value;
}

/**
 * Format date with custom format string
 * Supports: YYYY, MM, DD, HH, mm, ss
 */
export function formatDate(
  iso: string | Date | null | undefined,
  format: string = 'MM/DD/YYYY'
): string {
  if (!iso) {return '';}

  try {
    const d = typeof iso === 'string' ? new Date(iso) : iso;
    if (isNaN(d.getTime())) {return '';}

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');

    return format
      .replace('YYYY', String(year))
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hours)
      .replace('mm', minutes)
      .replace('ss', seconds);
  } catch (error) {
    return '';
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

/**
 * Pluralize word based on count
 */
export function pluralize(
  count: number,
  singular: string,
  plural?: string
): string {
  if (count === 1) {return singular;}
  return plural || `${singular}s`;
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
};

/**
 * Create a custom parser function for docxtemplater
 * This enables angular-like expressions with filters
 */
export function createAngularParser() {
  return {
    get(scope: any, context: string) {
      // Handle dot notation (e.g., "user.name")
      const keys = context.split('.');
      let current = scope;

      for (const key of keys) {
        if (current == null) {return '';}
        current = current[key];
      }

      return current;
    },
  };
}
