/**
 * RLS surface audit — the remaining unscoped-query checklist.
 *
 * WHY THIS EXISTS: the RLS rollout felt unbounded for a long time, because its
 * failure mode is discovery-by-execution — an unscoped read is invisible until
 * some test drives that exact path, so every measurement pass found more work
 * simply because it got further. This script replaces that with a static bound:
 * it enumerates every call site that reads or writes an RLS-covered table
 * WITHOUT a transaction argument, so "what is left" is a finite list rather than
 * a feeling.
 *
 *   npx tsx scripts/audit-rls-surface.ts
 *
 * READ THE CAVEATS BEFORE TRUSTING A NUMBER:
 *  - Detection is TEXTUAL. A call whose transaction argument is named something
 *    other than tx/scopedTx/callerTx/trx reads as unthreaded (false positive),
 *    and a call reached only dynamically is not seen at all (false negative).
 *  - Not every hit needs converting. Cross-tenant admin reads belong on RLS-6's
 *    `adminDb` path, and a helper that already threads `tx` everywhere (e.g.
 *    `AclService`) needs its CALLERS fixed, not itself.
 *  - So treat the output as a worklist to triage, not a defect count.
 *
 * Companion docs: tickets/RLS_COMPLETION_PLAN.md (the phased plan built on this
 * output) and tickets/RLS_HANDOFF.md (state, patterns and traps).
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

/** Repositories whose backing tables carry an RLS policy. */
const RLS_REPOS = [
  'workflow', 'section', 'step', 'project', 'user', 'collection', 'record',
  'organization', 'team', 'connection', 'reviewTask', 'signatureRequest',
  'auditLog', 'workflowBlueprint', 'tenantDomain', 'collabDoc',
  'externalDestination', 'logicRule', 'block', 'template', 'workflowVersion',
  'stepValue',
].join('|');

/** Drizzle table identifiers that are RLS-covered, for direct `db.*` calls. */
const COVERED_TABLES = [
  'aiUsage', 'auditLogs', 'collabDocs', 'collections', 'connections',
  'datavaultApiTokens', 'datavaultDatabases', 'datavaultNumberSequences',
  'datavaultRowNotes', 'datavaultTables', 'externalDestinations',
  'metricsEvents', 'metricsRollups', 'organizations', 'projects', 'records',
  'reviewTasks', 'runDocumentDeliveries', 'runResumeLinks', 'signatureRequests',
  'sliConfigs', 'sliWindows', 'teams', 'tenantDomains', 'users',
  'workflowBlueprints', 'workflows', 'sections', 'steps', 'datavaultRows',
  'datavaultValues', 'datavaultColumns',
];

const REPO_CALL = new RegExp(
  String.raw`\b(?:${RLS_REPOS}|datavault[A-Za-z]*)Repository\.([a-zA-Z]\w*)\(([^;]{0,400})`,
  'gs',
);
const DB_CALL = /\bdb\.(select|insert|update|delete)\(/g;
const COVERED_RE = new RegExp(String.raw`\b(${COVERED_TABLES.join('|')})\b`);
/** Any of the scoping helpers appearing anywhere in the file. */
const SCOPES = /withTx|withCurrentTenant|withTenant|applyTenantToTransaction|runWithTenantContext|withVerifiedIdentifier|withCurrentUserId|withLoginEmail/;
const TX_ARG = /\b(tx|scopedTx|callerTx|trx)\b/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      walk(p, out);
    } else if (p.endsWith('.ts')) {
      out.push(p);
    }
  }
  return out;
}

interface Row { unthreaded: number; total: number; scoped: boolean; file: string }

function main(): void {
  const repoRows: Row[] = [];
  const dbRows: Array<{ hits: number; file: string }> = [];

  for (const abs of walk('server')) {
    const file = relative('.', abs).split('\\').join('/');
    // adminDb is the deliberate BYPASSRLS path (RLS-6); server/db.ts is the pool itself.
    if (file.includes('/db/adminDb') || file.endsWith('server/db.ts')) { continue; }
    const src = readFileSync(abs, 'utf8');
    const fileScoped = SCOPES.test(src);

    let total = 0;
    let unthreaded = 0;
    for (const m of src.matchAll(REPO_CALL)) {
      total += 1;
      if (!TX_ARG.test(m[2] ?? '')) { unthreaded += 1; }
    }
    if (unthreaded > 0) { repoRows.push({ unthreaded, total, scoped: fileScoped, file }); }

    let hits = 0;
    for (const m of src.matchAll(DB_CALL)) {
      // Look at the call plus its `.from(...)` chain to see which table it hits.
      if (COVERED_RE.test(src.slice(m.index ?? 0, (m.index ?? 0) + 400))) { hits += 1; }
    }
    if (hits > 0) { dbRows.push({ hits, file }); }
  }

  repoRows.sort((a, b) => b.unthreaded - a.unthreaded);
  dbRows.sort((a, b) => b.hits - a.hits);

  const repoTotal = repoRows.reduce((n, r) => n + r.unthreaded, 0);
  const dbTotal = dbRows.reduce((n, r) => n + r.hits, 0);

  console.log('=== RLS surface audit ===\n');
  console.log(`Repository calls on RLS-covered tables with no tx argument: ${repoTotal} across ${repoRows.length} files`);
  console.log(`Direct db.* calls on RLS-covered tables:                    ${dbTotal} across ${dbRows.length} files`);
  console.log(`TOTAL call sites to triage:                                 ${repoTotal + dbTotal}\n`);

  console.log('--- repository calls: files with NO scoping helper at all (highest risk) ---');
  for (const r of repoRows.filter((r) => !r.scoped)) {
    console.log(`${String(r.unthreaded).padStart(4)}/${String(r.total).padEnd(4)}  ${r.file}`);
  }
  console.log('\n--- repository calls: files that scope somewhere but still have unthreaded sites ---');
  for (const r of repoRows.filter((r) => r.scoped)) {
    console.log(`${String(r.unthreaded).padStart(4)}/${String(r.total).padEnd(4)}  ${r.file}`);
  }
  console.log('\n--- direct db.* calls on covered tables ---');
  for (const r of dbRows) {
    console.log(`${String(r.hits).padStart(4)}       ${r.file}`);
  }
}

main();
