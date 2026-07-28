import { z } from 'zod';

export const FORMAT_VERSION = 1;
export const MAX_ENTRY_COUNT = 50000;
export const MAX_SINGLE_ENTRY_SIZE = 500 * 1024 * 1024; // 500MB
export const MAX_TOTAL_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
export const MAX_COMPRESSION_RATIO = 100;

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
  checksum: z.string()
});

export type BundleManifest = z.infer<typeof manifestSchema>;

export const blobIndexSchema = z.record(z.object({
  sha256: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  size: z.number()
}));

export type BlobIndex = z.infer<typeof blobIndexSchema>;
