/**
 * Step Configuration Validation Schemas (Zod)
 *
 * Runtime validation schemas for step configurations.
 * These schemas validate the `config` JSONB field when creating/updating steps.
 *
 * @version 2.0.0 - Block System Overhaul
 * @date December 2025
 */

import { z } from 'zod';

// ============================================================================
// BASE SCHEMAS
// ============================================================================

const TextValidationSchema = z.object({
  minLength: z.number().int().min(0).optional(),
  maxLength: z.number().int().min(0).optional(),
  pattern: z.string().optional(),
  patternMessage: z.string().optional(),
}).optional();

const NumberValidationSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().positive().optional(),
  precision: z.number().int().min(0).max(10).optional(),
}).optional();

const ChoiceOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  alias: z.string().optional(),
  description: z.string().optional(),
});

// ============================================================================
// EASY MODE SCHEMAS
// ============================================================================

export const PhoneConfigSchema = z.object({
  format: z.enum(['US', 'international']).optional(),
  placeholder: z.string().optional(),
}).optional();

export const DateConfigSchema = z.object({
  minDate: z.string().optional(),
  maxDate: z.string().optional(),
  defaultToToday: z.boolean().optional(),
}).optional();

export const TimeConfigSchema = z.object({
  format: z.enum(['12h', '24h']).optional(),
  step: z.number().int().min(1).max(60).optional(),
}).optional();

export const DateTimeConfigSchema = z.object({
  minDate: z.string().optional(),
  maxDate: z.string().optional(),
  timeFormat: z.enum(['12h', '24h']).optional(),
  timeStep: z.number().int().min(1).max(60).optional(),
}).optional();

export const EmailConfigSchema = z.object({
  allowMultiple: z.boolean().optional(),
  placeholder: z.string().optional(),
}).optional();

export const NumberConfigSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  allowDecimal: z.boolean().optional(),
  placeholder: z.string().optional(),
}).optional();

export const CurrencyConfigSchema = z.object({
  currency: z.enum(['USD', 'EUR', 'GBP']).optional(),
  allowDecimal: z.boolean().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
}).optional();

export const ScaleConfigSchema = z.object({
  min: z.number(),
  max: z.number(),
  step: z.number().optional(),
  display: z.enum(['slider', 'stars']).optional(),
  showValue: z.boolean().optional(),
  minLabel: z.string().optional(),
  maxLabel: z.string().optional(),
});

export const WebsiteConfigSchema = z.object({
  requireProtocol: z.boolean().optional(),
  placeholder: z.string().optional(),
}).optional();

export const DisplayConfigSchema = z.object({
  markdown: z.string(),
  allowHtml: z.boolean().optional(),
});

export const AddressConfigSchema = z.object({
  country: z.literal('US'),
  fields: z.tuple([
    z.literal('street'),
    z.literal('city'),
    z.literal('state'),
    z.literal('zip')
  ]),
  requireAll: z.boolean().optional(),
});

export const TrueFalseConfigSchema = z.object({
  defaultValue: z.boolean().optional(),
  trueLabel: z.string().optional(),
  falseLabel: z.string().optional(),
}).optional();

// ============================================================================
// ADVANCED MODE SCHEMAS
// ============================================================================

export const TextAdvancedConfigSchema = z.object({
  variant: z.enum(['short', 'long']),
  validation: TextValidationSchema,
  placeholder: z.string().optional(),
  helpText: z.string().optional(),
  autoComplete: z.string().optional(),
});

export const BooleanAdvancedConfigSchema = z.object({
  trueLabel: z.string(),
  falseLabel: z.string(),
  storeAsBoolean: z.boolean(),
  trueAlias: z.string().optional(),
  falseAlias: z.string().optional(),
  defaultValue: z.union([z.boolean(), z.string()]).optional(),
  displayStyle: z.enum(['toggle', 'radio', 'checkbox']).optional(),
});

export const PhoneAdvancedConfigSchema = z.object({
  defaultCountry: z.string().optional(),
  allowedCountries: z.array(z.string()).optional(),
  format: z.enum(['national', 'international']).optional(),
  validation: z.object({
    strict: z.boolean().optional(),
  }).optional(),
});

export const DateTimeUnifiedConfigSchema = z.object({
  kind: z.enum(['date', 'time', 'datetime']),
  format: z.string().optional(),
  minDate: z.string().optional(),
  maxDate: z.string().optional(),
  timeFormat: z.enum(['12h', '24h']).optional(),
  timeStep: z.number().int().min(1).max(60).optional(),
  timezone: z.string().optional(),
  showTimezone: z.boolean().optional(),
});

export const ChoiceAdvancedConfigSchema = z.object({
  display: z.enum(['radio', 'dropdown', 'multiple']),
  allowMultiple: z.boolean(),
  options: z.array(ChoiceOptionSchema).min(1),
  min: z.number().int().min(0).optional(),
  max: z.number().int().min(1).optional(),
  allowOther: z.boolean().optional(),
  otherLabel: z.string().optional(),
  searchable: z.boolean().optional(),
  randomizeOrder: z.boolean().optional(),
});

export const EmailAdvancedConfigSchema = z.object({
  allowMultiple: z.boolean().optional(),
  maxEmails: z.number().int().min(1).optional(),
  restrictDomains: z.array(z.string()).optional(),
  blockDomains: z.array(z.string()).optional(),
  requireVerification: z.boolean().optional(),
  placeholder: z.string().optional(),
});

export const NumberAdvancedConfigSchema = z.object({
  mode: z.enum(['number', 'currency_whole', 'currency_decimal']),
  validation: NumberValidationSchema,
  currency: z.string().optional(),
  formatOnInput: z.boolean().optional(),
  thousandsSeparator: z.boolean().optional(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  placeholder: z.string().optional(),
});

export const ScaleAdvancedConfigSchema = z.object({
  min: z.number(),
  max: z.number(),
  step: z.number(),
  display: z.enum(['slider', 'stars', 'buttons']),
  stars: z.number().int().min(3).max(10).optional(),
  showValue: z.boolean().optional(),
  minLabel: z.string().optional(),
  maxLabel: z.string().optional(),
  labels: z.record(z.number(), z.string()).optional(),
  color: z.string().optional(),
});

export const WebsiteAdvancedConfigSchema = z.object({
  requireProtocol: z.boolean(),
  allowedProtocols: z.array(z.enum(['http', 'https', 'ftp'])).optional(),
  restrictDomains: z.array(z.string()).optional(),
  blockDomains: z.array(z.string()).optional(),
  validateDns: z.boolean().optional(),
  placeholder: z.string().optional(),
});

export const AddressAdvancedConfigSchema = z.object({
  country: z.string().optional(),
  allowedCountries: z.array(z.string()).optional(),
  fields: z.array(z.object({
    key: z.string(),
    label: z.string(),
    type: z.enum(['text', 'select']),
    required: z.boolean(),
    options: z.array(z.string()).optional(),
  })),
  autoComplete: z.boolean().optional(),
  validateAddress: z.boolean().optional(),
});

export const MultiFieldConfigSchema = z.object({
  layout: z.enum(['first_last', 'contact', 'date_range', 'custom']),
  fields: z.array(z.object({
    key: z.string(),
    label: z.string(),
    type: z.enum(['text', 'email', 'phone', 'date', 'number']),
    required: z.boolean(),
    placeholder: z.string().optional(),
    validation: z.union([TextValidationSchema, NumberValidationSchema]).optional(),
  })),
  storeAs: z.enum(['separate', 'combined']),
});

export const DisplayAdvancedConfigSchema = z.object({
  markdown: z.string(),
  allowHtml: z.boolean(),
  template: z.boolean().optional(),
  variables: z.array(z.string()).optional(),
  style: z.object({
    backgroundColor: z.string().optional(),
    textColor: z.string().optional(),
    fontSize: z.enum(['sm', 'md', 'lg']).optional(),
    alignment: z.enum(['left', 'center', 'right']).optional(),
  }).optional(),
});

// ============================================================================
// LEGACY SCHEMAS
// ============================================================================

export const LegacyMultipleChoiceConfigSchema = z.object({
  options: z.array(z.object({
    id: z.string(),
    label: z.string(),
  })),
  minSelections: z.number().int().min(0).optional(),
  maxSelections: z.number().int().min(1).optional(),
});

export const LegacyRadioConfigSchema = z.object({
  options: z.array(z.object({
    id: z.string(),
    label: z.string(),
  })),
  displayLayout: z.enum(['vertical', 'horizontal']).optional(),
});

export const LegacyYesNoConfigSchema = z.object({
  yesLabel: z.string().optional(),
  noLabel: z.string().optional(),
  defaultValue: z.boolean().optional(),
}).optional();

export const LegacyDateTimeConfigSchema = z.object({
  showDate: z.boolean().optional(),
  showTime: z.boolean().optional(),
  format: z.string().optional(),
}).optional();

// ============================================================================
// SPECIAL SCHEMAS
// ============================================================================

export const JsQuestionConfigSchema = z.object({
  display: z.enum(['visible', 'hidden']),
  code: z.string(),
  inputKeys: z.array(z.string()),
  outputKey: z.string(),
  timeoutMs: z.number().int().min(100).max(30000).optional(),
  helpText: z.string().optional(),
});

export const ComputedStepConfigSchema = z.object({
  transformBlockId: z.string().optional(),
  formula: z.string().optional(),
  inputKeys: z.array(z.string()).optional(),
}).optional();

export const FileUploadConfigSchema = z.object({
  maxSize: z.number().int().min(1).optional(),
  allowedTypes: z.array(z.string()).optional(),
  maxFiles: z.number().int().min(1).max(10).optional(),
  previewThumbnails: z.boolean().optional(),
}).optional();

/**
 * Logic Expression Schema
 * Used for conditional document output in Final Block
 */
const LogicExpressionSchema = z.object({
  operator: z.enum(['AND', 'OR']).optional(),
  conditions: z.array(z.object({
    key: z.string(),
    op: z.enum(['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'is_empty', 'is_not_empty']),
    value: z.any().optional(),
  })),
});

/**
 * Final Block Config Schema
 * Document selection and output configuration for workflow completion
 */
export const FinalBlockConfigSchema = z.object({
  markdownHeader: z.string(),
  documents: z.array(z.object({
    id: z.string(),
    documentId: z.string(),
    alias: z.string().min(1, 'Document alias is required'),
    conditions: LogicExpressionSchema.nullable().optional(),
    mapping: z.record(z.object({
      type: z.literal('variable'),
      source: z.string(),
    })).optional(),
  })).refine(
    (docs) => {
      // Check for duplicate aliases
      const aliases = docs.map(d => d.alias);
      return new Set(aliases).size === aliases.length;
    },
    { message: 'Document aliases must be unique' }
  ),
});

// ============================================================================
// CONFIG VALIDATOR FACTORY
// ============================================================================

/**
 * Get the appropriate validation schema for a step type
 *
 * @param stepType - The step type enum value
 * @returns Zod schema for validating the config, or undefined if no validation needed
 */
export function getConfigSchema(stepType: string): z.ZodTypeAny | undefined {
  const schemaMap: Record<string, z.ZodTypeAny> = {
    // Easy Mode
    phone: PhoneConfigSchema,
    date: DateConfigSchema,
    time: TimeConfigSchema,
    datetime: DateTimeConfigSchema,
    email: EmailConfigSchema,
    number: NumberConfigSchema,
    currency: CurrencyConfigSchema,
    scale: ScaleConfigSchema,
    website: WebsiteConfigSchema,
    display: DisplayConfigSchema,
    address: AddressConfigSchema,
    true_false: TrueFalseConfigSchema,

    // Advanced Mode
    text: TextAdvancedConfigSchema,
    boolean: BooleanAdvancedConfigSchema,
    phone_advanced: PhoneAdvancedConfigSchema,
    datetime_unified: DateTimeUnifiedConfigSchema,
    choice: ChoiceAdvancedConfigSchema,
    email_advanced: EmailAdvancedConfigSchema,
    number_advanced: NumberAdvancedConfigSchema,
    scale_advanced: ScaleAdvancedConfigSchema,
    website_advanced: WebsiteAdvancedConfigSchema,
    address_advanced: AddressAdvancedConfigSchema,
    multi_field: MultiFieldConfigSchema,
    display_advanced: DisplayAdvancedConfigSchema,

    // Legacy
    multiple_choice: LegacyMultipleChoiceConfigSchema,
    radio: LegacyRadioConfigSchema,
    yes_no: LegacyYesNoConfigSchema,
    date_time: LegacyDateTimeConfigSchema,

    // Special
    js_question: JsQuestionConfigSchema,
    computed: ComputedStepConfigSchema,
    file_upload: FileUploadConfigSchema,
    final_documents: FinalBlockConfigSchema,
  };

  return schemaMap[stepType];
}

/**
 * Validate a step config against its type schema
 *
 * @param stepType - The step type
 * @param config - The configuration object
 * @returns Validation result with parsed data or error
 */
export function validateStepConfig(stepType: string, config: any): {
  success: boolean;
  data?: any;
  error?: z.ZodError;
} {
  const schema = getConfigSchema(stepType);

  // If no schema defined, allow any config (backward compatibility)
  if (!schema) {
    return { success: true, data: config };
  }

  const result = schema.safeParse(config);

  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, error: result.error };
  }
}

// ============================================================================
// VALUE VALIDATION SCHEMAS
// ============================================================================

export const AddressValueSchema = z.object({
  street: z.string().optional(),
  street2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  country: z.string().optional(),
});

export const MultiFieldValueSchema = z.record(
  z.union([z.string(), z.number(), z.boolean(), z.null()])
);

export const ChoiceValueSchema = z.union([
  z.string(),
  z.array(z.string())
]);

export const FileUploadValueSchema = z.object({
  fileId: z.string(),
  filename: z.string(),
  url: z.string(),
  mimeType: z.string(),
  size: z.number(),
});
