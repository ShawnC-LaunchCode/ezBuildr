/**
 * JSON Path Selector Utility
 * Minimal JSONPath-like selector for extracting values from JSON responses
 *
 * Supported syntax:
 * - Root: $ or @
 * - Dot notation: $.user.name
 * - Bracket notation: $['user']['name']
 * - Array index: $.items[0]
 * - Nested: $.users[0].profile.email
 *
 * Not supported (for MVP):
 * - Wildcards: $.*
 * - Recursive descent: $..name
 * - Filters: $[?(@.price < 10)]
 * - Slices: $[0:5]
 */

/**
 * Select a value from a JSON object using a path selector
 *
 * @param obj The object to select from
 * @param selector The selector path (e.g., '$.user.name', '$.items[0].id')
 * @returns The selected value, or undefined if not found
 */
export function select(obj: unknown, selector: string): unknown {
  if (!obj || typeof obj !== 'object') {
    return undefined;
  }

  // Normalize selector
  const normalized = normalizeSelector(selector);
  if (!normalized) {
    return undefined;
  }

  // Parse into path parts
  const parts = parseSelector(normalized);

  // Traverse the object
  return traverse(obj, parts);
}

/**
 * Normalize a selector string
 * Converts various formats to a consistent format
 */
function normalizeSelector(selector: string): string | null {
  if (!selector || typeof selector !== 'string') {
    return null;
  }

  let s = selector.trim();

  // Remove leading $ or @
  if (s.startsWith('$') || s.startsWith('@')) {
    s = s.substring(1);
  }

  // Remove leading dot if present
  if (s.startsWith('.')) {
    s = s.substring(1);
  }

  return s;
}

/**
 * Parse a selector into path parts
 * Example: "user.profile['email']" -> ['user', 'profile', 'email']
 * Example: "items[0].name" -> ['items', '0', 'name']
 */
// eslint-disable-next-line sonarjs/cognitive-complexity
function parseSelector(selector: string): string[] {
  if (!selector) {
    return [];
  }

  const parts: string[] = [];
  let current = '';
  let inBracket = false;
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < selector.length; i++) {
    const char = selector[i];

    if (char === '[' && !inQuote) {
      // Start of bracket notation
      if (current) {
        parts.push(current);
        current = '';
      }
      inBracket = true;
    } else if (char === ']' && !inQuote) {
      // End of bracket notation
      if (current) {
        parts.push(current);
        current = '';
      }
      inBracket = false;
    } else if ((char === '"' || char === "'") && inBracket) {
      // Quote inside bracket
      if (!inQuote) {
        inQuote = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuote = false;
        quoteChar = '';
      }
    } else if (char === '.' && !inBracket && !inQuote) {
      // Dot separator
      if (current) {
        parts.push(current);
        current = '';
      }
    } else {
      // Regular character
      current += char;
    }
  }

  // Add final part
  if (current) {
    parts.push(current);
  }

  return parts;
}

/**
 * Traverse an object following a path
 */
function traverse(obj: unknown, parts: string[]): unknown {
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }

    // Handle array index
    if (/^\d+$/.test(part)) {
      const index = parseInt(part, 10);
      if (Array.isArray(current)) {
        current = current[index];
      } else {
        return undefined;
      }
    } else {
      // Handle object property
      if (typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
  }

  return current;
}

/**
 * Validate a selector syntax
 * Returns true if the selector is valid, false otherwise
 */
export function validateSelector(selector: string): { valid: boolean; error?: string } {
  if (!selector || typeof selector !== 'string') {
    return { valid: false, error: 'Selector must be a non-empty string' };
  }

  try {
    const normalized = normalizeSelector(selector);
    if (normalized === null) {
      return { valid: false, error: 'Invalid selector format' };
    }

    const parts = parseSelector(normalized);
    if (parts.length === 0 && normalized.length > 0) {
      return { valid: false, error: 'Failed to parse selector' };
    }

    // Check for unclosed brackets
    const openBrackets = (normalized.match(/\[/g) ?? []).length;
    const closeBrackets = (normalized.match(/\]/g) ?? []).length;
    if (openBrackets !== closeBrackets) {
      return { valid: false, error: 'Unclosed brackets in selector' };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: (error as Error).message };
  }
}

/**
 * Test a selector against a sample object
 * Useful for debugging and validation
 */
export function testSelector(obj: unknown, selector: string): {
  success: boolean;
  value?: unknown;
  error?: string;
} {
  try {
    const validation = validateSelector(selector);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const value = select(obj, selector);
    return { success: true, value };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Select multiple values using multiple selectors
 * Returns an object with selector results
 */

export function selectMultiple(
  obj: unknown,
  selectors: Record<string, string>
): Record<string, unknown> {
  const results: Record<string, unknown> = {};

  for (const [key, selector] of Object.entries(selectors)) {
    results[key] = select(obj, selector);
  }

  return results;
}
