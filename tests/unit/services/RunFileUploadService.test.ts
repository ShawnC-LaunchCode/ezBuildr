import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { Readable } from 'stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RunFileUploadService } from '../../../server/services/RunFileUploadService';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const WORKFLOW_ID = '22222222-2222-4222-8222-222222222222';
const PROJECT_ID = '33333333-3333-4333-8333-333333333333';
const TENANT_ID = '44444444-4444-4444-8444-444444444444';
const STEP_ID = '55555555-5555-4555-8555-555555555555';

describe('RunFileUploadService', () => {
  let tempDir: string;
  let filePath: string;
  const runRepo = { findById: vi.fn() };
  const workflowRepo = { findById: vi.fn() };
  const projectRepo = { findById: vi.fn() };
  const valueRepo = { findByRunAndStep: vi.fn(), upsert: vi.fn() };
  const definitionProvider = { getDefinition: vi.fn() };
  const workflowAccess = { verifyAccess: vi.fn() };
  const storage = {
    uploadStream: vi.fn(),
    deleteFile: vi.fn(),
    getSignedUrl: vi.fn(),
  };
  const quota = { checkQuota: vi.fn() };
  const scanner = { scan: vi.fn(), healthCheck: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'run-upload-service-'));
    filePath = path.join(tempDir, 'brief.pdf');
    await fs.writeFile(filePath, Buffer.from('%PDF-1.4 test'));
    runRepo.findById.mockResolvedValue({ id: RUN_ID, workflowId: WORKFLOW_ID, completed: false });
    workflowRepo.findById.mockResolvedValue({ id: WORKFLOW_ID, projectId: PROJECT_ID });
    projectRepo.findById.mockResolvedValue({ id: PROJECT_ID, tenantId: TENANT_ID });
    valueRepo.findByRunAndStep.mockResolvedValue(undefined);
    valueRepo.upsert.mockResolvedValue({});
    definitionProvider.getDefinition.mockResolvedValue({
      sections: [],
      logicRules: [],
      source: 'live',
      steps: [{ id: STEP_ID, type: 'file_upload', config: { allowedTypes: ['application/pdf'], maxFiles: 2 } }],
    });
    workflowAccess.verifyAccess.mockResolvedValue({ id: WORKFLOW_ID });
    storage.uploadStream.mockImplementation(async (key: string, stream: Readable) => {
      stream.destroy();
      return key;
    });
    storage.getSignedUrl.mockResolvedValue('/api/storage/files/signed');
    storage.deleteFile.mockResolvedValue(undefined);
    quota.checkQuota.mockResolvedValue(undefined);
    scanner.scan.mockResolvedValue({ safe: true, scannerName: 'test', scannedAt: new Date(), scanDurationMs: 1 });
    scanner.healthCheck.mockResolvedValue(true);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  function service(): RunFileUploadService {
    return new RunFileUploadService({
      runRepo: runRepo as never,
      workflowRepo: workflowRepo as never,
      projectRepo: projectRepo as never,
      valueRepo: valueRepo as never,
      definitionProvider: definitionProvider as never,
      workflowAccess: workflowAccess as never,
      storage,
      quota: quota as never,
      scannerFactory: () => scanner as never,
    });
  }

  const upload = () => service().uploadFiles({
    runId: RUN_ID,
    stepId: STEP_ID,
    files: [{ path: filePath, originalName: 'brief.pdf', mimeType: 'application/pdf', size: 13 }],
    runTokenAuthorized: true,
  });

  it('streams a scanned file to a tenant/run/step-scoped key and persists its answer', async () => {
    const result = await upload();

    expect(quota.checkQuota).toHaveBeenCalledWith(TENANT_ID, 13);
    expect(scanner.scan).toHaveBeenCalledWith(Buffer.from('%PDF-1.4 test'), 'brief.pdf');
    expect(storage.uploadStream).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^tenants/${TENANT_ID}/runs/${RUN_ID}/steps/${STEP_ID}/[0-9a-f-]+\\.pdf$`)),
      expect.anything(),
      13,
      'application/pdf',
      expect.objectContaining({ tenantId: TENANT_ID, runId: RUN_ID, stepId: STEP_ID }),
    );
    expect(valueRepo.upsert).toHaveBeenCalledWith(expect.objectContaining({
      runId: RUN_ID,
      stepId: STEP_ID,
      value: [expect.objectContaining({ filename: 'brief.pdf', mimeType: 'application/pdf', size: 13 })],
    }));
    expect(result.files[0].url).toBe('/api/storage/files/signed');
  });

  it('rejects a disallowed MIME type before quota, scanning, or storage', async () => {
    await expect(service().uploadFiles({
      runId: RUN_ID,
      stepId: STEP_ID,
      files: [{ path: filePath, originalName: 'brief.exe', mimeType: 'application/x-msdownload', size: 13 }],
      runTokenAuthorized: true,
    })).rejects.toThrow(/not allowed/i);

    expect(quota.checkQuota).not.toHaveBeenCalled();
    expect(scanner.scan).not.toHaveBeenCalled();
    expect(storage.uploadStream).not.toHaveBeenCalled();
  });

  it('enforces quota before scanning or writing', async () => {
    quota.checkQuota.mockRejectedValue(new Error('Storage quota exceeded'));

    await expect(upload()).rejects.toThrow(/quota exceeded/i);
    expect(scanner.scan).not.toHaveBeenCalled();
    expect(storage.uploadStream).not.toHaveBeenCalled();
  });

  it('requires creator access when the caller is not authenticated by the matching run token', async () => {
    workflowAccess.verifyAccess.mockRejectedValue(new Error('Access denied'));

    await expect(service().uploadFiles({
      runId: RUN_ID,
      stepId: STEP_ID,
      files: [{ path: filePath, originalName: 'brief.pdf', mimeType: 'application/pdf', size: 13 }],
      userId: 'other-user',
      runTokenAuthorized: false,
    })).rejects.toThrow(/Access denied/);
    expect(storage.uploadStream).not.toHaveBeenCalled();
  });

  it('supports a file question nested in a List without overwriting the parent answer', async () => {
    const fieldId = '66666666-6666-4666-8666-666666666666';
    definitionProvider.getDefinition.mockResolvedValue({
      sections: [],
      logicRules: [],
      source: 'live',
      steps: [{
        id: STEP_ID,
        type: 'list',
        config: {
          fields: [{
            kind: 'question',
            id: fieldId,
            alias: 'attachment',
            type: 'file_upload',
            title: 'Attachment',
            order: 0,
            config: { allowedTypes: ['application/pdf'] },
          }],
        },
      }],
    });

    const result = await service().uploadFiles({
      runId: RUN_ID,
      stepId: STEP_ID,
      fieldId,
      files: [{ path: filePath, originalName: 'brief.pdf', mimeType: 'application/pdf', size: 13 }],
      runTokenAuthorized: true,
    });

    expect(result.files).toHaveLength(1);
    expect(result.value).toBeUndefined();
    expect(valueRepo.upsert).not.toHaveBeenCalled();
  });
});
