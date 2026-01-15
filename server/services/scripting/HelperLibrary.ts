/**
 * Helper Library for Custom Scripting System
 * Provides safe utility functions available in script sandbox
 */

import {
  addDays,
  addHours,
  addMinutes,
  addSeconds,
  addMonths,
  addYears,
  subDays,
  subHours,
  subMinutes,
  subSeconds,
  subMonths,
  subYears,
  differenceInDays,
  differenceInHours,
  differenceInMinutes,
  differenceInSeconds,
  differenceInMonths,
  differenceInYears,
  format as formatDate,
  parseISO,
  parse as parseDateFns,
} from "date-fns";

import type { HelperLibraryAPI } from "@shared/types/scripting";

// ===================================================================
// CONSOLE CAPTURE
// ===================================================================

/**
 * Create console helpers that capture output
 */
export function createConsoleHelpers(): {
  helpers: { log: (...args: any[]) => void; warn: (...args: any[]) => void; error: (...args: any[]) => void };
  getLogs: () => any[][];
} {
  const logs: any[][] = [];

  return {
    helpers: {
      log: (...args: any[]) => {
        logs.push(args);
      },
      warn: (...args: any[]) => {
        logs.push(["[WARN]", ...args]);
      },
      error: (...args: any[]) => {
        logs.push(["[ERROR]", ...args]);
      },
    },
    getLogs: () => logs,
  };
}

// ===================================================================
// DATE HELPERS
// ===================================================================

const dateHelpers = {
  now: (): string => {
    return new Date().toISOString();
  },

  add: (date: string, value: number, unit: "days" | "hours" | "minutes" | "seconds" | "months" | "years"): string => {
    try {
      const parsedDate = parseISO(date);
      let result: Date;

      switch (unit) {
        case "days":
          result = addDays(parsedDate, value);
          break;
        case "hours":
          result = addHours(parsedDate, value);
          break;
        case "minutes":
          result = addMinutes(parsedDate, value);
          break;
        case "seconds":
          result = addSeconds(parsedDate, value);
          break;
        case "months":
          result = addMonths(parsedDate, value);
          break;
        case "years":
          result = addYears(parsedDate, value);
          break;
        default:
          throw new Error(`Unknown unit: ${unit}`);
      }

      return result.toISOString();
    } catch (error) {
      return "Invalid Date";
    }
  },

  subtract: (date: string, value: number, unit: "days" | "hours" | "minutes" | "seconds" | "months" | "years"): string => {
    try {
      const parsedDate = parseISO(date);
      let result: Date;

      switch (unit) {
        case "days":
          result = subDays(parsedDate, value);
          break;
        case "hours":
          result = subHours(parsedDate, value);
          break;
        case "minutes":
          result = subMinutes(parsedDate, value);
          break;
        case "seconds":
          result = subSeconds(parsedDate, value);
          break;
        case "months":
          result = subMonths(parsedDate, value);
          break;
        case "years":
          result = subYears(parsedDate, value);
          break;
        default:
          throw new Error(`Unknown unit: ${unit}`);
      }

      return result.toISOString();
    } catch (error) {
      return "Invalid Date";
    }
  },

  format: (date: string, formatString: string): string => {
    try {
      const parsedDate = parseISO(date);
      return formatDate(parsedDate, formatString);
    } catch (error) {
      return "Invalid Date";
    }
  },

  parse: (dateString: string, formatString?: string): string => {
    try {
      if (formatString) {
        // Use date-fns parse with format string
        // Use UTC midnight as reference date to avoid timezone issues
        const referenceDate = new Date(Date.UTC(2000, 0, 1));
        const parsed = parseDateFns(dateString, formatString, referenceDate);

        // Convert to UTC by manually constructing ISO string
        const year = parsed.getFullYear();
        const month = String(parsed.getMonth() + 1).padStart(2, '0');
        const day = String(parsed.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}T00:00:00.000Z`;
      } else {
        // Fallback to native Date parsing
        return new Date(dateString).toISOString();
      }
    } catch (error) {
      return "Invalid Date";
    }
  },

  diff: (date1: string, date2: string, unit: "days" | "hours" | "minutes" | "seconds" | "months" | "years"): number => {
    try {
      const parsed1 = parseISO(date1);
      const parsed2 = parseISO(date2);

      // Return absolute difference (always positive)
      let result: number;
      switch (unit) {
        case "days":
          result = differenceInDays(parsed2, parsed1);
          break;
        case "hours":
          result = differenceInHours(parsed2, parsed1);
          break;
        case "minutes":
          result = differenceInMinutes(parsed2, parsed1);
          break;
        case "seconds":
          result = differenceInSeconds(parsed2, parsed1);
          break;
        case "months":
          result = differenceInMonths(parsed2, parsed1);
          break;
        case "years":
          result = differenceInYears(parsed2, parsed1);
          break;
        default:
          throw new Error(`Unknown unit: ${unit}`);
      }
      return result;
    } catch (error) {
      return 0;
    }
  },
};

// ===================================================================
// STRING HELPERS
// ===================================================================

const stringHelpers = {
  upper: (str: string): string => (str ? str.toUpperCase() : ""),

  lower: (str: string): string => str.toLowerCase(),

  trim: (str: string): string => str.trim(),

  replace: (str: string, search: string | RegExp, replacement: string): string => {
    // Replace all occurrences by default
    if (typeof search === 'string') {
      return str.replaceAll(search, replacement);
    } else {
      // For RegExp, use global flag
      return str.replace(search, replacement);
    }
  },

  split: (str: string, separator: string): string[] => {
    return str.split(separator);
  },

  join: (arr: string[], separator: string): string => {
    return arr.join(separator);
  },

  slug: (str: string): string => {
    return str
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
  },

  capitalize: (str: string): string => {
    if (!str) { return str; }
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  },

  truncate: (str: string, length: number): string => {
    if (str.length <= length) { return str; }
    return `${str.slice(0, length)}...`;
  },
};

// ===================================================================
// NUMBER HELPERS
// ===================================================================

const numberHelpers = {
  round: (num: number, decimals: number = 0): number => {
    if (typeof num !== 'number' || isNaN(num)) { return NaN; }
    return Number(num.toFixed(decimals));
  },

  ceil: (num: number): number => {
    return Math.ceil(num);
  },

  floor: (num: number): number => {
    return Math.floor(num);
  },

  abs: (num: number): number => {
    return Math.abs(num);
  },

  clamp: (num: number, min: number, max: number): number => {
    return Math.max(min, Math.min(max, num));
  },

  formatCurrency: (num: number, currency: string = "USD"): string => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(num);
  },

  currency: (num: number, currency: string = "USD"): string => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(num);
  },

  percent: (num: number, decimals: number = 2): string => {
    const percentage = num * 100;
    return `${percentage.toFixed(decimals)}%`;
  },
};

// ===================================================================
// ARRAY HELPERS
// ===================================================================

const arrayHelpers = {
  unique: (arr: any[]): any[] => {
    return [...new Set(arr)];
  },

  flatten: (arr: any[]): any[] => {
    return arr.flat(Infinity);
  },

  chunk: (arr: any[], size: number): any[][] => {
    const chunks: any[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  },

  sortBy: (arr: any[], key: string): any[] => {
    return [...arr].sort((a, b) => {
      const aVal = a[key];
      const bVal = b[key];
      if (aVal < bVal) { return -1; }
      if (aVal > bVal) { return 1; }
      return 0;
    });
  },

  filter: (arr: any[], predicate: (item: any, index: number) => boolean): any[] => {
    return arr.filter(predicate);
  },

  map: (arr: any[], mapper: (item: any, index: number) => any): any[] => {
    return arr.map(mapper);
  },
};

// ===================================================================
// OBJECT HELPERS
// ===================================================================

const objectHelpers = {
  keys: (obj: Record<string, any>): string[] => {
    return Object.keys(obj);
  },

  values: (obj: Record<string, any>): any[] => {
    return Object.values(obj);
  },

  pick: (obj: Record<string, any>, keys: string[]): Record<string, any> => {
    const result: Record<string, any> = {};
    for (const key of keys) {
      if (key in obj) {
        result[key] = obj[key];
      }
    }
    return result;
  },

  omit: (obj: Record<string, any>, keys: string[]): Record<string, any> => {
    const result = { ...obj };
    for (const key of keys) {
      delete result[key];
    }
    return result;
  },

  merge: (...objects: Record<string, any>[]): Record<string, any> => {
    return Object.assign({}, ...objects);
  },
};

// ===================================================================
// MATH HELPERS
// ===================================================================

const mathHelpers = {
  random: (min: number = 0, max: number = 1): number => {
    return Math.random() * (max - min) + min;
  },

  randomInt: (min: number, max: number): number => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  sum: (arr: number[]): number => {
    return arr.reduce((a, b) => a + b, 0);
  },

  avg: (arr: number[]): number => {
    if (arr.length === 0) { return 0; }
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  },

  min: (arr: number[]): number => {
    return Math.min(...arr);
  },

  max: (arr: number[]): number => {
    return Math.max(...arr);
  },
};

// ===================================================================
// HTTP HELPERS (Proxied through backend)
// ===================================================================

const httpHelpers = {
  get: async (_url: string, _options?: { headers?: Record<string, string> }): Promise<any> => {
    // This will be implemented with actual fetch logic
    // For now, throw error - will be replaced with proxied fetch
    throw new Error("http.get is not yet implemented in sandbox. Use backend proxy.");
  },

  post: async (_url: string, _body: any, _options?: { headers?: Record<string, string> }): Promise<any> => {
    // This will be implemented with actual fetch logic
    // For now, throw error - will be replaced with proxied fetch
    throw new Error("http.post is not yet implemented in sandbox. Use backend proxy.");
  },
};

// ===================================================================
// HELPER LIBRARY FACTORY
// ===================================================================

/**
 * Create a complete helper library instance with optional console capture
 */
export function createHelperLibrary(options?: {
  consoleEnabled?: boolean;
}): {
  helpers: HelperLibraryAPI;
  getConsoleLogs?: () => any[][];
} {
  const { consoleEnabled = false } = options || {};

  let consoleHelpers: ReturnType<typeof createConsoleHelpers> | undefined;

  if (consoleEnabled) {
    consoleHelpers = createConsoleHelpers();
  }

  const helpers: HelperLibraryAPI = {
    date: dateHelpers,
    string: stringHelpers,
    number: numberHelpers,
    array: arrayHelpers,
    object: objectHelpers,
    math: mathHelpers,
    http: httpHelpers,
    console: consoleHelpers?.helpers || {
      log: () => { },
      warn: () => { },
      error: () => { },
    },
  };

  return {
    helpers,
    getConsoleLogs: consoleHelpers?.getLogs,
  };
}

/**
 * Export individual helper groups for testing
 */
export { dateHelpers, stringHelpers, numberHelpers, arrayHelpers, objectHelpers, mathHelpers };

/**
 * Default helper library instance (without console capture)
 */
export const helperLibrary: HelperLibraryAPI = createHelperLibrary().helpers;

/**
 * Helper library for Python scripts (serialized as JSON)
 * Python scripts receive this as a dict with limited functionality
 */
export function getPythonHelpers(): Record<string, any> {
  return {
    // Python can only use non-async helpers
    // We serialize these as simple functions that can be called from Python
    date: {
      now: "import datetime; datetime.datetime.now().isoformat()",
      // Other date functions would need to be implemented in Python
    },
    string: {
      upper: "str.upper",
      lower: "str.lower",
      trim: "str.strip",
    },
    number: {
      round: "round",
      ceil: "math.ceil",
      floor: "math.floor",
      abs: "abs",
    },
    array: {
      unique: "list(set(arr))",
      flatten: "[item for sublist in arr for item in sublist]",
    },
    math: {
      sum: "sum",
      min: "min",
      max: "max",
    },
  };
}
