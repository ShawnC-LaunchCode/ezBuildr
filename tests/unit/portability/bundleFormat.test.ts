import { describe, it, expect, vi, afterEach } from 'vitest';
import { BundleWriter } from '../../../server/services/portability/bundleWriter';
import { BundleReader } from '../../../server/services/portability/bundleReader';
import { FORMAT_VERSION, MAX_ENTRY_COUNT, MAX_SINGLE_ENTRY_SIZE, MAX_TOTAL_SIZE, MAX_COMPRESSION_RATIO } from '../../../server/services/portability/bundleFormat';
import AdmZip from 'adm-zip';
const AdmZipConstructor = AdmZip as any;

import * as path from 'path';
import * as os from 'os';

function createMockEntry(name: string, size = 100, compSize = 50, data = Buffer.from('test')): any {
  return {
    entryName: name,
    header: { size, compressedSize: compSize },
    getData: () => data,
    name: name.split('/').pop() || name,
    isDirectory: false,
    comment: '',
    attr: 0
  };
}

describe('Bundle Format', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exports limit constants and format version', () => {
    expect(FORMAT_VERSION).toBe(1);
    expect(MAX_ENTRY_COUNT).toBeGreaterThan(0);
    expect(MAX_SINGLE_ENTRY_SIZE).toBeGreaterThan(0);
    expect(MAX_TOTAL_SIZE).toBeGreaterThan(0);
    expect(MAX_COMPRESSION_RATIO).toBeGreaterThan(0);
  });

  it('round-trips a bundle with entities and blobs (deduplicating blobs)', async () => {
    const tmpFile = path.join(os.tmpdir(), `test-bundle-${Date.now()}.ezb`);
    const writer = new BundleWriter(tmpFile);
    
    await writer.writeManifest({
      formatVersion: FORMAT_VERSION,
      appVersion: '1.0.0',
      migrationHead: '0001',
      scope: 'project',
      rootIds: ['proj-123'],
      sourceSystem: 'test',
      createdAt: new Date().toISOString(),
      entityCounts: { projects: 1 },
      blobCount: 1,
      checksum: '' // will be computed on finalize
    });

    await writer.writeEntityRow('projects', { id: 'proj-123', name: 'Test' });
    
    const blobBytes = Buffer.from('test blob content');
    await writer.writeBlob('deadbeef', blobBytes);
    await writer.writeBlob('deadbeef', blobBytes);

    await writer.writeBlobIndex({
      'file1': { sha256: 'deadbeef', filename: 'test.txt', mimeType: 'text/plain', size: blobBytes.length }
    });

    const outPath = await writer.finalize();

    const reader = new BundleReader(outPath);
    await reader.open();
    
    expect(reader.manifest.formatVersion).toBe(FORMAT_VERSION);
    expect(reader.manifest.checksum).toBeTruthy();
    
    const projects = [];
    for await (const row of reader.readEntityStream('projects')) {
      projects.push(row);
    }
    expect(projects).toEqual([{ id: 'proj-123', name: 'Test' }]);
    
    const blobOut = await reader.readBlob('deadbeef');
    expect(blobOut.toString()).toBe('test blob content');

    const index = await reader.readBlobIndex();
    expect(index.file1.sha256).toBe('deadbeef');

    reader.close();
  });

  describe('Rejection Cases', () => {
    it('rejects entry-count overflow', async () => {
      const dummyZip = path.join(os.tmpdir(), `dummy-${Date.now()}.zip`);
      new AdmZipConstructor().writeZip(dummyZip);
      const reader = new BundleReader(dummyZip);
      const getEntriesSpy = vi.spyOn((reader as any).zip, 'getEntries');
      const entries = Array(MAX_ENTRY_COUNT + 1).fill(null).map((_, i) => createMockEntry(`file${i}.txt`));
      getEntriesSpy.mockReturnValue(entries as any);
      
      await expect(reader.open()).rejects.toThrow('Entry count overflow');
    });

    it('rejects single entry size overflow', async () => {
      const dummyZip = path.join(os.tmpdir(), `dummy-${Date.now()}.zip`);
      new AdmZipConstructor().writeZip(dummyZip);
      const reader = new BundleReader(dummyZip);
      const getEntriesSpy = vi.spyOn((reader as any).zip, 'getEntries');
      getEntriesSpy.mockReturnValue([
        createMockEntry('huge.txt', MAX_SINGLE_ENTRY_SIZE + 1)
      ] as any);
      
      await expect(reader.open()).rejects.toThrow('Single entry size overflow');
    });

    it('rejects total size overflow', async () => {
      const dummyZip = path.join(os.tmpdir(), `dummy-${Date.now()}.zip`);
      new AdmZipConstructor().writeZip(dummyZip);
      const reader = new BundleReader(dummyZip);
      const getEntriesSpy = vi.spyOn((reader as any).zip, 'getEntries');
      getEntriesSpy.mockReturnValue([
        createMockEntry('file1.txt', MAX_SINGLE_ENTRY_SIZE, MAX_SINGLE_ENTRY_SIZE / 2),
        createMockEntry('file2.txt', MAX_SINGLE_ENTRY_SIZE, MAX_SINGLE_ENTRY_SIZE / 2),
        createMockEntry('file3.txt', MAX_SINGLE_ENTRY_SIZE, MAX_SINGLE_ENTRY_SIZE / 2),
        createMockEntry('file4.txt', MAX_SINGLE_ENTRY_SIZE, MAX_SINGLE_ENTRY_SIZE / 2),
        createMockEntry('file5.txt', MAX_SINGLE_ENTRY_SIZE, MAX_SINGLE_ENTRY_SIZE / 2)
      ] as any);
      
      await expect(reader.open()).rejects.toThrow('Total size overflow');
    });

    it('rejects compression ratio overflow', async () => {
      const dummyZip = path.join(os.tmpdir(), `dummy-${Date.now()}.zip`);
      new AdmZipConstructor().writeZip(dummyZip);
      const reader = new BundleReader(dummyZip);
      const getEntriesSpy = vi.spyOn((reader as any).zip, 'getEntries');
      // e.g. 1MB uncompressed but 10 bytes compressed (ratio 100,000 > MAX_COMPRESSION_RATIO)
      getEntriesSpy.mockReturnValue([
        createMockEntry('bomb.txt', 1000000, 5)
      ] as any);
      
      await expect(reader.open()).rejects.toThrow('Compression ratio overflow');
    });

    it('rejects path traversal', async () => {
      const badPaths = [
        '../passwd',
        '..\\passwd',
        '/etc/passwd',
        '\\Windows\\System32',
        'C:\\temp\\file.txt',
        'd:/temp/file.txt'
      ];

      for (const p of badPaths) {
        const dummyZip = path.join(os.tmpdir(), `dummy-${Date.now()}.zip`);
        new AdmZipConstructor().writeZip(dummyZip);
        const reader = new BundleReader(dummyZip);
        const getEntriesSpy = vi.spyOn((reader as any).zip, 'getEntries');
        getEntriesSpy.mockReturnValue([createMockEntry(p)] as any);
        await expect(reader.open()).rejects.toThrow('Path traversal detected');
      }
    });

    it('rejects checksum mismatch', async () => {
      const dummyZip = path.join(os.tmpdir(), `dummy-${Date.now()}.zip`);
      new AdmZipConstructor().writeZip(dummyZip);
      const reader = new BundleReader(dummyZip);
      const getEntriesSpy = vi.spyOn((reader as any).zip, 'getEntries');
      
      const manifestBytes = Buffer.from(JSON.stringify({
        formatVersion: FORMAT_VERSION,
        appVersion: '1.0.0',
        migrationHead: '0001',
        scope: 'project',
        rootIds: ['proj-123'],
        sourceSystem: 'test',
        createdAt: new Date().toISOString(),
        entityCounts: {},
        blobCount: 0,
        checksum: 'a'.repeat(64)
      }));

      getEntriesSpy.mockReturnValue([
        createMockEntry('manifest.json', manifestBytes.length, manifestBytes.length, manifestBytes)
      ] as any);
      
      await expect(reader.open()).rejects.toThrow('Checksum mismatch');
    });

    it('rejects a formatVersion newer than the current one', async () => {
      const dummyZip = path.join(os.tmpdir(), `dummy-${Date.now()}.zip`);
      new AdmZipConstructor().writeZip(dummyZip);
      const reader = new BundleReader(dummyZip);
      const getEntriesSpy = vi.spyOn((reader as any).zip, 'getEntries');

      const manifestBytes = Buffer.from(JSON.stringify({
        formatVersion: FORMAT_VERSION + 1,
        appVersion: '1.0.0',
        migrationHead: '0001',
        scope: 'project',
        rootIds: ['proj-123'],
        sourceSystem: 'test',
        createdAt: new Date().toISOString(),
        entityCounts: {},
        blobCount: 0,
        checksum: 'a'.repeat(64)
      }));

      getEntriesSpy.mockReturnValue([
        createMockEntry('manifest.json', manifestBytes.length, manifestBytes.length, manifestBytes)
      ] as any);

      await expect(reader.open()).rejects.toThrow(
        `Format version ${FORMAT_VERSION + 1} is newer than supported ${FORMAT_VERSION}`
      );
    });

    it('rejects duplicate entry names (IEX2-12)', async () => {
      const dummyZip = path.join(os.tmpdir(), `dummy-${Date.now()}.zip`);
      new AdmZipConstructor().writeZip(dummyZip);
      const reader = new BundleReader(dummyZip);
      const getEntriesSpy = vi.spyOn((reader as any).zip, 'getEntries');
      getEntriesSpy.mockReturnValue([
        createMockEntry('entities/steps.jsonl'),
        createMockEntry('entities/steps.jsonl')
      ] as any);
      
      await expect(reader.open()).rejects.toThrow('Duplicate entry detected: entities/steps.jsonl');
    });

    it('rejects size mismatch when header lies about size (IEX2-13)', async () => {
      const dummyZip = path.join(os.tmpdir(), `dummy-${Date.now()}.zip`);
      new AdmZipConstructor().writeZip(dummyZip);
      const reader = new BundleReader(dummyZip);
      const getEntriesSpy = vi.spyOn((reader as any).zip, 'getEntries');
      
      const realData = Buffer.alloc(1000);
      const manifestData = Buffer.from(JSON.stringify({
        formatVersion: FORMAT_VERSION,
        appVersion: '1.0.0',
        migrationHead: '0001',
        scope: 'project',
        rootIds: ['proj-123'],
        sourceSystem: 'test',
        createdAt: new Date().toISOString(),
        entityCounts: {},
        blobCount: 0,
        checksum: 'a'.repeat(64)
      }));
      // Manifest needs to parse so we can test the checksum hash reading other entries
      const manifestEntry = createMockEntry('manifest.json', manifestData.length, manifestData.length, manifestData);
      
      // Lies about size: header says 10, actual data is 1000
      const deceptiveEntry = createMockEntry('entities/bad.jsonl', 10, 5, realData);
      getEntriesSpy.mockReturnValue([manifestEntry, deceptiveEntry] as any);
      
      await expect(reader.open()).rejects.toThrow('Size mismatch in entities/bad.jsonl: expected 10, got 1000');
    });

    it('rejects compressedSize === 0 when actual ratio is too high (IEX2-13)', async () => {
      const dummyZip = path.join(os.tmpdir(), `dummy-${Date.now()}.zip`);
      new AdmZipConstructor().writeZip(dummyZip);
      const reader = new BundleReader(dummyZip);
      const getEntriesSpy = vi.spyOn((reader as any).zip, 'getEntries');
      
      const realData = Buffer.alloc(1000000);
      const manifestData = Buffer.from(JSON.stringify({
        formatVersion: FORMAT_VERSION,
        appVersion: '1.0.0',
        migrationHead: '0001',
        scope: 'project',
        rootIds: ['proj-123'],
        sourceSystem: 'test',
        createdAt: new Date().toISOString(),
        entityCounts: {},
        blobCount: 0,
        checksum: 'a'.repeat(64)
      }));
      const manifestEntry = createMockEntry('manifest.json', manifestData.length, manifestData.length, manifestData);
      
      // compressedSize is 0, but size is large. Our logic assigns Infinity ratio.
      const zeroCompEntry = createMockEntry('entities/bomb.jsonl', realData.length, 0, realData);
      getEntriesSpy.mockReturnValue([manifestEntry, zeroCompEntry] as any);
      
      await expect(reader.open()).rejects.toThrow('Compression ratio overflow in entities/bomb.jsonl');
    });

    it('rejects when cumulative actual sizes exceed MAX_TOTAL_SIZE (IEX2-13)', async () => {
      const dummyZip = path.join(os.tmpdir(), `dummy-${Date.now()}.zip`);
      new AdmZipConstructor().writeZip(dummyZip);
      const reader = new BundleReader(dummyZip);
      const getEntriesSpy = vi.spyOn((reader as any).zip, 'getEntries');
      
      const manifestData = Buffer.from(JSON.stringify({
        formatVersion: FORMAT_VERSION,
        appVersion: '1.0.0',
        migrationHead: '0001',
        scope: 'project',
        rootIds: ['proj-123'],
        sourceSystem: 'test',
        createdAt: new Date().toISOString(),
        entityCounts: {},
        blobCount: 0,
        checksum: 'a'.repeat(64)
      }));
      const manifestEntry = createMockEntry('manifest.json', manifestData.length, manifestData.length, manifestData);
      
      const entrySize = Math.floor(MAX_TOTAL_SIZE / 10);
      const data = Buffer.alloc(entrySize);

      const entries = [manifestEntry];
      for (let i = 0; i < 11; i++) {
        entries.push(createMockEntry(`entities/e${i}.jsonl`, entrySize, entrySize, data));
      }

      getEntriesSpy.mockReturnValue(entries as any);

      // Defence in depth, deliberately unreachable in production: because
      // getEntryData requires actualSize === header.size, the measured total can
      // never exceed the declared total that validateZipBombsAndPaths already
      // caps at MAX_TOTAL_SIZE. Reaching this guard therefore requires stubbing
      // the declared-size pre-check. It is kept (and tested here) so that
      // relaxing the strict size equality later cannot silently remove the only
      // cumulative bound on decompressed bytes.
      const originalValidate = (reader as any).validateZipBombsAndPaths;
      (reader as any).validateZipBombsAndPaths = vi.fn();

      await expect(reader.open()).rejects.toThrow('Total size overflow');

      (reader as any).validateZipBombsAndPaths = originalValidate;
    });
  });
});
