#!/usr/bin/env node
/**
 * Test Results Parser for CI/CD
 *
 * Parses Vitest and Playwright test results and outputs structured JSON
 * for use in GitHub Actions and Slack notifications.
 *
 * Usage:
 *   node parse-test-results.js [--vitest-json path] [--playwright-json path] [--output path]
 *
 * Output format:
 * {
 *   "vitest": {
 *     "total": 0,
 *     "passed": 0,
 *     "failed": 0,
 *     "skipped": 0,
 *     "duration": 0,
 *     "slowestTests": [ { "name": "string", "duration": 0 } ],
 *     "failures": [
 *       {
 *         "suite": "string",
 *         "test": "string",
 *         "error": "string",
 *         "location": "file:line"
 *       }
 *     ]
 *   },
 *   "playwright": {
 *     "total": 0,
 *     "passed": 0,
 *     "failed": 0,
 *     "skipped": 0,
 *     "flaky": 0,
 *     "duration": 0,
 *     "didNotRun": false,
 *     "slowestTests": [ { "name": "string", "duration": 0 } ],
 *     "failures": []
 *   },
 *   "summary": {
 *     "total": 0,
 *     "passed": 0,
 *     "failed": 0,
 *     "skipped": 0,
 *     "duration": 0,
 *     "status": "success|failure|warning",
 *     "slowestTest": { "name": "string", "duration": 0, "framework": "vitest|playwright" }
 *   }
 * }
 */

import fs from 'fs';
import { fileURLToPath } from 'url';
import _path from 'path';

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = {
    vitestJson: 'vitest-summary.json',
    playwrightJson: 'playwright-summary.json',
    output: 'test-results-parsed.json',
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--vitest-json' && i + 1 < process.argv.length) {
      args.vitestJson = process.argv[++i];
    } else if (arg === '--playwright-json' && i + 1 < process.argv.length) {
      args.playwrightJson = process.argv[++i];
    } else if (arg === '--output' && i + 1 < process.argv.length) {
      args.output = process.argv[++i];
    }
  }

  return args;
}

/**
 * Parse Vitest JSON results
 */
function parseVitestResults(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`ℹ️  Vitest results not found: ${filePath}`);
    return null;
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    console.log('✓ Loaded Vitest results');

    const result = {
      total: data.numTotalTests || 0,
      passed: data.numPassedTests || 0,
      failed: data.numFailedTests || 0,
      skipped: data.numPendingTests || 0,
      duration: data.testResults?.reduce((sum, r) => sum + (r.endTime - r.startTime), 0) || 0,
      failures: [],
      slowestTests: [],
    };

    // Extract all tests with durations for slowest test tracking
    const allTests = [];
    if (data.testResults) {
      data.testResults.forEach(testFile => {
        if (testFile.assertionResults) {
          testFile.assertionResults.forEach(test => {
            const name = `${test.ancestorTitles?.join(' › ')} › ${test.title}` || test.fullName || 'Unknown test';
            const duration = test.duration || 0;
            if (duration > 0) {
              allTests.push({ name, duration });
            }
          });
        }
      });
    }

    // Sort by duration and take top 5 slowest
    result.slowestTests = allTests
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 5);

    // Extract failure details
    if (data.testResults && data.numFailedTests > 0) {
      data.testResults.forEach(testFile => {
        if (testFile.assertionResults) {
          testFile.assertionResults.forEach(test => {
            if (test.status === 'failed') {
              const failure = {
                suite: test.ancestorTitles?.join(' › ') || 'Unknown',
                test: test.title || test.fullName || 'Unknown test',
                error: extractErrorMessage(test.failureMessages),
                // eslint-disable-next-line sonarjs/no-nested-template-literals
                location: `${testFile.name}${test.location ? `:${test.location.line}` : ''}`,
              };
              result.failures.push(failure);
            }
          });
        }
      });
    }

    console.log(`  Tests: ${result.passed}/${result.total} passed`);
    if (result.failed > 0) {
      console.log(`  ❌ ${result.failed} test(s) failed`);
    }

    return result;
  } catch (error) {
    console.error(`❌ Error parsing Vitest results: ${error.message}`);
    return null;
  }
}

/**
 * Parse Playwright JSON results
 */
function parsePlaywrightResults(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`ℹ️  Playwright results not found: ${filePath}`);
    return null;
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    console.log('✓ Loaded Playwright results');

    const result = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      flaky: 0,
      duration: 0,
      didNotRun: false,
      failures: [],
      slowestTests: [],
    };

    // Check if tests didn't run at all
    if (data.testDidNotRun) {
      result.didNotRun = true;
      console.log('  ⚠️  Playwright tests did not run');
      return result;
    }

    // Parse stats object (preferred format)
    if (data.stats) {
      result.total = (data.stats.expected || 0) + (data.stats.unexpected || 0) + (data.stats.skipped || 0) + (data.stats.flaky || 0);
      result.passed = data.stats.expected || 0;
      result.failed = data.stats.unexpected || 0;
      result.skipped = data.stats.skipped || 0;
      result.flaky = data.stats.flaky || 0;
      result.duration = data.stats.duration || 0;

      console.log(`  Tests: ${result.passed}/${result.total} passed`);
      if (result.failed > 0) {
        console.log(`  ❌ ${result.failed} test(s) failed`);
      }
      if (result.flaky > 0) {
        console.log(`  ⚠️  ${result.flaky} test(s) flaky`);
      }

      // Check if no tests ran despite file existing
      if (result.total === 0) {
        result.didNotRun = true;
        console.log('  ⚠️  Playwright reported 0 tests (possible webserver failure)');
      }
    }
    // Parse suites structure (alternative format)
    else if (data.suites && data.suites.length > 0) {
      const allTests = [];
      data.suites.forEach(suite => {
        if (suite.specs) {
          suite.specs.forEach(spec => {
            if (spec.tests) {
              allTests.push(...spec.tests);
            }
          });
        }
      });

      result.total = allTests.length;
      result.passed = allTests.filter(t => t.status === 'expected' || t.status === 'passed').length;
      result.failed = allTests.filter(t => t.status === 'unexpected' || t.status === 'failed').length;
      result.skipped = allTests.filter(t => t.status === 'skipped').length;
      result.flaky = allTests.filter(t => t.status === 'flaky').length;

      // Extract slowest tests
      result.slowestTests = allTests
        .filter(t => t.duration > 0)
        .map(t => ({
          name: `${t.projectName || 'Unknown'} › ${t.title || 'Unknown test'}`,
          duration: t.duration,
        }))
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 5);

      // Extract failures
      allTests.filter(t => t.status === 'failed' || t.status === 'unexpected').forEach(test => {
        result.failures.push({
          suite: test.projectName || 'Unknown',
          test: test.title || 'Unknown test',
          error: test.error?.message || 'No error details',
          location: test.location || 'Unknown location',
        });
      });

      console.log(`  Tests: ${result.passed}/${result.total} passed`);
    }
    // Unknown format
    else {
      console.log('  ⚠️  Playwright results in unknown format');
      result.didNotRun = true;
    }

    return result;
  } catch (error) {
    console.error(`❌ Error parsing Playwright results: ${error.message}`);
    return null;
  }
}

/**
 * Extract clean error message from failure messages array
 */
function extractErrorMessage(failureMessages) {
  if (!failureMessages || failureMessages.length === 0) {
    return 'No error details';
  }

  const message = failureMessages[0];

  // Try to extract just the error message without stack trace
  const lines = message.split('\n');
  const errorLines = [];

  for (const line of lines) {
    // Stop at stack trace
    if (line.trim().startsWith('at ') || line.includes('    at ')) {
      break;
    }
    errorLines.push(line);
  }

  // Limit to first 5 lines and 300 characters
  const errorText = errorLines.slice(0, 5).join('\n').substring(0, 300);
  return errorText || 'Error occurred';
}

/**
 * Determine overall status
 */
function determineStatus(vitest, playwright) {
  const totalFailed = (vitest?.failed || 0) + (playwright?.failed || 0);
  const didNotRun = playwright?.didNotRun || false;

  if (totalFailed > 0) {
    return 'failure';
  } else if (didNotRun) {
    return 'warning';
  } else {
    return 'success';
  }
}

/**
 * Main function
 */
function main() {
  console.log('🧪 Parsing test results...\n');

  const args = parseArgs();

  const vitest = parseVitestResults(args.vitestJson);
  const playwright = parsePlaywrightResults(args.playwrightJson);

  // Find the slowest test overall
  const allSlowTests = [
    ...(vitest?.slowestTests || []).map(t => ({ ...t, framework: 'vitest' })),
    ...(playwright?.slowestTests || []).map(t => ({ ...t, framework: 'playwright' })),
    console.log(`   Status: ${summary.status.toUpperCase()}`);
  console.log(`   Total: ${summary.passed}/${summary.total} passed`);

  // Exit with appropriate code
  if (summary.status === 'failure') {
    console.log('\n❌ Tests failed');
    // Don't exit with error - we want the notification to still run
    process.exit(0);
  } else if (summary.status === 'warning') {
    console.log('\n⚠️  Tests completed with warnings');
    process.exit(0);
  } else {
    console.log('\n✅ All tests passed');
    process.exit(0);
  }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { parseVitestResults, parsePlaywrightResults, determineStatus };
