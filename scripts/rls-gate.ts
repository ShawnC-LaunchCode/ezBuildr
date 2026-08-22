/**
 * RLS-5 — the enforcement gate.
 *
 * Runs the integration suite against a genuine NON-OWNER Postgres role
 * (`RLS_RESTRICTED=true`, see tests/setup.ts) and compares the failing files
 * against `.rls-allowlist.json`.
 *
 * WHY A GATE AND NOT JUST "FIX THE TAIL": the suite went from 39 passing files
 * to 102 over one session, and nothing held that in place. Every one of those
 * fixes is one careless commit from silently reverting, and a silent revert
 * here is expensive in a specific way — RLS failures do not throw. A read that
 * loses its tenant scope comes back EMPTY, so the regression looks like a
 * feature returning no data, not like a broken test.
 *
 * THE RATCHET RUNS BOTH WAYS, and the second direction is the point:
 *
 *   1. A file that fails and is NOT on the allowlist fails the build. This is
 *      the obvious direction — no new breakage lands.
 *   2. A file that is ON the allowlist and PASSES also fails the build, with
 *      an instruction to delete the entry. Without this the list only ever
 *      grows, entries outlive the problems they describe, and the gate quietly
 *      becomes decoration that certifies nothing. This repo has been bitten by
 *      exactly that shape more than once — a check that passes while proving
 *      nothing is worse than no check, because it is trusted.
 *
 * A missing or empty results file is a FAILURE, never a pass: a crashed run,
 * a database that never came up, or a vitest config error must not read as
 * "no failures". That failure mode is how the integration suite once went
 * months without running in CI at all.
 *
 * Usage:
 *   npx tsx scripts/rls-gate.ts              # run the suite, then check
 *   npx tsx scripts/rls-gate.ts --check-only # check an existing results file
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const ALLOWLIST_PATH = resolve(process.cwd(), '.rls-allowlist.json');
const RESULTS_PATH = resolve(process.cwd(), 'rls-gate-results.json');

type AllowlistEntry = {
  file: string;
  reason: string;
  followUp?: string;
};

type Allowlist = {
  $comment?: string;
  allow: AllowlistEntry[];
};

/** Jest-compatible shape emitted by vitest's json reporter. */
type VitestJson = {
  testResults?: Array<{
    name?: string;
    status?: string;
    assertionResults?: Array<{ status?: string }>;
  }>;
};

function toRepoRelative(absolutePath: string): string {
  return relative(process.cwd(), absolutePath).split('\\').join('/');
}

function readAllowlist(): AllowlistEntry[] {
  if (!existsSync(ALLOWLIST_PATH)) {
    throw new Error(
      `RLS gate: ${ALLOWLIST_PATH} does not exist. It is required — an absent ` +
      `allowlist would let the gate pass with every file failing.`
    );
  }
  const parsed = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8')) as Allowlist;
  if (!Array.isArray(parsed.allow)) {
    throw new Error('RLS gate: .rls-allowlist.json must contain an "allow" array.');
  }
  for (const entry of parsed.allow) {
    if (typeof entry.file !== 'string' || entry.file.length === 0) {
      throw new Error('RLS gate: every allowlist entry needs a "file".');
    }
    // A bare filename with no justification is how a temporary exception
    // becomes permanent. Require someone to have written down why.
    if (typeof entry.reason !== 'string' || entry.reason.trim().length === 0) {
      throw new Error(`RLS gate: allowlist entry "${entry.file}" needs a non-empty "reason".`);
    }
  }
  return parsed.allow;
}

function runSuite(): void {
  if (existsSync(RESULTS_PATH)) { unlinkSync(RESULTS_PATH); }

  console.log('RLS gate: running the integration suite as a non-owner role...\n');
  const result = spawnSync(
    'npx',
    [
      'vitest', 'run', '--project', 'integration',
      '--reporter=default', '--reporter=json', `--outputFile=${RESULTS_PATH}`,
    ],
    {
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, RLS_RESTRICTED: 'true', VITEST_SINGLE_FORK: 'true' },
    }
  );

  // A non-zero exit is EXPECTED while the allowlist is non-empty — failing
  // tests are the whole point of the list. The verdict comes from comparing
  // results to the allowlist below, not from vitest's exit code. But a run
  // that produced no results file at all did not run, and that is fatal.
  if (result.error) {
    throw new Error(`RLS gate: could not start vitest — ${result.error.message}`);
  }
}

function readFailingFiles(): Set<string> {
  if (!existsSync(RESULTS_PATH)) {
    throw new Error(
      `RLS gate: no results at ${RESULTS_PATH}. The suite did not run to completion ` +
      `(a crash, or a database that never came up). Refusing to report a pass — ` +
      `"no failures recorded" and "nothing ran" must never look the same.`
    );
  }

  const json = JSON.parse(readFileSync(RESULTS_PATH, 'utf8')) as VitestJson;
  const fileResults = json.testResults ?? [];
  if (fileResults.length === 0) {
    throw new Error(
      'RLS gate: the results file contains zero test files. Same reasoning as above — ' +
      'this is a broken run, not a clean one.'
    );
  }

  const failing = new Set<string>();
  for (const file of fileResults) {
    if (file.name === undefined) { continue; }
    const failed = file.status === 'failed'
      || (file.assertionResults ?? []).some((a) => a.status === 'failed');
    if (failed) { failing.add(toRepoRelative(file.name)); }
  }
  return failing;
}

function main(): void {
  const checkOnly = process.argv.includes('--check-only');
  const allowlist = readAllowlist();

  if (!checkOnly) { runSuite(); }

  const failing = readFailingFiles();
  const allowed = new Set(allowlist.map((e) => e.file));

  const unexpectedFailures = [...failing].filter((f) => !allowed.has(f)).sort();
  // An allowlisted file that ran and did NOT fail is now fixed.
  const ranFiles = new Set<string>();
  const json = JSON.parse(readFileSync(RESULTS_PATH, 'utf8')) as VitestJson;
  for (const f of json.testResults ?? []) {
    if (f.name !== undefined) { ranFiles.add(toRepoRelative(f.name)); }
  }
  const nowPassing = [...allowed].filter((f) => ranFiles.has(f) && !failing.has(f)).sort();
  const notRun = [...allowed].filter((f) => !ranFiles.has(f)).sort();

  console.log(`\nRLS gate: ${failing.size} failing file(s), ${allowed.size} allowlisted.\n`);

  let failed = false;

  if (unexpectedFailures.length > 0) {
    failed = true;
    console.error('❌ These files fail under RLS enforcement and are NOT allowlisted:\n');
    for (const f of unexpectedFailures) { console.error(`   ${f}`); }
    console.error(
      '\n   Fix the scoping, or — if it is a deliberate, understood exception —\n' +
      '   add it to .rls-allowlist.json WITH a reason. Do not add it just to\n' +
      '   make the build green; an unexplained entry is how this gate rots.\n'
    );
  }

  if (nowPassing.length > 0) {
    failed = true;
    console.error('❌ These files are allowlisted but now PASS. Remove their entries:\n');
    for (const f of nowPassing) { console.error(`   ${f}`); }
    console.error(
      '\n   This direction of the ratchet is deliberate. An allowlist that only\n' +
      '   grows stops describing reality, and a gate that no longer describes\n' +
      '   reality is trusted while proving nothing.\n'
    );
  }

  if (notRun.length > 0) {
    failed = true;
    console.error('❌ These files are allowlisted but did not run at all (renamed or deleted?):\n');
    for (const f of notRun) { console.error(`   ${f}`); }
    console.error('\n   Update .rls-allowlist.json so it keeps naming real files.\n');
  }

  if (failed) { process.exit(1); }

  console.log('✅ RLS gate passed: no unlisted failures, and every allowlist entry still earns its place.');
  if (allowed.size > 0) {
    console.log(`   ${allowed.size} known-failing file(s) remain. The list can only shrink.`);
  }
}

main();
