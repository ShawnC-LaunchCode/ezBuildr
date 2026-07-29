import { createHash } from "crypto";
import type AdmZip from "adm-zip";

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
