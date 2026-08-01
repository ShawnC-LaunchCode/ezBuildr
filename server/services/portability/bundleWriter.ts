import * as fs from 'fs';
import { writeFile } from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createHash } from 'crypto';
import { BundleManifest, BlobIndex } from './bundleFormat';
import { ZipArchive, openZip } from './zipArchive';

export class BundleWriter {
  private outPath: string;
  private tmpDir: string;
  private writtenBlobs = new Set<string>();
  
  private entityStreams = new Map<string, fs.WriteStream>();
  private manifestData: BundleManifest | null = null;
  private blobIndexData: BlobIndex | null = null;
  private zip: ZipArchive;
  private firstError: Error | null = null;

  constructor(outPath: string) {
    this.outPath = outPath;
    this.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ezb-bundle-'));
    this.zip = openZip();
  }

  async writeManifest(manifest: BundleManifest): Promise<void> {
    this.manifestData = manifest;
  }

  async writeEntityRow(entityName: string, row: unknown): Promise<void> {
    if (this.firstError) {
      throw this.firstError;
    }

    let stream = this.entityStreams.get(entityName);
    if (!stream) {
      const p = path.join(this.tmpDir, `entities_${entityName}.jsonl`);
      stream = fs.createWriteStream(p);
      stream.on('error', (err) => {
        if (!this.firstError) {
          this.firstError = err;
        }
      });
      this.entityStreams.set(entityName, stream);
    }
    const currentStream = stream;
    const line = `${JSON.stringify(row)}\n`;
    
    return new Promise<void>((resolve, reject) => {
      if (!currentStream.write(line)) {
        const onDrain = (): void => {
          currentStream.removeListener('error', onError);
          resolve();
        };
        const onError = (err: Error): void => {
          currentStream.removeListener('drain', onDrain);
          if (!this.firstError) {
            this.firstError = err;
          }
          reject(err);
        };
        currentStream.once('drain', onDrain);
        currentStream.once('error', onError);
      } else {
        if (this.firstError) {
          reject(this.firstError);
        } else {
          resolve();
        }
      }
    });
  }

  async writeBlob(sha256: string, data: Buffer): Promise<void> {
    if (this.writtenBlobs.has(sha256)) {
      return;
    }
    this.writtenBlobs.add(sha256);
    const p = path.join(this.tmpDir, `blobs_${sha256}`);
    // Async: template binaries run to tens of MB and must not block the loop.
    await writeFile(p, data);
  }

  async writeBlobIndex(index: BlobIndex): Promise<void> {
    this.blobIndexData = index;
  }

  async finalize(): Promise<string> {
    try {
      return await this.pack();
    } finally {
      this.cleanup();
    }
  }

  cleanup(): void {
    for (const stream of this.entityStreams.values()) {
      // Swallow delayed open errors after cleanup
      stream.on('error', () => {});
      try {
        stream.destroy();
      } catch (e) {
        // Ignore stream destruction errors
      }
    }
    // Always reclaim the spool directory, including on a failed pack —
    // a tenant-scale export leaves gigabytes behind otherwise.
    fs.rmSync(this.tmpDir, { recursive: true, force: true });
  }

  private async pack(): Promise<string> {
    if (this.firstError) {
      throw this.firstError;
    }

    const hash = createHash('sha256');

    // Sort entities alphabetically
    const entityNames = Array.from(this.entityStreams.keys()).sort();
    for (const name of entityNames) {
      const stream = this.entityStreams.get(name)!;
      await new Promise<void>((resolve, reject) => {
        const onError = (err: Error): void => {
          if (!this.firstError) {
            this.firstError = err;
          }
          reject(err);
        };
        stream.once('error', onError);
        stream.end(() => {
          stream.removeListener('error', onError);
          resolve();
        });
      });
      const err = this.firstError as Error | null;
      if (err instanceof Error) {
        throw err;
      }
      const filePath = path.join(this.tmpDir, `entities_${name}.jsonl`);
      this.zip.addLocalFile(filePath, 'entities', `${name}.jsonl`);
      
      const readStream = fs.createReadStream(filePath);
      await new Promise<void>((res, rej) => {
        readStream.on('data', chunk => hash.update(chunk));
        readStream.on('end', res);
        readStream.on('error', rej);
      });
    }

    // Sort blobs alphabetically
    const blobNames = Array.from(this.writtenBlobs).sort();
    for (const sha256 of blobNames) {
      const filePath = path.join(this.tmpDir, `blobs_${sha256}`);
      this.zip.addLocalFile(filePath, 'blobs', sha256);
      
      const readStream = fs.createReadStream(filePath);
      await new Promise<void>((res, rej) => {
        readStream.on('data', chunk => hash.update(chunk));
        readStream.on('end', res);
        readStream.on('error', rej);
      });
    }

    if (this.blobIndexData) {
      const indexStr = JSON.stringify(this.blobIndexData);
      const buf = Buffer.from(indexStr);
      this.zip.addFile('blobs/index.json', buf);
      hash.update(buf);
    }

    if (this.manifestData) {
      this.manifestData.checksum = hash.digest('hex');
      this.zip.addFile('manifest.json', Buffer.from(JSON.stringify(this.manifestData)));
    }

    this.zip.writeZip(this.outPath);

    return this.outPath;
  }
}


