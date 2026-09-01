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

import { LIST_VALIDATION_MAX_DEPTH } from './BlockValidation';
import { findDuplicateFieldAliases, validateFieldAliasFormat } from './listFieldHelpers';
import { conditionExpressionSchema } from '../types/conditions';
import { documentFieldMappingSchema } from '../types/documentMapping';
import {
  CANONICAL_STEP_TYPES,
  STORED_LIST_FIELD_QUESTION_TYPES,
  type CanonicalStepType,
  type ListConfig,
  type ListField,
} from '../types/stepConfigs';

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
  format: z.enum(['national', 'international', 'US']).optional(),
  validation: z.object({
    strict: z.boolean().optional(),
  }).optional(),
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

export const LegacyCombinedDateTimeConfigSchema = z.object({
  minDate: z.string().optional(),
  maxDate: z.string().optional(),
  timeFormat: z.enum(['12h', '24h']).optional(),
  timeStep: z.number().int().min(1).max(60).optional(),
}).optional();

export const EmailConfigSchema = z.object({
  allowMultiple: z.boolean().optional(),
  maxEmails: z.number().int().min(1).optional(),
  restrictDomains: z.array(z.string()).optional(),
  blockDomains: z.array(z.string()).optional(),
  placeholder: z.string().optional(),
}).optional();

export const NumberConfigSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  allowDecimal: z.boolean().optional(),
  placeholder: z.string().optional(),
}).optional();

/**
 * Canonical `number` config (STB-9/STB-10).
 *
 * `formatOnInput` is live grouping and is meaningless without grouping at all,
 * and `prefix`/`suffix` are plain-number decorations (Decision 8) — both are
 * refused rather than silently ignored, so an author cannot save a config the
 * runner will not honour.
 */
export const NumberCanonicalConfigSchema = z.object({
  // Defaulted for pre-STB-9 rows. New writers always include the discriminator.
  mode: z.enum(['number', 'currency_whole', 'currency_decimal']).default('number'),
  validation: NumberValidationSchema,
  currency: z.string().regex(/^[A-Z]{3}$/, 'currency must be an uppercase ISO 4217 code').optional(),
  thousandsSeparator: z.boolean().optional(),
  formatOnInput: z.boolean().optional(),
  prefix: z.string().max(8).optional(),
  suffix: z.string().max(8).optional(),
  placeholder: z.string().optional(),
}).superRefine((config, ctx) => {
  const isCurrency = config.mode !== 'number';
  if (!isCurrency && config.formatOnInput === true && config.thousandsSeparator !== true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['formatOnInput'],
      message: 'formatOnInput requires thousandsSeparator: live grouping needs grouping enabled',
    });
  }
  if (isCurrency && config.prefix !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['prefix'],
      message: 'prefix is not allowed in currency modes: the ISO currency symbol owns the prefix',
    });
  }
  if (isCurrency && config.currency === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['currency'],
      message: 'currency is required in currency modes',
    });
  }
  if (isCurrency && config.suffix !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['suffix'],
      message: 'suffix is not allowed in currency modes: ISO currency formatting owns decorations',
    });
  }
  if (!isCurrency && config.currency !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['currency'],
      message: 'currency is only allowed in currency modes',
    });
  }
  if (isCurrency && config.validation?.precision !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['validation', 'precision'],
      message: 'precision is not allowed in currency modes: the ISO currency defines fraction digits',
    });
  }
  const validation = config.validation;
  if (validation?.min !== undefined && validation.max !== undefined && validation.min > validation.max) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['validation', 'min'],
      message: 'min cannot be greater than max',
    });
  }
});

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
  allowedProtocols: z.array(z.enum(['http', 'https', 'ftp'])).optional(),
  restrictDomains: z.array(z.string()).optional(),
  blockDomains: z.array(z.string()).optional(),
  placeholder: z.string().optional(),
}).optional();

export const DisplayConfigSchema = z.object({
  markdown: z.string(),
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
  trueLabel: z.string().optional(),
  falseLabel: z.string().optional(),
  storeAsBoolean: z.boolean().optional(),
  trueAlias: z.string().optional(),
  falseAlias: z.string().optional(),
  defaultValue: z.union([z.boolean(), z.string()]).optional(),
  displayStyle: z.enum(['buttons', 'radio', 'toggle', 'checkbox']).optional(),
});



export const DateTimeConfigSchema = z.object({
  kind: z.enum(['date', 'time', 'datetime']),
  minDate: z.string().optional(),
  maxDate: z.string().optional(),
  defaultToToday: z.boolean().optional(),
  timeFormat: z.enum(['12h', '24h']).optional(),
  timeStep: z.number().int().min(1).max(60).optional(),
});

/** @deprecated Use DateTimeConfigSchema. */
export const DateTimeUnifiedConfigSchema = DateTimeConfigSchema;

export const ChoiceAdvancedConfigSchema = z.object({
  // 'combobox' = searchable dropdown that also accepts an unlisted answer.
  display: z.enum(['radio', 'dropdown', 'combobox', 'multiple']),
  layout: z.enum(['vertical', 'horizontal']).optional(),
  options: z.union([
    z.array(z.union([
      ChoiceOptionSchema,
      z.string().transform(val => ({ id: val, label: val, alias: val }))
    ])).min(1),
    z.object({ type: z.enum(['static', 'list', 'table_column']) }).passthrough()
  ]),
  min: z.number().int().min(0).optional(),
  max: z.number().int().min(1).optional(),
  allowOther: z.boolean().optional(),
  otherLabel: z.string().optional(),
  /** @deprecated superseded by display: 'combobox'; still accepted for old configs. */
  searchable: z.boolean().optional(),
  randomizeOrder: z.boolean().optional(),
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

const StrictLegacyScale = z.object({
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
}).strict();

export const ScaleLegacyReadSchema = z.preprocess((val, ctx) => {
  const parsed = StrictLegacyScale.safeParse(val);
  if (!parsed.success) {
    parsed.error.issues.forEach(i => ctx.addIssue(i));
    return z.NEVER;
  }
  const display = parsed.data.display === 'stars' || parsed.data.display === 'slider' ? parsed.data.display : 'slider';
  return {
    min: parsed.data.min,
    max: parsed.data.max,
    step: parsed.data.step,
    display,
    showValue: parsed.data.showValue,
    minLabel: parsed.data.minLabel,
    maxLabel: parsed.data.maxLabel,
  };
}, ScaleConfigSchema);



const StrictLegacyAddress = z.object({
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
}).strict();

export const AddressLegacyReadSchema = z.preprocess((val, ctx) => {
  const parsed = StrictLegacyAddress.safeParse(val);
  if (!parsed.success) {
    parsed.error.issues.forEach(i => ctx.addIssue(i));
    return z.NEVER;
  }
  return {
    country: 'US',
    fields: ['street', 'city', 'state', 'zip']
  };
}, AddressConfigSchema);

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

const StrictLegacyDisplay = z.object({
  markdown: z.string(),
  allowHtml: z.boolean(),
  template: z.boolean().optional(),
  variables: z.array(z.string()).optional(),
  style: z.object({
    backgroundColor: z.string().optional(),
    textColor: z.string().optional(),
    fontSize: z.enum(['sm', 'md', 'lg']).optional(),
    alignment: z.enum(['left', 'center', 'right']).optional(),
  }).strict().optional(),
}).strict();

export const DisplayLegacyReadSchema = z.preprocess((val, ctx) => {
  const parsed = StrictLegacyDisplay.safeParse(val);
  if (!parsed.success) {
    parsed.error.issues.forEach(i => ctx.addIssue(i));
    return z.NEVER;
  }
  return {
    markdown: parsed.data.markdown,
  };
}, DisplayConfigSchema);

// ============================================================================
// LEGACY SCHEMAS
// ============================================================================

export const LegacyMultipleChoiceConfigSchema = z.object({
  options: z.array(z.union([
    z.object({
      id: z.string(),
      label: z.string(),
      alias: z.string().optional(),
    }),
    z.string().transform(val => ({ id: val, label: val, alias: val }))
  ])),
  minSelections: z.number().int().min(0).optional(),
  maxSelections: z.number().int().min(1).optional(),
});

export const LegacyRadioConfigSchema = z.object({
  options: z.array(z.union([
    z.object({
      id: z.string(),
      label: z.string(),
      alias: z.string().optional(),
    }),
    z.string().transform(val => ({ id: val, label: val, alias: val }))
  ])),
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

export const EmailDeliveryConfigSchema = z.object({
  to: z.string().min(1, 'Recipient email or variable is required'),
  subject: z.string().optional(),
  body: z.string().optional(),
  attachDocuments: z.boolean().optional(),
  recipientName: z.string().optional(),
});

export const WebhookDeliveryConfigSchema = z.object({
  url: z.string().url('Invalid webhook URL'),
  headers: z.record(z.string()).optional(),
  secret: z.string().optional(),
  includeDocumentUrls: z.boolean().optional(),
  includeDocumentBase64: z.boolean().optional(),
});

export const CloudStorageDeliveryConfigSchema = z.object({
  bucket: z.string().min(1, 'Bucket name is required'),
  region: z.string().optional(),
  endpoint: z.string().url('Invalid cloud storage endpoint URL').optional(),
  pathPrefix: z.string().optional(),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
});

export const EmailDestinationSchema = z.object({
  id: z.string(),
  type: z.literal('email'),
  name: z.string().optional(),
  enabled: z.boolean().optional(),
  config: EmailDeliveryConfigSchema,
});

export const WebhookDestinationSchema = z.object({
  id: z.string(),
  type: z.literal('webhook'),
  name: z.string().optional(),
  enabled: z.boolean().optional(),
  config: WebhookDeliveryConfigSchema,
});

export const CloudStorageDestinationSchema = z.object({
  id: z.string(),
  type: z.literal('cloud_storage'),
  name: z.string().optional(),
  enabled: z.boolean().optional(),
  config: CloudStorageDeliveryConfigSchema,
});

export const DeliveryDestinationSchema = z.discriminatedUnion('type', [
  EmailDestinationSchema,
  WebhookDestinationSchema,
  CloudStorageDestinationSchema,
]);

/**
 * Final Block Config Schema
 * Document selection and output configuration for workflow completion
 */
export const FinalBlockConfigSchema = z.object({
  markdownHeader: z.string(),
  outputFormats: z.array(z.enum(['docx', 'pdf'])).min(1).optional(),
  redirectUrl: z.string().optional().refine(val => {
    if (!val) {return true;}
    try {
      const url = new URL(val, 'http://localhost');
      return ['http:', 'https:'].includes(url.protocol);
    } catch {
      return false;
    }
  }, { message: 'Invalid redirect URL scheme' }),
  customLinks: z.array(z.object({
    label: z.string(),
    url: z.string().refine(val => {
      try {
        const urlObj = new URL(val, 'http://localhost');
        return ['http:', 'https:'].includes(urlObj.protocol);
      } catch {
        return false;
      }
    }, { message: 'Invalid URL scheme in custom link' }),
    style: z.enum(['button', 'link'])
  })).optional(),
  brandingColor: z.string().optional(),
  documents: z.array(z.object({
    id: z.string(),
    documentId: z.string(),
    alias: z.string().min(1, 'Document alias is required'),
    pinnedVersionId: z.string().uuid().nullable().optional(),
    conditions: conditionExpressionSchema.optional(),
    mapping: documentFieldMappingSchema.optional(),
  })).refine(
    (docs) => {
      // Check for duplicate aliases
      const aliases = docs.map(d => d.alias);
      return new Set(aliases).size === aliases.length;
    },
    { message: 'Document aliases must be unique' }
  ),
  deliveryDestinations: z.array(DeliveryDestinationSchema).optional(),
});

/**
 * Canonical signature-block authoring contract.
 *
 * This type was canonical but previously had no schema, so every writer
 * accepted arbitrary JSON while the runtime only recognized this shape.
 */
export const SignatureBlockConfigSchema = z.object({
  signerRole: z.string().min(1),
  routingOrder: z.number().int().min(1),
  documents: z.array(z.object({
    id: z.string().min(1),
    documentId: z.string().min(1),
    mapping: documentFieldMappingSchema.optional(),
  })),
  conditions: conditionExpressionSchema.nullable().optional(),
  markdownHeader: z.string().optional(),
  provider: z.enum(['docusign', 'hellosign', 'native']).optional(),
  allowDecline: z.boolean().optional(),
  expiresInDays: z.number().int().min(1).optional(),
  signerEmail: z.string().optional(),
  signerName: z.string().optional(),
  message: z.string().optional(),
  redirectUrl: z.string().optional().refine(val => {
    if (!val) { return true; }
    try {
      const url = new URL(val, 'http://localhost');
      return ['http:', 'https:'].includes(url.protocol);
    } catch {
      return false;
    }
  }, { message: 'Invalid redirect URL scheme' }),
});

// ============================================================================
// STRUCTURAL SCHEMAS
// ============================================================================

/**
 * `list` step config (LIST2-3). Recursive — a `ListField` may itself be
 * `kind: "list"` — so it is built per-depth rather than as one `z.lazy()`
 * shape: at `LIST_VALIDATION_MAX_DEPTH` the field union drops the `"list"`
 * variant entirely, which is what actually enforces the cap (a config
 * nesting one level past it fails to match either union member and is
 * rejected). Depth numbering mirrors `validateListValue` in
 * `BlockValidation.ts`: the step's own root config is depth 1.
 *
 * Alias format/uniqueness reuse the exact rules the builder enforces
 * client-side (`listFieldHelpers.ts`) so the two never drift apart. A
 * question field's own `config` is deliberately `z.unknown()` — this schema
 * is about List *structure*, not validating every possible per-type config
 * (that is LIST2-7/8's authoring-UI scope).
 */
const ListFieldAliasSchema = z.string().superRefine((value, ctx) => {
  const error = validateFieldAliasFormat(value);
  if (error) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
  }
});

const ListFieldQuestionTypeSchema = z.string().refine(
  (value) => (STORED_LIST_FIELD_QUESTION_TYPES as readonly string[]).includes(value),
  { message: 'Invalid list field question type' }
);

const QuestionListFieldSchema = z.object({
  kind: z.literal('question'),
  id: z.string().min(1),
  alias: ListFieldAliasSchema,
  type: ListFieldQuestionTypeSchema,
  title: z.string(),
  description: z.string().optional(),
  required: z.boolean().optional(),
  order: z.number(),
  config: z.unknown().optional(),
  visibleIf: conditionExpressionSchema.optional(),
});

function buildListFieldSchema(depth: number): z.ZodTypeAny {
  if (depth >= LIST_VALIDATION_MAX_DEPTH) {
    // Depth cap reached: a nested "list" field is not offered at all here.
    return QuestionListFieldSchema;
  }
  return z.union([
    QuestionListFieldSchema,
    z.object({
      kind: z.literal('list'),
      id: z.string().min(1),
      alias: ListFieldAliasSchema,
      title: z.string(),
      description: z.string().optional(),
      order: z.number(),
      list: z.lazy(() => buildListConfigSchema(depth + 1)),
    }),
  ]);
}

function buildListConfigSchema(depth: number): z.ZodTypeAny {
  return z
    .object({
      fields: z.array(buildListFieldSchema(depth)),
      minItems: z.number().int().min(0).optional(),
      maxItems: z.number().int().min(0).optional(),
      labelTemplate: z.string().optional(),
      addButtonText: z.string().optional(),
      allowReorder: z.boolean().optional(),
      emptyStateText: z.string().optional(),
    })
    .superRefine((config, ctx) => {
      const duplicates = findDuplicateFieldAliases(config.fields as ListField[]);
      if (duplicates.size > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['fields'],
          message: `Duplicate field alias(es) at this level: ${[...duplicates].join(', ')}`,
        });
      }
    });
}

export const ListConfigSchema = buildListConfigSchema(1) as z.ZodType<ListConfig>;

// ============================================================================
// CONFIG VALIDATOR FACTORY
// ============================================================================

const configSchemaMap: Partial<Record<string, z.ZodTypeAny>> = {
  // Canonical stored types
  text: TextAdvancedConfigSchema,
  boolean: BooleanAdvancedConfigSchema,
  phone: PhoneConfigSchema,
  date_time: DateTimeConfigSchema,
  choice: ChoiceAdvancedConfigSchema,
  email: EmailConfigSchema,
  number: NumberCanonicalConfigSchema,
  scale: ScaleConfigSchema,
  website: WebsiteConfigSchema,
  address: AddressConfigSchema,
  multi_field: MultiFieldConfigSchema,
  display: DisplayConfigSchema,
  file_upload: FileUploadConfigSchema,
  list: ListConfigSchema,
  js_question: JsQuestionConfigSchema,
  computed: ComputedStepConfigSchema,
  final_documents: FinalBlockConfigSchema,
  signature_block: SignatureBlockConfigSchema,

  // Retired names remain readable until the stored-artifact backfill. They
  // are intentionally absent from the canonical write boundary below.
  date: DateConfigSchema,
  time: TimeConfigSchema,
  datetime: LegacyCombinedDateTimeConfigSchema,
  currency: CurrencyConfigSchema,
  true_false: TrueFalseConfigSchema,
  phone_advanced: PhoneConfigSchema,
  datetime_unified: DateTimeConfigSchema,
  email_advanced: EmailConfigSchema,
  number_advanced: NumberAdvancedConfigSchema,
  scale_advanced: ScaleLegacyReadSchema,
  website_advanced: WebsiteConfigSchema,
  address_advanced: AddressLegacyReadSchema,
  display_advanced: DisplayLegacyReadSchema,
  multiple_choice: LegacyMultipleChoiceConfigSchema,
  radio: LegacyRadioConfigSchema,
  yes_no: LegacyYesNoConfigSchema,
};

const canonicalTypeSet = new Set<string>(CANONICAL_STEP_TYPES);

function unwrapSchemaForTraversal(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current = schema;
  for (;;) {
    if (
      current instanceof z.ZodOptional ||
      current instanceof z.ZodDefault ||
      current instanceof z.ZodNullable
    ) {
      current = (current as unknown as { _def: { innerType: z.ZodTypeAny } })._def.innerType;
      continue;
    }
    if (current instanceof z.ZodEffects) {
      current = (current as unknown as { _def: { schema: z.ZodTypeAny } })._def.schema;
      continue;
    }
    if (current instanceof z.ZodLazy) {
      current = (current as unknown as { _def: { getter: () => z.ZodTypeAny } })._def.getter();
      continue;
    }
    return current;
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function selectMatchingSchema(options: readonly z.ZodTypeAny[], value: unknown): z.ZodTypeAny | undefined {
  return options.find(option => option.safeParse(value).success) ?? options[0];
}

function collectObjectUnknownConfigKeyIssues(
  shape: Partial<Record<string, z.ZodTypeAny>>,
  unknownKeys: string,
  value: Record<string, unknown>,
  path: Array<string | number>,
  issues: z.ZodIssue[]
): void {
  for (const [key, child] of Object.entries(value)) {
    const childSchema = shape[key];
    if (childSchema === undefined) {
      if (unknownKeys !== 'passthrough') {
        const issuePath = [...path, key];
        issues.push({
          code: z.ZodIssueCode.custom,
          path: issuePath,
          message: `Unknown config key "${issuePath.join('.')}"`,
        });
      }
      continue;
    }
    collectUnknownConfigKeyIssues(childSchema, child, [...path, key], issues);
  }
}

/**
 * Find keys Zod would otherwise silently strip. The walk is recursive so the
 * issue path identifies the exact nested key (including array indexes), while
 * deliberately preserving schemas that explicitly opt into `.passthrough()`.
 */
function collectUnknownConfigKeyIssues(
  inputSchema: z.ZodTypeAny,
  value: unknown,
  path: Array<string | number>,
  issues: z.ZodIssue[]
): void {
  const schema = unwrapSchemaForTraversal(inputSchema);

  if (schema instanceof z.ZodObject) {
    if (!isObjectRecord(value)) { return; }
    const shape = schema.shape as unknown as Partial<Record<string, z.ZodTypeAny>>;
    const unknownKeys = (schema as unknown as { _def: { unknownKeys: string } })._def.unknownKeys;
    collectObjectUnknownConfigKeyIssues(shape, unknownKeys, value, path, issues);
    return;
  }

  if (schema instanceof z.ZodArray) {
    if (!Array.isArray(value)) { return; }
    const element = (schema as unknown as { _def: { type: z.ZodTypeAny } })._def.type;
    value.forEach((item, index) => collectUnknownConfigKeyIssues(element, item, [...path, index], issues));
    return;
  }

  if (schema instanceof z.ZodTuple) {
    if (!Array.isArray(value)) { return; }
    const items = (schema as unknown as { _def: { items: z.ZodTypeAny[] } })._def.items;
    items.forEach((item, index) => collectUnknownConfigKeyIssues(item, value[index], [...path, index], issues));
    return;
  }

  if (schema instanceof z.ZodRecord) {
    if (!isObjectRecord(value)) { return; }
    const valueType = (schema as unknown as { _def: { valueType: z.ZodTypeAny } })._def.valueType;
    for (const [key, child] of Object.entries(value)) {
      collectUnknownConfigKeyIssues(valueType, child, [...path, key], issues);
    }
    return;
  }

  if (schema instanceof z.ZodDiscriminatedUnion || schema instanceof z.ZodUnion) {
    const options = (schema as unknown as { _def: { options: z.ZodTypeAny[] } })._def.options;
    const selected = selectMatchingSchema(options, value);
    if (selected) { collectUnknownConfigKeyIssues(selected, value, path, issues); }
  }
}

/**
 * Mirror the legacy read adapters' strict-input/preprocess pattern without
 * changing the permissive schemas used to read rows already in the database.
 */
function canonicalBoundarySchema(readSchema: z.ZodTypeAny): z.ZodTypeAny {
  const objectSchema = unwrapSchemaForTraversal(readSchema);
  const strictInput = objectSchema instanceof z.ZodObject
    ? z.object(objectSchema.shape as z.ZodRawShape).strict()
    : objectSchema;
  const strictInputWithOptionality = readSchema.safeParse(undefined).success
    ? strictInput.optional()
    : strictInput;

  // `fatal` is load-bearing. Returning z.NEVER does NOT stop Zod running the
  // outer readSchema on the discarded value, so without it every rejection
  // trailed phantom `Required` issues for fields the caller DID supply. Those
  // reach the 400 body verbatim, and STB-16 routes them to the AI patch loop,
  // where a model would 'fix' a field that was never missing.
  return z.preprocess((value, ctx) => {
    const issues: z.ZodIssue[] = [];
    collectUnknownConfigKeyIssues(readSchema, value, [], issues);
    if (issues.length > 0) {
      issues.forEach(issue => ctx.addIssue({ ...issue, fatal: true }));
      return z.NEVER;
    }
    const parsed = strictInputWithOptionality.safeParse(value);
    if (!parsed.success) {
      parsed.error.issues.forEach(issue => ctx.addIssue({ ...issue, fatal: true }));
      return z.NEVER;
    }
    return parsed.data;
  }, readSchema);
}

/**
 * Get the appropriate validation schema for a step type
 *
 * @param stepType - The step type enum value
 * @returns Zod schema for validating the config, or undefined if no validation needed
 */
export function getConfigSchema(stepType: string): z.ZodTypeAny | undefined {
  return configSchemaMap[stepType];
}

/** Return the strict canonical-only schema used by request/ingest writers. */
export function getCanonicalConfigSchema(stepType: string): z.ZodTypeAny | undefined {
  if (!canonicalTypeSet.has(stepType)) { return undefined; }
  const schema = configSchemaMap[stepType as CanonicalStepType];
  return schema === undefined ? undefined : canonicalBoundarySchema(schema);
}

/**
 * Validate a canonical type/config pair at a write boundary. Unlike
 * `validateStepConfig`, this rejects retired/unknown type names and unknown
 * config keys instead of preserving read compatibility.
 */
export function validateCanonicalStepConfig(stepType: string, config: unknown): {
  success: boolean;
  data?: unknown;
  error?: z.ZodError;
} {
  const schema = getCanonicalConfigSchema(stepType);
  if (!schema) {
    return {
      success: false,
      error: new z.ZodError([{
        code: z.ZodIssueCode.custom,
        path: ['type'],
        message: `Step type "${stepType}" is retired or is not canonical`,
      }]),
    };
  }
  const result = schema.safeParse(config);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, error: result.error };
}

/**
 * Validate a step config against its type schema
 *
 * @param stepType - The step type
 * @param config - The configuration object
 * @returns Validation result with parsed data or error
 */
export function validateStepConfig(stepType: string, config: unknown): {
  success: boolean;
  data?: unknown;
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
  storageKey: z.string(),
  url: z.string().optional(),
  mimeType: z.string(),
  size: z.number(),
  uploadedAt: z.string(),
});
