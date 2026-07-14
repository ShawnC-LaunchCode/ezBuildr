export const ALIAS_MAX_LENGTH = 60;

/**
 * Derive a camelCase variable name from a question label.
 * "What is your first name?" -> "whatIsYourFirstName"
 * Returns null when the label has no usable characters.
 */
export function generateAliasFromLabel(label: string): string | null {
  const words = label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return null;
  }

  const camel =
    words[0] + words.slice(1).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("");
  const alias = /^[0-9]/.test(camel) ? `_${camel}` : camel;
  return alias.slice(0, ALIAS_MAX_LENGTH);
}

export function generateUniqueAliasFromTaken(label: string, taken: Set<string>): string | null {
  const base = generateAliasFromLabel(label);
  if (base === null) {
    return null;
  }

  if (!taken.has(base.toLowerCase())) {
    return base;
  }

  for (let i = 2; i < 100; i++) {
    const suffix = String(i);
    const trimmedBase = base.slice(0, ALIAS_MAX_LENGTH - suffix.length);
    const candidate = `${trimmedBase}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  return null;
}
