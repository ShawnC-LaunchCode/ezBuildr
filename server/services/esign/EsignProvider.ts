/**
 * E-Signature Provider Interface
 * Defines the contract for all e-signature providers
 *
 * This interface allows ezBuildr to support multiple signature providers:
 * - DocuSign
 * - HelloSign (Dropbox Sign)
 * - Native signature UI
 * - Future providers
 *
 * @version 1.0.0 - Prompt 11 (E-Signature Integration)
 * @date December 2025
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Document to be signed
 */
export interface SignatureDocument {
  /** Unique identifier for this document */
  id: string;

  /** Document name/title */
  name: string;

  /** File path or URL to the document */
  filePath: string;

  /** MIME type */
  mimeType: string;

  /** Variable-to-field mapping */
  mapping?: Record<string, {
    type: 'variable';
    source: string;
  }>;
}

/**
 * Signer information
 */
export interface SignerInfo {
  /** Signer's role (e.g., "Applicant", "Attorney") */
  role: string;

  /** Signer's full name */
  name?: string;

  /** Signer's email address */
  email?: string;

  /** Routing order (1, 2, 3...) - lower signs first */
  routingOrder: number;

  /** Unique identifier for this signer in the workflow run */
  signerId?: string;
}

/**
 * Envelope creation request
 */
export interface CreateEnvelopeRequest {
  /** Workflow run ID */
  runId: string;

  /** Signature block step ID */
  stepId: string;

  /** Documents to be signed */
  documents: SignatureDocument[];

  /** Signer information */
  signer: SignerInfo;

  /** Workflow variable data (for field pre-filling) */
  variableData: Record<string, any>;

  /** Custom message to signer */
  message?: string;

  /** Expiration in days */
  expiresInDays?: number;

  /** Allow signer to decline */
  allowDecline?: boolean;

  /** Return URL after signing */
  returnUrl?: string;

  /** Preview mode (don't actually send) */
  preview?: boolean;
}

/**
 * Envelope creation response
 */
export interface CreateEnvelopeResponse {
  /** Provider-specific envelope ID */
  envelopeId: string;

  /** URL for signer to access */
  signingUrl: string;

  /** Envelope status */
  status: 'created' | 'sent' | 'delivered' | 'signed' | 'completed' | 'declined' | 'voided';

  /** Provider-specific metadata */
  metadata?: Record<string, any>;
}

/**
 * Envelope status query response
 */
export interface EnvelopeStatusResponse {
  /** Provider-specific envelope ID */
  envelopeId: string;

  /** Current status */
  status: 'created' | 'sent' | 'delivered' | 'signed' | 'completed' | 'declined' | 'voided' | 'expired';

  /** Signer status */
  signerStatus?: 'pending' | 'signing' | 'signed' | 'declined';

  /** Signed document URLs (if completed) */
  signedDocumentUrls?: string[];

  /** Completion timestamp */
  completedAt?: Date;

  /** Provider-specific metadata */
  metadata?: Record<string, any>;
}

/**
 * Webhook/callback event
 */
export interface SignatureEvent {
  /** Event type */
  type: 'sent' | 'viewed' | 'signed' | 'declined' | 'completed' | 'voided' | 'expired';

  /** Provider-specific envelope ID */
  envelopeId: string;

  /** Timestamp */
  timestamp: Date;

  /** Event-specific data */
  data?: Record<string, any>;
}

// ============================================================================
// PROVIDER INTERFACE
// ============================================================================

/**
 * Abstract E-Signature Provider
 * All providers must implement this interface
 */
export interface IEsignProvider {
  /**
   * Provider name (e.g., "docusign", "hellosign", "native")
   */
  readonly name: string;

  /**
   * Create a new signature envelope
   * @param request Envelope creation parameters
   * @returns Envelope details and signing URL
   */
  createEnvelope(request: CreateEnvelopeRequest): Promise<CreateEnvelopeResponse>;

  /**
   * Get envelope status
   * @param envelopeId Provider-specific envelope ID
   * @returns Current envelope status
   */
  getEnvelopeStatus(envelopeId: string): Promise<EnvelopeStatusResponse>;

  /**
   * Cancel/void an envelope
   * @param envelopeId Provider-specific envelope ID
   * @param reason Cancellation reason
   */
  voidEnvelope(envelopeId: string, reason?: string): Promise<void>;

  /**
   * Download signed documents
   * @param envelopeId Provider-specific envelope ID
   * @returns Array of signed document buffers
   */
  downloadSignedDocuments(envelopeId: string): Promise<Buffer[]>;

  /**
   * Verify webhook/callback signature (for security)
   * @param payload Webhook payload
   * @param signature Signature header from provider
   * @returns True if signature is valid
   */
  verifyWebhookSignature(payload: any, signature: string): Promise<boolean>;

  /**
   * Parse webhook event
   * @param payload Webhook payload from provider
   * @returns Normalized signature event
   */
  parseWebhookEvent(payload: any): Promise<SignatureEvent>;
}

// ============================================================================
// PROVIDER FACTORY
// ============================================================================

/**
 * E-Signature Provider Factory
 * Instantiates the appropriate provider based on configuration
 */
export class EsignProviderFactory {
  private static providers: Map<string, IEsignProvider> = new Map();

  /**
   * Register a provider implementation
   */
  static registerProvider(name: string, provider: IEsignProvider): void {
    this.providers.set(name.toLowerCase(), provider);
  }

  /**
   * Get provider by name
   */
  static getProvider(name: string): IEsignProvider {
    const provider = this.providers.get(name.toLowerCase());
    if (!provider) {
      throw new Error(`E-signature provider not found: ${name}`);
    }
    return provider;
  }

  /**
   * Get all registered providers
   */
  static getAllProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if provider exists
   */
  static hasProvider(name: string): boolean {
    return this.providers.has(name.toLowerCase());
  }
}

// ============================================================================
// ERROR CLASSES
// ============================================================================

/**
 * Base error for e-signature operations
 */
export class EsignError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly provider?: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'EsignError';
  }
}

/**
 * Provider configuration error
 */
export class EsignConfigError extends EsignError {
  constructor(message: string, provider?: string) {
    super(message, 'CONFIG_ERROR', provider);
    this.name = 'EsignConfigError';
  }
}

/**
 * API communication error
 */
export class EsignApiError extends EsignError {
  constructor(message: string, provider?: string, details?: any) {
    super(message, 'API_ERROR', provider, details);
    this.name = 'EsignApiError';
  }
}

/**
 * Invalid envelope state error
 */
export class EsignStateError extends EsignError {
  constructor(message: string, provider?: string) {
    super(message, 'STATE_ERROR', provider);
    this.name = 'EsignStateError';
  }
}
