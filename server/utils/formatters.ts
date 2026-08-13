/**
 * Template Formatters
 * Helper functions for formatting values in DOCX templates
 */

import { parseISO, isValid } from 'date-fns';

import type { BusinessDayCalendar } from '../../shared/types/workflow';

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function observedFixedHoliday(year: number, month: number, day: number): Date {
  const holiday = new Date(year, month, day);
  const observed = new Date(holiday);
  if (holiday.getDay() === 6) {
    observed.setDate(observed.getDate() - 1);
  } else if (holiday.getDay() === 0) {
    observed.setDate(observed.getDate() + 1);
  }
  return observed;
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, occurrence: number): Date {
  const first = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + (occurrence - 1) * 7);
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const last = new Date(year, month + 1, 0);
  const offset = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month, last.getDate() - offset);
}

/** Compute the observed US federal holiday calendar for one nominal year. */
function usFederalHolidayKeys(year: number): Set<string> {
  const holidays = [
    observedFixedHoliday(year, 0, 1),
    nthWeekdayOfMonth(year, 0, 1, 3), // Martin Luther King Jr. Day
    nthWeekdayOfMonth(year, 1, 1, 3), // Washington's Birthday
    lastWeekdayOfMonth(year, 4, 1), // Memorial Day
    observedFixedHoliday(year, 6, 4),
    nthWeekdayOfMonth(year, 8, 1, 1), // Labor Day
    nthWeekdayOfMonth(year, 9, 1, 2), // Columbus Day
    observedFixedHoliday(year, 10, 11),
    nthWeekdayOfMonth(year, 10, 4, 4), // Thanksgiving Day
    observedFixedHoliday(year, 11, 25),
  ];

  // Juneteenth became a federal holiday in 2021.
  if (year >= 2021) {
    holidays.push(observedFixedHoliday(year, 5, 19));
  }

  return new Set(holidays.map(dateKey));
}

function isUsFederalHoliday(date: Date): boolean {
  const key = dateKey(date);
  const year = date.getFullYear();

  // New Year's Day can be observed on December 31 of the preceding year, so
  // include adjacent nominal years rather than assuming the observed date
  // stays inside the holiday's calendar year.
  return [year - 1, year, year + 1].some((nominalYear) =>
    usFederalHolidayKeys(nominalYear).has(key)
  );
}

export function isBusinessDay(date: Date, calendar: BusinessDayCalendar): boolean {
  const weekday = date.getDay();
  if (weekday === 0 || weekday === 6) {
    return false;
  }
  return calendar === 'weekends-only' || !isUsFederalHoliday(date);
}

export function addBusinessDaysForCalendar(
  date: Date,
  amount: number,
  calendar: BusinessDayCalendar
): Date {
  const result = new Date(date);
  const wholeDays = Math.trunc(amount);
  const direction = wholeDays < 0 ? -1 : 1;
  let remaining = Math.abs(wholeDays);

  while (remaining > 0) {
    result.setDate(result.getDate() + direction);
    if (isBusinessDay(result, calendar)) {
      remaining -= 1;
    }
  }

  return result;
}

export function nextBusinessDayForCalendar(date: Date, calendar: BusinessDayCalendar): Date {
  const result = new Date(date);
  while (!isBusinessDay(result, calendar)) {
    result.setDate(result.getDate() + 1);
  }
  return result;
}

/** Count business-day boundaries, matching `daysBetween`'s absolute result. */
export function businessDaysBetweenForCalendar(
  date1: Date,
  date2: Date,
  calendar: BusinessDayCalendar
): number {
  const firstDay = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
  const secondDay = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
  if (firstDay.getTime() === secondDay.getTime()) {
    return 0;
  }

  const [earlier, later] = firstDay < secondDay ? [firstDay, secondDay] : [secondDay, firstDay];
  const cursor = new Date(earlier);
  let count = 0;

  while (cursor < later) {
    cursor.setDate(cursor.getDate() + 1);
    if (isBusinessDay(cursor, calendar)) {
      count += 1;
    }
  }

  return count;
}

/**
 * The number inside a template value, or `undefined` when there isn't one —
 * the one place the numeric filters agree on what "no number" means.
 *
 * G171-B1/B5: template values arrive as **strings** (a runner answer, a
 * DataVault cell, a JSON import), and `isNaN` coerces its argument while number
 * methods do not. That mismatch was the whole bug family: `isNaN('42.3')` is
 * `false`, so `'42.3'` sailed past `percent`'s guard into `'42.3'.toFixed(0)`
 * — `String` has no `toFixed`, so every real answer threw and took the document
 * with it — while `number('1234.5')` reached `String.prototype.toLocaleString`
 * and silently returned the string unformatted.
 *
 * `''` and whitespace deliberately do NOT coerce to 0 here, even though
 * `Number('')` is 0: an unanswered question is not an answer of zero, and every
 * caller renders blank for `undefined`.
 */
export function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') { return undefined; }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

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
 * @param n - Number to format (accepts the numeric strings templates carry)
 * @param c - Currency code (default: USD)
 *
 * A value with no number in it renders **blank**, not `$0.00` (G171-B2). A
 * money amount nobody entered must not be stated: "Fee: $0.00" is a different
 * agreement from "Fee: ___", and this is a legal-document product. Blank is
 * also the rule the authoring guide already declares
 * (`docs/guides/VARIABLES_IN_DOCUMENTS.md`, "blank-on-empty"), with pronoun
 * filters as its one exception.
 *
 * An author who genuinely wants a zero says so in the template —
 * `{{ fee | default:"0" | currency }}` renders `$0.00` — which puts the intent
 * somewhere a reviewer can see it instead of in a silent default.
 */
export function currency(n: number | string | null | undefined, c: string = 'USD'): string {
  const value = toFiniteNumber(n);
  if (value === undefined) {
    return '';
  }

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: c,
    }).format(value);
  } catch (error) {
    // Fallback for invalid currency codes
    return `${c} ${value.toFixed(2)}`;
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
 * Format number with thousand separators. Accepts the numeric strings
 * templates carry; a value with no number in it renders blank (G171-B2 — see
 * `currency` for the reasoning and the `default:"0"` opt-in).
 */
export function number(n: number | string | null | undefined, decimals: number = 0): string {
  const value = toFiniteNumber(n);
  if (value === undefined) {
    return '';
  }

  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format percentage. Accepts the numeric strings templates actually carry.
 *
 * A value with no number in it renders **blank**, not `0%` (G171-B1). Two
 * reasons, and the first is the one that matters: `0%` is a plausible agreed
 * term in a signed document, and a term nobody stated must never be
 * manufactured — the same reasoning TPL-9 Finding (c) used to make
 * `daysBetween` raise rather than render `0` days. An empty `%` cannot be
 * mistaken for a rate. Second, blank is what a bare `{{ rate }}` renders for an
 * unanswered question, and DOC-104 lists the variable in the document's
 * unresolved-variable report either way, so the gap is reported, not hidden.
 */
export function percent(n: number | string | null | undefined, decimals: number = 0): string {
  const value = toFiniteNumber(n);
  if (value === undefined) {
    return '';
  }

  return `${value.toFixed(decimals)}%`;
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
