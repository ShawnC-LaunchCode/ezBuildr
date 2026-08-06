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
import { storageProvider } from '../storage';
import { signatureRequestService } from '../SignatureRequestService';
import { runDataService } from '../workflow-runs/RunDataService';
import { EnvelopeBuilder } from './EnvelopeBuilder';
import { EsignProviderFactory } from './EsignProvider';

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
    const run = await workflowRunRepository.findById(runId);
    if (!run) {
      throw createError.notFound('Workflow run', runId);
    }
    const [workflow, step] = await Promise.all([
      workflowRepository.findById(run.workflowId),
      stepRepository.findById(stepId),
    ]);
    if (!workflow?.projectId) {
      throw createError.validation('Workflow has no project');
    }
    if (!step || step.workflowId !== run.workflowId || step.type !== 'signature_block') {
      throw createError.notFound('Signature step', stepId);
    }
    if (!isSignatureBlockConfig(step.config)) {
      throw createError.validation('Signature step configuration is invalid');
    }
    const project = await projectRepository.findById(workflow.projectId);
    if (!project?.tenantId) {
      throw createError.validation('Signature workflow project has no tenant');
    }

    // Values are rebuilt from server-owned run data. A run-token holder cannot
    // alter signer identities or tab values by changing this API request.
    const runData = await runDataService.buildForRun(runId, run.workflowId);
    const config = step.config;
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

    const signatureRequest = await signatureRequestService.createSignatureRequest({
      runId,
      workflowId: run.workflowId,
      nodeId: stepId,
      tenantId: project.tenantId,
      projectId: workflow.projectId,
      signerEmail,
      signerName,
      status: 'pending',
      provider: providerName,
      providerRequestId: envelopeResponse.envelopeId,
      documentUrl: null,
      redirectUrl: config.redirectUrl ?? returnUrl,
      message: config.message ?? null,
      expiresAt: new Date(Date.now() + (config.expiresInDays ?? 30) * 86_400_000),
    });

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

  static async handleSignatureCallback(
    runId: string | undefined,
    stepId: string | undefined,
    callbackData: SignatureCallbackData
  ): Promise<void> {
    const request = await signatureRequestRepository.findByProviderRequestId(callbackData.envelopeId);
    if (!request) {
      throw createError.notFound('Signature request for envelope', callbackData.envelopeId);
    }
    const runMismatch = runId !== undefined && request.runId !== runId;
    const stepMismatch = stepId !== undefined && request.nodeId !== stepId;
    if (runMismatch || stepMismatch) {
      throw createError.forbidden('Access denied - signature callback does not match the envelope');
    }

    await signatureRequestRepository.updateStatus(
      request.id,
      callbackData.status,
      callbackData.completedAt
    );
    await signatureRequestRepository.createEvent(
      request.id,
      callbackData.eventType ?? callbackData.status,
      callbackData.eventData
    );

    if (callbackData.eventType === 'completed' && !request.documentUrl) {
      await this.storeCompletedDocuments(request.id, request.runId, request.providerRequestId ?? callbackData.envelopeId, request.provider);
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
    const request = await signatureRequestRepository.findByProviderRequestId(envelopeId);
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
    const blocks = await this.getAllSignatureBlocksInWorkflow(runId);
    const blocksWithStatus = await Promise.all(blocks.map(async (block) => ({
      config: block.config,
      completed: await this.isSignatureBlockCompleted(runId, block.stepId),
    })));
    return EnvelopeBuilder.shouldExecuteBlock(config, blocksWithStatus, config.routingOrder ?? 1);
  }

  static async getNextSignatureBlock(runId: string): Promise<string | null> {
    const blocks = await this.getAllSignatureBlocksInWorkflow(runId);
    const blocksWithStatus = await Promise.all(blocks.map(async (block) => ({
      ...block,
      completed: await this.isSignatureBlockCompleted(runId, block.stepId),
    })));
    const nextOrder = EnvelopeBuilder.getNextRoutingOrder(blocksWithStatus);
    return blocksWithStatus.find((block) => block.config.routingOrder === nextOrder && !block.completed)?.stepId ?? null;
  }

  private static async storeCompletedDocuments(
    signatureRequestId: string,
    runId: string,
    envelopeId: string,
    providerName: string
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
        await signatureRequestRepository.updateDocumentUrl(signatureRequestId, storageKey);
      }
    }
    logger.info({ runId, envelopeId, documentCount: documents.length }, 'Stored completed DocuSign documents');
  }

  private static async getAllSignatureBlocksInWorkflow(
    runId: string
  ): Promise<Array<{ stepId: string; config: SignatureBlockConfig }>> {
    const run = await workflowRunRepository.findById(runId);
    if (!run) {
      throw createError.notFound('Workflow run', runId);
    }
    const steps = await stepRepository.findByWorkflowId(run.workflowId);
    return steps.flatMap((step) =>
      step.type === 'signature_block' && isSignatureBlockConfig(step.config)
        ? [{ stepId: step.id, config: step.config }]
        : []
    );
  }

  private static async isSignatureBlockCompleted(runId: string, stepId: string): Promise<boolean> {
    const request = await signatureRequestRepository.findByRunAndNode(runId, stepId);
    return request?.status === 'signed';
  }

  private static substituteVariables(template: string, variables: Record<string, unknown>): string {
    return Object.entries(variables).reduce(
      (result, [key, value]) => result.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), String(value ?? '')),
      template
    );
  }
}
