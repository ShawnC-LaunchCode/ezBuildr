/** High-level orchestration for signature-block execution and callbacks. */

import crypto from 'crypto';

import {
  projectRepository,
  runGeneratedDocumentsRepository,
  signatureRequestRepository,
  stepRepository,
  workflowRepository,
  workflowRunRepository,
} from '../../repositories';
import { createLogger } from '../../logger';
import { createError } from '../../utils/errors';
import {
  runWithTenantContext,
  withCurrentTenant,
  withTenant,
  withVerifiedIdentifier,
} from '../../utils/rlsContext';
import { storageProvider } from '../storage';
import { signatureRequestService } from '../SignatureRequestService';
import { workflowTenantResolver } from '../WorkflowTenantResolver';
import { runDataService } from '../workflow-runs/RunDataService';
import { EnvelopeBuilder } from './EnvelopeBuilder';
import { EsignProviderFactory } from './EsignProvider';

import type { DbTransaction } from '../../repositories';
import { isSignatureBlockConfig, type SignatureBlockConfig } from '../../../shared/types/stepConfigs';

const logger = createLogger({ module: 'signature-block-service' });

export interface ExecuteSignatureBlockRequest {
  runId: string;
  stepId: string;
  userId?: string;
  preview?: boolean;
  baseUrl: string;
}

export interface ExecuteSignatureBlockResponse {
  success: boolean;
  signatureRequestId: string;
  envelopeId: string;
  signingUrl: string;
  provider: string;
  preview: boolean;
}

export interface SignatureCallbackData {
  envelopeId: string;
  status: 'signed' | 'declined' | 'expired' | 'voided';
  eventType?: 'sent' | 'viewed' | 'signed' | 'declined' | 'completed' | 'voided' | 'expired';
  completedAt?: Date;
  eventData?: unknown;
}

export class SignatureBlockService {
  static computeCallbackToken(runId: string, stepId: string): string {
    return crypto
      .createHmac('sha256', process.env.JWT_SECRET ?? '')
      .update(`esign-callback:${runId}:${stepId}`)
      .digest('hex');
  }

  static verifyCallbackToken(runId: string, stepId: string, token: string | undefined): boolean {
    if (!token) { return false; }
    const expected = Buffer.from(this.computeCallbackToken(runId, stepId));
    const provided = Buffer.from(token);
    return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
  }

  static async executeSignatureBlock(
    request: ExecuteSignatureBlockRequest
  ): Promise<ExecuteSignatureBlockResponse> {
    const { runId, stepId, preview = false, baseUrl } = request;
    // One tenant-scoped transaction for the whole read phase (RLS-2e). It
    // closes before the envelope is built — that call goes out to the
    // e-signature provider over the network, and a transaction must never be
    // held open across one (TENANT_ISOLATION_RLS §2d).
    //
    // Both callers arrive with an ambient tenant: the creator through
    // hybridAuth, a run-token holder through runTokenAuth, which resolves the
    // run's tenant via WorkflowTenantResolver and pins it.
    const { run, project, config } = await withCurrentTenant(async (tx) => {
      const foundRun = await workflowRunRepository.findById(runId, tx);
      if (!foundRun) {
        throw createError.notFound('Workflow run', runId);
      }
      // Sequential, not Promise.all: concurrent queries on one transaction
      // handle are the same deadlock shape as a pool query inside one.
      const workflow = await workflowRepository.findById(foundRun.workflowId, tx);
      const foundStep = await stepRepository.findById(stepId, tx);
      if (!workflow?.projectId) {
        throw createError.validation('Workflow has no project');
      }
      if (!foundStep || foundStep.workflowId !== foundRun.workflowId || foundStep.type !== 'signature_block') {
        throw createError.notFound('Signature step', stepId);
      }
      if (!isSignatureBlockConfig(foundStep.config)) {
        throw createError.validation('Signature step configuration is invalid');
      }
      const foundProject = await projectRepository.findById(workflow.projectId, tx);
      if (!foundProject?.tenantId) {
        throw createError.validation('Signature workflow project has no tenant');
      }
      return {
        run: foundRun,
        project: { id: foundProject.id, tenantId: foundProject.tenantId },
        config: foundStep.config,
      };
    });

    // Values are rebuilt from server-owned run data. A run-token holder cannot
    // alter signer identities or tab values by changing this API request.
    const runData = await runDataService.buildForRun(runId, run.workflowId);
    const providerName = config.provider ?? 'docusign';
    const provider = EsignProviderFactory.getProvider(providerName);
    const returnUrl = `${baseUrl.replace(/\/$/, '')}/run/${encodeURIComponent(runId)}?esign=returned`;
    const envelopeResponse = await new EnvelopeBuilder(provider).buildEnvelope({
      runId,
      stepId,
      config,
      variableData: runData.byAlias,
      preview,
      returnUrl,
    });

    const signerEmail = this.substituteVariables(config.signerEmail ?? '', runData.byAlias).trim();
    const resolvedSignerName = this.substituteVariables(config.signerName ?? '', runData.byAlias).trim();
    const signerName = resolvedSignerName === '' ? config.signerRole : resolvedSignerName;
    if (signerEmail === '') {
      throw createError.validation('Signature signer email is required');
    }

    // RLS-2c: this route accepts a run-token holder via
    // optionalHybridAuth + creatorOrRunTokenAuth, who is never a tenant user
    // and never gets an ambient tenant from auth resolution.
    // signatureRequestService.createSignatureRequest now opens a tenant-scoped
    // transaction and fails closed with no context, so this must supply one
    // explicitly using the project's tenant already resolved above — same
    // fix CollectionBlockRunner/ReadTableBlockRunner applied to their callers.
    // (Locals, not `project.tenantId`/`workflow.projectId` inline: TS cannot
    // carry the earlier null-guard's narrowing across a closure boundary.)
    const tenantId = project.tenantId;
    const projectId = project.id;
    const signatureRequest = await runWithTenantContext(tenantId, () =>
      signatureRequestService.createSignatureRequest({
        runId,
        workflowId: run.workflowId,
        nodeId: stepId,
        tenantId,
        projectId,
        signerEmail,
        signerName,
        status: 'pending',
        provider: providerName,
        providerRequestId: envelopeResponse.envelopeId,
        documentUrl: null,
        redirectUrl: config.redirectUrl ?? returnUrl,
        message: config.message ?? null,
        expiresAt: new Date(Date.now() + (config.expiresInDays ?? 30) * 86_400_000),
      })
    );

    logger.info({ runId, stepId, provider: providerName, envelopeId: envelopeResponse.envelopeId }, 'Signature envelope created');
    return {
      success: true,
      signatureRequestId: signatureRequest.id,
      envelopeId: envelopeResponse.envelopeId,
      signingUrl: envelopeResponse.signingUrl,
      provider: providerName,
      preview,
    };
  }

  /**
   * Resolve the tenant a run belongs to, for a caller that has no tenant
   * context of its own (an e-signature callback is a provider-to-server POST,
   * authenticated by an HMAC or a webhook signature, never by a session).
   *
   * Same shape `runTokenAuth` uses: `workflow_runs` carries no tenant and no
   * RLS policy, so the run is readable; the `workflow_id` read off it is a
   * legitimately-established value, pinned as `app.current_workflow_id` so
   * migration 0030's clause lets the ownership walk see the workflow row.
   */
  private static async resolveTenantForRun(runId: string): Promise<string | undefined> {
    const run = await workflowRunRepository.findById(runId);
    if (!run) { return undefined; }
    const tenantId = await withVerifiedIdentifier(
      'app.current_workflow_id',
      run.workflowId,
      (tx) => workflowTenantResolver.resolveForWorkflowId(run.workflowId, tx)
    );
    return tenantId ?? undefined;
  }

  /**
   * Run `fn` scoped to `tenantId` when one could be resolved.
   *
   * ⚠️ KNOWN GAP, deliberately left visible rather than papered over: the
   * DocuSign webhook route (`/webhook/docusign`) arrives with an envelope id
   * and nothing else — no run id — so there is nothing to resolve a tenant
   * FROM until `signature_requests` has been read, and that table is
   * RLS-covered. Under enforcement that path will find no row and the webhook
   * will fail. Closing it needs a decision, not a refactor: either a bootstrap
   * clause on `signature_requests.provider_request_id` keyed on a GUC pinned
   * only after the webhook signature verifies (0029's shape, weaker proof), or
   * routing it through RLS-6's adminDb. Flagged in tickets/RLS_HANDOFF.md for
   * the enforcement ticket; the HMAC callback route below, which does carry a
   * run id, is scoped properly today.
   */
  private static async withResolvedTenant<T>(
    tenantId: string | undefined,
    fn: (tx?: DbTransaction) => Promise<T>
  ): Promise<T> {
    if (tenantId) {
      return withTenant(tenantId, (tx) => fn(tx));
    }
    return fn(undefined);
  }

  static async handleSignatureCallback(
    runId: string | undefined,
    stepId: string | undefined,
    callbackData: SignatureCallbackData
  ): Promise<void> {
    const tenantId = runId === undefined ? undefined : await this.resolveTenantForRun(runId);

    // The read and the two status writes are one logical operation, so they
    // share one transaction. Document storage happens after it commits: it
    // downloads from the provider and uploads to object storage, neither of
    // which may run with a transaction held open (§2d).
    const request = await this.withResolvedTenant(tenantId, async (tx) => {
      const found = await signatureRequestRepository.findByProviderRequestId(callbackData.envelopeId, tx);
      if (!found) {
        throw createError.notFound('Signature request for envelope', callbackData.envelopeId);
      }
      const runMismatch = runId !== undefined && found.runId !== runId;
      const stepMismatch = stepId !== undefined && found.nodeId !== stepId;
      if (runMismatch || stepMismatch) {
        throw createError.forbidden('Access denied - signature callback does not match the envelope');
      }

      await signatureRequestRepository.updateStatus(
        found.id,
        callbackData.status,
        callbackData.completedAt,
        tx
      );
      await signatureRequestRepository.createEvent(
        found.id,
        callbackData.eventType ?? callbackData.status,
        callbackData.eventData,
        tx
      );
      return found;
    });

    if (callbackData.eventType === 'completed' && !request.documentUrl) {
      await this.storeCompletedDocuments(
        request.id,
        request.runId,
        request.providerRequestId ?? callbackData.envelopeId,
        request.provider,
        tenantId
      );
    }

    if (callbackData.status === 'declined' || callbackData.status === 'expired' || callbackData.status === 'voided') {
      logger.warn({ runId: request.runId, stepId: request.nodeId, status: callbackData.status }, 'Signature request ended without completion');
    }
  }

  static async findSignatureRequestByEnvelope(envelopeId: string): Promise<{
    id: string;
    runId: string;
    nodeId: string;
    provider: 'native' | 'docusign' | 'hellosign';
  } | null> {
    // Reached from the esign routes, which run behind optionalHybridAuth +
    // creatorOrRunTokenAuth — both of which leave an ambient tenant.
    const request = await withCurrentTenant((tx) =>
      signatureRequestRepository.findByProviderRequestId(envelopeId, tx));
    if (!request) { return null; }
    return {
      id: request.id,
      runId: request.runId,
      nodeId: request.nodeId,
      provider: request.provider,
    };
  }

  static async shouldExecuteSignatureBlock(
    runId: string,
    _stepId: string,
    config: SignatureBlockConfig
  ): Promise<boolean> {
    return withCurrentTenant(async (tx) => {
      const blocks = await this.getAllSignatureBlocksInWorkflow(runId, tx);
      const blocksWithStatus = await this.withCompletion(runId, blocks, tx);
      return EnvelopeBuilder.shouldExecuteBlock(config, blocksWithStatus, config.routingOrder ?? 1);
    });
  }

  static async getNextSignatureBlock(runId: string): Promise<string | null> {
    return withCurrentTenant(async (tx) => {
      const blocks = await this.getAllSignatureBlocksInWorkflow(runId, tx);
      const blocksWithStatus = await this.withCompletion(runId, blocks, tx);
      const nextOrder = EnvelopeBuilder.getNextRoutingOrder(blocksWithStatus);
      return blocksWithStatus.find((block) => block.config.routingOrder === nextOrder && !block.completed)?.stepId ?? null;
    });
  }

  /**
   * Annotate each block with whether its signature has completed.
   *
   * Sequential on purpose. This was a `Promise.all` over per-block lookups;
   * issued against one shared transaction handle that is the same hazard as a
   * pool query inside a transaction — against the size-1 test pool it hangs
   * rather than fails.
   */
  private static async withCompletion<T extends { stepId: string; config: SignatureBlockConfig }>(
    runId: string,
    blocks: T[],
    tx: DbTransaction
  ): Promise<Array<T & { completed: boolean }>> {
    const annotated: Array<T & { completed: boolean }> = [];
    for (const block of blocks) {
      annotated.push({ ...block, completed: await this.isSignatureBlockCompleted(runId, block.stepId, tx) });
    }
    return annotated;
  }

  private static async storeCompletedDocuments(
    signatureRequestId: string,
    runId: string,
    envelopeId: string,
    providerName: string,
    tenantId?: string
  ): Promise<void> {
    const provider = EsignProviderFactory.getProvider(providerName);
    const documents = await provider.downloadSignedDocuments(envelopeId);
    for (const [index, document] of documents.entries()) {
      const suffix = documents.length === 1 ? '' : `-${index + 1}`;
      const fileName = `signed-${envelopeId}${suffix}.pdf`;
      const storageKey = `runs/${runId}/signatures/${signatureRequestId}/${fileName}`;
      await storageProvider.uploadFile(storageKey, document, 'application/pdf', {
        envelopeId,
        signatureRequestId,
      });
      await runGeneratedDocumentsRepository.createDocument({
        runId,
        fileName,
        fileUrl: `/api/runs/${runId}/final-documents/${encodeURIComponent(fileName)}/download`,
        storageKey,
        mimeType: 'application/pdf',
        fileSize: document.length,
        templateId: null,
        unresolvedVariables: [],
        // Deliberately no pdfStrategy: that column records which DOCX->PDF
        // converter ran, and none did — DocuSign returned this PDF already
        // rendered. The storage key carries the provenance instead.
      });
      if (index === 0) {
        // Its own short transaction, after the download and upload — not one
        // held across them.
        await this.withResolvedTenant(tenantId, (tx) =>
          signatureRequestRepository.updateDocumentUrl(signatureRequestId, storageKey, tx));
      }
    }
    logger.info({ runId, envelopeId, documentCount: documents.length }, 'Stored completed DocuSign documents');
  }

  private static async getAllSignatureBlocksInWorkflow(
    runId: string,
    tx: DbTransaction
  ): Promise<Array<{ stepId: string; config: SignatureBlockConfig }>> {
    const run = await workflowRunRepository.findById(runId, tx);
    if (!run) {
      throw createError.notFound('Workflow run', runId);
    }
    const steps = await stepRepository.findByWorkflowId(run.workflowId, tx);
    return steps.flatMap((step) =>
      step.type === 'signature_block' && isSignatureBlockConfig(step.config)
        ? [{ stepId: step.id, config: step.config }]
        : []
    );
  }

  private static async isSignatureBlockCompleted(runId: string, stepId: string, tx: DbTransaction): Promise<boolean> {
    const request = await signatureRequestRepository.findByRunAndNode(runId, stepId, tx);
    return request?.status === 'signed';
  }

  private static substituteVariables(template: string, variables: Record<string, unknown>): string {
    return Object.entries(variables).reduce(
      (result, [key, value]) => result.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), String(value ?? '')),
      template
    );
  }
}
