import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { describeWithDb } from '../../helpers/dbTestHelper';
import { db } from '../../../server/db';
import { TestFactory } from '../../helpers/testFactory';
import { exportService } from '../../../server/services/portability/ExportService';
import { importService } from '../../../server/services/portability/ImportService';
import { storageProvider } from '../../../server/services/storage';
import { storageQuotaService } from '../../../server/services/StorageQuotaService';
import {
  setVirusScannerInstance,
  resetVirusScannerInstance,
  type IVirusScanner,
  type ScanResult
} from '../../../server/services/security/VirusScanner';
import { templates, projects } from '@shared/schema';
import { eq } from 'drizzle-orm';
import AdmZip from 'adm-zip';
import { recomputeChecksum } from '../../helpers/bundleTestHelper';

const SHARED_REF = 'src-bucket/shared.docx';
const MISSING_REF = 'src-bucket/missing.docx';
const SHARED_BYTES = Buffer.from('shared template binary payload');

class StubScanner implements IVirusScanner {
  public scanned: string[] = [];
  constructor(private readonly safe: boolean) {}

  scan(buffer: Buffer, filename: string): Promise<ScanResult> {
    this.scanned.push(filename);
    return Promise.resolve({
      safe: this.safe,
      threatName: this.safe ? undefined : 'EICAR-Test-Signature',
      scannerName: 'stub',
      scannedAt: new Date(),
      fileSize: buffer.length,
      scanDurationMs: 0
    });
  }

  isHealthy(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

describeWithDb('ImportService - blob restore', () => {
  let tf: TestFactory;
  let user: any;
  let project: any;
  let bundle: Buffer;
  let scanner: StubScanner;
  let written: Map<string, Buffer>;
  let saveFileSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tf = new TestFactory();
    const t = await tf.createTenant();
    user = t.user;
    project = t.project;

    // Three templates share ONE blob; a fourth points at a blob that is not in
    // storage, so the export omits it and the import must tolerate its absence.
    await tf.createTemplate(project.id, user.id, { name: 'Template A', fileRef: SHARED_REF });
    await tf.createTemplate(project.id, user.id, { name: 'Template B', fileRef: SHARED_REF });
    await tf.createTemplate(project.id, user.id, { name: 'Template C', fileRef: SHARED_REF });
    await tf.createTemplate(project.id, user.id, { name: 'Template Missing', fileRef: MISSING_REF });

    // Source-side storage, for the export half.
    vi.spyOn(storageProvider, 'exists').mockImplementation((ref: string) =>
      Promise.resolve(ref !== MISSING_REF));
    vi.spyOn(storageProvider, 'getFile').mockImplementation((ref: string) => {
      if (ref === SHARED_REF) {return Promise.resolve(SHARED_BYTES);}
      const stored = written.get(ref);
      if (stored !== undefined) {return Promise.resolve(stored);}
      return Promise.reject(new Error(`no such file ${ref}`));
    });
    vi.spyOn(storageProvider, 'getMetadata').mockResolvedValue({
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    } as never);

    written = new Map<string, Buffer>();
    let counter = 0;
    saveFileSpy = vi.spyOn(storageProvider, 'saveFile').mockImplementation(
      (buffer: Buffer, originalName: string) => {
        counter += 1;
        const ref = `imported-bucket/${counter}-${originalName}`;
        written.set(ref, buffer);
        return Promise.resolve(ref);
      });

    bundle = await exportService.export({ scope: 'project', id: project.id }, user.id);

    scanner = new StubScanner(true);
    setVirusScannerInstance(scanner);
  });

  afterEach(() => {
    resetVirusScannerInstance();
    vi.restoreAllMocks();
  });

  async function importedTemplates(rootId: string) {
    return db.select().from(templates).where(eq(templates.projectId, rootId));
  }

  it('restores blob bytes and repoints fileRef at the new object (AC 1, AC 2)', async () => {
    const result = await importService.apply(bundle, user.id);
    const rows = await importedTemplates(result.rootId);

    const restored = rows.filter(r => r.fileRef !== null && r.fileRef !== '');
    expect(restored.length).toBe(3);

    for (const row of restored) {
      // AC 2: no bundle-origin fileRef survives.
      expect(row.fileRef).not.toBe(SHARED_REF);
      // AC 1: the new ref resolves to byte-identical content.
      const bytes = await storageProvider.getFile(row.fileRef);
      expect(bytes.equals(SHARED_BYTES)).toBe(true);
    }
  });

  it('scans every blob before writing it, once per unique blob (AC 3, AC 8)', async () => {
    const result = await importService.apply(bundle, user.id);

    // One blobs/ entry shared by three rows: one scan, one stored object.
    expect(scanner.scanned).toHaveLength(1);
    expect(saveFileSpy).toHaveBeenCalledTimes(1);
    expect(result.blobsRestored).toBe(1);

    const rows = await importedTemplates(result.rootId);
    const refs = new Set(rows.map(r => r.fileRef).filter(Boolean));
    expect(refs.size).toBe(1);
  });

  it('an infected blob aborts the whole import, naming entity and column (AC 4)', async () => {
    setVirusScannerInstance(new StubScanner(false));
    const projectsBefore = await db.select().from(projects);

    await expect(importService.apply(bundle, user.id)).rejects.toThrow(/malware/i);

    // Names where the blob came from, not just its hash.
    await expect(importService.apply(bundle, user.id)).rejects.toThrow(/templates\.fileRef/);

    // No rows created and no bytes written.
    const projectsAfter = await db.select().from(projects);
    expect(projectsAfter.length).toBe(projectsBefore.length);
    expect(saveFileSpy).not.toHaveBeenCalled();
  });

  it('a blob whose content does not match its sha256 aborts with a distinct error (AC 5)', async () => {
    const zip = new AdmZip(bundle);
    const blobEntry = zip.getEntries().find(e =>
      e.entryName.startsWith('blobs/') && e.entryName !== 'blobs/index.json');
    expect(blobEntry).toBeDefined();

    // Swap the bytes but keep the filename (which is the claimed sha256), then
    // repair the manifest checksum so we reach the blob gate rather than IEX-12's.
    zip.updateFile(blobEntry!.entryName, Buffer.from('tampered payload'));
    const manifest = JSON.parse(zip.getEntry('manifest.json')!.getData().toString('utf8'));
    recomputeChecksum(zip, manifest);
    zip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)));

    await expect(importService.apply(zip.toBuffer(), user.id))
      .rejects.toThrow(/integrity check failed/i);
    // Distinct from the infection error.
    await expect(importService.apply(zip.toBuffer(), user.id))
      .rejects.not.toThrow(/malware/i);
    expect(saveFileSpy).not.toHaveBeenCalled();
  });

  it('quota is enforced before anything is scanned or written (AC 6)', async () => {
    vi.spyOn(storageQuotaService, 'checkQuota').mockRejectedValue(new Error('Storage quota exceeded'));
    const projectsBefore = await db.select().from(projects);

    await expect(importService.apply(bundle, user.id)).rejects.toThrow(/quota/i);

    expect(scanner.scanned).toHaveLength(0);
    expect(saveFileSpy).not.toHaveBeenCalled();
    const projectsAfter = await db.select().from(projects);
    expect(projectsAfter.length).toBe(projectsBefore.length);
  });

  it('a row referencing a blob absent from the bundle imports with the ref unset (AC 7)', async () => {
    const result = await importService.apply(bundle, user.id);

    const rows = await importedTemplates(result.rootId);
    const orphan = rows.find(r => r.name === 'Template Missing');
    expect(orphan).toBeDefined();
    // templates.fileRef is NOT NULL, so "unset" is the empty sentinel. What
    // matters is that the source system's ref did not come through.
    expect(orphan!.fileRef).toBe('');
    expect(orphan!.fileRef).not.toBe(MISSING_REF);

    const warning = result.warnings.find(w => w.type === 'missing_blob' && w.fileRef === MISSING_REF);
    expect(warning).toBeDefined();
    expect(warning!.entity).toBe('templates');
    expect(warning!.column).toBe('fileRef');

    // Absent is not malicious: the import still succeeded.
    expect(result.rootId).toBeTruthy();
  });
});
