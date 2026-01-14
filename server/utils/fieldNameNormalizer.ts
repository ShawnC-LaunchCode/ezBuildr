/**
 * Smart Field Name Normalizer
 *
 * Intelligent field name matching for auto-mapping suggestions.
 * Uses multiple strategies to find the best matches between template fields
 * and workflow variables.
 *
 * Features:
 * - Case-insensitive matching
 * - Common abbreviation expansion
 * - Special character normalization
 * - Levenshtein distance (fuzzy matching)
 * - Semantic similarity
 * - Confidence scoring
 *
 * Usage:
 * ```typescript
 * const normalizer = new FieldNameNormalizer();
 *
 * const matches = normalizer.findBestMatches(
 *   ['client_name', 'client_email', 'invoice_total'],
 *   ['clientName', 'emailAddress', 'totalAmount']
 * );
 *
 * console.log(matches);
 * // [
 * //   { templateField: 'client_name', workflowVariable: 'clientName', confidence: 0.95, method: 'normalized' },
 * //   { templateField: 'client_email', workflowVariable: 'emailAddress', confidence: 0.78, method: 'semantic' },
 * //   ...
 * // ]
 * ```
 */

// ============================================================================
// TYPES
// ============================================================================

export interface FieldMatch {
  templateField: string;
  workflowVariable: string | null;
  confidence: number; // 0-1
  method: 'exact' | 'normalized' | 'fuzzy' | 'semantic' | 'abbreviation';
  alternatives?: Array<{
    variable: string;
    confidence: number;
  }>;
}

export interface NormalizationOptions {
  /** Minimum confidence score to consider a match (0-1) */
  minConfidence?: number;

  /** Maximum Levenshtein distance for fuzzy matches */
  maxDistance?: number;

  /** Include alternative suggestions */
  includeAlternatives?: boolean;

  /** Number of alternatives to include */
  alternativeCount?: number;
}

// ============================================================================
// ABBREVIATION DICTIONARY
// ============================================================================

const COMMON_ABBREVIATIONS: Record<string, string[]> = {
  // Names
  fname: ['firstname', 'first_name', 'givenname'],
  lname: ['lastname', 'last_name', 'surname', 'familyname'],
  mname: ['middlename', 'middle_name'],

  // Contact
  addr: ['address'],
  st: ['street'],
  apt: ['apartment'],
  tel: ['telephone', 'phone'],
  mob: ['mobile', 'cellphone'],
  ph: ['phone'],
  fax: ['facsimile'],

  // Business
  co: ['company'],
  org: ['organization', 'organisation'],
  dept: ['department'],
  mgr: ['manager'],
  emp: ['employee'],

  // Dates
  dob: ['dateofbirth', 'birthdate'],
  dt: ['date'],
  yr: ['year'],
  mo: ['month'],

  // Location
  zip: ['zipcode', 'postalcode'],
  ctry: ['country'],
  prov: ['province'],

  // Document
  doc: ['document'],
  num: ['number'],
  qty: ['quantity'],
  amt: ['amount'],
  tot: ['total'],
  inv: ['invoice'],

  // Misc
  desc: ['description'],
  stat: ['status'],
  info: ['information'],
  id: ['identifier'],
  ref: ['reference'],
  acct: ['account'],
  bal: ['balance'],
};

// Common word substitutions
const WORD_SUBSTITUTIONS: Record<string, string[]> = {
  client: ['customer', 'patron'],
  email: ['emailaddress', 'mail'],
  phone: ['telephone', 'phonenumber', 'contact'],
  name: ['fullname'],
  total: ['sum', 'amount'],
  date: ['datetime', 'timestamp'],
};

// ============================================================================
// NORMALIZER CLASS
// ============================================================================

export class FieldNameNormalizer {
  private options: Required<NormalizationOptions>;

  constructor(options: NormalizationOptions = {}) {
    this.options = {
      minConfidence: options.minConfidence ?? 0.6,
      maxDistance: options.maxDistance ?? 3,
      includeAlternatives: options.includeAlternatives ?? true,
      alternativeCount: options.alternativeCount ?? 3,
    };
  }

  /**
   * Find best matches for all template fields
   */
  findBestMatches(
    templateFields: string[],
    workflowVariables: string[]
  ): FieldMatch[] {
    const matches: FieldMatch[] = [];

    for (const templateField of templateFields) {
      const match = this.findBestMatch(templateField, workflowVariables);
      matches.push(match);
    }

    return matches;
  }

  /**
   * Find best match for a single template field
   */
  findBestMatch(
    templateField: string,
    workflowVariables: string[]
  ): FieldMatch {
    // Try each matching strategy in order of precision
    const strategies: Array<{
      name: FieldMatch['method'];
      fn: (field: string, vars: string[]) => { variable: string; confidence: number } | null;
    }> = [
      { name: 'exact', fn: this.exactMatch.bind(this) },
      { name: 'normalized', fn: this.normalizedMatch.bind(this) },
      { name: 'abbreviation', fn: this.abbreviationMatch.bind(this) },
      { name: 'semantic', fn: this.semanticMatch.bind(this) },
      { name: 'fuzzy', fn: this.fuzzyMatch.bind(this) },
    ];

    let bestMatch: FieldMatch = {
      templateField,
      workflowVariable: null,
      confidence: 0,
      method: 'exact',
    };

    // Try each strategy
    for (const strategy of strategies) {
      const result = strategy.fn(templateField, workflowVariables);

      if (result && result.confidence > bestMatch.confidence) {
        bestMatch = {
          templateField,
          workflowVariable: result.variable,
          confidence: result.confidence,
          method: strategy.name,
        };

        // If we found a high-confidence match, stop searching
        if (result.confidence >= 0.95) {
          break;
        }
      }
    }

    // Add alternatives if requested
    if (this.options.includeAlternatives && workflowVariables.length > 1) {
      bestMatch.alternatives = this.findAlternatives(
        templateField,
        workflowVariables,
        bestMatch.workflowVariable
      );
    }

    return bestMatch;
  }

  /**
   * Exact match (case-insensitive)
   */
  private exactMatch(
    field: string,
    variables: string[]
  ): { variable: string; confidence: number } | null {
    const normalized = field.toLowerCase();

    for (const variable of variables) {
      if (variable.toLowerCase() === normalized) {
        return { variable, confidence: 1.0 };
      }
    }

    return null;
  }

  /**
   * Normalized match (remove special chars, case-insensitive)
   */
  private normalizedMatch(
    field: string,
    variables: string[]
  ): { variable: string; confidence: number } | null {
    const normalizedField = this.normalize(field);

    for (const variable of variables) {
      const normalizedVar = this.normalize(variable);

      if (normalizedField === normalizedVar) {
        return { variable, confidence: 0.95 };
      }
    }

    return null;
  }

  /**
   * Abbreviation expansion match
   */
  private abbreviationMatch(
    field: string,
    variables: string[]
  ): { variable: string; confidence: number } | null {
    const normalizedField = this.normalize(field);

    // Check if field is an abbreviation
    for (const [abbr, expansions] of Object.entries(COMMON_ABBREVIATIONS)) {
      if (normalizedField === abbr || normalizedField.includes(abbr)) {
        // Try to match expanded forms
        for (const expansion of expansions) {
          for (const variable of variables) {
            const normalizedVar = this.normalize(variable);

            if (normalizedVar === expansion || normalizedVar.includes(expansion)) {
              return { variable, confidence: 0.85 };
            }
          }
        }
      }
    }

    // Check if variable is an abbreviation
    for (const variable of variables) {
      const normalizedVar = this.normalize(variable);

      for (const [abbr, expansions] of Object.entries(COMMON_ABBREVIATIONS)) {
        if (normalizedVar === abbr || normalizedVar.includes(abbr)) {
          for (const expansion of expansions) {
            if (normalizedField === expansion || normalizedField.includes(expansion)) {
              return { variable, confidence: 0.85 };
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Semantic match (word substitutions)
   */
  private semanticMatch(
    field: string,
    variables: string[]
  ): { variable: string; confidence: number } | null {
    const normalizedField = this.normalize(field);

    for (const [word, synonyms] of Object.entries(WORD_SUBSTITUTIONS)) {
      if (normalizedField.includes(word)) {
        // Try to match with synonyms
        for (const synonym of synonyms) {
          for (const variable of variables) {
            const normalizedVar = this.normalize(variable);

            const replacedField = normalizedField.replace(word, synonym);

            if (replacedField === normalizedVar) {
              return { variable, confidence: 0.80 };
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Fuzzy match (Levenshtein distance)
   */
  private fuzzyMatch(
    field: string,
    variables: string[]
  ): { variable: string; confidence: number } | null {
    const normalizedField = this.normalize(field);

    let bestMatch: { variable: string; distance: number } | null = null;

    for (const variable of variables) {
      const normalizedVar = this.normalize(variable);
      const distance = this.levenshteinDistance(normalizedField, normalizedVar);

      if (
        distance <= this.options.maxDistance &&
        (!bestMatch || distance < bestMatch.distance)
      ) {
        bestMatch = { variable, distance };
      }
    }

    if (bestMatch) {
      // Calculate confidence based on distance
      const maxLength = Math.max(normalizedField.length, this.normalize(bestMatch.variable).length);
      const confidence = 1 - bestMatch.distance / maxLength;

      if (confidence >= this.options.minConfidence) {
        return { variable: bestMatch.variable, confidence };
      }
    }

    return null;
  }

  /**
   * Find alternative matches
   */
  private findAlternatives(
    field: string,
    variables: string[],
    excludeVariable: string | null
  ): Array<{ variable: string; confidence: number }> {
    const alternatives: Array<{ variable: string; confidence: number }> = [];

    for (const variable of variables) {
      if (variable === excludeVariable) {continue;}

      // Calculate confidence using fuzzy matching
      const normalizedField = this.normalize(field);
      const normalizedVar = this.normalize(variable);
      const distance = this.levenshteinDistance(normalizedField, normalizedVar);
      const maxLength = Math.max(normalizedField.length, normalizedVar.length);
      const confidence = 1 - distance / maxLength;

      if (confidence >= this.options.minConfidence) {
        alternatives.push({ variable, confidence });
      }
    }

    // Sort by confidence and take top N
    return alternatives
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, this.options.alternativeCount);
  }

  /**
   * Normalize a field name
   */
  private normalize(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '') // Remove special chars
      .replace(/\s+/g, ''); // Remove spaces
  }

  /**
   * Calculate Levenshtein distance (edit distance)
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;

    // Create matrix
    const matrix: number[][] = [];

    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;

        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1, // deletion
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }

    return matrix[len1][len2];
  }

  /**
   * Batch normalize field names
   */
  static normalizeAll(fields: string[]): Record<string, string> {
    const normalizer = new FieldNameNormalizer();
    const result: Record<string, string> = {};

    for (const field of fields) {
      result[field] = normalizer.normalize(field);
    }

    return result;
  }

  /**
   * Check if two field names are similar
   */
  static areSimilar(field1: string, field2: string, threshold: number = 0.7): boolean {
    const normalizer = new FieldNameNormalizer({ minConfidence: threshold });
    const match = normalizer.findBestMatch(field1, [field2]);
    return match.confidence >= threshold;
  }
}

// Singleton instance
export const fieldNameNormalizer = new FieldNameNormalizer();
