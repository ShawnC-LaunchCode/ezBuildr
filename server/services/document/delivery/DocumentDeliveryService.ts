import type { InsertRunDocumentDelivery, RunDocumentDelivery, Workflow, WorkflowRun } from '@shared/schema';
import type { DeliveryAuditLogEntry, DeliveryDestination } from '@shared/types/delivery';
import type { FinalBlockConfig } from '@shared/types/stepConfigs';

import { createLogger } from '../../../logger';
import {
  type DbTransaction,
  organizationRepository,
  projectRepository,
  runDocumentDeliveryRepository,
  runGeneratedDocumentsRepository,
  userRepository,
  workflowRepository,
  workflowRunRepository,
} from '../../../repositories';
import {
  protectDeliveryDestination,
  redactDeliveryConfig,
} from '../../../utils/documentDeliverySecrets';
import { storageProvider } from '../../storage';
import { runDataService } from '../../workflow-runs/RunDataService';

import {
  cloudStorageDeliveryAdapter,
  type DeliveryAdapter,
  emailDeliveryAdapter,
  type GeneratedDocumentItem,
  webhookDeliveryAdapter,
} from './adapters';

const logger = createLogger({ module: 'document-delivery-service' });

const BASE_RETRY_DELAY_MS = 5_000; // 5 seconds
const MAX_RETRY_DELAY_MS = 600_000; // 10 minutes
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(val?: string | null): boolean {
  if (!val) {
    return false;
  }
  return UUID_REGEX.test(val);
}

/**
 * Sanitizes a RunDocumentDelivery entity for client responses,
 * stripping sensitive secrets (API keys, webhook secrets).
 */
export function sanitizeDeliveryForResponse(delivery: RunDocumentDelivery): Record<string, unknown> {
  return {
    ...delivery,
    destinationConfig: redactDeliveryConfig(delivery.destinationConfig),
  };
}

interface DeliveryContext {
  run: WorkflowRun;
  documents: GeneratedDocumentItem[];
  stepValues: Record<string, unknown>;
}

interface DocumentDeliveryDependencies {
  deliveryRepo: typeof runDocumentDeliveryRepository;
  runRepo: typeof workflowRunRepository;
  workflowRepo: typeof workflowRepository;
  projectRepo: typeof projectRepository;
  userRepo: typeof userRepository;
  organizationRepo: typeof organizationRepository;
  generatedDocumentRepo: typeof runGeneratedDocumentsRepository;
}

export class DocumentDeliveryService {
  private isProcessing = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private readonly deliveryRepo: typeof runDocumentDeliveryRepository;
  private readonly runRepo: typeof workflowRunRepository;
  private readonly workflowRepo: typeof workflowRepository;
  private readonly projectRepo: typeof projectRepository;
  private readonly userRepo: typeof userRepository;
  private readonly organizationRepo: typeof organizationRepository;
  private readonly generatedDocumentRepo: typeof runGeneratedDocumentsRepository;

  constructor(dependencies: Partial<DocumentDeliveryDependencies> = {}) {
    this.deliveryRepo = dependencies.deliveryRepo ?? runDocumentDeliveryRepository;
    this.runRepo = dependencies.runRepo ?? workflowRunRepository;
    this.workflowRepo = dependencies.workflowRepo ?? workflowRepository;
    this.projectRepo = dependencies.projectRepo ?? projectRepository;
    this.userRepo = dependencies.userRepo ?? userRepository;
    this.organizationRepo = dependencies.organizationRepo ?? organizationRepository;
    this.generatedDocumentRepo = dependencies.generatedDocumentRepo ?? runGeneratedDocumentsRepository;
  }

  /**
   * Calculates exponential backoff delay with jitter
   */
  calculateBackoff(attempt: number): number {
    const exponent = Math.min(attempt, 6);
    const delay = Math.min(BASE_RETRY_DELAY_MS * (2 ** exponent), MAX_RETRY_DELAY_MS);
    // Add 10% jitter
    const jitter = Math.random() * 0.1 * delay;
    return Math.floor(delay + jitter);
  }

  private async resolvePrincipalTenantId(
    ownerType: string | null,
    ownerUuid: string | null,
    tx?: DbTransaction
  ): Promise<string | null> {
    if (!ownerUuid) {
      return null;
    }
    if (ownerType === 'user') {
      const user = await this.userRepo.findById(ownerUuid, tx);
      return user?.tenantId && isValidUuid(user.tenantId) ? user.tenantId : null;
    }
    if (ownerType === 'org') {
      const organization = await this.organizationRepo.findById(ownerUuid, tx);
      return organization?.tenantId && isValidUuid(organization.tenantId)
        ? organization.tenantId
        : null;
    }
    return null;
  }

  /** Resolve user/org ownership to the tenant that authorizes delivery access. */
  private async resolveTenantId(
    run: WorkflowRun,
    workflow: Workflow | null | undefined,
    tx?: DbTransaction
  ): Promise<string | null> {
    // 1. Runs inherit the workflow's real principal after ownership transfers.
    const runOwnerTenantId = await this.resolvePrincipalTenantId(
      run.ownerType,
      run.ownerUuid,
      tx
    );
    if (runOwnerTenantId) {
      return runOwnerTenantId;
    }

    // 2. Project tenant
    if (workflow?.projectId) {
      const project = await this.projectRepo.findById(workflow.projectId, tx);
      if (project && isValidUuid(project.tenantId)) {
        return project.tenantId;
      }
    }

    // 3. Unfiled workflows are owned by a user or organization principal.
    const workflowOwnerTenantId = await this.resolvePrincipalTenantId(
      workflow?.ownerType ?? null,
      workflow?.ownerUuid ?? null,
      tx
    );
    if (workflowOwnerTenantId) {
      return workflowOwnerTenantId;
    }

    // 4. Legacy workflow user fields.
    const userId = workflow?.creatorId ?? workflow?.ownerId;
    if (userId) {
      const user = await this.userRepo.findById(userId, tx);
      if (user && isValidUuid(user.tenantId)) {
        return user.tenantId;
      }
    }

    // 5. Authenticated respondent who created the run.
    if (run.createdBy?.startsWith('creator:')) {
      const runUserId = run.createdBy.replace('creator:', '');
      const user = await this.userRepo.findById(runUserId, tx);
      if (user && isValidUuid(user.tenantId)) {
        return user.tenantId;
      }
    }

    return null;
  }

  /**
   * Enqueue deliveries configured on the final block for a completed workflow run.
   */
  async enqueueDeliveriesForRun(
    runId: string,
    finalBlockConfig: FinalBlockConfig,
    tx?: DbTransaction
  ): Promise<RunDocumentDelivery[]> {
    const destinations = finalBlockConfig?.deliveryDestinations;
    if (!destinations || !Array.isArray(destinations) || destinations.length === 0) {
      logger.debug({ runId }, 'No document delivery destinations configured');
      return [];
    }

    const enabledDestinations = destinations.filter((dest: DeliveryDestination) => dest.enabled !== false);
    if (enabledDestinations.length === 0) {
      logger.debug({ runId }, 'All delivery destinations are disabled');
      return [];
    }

    const run = await this.runRepo.findById(runId, tx);
    if (!run) {
      throw new Error(`Workflow run ${runId} not found`);
    }

    const workflow = await this.workflowRepo.findById(run.workflowId, tx);
    const tenantId = await this.resolveTenantId(run, workflow, tx);

    const deliveryInserts: InsertRunDocumentDelivery[] = enabledDestinations.map((dest: DeliveryDestination) => {
      const protectedDestination = protectDeliveryDestination(dest) as DeliveryDestination;
      return {
        runId,
        workflowId: run.workflowId,
        tenantId,
        destinationType: dest.type,
        destinationConfig: protectedDestination.config,
        status: 'pending',
        attempts: 0,
        maxAttempts: 5,
        nextAttemptAt: new Date(),
        auditLog: [],
        metadata: {
          destinationName: dest.name,
          destinationId: dest.id,
        },
      };
    });

    const created = await this.deliveryRepo.createDeliveries(deliveryInserts, tx);
    logger.info(
      { runId, count: created.length, destinations: enabledDestinations.map((d: DeliveryDestination) => d.type) },
      'Enqueued document deliveries for run'
    );

    // Trigger processing asynchronously outside transaction
    if (!tx) {
      setImmediate(() => {
        void this.processPendingDeliveries();
      });
    }

    return created;
  }

  /**
   * Gather document URLs / keys and step values for template interpolation.
   */
  private async buildDeliveryContext(runId: string, tx?: DbTransaction): Promise<DeliveryContext> {
    const run = await this.runRepo.findById(runId, tx);
    if (!run) {
      throw new Error(`Workflow run ${runId} not found`);
    }

    const generatedDocs = await this.generatedDocumentRepo.findByRunId(runId, tx);
    const runData = await runDataService.buildForRun(runId, run.workflowId, tx);

    const documents: GeneratedDocumentItem[] = [];
    for (const doc of generatedDocs) {
      let fileUrl = doc.fileUrl !== '' ? doc.fileUrl : '';
      if (fileUrl === '' && doc.storageKey !== '') {
        try {
          fileUrl = await storageProvider.getSignedUrl(doc.storageKey, 3600);
        } catch {
          fileUrl = '';
        }
      }

      documents.push({
        fileName: doc.fileName,
        storageKey: doc.storageKey,
        mimeType: doc.mimeType ?? 'application/octet-stream',
        fileSize: doc.fileSize ?? 0,
        fileUrl,
      });
    }

    return {
      run,
      documents,
      stepValues: { ...runData.byStepId, ...runData.byAlias },
    };
  }

  /**
   * Selects the appropriate delivery adapter based on destinationType
   */
  private getAdapter(type: string): DeliveryAdapter | null {
    switch (type) {
      case 'email':
        return emailDeliveryAdapter;
      case 'webhook':
        return webhookDeliveryAdapter;
      case 'cloud_storage':
        return cloudStorageDeliveryAdapter;
      default:
        return null;
    }
  }

  /**
   * Process a single delivery job
   */
  async processDelivery(delivery: RunDocumentDelivery): Promise<RunDocumentDelivery> {
    const adapter = this.getAdapter(delivery.destinationType);
    if (!adapter) {
      const errorMsg = `Unsupported delivery destination type: ${delivery.destinationType}`;
      const auditEntry: DeliveryAuditLogEntry = {
        timestamp: new Date().toISOString(),
        attempt: delivery.attempts + 1,
        status: 'failed',
        error: errorMsg,
      };
      return this.deliveryRepo.markRetryOrFailed(
        delivery.id,
        {
          error: errorMsg,
          auditEntry,
          isFinalFailure: true,
        }
      );
    }

    let context: DeliveryContext;
    try {
      context = await this.buildDeliveryContext(delivery.runId);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : `Workflow run context failed: ${delivery.runId}`;
      const auditEntry: DeliveryAuditLogEntry = {
        timestamp: new Date().toISOString(),
        attempt: delivery.attempts + 1,
        status: 'failed',
        error: errorMsg,
      };
      return this.deliveryRepo.markRetryOrFailed(
        delivery.id,
        {
          error: errorMsg,
          auditEntry,
          isFinalFailure: true,
        }
      );
    }

    const result = await adapter.deliver({
      delivery,
      documents: context.documents,
      stepValues: context.stepValues,
      workflowRun: context.run,
    });

    const currentAttempt = delivery.attempts + 1;
    const now = new Date();

    if (result.success) {
      const auditEntry: DeliveryAuditLogEntry = {
        timestamp: now.toISOString(),
        attempt: currentAttempt,
        status: 'delivered',
        responseCode: result.responseCode,
        durationMs: result.durationMs,
        metadata: result.metadata,
      };
      return this.deliveryRepo.markDelivered(delivery.id, auditEntry);
    } else {
      const isFinalFailure = currentAttempt >= delivery.maxAttempts;
      const delayMs = this.calculateBackoff(delivery.attempts);
      const nextAttemptAt = isFinalFailure ? null : new Date(now.getTime() + delayMs);

      const auditEntry: DeliveryAuditLogEntry = {
        timestamp: now.toISOString(),
        attempt: currentAttempt,
        status: isFinalFailure ? 'failed' : 'retry',
        error: result.error ?? 'Delivery failed',
        responseCode: result.responseCode,
        durationMs: result.durationMs,
        metadata: result.metadata,
      };

      return this.deliveryRepo.markRetryOrFailed(
        delivery.id,
        {
          error: result.error ?? 'Delivery failed',
          auditEntry,
          nextAttemptAt,
          isFinalFailure,
        }
      );
    }
  }

  /**
   * Process all pending/retry delivery jobs ready for claiming
   */
  async processPendingDeliveries(limit = 10): Promise<number> {
    if (this.isProcessing) {
      return 0;
    }

    this.isProcessing = true;
    let processedCount = 0;

    try {
      const batch = await this.deliveryRepo.claimBatch({ limit });
      for (const delivery of batch) {
        try {
          await this.processDelivery(delivery);
          processedCount++;
        } catch (err) {
          logger.error(
            { deliveryId: delivery.id, error: err },
            'Unhandled error processing delivery job'
          );
        }
      }
    } catch (err) {
      logger.error({ error: err }, 'Failed to claim and process delivery batch');
    } finally {
      this.isProcessing = false;
    }

    return processedCount;
  }

  private async verifyRunTenantOwnership(
    runId: string,
    tenantId: string,
    tx?: DbTransaction
  ): Promise<WorkflowRun> {
    const run = await this.runRepo.findById(runId, tx);
    if (!run) {
      throw new Error('Workflow run not found');
    }
    const workflow = await this.workflowRepo.findById(run.workflowId, tx);
    const resolvedTenantId = await this.resolveTenantId(run, workflow, tx);
    if (resolvedTenantId !== tenantId) {
      throw new Error('Access denied');
    }
    return run;
  }

  async listDeliveriesForRun(runId: string, tenantId: string): Promise<RunDocumentDelivery[]> {
    await this.verifyRunTenantOwnership(runId, tenantId);
    return this.deliveryRepo.findByRunIdAndTenantId(runId, tenantId);
  }

  async getDeliveryForTenant(deliveryId: string, tenantId: string): Promise<RunDocumentDelivery> {
    const delivery = await this.deliveryRepo.findByIdAndTenantId(deliveryId, tenantId);
    if (!delivery) {
      throw new Error('Document delivery not found');
    }
    return delivery;
  }

  /** Reset and retry a failed delivery job after tenant ownership is verified. */
  async retryDelivery(deliveryId: string, tenantId: string): Promise<RunDocumentDelivery> {
    const delivery = await this.getDeliveryForTenant(deliveryId, tenantId);
    if (delivery.status !== 'failed') {
      throw Object.assign(new Error('Only failed document deliveries can be retried'), {
        statusCode: 400,
      });
    }
    const updated = await this.deliveryRepo.resetForRetry(deliveryId, tenantId);
    if (!updated) {
      throw new Error('Document delivery not found');
    }
    void this.processPendingDeliveries();
    return updated;
  }

  /**
   * Start the background delivery worker
   */
  startWorker(intervalMs = 5000): void {
    if (this.pollInterval !== null) {
      return;
    }

    logger.info({ intervalMs }, 'Starting document delivery worker');
    this.pollInterval = setInterval(() => {
      void this.processPendingDeliveries();
    }, intervalMs);

    if (this.pollInterval.unref !== undefined) {
      this.pollInterval.unref();
    }
  }

  /**
   * Stop the background delivery worker
   */
  stopWorker(): void {
    if (this.pollInterval !== null) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      logger.info('Stopped document delivery worker');
    }
  }
}

export const documentDeliveryService = new DocumentDeliveryService();
