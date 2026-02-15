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
import { fileURLToPath } from 'url';

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = {
    testResults: 'test-results-parsed.json',
    coverage: 'coverage-parsed.json',
    fileChanges: 'file-changes.json',
    coverageDelta: 'coverage-delta.json',
    failureDelta: 'test-failures-delta.json',
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
    } else if (arg === '--failure-delta' && i + 1 < process.argv.length) {
      args.failureDelta = process.argv[++i];
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
  if (ms < 1000) {return `${ms}ms`;}
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes === 0) {return `${seconds}s`;}
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
function buildMainMessage(testResults, coverage, fileChanges, coverageDelta, failureDelta) {
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
  const activeTests = total - skipped; // Tests that actually ran
  const passRate = activeTests > 0 ? ((passed / activeTests) * 100).toFixed(1) : '0.0';

  // New failure detection
  const newFailures = failureDelta?.summary?.newCount || 0;
  const hasNewFailures = failureDelta?.summary?.hasNewFailures || false;

  // Coverage
  const coveragePct = coverage?.summary?.pct?.toFixed(1) || 'N/A';
  const coverageEmoji = coverage?.summary?.emoji || '⚪';

  // Coverage delta
  let coverageDeltaText = '';
  if (coverageDelta && coverageDelta.delta !== 0) {
    const sign = coverageDelta.delta > 0 ? '+' : '';
    coverageDeltaText = ` (${sign}${coverageDelta.delta.toFixed(1)}%)`;
  }

  // Duration
  const duration = testResults?.summary?.duration || 0;
  const durationText = formatDuration(duration);

  // Build header
  const headerText = `🚀 Build #${runNumber} — ${branch} — ${statusEmoji} ${statusLabel}`;

  // Build compact body (NO LINKS)
  const bodyLines = [
    `• *Commit:* ${commitSha} — "${commitMessage}"`,
    `• *By:* @${actor}`,
    // eslint-disable-next-line sonarjs/no-nested-template-literals
    `• *Tests:* ✅ ${passed}/${activeTests} passed (${passRate}%)${failed > 0 ? ` • ❌ ${failed} failed` : ''}${skipped > 0 ? ` • ⏭️ ${skipped} skipped` : ''}`,
    `• *Coverage:* ${coverageEmoji} ${coveragePct}%${coverageDeltaText}`,
    `• *Test Duration:* ${durationText}`,
  ];

  // Add new failure warning if present
  if (hasNewFailures) {
    bodyLines.push(`• ⚠️ *${newFailures} NEW failure(s)* (previously passing)`);
  }

  const bodyText = bodyLines.join('\n');

  // Determine message color
  let color = '#10B981'; // green
  if (status === 'failure') {color = '#EF4444';} // red
  else if (status === 'warning') {color = '#F59E0B';} // amber

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
  const eventName = process.env.GITHUB_EVENT_NAME || 'push';
  const triggerText = eventName === 'pull_request' ? 'Pull Request' : eventName === 'push' ? 'Push' : eventName;

  const runUrl = `${serverUrl}/${repo}/actions/runs/${runId}`;
  const logsUrl = `${runUrl}/attempts/1`;
  const artifactsUrl = `${runUrl}#artifacts`;
  const compareUrl = fileChanges?.compareUrl || null;
  const prUrl = fileChanges?.pr?.url || null;

  const links = [
    `🔗 *Links & Info*`,
    ``,
    `*Trigger:* ${triggerText}`,
    ``,
    `• <${runUrl}|View Run>`,
    `• <${logsUrl}|Build Logs>`,
    `• <${artifactsUrl}|Artifacts>`,
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
function buildFailuresThread(testResults, failureDelta) {
  const failed = testResults?.summary?.failed || 0;

  if (failed === 0) {
    return {
      text: '✅ *All tests passed!*',
    };
  }

  const newFailures = failureDelta?.newFailures || [];
  const persistentFailures = failureDelta?.persistentFailures || [];
  const isFirstRun = failureDelta?.summary?.isFirstRun || false;

  const lines = [`❌ *${failed} Test(s) Failed*\n`];

  // Show new failures first if any
  if (newFailures.length > 0) {
    lines.push(`🆕 *${newFailures.length} NEW Failure(s)* (previously passing):\n`);

    newFailures.slice(0, 5).forEach((failure, index) => {
      const suite = failure.suite || 'Unknown';
      const test = failure.test || 'Unknown test';
      const error = failure.error || 'No error details';
      const location = failure.location || '';

      // Truncate error to first 150 chars
      const errorShort = error.substring(0, 150) + (error.length > 150 ? '...' : '');

      lines.push(`${index + 1}) *${suite}* › ${test}`);
      if (location) {
        lines.push(`   _${location}_`);
      }
      lines.push('   ```');
      lines.push(`   ${errorShort}`);
      lines.push('   ```');
      lines.push('');
    });

    if (newFailures.length > 5) {
      lines.push(`_...and ${newFailures.length - 5} more new failure(s)._\n`);
    }
  }

  // Show persistent failures if any and not first run
  if (persistentFailures.length > 0 && !isFirstRun) {
    lines.push(`\n🔁 *${persistentFailures.length} Persistent Failure(s)* (still failing):\n`);

    persistentFailures.slice(0, 3).forEach((failure, index) => {
      const suite = failure.suite || 'Unknown';
      const test = failure.test || 'Unknown test';
      const location = failure.location || '';

      lines.push(`${index + 1}) *${suite}* › ${test}`);
      if (location) {
        lines.push(`   _${location}_`);
      }
    });

    if (persistentFailures.length > 3) {
      lines.push(`\n_...and ${persistentFailures.length - 3} more persistent failure(s)._`);
    }
  }

  // If first run, show all failures
  if (isFirstRun) {
    const allFailures = [
      ...(testResults.vitest?.failures || []),
      ...(testResults.playwright?.failures || []),
    ];

    allFailures.slice(0, 5).forEach((failure, index) => {
      const suite = failure.suite || 'Unknown';
      const test = failure.test || 'Unknown test';
      const error = failure.error || 'No error details';
      const location = failure.location || '';

      const errorShort = error.substring(0, 150) + (error.length > 150 ? '...' : '');

      lines.push(`${index + 1}) *${suite}* › ${test}`);
      if (location) {
        lines.push(`   _${location}_`);
      }
      lines.push('   ```');
      lines.push(`   ${errorShort}`);
      lines.push('   ```');
      lines.push('');
    });

    if (allFailures.length > 5) {
      lines.push(`_...and ${allFailures.length - 5} more failure(s)._`);
    }
  }

  // Add link to fix context artifact
  const repo = process.env.GITHUB_REPOSITORY || 'unknown';
  const runId = process.env.GITHUB_RUN_ID || '0';
  const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
  const artifactsUrl = `${serverUrl}/${repo}/actions/runs/${runId}#artifacts`;

  lines.push('');
  lines.push(`📋 *Fix Context:* Download the \`fix-context\` artifact from <${artifactsUrl}|Artifacts> for comprehensive debugging info to paste into Claude Code.`);

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

  // Prioritize files needing attention
  if (coverage.topFiles?.worst?.length > 0) {
    lines.push('');
    lines.push('⚠️ *Files Needing Attention:*');
    coverage.topFiles.worst.slice(0, 3).forEach(file => {
      const icon = file.pct < 50 ? '🔴' : file.pct < 80 ? '🟡' : '🟢';
      lines.push(`  ${icon} \`${file.file}\`: ${file.pct.toFixed(1)}%`);
    });
  }

  // Add best coverage files (secondary)
  if (coverage.topFiles?.best?.length > 0) {
    lines.push('');
    lines.push('✅ *Best Coverage:*');
    coverage.topFiles.best.slice(0, 3).forEach(file => {
      lines.push(`  • \`${file.file}\`: ${file.pct.toFixed(1)}%`);
    });
  }

  return {
    text: lines.join('\n'),
  };
}

/**
 * Build performance/slowest test thread message
 */
function buildPerformanceThread(testResults) {
  const slowestTest = testResults?.summary?.slowestTest;

  if (!slowestTest) {
    return {
      text: '⚡ *Test Performance*\nNo timing data available',
    };
  }

  const lines = [
    `⚡ *Test Performance*`,
    ``,
    `*Slowest Test:* ${formatDuration(slowestTest.duration)}`,
    `\`\`\``,
    slowestTest.name,
    `\`\`\``,
    `_Framework: ${slowestTest.framework}_`,
  ];

  // Add top 5 slowest from Vitest
  const vitestSlowest = testResults?.vitest?.slowestTests || [];
  if (vitestSlowest.length > 0) {
    lines.push('');
    lines.push('*Slowest Vitest Tests:*');
    vitestSlowest.slice(0, 5).forEach((test, index) => {
      lines.push(`  ${index + 1}. ${formatDuration(test.duration)} - ${test.name.substring(0, 60)}${test.name.length > 60 ? '...' : ''}`);
    });
  }

  // Add top 5 slowest from Playwright
  const playwrightSlowest = testResults?.playwright?.slowestTests || [];
  if (playwrightSlowest.length > 0) {
    lines.push('');
    lines.push('*Slowest Playwright Tests:*');
    playwrightSlowest.slice(0, 5).forEach((test, index) => {
      lines.push(`  ${index + 1}. ${formatDuration(test.duration)} - ${test.name.substring(0, 60)}${test.name.length > 60 ? '...' : ''}`);
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
  const failureDelta = loadJSON(args.failureDelta);

  if (!testResults) {
    console.error('❌ Test results are required');
    process.exit(1);
  }

  console.log('✓ Loaded test results');
  if (coverage) {console.log('✓ Loaded coverage');}
  if (fileChanges) {console.log('✓ Loaded file changes');}
  if (coverageDelta) {console.log('✓ Loaded coverage delta');}
  if (failureDelta) {console.log('✓ Loaded failure delta');}

  // Build payloads
  const payload = {
    main: buildMainMessage(testResults, coverage, fileChanges, coverageDelta, failureDelta),
    threads: {
      links: buildLinksThread(fileChanges),
      failures: buildFailuresThread(testResults, failureDelta),
      coverage: buildCoverageThread(coverage, coverageDelta),
      performance: buildPerformanceThread(testResults),
      artifacts: buildArtifactsThread(),
    },
  };

  // Write output
  fs.writeFileSync(args.output, JSON.stringify(payload, null, 2));
  console.log(`\n✅ Slack payload built successfully`);
  console.log(`   Output: ${args.output}`);
  console.log(`   Status: ${testResults.summary.status.toUpperCase()}`);
  if (failureDelta?.summary?.hasNewFailures) {
    console.log(`   ⚠️  ${failureDelta.summary.newCount} NEW failure(s) detected`);
  }

  process.exit(0);
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export {
  buildMainMessage,
  buildLinksThread,
  buildFailuresThread,
  buildCoverageThread,
  buildArtifactsThread,
};
