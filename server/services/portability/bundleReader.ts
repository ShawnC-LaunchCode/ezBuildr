import { manifestSchema, BundleManifest, BlobIndex, blobIndexSchema, FORMAT_VERSION, MAX_ENTRY_COUNT, MAX_SINGLE_ENTRY_SIZE, MAX_TOTAL_SIZE, MAX_COMPRESSION_RATIO } from './bundleFormat';
import { ZipArchive, ZipEntry, openZip } from './zipArchive';
import { createHash } from 'crypto';
import { Readable } from 'stream';
import * as readline from 'readline';

export class BundleReader {
  private zip: ZipArchive;
  public manifest!: BundleManifest;
  private entries: ZipEntry[] = [];
  private totalDecompressedBytes = 0;
  private decompressedEntries = new Set<string>();
  
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
    
    const manifestStr = this.getEntryData(manifestEntry).toString('utf8');
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

    let totalDeclaredSize = 0;
    const entryNames = new Set<string>();

    for (const entry of this.entries) {
      if (entryNames.has(entry.entryName)) {
        throw new Error(`Duplicate entry detected: ${entry.entryName}`);
      }
      entryNames.add(entry.entryName);

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

      const ratio = compressedSize > 0 ? uncompressedSize / compressedSize : (uncompressedSize > 0 ? Infinity : 1);
      if (ratio > MAX_COMPRESSION_RATIO) {
        throw new Error(`Compression ratio overflow in ${entry.entryName}`);
      }

      totalDeclaredSize += uncompressedSize;
    }

    if (totalDeclaredSize > MAX_TOTAL_SIZE) {
      throw new Error(`Total size overflow: ${totalDeclaredSize}`);
    }
  }

  private getEntryData(entry: ZipEntry): Buffer {
    const data = entry.getData();
    
    if (!this.decompressedEntries.has(entry.entryName)) {
      const actualSize = data.length;
      
      if (actualSize !== entry.header.size) {
        throw new Error(`Size mismatch in ${entry.entryName}: expected ${entry.header.size}, got ${actualSize}`);
      }
      
      if (actualSize > MAX_SINGLE_ENTRY_SIZE) {
        throw new Error(`Single entry size overflow in ${entry.entryName}`);
      }

      const compressedSize = entry.header.compressedSize;
      const ratio = compressedSize > 0 ? actualSize / compressedSize : (actualSize > 0 ? Infinity : 1);
      if (ratio > MAX_COMPRESSION_RATIO) {
        throw new Error(`Compression ratio overflow in ${entry.entryName}`);
      }

      this.totalDecompressedBytes += actualSize;
      if (this.totalDecompressedBytes > MAX_TOTAL_SIZE) {
        throw new Error(`Total size overflow: ${this.totalDecompressedBytes}`);
      }
      
      this.decompressedEntries.add(entry.entryName);
    }
    
    return data;
  }

  private validateChecksum(): void {
    const hash = createHash('sha256');
    
    // Sort entities
    const entityEntries = this.entries
      .filter((e: ZipEntry) => e.entryName.startsWith('entities/') && e.entryName.endsWith('.jsonl'))
      .sort((a: ZipEntry, b: ZipEntry) => a.entryName.localeCompare(b.entryName));
      
    for (const entry of entityEntries) {
      hash.update(this.getEntryData(entry));
    }

    // Sort blobs
    const blobEntries = this.entries
      .filter((e: ZipEntry) => e.entryName.startsWith('blobs/') && e.entryName !== 'blobs/index.json' && !e.entryName.endsWith('/'))
      .sort((a: ZipEntry, b: ZipEntry) => a.entryName.localeCompare(b.entryName));
      
    for (const entry of blobEntries) {
      hash.update(this.getEntryData(entry));
    }

    // index.json
    const indexEntry = this.entries.find((e: ZipEntry) => e.entryName === 'blobs/index.json');
    if (indexEntry) {
      hash.update(this.getEntryData(indexEntry));
    }

    const computed = hash.digest('hex');
    if (this.manifest.checksum !== computed) {
      throw new Error(`Checksum mismatch: expected ${this.manifest.checksum}, got ${computed}`);
    }
  }

  async *readEntityStream(entityName: string): AsyncGenerator<unknown> {
    const entry = this.entries.find((e: ZipEntry) => e.entryName === `entities/${entityName}.jsonl`);
    if (!entry) {
      return;
    }
    
    const buffer = this.getEntryData(entry);
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
    return this.getEntryData(entry);
  }

  async readBlobIndex(): Promise<BlobIndex> {
    const entry = this.entries.find((e: ZipEntry) => e.entryName === 'blobs/index.json');
    if (!entry) {
      return {};
    }
    return blobIndexSchema.parse(JSON.parse(this.getEntryData(entry).toString('utf8')));
  }

  close(): void {
    // adm-zip has no close
  }
}

