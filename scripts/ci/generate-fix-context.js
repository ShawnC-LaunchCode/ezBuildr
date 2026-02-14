#!/usr/bin/env node
/**
 * Generate Fix Context for Claude Code
 *
 * Creates a comprehensive markdown document with all context needed
 * to fix failing tests, designed for copy/paste into Claude Code.
 *
 * Usage:
 *   node generate-fix-context.js \
 *     --test-results path \
 *     --failure-delta path \
 *     --file-changes path \
 *     --output path
 *
 * Output: A markdown file with:
 * - Failed test details (suite, test, error, stack trace)
 * - Git diff of changed files
 * - Environment information
 * - Links to test files and source code
 * - Suggested investigation steps
 */

import { execSync } from 'child_process';
import fs from 'fs';

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = {
    testResults: 'test-results-parsed.json',
    failureDelta: 'test-failures-delta.json',
    fileChanges: 'file-changes.json',
    output: 'fix-context.md',
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--test-results' && i + 1 < process.argv.length) {
      args.testResults = process.argv[++i];
    } else if (arg === '--failure-delta' && i + 1 < process.argv.length) {
      args.failureDelta = process.argv[++i];
    } else if (arg === '--file-changes' && i + 1 < process.argv.length) {
      args.fileChanges = process.argv[++i];
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
 * Execute git command safely
 */
function gitCommand(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    return null;
  }
}

/**
 * Get git diff for changed files
 */
function getGitDiff(_maxFiles = 5) {
  const sha = process.env.GITHUB_SHA;
  if (!sha) {return null;}

  const compareTarget = `${sha}^`;
  const diff = gitCommand(`git diff ${compareTarget} HEAD`);

  if (!diff) {return null;}

  // Truncate if too large (max 5000 lines)
  const lines = diff.split('\n');
  if (lines.length > 5000) {
    return `${lines.slice(0, 5000).join('\n')  }\n\n... (diff truncated, too large)`;
  }

  return diff;
}

/**
 * Generate markdown for a single failure
 */
function generateFailureSection(failure, index, isNew = false) {
  const newBadge = isNew ? ' 🆕 **NEW FAILURE**' : '';

  return `
### ${index + 1}. ${failure.suite} › ${failure.test}${newBadge}

**Location:** \`${failure.location || 'Unknown'}\`

**Error:**
\`\`\`
${failure.error || 'No error details'}
\`\`\`

**Investigation Steps:**
1. Review the test file: \`${failure.location || 'unknown'}\`
2. Check if recent code changes affected this test
3. Run the test locally: \`npm run test:unit -- ${failure.location?.split(':')[0] || ''}\`
4. Check for race conditions or async issues
5. Verify test setup and teardown

---
`;
}

/**
 * Generate complete fix context markdown
 */
function generateFixContext(testResults, failureDelta, fileChanges) {
  const lines = [];
  const repo = process.env.GITHUB_REPOSITORY || 'unknown';
  const runId = process.env.GITHUB_RUN_ID || '0';
  const sha = process.env.GITHUB_SHA?.substring(0, 7) || 'unknown';
  const branch = process.env.GITHUB_REF_NAME || 'unknown';
  const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
  const runUrl = `${serverUrl}/${repo}/actions/runs/${runId}`;

  // Header
  lines.push(`# 🔧 Test Failure Fix Context`);
  lines.push(``);
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Branch:** ${branch}`);
  lines.push(`**Commit:** ${sha}`);
  lines.push(`**Run:** [View on GitHub](${runUrl})`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  // Summary
  const totalFailed = testResults.summary.failed || 0;
  const newCount = failureDelta?.summary?.newCount || 0;
  const persistentCount = failureDelta?.summary?.persistentCount || 0;

  lines.push(`## Summary`);
  lines.push(``);
  lines.push(`- **Total Failed:** ${totalFailed} test(s)`);
  lines.push(`- **New Failures:** ${newCount} test(s) 🆕`);
  lines.push(`- **Persistent Failures:** ${persistentCount} test(s)`);
  lines.push(`- **Test Pass Rate:** ${((testResults.summary.passed / testResults.summary.total) * 100).toFixed(1)}%`);
  lines.push(``);

  if (newCount > 0) {
    lines.push(`> ⚠️ **${newCount} new test failure(s)** detected - these tests were passing in the previous run!`);
    lines.push(``);
  }

  lines.push(`---`);
  lines.push(``);

  // New Failures Section
  if (newCount > 0) {
    lines.push(`## 🆕 New Failures (Just Started Failing)`);
    lines.push(``);
    lines.push(`These tests were passing before and just started failing:`);
    lines.push(``);

    failureDelta.newFailures.forEach((failure, index) => {
      lines.push(generateFailureSection(failure, index, true));
    });
  }

  // Persistent Failures Section
  if (persistentCount > 0 && !failureDelta?.summary?.isFirstRun) {
    lines.push(`## 🔁 Persistent Failures (Still Failing)`);
    lines.push(``);
    lines.push(`These tests were already failing in the previous run:`);
    lines.push(``);

    failureDelta.persistentFailures.slice(0, 10).forEach((failure, index) => {
      lines.push(generateFailureSection(failure, index, false));
    });

    if (failureDelta.persistentFailures.length > 10) {
      lines.push(`\n... and ${failureDelta.persistentFailures.length - 10} more persistent failure(s).\n`);
    }
  }

  // All Failures (if first run or no delta)
  if (failureDelta?.summary?.isFirstRun || !failureDelta) {
    lines.push(`## ❌ All Failures`);
    lines.push(``);

    const allFailures = [
      ...(testResults.vitest?.failures || []),
      ...(testResults.playwright?.failures || []),
    ];

    allFailures.slice(0, 10).forEach((failure, index) => {
      lines.push(generateFailureSection(failure, index, false));
    });

    if (allFailures.length > 10) {
      lines.push(`\n... and ${allFailures.length - 10} more failure(s).\n`);
    }
  }

  // Recent Changes
  if (fileChanges && fileChanges.filesChanged > 0) {
    lines.push(`## 📝 Recent Changes`);
    lines.push(``);
    lines.push(`**${fileChanges.filesChanged} file(s) changed** (+${fileChanges.additions} -${fileChanges.deletions})`);
    lines.push(``);

    const topChanges = fileChanges.files
      .sort((a, b) => (b.additions + b.deletions) - (a.additions + a.deletions))
      .slice(0, 10);

    lines.push(`**Most Changed Files:**`);
    topChanges.forEach(file => {
      lines.push(`- \`${file.path}\` (+${file.additions} -${file.deletions})`);
    });
    lines.push(``);
    lines.push(`---`);
    lines.push(``);
  }

  // Git Diff
  const diff = getGitDiff();
  if (diff) {
    lines.push(`## 🔍 Git Diff`);
    lines.push(``);
    lines.push(`<details>`);
    lines.push(`<summary>Click to expand full diff</summary>`);
    lines.push(``);
    lines.push(`\`\`\`diff`);
    lines.push(diff);
    lines.push(`\`\`\``);
    lines.push(``);
    lines.push(`</details>`);
    lines.push(``);
    lines.push(`---`);
    lines.push(``);
  }

  // Environment Info
  lines.push(`## 🖥️ Environment`);
  lines.push(``);
  lines.push(`- **Node Version:** ${process.env.NODE_VERSION || 'unknown'}`);
  lines.push(`- **OS:** ${process.env.RUNNER_OS || 'unknown'}`);
  lines.push(`- **Event:** ${process.env.GITHUB_EVENT_NAME || 'unknown'}`);
  lines.push(`- **Actor:** ${process.env.GITHUB_ACTOR || 'unknown'}`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  // How to Use
  lines.push(`## 💡 How to Use This Context with Claude Code`);
  lines.push(``);
  lines.push(`1. **Copy this entire document**`);
  lines.push(`2. **Paste into Claude Code chat**`);
  lines.push(`3. **Ask Claude to:** "Please analyze these test failures and help me fix them"`);
  lines.push(``);
  lines.push(`Claude will have all the context needed to:`);
  lines.push(`- Understand what changed`);
  lines.push(`- Identify the root cause`);
  lines.push(`- Suggest specific fixes`);
  lines.push(`- Generate corrected code`);
  lines.push(``);

  return lines.join('\n');
}

/**
 * Main function
 */
function main() {
  console.log('🔧 Generating fix context for Claude Code...\n');

  const args = parseArgs();

  // Load data
  const testResults = loadJSON(args.testResults);
  const failureDelta = loadJSON(args.failureDelta);
  const fileChanges = loadJSON(args.fileChanges);

  if (!testResults) {
    console.error('❌ Test results are required');
    process.exit(1);
  }

  console.log('✓ Loaded test results');
  if (failureDelta) {console.log('✓ Loaded failure delta');}
  if (fileChanges) {console.log('✓ Loaded file changes');}

  // Generate markdown
  const markdown = generateFixContext(testResults, failureDelta, fileChanges);

  // Write output
  fs.writeFileSync(args.output, markdown);
  console.log(`\n✅ Fix context generated successfully`);
  console.log(`   Output: ${args.output}`);
  console.log(`   Size: ${(markdown.length / 1024).toFixed(1)} KB`);

  process.exit(0);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { generateFixContext };
