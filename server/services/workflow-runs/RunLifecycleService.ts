/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
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


export class RunLifecycleService {
  constructor(
    private valueRepo = stepValueRepository,
    private stepRepo = stepRepository,
    private sectionRepo = sectionRepository,
    private persistence = new RunPersistenceWriter(),
    private logicSvc = logicService
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const valuesToSave: Array<{ stepId: string; value: any }> = [];

    // Populate step values
    for (const step of allSteps) {
      if (step.isVirtual) {continue;}

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let valueToSet: any = undefined;

      // Priority 1: initialValues (by alias or stepId)
      if (initialValues) {
        if (step.alias && initialValues[step.alias] !== undefined) {
          valueToSet = initialValues[step.alias];
        } else if (initialValues[step.id] !== undefined) {
          valueToSet = initialValues[step.id];
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
      options: step.options as any[] | undefined,
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
    // Get all sections for the workflow
    const sections = await this.sectionRepo.findByWorkflowId(workflowId);
    if (sections.length === 0) {
      throw new Error("Workflow has no sections");
    }

    // Sort sections by order
    const sortedSections = [...sections].sort((a, b) => (a.order || 0) - (b.order || 0));

    // Get all step values for the run
    const runValues = await this.valueRepo.findByRunId(runId);
    const runValueMap = new Map(runValues.map(v => [v.stepId, v]));

    // Get all steps for the workflow
    const allSteps = await this.stepRepo.findByWorkflowIdWithAliases(workflowId);
    const stepMap = new Map(allSteps.map(s => [s.id, s]));

    // Build data map for logic evaluation
    const dataMap: Record<string, unknown> = {};
    for (const value of runValues) {
      const step = stepMap.get(value.stepId);
      if (step) {
        const key = step.alias ?? step.id;
        dataMap[key] = value.value;
      }
    }

    // Iterate through sections to find the first incomplete one
    for (const section of sortedSections) {
      // Check if section is visible using logic service
      const sectionVisible = await this.logicSvc.isSectionVisible(
        workflowId,
        section.id,
        dataMap
      );

      if (!sectionVisible) {
        continue; // Skip invisible sections
      }

      // Get steps for this section
      const sectionSteps = allSteps.filter(s => s.sectionId === section.id && !s.isVirtual);

      // Check if all required steps have valid values
      let allRequiredStepsSatisfied = true;

      for (const step of sectionSteps) {
        // Check if step is visible
        const stepVisible = await this.logicSvc.isStepVisible(
          workflowId,
          step.id,
          dataMap
        );

        if (!stepVisible) {
          continue; // Skip invisible steps
        }

        // Check if step is required
        const isRequired = await this.logicSvc.isStepRequired(
          workflowId,
          step.id,
          dataMap
        );

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
  async generateDocuments(runId: string): Promise<DocumentGenerationResult> {
    const inFlight = this.docGenInFlight.get(runId);
    if (inFlight) {return inFlight;}
    const generation = this.generateDocumentsInner(runId)
      .finally(() => this.docGenInFlight.delete(runId));
    this.docGenInFlight.set(runId, generation);
    return generation;
  }

  private async generateDocumentsInner(runId: string): Promise<DocumentGenerationResult> {
    try {
      // 1. Get run and workflow
      const run = await workflowRunRepository.findById(runId);
      if (!run) {throw createError.notFound('Workflow run', runId);}
      const workflowId = run.workflowId;

      // Idempotency gate: a double-complete, or completion racing the
      // client's explicit generate-documents call, must not duplicate files
      const existingDocs = await runGeneratedDocumentsRepository.findByRunId(runId);
      if (existingDocs.length > 0) {
        logger.info({ runId, documentCount: existingDocs.length }, 'Documents already generated for run, skipping');
        return { success: true, documentsGenerated: 0 };
      }

      // 2. Collect document configs from BOTH shapes the product writes:
      //    - Final Block steps (step.options as FinalBlockConfig); the
      //      actual step types are 'final' and 'final_documents'
      //    - Legacy Final Documents sections (section.config.finalBlock
      //      with config.templates), which WorkflowService still creates
      const allSteps = await this.stepRepo.findByWorkflowIdWithAliases(workflowId);
      const finalBlockConfigs: FinalBlockConfig[] = [];
      for (const step of allSteps) {
        if (step.type !== 'final' && step.type !== 'final_documents') {continue;}
        const config = step.options as FinalBlockConfig | null;
        if (config?.documents && config.documents.length > 0) {
          finalBlockConfigs.push(config);
        }
      }

      const legacyConfig = await this.buildLegacyFinalBlockConfig(workflowId);
      if (legacyConfig) {
        finalBlockConfigs.push(legacyConfig);
      }

      if (finalBlockConfigs.length === 0) {
        logger.info({ runId }, 'No Final Block steps or Final Documents sections found, skipping document generation');
        return { success: true, documentsGenerated: 0 };
      }

      // 3. Get step values mapped by alias
      const stepValues = await this.valueRepo.getRunDataWithAliases(runId, allSteps);

      // 4. Create Template Resolver
      const workflow = await workflowRepository.findById(workflowId);
      if (!workflow) {throw createError.notFound('Workflow', workflowId);}
      if (!workflow.projectId) {throw createError.validation('Workflow has no projectId');}

      const resolveTemplate = createTemplateResolver(async (documentId: string) => {
        const template = await documentTemplateRepository.findByIdAndProjectId(documentId, workflow.projectId as string);
        if (!template) {
          throw createError.notFound('Template', documentId);
        }
        return template;
      });

      // 5. Generate documents for each config (hooks run inside the renderer)
      let totalGenerated = 0;
      for (const finalBlockConfig of finalBlockConfigs) {
        const generationResult = await finalBlockRenderer.render({
          finalBlockConfig,
          stepValues,
          workflowId: run.workflowId,
          runId: run.id,
          resolveTemplate
        });
        totalGenerated += generationResult.totalGenerated;

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
            });
          } catch (persistError) {
            logger.warn({ persistError, runId, filename: doc.filename }, 'Failed to persist generated document record');
          }
        }
      }

      logger.info({ runId, totalGenerated }, 'Documents generated successfully');

      return {
        success: true,
        documentsGenerated: totalGenerated
      };
    } catch (error) {
      logger.error({ error, runId }, 'Document generation failed');
      return {
        success: false,
        documentsGenerated: 0,
        errors: [(error as Error).message]
      };
    }
  }

  /**
   * Synthesize a FinalBlockConfig from legacy Final Documents sections
   * (section.config.finalBlock === true with config.templates: string[]).
   * Template-level mapping and metadata.visibleIf conditions carry over so
   * the unified renderer path preserves the old behavior.
   */
  private async buildLegacyFinalBlockConfig(workflowId: string): Promise<FinalBlockConfig | null> {
    const sections = await this.sectionRepo.findByWorkflowId(workflowId);
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
      const template = await documentTemplateRepository.findById(templateId);
      if (!template) {
        logger.warn({ workflowId, templateId }, 'Legacy Final Documents section references missing template, skipping');
        continue;
      }
      const metadata = template.metadata as { visibleIf?: unknown } | null;
      documents.push({
        id: templateId,
        documentId: templateId,
        alias: template.name,
        conditions: (metadata?.visibleIf ?? null) as FinalBlockConfig['documents'][number]['conditions'],
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
