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
import { stepValueRepository, stepRepository, sectionRepository } from "../../repositories";
import { blockRunner } from "../BlockRunner";
import { documentGenerationService } from "../DocumentGenerationService";
import { logicService } from "../LogicService";
import { RunPersistenceWriter } from "../runs/RunPersistenceWriter";
import { writebackExecutionService } from "../WritebackExecutionService";

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
        versionId: versionId || 'draft',
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

    const valuesToSave: Array<{ stepId: string; value: any }> = [];

    // Populate step values
    for (const step of allSteps) {
      if (step.isVirtual) {continue;}

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
        const key = step.alias || step.id;
        if (snapshotValues[key] !== undefined) {
          valueToSet = snapshotValues[key];
        }
      }

      // Priority 3: randomValues
      if (valueToSet === undefined && randomValues) {
        const key = step.alias || step.id;
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
  async loadSnapshotValues(snapshotId: string): Promise<{ values: Record<string, any>; valueMap: SnapshotValueMap }> {
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
  async generateRandomValues(workflowId: string): Promise<Record<string, any>> {
    const { createAIServiceFromEnv } = await import('../AIService');

    // Get all steps for the workflow
    const allSteps = await this.stepRepo.findByWorkflowIdWithAliases(workflowId);
    const visibleSteps = allSteps.filter(s => !s.isVirtual);

    // Build step data for AI
    const stepData = visibleSteps.map(step => ({
      key: step.alias || step.id,
      type: step.type,
      label: step.title,
      options: step.options as any[] | undefined,
      description: step.description || undefined,
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
    const dataMap: Record<string, any> = {};
    for (const value of runValues) {
      const step = stepMap.get(value.stepId);
      if (step) {
        const key = step.alias || step.id;
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
          const key = step.alias || step.id;
          const snapshotData = snapshotValues[key];

          if (snapshotData) {
            const stepUpdatedAt = step.updatedAt?.toISOString() || new Date(0).toISOString();
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

  /**
   * Generate documents for a completed run
   */
  async generateDocuments(runId: string): Promise<DocumentGenerationResult> {
    try {
      await documentGenerationService.generateDocumentsForRun(runId);
      logger.info({ runId }, 'Documents generated successfully');

      // Count generated documents
      const { runGeneratedDocumentsRepository } = await import('../../repositories');
      const documents = await runGeneratedDocumentsRepository.findByRunId(runId);

      return {
        success: true,
        documentsGenerated: documents.length
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
        userId || undefined
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
