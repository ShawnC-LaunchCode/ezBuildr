/**
 * RunLifecycleService
 *
 * Handles workflow run lifecycle operations.
 * Responsibilities:
 * - Execute onRunStart blocks
 * - Generate documents for completed runs
 * - Execute DataVault writebacks
 * - Manage initial value population
 * - Determine start section with auto-advance
 */

import { logger } from "../../logger";
import { stepValueRepository, stepRepository, sectionRepository, workflowRunRepository, workflowRepository, documentTemplateRepository, runGeneratedDocumentsRepository } from "../../repositories";
import { blockRunner } from "../BlockRunner";
import { finalBlockRenderer, createTemplateResolver } from "../document/FinalBlockRenderer";
import type { FinalBlockConfig } from "../../../shared/types/stepConfigs";
import { logicService } from "../LogicService";
import { RunPersistenceWriter } from "../runs/RunPersistenceWriter";
import { writebackExecutionService } from "../WritebackExecutionService";
import { createError } from "../../utils/errors";

import type { PopulateValuesOptions, SnapshotValueMap, DocumentGenerationResult, WritebackExecutionResult } from "./types";
import { runDataService, type RunData, type RunDataService } from "./RunDataService";
import { runDefinitionProvider, RunDefinitionProvider, type RunSection } from "./RunDefinitionProvider";
import { normalizeRunnerStepType } from "../../../shared/types/runnerStepTypes";

export interface GenerateDocumentsOptions {
  runData?: RunData;
  finalStepId?: string;
  toPdf?: boolean;
}

// RUN2-20: `initialValues` may come straight from a URL query string
// (client/src/hooks/runner/useRunSession.ts), where every value has already
// been run through `JSON.parse` best-effort. That makes the stored *type*
// depend on the digits' shape (`"12345"` -> number, `"01234"` -> string) with
// no reference to what the question actually expects. Coerce against the
// step's normalized runner type instead, so a short_text alias always stores
// a string, a number/currency/scale alias always stores a number (or is left
// alone rather than becoming NaN), and a boolean alias always stores a real
// boolean. Everything else (choice, address, multi_field, date/time, ...)
// legitimately carries arrays/objects and is left as parsed.
const TEXT_LIKE_RUNNER_STEP_TYPES = new Set<string>(["short_text", "long_text", "text", "email", "website", "phone"]);
const NUMERIC_RUNNER_STEP_TYPES = new Set<string>(["number", "currency", "scale"]);

function coerceInitialValueForStepType(value: unknown, stepType: string): unknown {
  const normalizedType = normalizeRunnerStepType(stepType);

  if (TEXT_LIKE_RUNNER_STEP_TYPES.has(normalizedType)) {
    return typeof value === "string" ? value : String(value);
  }

  if (NUMERIC_RUNNER_STEP_TYPES.has(normalizedType)) {
    if (typeof value === "number") {return value;}
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
      return Number(value);
    }
    return value; // non-numeric string: leave as-is rather than coercing to NaN
  }

  if (normalizedType === "boolean") {
    if (typeof value === "boolean") {return value;}
    if (value === "true") {return true;}
    if (value === "false") {return false;}
    return value;
  }

  return value;
}

export class RunLifecycleService {
  // eslint-disable-next-line max-params
  constructor(
    private valueRepo = stepValueRepository,
    private stepRepo = stepRepository,
    private sectionRepo = sectionRepository,
    private persistence = new RunPersistenceWriter(),
    private logicSvc = logicService,
    private runDataSvc: RunDataService = runDataService,
    private definitionProvider: RunDefinitionProvider = runDefinitionProvider
  ) { }

  /**
   * Execute onRunStart blocks
   * Called after run creation to initialize computed values
   */
  async executeOnRunStart(
    runId: string,
    workflowId: string,
    versionId?: string
  ): Promise<{ success: boolean; errors?: string[] }> {
    try {
      const values = await this.persistence.getRunValues(runId);

      const blockResult = await blockRunner.runPhase({
        workflowId,
        runId,
        phase: "onRunStart",
        data: values,
        versionId: versionId ?? 'draft',
      });

      if (!blockResult.success && blockResult.errors) {
        logger.warn({ runId, errors: blockResult.errors }, `onRunStart block errors for run ${runId}`);
        return { success: false, errors: blockResult.errors };
      }

      return { success: true };
    } catch (error) {
      logger.error({ runId, error }, `Failed to execute onRunStart blocks for run ${runId}`);
      return { success: false, errors: [(error as Error).message] };
    }
  }

  /**
   * Populate step values with initial values and defaults
   * Priority: initialValues > snapshotValues > randomValues > step defaultValue
   */
  // eslint-disable-next-line sonarjs/cognitive-complexity
  async populateInitialValues(
    runId: string,
    workflowId: string,
    options: PopulateValuesOptions
  ): Promise<void> {
    const { initialValues, snapshotValues, randomValues } = options;

    // Get all sections for the workflow
    const sections = await this.sectionRepo.findByWorkflowId(workflowId);
    const sectionIds = sections.map(s => s.id);

    // Get all steps for these sections
    const allSteps = await this.stepRepo.findBySectionIds(sectionIds);

    const valuesToSave: Array<{ stepId: string; value: unknown }> = [];

    // Populate step values
    for (const step of allSteps) {
      if (step.isVirtual) {continue;}

      let valueToSet: unknown = undefined;

      // Priority 1: initialValues (by alias or stepId)
      if (initialValues) {
        if (step.alias && initialValues[step.alias] !== undefined) {
          valueToSet = coerceInitialValueForStepType(initialValues[step.alias], step.type);
        } else if (initialValues[step.id] !== undefined) {
          valueToSet = coerceInitialValueForStepType(initialValues[step.id], step.type);
        }
      }

      // Priority 2: snapshotValues
      if (valueToSet === undefined && snapshotValues) {
        const key = step.alias ?? step.id;
        if (snapshotValues[key] !== undefined) {
          valueToSet = snapshotValues[key];
        }
      }

      // Priority 3: randomValues
      if (valueToSet === undefined && randomValues) {
        const key = step.alias ?? step.id;
        if (randomValues[key] !== undefined) {
          valueToSet = randomValues[key];
        }
      }

      // Priority 4: step's defaultValue
      if (valueToSet === undefined && step.defaultValue !== undefined && step.defaultValue !== null) {
        valueToSet = step.defaultValue;
      }

      // Add to list if we have a value
      if (valueToSet !== undefined) {
        valuesToSave.push({
          stepId: step.id,
          value: valueToSet,
        });
      }
    }

    if (valuesToSave.length > 0) {
      await this.persistence.bulkSaveValues(runId, valuesToSave, workflowId);
    }
  }

  /**
   * Load and merge values from snapshot
   */
  async loadSnapshotValues(snapshotId: string): Promise<{ values: Record<string, unknown>; valueMap: SnapshotValueMap }> {
    const { snapshotService } = await import('../SnapshotService');
    const snapshot = await snapshotService.getSnapshotById(snapshotId);

    if (!snapshot) {
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }

    // Check Snapshot Compatibility (Stage 400 Safety Signal)
    const compatibility = await snapshotService.validateSnapshot(snapshotId);
    if (!compatibility.valid) {
      if (compatibility.severity === 'hard_breaking') {
        logger.error({
          snapshotId,
          reasons: compatibility.reasons
        }, "Prevented run creation from incompatible snapshot (Hard Breaking)");
        throw new Error(`Snapshot is incompatible with current workflow: ${compatibility.reasons.join(", ")}`);
      } else if (compatibility.severity === 'soft_breaking') {
        logger.warn({
          snapshotId,
          reasons: compatibility.reasons
        }, "Run created from snapshot with missing fields (Soft Breaking)");
      }
    }

    const snapshotValues = await snapshotService.getSnapshotValues(snapshotId);
    const snapshotValueMap = snapshot.values as SnapshotValueMap;

    return { values: snapshotValues, valueMap: snapshotValueMap };
  }

  /**
   * Generate random values using AI
   */
  async generateRandomValues(workflowId: string): Promise<Record<string, unknown>> {
    const { createAIServiceFromEnv } = await import('../AIService');

    // Get all steps for the workflow
    const allSteps = await this.stepRepo.findByWorkflowIdWithAliases(workflowId);
    const visibleSteps = allSteps.filter(s => !s.isVirtual);

    // Build step data for AI
    const stepData = visibleSteps.map(step => ({
      key: step.alias ?? step.id,
      type: step.type,
      label: step.title,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      choices: (step.config as { options?: any[] } | null | undefined)?.options,
      description: step.description ?? undefined,
    }));

    // Call AI service to generate random values
    const aiService = createAIServiceFromEnv();
    return aiService.suggestValues(stepData, 'full');
  }

  /**
   * Determine the appropriate start section for a run
   * Used for auto-advance when creating runs from snapshots
   *
   * Rules:
   * A) Skip invisible sections via existing logic
   * B) For each required visible step:
   *    - If no run value → stop here
   *    - If snapshot version mismatch → stop here
   * C) If all satisfied → jump to first visible final block
   * D) Else fallback to workflow's first section
   */
  // eslint-disable-next-line sonarjs/cognitive-complexity
  async determineStartSection(
    runId: string,
    workflowId: string,
    snapshotValues?: SnapshotValueMap
  ): Promise<string> {
    // Get all step values for the run
    const runValues = await this.valueRepo.findByRunId(runId);
    const runValueMap = new Map(runValues.map(v => [v.stepId, v]));

    // Build stepId-keyed data for logic evaluation. Document generation gets a
    // separate alias-keyed view from RunDataService; logic must stay on ids.
    const dataMap: Record<string, unknown> = {};
    for (const value of runValues) {
      dataMap[value.stepId] = value.value;
    }

    // Build LogicContext once. RVP-2: buildContext now sources from the
    // run's pinned definition (via runId) rather than always reading the
    // live tables -- pass runId through so a pinned run's start section is
    // resolved from what the respondent was actually shown.
    const logicCtx = await this.logicSvc.buildContext(workflowId, dataMap, runId);
    const sections = logicCtx.sections;
    if (sections.length === 0) {
      throw new Error("Workflow has no sections");
    }

    // Sort sections by order
    const sortedSections = [...sections].sort((a, b) => (a.order || 0) - (b.order || 0));
    const allSteps = logicCtx.steps;

    // Iterate through sections to find the first incomplete one
    for (const section of sortedSections) {
      // Check if section is visible using logic service
      const sectionVisible = await this.logicSvc.isSectionVisible(logicCtx, section.id);

      if (!sectionVisible) {
        continue; // Skip invisible sections
      }

      // Get steps for this section
      const sectionSteps = allSteps.filter(s => s.sectionId === section.id && !s.isVirtual);

      // Check if all required steps have valid values
      let allRequiredStepsSatisfied = true;

      for (const step of sectionSteps) {
        // Check if step is visible
        const stepVisible = await this.logicSvc.isStepVisible(logicCtx, step.id);

        if (!stepVisible) {
          continue; // Skip invisible steps
        }

        // Check if step is required
        const isRequired = await this.logicSvc.isStepRequired(logicCtx, step.id);

        if (!isRequired) {
          continue; // Skip optional steps
        }

        // Check if step has a value
        const hasValue = runValueMap.has(step.id);

        if (!hasValue) {
          // Required step missing value - stop here
          allRequiredStepsSatisfied = false;
          break;
        }

        // If snapshot values provided, check for version mismatch
        if (snapshotValues) {
          const key = step.alias ?? step.id;
          const snapshotData = snapshotValues[key];

          // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
          if (snapshotData) {
            const stepUpdatedAt = step.updatedAt?.toISOString() ?? new Date(0).toISOString();
            if (stepUpdatedAt > snapshotData.stepUpdatedAt) {
              // Step was updated after snapshot - treat as incomplete
              allRequiredStepsSatisfied = false;
              break;
            }
          }
        }
      }

      if (!allRequiredStepsSatisfied) {
        // Found first incomplete section - return this section
        return section.id;
      }
    }

    // All sections complete - return the last section (or first if none)
    return sortedSections[sortedSections.length - 1]?.id || sortedSections[0].id;
  }

  /** Per-run in-flight document generation, so concurrent triggers
   *  (completion + the client's explicit generate call) share one run. */
  private docGenInFlight = new Map<string, Promise<DocumentGenerationResult>>();

  /**
   * Generate documents for a completed run.
   * Idempotent: skips when the run already has generated documents, and
   * concurrent calls for the same run await the same in-flight generation.
   */
  async generateDocuments(runId: string, options: GenerateDocumentsOptions = {}): Promise<DocumentGenerationResult> {
    const inFlight = this.docGenInFlight.get(runId);
    if (inFlight) {return inFlight;}
    const generation = this.generateDocumentsInner(runId, options)
      .finally(() => this.docGenInFlight.delete(runId));
    this.docGenInFlight.set(runId, generation);
    return generation;
  }

  // eslint-disable-next-line complexity, sonarjs/cognitive-complexity
  private async generateDocumentsInner(runId: string, options: GenerateDocumentsOptions): Promise<DocumentGenerationResult> {
    try {
      // 1. Get run and workflow
      const run = await workflowRunRepository.findById(runId);
      if (!run) {throw createError.notFound('Workflow run', runId);}
      const workflowId = run.workflowId;

      const existingDocs = await runGeneratedDocumentsRepository.findByRunId(runId);
      if (existingDocs.length > 0) {
        logger.info({ runId, documentCount: existingDocs.length }, 'Documents already generated for run, skipping');
        await workflowRunRepository.updateGenerationStatus(runId, 'done');
        return { success: true, documentsGenerated: 0, documents: [] };
      }

      const claimed = await workflowRunRepository.tryMarkGenerationStarted(runId);
      if (!claimed) {
        logger.info({ runId }, 'Document generation already claimed by another worker');
        return { success: true, documentsGenerated: 0, documents: [] };
      }

      // 2. Collect document configs from every supported authoring shape:
      //    - Final Block steps (step.config as FinalBlockConfig), for both
      //      'final' and 'final_documents'
      //    - Legacy Final Documents sections (section.config.finalBlock)
      // RVP-4: sourced from the run's pinned definition (RunDefinitionProvider,
      // RVP-1), not the live tables. A document generated after the fact must
      // reflect the template mapping the respondent actually answered against,
      // not whatever the author has since edited the final block to say --
      // this is a correctness/auditability guarantee, not just UX. A
      // versionless run still falls back to the live tables via the
      // provider's 'live' branch (unchanged today-behavior, AC3).
      const { steps: definitionSteps, sections: definitionSections } = await this.definitionProvider.getDefinition(run);
      const workflow = await workflowRepository.findById(workflowId);
      if (!workflow) {throw createError.notFound('Workflow', workflowId);}
      if (!workflow.projectId) {throw createError.validation('Workflow has no projectId');}

      const finalBlockConfigs: FinalBlockConfig[] = [];
      for (const step of definitionSteps) {
        if (step.type !== 'final' && step.type !== 'final_documents') {continue;}
        if (options.finalStepId !== undefined && step.id !== options.finalStepId) {continue;}
        const config = step.config as FinalBlockConfig | null;
        if (config?.documents && config.documents.length > 0) {
          finalBlockConfigs.push(config);
        }
      }

      if (options.finalStepId === undefined) {
        const legacyConfig = await this.buildLegacyFinalBlockConfig(workflowId, workflow.projectId, definitionSections);
        if (legacyConfig) {
          finalBlockConfigs.push(legacyConfig);
        }
      }

      if (finalBlockConfigs.length === 0) {
        if (options.finalStepId !== undefined) {
          throw createError.validation('Invalid step: must be a Final Block with configured documents');
        }
        logger.info({ runId }, 'No Final Block steps or Final Documents sections found, skipping document generation');
        await workflowRunRepository.updateGenerationStatus(runId, 'done');
        return { success: true, documentsGenerated: 0, documents: [] };
      }

      // 3. Get canonical run data and hand documents the alias-keyed view.
      const runData = options.runData ?? await this.runDataSvc.buildForRun(runId, workflowId);
      const stepValues = runData.byAlias;

      // 4. Create scoped Template Resolver
      const resolveTemplate = createTemplateResolver(async (documentId: string) => {
        const template = await documentTemplateRepository.findByIdAndProjectId(documentId, workflow.projectId as string);
        if (!template) {
          throw createError.notFound('Template', documentId);
        }
        return template;
      });

      // 5. Generate documents for each config (hooks run inside the renderer)
      let totalGenerated = 0;
      const documents: NonNullable<DocumentGenerationResult['documents']> = [];
      const skipped: string[] = [];
      const failed: unknown[] = [];
      // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
      let archive: DocumentGenerationResult['archive'] | undefined;
      let isArchived = false;
      for (const finalBlockConfig of finalBlockConfigs) {
        const generationResult = await finalBlockRenderer.render({
          finalBlockConfig,
          stepValues,
          workflowId: run.workflowId,
          runId: run.id,
          resolveTemplate,
          toPdf: options.toPdf ?? false,
        });
        totalGenerated += generationResult.totalGenerated;
        documents.push(...generationResult.documents);
        skipped.push(...generationResult.skipped);
        failed.push(...generationResult.failed);
        archive = generationResult.archive ?? archive;
        isArchived = isArchived || generationResult.isArchived;

        // 6. Persist records so documents appear in the run's document list
        for (const doc of generationResult.documents) {
          try {
            await runGeneratedDocumentsRepository.createDocument({
              runId: run.id,
              fileName: doc.filename,
              fileUrl: `/api/runs/${run.id}/final-documents/${doc.filename}/download`,
              mimeType: doc.mimeType,
              fileSize: doc.size,
              templateId: null,
              unresolvedVariables: doc.unresolvedVariables ?? [],
              // Whichever converter actually ran. Never defaulted: recording a
              // guess here is what made silently degraded PDFs invisible.
              //
              // Fallback is not stored separately (no column, and this change
              // deliberately avoids a migration) but it is recoverable: a
              // 'puppeteer' row on a server with PDF_CONVERTER_API_URL set means
              // the high-fidelity converter failed. The fallback itself is
              // logged at error level in PdfConverter.convert.
              pdfStrategy: doc.pdfStrategy,
            });
          } catch (persistError) {
            logger.warn({ persistError, runId, filename: doc.filename }, 'Failed to persist generated document record');
          }
        }
      }

      logger.info({ runId, totalGenerated }, 'Documents generated successfully');

      await workflowRunRepository.updateGenerationStatus(runId, 'done');

      return {
        success: true,
        documentsGenerated: totalGenerated,
        documents,
        archive,
        skipped,
        failed,
        isArchived,
      };
    } catch (error) {
      logger.error({ error, runId }, 'Document generation failed');
      const errorMessage = (error as Error).message;
      await workflowRunRepository.updateGenerationStatus(runId, `failed:${(error as Error).message.substring(0, 50)}`);
      return {
        success: false,
        documentsGenerated: 0,
        errors: [errorMessage]
      };
    }
  }

  /**
   * Synthesize a FinalBlockConfig from legacy Final Documents sections
   * (section.config.finalBlock === true with config.templates: string[]).
   * Template-level mapping carries over so the unified renderer path
   * preserves the old behavior.
   *
   * DEBT-13: this also used to read `template.metadata.visibleIf` into
   * `conditions` through an `as` cast, and the cast hid a shape mismatch --
   * the stored value is a ConditionGroup (`{ variable, operator }`) while the
   * renderer reads a LogicExpression (`{ key, op }`), so any such condition
   * would have evaluated to garbage. No code in this repo's history has ever
   * written that key and no rows carry it, so the read was deleted rather
   * than normalized. `conditions` is now unconditionally null -- which is
   * exactly what the old expression already produced for every row.
   *
   * RVP-4: `sections` is the run's pinned (or, for a versionless run, live)
   * definition from `RunDefinitionProvider` -- not a fresh live-table read --
   * so a legacy Final Documents section edited after the respondent started
   * does not retroactively change what gets generated.
   */
  private async buildLegacyFinalBlockConfig(workflowId: string, projectId: string, sections: RunSection[]): Promise<FinalBlockConfig | null> {
    const templateIds: string[] = [];
    for (const section of sections) {
      const config = section.config as { finalBlock?: boolean; templates?: string[] } | null;
      if (config?.finalBlock === true && Array.isArray(config.templates)) {
        templateIds.push(...config.templates);
      }
    }

    if (templateIds.length === 0) {
      return null;
    }

    const documents: FinalBlockConfig['documents'] = [];
    for (const templateId of templateIds) {
      const template = await documentTemplateRepository.findByIdAndProjectId(templateId, projectId);
      if (!template) {
        // RUN-12: a legacy template id that doesn't resolve within this
        // project is either deleted or cross-project — fail the generation
        // loudly (surfaced as generationStatus 'failed:…' by the caller)
        // instead of silently skipping, matching the step-based path's
        // resolver semantics.
        logger.warn({ workflowId, templateId }, 'Legacy Final Documents section references unresolvable template');
        throw createError.notFound('Template', templateId);
      }
      documents.push({
        id: templateId,
        documentId: templateId,
        alias: template.name,
        conditions: null,
        mapping: (template.mapping ?? undefined) as FinalBlockConfig['documents'][number]['mapping'],
      });
    }

    return documents.length > 0 ? { markdownHeader: '', documents } : null;
  }

  /**
   * Execute DataVault writebacks for a completed run
   */
  async executeWritebacks(
    runId: string,
    workflowId: string,
    userId?: string
  ): Promise<WritebackExecutionResult> {
    try {
      const result = await writebackExecutionService.executeWritebacksForRun(
        runId,
        workflowId,
        userId ?? undefined
      );

      if (result.rowsCreated > 0) {
        logger.info(
          { runId, rowsCreated: result.rowsCreated },
          'DataVault writeback completed'
        );
      }

      if (result.errors.length > 0) {
        logger.warn(
          { runId, errors: result.errors },
          'Some writeback mappings failed'
        );
      }

      return {
        success: result.errors.length === 0,
        rowsCreated: result.rowsCreated,
        errors: result.errors
      };
    } catch (error) {
      logger.error({ error, runId }, 'Writeback execution failed');
      return {
        success: false,
        rowsCreated: 0,
        errors: [(error as Error).message]
      };
    }
  }
}

export const runLifecycleService = new RunLifecycleService();
