/**
 * Enhanced Document Engine
 *
 * Extends the existing DocumentEngine with Final Block capabilities:
 * - Variable normalization (flatten nested, convert arrays)
 * - Field mapping (map workflow variables to document fields)
 * - Conditional document generation
 * - Multi-document rendering
 *
 * This is a THIN WRAPPER that preserves all existing functionality while
 * adding new capabilities needed for Final Block integration.
 *
 * @version 1.0.0 - Final Block Extension (Prompt 10)
 * @date December 6, 2025
 */

import { createNormalizationError, createMappingError, createRenderError, wrapAsDocumentGenerationError, isDocumentGenerationError } from '../../errors/DocumentGenerationError.js';
import { createLogger } from '../../logger.js';
import { datavaultRowsService } from '../DatavaultRowsService.js';
import { templateAnalytics } from '../TemplateAnalyticsService.js';

import { DocumentEngine } from './DocumentEngine.js';
import { applyMapping, resolveDatavaultBindings, type DocumentMapping, type MappingResult } from './MappingInterpreter.js';
import { normalizeVariables, type NormalizedData, type NormalizationOptions } from './VariableNormalizer.js';

import type { DocumentGenerationOptions, DocumentGenerationResult } from './DocumentEngine.js';
import { evaluateConditionExpression } from '../../../shared/conditionEvaluator.js';
import type { ConditionExpression } from '../../../shared/types/conditions.js';
import type { DatavaultMappingBinding } from '../../../shared/types/documentMapping.js';

const logger = createLogger({ module: 'enhanced-doc-engine' });

/**
 * Resolve one `datavault` mapping binding to its cell value.
 *
 * `tenantId` is required — a run/preview invoked without one (e.g. an older
 * caller that has not been updated to pass it) simply cannot resolve
 * DataVault bindings; they surface as `missing` in the mapping result (see
 * `MappingInterpreter.resolveDatavaultBindings`) rather than throwing.
 */
async function resolveDatavaultBindingValue(
  binding: DatavaultMappingBinding,
  tenantId: string | undefined
): Promise<unknown> {
  if (tenantId === undefined || tenantId === '') {
    logger.warn({ binding }, 'Cannot resolve DataVault mapping binding: no tenantId in this generation context');
    return undefined;
  }
  const result = await datavaultRowsService.getRow(binding.rowId, tenantId);
  return result?.values[binding.columnId] as unknown;
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Enhanced generation options (with normalization and mapping)
 */
export interface EnhancedGenerationOptions extends Omit<DocumentGenerationOptions, 'data'> {
  /** Raw step values (will be normalized) */
  rawData: Record<string, unknown>;

  /** Optional field mapping */
  mapping?: DocumentMapping;

  /** Normalization options */
  normalizationOptions?: NormalizationOptions;

  /** Whether to apply normalization (default: true) */
  normalize?: boolean;

  /** Template row id (uuid) — enables generation metrics tracking */
  templateId?: string;

  /**
   * Graph-engine run id recorded with generation metrics. CAUTION:
   * template_generation_metrics.run_id references the graph `runs` table,
   * NOT workflow_runs — only the engine template node may pass this.
   */
  runId?: string;

  /** Tenant scope for resolving `datavault` mapping bindings (GH-156). */
  tenantId?: string;
}

/**
 * Enhanced generation result (with mapping metadata)
 */

export interface EnhancedGenerationResult extends DocumentGenerationResult {
  /** Normalized data that was used */
  normalizedData: NormalizedData;

  /** Mapping result (if mapping was applied) */
  mappingResult?: MappingResult;

  /** Document alias (for Final Block) */
  alias?: string;
}

/**
 * Single document configuration for Final Block
 */
export interface FinalBlockDocument {
  /** Document ID (reference to template) */
  documentId: string;

  /** Template file path */
  templatePath: string;

  /** Document alias */
  alias: string;

  /** Optional field mapping */
  mapping?: DocumentMapping;

  /** Optional conditional logic */
  conditions?: ConditionExpression | null;
}

/**
 * Final Block rendering options
 */
export interface FinalBlockRenderOptions {
  /** Documents to generate */
  documents: FinalBlockDocument[];

  /** Step values from workflow run */
  stepValues: Record<string, unknown>;

  /** Output directory */
  outputDir?: string;

  /** Whether to convert to PDF */
  toPdf?: boolean;

  /** Normalization options */
  normalizationOptions?: NormalizationOptions;

  /** Run ID to prefix files with for security */
  runId?: string;

  /**
   * Tenant the run/preview belongs to. Required to resolve `datavault`
   * mapping bindings (GH-156) — without it, such bindings are left
   * unresolved and reported as missing rather than fetched, since a
   * DataVault row lookup must be tenant-scoped.
   */
  tenantId?: string;

  /** Existing `workflows.settings` JSON for configuration-bound filters. */
  workflowSettings?: unknown;
}

/**
 * Final Block rendering result
 */
export interface FinalBlockRenderResult {
  /** Successfully generated documents */
  documents: EnhancedGenerationResult[];

  /** Documents that were skipped (conditions = false) */
  skipped: Array<{
    alias: string;
    reason: string;
  }>;

  /** Documents that failed to generate */
  failed: Array<{
    alias: string;
    error: string;
    phase?: string;
    recoverable?: boolean;
    suggestion?: string;
    details?: unknown;
  }>;

  /** Total number of documents attempted */
  totalAttempted: number;

  /** Total number of documents generated */
  totalGenerated: number;
}

// ============================================================================
// ENHANCED DOCUMENT ENGINE CLASS
// ============================================================================

/**
 * Enhanced Document Engine
 *
 * Wraps existing DocumentEngine with Final Block capabilities.
 * Preserves all existing functionality - this is ADDITIVE, not a replacement.
 */
export class EnhancedDocumentEngine {
  private engine: DocumentEngine;

  constructor() {
    this.engine = new DocumentEngine();
  }

  /**
   * Generate document with normalization and mapping
   *
   * This method extends the base DocumentEngine.generate() with:
   * - Automatic variable normalization
   * - Field mapping application
   * - Metadata tracking
   *
   * @param options - Enhanced generation options
   * @returns Enhanced generation result
   */
  async generateWithMapping(
    options: EnhancedGenerationOptions
  ): Promise<EnhancedGenerationResult> {
    const {
      rawData,
      mapping,
      normalizationOptions = {},
      normalize = true,
      templateId,
      runId,
      tenantId,
      workflowSettings,
      ...baseOptions
    } = options;
    // Metrics columns are uuids; preview runs use synthetic "preview-*" ids
    const metricsRunId = runId && !runId.startsWith('preview-') ? runId : undefined;

    logger.info({
      outputName: baseOptions.outputName,
      hasMapping: !!mapping,
      normalize,
    }, 'Generating document with mapping');

    try {
      // Step 1: Normalize variables
      let normalizedData: NormalizedData;
      try {
        normalizedData = normalize
          ? normalizeVariables(rawData, normalizationOptions)
          : (rawData as NormalizedData);

        logger.debug({
          originalKeys: Object.keys(rawData).length,
          normalizedKeys: Object.keys(normalizedData).length,
        }, 'Variables normalized');
      } catch (error: unknown) {
        throw createNormalizationError(
          baseOptions.outputName || 'unknown',

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument -- Legacy dynamic boundary requires these narrow checks.
          error as any,
          rawData
        );
      }

      // Step 2: Apply mapping (if provided)
      let mappingResult: MappingResult | undefined;
      let finalData: NormalizedData = normalizedData;

      if (mapping) {
        try {
          const resolved = await resolveDatavaultBindings(
            mapping,
            normalizedData,
            (binding) => resolveDatavaultBindingValue(binding, tenantId)
          );
          mappingResult = applyMapping(resolved.normalizedData, resolved.mapping);
          // Merge mapped fields OVER the full normalized set instead of
          // replacing it: a partial mapping must not blank out every
          // unmapped {{variable}} in the template. Mapped names win on
          // key collisions.
          finalData = { ...normalizedData, ...mappingResult.data };

          logger.debug({
            mapped: mappingResult.mapped.length,
            missing: mappingResult.missing.length,
            unused: mappingResult.unused.length,
          }, 'Mapping applied');

          // Log warnings for missing source variables
          if (mappingResult.missing.length > 0) {
            logger.warn({
              missing: mappingResult.missing,
            }, 'Mapping references missing variables');
          }
        } catch (error: unknown) {
          throw createMappingError(
            baseOptions.templatePath,
            baseOptions.outputName || 'unknown',

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument -- Legacy dynamic boundary requires these narrow checks.
            error as any,
            mapping
          );
        }
      }

      // Step 3: Generate document using base engine
      let result: DocumentGenerationResult;
      const startTime = Date.now();

      try {
        result = await this.engine.generate({
          ...baseOptions,
          data: finalData,
          workflowSettings,
        });

        const duration = Date.now() - startTime;

        logger.info({
          outputName: baseOptions.outputName,
          docxPath: result.docxPath,
          pdfPath: result.pdfPath,
          durationMs: duration,
        }, 'Document generated successfully');

        // Track successful generation. Only when the caller provided the
        // template row id — both metric columns are uuids, and the previous
        // code passed the template file PATH and outputName here, so every
        // insert failed with a uuid parse error.
        if (templateId) {
          templateAnalytics.trackGeneration(
            templateId,
            'success',
            duration,
            undefined,
            metricsRunId
          ).catch((err) => {
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Document template data is dynamically typed at this rendering boundary.
            logger.warn({ error: err }, 'Failed to track generation metric');
          });
        }
      } catch (error: unknown) {
        const duration = Date.now() - startTime;

        // Track failed generation
        if (templateId) {
          templateAnalytics.trackGeneration(
            templateId,
            'failure',
            duration,
            (error as Error).message,
            metricsRunId
          ).catch((err) => {
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Document template data is dynamically typed at this rendering boundary.
            logger.warn({ error: err }, 'Failed to track generation metric');
          });
        }

        throw createRenderError(
          baseOptions.templatePath,
          baseOptions.outputName || 'unknown',

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument -- Legacy dynamic boundary requires these narrow checks.
          error as any,
          finalData
        );
      }

      // Step 4: Return enhanced result
      return {
        ...result,
        normalizedData,
        mappingResult,
      };
    } catch (error: unknown) {
      // Wrap non-DocumentGenerationError errors
      if (!isDocumentGenerationError(error)) {
        throw wrapAsDocumentGenerationError(error, {
          phase: 'unknown',
          templateId: baseOptions.templatePath,
          runId: baseOptions.outputName,
        });
      }
      throw error;
    }
  }

  /**
   * Generate document using base engine (passthrough)
   *
   * This preserves the original DocumentEngine.generate() behavior.
   * No normalization or mapping - just direct passthrough.
   *
   * @param options - Base generation options
   * @returns Base generation result
   */
  async generate(options: DocumentGenerationOptions): Promise<DocumentGenerationResult> {
    return this.engine.generate(options);
  }

  /**
   * Render all documents for a Final Block
   *
   * This is the main entry point for Final Block document generation.
   *
   * Workflow:
   * 1. Normalize step values once (reused for all documents)
   * 2. For each document:
   *    a. Evaluate conditions → skip if false
   *    b. Apply mapping
   *    c. Generate document
   *    d. Handle errors gracefully
   * 3. Return results + metadata
   *
   * @param options - Final Block render options
   * @returns Render result with all documents
   */
  async renderFinalBlock(
    options: FinalBlockRenderOptions
  ): Promise<FinalBlockRenderResult> {
    const {
      documents,
      stepValues,
      outputDir,
      toPdf = false,
      normalizationOptions = {},
      tenantId,
      workflowSettings,
    } = options;

    logger.info({
      documentCount: documents.length,
      toPdf,
    }, 'Rendering Final Block documents');

    // Pre-normalize step values once (reused for all documents)
    const normalizedStepValues = normalizeVariables(stepValues, normalizationOptions);

    logger.debug({
      originalKeys: Object.keys(stepValues).length,
      normalizedKeys: Object.keys(normalizedStepValues).length,
    }, 'Step values normalized');

    const results: EnhancedGenerationResult[] = [];
    const skipped: FinalBlockRenderResult['skipped'] = [];
    const failed: FinalBlockRenderResult['failed'] = [];

    // Process each document
    for (const doc of documents) {
      try {
        // Step 1: Evaluate conditions. `doc.conditions` is a
        // ConditionExpression -- the same language steps.visible_if /
        // sections.visible_if use -- evaluated directly by the shared
        // evaluator (no per-document translation step). A null expression
        // means "always generated", matching evaluateConditionExpression's
        // null-is-always-true contract.
        const conditionMet = evaluateConditionExpression(doc.conditions ?? null, stepValues);

        if (!conditionMet) {
          skipped.push({
            alias: doc.alias,
            reason: 'Conditions not met',
          });
          logger.info({ alias: doc.alias }, 'Document skipped (conditions not met)');
          continue;
        }

        // Step 2: Generate document
        const result = await this.generateWithMapping({
          templatePath: doc.templatePath,
          rawData: stepValues, // Pass raw data, will be normalized internally
          mapping: doc.mapping,
          outputName: options.runId ? `${options.runId}_${doc.alias}` : doc.alias,
          outputDir,
          toPdf,
          normalizationOptions,
          normalize: true,
          // No runId here: metrics run_id references the graph runs table,
          // and Final Block runIds are workflow_runs ids
          templateId: doc.documentId,
          tenantId,
          workflowSettings,
        });

        results.push({
          ...result,
          alias: doc.alias,
        });

        logger.info({
          alias: doc.alias,
          docxPath: result.docxPath,
          pdfPath: result.pdfPath,
        }, 'Document generated successfully');
      } catch (error: unknown) {
        // Enhanced error logging with full context
        const docError = isDocumentGenerationError(error)
          ? error
          : wrapAsDocumentGenerationError(error, {
            phase: 'render',
            templateId: doc.documentId,
            templateAlias: doc.alias,
          });

        failed.push({
          alias: doc.alias,
          error: docError.getUserMessage(),
          phase: docError.phase,
          recoverable: docError.recoverable,
          suggestion: docError.suggestion,
          details: docError.toJSON(),
        });

        logger.error({
          alias: doc.alias,
          documentId: doc.documentId,
          phase: docError.phase,
          error: docError.toJSON(),
        }, 'Document generation failed');

        // Continue with other documents (graceful degradation)
      }
    }

    const finalResult: FinalBlockRenderResult = {
      documents: results,
      skipped,
      failed,
      totalAttempted: documents.length,
      totalGenerated: results.length,
    };

    logger.info({
      totalAttempted: finalResult.totalAttempted,
      generated: finalResult.totalGenerated,
      skipped: skipped.length,
      failed: failed.length,
    }, 'Final Block rendering complete');

    return finalResult;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Singleton instance for reuse across application
 */
export const enhancedDocumentEngine = new EnhancedDocumentEngine();

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Generate document with mapping (convenience function)
 */
export async function generateDocumentWithMapping(
  options: EnhancedGenerationOptions
): Promise<EnhancedGenerationResult> {
  return enhancedDocumentEngine.generateWithMapping(options);
}

/**
 * Render Final Block documents (convenience function)
 */
export async function renderFinalBlockDocuments(
  options: FinalBlockRenderOptions
): Promise<FinalBlockRenderResult> {
  return enhancedDocumentEngine.renderFinalBlock(options);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  EnhancedDocumentEngine,
  enhancedDocumentEngine,
  generateDocumentWithMapping,
  renderFinalBlockDocuments,
};
