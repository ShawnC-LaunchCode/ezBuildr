#!/usr/bin/env node
/**
 * Coverage Delta Calculator for CI/CD
 *
 * Compares current coverage with previous run's coverage
 * and computes the delta (improvement or regression).
 *
 * Usage:
 *   node compute-coverage-delta.js \
 *     [--current path] \
 *     [--previous path] \
 *     [--output path]
 *
 * Output format:
 * {
 *   "current": 87.05,
 *   "previous": 85.23,
 *   "delta": 1.82,
 *   "improved": true,
 *   "emoji": "📈",
 *   "message": "Coverage improved by 1.82%"
 * }
 */

import fs from 'fs';

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = {
    current: 'coverage-parsed.json',
    previous: 'coverage-previous.json',
    output: 'coverage-delta.json',
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--current' && i + 1 < process.argv.length) {
      args.current = process.argv[++i];
    } else if (arg === '--previous' && i + 1 < process.argv.length) {
      args.previous = process.argv[++i];
    } else if (arg === '--output' && i + 1 < process.argv.length) {
      args.output = process.argv[++i];
    }
  }

  return args;
}

/**
 * Load coverage data from file
 */
function loadCoverage(path) {
  if (!fs.existsSync(path)) {
    return null;
  }

  try {
    const data = JSON.parse(fs.readFileSync(path, 'utf8'));
    if (!data.summary || typeof data.summary.pct !== 'number') {
      console.log(`⚠️  Invalid coverage format in ${path}`);
      return null;
    }
    return data;
  } catch (error) {
    console.log(`⚠️  Error loading ${path}: ${error.message}`);
    return null;
  }
}

/**
 * Compute coverage delta
 */
function computeDelta(current, previous) {
  const currentPct = current?.summary?.pct || 0;
  const previousPct = previous?.summary?.pct || 0;

  // If no previous coverage, can't compute delta
  if (!previous) {
    return {
      current: currentPct,
      previous: null,
      delta: 0,
      improved: null,
      emoji: '',
      message: 'No previous coverage data available',
    };
  }

  const delta = currentPct - previousPct;
  const improved = delta > 0;
  const regressed = delta < 0;

  let emoji = '➡️'; // No change
  let message = `Coverage unchanged at ${currentPct.toFixed(1)}%`;

  if (improved) {
    emoji = '📈';
    message = `Coverage improved by ${delta.toFixed(2)}%`;
  } else if (regressed) {
    emoji = '📉';
    message = `Coverage decreased by ${Math.abs(delta).toFixed(2)}%`;
  }

  return {
    current: currentPct,
    previous: previousPct,
    delta: parseFloat(delta.toFixed(2)),
    improved,
    emoji,
    message,
  };
}

/**
 * Save current coverage for next run
 */
function saveCoverageForNextRun(current, outputPath) {
  if (!current) {
    console.log('⚠️  No current coverage to save');
    return;
  }

  try {
    // Save just the summary for next run (keep it lightweight)
    const nextRunData = {
      summary: current.summary,
      timestamp: new Date().toISOString(),
    };

    fs.writeFileSync(outputPath, JSON.stringify(nextRunData, null, 2));
    console.log(`✓ Saved current coverage for next run: ${outputPath}`);
  } catch (error) {
    console.log(`⚠️  Could not save coverage for next run: ${error.message}`);
  }
}

/**
 * Main function
 */
function main() {
  console.log('📊 Computing coverage delta...\n');

  const args = parseArgs();

  // Load current and previous coverage
  const current = loadCoverage(args.current);
  const previous = loadCoverage(args.previous);

  if (!current) {
    console.error('❌ Current coverage data is required');
    process.exit(1);
  }

  console.log(`✓ Current coverage: ${current.summary.pct.toFixed(1)}%`);

  if (previous) {
    console.log(`✓ Previous coverage: ${previous.summary.pct.toFixed(1)}%`);
  } else {
    console.log('ℹ️  No previous coverage data found (first run or artifact expired)');
  }

  // Compute delta
  const delta = computeDelta(current, previous);

  console.log(`\n${delta.emoji} ${delta.message}`);

  // Write output
  fs.writeFileSync(args.output, JSON.stringify(delta, null, 2));
  console.log(`\n✅ Coverage delta computed successfully`);
  console.log(`   Output: ${args.output}`);

  // Save current coverage as "previous" for next run
  // This will be uploaded as an artifact
  saveCoverageForNextRun(current, 'coverage-for-next-run.json');

  process.exit(0);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { computeDelta, loadCoverage, saveCoverageForNextRun };
