/**
 * Writeback Execution Service
 * Executes DataVault writeback mappings on workflow completion
 */

import {
  datavaultWritebackMappingsRepository,
  stepRepository,
  stepValueRepository,
  workflowRepository,
  projectRepository,
  type DbTransaction,
} from "../repositories";
import { DatavaultRowsService } from "./DatavaultRowsService";
import { createLogger } from "../logger";

const logger = createLogger({ module: "writeback-execution-service" });

export class WritebackExecutionService {
  private datavaultRowsService: DatavaultRowsService;

  constructor(datavaultRowsService?: DatavaultRowsService) {
    this.datavaultRowsService = datavaultRowsService || new DatavaultRowsService();
  }

  /**
   * Execute all writeback mappings for a completed workflow run
   * Called from RunService.completeRun()
   */
  async executeWritebacksForRun(
    runId: string,
    workflowId: string,
    userId: string,
    tx?: DbTransaction
  ): Promise<{ rowsCreated: number; errors: string[] }> {
    const log = logger.child({ runId, workflowId });
    log.info("Executing writeback mappings for completed run");

    const errors: string[] = [];
    let rowsCreated = 0;

    try {
      // 1. Get all writeback mappings for this workflow
      const mappings = await datavaultWritebackMappingsRepository.findByWorkflowId(
        workflowId,
        tx
      );

      if (mappings.length === 0) {
        log.debug("No writeback mappings configured for workflow");
        return { rowsCreated: 0, errors: [] };
      }

      log.info({ mappingCount: mappings.length }, "Found writeback mappings");

      // 2. Get tenant context for DataVault operations
      const workflow = await workflowRepository.findById(workflowId, tx);
      if (!workflow) {
        throw new Error("Workflow not found");
      }

      const project = await projectRepository.findById(workflow.projectId, tx);
      if (!project || !project.tenantId) {
        throw new Error("Project or tenant not found");
      }

      const tenantId = project.tenantId;

      // 3. Get all step values for this run
      const stepValues = await stepValueRepository.findByRunId(runId, tx);
      const valuesByStepId = new Map(stepValues.map(sv => [sv.stepId, sv.value]));

      // 4. Get all workflow steps with aliases
      const allSteps = await stepRepository.findByWorkflowId(workflowId, tx);
      const stepsByAlias = new Map(
        allSteps.filter(s => s.alias).map(s => [s.alias!, s])
      );

      // 5. Execute each writeback mapping
      for (const mapping of mappings) {
        try {
          log.info(
            { mappingId: mapping.id, tableId: mapping.tableId },
            "Executing writeback mapping"
          );

          // Build row values: { columnId: value }
          const rowValues: Record<string, any> = {};
          const columnMappings = mapping.columnMappings as Record<string, string>;

          for (const [stepAlias, columnId] of Object.entries(columnMappings)) {
            // Find step by alias
            const step = stepsByAlias.get(stepAlias);
            if (!step) {
              log.warn(
                { stepAlias },
                "Step not found for alias, skipping column in writeback"
              );
              continue;
            }

            // Get step value
            const value = valuesByStepId.get(step.id);
            if (value === undefined) {
              log.debug(
                { stepAlias, stepId: step.id },
                "No value found for step, skipping column"
              );
              continue;
            }

            rowValues[columnId] = value;
          }

          // Only create row if we have at least one value
          if (Object.keys(rowValues).length === 0) {
            log.warn(
              { mappingId: mapping.id },
              "No values to write, skipping writeback"
            );
            continue;
          }

          // Create DataVault row
          await this.datavaultRowsService.createRow(
            mapping.tableId,
            tenantId,
            rowValues,
            userId,
            tx
          );

          rowsCreated++;
          log.info(
            { mappingId: mapping.id, columnCount: Object.keys(rowValues).length },
            "Successfully created DataVault row"
          );
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Unknown error";
          log.error(
            { error, mappingId: mapping.id },
            "Failed to execute writeback mapping"
          );
          errors.push(`Mapping ${mapping.id}: ${errorMsg}`);
          // Continue with other mappings even if one fails
        }
      }

      log.info({ rowsCreated, errorCount: errors.length }, "Writeback execution completed");

      return { rowsCreated, errors };
    } catch (error) {
      log.error({ error }, "Writeback execution failed");
      throw error;
    }
  }
}

// Singleton instance
export const writebackExecutionService = new WritebackExecutionService();
