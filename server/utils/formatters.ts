/**
 * Template Formatters
 * Helper functions for formatting values in DOCX templates
 */

import { parseISO, isValid } from 'date-fns';

/**
 * Convert string to uppercase
 */
export function upper(s: string | null | undefined): string {
  return s?.toUpperCase?.() ?? '';
}

/**
 * Convert string to lowercase
 */
export function lower(s: string | null | undefined): string {
  return s?.toLowerCase?.() ?? '';
}

/**
 * Format number as currency
 * @param n - Number to format
 * @param c - Currency code (default: USD)
 */
export function currency(n: number | null | undefined, c: string = 'USD'): string {
  if (n === null || n === undefined || isNaN(n)) {
    return '$0.00';
  }

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: c,
    }).format(n);
  } catch (error) {
    // Fallback for invalid currency codes
    return `${c} ${n.toFixed(2)}`;
  }
}

/**
 * Format ISO date string
 * @param iso - ISO date string
 * @param format - Format type ('short', 'long', 'iso') - default: 'short'
 */
export function date(
  iso: string | Date | null | undefined,
  format: 'short' | 'long' | 'iso' = 'short'
): string {
  if (iso === null || iso === undefined) {
    return '';
  }

  try {
    // TPL-9 Finding (b): `new Date('2026-01-05')` parses a bare date-only
    // ISO string as UTC midnight (ECMA-262 Date Time String Format), so
    // formatting it back out in a negative-UTC-offset timezone rolls it
    // back a calendar day -- probed as "01/05/2026" rendering "01/04/2026".
    // `formatDate` in `docxHelpers.ts` parses the identical string with
    // date-fns' `parseISO`, which treats a date-only string as LOCAL
    // midnight instead, and does not have the bug. Two formatters that
    // disagree on the same input is exactly how that bug was found, so this
    // one now parses the same way `formatDate` does -- a value that already
    // carries a time component (or an actual `Date` instance) is unaffected.
    let d = typeof iso === 'string' ? parseISO(iso) : iso;
    if (typeof iso === 'string' && !isValid(d)) {
      d = new Date(iso);
    }

    if (isNaN(d.getTime())) {
      return '';
    }

    switch (format) {
      case 'long':
        return d.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      case 'iso':
        return d.toISOString().split('T')[0];
      case 'short':
      default:
        return d.toLocaleDateString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        });
    }
  } catch (error) {
    return '';
  }
}

/**
 * Convert boolean to Yes/No
 */
export function yesno(b: boolean | null | undefined): string {
  return b ? 'Yes' : 'No';
}

/**
 * Capitalize first letter of each word
 */
export function titleCase(s: string | null | undefined): string {
  if (!s) {return '';}

  return s
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Format number with thousand separators
 */
export function number(n: number | null | undefined, decimals: number = 0): string {
  if (n === null || n === undefined || isNaN(n)) {
    return '0';
  }

  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format percentage
 */
export function percent(n: number | null | undefined, decimals: number = 0): string {
  if (n === null || n === undefined || isNaN(n)) {
    return '0%';
  }

  return `${n.toFixed(decimals)}%`;
}

/**
 * Export all formatters as a single object for use in templates
 */
export const formatters = {
  upper,
  lower,
  currency,
  date,
  yesno,
  titleCase,
  number,
  percent,
};
