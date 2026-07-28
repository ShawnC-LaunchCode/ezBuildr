import { manifestSchema, BundleManifest, BlobIndex, blobIndexSchema, FORMAT_VERSION, MAX_ENTRY_COUNT, MAX_SINGLE_ENTRY_SIZE, MAX_TOTAL_SIZE, MAX_COMPRESSION_RATIO } from './bundleFormat';
import { ZipArchive, ZipEntry, openZip } from './zipArchive';
import { createHash } from 'crypto';
import { Readable } from 'stream';
import * as readline from 'readline';

export class BundleReader {
  private zip: ZipArchive;
  public manifest!: BundleManifest;
  private entries: ZipEntry[] = [];
  
  constructor(bundlePath: string) {
    this.zip = openZip(bundlePath);
  }

  async open(): Promise<void> {
    this.entries = this.zip.getEntries();
    this.validateZipBombsAndPaths();
    
    const manifestEntry = this.entries.find((e: ZipEntry) => e.entryName === 'manifest.json');
    if (!manifestEntry) {
      throw new Error('Missing manifest.json');
    }
    
    const manifestStr = manifestEntry.getData().toString('utf8');
    this.manifest = manifestSchema.parse(JSON.parse(manifestStr));
    
    if (this.manifest.formatVersion > FORMAT_VERSION) {
      throw new Error(`Format version ${this.manifest.formatVersion} is newer than supported ${FORMAT_VERSION}`);
    }

    this.validateChecksum();
  }

  private validateZipBombsAndPaths(): void {
    if (this.entries.length > MAX_ENTRY_COUNT) {
      throw new Error(`Entry count overflow: ${this.entries.length}`);
    }

    let totalSize = 0;

    for (const entry of this.entries) {
      if (
        entry.entryName.includes('../') || 
        entry.entryName.includes('..\\') ||
        entry.entryName.startsWith('/') || 
        entry.entryName.startsWith('\\') ||
        /^[a-zA-Z]:[/\\]/.test(entry.entryName)
      ) {
        throw new Error(`Path traversal detected: ${entry.entryName}`);
      }

      const uncompressedSize = entry.header.size;
      const compressedSize = entry.header.compressedSize;

      if (uncompressedSize > MAX_SINGLE_ENTRY_SIZE) {
        throw new Error(`Single entry size overflow in ${entry.entryName}`);
      }

      if (compressedSize > 0 && (uncompressedSize / compressedSize) > MAX_COMPRESSION_RATIO) {
        throw new Error(`Compression ratio overflow in ${entry.entryName}`);
      }

      totalSize += uncompressedSize;
    }

    if (totalSize > MAX_TOTAL_SIZE) {
      throw new Error(`Total size overflow: ${totalSize}`);
    }
  }

  private validateChecksum(): void {
    const hash = createHash('sha256');
    
    // Sort entities
    const entityEntries = this.entries
      .filter((e: ZipEntry) => e.entryName.startsWith('entities/') && e.entryName.endsWith('.jsonl'))
      .sort((a: ZipEntry, b: ZipEntry) => a.entryName.localeCompare(b.entryName));
      
    for (const entry of entityEntries) {
      hash.update(entry.getData());
    }

    // Sort blobs
    const blobEntries = this.entries
      .filter((e: ZipEntry) => e.entryName.startsWith('blobs/') && e.entryName !== 'blobs/index.json' && !e.entryName.endsWith('/'))
      .sort((a: ZipEntry, b: ZipEntry) => a.entryName.localeCompare(b.entryName));
      
    for (const entry of blobEntries) {
      hash.update(entry.getData());
    }

    // index.json
    const indexEntry = this.entries.find((e: ZipEntry) => e.entryName === 'blobs/index.json');
    if (indexEntry) {
      hash.update(indexEntry.getData());
    }

    const computed = hash.digest('hex');
    if (this.manifest.checksum && this.manifest.checksum !== computed) {
      throw new Error(`Checksum mismatch: expected ${this.manifest.checksum}, got ${computed}`);
    }
  }

  async *readEntityStream(entityName: string): AsyncGenerator<unknown> {
    const entry = this.entries.find((e: ZipEntry) => e.entryName === `entities/${entityName}.jsonl`);
    if (!entry) {
      return;
    }
    
    const buffer = entry.getData();
    const stream = Readable.from(buffer);
    const rl = readline.createInterface({
      input: stream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      if (line.trim()) {
        yield JSON.parse(line);
      }
    }
  }

  async readBlob(sha256: string): Promise<Buffer> {
    const entry = this.entries.find((e: ZipEntry) => e.entryName === `blobs/${sha256}`);
    if (!entry) {
      throw new Error(`Blob ${sha256} not found`);
    }
    return entry.getData();
  }

  async readBlobIndex(): Promise<BlobIndex> {
    const entry = this.entries.find((e: ZipEntry) => e.entryName === 'blobs/index.json');
    if (!entry) {
      return {};
    }
    return blobIndexSchema.parse(JSON.parse(entry.getData().toString('utf8')));
  }

  getEntryCount(path: string): number {
    return this.entries.filter((e: ZipEntry) => e.entryName === path).length;
  }

  close(): void {
    // adm-zip has no close
  }
}

