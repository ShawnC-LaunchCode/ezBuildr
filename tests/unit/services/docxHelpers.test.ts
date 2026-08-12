import { describe, it, expect } from 'vitest';

import {
  capitalize,
  join,
  length,
  first,
  last,
  isEmpty,
  isNotEmpty,
  defaultValue,
  formatDate,
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
  formatCurrency,
  formatNumber,
  add,
  subtract,
  multiply,
  divide,
  round,
  percentage,
  pluralize,
  truncate,
  replace,
  concat,
  docxHelpers,
  createDocxHelpers,
  tokenizeTag,
  parseHelperArg,
  resolveHelperArg,
} from '../../../server/services/docxHelpers';

/**
 * Stage 21 PR 3: DOCX Helpers Tests
 *
 * Unit tests for DOCX template helper functions
 */

describe('DOCX Helpers', () => {
  describe('String Helpers', () => {
    describe('capitalize', () => {
      it('should capitalize first letter', () => {
        expect(capitalize('hello world')).toBe('Hello world');
        expect(capitalize('HELLO')).toBe('Hello');
        expect(capitalize('h')).toBe('H');
      });

      it('should handle null/undefined', () => {
        expect(capitalize(null)).toBe('');
        expect(capitalize(undefined)).toBe('');
        expect(capitalize('')).toBe('');
      });
    });

    describe('truncate', () => {
      it('should truncate long strings', () => {
        expect(truncate('This is a long string', 10)).toBe('This is...');
        expect(truncate('Short', 10)).toBe('Short');
      });

      it('should allow custom suffix', () => {
        expect(truncate('Long string here', 10, '…')).toBe('Long stri…');
      });
    });

    describe('replace', () => {
      it('should replace all occurrences', () => {
        expect(replace('hello world hello', 'hello', 'hi')).toBe('hi world hi');
      });

      it('should handle null/undefined', () => {
        expect(replace(null, 'x', 'y')).toBe('');
      });
    });

    describe('concat', () => {
      it('should concatenate values', () => {
        expect(concat('a', 'b', 'c')).toBe('abc');
        expect(concat(1, 2, 3)).toBe('123');
      });

      it('should filter out null/undefined', () => {
        expect(concat('a', null, 'b', undefined, 'c')).toBe('abc');
      });
    });
  });

  describe('Array Helpers', () => {
    describe('join', () => {
      it('should join array elements', () => {
        expect(join(['a', 'b', 'c'])).toBe('a, b, c');
        expect(join(['a', 'b', 'c'], ' | ')).toBe('a | b | c');
      });

      it('should filter null values', () => {
        expect(join(['a', null, 'b', undefined, 'c'])).toBe('a, b, c');
      });

      it('should handle empty/null arrays', () => {
        expect(join([])).toBe('');
        expect(join(null)).toBe('');
        expect(join(undefined)).toBe('');
      });
    });

    describe('length', () => {
      it('should return array length', () => {
        expect(length([1, 2, 3])).toBe(3);
        expect(length([])).toBe(0);
      });

      it('should return 0 for null/undefined', () => {
        expect(length(null)).toBe(0);
        expect(length(undefined)).toBe(0);
      });
    });

    describe('first', () => {
      it('should return first element', () => {
        expect(first([1, 2, 3])).toBe(1);
        expect(first(['a'])).toBe('a');
      });

      it('should return null for empty/null', () => {
        expect(first([])).toBeNull();
        expect(first(null)).toBeNull();
      });
    });

    describe('last', () => {
      it('should return last element', () => {
        expect(last([1, 2, 3])).toBe(3);
        expect(last(['a'])).toBe('a');
      });

      it('should return null for empty/null', () => {
        expect(last([])).toBeNull();
        expect(last(null)).toBeNull();
      });
    });
  });

  describe('Conditional Helpers', () => {
    describe('isEmpty', () => {
      it('should detect empty values', () => {
        expect(isEmpty(null)).toBe(true);
        expect(isEmpty(undefined)).toBe(true);
        expect(isEmpty('')).toBe(true);
        expect(isEmpty([])).toBe(true);
        expect(isEmpty({})).toBe(true);
      });

      it('should detect non-empty values', () => {
        expect(isEmpty('hello')).toBe(false);
        expect(isEmpty([1])).toBe(false);
        expect(isEmpty({ a: 1 })).toBe(false);
        expect(isEmpty(0)).toBe(false);
        expect(isEmpty(false)).toBe(false);
      });
    });

    describe('isNotEmpty', () => {
      it('should be inverse of isEmpty', () => {
        expect(isNotEmpty(null)).toBe(false);
        expect(isNotEmpty('hello')).toBe(true);
      });
    });

    describe('defaultValue', () => {
      it('should return value if not empty', () => {
        expect(defaultValue('hello', 'default')).toBe('hello');
        expect(defaultValue(0, 'default')).toBe(0);
      });

      it('should return default if empty', () => {
        expect(defaultValue(null, 'default')).toBe('default');
        expect(defaultValue('', 'default')).toBe('default');
        expect(defaultValue([], 'default')).toBe('default');
      });
    });
  });

  describe('Formatting Helpers', () => {
    describe('formatDate', () => {
      it('should format dates with custom format', () => {
        const date = new Date('2025-03-15T10:30:00Z');
        expect(formatDate(date, 'YYYY-MM-DD')).toBe('2025-03-15');
        expect(formatDate(date, 'MM/DD/YYYY')).toBe('03/15/2025');
        expect(formatDate(date, 'DD-MM-YYYY')).toBe('15-03-2025');
      });

      it('should handle ISO strings', () => {
        const result = formatDate('2025-03-15', 'YYYY-MM-DD');
        expect(result).toContain('2025');
      });

      it('should return empty for invalid dates', () => {
        expect(formatDate(null)).toBe('');
        expect(formatDate('invalid')).toBe('');
      });

      describe('documented Moment-style tokens', () => {
        // Local-time constructor keeps assertions timezone-independent.
        // Nov 14 2025 is a Friday.
        const date = new Date(2025, 10, 14, 15, 30, 5);

        it('should support long month names (MMMM)', () => {
          expect(formatDate(date, 'MMMM DD, YYYY')).toBe('November 14, 2025');
        });

        it('should support short month names and single-digit day (MMM D)', () => {
          expect(formatDate(date, 'MMM D, YYYY')).toBe('Nov 14, 2025');
        });

        it("should support abbreviated year with literal apostrophe ('YY)", () => {
          expect(formatDate(date, "MMM D, 'YY")).toBe("Nov 14, '25");
        });

        it('should support weekday and ordinal day (dddd, Do)', () => {
          expect(formatDate(date, 'dddd, MMMM Do, YYYY')).toBe('Friday, November 14th, 2025');
        });

        it('should support 12-hour time with AM/PM (h:mm A)', () => {
          expect(formatDate(date, 'h:mm A')).toBe('3:30 PM');
        });

        it('should support 24-hour time with seconds (HH:mm:ss)', () => {
          expect(formatDate(date, 'HH:mm:ss')).toBe('15:30:05');
        });

        it("should support quoted literal text ('at')", () => {
          expect(formatDate(date, "MMMM DD, YYYY 'at' h:mm A")).toBe(
            'November 14, 2025 at 3:30 PM'
          );
        });
      });
    });

    describe('date (formatters) agrees with formatDate', () => {
      // TPL-9 Finding (b), reproduced before the fix: `docxHelpers.date` used
      // `new Date('2026-01-05')`, which the ECMA-262 Date Time String Format
      // parses a bare date-only string as UTC midnight -- formatting it back
      // out in a negative-UTC-offset timezone rendered "01/04/2026" instead
      // of "01/05/2026", one calendar day behind `formatDate`'s (correct)
      // "01/05/2026". Both must now agree.
      it('AC3: renders the same calendar day as formatDate for a bare YYYY-MM-DD input', () => {
        const iso = '2026-01-05';
        expect(docxHelpers.date(iso)).toBe(formatDate(iso));
        expect(docxHelpers.date(iso)).toBe('01/05/2026');
      });
    });

    describe('addDays', () => {
      it('should add days to date', () => {
        const date = new Date('2025-03-15T10:30:00Z');
        expect(addDays(date, 5, 'YYYY-MM-DD')).toBe('2025-03-20');
        expect(addDays(date, -5, 'YYYY-MM-DD')).toBe('2025-03-10');
      });

      it('should handle null/undefined as a legitimate empty render (D3: empty, not unknown)', () => {
        expect(addDays(null)).toBe('');
        expect(addDays('')).toBe('');
      });

      // AC1
      it('AC1: a quoted numeric amount ("30") produces the identical result to a bare number (30)', () => {
        expect(addDays('2026-01-05', '30', 'MM/DD/YYYY')).toBe(addDays('2026-01-05', 30, 'MM/DD/YYYY'));
        expect(addDays('2026-01-05', '30', 'MM/DD/YYYY')).toBe('02/04/2026');
      });

      // AC8 regression: the exact wrong historical output, quoted here so the
      // bug can never silently come back. Root cause: date-fns' addDays does
      // `date.getDate() + amount`; with amount as the string "30" this is
      // `5 + "30"`, which STRING-CONCATENATES to "530" rather than adding to
      // 35, and `setDate(530)` rolls the date forward far past the intended
      // one month. Reproduced before this fix: addDays('2026-01-05', '30')
      // rendered '06/14/2027' (525 days away), not '02/04/2026' (30 days).
      it('AC8 regression: addDays("2026-01-05", "30") no longer produces the historical wrong date', () => {
        const result = addDays('2026-01-05', '30', 'MM/DD/YYYY');
        expect(result).not.toBe('06/14/2027'); // the historical, silently wrong output
        expect(result).toBe('02/04/2026');
      });

      // AC2
      it('AC2: a non-numeric amount raises rather than returning a date or blank', () => {
        expect(() => addDays('2026-01-05', 'soon')).toThrow(/addDays/);
        expect(() => addDays('2026-01-05', 'soon')).toThrow(/soon/);
      });

      // AC4
      it('AC4: an unparseable date input raises rather than returning blank', () => {
        expect(() => addDays('not a date', 30)).toThrow(/addDays/);
        expect(() => addDays('not a date', 30)).toThrow(/not a date/);
      });
    });

    describe('business-day arithmetic (BIZ-1)', () => {
      it('AC1/AC8: absent settings default to weekends-only and skip a weekend from Friday', () => {
        expect(addBusinessDays('2026-01-02', 1, 'YYYY-MM-DD')).toBe('2026-01-05');
        expect(createDocxHelpers({}).addBusinessDays('2026-01-02', 1, 'YYYY-MM-DD')).toBe(
          '2026-01-05'
        );
      });

      it('AC2: the US-federal calendar also skips a federal holiday', () => {
        const helpers = createDocxHelpers({ businessDayCalendar: 'us-federal' });
        expect(helpers.addBusinessDays('2026-01-16', 1, 'YYYY-MM-DD')).toBe('2026-01-20');
      });

      it('AC3/AC4: computes Saturday observation in 2026 and Sunday observation in 2027', () => {
        const helpers = createDocxHelpers({ businessDayCalendar: 'us-federal' });

        // Independence Day is Saturday in 2026, so Friday July 3 is observed.
        expect(helpers.addBusinessDays('2026-07-02', 1, 'YYYY-MM-DD')).toBe('2026-07-06');
        // Independence Day is Sunday in 2027, so Monday July 5 is observed.
        expect(helpers.addBusinessDays('2027-07-02', 1, 'YYYY-MM-DD')).toBe('2027-07-06');
      });

      it('AC5: nextBusinessDay preserves a business day and rolls a non-business day forward', () => {
        expect(nextBusinessDay('2026-01-07', 'YYYY-MM-DD')).toBe('2026-01-07');
        expect(nextBusinessDay('2026-01-04', 'YYYY-MM-DD')).toBe('2026-01-05');
      });

      it('AC6: businessDaysBetween excludes weekend dates at both endpoints', () => {
        expect(businessDaysBetween('2026-01-03', '2026-01-11')).toBe(5);
        expect(businessDaysBetween('2026-01-11', '2026-01-03')).toBe(5);
      });

      it('AC7: addWeekdays ignores holidays under a US-federal workflow', () => {
        const helpers = createDocxHelpers({ businessDayCalendar: 'us-federal' });
        expect(helpers.addWeekdays('2026-07-02', 1, 'YYYY-MM-DD')).toBe('2026-07-03');
        expect(addWeekdays('2026-07-02', 1, 'YYYY-MM-DD')).toBe('2026-07-03');
      });

      it('AC9: an invalid setting names the setting and accepted values', () => {
        expect(() => createDocxHelpers({ businessDayCalendar: 'court-days' })).toThrow(
          /businessDayCalendar.*weekends-only.*us-federal.*court-days/
        );
      });

      it('coerces quoted numeric amounts and rejects invalid dates and amounts', () => {
        expect(addBusinessDays('2026-01-02', '1', 'YYYY-MM-DD')).toBe('2026-01-05');
        expect(addBusinessDays(null, 1)).toBe('');
        expect(() => addBusinessDays('2026-01-02', 'soon')).toThrow(/addBusinessDays.*soon/);
        expect(() => businessDaysBetween('not a date', '2026-01-02')).toThrow(/businessDaysBetween/);
      });
    });

    describe('addMonths', () => {
      it('adds whole months and formats', () => {
        expect(addMonths('2026-01-05', 1, 'MM/DD/YYYY')).toBe('02/05/2026');
        expect(addMonths('2026-01-05', -1, 'MM/DD/YYYY')).toBe('12/05/2025');
      });

      // AC7: the month-end convention, asserted rather than left emergent.
      // date-fns' addMonths clamps an overflowing day to the last day of the
      // target month -- adopted as-is (see the code comment on addMonths in
      // docxHelpers.ts). 2026 is not a leap year, so February has 28 days:
      // one month after January 31 is February 28, not March 3 and not an
      // error.
      it('AC7: one month after 2026-01-31 is 2026-02-28 (date-fns month-end clamp)', () => {
        expect(addMonths('2026-01-31', 1, 'MM/DD/YYYY')).toBe('02/28/2026');
      });

      it('handles null/undefined as empty and raises on a non-numeric amount', () => {
        expect(addMonths(null)).toBe('');
        expect(() => addMonths('2026-01-05', 'soon')).toThrow(/addMonths/);
      });
    });

    describe('addYears', () => {
      it('adds whole years and formats', () => {
        expect(addYears('2026-01-05', 1, 'MM/DD/YYYY')).toBe('01/05/2027');
      });

      it('clamps Feb 29 on a leap year to Feb 28 on a non-leap target year', () => {
        // 2028 is a leap year (Feb 29 exists); 2029 is not.
        expect(addYears('2028-02-29', 1, 'MM/DD/YYYY')).toBe('02/28/2029');
      });

      it('handles null/undefined as empty and raises on a non-numeric amount', () => {
        expect(addYears(null)).toBe('');
        expect(() => addYears('2026-01-05', 'soon')).toThrow(/addYears/);
      });
    });

    describe('startOfMonth', () => {
      it('returns the first day of the month', () => {
        expect(startOfMonth('2026-01-15', 0, 'MM/DD/YYYY')).toBe('01/01/2026');
      });

      it('applies a whole-month offset before truncating', () => {
        expect(startOfMonth('2026-01-15', 1, 'MM/DD/YYYY')).toBe('02/01/2026');
      });

      it('handles null/undefined as empty', () => {
        expect(startOfMonth(null)).toBe('');
      });
    });

    describe('endOfMonth', () => {
      it('returns the last day of the month', () => {
        expect(endOfMonth('2026-01-15', 0, 'MM/DD/YYYY')).toBe('01/31/2026');
        expect(endOfMonth('2026-02-15', 0, 'MM/DD/YYYY')).toBe('02/28/2026'); // 2026 is not a leap year
      });

      it('applies a whole-month offset before truncating', () => {
        expect(endOfMonth('2026-01-15', 1, 'MM/DD/YYYY')).toBe('02/28/2026');
      });

      it('handles null/undefined as empty', () => {
        expect(endOfMonth(null)).toBe('');
      });
    });

    describe('daysBetween', () => {
      it('should return difference in days', () => {
        const d1 = new Date('2025-03-10T10:30:00Z');
        const d2 = new Date('2025-03-15T10:30:00Z');
        expect(daysBetween(d1, d2)).toBe(5);
        expect(daysBetween(d2, d1)).toBe(5);
      });

      // AC5: a missing operand used to return 0, and 0 is a plausible real
      // term ("due 0 days after signing" reads as a stated deadline, not as
      // "unknown") -- silently wrong in the same way as TPL-9's other two
      // findings. It must raise instead.
      it('AC5: a missing operand raises rather than returning 0', () => {
        expect(() => daysBetween(null, new Date())).toThrow(/daysBetween/);
        expect(() => daysBetween(new Date(), null)).toThrow(/daysBetween/);
        expect(() => daysBetween('', new Date())).toThrow(/daysBetween/);
      });

      it('an unparseable operand raises', () => {
        expect(() => daysBetween('not a date', new Date())).toThrow(/daysBetween/);
      });
    });

    describe('formatCurrency', () => {
      it('should format USD by default', () => {
        expect(formatCurrency(1234.56)).toBe('$1,234.56');
        expect(formatCurrency(0)).toBe('$0.00');
      });

      it('should format other currencies', () => {
        const result = formatCurrency(1234.56, 'EUR');
        expect(result).toContain('1,234.56');
      });

      it('should handle no symbol option', () => {
        const result = formatCurrency(1234.56, 'USD', false);
        expect(result).not.toContain('$');
        expect(result).toContain('1,234.56');
      });

      it('should handle null/undefined', () => {
        expect(formatCurrency(null)).toBe('$0.00');
        expect(formatCurrency(undefined)).toBe('$0.00');
      });
    });

    describe('formatNumber', () => {
      it('should format with decimals', () => {
        expect(formatNumber(1234.567, 2)).toBe('1,234.57');
        expect(formatNumber(1234.567, 0)).toBe('1,235');
      });

      it('should handle no thousands separator', () => {
        expect(formatNumber(1234.567, 2, false)).toBe('1234.57');
      });

      it('should handle null/undefined', () => {
        expect(formatNumber(null)).toBe('0');
        expect(formatNumber(undefined)).toBe('0');
      });
    });
  });

  describe('Math Helpers', () => {
    describe('add', () => {
      it('should add numbers', () => {
        expect(add(5, 3)).toBe(8);
        expect(add(0, 0)).toBe(0);
        expect(add(-5, 3)).toBe(-2);
      });
    });

    describe('subtract', () => {
      it('should subtract numbers', () => {
        expect(subtract(5, 3)).toBe(2);
        expect(subtract(3, 5)).toBe(-2);
      });
    });

    describe('multiply', () => {
      it('should multiply numbers', () => {
        expect(multiply(5, 3)).toBe(15);
        expect(multiply(0, 5)).toBe(0);
      });
    });

    describe('divide', () => {
      it('should divide numbers', () => {
        expect(divide(10, 2)).toBe(5);
        expect(divide(10, 3)).toBeCloseTo(3.333, 2);
      });

      it('should return 0 when b is 0/empty', () => {
        expect(divide(10, 0)).toBe(0);
      });
    });

    describe('round', () => {
      it('should round numbers', () => {
        expect(round(10.4)).toBe(10);
        expect(round(10.5)).toBe(11);
        expect(round(10.123, 2)).toBe(10.12);
        expect(round(10.125, 2)).toBe(10.13);
      });
    });

    describe('percentage', () => {
      it('should calculate percentage', () => {
        expect(percentage(50, 100)).toBe('50%');
        expect(percentage(1, 3)).toBe('33%');
      });

      it('should handle 0 total', () => {
        expect(percentage(10, 0)).toBe('0%');
      });
    });
  });

  describe('Utility Helpers', () => {
    describe('pluralize', () => {
      it('should pluralize based on count', () => {
        expect(pluralize(1, 'item')).toBe('item');
        expect(pluralize(2, 'item')).toBe('items');
        expect(pluralize(0, 'item')).toBe('items');
      });

      it('should use custom plural form', () => {
        expect(pluralize(1, 'child', 'children')).toBe('child');
        expect(pluralize(2, 'child', 'children')).toBe('children');
      });
    });
  });

  describe('docxHelpers Object', () => {
    it('should export all helpers', () => {
      expect(docxHelpers).toBeDefined();
      expect(typeof docxHelpers.capitalize).toBe('function');
      expect(typeof docxHelpers.join).toBe('function');
      expect(typeof docxHelpers.formatDate).toBe('function');
      expect(typeof docxHelpers.upper).toBe('function'); // From formatters
      expect(typeof docxHelpers.currency).toBe('function'); // From formatters
    });

    it('should include helpers from formatters', () => {
      expect(docxHelpers.upper('hello')).toBe('HELLO');
      expect(docxHelpers.lower('HELLO')).toBe('hello');
      expect(docxHelpers.titleCase('hello world')).toBe('Hello World');
    });

    it('should not expose parser utilities as template helpers', () => {
      expect('tokenizeTag' in docxHelpers).toBe(false);
      expect('parseHelperArg' in docxHelpers).toBe(false);
    });
  });

  describe('Tag Tokenization', () => {
    describe('tokenizeTag', () => {
      it('should split on whitespace', () => {
        expect(tokenizeTag('upper name')).toEqual(['upper', 'name']);
        expect(tokenizeTag('  formatDate  dob  ')).toEqual(['formatDate', 'dob']);
      });

      it('should keep double-quoted segments intact', () => {
        expect(tokenizeTag('formatDate dob "MMMM DD, YYYY"')).toEqual([
          'formatDate',
          'dob',
          '"MMMM DD, YYYY"',
        ]);
      });

      it('should keep single-quoted segments intact', () => {
        expect(tokenizeTag("defaultValue company 'N/A or unknown'")).toEqual([
          'defaultValue',
          'company',
          "'N/A or unknown'",
        ]);
      });

      it('should handle multiple quoted arguments', () => {
        expect(tokenizeTag('replace text "old value" "new value"')).toEqual([
          'replace',
          'text',
          '"old value"',
          '"new value"',
        ]);
      });

      it('should handle empty input', () => {
        expect(tokenizeTag('')).toEqual([]);
        expect(tokenizeTag('   ')).toEqual([]);
      });
    });

    describe('parseHelperArg', () => {
      it('should unwrap quoted strings', () => {
        expect(parseHelperArg('"USD"')).toBe('USD');
        expect(parseHelperArg("'N/A'")).toBe('N/A');
        expect(parseHelperArg('"MMMM DD, YYYY"')).toBe('MMMM DD, YYYY');
      });

      it('should coerce numbers', () => {
        expect(parseHelperArg('20')).toBe(20);
        expect(parseHelperArg('-3.5')).toBe(-3.5);
      });

      it('should coerce booleans', () => {
        expect(parseHelperArg('true')).toBe(true);
        expect(parseHelperArg('false')).toBe(false);
      });

      it('should pass through bare words', () => {
        expect(parseHelperArg('USD')).toBe('USD');
        expect(parseHelperArg('MM/DD/YYYY')).toBe('MM/DD/YYYY');
      });
    });

    describe('resolveHelperArg', () => {
      const scope = {
        quantity: 4,
        client: { name: 'Acme' },
        USD: 'should not shadow quoted literals',
      };

      it('should resolve bare words that match scope variables', () => {
        expect(resolveHelperArg(scope, 'quantity')).toBe(4);
      });

      it('should resolve dot paths from scope', () => {
        expect(resolveHelperArg(scope, 'client.name')).toBe('Acme');
      });

      it('should keep quoted tokens as literals even when scope has the key', () => {
        expect(resolveHelperArg(scope, '"USD"')).toBe('USD');
      });

      it('should keep numbers and booleans as literals', () => {
        expect(resolveHelperArg(scope, '2')).toBe(2);
        expect(resolveHelperArg(scope, 'false')).toBe(false);
      });

      it('should fall back to the literal string for unknown words', () => {
        expect(resolveHelperArg(scope, 'MM/DD/YYYY')).toBe('MM/DD/YYYY');
        expect(resolveHelperArg(scope, 'EUR')).toBe('EUR');
      });
    });
  });
});
