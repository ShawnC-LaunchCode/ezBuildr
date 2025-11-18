#!/usr/bin/env node
/**
 * Slack BlockKit Payload Generator for CI/CD
 *
 * Builds comprehensive Slack notification payloads using BlockKit,
 * including main message and threaded replies for links, failures,
 * coverage, and artifacts.
 *
 * Usage:
 *   node build-slack-payload.js \
 *     --test-results path \
 *     --coverage path \
 *     --file-changes path \
 *     --output path
 *
 * Environment variables:
 *   GITHUB_RUN_NUMBER: Build/run number
 *   GITHUB_REF_NAME: Branch name
 *   GITHUB_SHA: Commit SHA
 *   GITHUB_ACTOR: Actor username
 *   GITHUB_REPOSITORY: owner/repo
 *   GITHUB_RUN_ID: Run ID
 *   GITHUB_SERVER_URL: GitHub server URL
 *   GITHUB_EVENT_NAME: Event type
 *
 * Output format:
 * {
 *   "main": { blocks, text, attachments },
 *   "threads": {
 *     "links": { text, unfurl_links: false },
 *     "failures": { text },
 *     "coverage": { text },
 *     "artifacts": { text }
 *   }
 * }
 */

import fs from 'fs';

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = {
    testResults: 'test-results-parsed.json',
    coverage: 'coverage-parsed.json',
    fileChanges: 'file-changes.json',
    coverageDelta: 'coverage-delta.json',
    output: 'slack-payload.json',
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--test-results' && i + 1 < process.argv.length) {
      args.testResults = process.argv[++i];
    } else if (arg === '--coverage' && i + 1 < process.argv.length) {
      args.coverage = process.argv[++i];
    } else if (arg === '--file-changes' && i + 1 < process.argv.length) {
      args.fileChanges = process.argv[++i];
    } else if (arg === '--coverage-delta' && i + 1 < process.argv.length) {
      args.coverageDelta = process.argv[++i];
    } else if (arg === '--output' && i + 1 < process.argv.length) {
      args.output = process.argv[++i];
    }
  }

  return args;
}

/**
 * Load JSON file safely
 */
function loadJSON(path) {
  if (!fs.existsSync(path)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (error) {
    console.error(`⚠️  Error loading ${path}: ${error.message}`);
    return null;
  }
}

/**
 * Format duration in human-readable format
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Get status emoji
 */
function getStatusEmoji(status) {
  switch (status) {
    case 'success':
      return '🟢';
    case 'failure':
      return '🔴';
    case 'warning':
      return '🟡';
    default:
      return '⚪';
  }
}

/**
 * Build main Slack message (compact, no links)
 */
function buildMainMessage(testResults, coverage, fileChanges, coverageDelta) {
  const runNumber = process.env.GITHUB_RUN_NUMBER || '0';
  const branch = process.env.GITHUB_REF_NAME || 'unknown';
  const status = testResults?.summary?.status || 'unknown';
  const statusEmoji = getStatusEmoji(status);
  const statusLabel = status.toUpperCase();

  // Commit info
  const commit = fileChanges?.commit || {};
  const commitSha = commit.sha || process.env.GITHUB_SHA?.substring(0, 7) || 'unknown';
  const commitMessage = commit.message || 'Unknown commit';
  const actor = commit.actor || process.env.GITHUB_ACTOR || 'unknown';

  // Test results
  const total = testResults?.summary?.total || 0;
  const passed = testResults?.summary?.passed || 0;
  const failed = testResults?.summary?.failed || 0;
  const skipped = testResults?.summary?.skipped || 0;

  // Coverage
  const coveragePct = coverage?.summary?.pct?.toFixed(1) || 'N/A';
  const coverageEmoji = coverage?.summary?.emoji || '⚪';

  // Coverage delta
  let coverageDeltaText = '';
  if (coverageDelta && coverageDelta.delta !== 0) {
    const sign = coverageDelta.delta > 0 ? '+' : '';
    coverageDeltaText = ` (${sign}${coverageDelta.delta.toFixed(1)}%)`;
  }

  // File changes
  const filesChanged = fileChanges?.filesChanged || 0;
  const heatEmoji = fileChanges?.heat?.emoji || '';
  const heatLabel = fileChanges?.heat?.label || '';

  // Duration
  const duration = testResults?.summary?.duration || 0;
  const durationText = formatDuration(duration);

  // Event type
  const eventName = process.env.GITHUB_EVENT_NAME || 'push';
  const triggerText = eventName === 'pull_request' ? 'PR' : eventName === 'push' ? 'Push' : eventName;

  // Build header
  const headerText = `🚀 Build #${runNumber} — ${branch} — ${statusEmoji} ${statusLabel}`;

  // Build compact body (NO LINKS)
  const bodyLines = [
    `• *Commit:* ${commitSha} — "${commitMessage}"`,
    `• *By:* @${actor}`,
    `• *Tests:* ✔ ${passed} passed${failed > 0 ? `, ❌ ${failed} failed` : ''}${skipped > 0 ? `, ➖ ${skipped} skipped` : ''}`,
    `• *Coverage:* ${coverageEmoji} ${coveragePct}%${coverageDeltaText}`,
    `• *Changes:* ${filesChanged} files changed ${heatEmoji}${heatLabel ? ` ${heatLabel}` : ''}`,
    `• *Duration:* ${durationText}`,
    `• *Trigger:* ${triggerText}`,
  ];

  const bodyText = bodyLines.join('\n');

  // Determine message color
  let color = '#10B981'; // green
  if (status === 'failure') color = '#EF4444'; // red
  else if (status === 'warning') color = '#F59E0B'; // amber

  // Build blocks
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: headerText,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: bodyText,
      },
    },
  ];

  return {
    text: headerText, // Fallback text
    blocks,
    attachments: [{ color }],
    unfurl_links: false,
    unfurl_media: false,
  };
}

/**
 * Build links thread message
 */
function buildLinksThread(fileChanges) {
  const repo = process.env.GITHUB_REPOSITORY || 'unknown';
  const runId = process.env.GITHUB_RUN_ID || '0';
  const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';

  const runUrl = `${serverUrl}/${repo}/actions/runs/${runId}`;
  const logsUrl = `${runUrl}/attempts/1`;
  const compareUrl = fileChanges?.compareUrl || null;
  const prUrl = fileChanges?.pr?.url || null;

  const links = [
    `🔗 *Links*`,
    `• <${runUrl}|View Run>`,
    `• <${logsUrl}|Build Logs>`,
  ];

  if (compareUrl) {
    links.push(`• <${compareUrl}|Compare Commits>`);
  }

  if (prUrl) {
    links.push(`• <${prUrl}|Related PR #${fileChanges.pr.number}>`);
  }

  return {
    text: links.join('\n'),
    unfurl_links: false,
    unfurl_media: false,
  };
}

/**
 * Build failed tests thread message
 */
function buildFailuresThread(testResults) {
  const failed = testResults?.summary?.failed || 0;

  if (failed === 0) {
    return {
      text: '✅ *All tests passed!*',
    };
  }

  const vitestFailures = testResults?.vitest?.failures || [];
  const playwrightFailures = testResults?.playwright?.failures || [];
  const allFailures = [...vitestFailures, ...playwrightFailures];

  if (allFailures.length === 0) {
    return {
      text: `❌ *${failed} test(s) failed* (details not available)`,
    };
  }

  const lines = [`❌ *${failed} Test(s) Failed*\n`];

  allFailures.slice(0, 10).forEach((failure, index) => {
    const suite = failure.suite || 'Unknown';
    const test = failure.test || 'Unknown test';
    const error = failure.error || 'No error details';
    const location = failure.location || '';

    // Truncate error to first 200 chars
    const errorShort = error.substring(0, 200) + (error.length > 200 ? '...' : '');

    lines.push(`${index + 1}) *${suite}* › ${test}`);
    if (location) {
      lines.push(`   _${location}_`);
    }
    lines.push('   ```');
    lines.push(`   ${errorShort}`);
    lines.push('   ```');
    lines.push('');
  });

  if (allFailures.length > 10) {
    lines.push(`_...and ${allFailures.length - 10} more failure(s). See logs for details._`);
  }

  return {
    text: lines.join('\n').substring(0, 3000), // Slack limit
  };
}

/**
 * Build coverage thread message
 */
function buildCoverageThread(coverage, coverageDelta) {
  if (!coverage || coverage.summary.pct === 0) {
    return {
      text: '📊 *Coverage Report*\nNo coverage data available',
    };
  }

  const delta = coverageDelta?.delta || 0;
  const deltaText = delta !== 0 ? ` (${delta > 0 ? '+' : ''}${delta.toFixed(1)}% since last run)` : '';

  const lines = [
    `📊 *Coverage Report*`,
    ``,
    `*Overall:* ${coverage.summary.pct.toFixed(1)}% ${coverage.summary.emoji}${deltaText}`,
    ``,
    `• Statements: ${coverage.statements.pct.toFixed(1)}% (${coverage.statements.covered}/${coverage.statements.total})`,
    `• Branches:   ${coverage.branches.pct.toFixed(1)}% (${coverage.branches.covered}/${coverage.branches.total})`,
    `• Functions:  ${coverage.functions.pct.toFixed(1)}% (${coverage.functions.covered}/${coverage.functions.total})`,
    `• Lines:      ${coverage.lines.pct.toFixed(1)}% (${coverage.lines.covered}/${coverage.lines.total})`,
  ];

  // Add top/bottom files if available
  if (coverage.topFiles?.best?.length > 0) {
    lines.push('');
    lines.push('*Best Coverage:*');
    coverage.topFiles.best.slice(0, 3).forEach(file => {
      lines.push(`  • ${file.file}: ${file.pct.toFixed(1)}%`);
    });
  }

  if (coverage.topFiles?.worst?.length > 0) {
    lines.push('');
    lines.push('*Needs Improvement:*');
    coverage.topFiles.worst.slice(0, 3).forEach(file => {
      lines.push(`  • ${file.file}: ${file.pct.toFixed(1)}%`);
    });
  }

  return {
    text: lines.join('\n'),
  };
}

/**
 * Build artifacts thread message (placeholder)
 */
function buildArtifactsThread() {
  // TODO: Will be populated in PR #8
  return {
    text: '📦 *Artifacts*\nNo artifacts configured yet',
  };
}

/**
 * Main function
 */
function main() {
  console.log('🎨 Building Slack payload...\n');

  const args = parseArgs();

  // Load data
  const testResults = loadJSON(args.testResults);
  const coverage = loadJSON(args.coverage);
  const fileChanges = loadJSON(args.fileChanges);
  const coverageDelta = loadJSON(args.coverageDelta);

  if (!testResults) {
    console.error('❌ Test results are required');
    process.exit(1);
  }

  console.log('✓ Loaded test results');
  if (coverage) console.log('✓ Loaded coverage');
  if (fileChanges) console.log('✓ Loaded file changes');
  if (coverageDelta) console.log('✓ Loaded coverage delta');

  // Build payloads
  const payload = {
    main: buildMainMessage(testResults, coverage, fileChanges, coverageDelta),
    threads: {
      links: buildLinksThread(fileChanges),
      failures: buildFailuresThread(testResults),
      coverage: buildCoverageThread(coverage, coverageDelta),
      artifacts: buildArtifactsThread(),
    },
  };

  // Write output
  fs.writeFileSync(args.output, JSON.stringify(payload, null, 2));
  console.log(`\n✅ Slack payload built successfully`);
  console.log(`   Output: ${args.output}`);
  console.log(`   Status: ${testResults.summary.status.toUpperCase()}`);

  process.exit(0);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export {
  buildMainMessage,
  buildLinksThread,
  buildFailuresThread,
  buildCoverageThread,
  buildArtifactsThread,
};
