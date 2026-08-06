/**
 * Envelope Builder Service
 * Orchestrates signature envelope creation from signature blocks
 *
 * Responsibilities:
 * - Resolve documents from Final Block or document library
 * - Apply variable substitution to document fields
 * - Prepare documents for signature
 * - Call appropriate e-signature provider
 * - Handle multi-signer routing
 *
 * @version 1.0.0 - Prompt 11 (E-Signature Integration)
 * @date December 2025
 */

import { logger } from '../../logger';
import {
  documentTemplateRepository,
  runGeneratedDocumentsRepository,
  workflowRepository,
  workflowRunRepository,
} from '../../repositories';
import { storageProvider } from '../storage';
import { createError } from '../../utils/errors';

import type {
  IEsignProvider,
  CreateEnvelopeRequest,
  CreateEnvelopeResponse,
  SignatureDocument,
  SignerInfo,
} from './EsignProvider';
import type { SignatureBlockConfig } from '../../../shared/types/stepConfigs';

// ============================================================================
// TYPES
// ============================================================================

export interface BuildEnvelopeRequest {
  /** Workflow run ID */
  runId: string;

  /** Signature block step ID */
  stepId: string;

  /** Signature block configuration */
  config: SignatureBlockConfig;

  /** All workflow variable values */
  variableData: Record<string, unknown>;

  /** Preview mode */
  preview?: boolean;

  /** Override return URL */
  returnUrl?: string;
}

export interface DocumentSource {
  /** Document ID */
  id: string;

  /** Document name */
  name: string;

  /** File path on server */
  filePath: string;

  /** MIME type */
  mimeType: string;
}

interface EnvelopeBuilderDependencies {
  runRepo?: typeof workflowRunRepository;
  workflowRepo?: typeof workflowRepository;
  templateRepo?: typeof documentTemplateRepository;
  generatedDocumentRepo?: typeof runGeneratedDocumentsRepository;
  storage?: typeof storageProvider;
}

// ============================================================================
// ENVELOPE BUILDER
// ============================================================================

export class EnvelopeBuilder {
  private readonly runRepo: typeof workflowRunRepository;
  private readonly workflowRepo: typeof workflowRepository;
  private readonly templateRepo: typeof documentTemplateRepository;
  private readonly generatedDocumentRepo: typeof runGeneratedDocumentsRepository;
  private readonly storage: typeof storageProvider;

  constructor(private provider: IEsignProvider, dependencies: EnvelopeBuilderDependencies = {}) {
    this.runRepo = dependencies.runRepo ?? workflowRunRepository;
    this.workflowRepo = dependencies.workflowRepo ?? workflowRepository;
    this.templateRepo = dependencies.templateRepo ?? documentTemplateRepository;
    this.generatedDocumentRepo = dependencies.generatedDocumentRepo ?? runGeneratedDocumentsRepository;
    this.storage = dependencies.storage ?? storageProvider;
  }

  /**
   * Build and send signature envelope
   */
  async buildEnvelope(request: BuildEnvelopeRequest): Promise<CreateEnvelopeResponse> {
    const {
      runId,
      stepId,
      config,
      variableData,
      preview = false,
      returnUrl,
    } = request;

    // 1. Resolve documents
    const documents = await this.resolveDocuments(runId, config.documents);

    // 2. Build signer info
    const signer = this.buildSignerInfo(config, variableData);

    // 3. Apply variable substitution to text fields
    const message = this.substituteVariables(config.message ?? '', variableData);

    // 4. Create envelope request
    const envelopeRequest: CreateEnvelopeRequest = {
      runId,
      stepId,
      documents,
      signer,
      variableData,
      message,
      expiresInDays: config.expiresInDays ?? 30,
      allowDecline: config.allowDecline ?? false,
      returnUrl: returnUrl ?? config.redirectUrl ?? undefined,
      preview,
    };

    // 5. Call provider to create envelope
    return this.provider.createEnvelope(envelopeRequest);
  }

  // --------------------------------------------------------------------------
  // DOCUMENT RESOLUTION
  // --------------------------------------------------------------------------

  /**
   * Resolve document sources from configuration
   */
  private async resolveDocuments(
    runId: string,
    documentConfigs: SignatureBlockConfig['documents']
  ): Promise<SignatureDocument[]> {
    const run = await this.runRepo.findById(runId);
    if (!run) {
      throw createError.notFound('Workflow run', runId);
    }
    const workflow = await this.workflowRepo.findById(run.workflowId);
    if (!workflow?.projectId) {
      throw createError.validation('Workflow has no project');
    }
    const projectId = workflow.projectId;
    const generatedDocuments = await this.generatedDocumentRepo.findByRunId(runId);

    return Promise.all(documentConfigs.map(async (docConfig) => {
      const generated = generatedDocuments.find((document) =>
        document.id === docConfig.documentId || document.templateId === docConfig.documentId
      );
      let source: DocumentSource | null = null;
      if (generated) {
        source = {
          id: generated.id,
          name: generated.fileName,
          filePath: await this.storage.getLocalPath(generated.storageKey),
          mimeType: generated.mimeType ?? 'application/pdf',
        };
      } else {
        source = await this.resolveTemplateSource(docConfig.documentId, projectId);
      }

      if (!source) {
        logger.warn({ runId, documentId: docConfig.documentId }, '[EnvelopeBuilder] Document not found in run/project');
        throw createError.notFound('Signature document', docConfig.documentId);
      }

      return {
        id: docConfig.id,
        name: source.name,
        filePath: source.filePath,
        mimeType: source.mimeType,
        mapping: docConfig.mapping,
      };
    }));
  }

  /**
   * Resolve document source by ID
   * Can come from:
   * 1. Generated documents (Final Block output)
   * 2. Uploaded template library
   * 3. Workflow file attachments
   */
  private async resolveTemplateSource(documentId: string, projectId: string): Promise<DocumentSource | null> {
    // Project-scoped lookup is the tenant boundary: a run-token holder cannot
    // point a signature block at another customer's template UUID.
    const template = await this.templateRepo.findByIdAndProjectId(documentId, projectId);
    if (!template) {
      return null;
    }
    return {
      id: template.id,
      name: template.name,
      filePath: await this.storage.getLocalPath(template.fileRef),
      mimeType: template.type === 'docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'text/html',
    };
  }

  // --------------------------------------------------------------------------
  // SIGNER INFO
  // --------------------------------------------------------------------------

  /**
   * Build signer information with variable substitution
   */
  private buildSignerInfo(
    config: SignatureBlockConfig,
    variableData: Record<string, unknown>
  ): SignerInfo {
    return {
      role: config.signerRole,
      name: this.substituteVariables(config.signerName ?? '', variableData),
      email: this.substituteVariables(config.signerEmail ?? '', variableData),
      routingOrder: config.routingOrder || 1,
      signerId: undefined,
    };
  }

  // --------------------------------------------------------------------------
  // VARIABLE SUBSTITUTION
  // --------------------------------------------------------------------------

  /**
   * Replace {{variable}} placeholders with actual values
   */
  private substituteVariables(template: string, variableData: Record<string, unknown>): string {
    if (!template) {return template;}

    let result = template;

    // Replace {{variableName}} with values
    Object.entries(variableData).forEach(([key, value]) => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      result = result.replace(regex, String(value ?? ''));
    });

    return result;
  }

  // --------------------------------------------------------------------------
  // ROUTING LOGIC
  // --------------------------------------------------------------------------

  /**
   * Determine if this signature block should execute now
   * based on routing order and previously completed signatures
   */
  static shouldExecuteBlock(
    currentBlock: SignatureBlockConfig,
    allSignatureBlocks: Array<{ config: SignatureBlockConfig; completed: boolean }>,
    currentRoutingOrder: number
  ): boolean {
    // All blocks with lower routing order must be completed
    const lowerOrderBlocks = allSignatureBlocks.filter(
      block => block.config.routingOrder < currentRoutingOrder
    );

    const allLowerOrderComplete = lowerOrderBlocks.every(block => block.completed);

    // This block must match current routing order
    const isCurrentOrder = currentBlock.routingOrder === currentRoutingOrder;

    return isCurrentOrder && allLowerOrderComplete;
  }

  /**
   * Get next routing order to execute
   */
  static getNextRoutingOrder(
    allSignatureBlocks: Array<{ config: SignatureBlockConfig; completed: boolean }>
  ): number {
    // Find the lowest routing order that's not fully completed
    const incompleteBlocks = allSignatureBlocks.filter(block => !block.completed);

    if (incompleteBlocks.length === 0) {
      return Infinity; // All done
    }

    return Math.min(
      ...incompleteBlocks.map(block => block.config.routingOrder)
    );
  }

  /**
   * Check if all signature blocks in workflow are completed
   */
  static allSignaturesComplete(
    allSignatureBlocks: Array<{ config: SignatureBlockConfig; completed: boolean }>
  ): boolean {
    return allSignatureBlocks.every(block => block.completed);
  }
}
