import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

import type { FileUploadConfig, FileUploadValue, ListConfig, ListField } from '@shared/types/stepConfigs';
import { FileUploadConfigSchema } from '@shared/validation/stepConfigSchemas';

import {
  projectRepository,
  stepValueRepository,
  workflowRepository,
  workflowRunRepository,
} from '../repositories';
import { createError } from '../utils/errors';
import { getCurrentTenantId, withCurrentTenant } from '../utils/rlsContext';

import { isFileTypeAccepted, MAX_FILE_SIZE } from './fileService';
import { runDefinitionProvider } from './workflow-runs/RunDefinitionProvider';
import { virusScanner, type IVirusScanner } from './security/VirusScanner';
import { storageProvider } from './storage';
import type { StorageProvider } from './storage/types';
import { storageQuotaService, type StorageQuotaService } from './StorageQuotaService';
import { workflowService } from './WorkflowService';

interface TemporaryRunUpload {
  path: string;
  originalName: string;
  mimeType: string;
  size: number;
}

interface UploadAuthorization {
  userId?: string;
  runTokenAuthorized: boolean;
}

interface UploadRequest extends UploadAuthorization {
  runId: string;
  stepId: string;
  fieldId?: string;
  files: TemporaryRunUpload[];
}

interface StoredFileRequest extends UploadAuthorization {
  runId: string;
  stepId: string;
  storageKey: string;
}

export interface UploadedRunFile extends FileUploadValue {
  url: string;
}

export interface RunFileUploadResult {
  files: UploadedRunFile[];
  /** Present for top-level file questions, which are persisted atomically. */
  value?: FileUploadValue[];
}

interface RunUploadContext {
  run: NonNullable<Awaited<ReturnType<typeof workflowRunRepository.findById>>>;
  tenantId: string;
}

type RunRepositoryPort = Pick<typeof workflowRunRepository, 'findById'>;
type WorkflowRepositoryPort = Pick<typeof workflowRepository, 'findById'>;
type ProjectRepositoryPort = Pick<typeof projectRepository, 'findById'>;
type StepValueRepositoryPort = Pick<typeof stepValueRepository, 'findByRunAndStep' | 'upsert'>;
type DefinitionProviderPort = Pick<typeof runDefinitionProvider, 'getDefinition'>;
type WorkflowAccessPort = Pick<typeof workflowService, 'verifyAccess'>;

interface RunFileUploadDependencies {
  runRepo: RunRepositoryPort;
  workflowRepo: WorkflowRepositoryPort;
  projectRepo: ProjectRepositoryPort;
  valueRepo: StepValueRepositoryPort;
  definitionProvider: DefinitionProviderPort;
  workflowAccess: WorkflowAccessPort;
  storage: Pick<StorageProvider, 'uploadStream' | 'deleteFile' | 'getSignedUrl'>;
  quota: Pick<StorageQuotaService, 'checkQuota'>;
  scannerFactory: () => IVirusScanner;
}

function normalizeFileValues(value: unknown): FileUploadValue[] {
  const candidates = Array.isArray(value) ? value : value === null || value === undefined ? [] : [value];
  return candidates.filter((candidate): candidate is FileUploadValue => (
    typeof candidate === 'object'
    && candidate !== null
    && typeof (candidate as Partial<FileUploadValue>).fileId === 'string'
    && typeof (candidate as Partial<FileUploadValue>).storageKey === 'string'
  ));
}

function parseUploadConfig(config: unknown): FileUploadConfig {
  const parsed = FileUploadConfigSchema.safeParse(config);
  if (!parsed.success) {
    throw createError.validation('File upload configuration is invalid', parsed.error.issues);
  }
  return parsed.data ?? {};
}

function findFileField(fields: ListField[], fieldId: string): Extract<ListField, { kind: 'question' }> | undefined {
  for (const field of fields) {
    if (field.kind === 'question' && field.id === fieldId) {
      return field;
    }
    if (field.kind === 'list') {
      const nested = findFileField(field.list.fields, fieldId);
      if (nested) { return nested; }
    }
  }
  return undefined;
}

function safeExtension(filename: string): string {
  return path.extname(path.basename(filename)).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 16);
}

export class RunFileUploadService {
  private runRepo: RunRepositoryPort;
  private workflowRepo: WorkflowRepositoryPort;
  private projectRepo: ProjectRepositoryPort;
  private valueRepo: StepValueRepositoryPort;
  private definitionProvider: DefinitionProviderPort;
  private workflowAccess: WorkflowAccessPort;
  private storage: Pick<StorageProvider, 'uploadStream' | 'deleteFile' | 'getSignedUrl'>;
  private quota: Pick<StorageQuotaService, 'checkQuota'>;
  private scannerFactory: () => IVirusScanner;

  constructor(dependencies: Partial<RunFileUploadDependencies> = {}) {
    this.runRepo = dependencies.runRepo ?? workflowRunRepository;
    this.workflowRepo = dependencies.workflowRepo ?? workflowRepository;
    this.projectRepo = dependencies.projectRepo ?? projectRepository;
    this.valueRepo = dependencies.valueRepo ?? stepValueRepository;
    this.definitionProvider = dependencies.definitionProvider ?? runDefinitionProvider;
    this.workflowAccess = dependencies.workflowAccess ?? workflowService;
    this.storage = dependencies.storage ?? storageProvider;
    this.quota = dependencies.quota ?? storageQuotaService;
    this.scannerFactory = dependencies.scannerFactory ?? virusScanner;
  }

  async uploadFiles(request: UploadRequest): Promise<RunFileUploadResult> {
    const context = await this.resolveContext(request.runId, request.userId, request.runTokenAuthorized);
    const { config, isTopLevelFileStep } = await this.resolveUploadConfig(
      context.run,
      request.stepId,
      request.fieldId,
    );

    if (request.files.length === 0) {
      throw createError.validation('At least one file is required');
    }

    const existing = isTopLevelFileStep
      ? normalizeFileValues((await this.valueRepo.findByRunAndStep(request.runId, request.stepId))?.value)
      : [];
    const maxFiles = config.maxFiles ?? 1;
    if (existing.length + request.files.length > maxFiles) {
      throw createError.validation(`Maximum ${maxFiles} file${maxFiles === 1 ? '' : 's'} allowed`);
    }

    for (const file of request.files) {
      const maxSize = Math.min(config.maxSize ?? MAX_FILE_SIZE, MAX_FILE_SIZE);
      if (file.size > maxSize) {
        throw createError.validation(`File "${path.basename(file.originalName)}" exceeds the ${maxSize}-byte limit`);
      }
      if (!isFileTypeAccepted(file.mimeType, config.allowedTypes)) {
        throw createError.invalidFileType(`File type "${file.mimeType}" is not allowed`);
      }
    }

    await this.quota.checkQuota(
      context.tenantId,
      request.files.reduce((total, file) => total + file.size, 0),
    );

    const scanner = this.scannerFactory();
    for (const file of request.files) {
      const buffer = await fs.promises.readFile(file.path);
      const scan = await scanner.scan(buffer, path.basename(file.originalName));
      if (!scan.safe) {
        throw createError.validation(`File rejected: potential malware detected (${String(scan.threatName)})`);
      }
    }

    const uploaded: UploadedRunFile[] = [];
    const storedKeys: string[] = [];
    try {
      for (const file of request.files) {
        const fileId = randomUUID();
        const storageKey = this.buildStorageKey(
          context.tenantId,
          request.runId,
          request.stepId,
          fileId,
          file.originalName,
        );
        await this.storage.uploadStream(
          storageKey,
          fs.createReadStream(file.path),
          file.size,
          file.mimeType,
          { tenantId: context.tenantId, runId: request.runId, stepId: request.stepId, fileId },
        );
        storedKeys.push(storageKey);
        const url = await this.storage.getSignedUrl(storageKey, 300);
        uploaded.push({
          fileId,
          filename: path.basename(file.originalName),
          storageKey,
          url,
          mimeType: file.mimeType,
          size: file.size,
          uploadedAt: new Date().toISOString(),
        });
      }

      if (!isTopLevelFileStep) {
        return { files: uploaded };
      }

      const persisted = [...existing, ...uploaded.map(({ url: _url, ...file }) => file)];
      await this.valueRepo.upsert({ runId: request.runId, stepId: request.stepId, value: persisted });
      return { files: uploaded, value: persisted };
    } catch (error) {
      await Promise.all(storedKeys.map(storageKey => this.storage.deleteFile(storageKey)));
      throw error;
    }
  }

  async getSignedUrl(request: StoredFileRequest): Promise<string> {
    const context = await this.resolveContext(request.runId, request.userId, request.runTokenAuthorized, false);
    this.assertScopedKey(context.tenantId, request.runId, request.stepId, request.storageKey);
    return this.storage.getSignedUrl(request.storageKey, 300);
  }

  async deleteFile(request: StoredFileRequest): Promise<FileUploadValue[] | undefined> {
    const context = await this.resolveContext(request.runId, request.userId, request.runTokenAuthorized);
    this.assertScopedKey(context.tenantId, request.runId, request.stepId, request.storageKey);

    const definition = await this.definitionProvider.getDefinition(context.run);
    const step = definition.steps.find(candidate => candidate.id === request.stepId);
    let nextValue: FileUploadValue[] | undefined;
    if (step?.type === 'file_upload') {
      const current = normalizeFileValues((await this.valueRepo.findByRunAndStep(request.runId, request.stepId))?.value);
      nextValue = current.filter(file => file.storageKey !== request.storageKey);
      await this.valueRepo.upsert({ runId: request.runId, stepId: request.stepId, value: nextValue });
    }

    await this.storage.deleteFile(request.storageKey);
    return nextValue;
  }

  private async resolveContext(
    runId: string,
    userId: string | undefined,
    runTokenAuthorized: boolean,
    requireMutable = true,
  ): Promise<RunUploadContext> {
    const run = await this.runRepo.findById(runId);
    if (!run) { throw createError.notFound('Run', runId); }
    if (requireMutable && run.completed) { throw createError.runCompleted(); }

    if (!runTokenAuthorized) {
      if (!userId) { throw createError.unauthorized(); }
      await this.workflowAccess.verifyAccess(run.workflowId, userId);
    }

    // RLS-4 precondition 2 (closed): `workflows`/`projects` are RLS-covered,
    // and these reads used to run on the bare pool with no tenant. For the
    // authenticated path, `hybridAuth` has already pinned the real tenant
    // into the async context by this point (0028); for the run-token path,
    // `runTokenAuth` now does the same via `app.current_workflow_id`
    // (0030) before this method is ever reached. Either way there is a real
    // ambient tenant to use here now — thread it through instead of
    // bypassing RLS's whole point via the bare pool.
    //
    // STB-23: the old code derived tenantId ONLY via workflow.projectId ->
    // project.tenantId, so any upload against an "Unfiled" workflow
    // (projectId null - a supported, first-class state, see
    // client/src/pages/NewWorkflow.tsx and PUT /api/workflows/:id/move)
    // failed with a misleading "Project for run not found". The ambient
    // tenant pinned above is already real and authoritative for both auth
    // paths, so use it as the primary source and only fall back to the
    // project's tenant when the ambient one is unavailable (e.g. unit tests
    // that call this service directly with no request-scoped context).
    return withCurrentTenant(async (tx) => {
      const workflow = await this.workflowRepo.findById(run.workflowId, tx);
      if (!workflow) { throw createError.notFound('Workflow for run'); }

      let tenantId = getCurrentTenantId();
      if (!tenantId && workflow.projectId) {
        const project = await this.projectRepo.findById(workflow.projectId, tx);
        tenantId = project?.tenantId ?? undefined;
      }
      if (!tenantId) { throw createError.notFound('Tenant for run'); }
      return { run, tenantId };
    });
  }

  private async resolveUploadConfig(
    run: RunUploadContext['run'],
    stepId: string,
    fieldId: string | undefined,
  ): Promise<{ config: FileUploadConfig; isTopLevelFileStep: boolean }> {
    const definition = await this.definitionProvider.getDefinition(run);
    const step = definition.steps.find(candidate => candidate.id === stepId);
    if (!step) { throw createError.notFound('Step', stepId); }

    if (step.type === 'file_upload' && fieldId === undefined) {
      return { config: parseUploadConfig(step.config), isTopLevelFileStep: true };
    }
    if (step.type !== 'list' || fieldId === undefined) {
      throw createError.validation('The requested step is not a file upload question');
    }

    const listConfig = step.config as ListConfig | null;
    const field = listConfig?.fields ? findFileField(listConfig.fields, fieldId) : undefined;
    if (!field || field.type !== 'file_upload') {
      throw createError.validation('The requested list field is not a file upload question');
    }
    return { config: parseUploadConfig(field.config), isTopLevelFileStep: false };
  }

  private buildStorageKey(
    tenantId: string,
    runId: string,
    stepId: string,
    fileId: string,
    filename: string,
  ): string {
    return `tenants/${tenantId}/runs/${runId}/steps/${stepId}/${fileId}${safeExtension(filename)}`;
  }

  private assertScopedKey(
    tenantId: string,
    runId: string,
    stepId: string,
    storageKey: string,
  ): void {
    const prefix = `tenants/${tenantId}/runs/${runId}/steps/${stepId}/`;
    if (!storageKey.startsWith(prefix) || storageKey.includes('..')) {
      throw createError.forbidden('Access denied - file does not belong to this run step');
    }
  }
}

export const runFileUploadService = new RunFileUploadService();
