import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../../../server/db';
import { createTestFactory, TestFactory } from '../../helpers/testFactory';
import { describeWithDb } from '../../helpers/dbTestHelper';
import { exportService } from '../../../server/services/portability/ExportService';
import { BundleReader } from '../../../server/services/portability/bundleReader';
import { storageProvider } from '../../../server/services/storage';
import { MAX_TOTAL_SIZE, MAX_SINGLE_ENTRY_SIZE, BundleSizeLimitError } from '../../../server/services/portability/bundleFormat';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createHash } from 'crypto';

describeWithDb('exportBlobs', () => {
  let factory: ReturnType<typeof createTestFactory>;
  let testUserId: string;
  let testTenantId: string;
  let testProjectId: string;

  beforeEach(async () => {
    factory = createTestFactory();
    await db.transaction(async (tx: unknown) => {
      const txFactory = new TestFactory(tx as ConstructorParameters<typeof TestFactory>[0]);
      
      const { tenant, user, project } = await txFactory.createTenant();
      testTenantId = tenant.id;
      testUserId = user.id;
      testProjectId = project.id;

      await txFactory.createWorkflow(project.id, user.id, {
        workflow: { name: 'Blob Workflow' },
      });

      // Create a template with a known fileRef
      await txFactory.createTemplate(testProjectId, user.id, {
        name: 'Test Template',
        fileRef: 'test-bucket/my-file-1.docx',
      });
      
      // Create another template sharing the exact same fileRef (for dedupe test)
      await txFactory.createTemplate(testProjectId, user.id, {
        name: 'Test Template 2',
        fileRef: 'test-bucket/my-file-1.docx', // Deduplicate
      });

      // Create a template with a missing fileRef
      await txFactory.createTemplate(testProjectId, user.id, {
        name: 'Missing Template',
        fileRef: 'test-bucket/missing-file.docx',
      });
      
      // Create a template for the size limit test
      await txFactory.createTemplate(testProjectId, user.id, {
        name: 'Huge Template',
        fileRef: 'test-bucket/huge-file.docx',
      });
    });

    // Mock storageProvider
    vi.spyOn(storageProvider, 'exists').mockImplementation(async (fileRef: string) => {
      return fileRef !== 'test-bucket/missing-file.docx';
    });

    vi.spyOn(storageProvider, 'getFile').mockImplementation(async (fileRef: string) => {
      if (fileRef === 'test-bucket/my-file-1.docx') {
        return Buffer.from('mock binary data 1');
      }
      if (fileRef === 'test-bucket/huge-file.docx') {
        const fakeHugeBuffer = Buffer.from('fake');
        Object.defineProperty(fakeHugeBuffer, 'length', { value: MAX_TOTAL_SIZE + 1 });
        return fakeHugeBuffer;
      }
      throw new Error('Not found');
    });

    vi.spyOn(storageProvider, 'getMetadata').mockImplementation(async (_fileRef: string) => {
      return { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 100 };
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await factory.cleanup({ tenantIds: [testTenantId] });
  });

  async function loadBundle(buffer: Buffer) {
    const tmpPath = path.join(os.tmpdir(), `test_bundle_${Date.now()}_${Math.random()}.ezb`);
    await fs.promises.writeFile(tmpPath, buffer);
    const reader = new BundleReader(tmpPath);
    await reader.open();
    return { reader, tmpPath };
  }

  it('embeds template binaries, populates index.json, and dedupes shared fileRefs', async () => {
    // Exclude the huge file from this test
    vi.spyOn(storageProvider, 'getFile').mockImplementation(async (fileRef: string) => {
      if (fileRef === 'test-bucket/huge-file.docx') {
        return Buffer.alloc(0);
      }
      if (fileRef === 'test-bucket/my-file-1.docx') {
        return Buffer.from('mock binary data 1');
      }
      throw new Error('Not found');
    });

    const buffer = await exportService.export({ scope: 'project', id: testProjectId }, testUserId);
    const { reader, tmpPath } = await loadBundle(buffer);
    
    // We expect two blobs to be collected (my-file-1.docx and huge-file.docx)
    // my-file-1.docx is shared by two templates and should be deduped.
    // missing-file.docx does not produce a blob.
    
    // Read blob index
    const blobIndex = await reader.readBlobIndex();
    const hash1 = createHash('sha256').update(Buffer.from('mock binary data 1')).digest('hex');
    
    expect(blobIndex).toBeDefined();
    expect(blobIndex['test-bucket/my-file-1.docx']).toMatchObject({
      sha256: hash1,
      filename: 'my-file-1.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: Buffer.from('mock binary data 1').length
    });
    
    // Check missing blob warning
    const warnings = reader.manifest.warnings;
    expect(warnings).toBeDefined();
    expect(warnings?.length).toBeGreaterThan(0);
    const missingWarning = warnings?.find(w => w.fileRef === 'test-bucket/missing-file.docx');
    expect(missingWarning).toBeDefined();
    expect(missingWarning?.type).toBe('missing_blob');
    expect(missingWarning?.entity).toBe('templates');
    
    // Ensure blob content matches
    const blob1Data = await reader.readBlob(hash1);
    expect(blob1Data).toBeDefined();
    expect(blob1Data?.equals(Buffer.from('mock binary data 1'))).toBe(true);
    
    // The manifest should report correct blobCount
    expect(reader.manifest.blobCount).toBe(2);

    await fs.promises.rm(tmpPath);
  });

  it('aborts export when MAX_TOTAL_SIZE is exceeded by an accumulation of legal-sized files', async () => {
    // Every file here is individually under MAX_SINGLE_ENTRY_SIZE, so only the
    // running total can trip. Five at ~500MB overshoot the 2GB cap; four do not.
    const underSingleLimit = MAX_SINGLE_ENTRY_SIZE - 1;
    const bigRefs = ['big-1', 'big-2', 'big-3', 'big-4'].map((n) => `test-bucket/${n}.docx`);

    await db.transaction(async (tx: unknown) => {
      const txFactory = new TestFactory(tx as ConstructorParameters<typeof TestFactory>[0]);
      for (const fileRef of bigRefs) {
        await txFactory.createTemplate(testProjectId, testUserId, { name: fileRef, fileRef });
      }
    });

    vi.spyOn(storageProvider, 'getFile').mockImplementation(async (_fileRef: string) => {
      const buf = Buffer.from('fake');
      Object.defineProperty(buf, 'length', { value: underSingleLimit });
      return buf;
    });

    await expect(
      exportService.export({ scope: 'project', id: testProjectId }, testUserId)
    ).rejects.toThrow(/Total bundle size exceeds limit/);
    await expect(
      exportService.export({ scope: 'project', id: testProjectId }, testUserId)
    ).rejects.toThrow(BundleSizeLimitError);
  });

  it('aborts export when MAX_SINGLE_ENTRY_SIZE is exceeded', async () => {
    vi.spyOn(storageProvider, 'getFile').mockImplementation(async (fileRef: string) => {
      if (fileRef === 'test-bucket/huge-file.docx') {
        const fakeBuffer = Buffer.from('fake');
        Object.defineProperty(fakeBuffer, 'length', { value: MAX_SINGLE_ENTRY_SIZE + 1 });
        return fakeBuffer;
      }
      return Buffer.from('normal');
    });

    await expect(
      exportService.export({ scope: 'project', id: testProjectId }, testUserId)
    ).rejects.toThrow(/exceeds single entry size limit/);
    await expect(
      exportService.export({ scope: 'project', id: testProjectId }, testUserId)
    ).rejects.toThrow(BundleSizeLimitError);
  });
});
