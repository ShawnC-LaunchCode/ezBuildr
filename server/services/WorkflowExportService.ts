import {
  workflowRunRepository,
  stepValueRepository,
  workflowRepository,
  sectionRepository,
  stepRepository,
} from "../repositories";

import { workflowService } from "./WorkflowService";

/**
 * Service layer for workflow export functionality
 */
export class WorkflowExportService {
  private runRepo: typeof workflowRunRepository;
  private valueRepo: typeof stepValueRepository;
  private workflowRepo: typeof workflowRepository;
  private sectionRepo: typeof sectionRepository;
  private stepRepo: typeof stepRepository;
  private workflowSvc: typeof workflowService;

  constructor(
    runRepo?: typeof workflowRunRepository,
    valueRepo?: typeof stepValueRepository,
    workflowRepo?: typeof workflowRepository,
    sectionRepo?: typeof sectionRepository,
    stepRepo?: typeof stepRepository,
    workflowSvc?: typeof workflowService
  ) {
    this.runRepo = runRepo || workflowRunRepository;
    this.valueRepo = valueRepo || stepValueRepository;
    this.workflowRepo = workflowRepo || workflowRepository;
    this.sectionRepo = sectionRepo || sectionRepository;
    this.stepRepo = stepRepo || stepRepository;
    this.workflowSvc = workflowSvc || workflowService;
  }

  /**
   * Export workflow runs as JSON
   */
  async exportJSON(workflowId: string, userId: string): Promise<any[]> {
    await this.workflowSvc.verifyAccess(workflowId, userId);

    const runs = await this.runRepo.findByWorkflowId(workflowId);
    const workflow = await this.workflowRepo.findById(workflowId);
    const sections = await this.sectionRepo.findByWorkflowId(workflowId);
    const sectionIds = sections.map((s) => s.id);
    const steps = await this.stepRepo.findBySectionIds(sectionIds);

    // Build step map for reference
    const stepMap = new Map(steps.map((step) => [step.id, step]));

    // Build export data
    const exportData = [];

    for (const run of runs) {
      const values = await this.valueRepo.findByRunId(run.id);

      const runData: any = {
        runId: run.id,
        createdBy: run.createdBy,
        completed: run.completed,
        completedAt: run.completedAt,
        createdAt: run.createdAt,
        data: {},
      };

      // Add values with step titles as keys
      values.forEach((v) => {
        const step = stepMap.get(v.stepId);
        const key = step ? step.title : v.stepId;
        runData.data[key] = v.value;
      });

      exportData.push(runData);
    }

    return exportData;
  }

  /**
   * Export workflow runs as CSV
   */
  async exportCSV(workflowId: string, userId: string): Promise<string> {
    await this.workflowSvc.verifyAccess(workflowId, userId);

    const runs = await this.runRepo.findByWorkflowId(workflowId);
    const workflow = await this.workflowRepo.findById(workflowId);
    const sections = await this.sectionRepo.findByWorkflowId(workflowId);
    const sectionIds = sections.map((s) => s.id);
    const steps = await this.stepRepo.findBySectionIds(sectionIds);

    // Build step map
    const stepMap = new Map(steps.map((step) => [step.id, step]));

    // Collect all unique step keys
    const allStepKeys = new Set<string>();
    for (const run of runs) {
      const values = await this.valueRepo.findByRunId(run.id);
      values.forEach((v) => {
        const step = stepMap.get(v.stepId);
        if (step) {
          allStepKeys.add(step.title);
        }
      });
    }

    // Build CSV headers
    const headers = [
      'Run ID',
      'Created By',
      'Completed',
      'Completed At',
      'Created At',
      ...Array.from(allStepKeys),
    ];

    // Build CSV rows
    const rows: string[][] = [];
    for (const run of runs) {
      const values = await this.valueRepo.findByRunId(run.id);

      // Build value map
      const valueMap = new Map<string, any>();
      values.forEach((v) => {
        const step = stepMap.get(v.stepId);
        if (step) {
          valueMap.set(step.title, v.value);
        }
      });

      const row = [
        run.id,
        run.createdBy || 'anon',
        (run.completed ?? false).toString(),
        run.completedAt?.toISOString() || '',
        run.createdAt?.toISOString() || '',
        ...Array.from(allStepKeys).map((key) => {
          const value = valueMap.get(key);
          if (value === null || value === undefined) {
            return '';
          }
          if (typeof value === 'object') {
            return JSON.stringify(value);
          }
          return String(value);
        }),
      ];

      rows.push(row);
    }

    // Format as CSV
    const csvLines = [
      headers.map(escapeCSVValue).join(','),
      ...rows.map((row) => row.map(escapeCSVValue).join(',')),
    ];

    return csvLines.join('\n');
  }
}

/**
 * Escape CSV values (handle quotes and commas)
 */
function escapeCSVValue(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// Singleton instance
export const workflowExportService = new WorkflowExportService();
