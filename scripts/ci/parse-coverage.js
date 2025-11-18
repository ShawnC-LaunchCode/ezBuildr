#!/usr/bin/env node
/**
 * Coverage Parser for CI/CD
 *
 * Parses Vitest coverage data and outputs structured JSON
 * for use in GitHub Actions and Slack notifications.
 *
 * Usage:
 *   node parse-coverage.js [--coverage-json path] [--output path]
 *
 * Output format:
 * {
 *   "statements": { "total": 0, "covered": 0, "pct": 0 },
 *   "branches": { "total": 0, "covered": 0, "pct": 0 },
 *   "functions": { "total": 0, "covered": 0, "pct": 0 },
 *   "lines": { "total": 0, "covered": 0, "pct": 0 },
 *   "summary": {
 *     "pct": 0,
 *     "color": "green|yellow|red",
 *     "emoji": "🟢|🟡|🔴"
 *   },
 *   "topFiles": {
 *     "best": [ { "file": "path", "pct": 100 } ],
 *     "worst": [ { "file": "path", "pct": 0 } ]
 *   }
 * }
 */

import fs from 'fs';
import path from 'path';

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = {
    coverageJson: 'coverage/coverage-summary.json',
    output: 'coverage-parsed.json',
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--coverage-json' && i + 1 < process.argv.length) {
      args.coverageJson = process.argv[++i];
    } else if (arg === '--output' && i + 1 < process.argv.length) {
      args.output = process.argv[++i];
    }
  }

  return args;
}

/**
 * Determine color based on coverage percentage
 */
function getCoverageColor(pct) {
  if (pct >= 80) return 'green';
  if (pct >= 50) return 'yellow';
  return 'red';
}

/**
 * Get emoji for coverage percentage
 */
function getCoverageEmoji(pct) {
  if (pct >= 80) return '🟢';
  if (pct >= 50) return '🟡';
  return '🔴';
}

/**
 * Parse coverage summary JSON
 */
function parseCoverageSummary(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`ℹ️  Coverage file not found: ${filePath}`);
    return null;
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    console.log('✓ Loaded coverage summary');

    // Extract total coverage
    const total = data.total;
    if (!total) {
      console.log('⚠️  No total coverage found in file');
      return null;
    }

    const result = {
      statements: {
        total: total.statements.total,
        covered: total.statements.covered,
        pct: total.statements.pct,
      },
      branches: {
        total: total.branches.total,
        covered: total.branches.covered,
        pct: total.branches.pct,
      },
      functions: {
        total: total.functions.total,
        covered: total.functions.covered,
        pct: total.functions.pct,
      },
      lines: {
        total: total.lines.total,
        covered: total.lines.covered,
        pct: total.lines.pct,
      },
      summary: {
        // Use statements as overall percentage
        pct: total.statements.pct,
        color: getCoverageColor(total.statements.pct),
        emoji: getCoverageEmoji(total.statements.pct),
      },
      topFiles: extractTopFiles(data),
    };

    console.log(`  Statements: ${result.statements.pct}% (${result.statements.covered}/${result.statements.total})`);
    console.log(`  Branches:   ${result.branches.pct}% (${result.branches.covered}/${result.branches.total})`);
    console.log(`  Functions:  ${result.functions.pct}% (${result.functions.covered}/${result.functions.total})`);
    console.log(`  Lines:      ${result.lines.pct}% (${result.lines.covered}/${result.lines.total})`);

    return result;
  } catch (error) {
    console.error(`❌ Error parsing coverage: ${error.message}`);
    return null;
  }
}

/**
 * Extract top files (best and worst coverage)
 */
function extractTopFiles(data) {
  const files = [];

  // Iterate through all files (skip 'total')
  for (const [filePath, coverage] of Object.entries(data)) {
    if (filePath === 'total') continue;

    // Skip files with no statements (type definition files, etc.)
    if (coverage.statements.total === 0) continue;

    files.push({
      file: simplifyPath(filePath),
      pct: coverage.statements.pct,
    });
  }

  // Sort by percentage
  files.sort((a, b) => b.pct - a.pct);

  return {
    best: files.slice(0, 5),
    worst: files.slice(-5).reverse(),
  };
}

/**
 * Simplify file path for display
 */
function simplifyPath(filePath) {
  // Remove leading path up to project root
  const parts = filePath.split('/');
  const relevantParts = [];
  let foundRoot = false;

  for (const part of parts) {
    if (part === 'server' || part === 'client' || part === 'shared') {
      foundRoot = true;
    }
    if (foundRoot) {
      relevantParts.push(part);
    }
  }

  return relevantParts.join('/') || filePath;
}

/**
 * Main function
 */
function main() {
  console.log('📊 Parsing coverage data...\n');

  const args = parseArgs();
  const coverage = parseCoverageSummary(args.coverageJson);

  if (!coverage) {
    console.log('\n⚠️  No coverage data available');
    const emptyResult = {
      statements: { total: 0, covered: 0, pct: 0 },
      branches: { total: 0, covered: 0, pct: 0 },
      functions: { total: 0, covered: 0, pct: 0 },
      lines: { total: 0, covered: 0, pct: 0 },
      summary: { pct: 0, color: 'gray', emoji: '⚪' },
      topFiles: { best: [], worst: [] },
    };
    fs.writeFileSync(args.output, JSON.stringify(emptyResult, null, 2));
    console.log(`   Output: ${args.output} (empty)`);
    process.exit(0);
  }

  // Write output
  fs.writeFileSync(args.output, JSON.stringify(coverage, null, 2));
  console.log(`\n✅ Coverage parsed successfully`);
  console.log(`   Output: ${args.output}`);
  console.log(`   Overall: ${coverage.summary.pct}% ${coverage.summary.emoji}`);

  process.exit(0);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { parseCoverageSummary, getCoverageColor, getCoverageEmoji };
