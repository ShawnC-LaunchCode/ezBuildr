import { z } from 'zod';

export const FORMAT_VERSION = 1;
export const MAX_ENTRY_COUNT = 50000;

/**
 * adm-zip has no streaming decompression: `entry.getData()` (bundleReader's
 * only way to read an entry) inflates it into one fresh Buffer, and the whole
 * archive is read into memory again at `new AdmZip(path)`. Measured (IEX2-10,
 * scripts/tmp_measure_entry_memory.ts, since deleted): opening a bundle whose
 * one entry is N MB of incompressible data costs ~N MB of *additional,
 * sustained* RSS above baseline — not reclaimed by the next GC, because
 * Node's allocator keeps the pages resident as a high-water mark. A bundle
 * within the OLD declared limits (500MB single entry, 2GB total) could add
 * up to 2GB of sustained RSS to the process from one import — far more than
 * a modest deployment survives, and exactly the invitation this ticket exists
 * to close.
 *
 * With IEX2-10's other fix (restoreBlobs no longer holds every blob buffer at
 * once), the single remaining uncontrolled allocation is one entry's own
 * decompression. These defaults keep that bounded to a value a 1GB-class
 * container survives alongside its own baseline load, with headroom for the
 * upload itself (`PORTABILITY_MAX_UPLOAD_BYTES`, 250MB compressed, is a
 * separate, tighter gate multer applies before any of this is reached).
 * Override via env for a deployment with more memory to spare.
 */
/**
 * A bare `Number(process.env.X ?? default)` turns a typo into NaN, and every
 * `size > NaN` comparison is false — which silently disables the limit
 * entirely, at exactly the moment an operator was reaching for it. Refuse to
 * boot instead: a misconfigured memory bound must not look like a working one.
 */
function sizeLimitFromEnv(name: string, defaultBytes: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return defaultBytes;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `${name} must be a positive number of bytes, got "${raw}". ` +
      `Leave it unset to use the default of ${defaultBytes} bytes.`
    );
  }
  return parsed;
}

export const MAX_SINGLE_ENTRY_SIZE = sizeLimitFromEnv('PORTABILITY_MAX_ENTRY_BYTES', 100 * 1024 * 1024); // 100MB
export const MAX_TOTAL_SIZE = sizeLimitFromEnv('PORTABILITY_MAX_TOTAL_BYTES', 500 * 1024 * 1024); // 500MB
export const MAX_COMPRESSION_RATIO = 100;

export class BundleSizeLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BundleSizeLimitError';
  }
}

export class ExportRowLimitError extends Error {
  statusCode = 413;
  constructor(message: string) {
    super(message);
    this.name = 'ExportRowLimitError';
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
    }),
    z.object({
      // Used by ImportPreview/ImportApplyResult for older bundles
      type: z.literal('schema_drift'),
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
