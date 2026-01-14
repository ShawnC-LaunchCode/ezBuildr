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

import path from 'path';

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
  variableData: Record<string, any>;

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

// ============================================================================
// ENVELOPE BUILDER
// ============================================================================

export class EnvelopeBuilder {
  constructor(private provider: IEsignProvider) {}

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
    const documents = await this.resolveDocuments(config.documents, variableData);

    // 2. Build signer info
    const signer = this.buildSignerInfo(config, variableData);

    // 3. Apply variable substitution to text fields
    const message = this.substituteVariables(config.message || '', variableData);

    // 4. Create envelope request
    const envelopeRequest: CreateEnvelopeRequest = {
      runId,
      stepId,
      documents,
      signer,
      variableData,
      message,
      expiresInDays: config.expiresInDays || 30,
      allowDecline: config.allowDecline ?? false,
      returnUrl: returnUrl || config.redirectUrl || undefined,
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
    documentConfigs: SignatureBlockConfig['documents'],
    variableData: Record<string, any>
  ): Promise<SignatureDocument[]> {
    const documents: SignatureDocument[] = [];

    for (const docConfig of documentConfigs) {
      // Resolve document from various sources
      const source = await this.resolveDocumentSource(docConfig.documentId);

      if (!source) {
        console.warn(`[EnvelopeBuilder] Document not found: ${docConfig.documentId}`);
        continue;
      }

      documents.push({
        id: docConfig.id,
        name: source.name,
        filePath: source.filePath,
        mimeType: source.mimeType,
        mapping: docConfig.mapping,
      });
    }

    return documents;
  }

  /**
   * Resolve document source by ID
   * Can come from:
   * 1. Generated documents (Final Block output)
   * 2. Uploaded template library
   * 3. Workflow file attachments
   */
  private async resolveDocumentSource(documentId: string): Promise<DocumentSource | null> {
    // TODO: Implement document resolution logic
    // This should query:
    // 1. runGeneratedDocuments table for Final Block outputs
    // 2. templates table for uploaded templates
    // 3. File storage for workflow attachments

    // Placeholder implementation
    console.warn(`[EnvelopeBuilder] Document resolution not yet implemented: ${documentId}`);

    // For now, return a placeholder
    if (documentId === 'placeholder') {
      return null;
    }

    // Example return:
    return {
      id: documentId,
      name: 'Document.pdf',
      filePath: `/path/to/document/${documentId}.pdf`,
      mimeType: 'application/pdf',
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
    variableData: Record<string, any>
  ): SignerInfo {
    return {
      role: config.signerRole,
      name: this.substituteVariables(config.signerName || '', variableData),
      email: this.substituteVariables(config.signerEmail || '', variableData),
      routingOrder: config.routingOrder || 1,
      signerId: undefined, // Will be set by signature request service
    };
  }

  // --------------------------------------------------------------------------
  // VARIABLE SUBSTITUTION
  // --------------------------------------------------------------------------

  /**
   * Replace {{variable}} placeholders with actual values
   */
  private substituteVariables(template: string, variableData: Record<string, any>): string {
    if (!template) {return template;}

    let result = template;

    // Replace {{variableName}} with values
    Object.entries(variableData).forEach(([key, value]) => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      result = result.replace(regex, String(value || ''));
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
