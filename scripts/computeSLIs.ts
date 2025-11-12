/**
 * SLI Computation Script
 *
 * Manually compute and save SLI windows for all projects/workflows.
 * Useful for backfilling SLI data or debugging.
 *
 * Usage:
 *   npm run metrics:sli
 *   npm run metrics:sli -- --projectId=<uuid>
 *   npm run metrics:sli -- --workflowId=<uuid>
 */

import { computeAndSaveSLIs } from '../server/jobs/metricsRollup';
import sli from '../server/services/sli';
import { createLogger } from '../server/logger';

const logger = createLogger({ module: 'sli-computation-script' });

async function main() {
  const args = process.argv.slice(2);

  // Parse command line arguments
  let projectId: string | undefined;
  let workflowId: string | undefined;
  let window: '1d' | '7d' | '30d' = '7d';

  for (const arg of args) {
    if (arg.startsWith('--projectId=')) {
      projectId = arg.split('=')[1];
    } else if (arg.startsWith('--workflowId=')) {
      workflowId = arg.split('=')[1];
    } else if (arg.startsWith('--window=')) {
      window = arg.split('=')[1] as '1d' | '7d' | '30d';
    }
  }

  try {
    if (projectId && workflowId) {
      // Compute SLI for specific workflow
      logger.info('Computing SLI for workflow', { projectId, workflowId, window });

      const sliResult = await sli.computeSLI({ projectId, workflowId, window });

      logger.info('SLI computed', {
        successPct: sliResult.successPct,
        p95Ms: sliResult.p95Ms,
        errorBudgetBurnPct: sliResult.errorBudgetBurnPct,
        totalRuns: sliResult.totalRuns,
        violatesTarget: sliResult.violatesTarget,
      });

      // Get tenant ID from project
      const { db } = await import('../server/db');
      const project = await db.query.projects.findFirst({
        where: (projects, { eq }) => eq(projects.id, projectId),
      });

      if (project) {
        await sli.saveSLIWindow({
          tenantId: project.tenantId,
          projectId,
          workflowId,
          sli: sliResult,
        });
        logger.info('SLI window saved');
      }
    } else if (projectId) {
      // Compute SLI for specific project
      logger.info('Computing SLI for project', { projectId, window });

      const sliResult = await sli.computeSLI({ projectId, window });

      logger.info('SLI computed', {
        successPct: sliResult.successPct,
        p95Ms: sliResult.p95Ms,
        errorBudgetBurnPct: sliResult.errorBudgetBurnPct,
        totalRuns: sliResult.totalRuns,
        violatesTarget: sliResult.violatesTarget,
      });

      // Get tenant ID from project
      const { db } = await import('../server/db');
      const project = await db.query.projects.findFirst({
        where: (projects, { eq }) => eq(projects.id, projectId),
      });

      if (project) {
        await sli.saveSLIWindow({
          tenantId: project.tenantId,
          projectId,
          sli: sliResult,
        });
        logger.info('SLI window saved');
      }
    } else {
      // Compute SLIs for all projects/workflows
      logger.info('Computing SLIs for all projects/workflows');
      await computeAndSaveSLIs();
      logger.info('All SLI windows computed and saved');
    }

    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'SLI computation failed');
    process.exit(1);
  }
}

main();
