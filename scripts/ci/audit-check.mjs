#!/usr/bin/env node
/**
 * CI dependency-audit gate (SEC-046).
 *
 * Runs `npm audit --omit=dev --json` and fails the build on any high/critical
 * advisory that is NOT in .audit-allowlist.json. Allowlisted advisories are
 * printed as warnings so they stay visible; everything else blocks.
 *
 * This replaces a bare `npm audit --audit-level=high`, which cannot express
 * "accepted with justification" for an unreachable/no-fix advisory and would
 * therefore stay red forever on such an item.
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const allowlistPath = join(repoRoot, '.audit-allowlist.json');

const BLOCKING = new Set(['high', 'critical']);

function loadAllowlist() {
  if (!existsSync(allowlistPath)) return [];
  const parsed = JSON.parse(readFileSync(allowlistPath, 'utf8'));
  const now = Date.now();
  const entries = parsed.allow ?? [];
  for (const e of entries) {
    if (e.expires && Date.parse(e.expires) < now) {
      console.error(`::error::Audit allowlist entry ${e.ghsa} expired on ${e.expires}. Re-review or remove it.`);
      process.exit(1);
    }
  }
  return entries;
}

function runAudit() {
  try {
    // npm audit exits non-zero when vulnerabilities exist; capture stdout regardless.
    return execSync('npm audit --omit=dev --json', { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (err) {
    if (err.stdout) return err.stdout;
    throw err;
  }
}

function ghsaFrom(via) {
  if (typeof via !== 'object' || !via.url) return null;
  const m = via.url.match(/GHSA-[0-9a-z-]+/i);
  return m ? m[0] : null;
}

const allowlist = loadAllowlist();
const allowed = new Set(allowlist.map((e) => e.ghsa));
const report = JSON.parse(runAudit());

const blocking = new Map(); // ghsa -> {title, severity}
const waived = new Set();

for (const vuln of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vuln.via ?? []) {
    if (typeof via !== 'object' || !BLOCKING.has(via.severity)) continue;
    const ghsa = ghsaFrom(via);
    if (!ghsa) continue;
    if (allowed.has(ghsa)) { waived.add(ghsa); continue; }
    blocking.set(ghsa, { title: via.title, severity: via.severity });
  }
}

for (const ghsa of waived) {
  const e = allowlist.find((a) => a.ghsa === ghsa);
  console.log(`::warning::[allowlisted] ${ghsa} (${e?.severity}) — ${e?.reason} (expires ${e?.expires})`);
}

if (blocking.size > 0) {
  console.error(`\nDependency audit FAILED — ${blocking.size} un-allowlisted high/critical advisory(ies):`);
  for (const [ghsa, info] of blocking) {
    console.error(`  [${info.severity}] ${ghsa} — ${info.title}`);
  }
  console.error('\nFix the dependency, or add a justified, expiring entry to .audit-allowlist.json.');
  process.exit(1);
}

console.log(`\nDependency audit passed (${waived.size} allowlisted, 0 blocking).`);
