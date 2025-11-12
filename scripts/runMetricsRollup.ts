/**
 * Metrics Rollup Script
 *
 * Manually trigger metrics rollup aggregation.
 * Useful for backfilling data or testing the rollup logic.
 *
 * Usage:
 *   npm run metrics:rollup
 *   npm run metrics:rollup -- --bucket=5m --since=2025-01-01
 */

import { runRollup, computeAndSaveSLIs } from '../server/jobs/metricsRollup';
import { createLogger } from '../server/logger';

const logger = createLogger({ module: 'metrics-rollup-script' });

async function main() {
  const args = process.argv.slice(2);

  // Parse command line arguments
  let bucket: '1m' | '5m' | '1h' | '1d' | undefined;
  let since: Date | undefined;
  let until: Date | undefined;

  for (const arg of args) {
    if (arg.startsWith('--bucket=')) {
      bucket = arg.split('=')[1] as '1m' | '5m' | '1h' | '1d';
    } else if (arg.startsWith('--since=')) {
      since = new Date(arg.split('=')[1]);
    } else if (arg.startsWith('--until=')) {
      until = new Date(arg.split('=')[1]);
    }
  }

  logger.info('Starting metrics rollup', { bucket, since, until });

  try {
    // Run rollup
    await runRollup({ bucketSize: bucket, since, until });
    logger.info('Metrics rollup completed successfully');

    // Compute and save SLIs
    logger.info('Computing SLI windows');
    await computeAndSaveSLIs();
    logger.info('SLI windows computed successfully');

    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Metrics rollup failed');
    process.exit(1);
  }
}

main();
