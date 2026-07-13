/**
 * Document Generation Error
 *
 * Rich error class for document generation failures with detailed context.
 * Provides structured error information for debugging and user feedback.
 *
 * Features:
 * - Phase tracking (load, normalize, map, render, save)
 * - Full context capture (template, run, step values, mapping)
 * - Error categorization (recoverable vs fatal)
 * - Suggested fixes
 * - Serializable for logging and API responses
 *
 * Usage:
 * ```typescript
 * throw new DocumentGenerationError(
 *   'Failed to render template',
 *   {
 *     phase: 'render',
 *     templateId,
 *     runId,
 *     originalError: error,
 *     recoverable: false
 *   }
 * );
 * ```
 */

import { createError } from '../utils/errors';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Document generation phases
 */
export type DocumentGenerationPhase =
  | 'load'        // Loading template from storage
  | 'unlock'      // Unlocking PDF (qpdf)
  | 'normalize'   // Normalizing step values
  | 'map'         // Applying field mapping
  | 'render'      // Rendering document (docxtemplater, pdf-lib)
  | 'convert'     // Converting DOCX to PDF
  | 'save'        // Saving to storage
  | 'validate'    // Validating output
  | 'unknown';    // Unknown phase

/**
 * Error context
 */
export interface DocumentGenerationErrorContext {
  /** Which phase failed */
  phase: DocumentGenerationPhase;

  /** Template ID */
  templateId?: string;

  /** Template alias (from Final Block config) */
  templateAlias?: string;

  /** Workflow run ID */
  runId?: string;

  /** Workflow ID */
  workflowId?: string;

  /** Original error that caused this */
  originalError?: Error;

  /** Step values (sanitized - no sensitive data) */
  stepValues?: Record<string, unknown>;

  /** Field mapping */
  mapping?: unknown;

  /** Normalized data */
  normalizedData?: unknown;

  /** Mapped data */
  mappedData?: unknown;

  /** Is this error recoverable? */
  recoverable?: boolean;

  /** Suggested fix */
  suggestion?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Serialized error (for API responses and logging)
 */
export interface SerializedDocumentGenerationError {
  name: string;
  message: string;
  phase: DocumentGenerationPhase;
  templateId?: string;
  templateAlias?: string;
  runId?: string;
  workflowId?: string;
  recoverable: boolean;
  suggestion?: string;
  originalError?: {
    name: string;
    message: string;
    stack?: string;
  };
  timestamp: string;
}

// ============================================================================
// ERROR CLASS
// ============================================================================

export class DocumentGenerationError extends Error {
  public readonly phase: DocumentGenerationPhase;
  public readonly templateId?: string;
  public readonly templateAlias?: string;
  public readonly runId?: string;
  public readonly workflowId?: string;
  public readonly originalError?: Error;
  public readonly stepValues?: Record<string, unknown>;
  public readonly mapping?: unknown;
  public readonly normalizedData?: unknown;
  public readonly mappedData?: unknown;
  public readonly recoverable: boolean;
  public readonly suggestion?: string;
  public readonly metadata?: Record<string, unknown>;
  public readonly timestamp: Date;

  constructor(message: string, context: DocumentGenerationErrorContext) {
    super(message);

    this.name = 'DocumentGenerationError';
    this.phase = context.phase;
    this.templateId = context.templateId;
    this.templateAlias = context.templateAlias;
    this.runId = context.runId;
    this.workflowId = context.workflowId;
    this.originalError = context.originalError;
    this.stepValues = context.stepValues;
    this.mapping = context.mapping;
    this.normalizedData = context.normalizedData;
    this.mappedData = context.mappedData;
    this.recoverable = context.recoverable ?? false;
    this.suggestion = context.suggestion ?? this.getSuggestionForPhase(context.phase);
    this.metadata = context.metadata;
    this.timestamp = new Date();

    // Maintain proper stack trace
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DocumentGenerationError);
    }

    // Append original error stack if available
    if (context.originalError?.stack) {
      this.stack = `${this.stack}\n\nCaused by: ${context.originalError.stack}`;
    }
  }

  /**
   * Serialize error for logging and API responses
   */
  toJSON(): SerializedDocumentGenerationError {
    return {
      name: this.name,
      message: this.message,
      phase: this.phase,
      templateId: this.templateId,
      templateAlias: this.templateAlias,
      runId: this.runId,
      workflowId: this.workflowId,
      recoverable: this.recoverable,
      suggestion: this.suggestion,
      originalError: this.originalError
        ? {
            name: this.originalError.name,
            message: this.originalError.message,
            stack: this.originalError.stack,
          }
        : undefined,
      timestamp: this.timestamp.toISOString(),
    };
  }

  /**
   * Get user-friendly error message
   */
  getUserMessage(): string {
    const phaseMessages: Record<DocumentGenerationPhase, string> = {
      load: 'Failed to load template',
      unlock: 'Failed to unlock PDF',
      normalize: 'Failed to process workflow data',
      map: 'Failed to map fields',
      render: 'Failed to generate document',
      convert: 'Failed to convert document to PDF',
      save: 'Failed to save document',
      validate: 'Generated document is invalid',
      unknown: 'Document generation failed',
    };

    const baseMessage = phaseMessages[this.phase] || 'Document generation failed';

    if (this.templateAlias) {
      return `${baseMessage} for "${this.templateAlias}"`;
    }

    return baseMessage;
  }

  /**
   * Get suggested fix based on phase
   */
  private getSuggestionForPhase(phase: DocumentGenerationPhase): string {
    const suggestions: Record<DocumentGenerationPhase, string> = {
      load: 'Check that the template file exists and is accessible',
      unlock: 'Ensure qpdf is installed and the PDF is not corrupted',
      normalize: 'Verify that step values are in the correct format',
      map: 'Check that all mapped fields have valid source variables',
      render: 'Verify template syntax and ensure all required fields are mapped',
      convert: 'Check PDF conversion service is running',
      save: 'Verify storage service is accessible and has sufficient space',
      validate: 'Review template structure and field mappings',
      unknown: 'Check logs for more details',
    };

    return suggestions[phase] || 'Contact support if the issue persists';
  }

  /**
   * Check if error is recoverable
   */
  isRecoverable(): boolean {
    return this.recoverable;
  }

  /**
   * Get sanitized context (removes sensitive data)
   */
  getSanitizedContext(): Partial<DocumentGenerationErrorContext> {
    return {
      phase: this.phase,
      templateId: this.templateId,
      templateAlias: this.templateAlias,
      runId: this.runId,
      workflowId: this.workflowId,
      recoverable: this.recoverable,
      suggestion: this.suggestion,
      metadata: this.metadata,
    };
  }

  /**
   * Convert to HTTP error response
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  toHttpError() {
    return createError.internal(this.getUserMessage(), {
      phase: this.phase,
      templateId: this.templateId,
      suggestion: this.suggestion,
      recoverable: this.recoverable,
    });
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create error for template loading failure
 */
export function createTemplateLoadError(
  templateId: string,
  originalError: Error
): DocumentGenerationError {
  return new DocumentGenerationError('Failed to load template', {
    phase: 'load',
    templateId,
    originalError,
    recoverable: false,
    suggestion: 'Ensure the template file exists and is not corrupted',
  });
}

/**
 * Create error for PDF unlock failure
 */
export function createPdfUnlockError(
  templateId: string,
  originalError: Error
): DocumentGenerationError {
  return new DocumentGenerationError('Failed to unlock PDF', {
    phase: 'unlock',
    templateId,
    originalError,
    recoverable: true, // Can fallback to original PDF
    suggestion: 'Install qpdf or use an unencrypted PDF template',
  });
}

/**
 * Create error for normalization failure
 */
export function createNormalizationError(
  runId: string,
  originalError: Error,
  stepValues?: Record<string, unknown>
): DocumentGenerationError {
  return new DocumentGenerationError('Failed to normalize workflow data', {
    phase: 'normalize',
    runId,
    originalError,
    stepValues,
    recoverable: false,
    suggestion: 'Check that step values are valid JSON objects',
  });
}

/**
 * Create error for mapping failure
 */
export function createMappingError(
  templateId: string,
  runId: string,
  originalError: Error,
  mapping?: unknown
): DocumentGenerationError {
  return new DocumentGenerationError('Failed to apply field mapping', {
    phase: 'map',
    templateId,
    runId,
    originalError,
    mapping,
    recoverable: false,
    suggestion: 'Validate mapping configuration and ensure all source variables exist',
  });
}

/**
 * Create error for rendering failure
 */
export function createRenderError(
  templateId: string,
  runId: string,
  originalError: Error,
  mappedData?: unknown
): DocumentGenerationError {
  return new DocumentGenerationError('Failed to render document', {
    phase: 'render',
    templateId,
    runId,
    originalError,
    mappedData,
    recoverable: false,
    suggestion: 'Check template syntax and ensure all placeholders are valid',
  });
}

/**
 * Create error for PDF conversion failure
 */
export function createConversionError(
  templateId: string,
  runId: string,
  originalError: Error
): DocumentGenerationError {
  return new DocumentGenerationError('Failed to convert document to PDF', {
    phase: 'convert',
    templateId,
    runId,
    originalError,
    recoverable: true, // Can return DOCX instead
    suggestion: 'Ensure PDF conversion service is running (Puppeteer)',
  });
}

/**
 * Create error for save failure
 */
export function createSaveError(
  templateId: string,
  runId: string,
  originalError: Error
): DocumentGenerationError {
  return new DocumentGenerationError('Failed to save document', {
    phase: 'save',
    templateId,
    runId,
    originalError,
    recoverable: true, // Document was generated, just not saved
    suggestion: 'Check storage service connectivity and available space',
  });
}

/**
 * Check if error is a DocumentGenerationError
 */
export function isDocumentGenerationError(error: unknown): error is DocumentGenerationError {
  return error instanceof DocumentGenerationError;
}

/**
 * Wrap any error as DocumentGenerationError
 */
export function wrapAsDocumentGenerationError(
  error: unknown,
  context: Partial<DocumentGenerationErrorContext>
): DocumentGenerationError {
  if (isDocumentGenerationError(error)) {
    return error;
  }

  return new DocumentGenerationError(
    (error instanceof Error ? error.message : undefined) ?? 'Unknown document generation error',
    {
      phase: context.phase ?? 'unknown',
      originalError: error instanceof Error ? error : undefined,
      ...context,
    }
  );
}
