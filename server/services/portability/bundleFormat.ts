import { z } from 'zod';

export const FORMAT_VERSION = 1;
export const MAX_ENTRY_COUNT = 50000;
export const MAX_SINGLE_ENTRY_SIZE = 500 * 1024 * 1024; // 500MB
export const MAX_TOTAL_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
export const MAX_COMPRESSION_RATIO = 100;

export class BundleSizeLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BundleSizeLimitError';
  }
}

/**
 * An item the importing system must supply by hand because its material was
 * deliberately withheld from the bundle (decision D-2).
 *
 * Discriminated on `type` and every branch's fields are required: the import
 * preview (IEX-8) must be able to name what it is asking for. A secret with no
 * `key` is not a state this exporter can produce, so the format should not
 * describe one — `formatVersion` is a compatibility obligation the moment a
 * bundle leaves this system, and loose fields here are expensive to tighten
 * later.
 */
const reentrySecretSchema = z.object({
  type: z.literal('secret'),
  entity: z.literal('secrets'),
  projectId: z.string(),
  key: z.string(),
  /** `secrets.environment` is nullable in the schema. */
  environment: z.string().nullable(),
  /** The secret's own `type` column, renamed to free `type` for the discriminant. */
  secretType: z.string()
});

const reentryConnectionSchema = z.object({
  type: z.literal('connection'),
  entity: z.literal('connections'),
  projectId: z.string(),
  connectionId: z.string(),
  connectionName: z.string()
});

const reentryEntrySchema = z.discriminatedUnion('type', [
  reentrySecretSchema,
  reentryConnectionSchema
]);

export const manifestSchema = z.object({
  formatVersion: z.number(),
  appVersion: z.string(),
  migrationHead: z.string().nullable(),
  scope: z.enum(['workflow', 'project', 'tenant', 'database']),
  rootIds: z.array(z.string()),
  sourceSystem: z.string(),
  createdAt: z.string(),
  entityCounts: z.record(z.number()),
  blobCount: z.number(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/, 'Invalid checksum format'),
  warnings: z.array(z.discriminatedUnion('type', [
    z.object({
      type: z.literal('missing_blob'),
      entity: z.string(),
      column: z.string(),
      fileRef: z.string(),
      message: z.string()
    }),
    z.object({
      type: z.literal('secret_scan'),
      entity: z.string(),
      column: z.string(),
      line: z.number(),
      message: z.string()
    }),
    z.object({
      // Used by ImportPreview/ImportApplyResult, never emitted by export
      type: z.literal('dangling_reference'),
      entity: z.string(),
      column: z.string(),
      missingId: z.string(),
      message: z.string()
    })
  ])).optional(),
  requiresReentry: z.array(reentryEntrySchema).optional()
});

export type ExportWarning = NonNullable<z.infer<typeof manifestSchema>['warnings']>[number];
export type RequiresReentry = z.infer<typeof reentryEntrySchema>;
export type ReentrySecret = z.infer<typeof reentrySecretSchema>;
export type ReentryConnection = z.infer<typeof reentryConnectionSchema>;

export type BundleManifest = z.infer<typeof manifestSchema>;

export const blobIndexSchema = z.record(z.object({
  sha256: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  size: z.number()
}));

export type BlobIndex = z.infer<typeof blobIndexSchema>;
