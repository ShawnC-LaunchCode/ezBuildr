import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import type { WorkflowRun } from '@shared/schema';

import { workflowRunRepository } from '../../repositories';
import { storageProvider } from '../storage';
import { logger } from '../../logger';
import { withTenant, withVerifiedIdentifier } from '../../utils/rlsContext';

const RUN_NOT_FOUND = 'Run not found';
const PREVIEW_TTL_MS = 60 * 60 * 1000;
const OPERATION_LEASE_MS = 5 * 60 * 1000;

/** Persisted policy shared by HTTP execution, background jobs and preview-only cleanup. */
export class RunPreviewPolicyService {
  private readonly operation = new AsyncLocalStorage<{ runId: string; owner: string }>();

  constructor(private readonly repository?: typeof workflowRunRepository, private readonly storage = storageProvider) {}

  private get runRepo(): typeof workflowRunRepository { return this.repository ?? workflowRunRepository; }

  artifactDirectory(runId: string): string {
    if (!/^[a-f0-9-]{36}$/i.test(runId)) { throw new Error('Invalid preview run identifier'); }
    return path.join(tmpdir(), 'ezbuildr-preview', runId);
  }

  expiresAt(): Date { return new Date(Date.now() + PREVIEW_TTL_MS); }

  executionMode(runId: string): 'preview' | 'live' {
    return this.operation.getStore()?.runId === runId ? 'preview' : 'live';
  }

  assertActive(run: WorkflowRun): void {
    if (run.executionMode === 'preview' &&
      (run.previewRetiredAt !== null || !run.previewExpiresAt || run.previewExpiresAt <= new Date())) {
      throw new Error(RUN_NOT_FOUND);
    }
  }

  async resolve(runId: string): Promise<WorkflowRun> {
    const run = await this.runRepo.findById(runId);
    if (!run) { throw new Error(RUN_NOT_FOUND); }
    this.assertActive(run);
    return run;
  }

  async authorize(run: WorkflowRun, userId: string | undefined): Promise<void> {
    if (run.executionMode !== 'preview') { return; }
    if (!userId || run.createdBy !== userId) { throw new Error(RUN_NOT_FOUND); }
    const { workflowService } = await import('../WorkflowService');
    try { await workflowService.verifyAccess(run.workflowId, userId, 'edit'); }
    catch { throw new Error(RUN_NOT_FOUND); }
    this.assertActive(run);
  }

  async requireLive(runId: string): Promise<void> {
    const run = await this.runRepo.findById(runId);
    if (!run || run.executionMode === 'preview') { throw new Error(RUN_NOT_FOUND); }
  }

  async execute<T>(runId: string, action: () => Promise<T>): Promise<T> {
    const run = await this.resolve(runId);
    if (run.executionMode !== 'preview') { return action(); }
    const nested = this.operation.getStore();
    if (nested?.runId === runId) {
      if (run.previewLeaseOwner !== nested.owner) { throw new Error('Access denied - preview operation expired'); }
      return action();
    }
    const owner = randomUUID();
    const claimed = await this.runRepo.claimPreview(runId, owner, new Date(Date.now() + OPERATION_LEASE_MS));
    if (!claimed) { throw new Error('Access denied - preview session is busy or expired'); }
    try { return await this.operation.run({ runId, owner }, action); }
    finally { await this.runRepo.releasePreview(runId, owner); }
  }

  async executeForRun<T>(run: WorkflowRun, action: () => Promise<T>): Promise<T> {
    return run.executionMode === 'preview' ? this.execute(run.id, action) : action();
  }

  /** Register ownership before I/O, including ZIPs and uploads whose row write fails. */
  async upload(runId: string, key: string, bytes: Buffer, mimeType: string): Promise<void> {
    const run = await this.resolve(runId);
    if (run.executionMode !== 'preview') { throw new Error('Access denied - preview artifacts only'); }
    if (!key.startsWith(`runs/${runId}/documents/`)) { throw new Error('Access denied - invalid preview artifact'); }
    await this.runRepo.registerPreviewArtifact(runId, key);
    await this.storage.uploadFile(key, bytes, mimeType);
    try { await this.resolve(runId); }
    catch (error) {
      await this.storage.deleteFile(key);
      throw error;
    }
  }

  async retire(runId: string, userId: string): Promise<void> {
    const run = await this.runRepo.findById(runId);
    if (!run || run.executionMode !== 'preview') { throw new Error(RUN_NOT_FOUND); }
    // Retiring twice is safe, but still requires the same author and current edit access.
    await this.authorize({ ...run, previewRetiredAt: null, previewExpiresAt: this.expiresAt() }, userId);
    await this.runRepo.retirePreview(runId);
  }

  async cleanupBatch(): Promise<void> {
    for (const run of await this.runRepo.findRetirablePreviews()) {
      try {
        await this.runRepo.retirePreview(run.id);
        if (run.previewLeaseExpiresAt && run.previewLeaseExpiresAt > new Date()) { continue; }
        for (const key of run.previewArtifacts) {
          if (!key.startsWith(`runs/${run.id}/documents/`)) { throw new Error('Invalid preview artifact ownership'); }
          await this.storage.deleteFile(key);
        }
        // Rendering scratch is preview-owned too, including interrupted uploads.
        await rm(this.artifactDirectory(run.id), { recursive: true, force: true });
        // Both providers swallow some delete errors. A successful call is not proof.
        const remaining = await this.storage.list(`runs/${run.id}/documents/`);
        if (remaining.length > 0) { throw new Error('Preview artifact cleanup is pending'); }
        const { workflowTenantResolver } = await import('../WorkflowTenantResolver');
        const tenantId = await withVerifiedIdentifier('app.current_workflow_id', run.workflowId,
          tx => workflowTenantResolver.resolveForWorkflowId(run.workflowId, tx));
        if (!tenantId) { throw new Error(RUN_NOT_FOUND); }
        await withTenant(tenantId, tx => this.runRepo.clearRetiredPreviewData(run.id, tx));
      } catch (error) { logger.warn({ error, runId: run.id }, 'Preview cleanup will retry'); }
    }
  }
}

export const runPreviewPolicyService = new RunPreviewPolicyService();
