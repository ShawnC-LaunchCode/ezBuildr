#!/usr/bin/env tsx
/**
 * Pre-commit Quality Checks
 *
 * Runs on staged files before commit:
 * 1. ESLint on staged files
 * 2. TypeScript type check
 * 3. Strict zone validation
 * 4. Related tests
 *
 * Fails commit if any check fails
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

interface CheckResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: CheckResult[] = [];

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

function printResults(): void {
  console.log(`\n${  '='.repeat(60)}`);
  console.log('Pre-Commit Quality Check Results');
  console.log('='.repeat(60));

  for (const result of results) {
    const icon = result.passed ? '✓' : '✗';
    const status = result.passed ? 'PASSED' : 'FAILED';
    console.log(`${icon} ${result.name}: ${status} (${formatDuration(result.duration)})`);
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
  }

  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  console.log('='.repeat(60));
  console.log(`Total: ${passed}/${total} checks passed`);
  console.log(`${'='.repeat(60)  }\n`);
}

function runCommand(command: string, name: string): boolean {
  const start = Date.now();
  try {
    execSync(command, { stdio: 'inherit', encoding: 'utf-8' });
    results.push({ name, passed: true, duration: Date.now() - start });
    return true;
  } catch (error: unknown) {
    results.push({
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start
    });
    return false;
  }
}

function getStagedFiles(): string[] {
  try {
    const output = execSync('git diff --cached --name-only --diff-filter=ACM', {
      encoding: 'utf-8'
    }).trim();

    if (!output) {
      return [];
    }

    return output.split('\n').filter(file => {
      // Only include files that exist and are TypeScript/JavaScript
      return existsSync(file) && /\.(ts|tsx|js|jsx)$/.test(file);
    });
  } catch (error: unknown) {
    console.error('Error getting staged files:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

function main(): void {
  console.log('Running pre-commit quality checks...\n');

  const stagedFiles = getStagedFiles();

  if (stagedFiles.length === 0) {
    console.log('No TypeScript/JavaScript files staged for commit.');
    console.log('Skipping quality checks.\n');
    process.exit(0);
  }

  console.log(`Found ${stagedFiles.length} staged file(s) to check:\n`);
  stagedFiles.slice(0, 10).forEach(file => console.log(`  - ${file}`));
  if (stagedFiles.length > 10) {
    console.log(`  ... and ${stagedFiles.length - 10} more`);
  }
  console.log('');

  let allPassed = true;

  // 1. ESLint on staged files
  console.log('1. Running ESLint on staged files...');
  const eslintFiles = stagedFiles.join(' ');
  if (stagedFiles.length > 0) {
    // --report-unused-disable-directives is deliberately applied here, on
    // staged files only, and not in `npm run lint`: the repo carries ~796
    // pre-existing unused directives, so a repo-wide flip would fail the
    // zero-error policy on day one. Scoping it to the diff ratchets the debt
    // down instead — you cannot add a new pointless suppression, but you are
    // not asked to clean up the existing ones to land an unrelated change.
    const passed = runCommand(
      `npx eslint ${eslintFiles} --max-warnings 0 --report-unused-disable-directives`,
      'ESLint'
    );
    allPassed = allPassed && passed;
  }

  // 2. TypeScript type check (full project)
  console.log('\n2. Running TypeScript type check...');
  const typeCheckPassed = runCommand('npm run type-check', 'TypeScript Type Check');
  allPassed = allPassed && typeCheckPassed;

  // 3. Strict zone validation
  console.log('\n3. Validating TypeScript strict zones...');
  const strictZonesPassed = runCommand(
    'npm run check:strict-zones',
    'Strict Zones Validation'
  );
  allPassed = allPassed && strictZonesPassed;

  // 4. Run tests related to changed files
  console.log('\n4. Running tests related to changed files...');
  // Only unit tests run here: `npm run test:unit` covers the unit-fast/unit-db
  // vitest projects only, so passing a tests/integration/* path makes vitest
  // exit 1 with "No test files found". Integration tests also need the test
  // database, so they are left to `npm run test:integration` / CI.
  const unitTestFiles = new Set<string>();
  const integrationTestFiles = new Set<string>();

  for (const file of stagedFiles) {
    if (!file.includes('server/') && !file.includes('shared/')) {
      continue;
    }
    const withoutExt = file.replace(/\.(ts|tsx|js|jsx)$/, '');
    const unitCandidates = [
      `${withoutExt}.test.ts`,
      `${withoutExt}.test.tsx`,
      `tests/unit/${path.basename(withoutExt)}.test.ts`
    ];
    const unitMatch = unitCandidates.find(f => existsSync(f));
    if (unitMatch) {
      unitTestFiles.add(unitMatch);
    }
    const integrationCandidate = `tests/integration/${path.basename(withoutExt)}.test.ts`;
    if (existsSync(integrationCandidate)) {
      integrationTestFiles.add(integrationCandidate);
    }
  }

  if (integrationTestFiles.size > 0) {
    console.log('Related integration tests (not run pre-commit; run via "npm run test:integration" or CI):');
    for (const file of integrationTestFiles) {
      console.log(`  - ${file}`);
    }
  }

  if (unitTestFiles.size > 0) {
    const testFilesList = [...unitTestFiles].join(' ');
    const testsPassed = runCommand(
      `npm run test:unit -- ${testFilesList}`,
      'Related Unit Tests'
    );
    allPassed = allPassed && testsPassed;
  } else {
    console.log('No related unit test files found, skipping test run.');
    results.push({
      name: 'Related Unit Tests',
      passed: true,
      duration: 0
    });
  }

  // Print results
  printResults();

  if (!allPassed) {
    console.error('❌ Pre-commit checks failed. Please fix the errors and try again.\n');
    console.log('Tips:');
    console.log('  - Run "npm run lint:fix" to auto-fix ESLint issues');
    console.log('  - Run "npm run type-check" to see TypeScript errors');
    console.log('  - Run "npm run quality:check" to run all checks locally');
    console.log('  - Use "git commit --no-verify" to bypass checks (not recommended)\n');
    process.exit(1);
  }

  console.log('✅ All pre-commit checks passed!\n');
  process.exit(0);
}

main();
