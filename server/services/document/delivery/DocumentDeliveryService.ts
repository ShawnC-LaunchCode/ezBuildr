import type { InsertRunDocumentDelivery, RunDocumentDelivery, Workflow, WorkflowRun } from '@shared/schema';
import type { DeliveryAuditLogEntry, DeliveryDestination } from '@shared/types/delivery';
import type { FinalBlockConfig } from '@shared/types/stepConfigs';

import { createLogger } from '../../../logger';
import {
  type DbTransaction,
  runDocumentDeliveryRepository,
  runGeneratedDocumentsRepository,
  workflowRepository,
  workflowRunRepository,
} from '../../../repositories';
import {
  protectDeliveryDestination,
  redactDeliveryConfig,
} from '../../../utils/documentDeliverySecrets';
import { storageProvider } from '../../storage';
import { forEachTenant } from '../../../utils/forEachTenant';
import { withCurrentTenant, withTenant } from '../../../utils/rlsContext';
import { workflowTenantResolver } from '../../WorkflowTenantResolver';
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
  generatedDocumentRepo: typeof runGeneratedDocumentsRepository;
}

export class DocumentDeliveryService {
  private isProcessing = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private readonly deliveryRepo: typeof runDocumentDeliveryRepository;
  private readonly runRepo: typeof workflowRunRepository;
  private readonly workflowRepo: typeof workflowRepository;
  private readonly generatedDocumentRepo: typeof runGeneratedDocumentsRepository;

  constructor(dependencies: Partial<DocumentDeliveryDependencies> = {}) {
    this.deliveryRepo = dependencies.deliveryRepo ?? runDocumentDeliveryRepository;
    this.runRepo = dependencies.runRepo ?? workflowRunRepository;
    this.workflowRepo = dependencies.workflowRepo ?? workflowRepository;
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

  /**
   * Resolve user/org ownership to the tenant that authorizes delivery access.
   *
   * The precedence this method established in GH-170 now lives in
   * {@link WorkflowTenantResolver}, which is shared with the block runners and
   * branding — they previously carried copies that ignored ownership entirely.
   */
  private async resolveTenantId(
    run: WorkflowRun,
    workflow: Workflow | null | undefined,
    tx?: DbTransaction
  ): Promise<string | null> {
    return workflowTenantResolver.resolveForRun(run, workflow, tx);
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

    if (!tx) {
      // RLS-B1: every read below (`workflows`, and `users`/`projects` inside the
      // tenant resolver) and the insert itself are RLS-covered. On the bare pool a
      // non-owner role sees none of them, the tenant resolves to null, and the
      // enqueue throws — silently, because the caller only logs it. The caller
      // (`RunLifecycleService.generateDocuments`) always runs with a tenant in
      // context, pinned from the workflow when no request supplied one.
      const created = await withCurrentTenant((scoped) =>
        this.enqueueDeliveriesForRun(runId, finalBlockConfig, scoped));
      // Only after the enqueue transaction has committed, or the worker races it.
      if (created.length > 0) {
        setImmediate(() => {
          void this.processPendingDeliveries();
        });
      }
      return created;
    }

    const run = await this.runRepo.findById(runId, tx);
    if (!run) {
      throw new Error(`Workflow run ${runId} not found`);
    }

    if (run.executionMode === 'preview') { return []; }
    const workflow = await this.workflowRepo.findById(run.workflowId, tx);
    const tenantId = await this.resolveTenantId(run, workflow, tx);
    if (tenantId === null) {
      // Refuse rather than write an orphan. A null-tenant row is still claimed
      // and delivered by the worker (using the destination's credentials) but
      // is invisible and un-retryable through the API, because both read paths
      // and the tenant_isolation RLS policy filter on tenant_id.
      throw new Error(
        `Cannot enqueue document deliveries for run ${runId}: no tenant could be resolved from its workflow or owner`
      );
    }

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

    if (run.executionMode === 'preview') { throw new Error('Preview delivery is unsupported'); }
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
  /**
   * RLS-B1: the worker runs with no request and so no ambient tenant, but every
   * delivery row carries its own `tenant_id` (enqueue refuses to write one
   * without). Each DB step of a delivery runs in that tenant's transaction; the
   * adapter's network send runs between them, never inside one.
   *
   * A null tenant can only be a legacy row. It is invisible under enforcement
   * anyway, so it keeps the old unscoped behaviour rather than failing here.
   */
  private inDeliveryTenant<T>(
    delivery: RunDocumentDelivery,
    fn: (tx: DbTransaction | undefined) => Promise<T>
  ): Promise<T> {
    return delivery.tenantId ? withTenant(delivery.tenantId, fn) : fn(undefined);
  }

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
      return this.inDeliveryTenant(delivery, (tx) => this.deliveryRepo.markRetryOrFailed(
        delivery.id,
        {
          error: errorMsg,
          auditEntry,
          isFinalFailure: true,
        },
        tx
      ));
    }

    let context: DeliveryContext;
    try {
      context = await this.inDeliveryTenant(delivery, (tx) => this.buildDeliveryContext(delivery.runId, tx));
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : `Workflow run context failed: ${delivery.runId}`;
      const auditEntry: DeliveryAuditLogEntry = {
        timestamp: new Date().toISOString(),
        attempt: delivery.attempts + 1,
        status: 'failed',
        error: errorMsg,
      };
      return this.inDeliveryTenant(delivery, (tx) => this.deliveryRepo.markRetryOrFailed(
        delivery.id,
        {
          error: errorMsg,
          auditEntry,
          isFinalFailure: true,
        },
        tx
      ));
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
      return this.inDeliveryTenant(delivery, (tx) => this.deliveryRepo.markDelivered(delivery.id, auditEntry, tx));
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

      return this.inDeliveryTenant(delivery, (tx) => this.deliveryRepo.markRetryOrFailed(
        delivery.id,
        {
          error: result.error ?? 'Delivery failed',
          auditEntry,
          nextAttemptAt,
          isFinalFailure,
        },
        tx
      ));
    }
  }

  /**
   * RLS-B1: claim per tenant, via the background-job pattern (`forEachTenant`).
   * `run_document_deliveries` is RLS-covered and this worker has no tenant, so a
   * single pool-level claim returned zero rows under enforcement and every
   * delivery sat `pending` forever while the worker reported success.
   */
  private async claimAcrossTenants(limit: number): Promise<RunDocumentDelivery[]> {
    const claimed: RunDocumentDelivery[] = [];
    await forEachTenant('documentDeliveryClaim', async (_tenantId, tx) => {
      const remaining = limit - claimed.length;
      if (remaining <= 0) {
        return;
      }
      claimed.push(...await this.deliveryRepo.claimBatch({ limit: remaining }, tx));
    });
    return claimed;
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
      const batch = await this.claimAcrossTenants(limit);
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

  /**
   * RLS-5: the three tenant-facing methods below open a scoped transaction and
   * thread it down. `run_document_deliveries` is RLS-covered, and
   * `verifyRunTenantOwnership` additionally reads `workflows` (also covered,
   * ownership-derived) — so unscoped, the listing came back EMPTY for the very
   * tenant that owns the rows, and the ownership check saw no workflow. Reached
   * from `documentDelivery.routes`, which mounts `hybridAuth`, so the ambient
   * tenant is always populated here.
   *
   * The worker paths (`processPendingDeliveries`, `claimBatch`, the `mark*`
   * calls) do NOT use the ambient tenant: that would be whoever happened to
   * trigger the worker. They claim through `forEachTenant` and scope each
   * delivery to its own row's tenant instead (RLS-B1).
   */
  async listDeliveriesForRun(runId: string, tenantId: string): Promise<RunDocumentDelivery[]> {
    return withCurrentTenant(async (tx) => {
      await this.verifyRunTenantOwnership(runId, tenantId, tx);
      return this.deliveryRepo.findByRunIdAndTenantId(runId, tenantId, tx);
    });
  }

  async getDeliveryForTenant(deliveryId: string, tenantId: string): Promise<RunDocumentDelivery> {
    const delivery = await withCurrentTenant((tx) =>
      this.deliveryRepo.findByIdAndTenantId(deliveryId, tenantId, tx));
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
    const updated = await withCurrentTenant((tx) =>
      this.deliveryRepo.resetForRetry(deliveryId, tenantId, tx));
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
