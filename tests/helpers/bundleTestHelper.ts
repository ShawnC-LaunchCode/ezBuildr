import { createHash, randomUUID } from "crypto";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import type AdmZip from "adm-zip";
import { importService, type ImportPreview, type ImportApplyOptions, type ImportApplyResult } from "../../server/services/portability/ImportService";

export function recomputeChecksum(zip: AdmZip, manifest: any): void {
  const hash = createHash("sha256");
  const entries = zip.getEntries();
  const entityEntries = entries
    .filter((e) => e.entryName.startsWith("entities/") && e.entryName.endsWith(".jsonl"))
    .sort((a, b) => a.entryName.localeCompare(b.entryName));
  for (const entry of entityEntries) {
    hash.update(entry.getData());
  }
  const blobEntries = entries
    .filter((e) => e.entryName.startsWith("blobs/") && e.entryName !== "blobs/index.json" && !e.entryName.endsWith("/"))
    .sort((a, b) => a.entryName.localeCompare(b.entryName));
  for (const entry of blobEntries) {
    hash.update(entry.getData());
  }
  const indexEntry = entries.find((e) => e.entryName === "blobs/index.json");
  if (indexEntry) {
    hash.update(indexEntry.getData());
  }
  manifest.checksum = hash.digest("hex");
}

/**
 * ImportService.preview/apply take a file path, not a Buffer (IEX2-10) — the
 * production caller is a multer upload already on disk. Tests still build
 * bundles as Buffers, so spool to a temp file around the real call and clean
 * it up, keeping every existing test's call shape (buffer in, result out).
 */
async function withBundleFile<T>(buffer: Buffer, fn: (filePath: string) => Promise<T>): Promise<T> {
  const filePath = path.join(os.tmpdir(), `test-bundle-${randomUUID()}.ezb`);
  await fs.writeFile(filePath, buffer);
  try {
    return await fn(filePath);
  } finally {
    await fs.rm(filePath, { force: true });
  }
}

export function previewBundle(buffer: Buffer, userId: string, targetProjectId?: string): Promise<ImportPreview> {
  return withBundleFile(buffer, (filePath) => importService.preview(filePath, userId, targetProjectId));
}

export function applyBundle(buffer: Buffer, userId: string, options?: ImportApplyOptions): Promise<ImportApplyResult> {
  return withBundleFile(buffer, (filePath) => importService.apply(filePath, userId, options));
}
