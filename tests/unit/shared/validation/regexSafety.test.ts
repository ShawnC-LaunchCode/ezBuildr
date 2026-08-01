import { describe, expect, it } from "vitest";

import {
  analyzeRegexSafety,
  safeRegexTest,
  MAX_PATTERN_LENGTH,
  MAX_PATTERN_INPUT_LENGTH,
} from "../../../../shared/validation/regexSafety";

describe("regex safety guard (RUN2-16)", () => {
  describe("analyzeRegexSafety", () => {
    it("accepts an ordinary pattern", () => {
      expect(analyzeRegexSafety("^[A-Z]{3}-\\d{4}$").safe).toBe(true);
    });

    it("accepts a quantified group that contains no inner quantifier", () => {
      expect(analyzeRegexSafety("(abc)+").safe).toBe(true);
    });

    it("refuses a nested quantifier", () => {
      const result = analyzeRegexSafety("(a+)+$");
      expect(result.safe).toBe(false);
      expect(result.reason).toMatch(/backtrack/i);
    });

    it.each(["(a*)*", "(a+)*", "(\\d+)+$", "^(\\w+\\s?)*$"])(
      "refuses the catastrophic pattern %s",
      (pattern) => {
        expect(analyzeRegexSafety(pattern).safe).toBe(false);
      }
    );

    it("treats quantifier characters inside a character class as literal", () => {
      // [+*] is a literal class, not a quantifier — this pattern is safe.
      expect(analyzeRegexSafety("([+*]b)+").safe).toBe(true);
    });

    it("ignores escaped quantifier characters", () => {
      expect(analyzeRegexSafety("(a\\+b)+").safe).toBe(true);
    });

    it("refuses a pattern over the length cap", () => {
      const result = analyzeRegexSafety("a".repeat(MAX_PATTERN_LENGTH + 1));
      expect(result.safe).toBe(false);
      expect(result.reason).toMatch(/exceeds/);
    });

    it("refuses a pattern that is not a valid regular expression", () => {
      const result = analyzeRegexSafety("([unclosed");
      expect(result.safe).toBe(false);
      expect(result.reason).toMatch(/not a valid/);
    });
  });

  describe("safeRegexTest", () => {
    it("matches a valid value", () => {
      expect(safeRegexTest("^\\d{3}$", "123")).toEqual({ matched: true, skipped: false });
    });

    it("reports a non-match without skipping", () => {
      expect(safeRegexTest("^\\d{3}$", "abc")).toEqual({ matched: false, skipped: false });
    });

    it("skips rather than runs a catastrophic pattern, and returns fast", () => {
      // The classic ReDoS pair: (a+)+$ against a long non-matching input would
      // backtrack exponentially if it were ever compiled and run.
      const evil = `${"a".repeat(40)}b`;
      const started = Date.now();
      const result = safeRegexTest("(a+)+$", evil);
      const elapsed = Date.now() - started;

      expect(result.skipped).toBe(true);
      expect(result.matched).toBe(false);
      expect(elapsed).toBeLessThan(100);
    });

    it("skips an input over the length cap", () => {
      const result = safeRegexTest("^a+$", "a".repeat(MAX_PATTERN_INPUT_LENGTH + 1));
      expect(result.skipped).toBe(true);
      expect(result.reason).toMatch(/input exceeds/);
    });
  });
});
