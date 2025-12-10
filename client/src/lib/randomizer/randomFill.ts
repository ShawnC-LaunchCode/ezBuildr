/**
 * Random Data Generator for Preview Mode
 *
 * Generates valid, deterministic random data for all block types.
 * Used for testing workflows without manual data entry.
 *
 * Features:
 * - Supports all block types (text, boolean, choice, numeric, datetime, etc.)
 * - Respects validation rules (min/max, required fields, formats)
 * - Deterministic and reproducible
 * - Safe fallbacks for all edge cases
 *
 * @version 1.0.0
 * @date December 2025
 */

import type { ApiStep } from '@/lib/vault-api';
import type {
  ChoiceAdvancedConfig,
  MultiFieldConfig,
  AddressConfig,
  ScaleConfig,
  NumberConfig,
  CurrencyConfig,
  PhoneConfig,
  EmailConfig,
  DateConfig,
  TimeConfig,
  DateTimeConfig,
  BooleanAdvancedConfig,
} from '@/../../shared/types/stepConfigs';

// ============================================================================
// RANDOM DATA GENERATORS
// ============================================================================

/**
 * Generate random short text (5-20 chars)
 */
function randomShortText(): string {
  const words = [
    'apple', 'banana', 'cherry', 'dragon', 'elephant',
    'falcon', 'guitar', 'horizon', 'ignite', 'jungle',
    'kitten', 'lemon', 'mountain', 'nebula', 'ocean',
    'piano', 'quartz', 'rainbow', 'sunset', 'thunder',
  ];

  const count = Math.floor(Math.random() * 3) + 1; // 1-3 words
  const selected = [];

  for (let i = 0; i < count; i++) {
    selected.push(words[Math.floor(Math.random() * words.length)]);
  }

  return selected.join(' ');
}

/**
 * Generate random long text (30-200 chars)
 */
function randomLongText(): string {
  const sentences = [
    'This is a sample paragraph for testing purposes.',
    'The quick brown fox jumps over the lazy dog.',
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    'Software development requires careful planning and execution.',
    'Data validation is crucial for maintaining system integrity.',
  ];

  const count = Math.floor(Math.random() * 3) + 1; // 1-3 sentences
  const selected = [];

  for (let i = 0; i < count; i++) {
    selected.push(sentences[Math.floor(Math.random() * sentences.length)]);
  }

  return selected.join(' ');
}

/**
 * Generate random email address
 */
function randomEmail(): string {
  const firstNames = ['alice', 'bob', 'charlie', 'diana', 'edward', 'fiona'];
  const lastNames = ['smith', 'jones', 'brown', 'wilson', 'taylor', 'anderson'];
  const domains = ['example.com', 'test.com', 'demo.org', 'sample.net'];

  const first = firstNames[Math.floor(Math.random() * firstNames.length)];
  const last = lastNames[Math.floor(Math.random() * lastNames.length)];
  const domain = domains[Math.floor(Math.random() * domains.length)];

  return `${first}.${last}@${domain}`;
}

/**
 * Generate random phone number (US format)
 */
function randomPhone(): string {
  const areaCode = Math.floor(Math.random() * 900) + 100; // 100-999
  const exchange = Math.floor(Math.random() * 900) + 100; // 100-999
  const line = Math.floor(Math.random() * 9000) + 1000;  // 1000-9999

  return `(${areaCode}) ${exchange}-${line}`;
}

/**
 * Generate random website URL
 */
function randomWebsite(): string {
  const domains = ['example', 'test', 'demo', 'sample', 'prototype', 'mockup'];
  const tlds = ['com', 'org', 'net', 'io'];

  const domain = domains[Math.floor(Math.random() * domains.length)];
  const tld = tlds[Math.floor(Math.random() * tlds.length)];

  return `https://www.${domain}.${tld}`;
}

/**
 * Generate random date (last 10 years)
 */
function randomDate(): string {
  const now = new Date();
  const tenYearsAgo = new Date(now);
  tenYearsAgo.setFullYear(now.getFullYear() - 10);

  const timestamp = tenYearsAgo.getTime() +
    Math.random() * (now.getTime() - tenYearsAgo.getTime());

  const date = new Date(timestamp);
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

/**
 * Generate random time (08:00 - 18:00)
 */
function randomTime(): string {
  const hour = Math.floor(Math.random() * 11) + 8; // 8-18
  const minute = Math.floor(Math.random() * 4) * 15; // 0, 15, 30, 45

  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

/**
 * Generate random datetime (ISO format)
 */
function randomDateTime(): string {
  const date = randomDate();
  const time = randomTime();

  return `${date}T${time}:00.000Z`;
}

/**
 * Generate random number within range
 */
function randomNumber(min: number = 0, max: number = 9999, step: number = 1): number {
  const range = max - min;
  const steps = Math.floor(range / step);
  const randomSteps = Math.floor(Math.random() * (steps + 1));

  return min + (randomSteps * step);
}

/**
 * Generate random currency amount
 */
function randomCurrency(min: number = 0, max: number = 10000, allowDecimal: boolean = true): number {
  const value = randomNumber(min, max, 1);

  if (allowDecimal) {
    const cents = Math.floor(Math.random() * 100);
    return parseFloat(`${value}.${cents.toString().padStart(2, '0')}`);
  }

  return value;
}

/**
 * Generate random boolean
 */
function randomBoolean(): boolean {
  return Math.random() > 0.5;
}

/**
 * Generate random US state code
 */
function randomState(): string {
  const states = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  ];

  return states[Math.floor(Math.random() * states.length)];
}

/**
 * Generate random US city name
 */
function randomCity(): string {
  const cities = [
    'Austin', 'Boston', 'Chicago', 'Denver', 'Houston',
    'Miami', 'Phoenix', 'Portland', 'Seattle', 'Atlanta',
    'Dallas', 'San Francisco', 'New York', 'Los Angeles', 'Orlando',
  ];

  return cities[Math.floor(Math.random() * cities.length)];
}

/**
 * Generate random street address
 */
function randomStreet(): string {
  const streetNames = [
    'Main St', 'Oak Ave', 'Maple Dr', 'Pine Rd', 'Cedar Ln',
    'Elm St', 'Park Ave', 'Lake Dr', 'Hill Rd', 'River Ln',
  ];

  const number = Math.floor(Math.random() * 9000) + 100; // 100-9999
  const street = streetNames[Math.floor(Math.random() * streetNames.length)];

  return `${number} ${street}`;
}

/**
 * Generate random ZIP code
 */
function randomZip(): string {
  const zip = Math.floor(Math.random() * 90000) + 10000; // 10000-99999
  return zip.toString();
}

/**
 * Generate random first name
 */
function randomFirstName(): string {
  const names = [
    'Alice', 'Bob', 'Charlie', 'Diana', 'Edward', 'Fiona',
    'George', 'Hannah', 'Ivan', 'Julia', 'Kevin', 'Laura',
    'Michael', 'Nancy', 'Oscar', 'Patricia', 'Quinn', 'Rachel',
  ];

  return names[Math.floor(Math.random() * names.length)];
}

/**
 * Generate random last name
 */
function randomLastName(): string {
  const names = [
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia',
    'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez',
    'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson',
  ];

  return names[Math.floor(Math.random() * names.length)];
}

// ============================================================================
// BLOCK-SPECIFIC GENERATORS
// ============================================================================

/**
 * Generate random value for a text block
 */
function generateTextValue(step: ApiStep): string {
  const config = step.config as any;

  // Check variant for advanced mode
  if (config?.variant === 'long') {
    return randomLongText();
  }

  // Legacy types
  if (step.type === 'long_text') {
    return randomLongText();
  }

  return randomShortText();
}

/**
 * Generate random value for a boolean block
 */
function generateBooleanValue(step: ApiStep): boolean | string {
  const config = step.config as BooleanAdvancedConfig | any;
  const value = randomBoolean();

  // Advanced mode: check if storing as alias
  if (config?.storeAsBoolean === false && config?.trueAlias && config?.falseAlias) {
    return value ? config.trueAlias : config.falseAlias;
  }

  return value;
}

/**
 * Generate random value for a choice block
 */
function generateChoiceValue(step: ApiStep): string | string[] {
  const config = step.config as ChoiceAdvancedConfig | any;

  // Handle advanced mode
  if (config?.options && Array.isArray(config.options)) {
    const options = config.options;

    if (config.allowMultiple) {
      // Multiple selection: pick 1-3 random options
      const count = Math.min(
        Math.floor(Math.random() * 3) + 1,
        options.length
      );

      const selected: string[] = [];
      const availableIndices = options.map((_, i) => i);

      for (let i = 0; i < count; i++) {
        const randomIndex = Math.floor(Math.random() * availableIndices.length);
        const optionIndex = availableIndices.splice(randomIndex, 1)[0];
        const option = options[optionIndex];

        // Use alias if available, otherwise id
        selected.push(option.alias || option.id);
      }

      return selected;
    } else {
      // Single selection
      const option = options[Math.floor(Math.random() * options.length)];
      return option.alias || option.id;
    }
  }

  // Legacy mode (simple string arrays)
  if (Array.isArray(config?.options)) {
    const options = config.options;

    if (step.type === 'multiple_choice') {
      // Multiple selection
      const count = Math.min(
        Math.floor(Math.random() * 3) + 1,
        options.length
      );

      const selected: string[] = [];
      const availableIndices = options.map((_, i) => i);

      for (let i = 0; i < count; i++) {
        const randomIndex = Math.floor(Math.random() * availableIndices.length);
        const optionIndex = availableIndices.splice(randomIndex, 1)[0];
        selected.push(options[optionIndex]);
      }

      return selected;
    } else {
      // Single selection
      return options[Math.floor(Math.random() * options.length)];
    }
  }

  // Fallback
  return 'Option 1';
}

/**
 * Generate random value for a scale block
 */
function generateScaleValue(step: ApiStep): number {
  const config = step.config as ScaleConfig | any;

  const min = config?.min ?? 1;
  const max = config?.max ?? 10;
  const stepSize = config?.step ?? 1;

  return randomNumber(min, max, stepSize);
}

/**
 * Generate random value for a number block
 */
function generateNumberValue(step: ApiStep): number {
  const config = step.config as NumberConfig | any;

  const min = config?.min ?? 0;
  const max = config?.max ?? 9999;
  const stepSize = config?.step ?? 1;

  return randomNumber(min, max, stepSize);
}

/**
 * Generate random value for a currency block
 */
function generateCurrencyValue(step: ApiStep): number {
  const config = step.config as CurrencyConfig | any;

  const min = config?.min ?? 0;
  const max = config?.max ?? 10000;
  const allowDecimal = config?.allowDecimal ?? true;

  return randomCurrency(min, max, allowDecimal);
}

/**
 * Generate random value for an address block
 */
function generateAddressValue(step: ApiStep): object {
  const config = step.config as AddressConfig | any;

  return {
    street: randomStreet(),
    city: randomCity(),
    state: randomState(),
    zip: randomZip(),
  };
}

/**
 * Generate random value for a multi-field block
 */
function generateMultiFieldValue(step: ApiStep): object {
  const config = step.config as MultiFieldConfig | any;

  // Handle predefined layouts
  if (config?.layout === 'first_last') {
    return {
      first: randomFirstName(),
      last: randomLastName(),
    };
  }

  if (config?.layout === 'contact') {
    return {
      email: randomEmail(),
      phone: randomPhone(),
    };
  }

  if (config?.layout === 'date_range') {
    const start = randomDate();
    const startDate = new Date(start);
    startDate.setDate(startDate.getDate() + Math.floor(Math.random() * 30) + 1);
    const end = startDate.toISOString().split('T')[0];

    return {
      start,
      end,
    };
  }

  // Custom fields
  if (config?.fields && Array.isArray(config.fields)) {
    const result: Record<string, any> = {};

    for (const field of config.fields) {
      switch (field.type) {
        case 'text':
          result[field.key] = randomShortText();
          break;
        case 'email':
          result[field.key] = randomEmail();
          break;
        case 'phone':
          result[field.key] = randomPhone();
          break;
        case 'date':
          result[field.key] = randomDate();
          break;
        case 'number':
          result[field.key] = randomNumber();
          break;
        default:
          result[field.key] = randomShortText();
      }
    }

    return result;
  }

  // Fallback
  return {
    value: randomShortText(),
  };
}

// ============================================================================
// MAIN GENERATOR FUNCTION
// ============================================================================

/**
 * Generate random value for a single block/step
 *
 * @param step - The step definition
 * @returns Random value appropriate for the step type
 */
export function generateRandomValueForBlock(step: ApiStep): any {
  try {
    // Skip display blocks and JS blocks (no user input)
    if (step.type === 'display' || step.type === 'js_question' || step.type === 'computed') {
      return undefined;
    }

    // Text blocks
    if (step.type === 'short_text' || step.type === 'long_text' || step.type === 'text') {
      return generateTextValue(step);
    }

    // Boolean blocks
    if (step.type === 'yes_no' || step.type === 'true_false' || step.type === 'boolean') {
      return generateBooleanValue(step);
    }

    // Validated inputs
    if (step.type === 'email') {
      return randomEmail();
    }

    if (step.type === 'phone') {
      return randomPhone();
    }

    if (step.type === 'website') {
      return randomWebsite();
    }

    // Date/Time blocks
    if (step.type === 'date') {
      return randomDate();
    }

    if (step.type === 'time') {
      return randomTime();
    }

    if (step.type === 'date_time') {
      return randomDateTime();
    }

    // Choice blocks
    if (step.type === 'radio' || step.type === 'multiple_choice' || step.type === 'choice') {
      return generateChoiceValue(step);
    }

    // Numeric blocks
    if (step.type === 'number') {
      return generateNumberValue(step);
    }

    if (step.type === 'currency') {
      return generateCurrencyValue(step);
    }

    if (step.type === 'scale') {
      return generateScaleValue(step);
    }

    // Complex blocks
    if (step.type === 'address') {
      return generateAddressValue(step);
    }

    if (step.type === 'multi_field') {
      return generateMultiFieldValue(step);
    }

    // Fallback for unknown types
    console.warn(`[RandomFill] Unknown block type: ${step.type}, using default short text`);
    return randomShortText();

  } catch (error) {
    console.error('[RandomFill] Error generating random value for block:', step.id, error);
    return randomShortText(); // Safe fallback
  }
}

/**
 * Generate random values for all blocks in a workflow
 *
 * @param steps - Array of all steps in the workflow
 * @returns Map of stepId -> random value
 */
export function generateRandomValuesForWorkflow(steps: ApiStep[]): Record<string, any> {
  const values: Record<string, any> = {};

  for (const step of steps) {
    const value = generateRandomValueForBlock(step);

    // Only store if value is defined (skip display blocks, etc.)
    if (value !== undefined) {
      values[step.id] = value;
    }
  }

  return values;
}

/**
 * Generate random values for specific steps (e.g., current page)
 *
 * @param steps - Array of steps to fill
 * @returns Map of stepId -> random value
 */
export function generateRandomValuesForSteps(steps: ApiStep[]): Record<string, any> {
  return generateRandomValuesForWorkflow(steps);
}
