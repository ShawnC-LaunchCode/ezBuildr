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
 *   npx tsx scripts/audit-rls-surface.ts            # report + gate
 *   npx tsx scripts/audit-rls-surface.ts --report    # report only, always exit 0
 *
 * RLS-9: this is a CI GATE, not just a report. Findings are compared against
 * `.rls-surface-allowlist.json` and the exit code is non-zero on any drift.
 * The ratchet runs BOTH WAYS, and the second direction is the point:
 *
 *   1. A finding not on the list, or a listed file whose count went UP, fails
 *      the build — no new unscoped call site can land.
 *   2. A listed file whose count went DOWN, or that no longer appears at all,
 *      ALSO fails, with an instruction to update or delete the entry. Without
 *      this the list only ever grows, entries outlive the problems they
 *      describe, and the gate quietly becomes decoration that certifies
 *      nothing — a shape this repo has been bitten by more than once.
 *
 * The seeded entries are RLS-8's worklist, not absolution. Each is a known
 * unscoped site with a recorded reason; the ratchet is what stops site #33.
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
 * Companion docs: tickets/backlog/ENVIRONMENTS_AND_RLS.md (how the scope was bounded, from the retired plan built on this
 * output) and docs/architecture/RLS_HANDOFF.md (state, patterns and traps).
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';

/**
 * Repositories whose backing tables carry an RLS policy.
 *
 * Verified against the migrations 2026-08-21 rather than assumed — the earlier
 * list included `logicRule`, `block`, `template`, `workflowVersion` and
 * `stepValue`, whose tables (`logic_rules`, `blocks`, `templates`,
 * `workflow_versions`, `step_values`) have **no policy at all**. Those hits
 * were false positives, and converting them would have been pure churn.
 *
 * The authority is `CREATE POLICY ... ON <table>` plus the table arrays in
 * `migrations/0001`, `0011` and `0026`. **Add to this list whenever a table
 * gains a policy** (CLAUDE.md convention 7 requires new tenant tables to get
 * one), or this bound silently stops covering it.
 */
const RLS_REPOS = [
  'workflow', 'page', 'step', 'project', 'user', 'collection', 'record',
  'organization', 'team', 'connection', 'reviewTask', 'signatureRequest',
  'auditLog', 'workflowBlueprint', 'tenantDomain', 'collabDoc',
  'externalDestination',
].join('|');

/** Drizzle table identifiers that are RLS-covered, for direct `db.*` calls. */
const COVERED_TABLES = [
  'aiUsage', 'auditLogs', 'collabDocs', 'collections', 'connections',
  'datavaultApiTokens', 'datavaultDatabases', 'datavaultNumberSequences',
  'datavaultRowNotes', 'datavaultTables', 'externalDestinations',
  'metricsEvents', 'metricsRollups', 'organizations', 'projects', 'records',
  'reviewTasks', 'runDocumentDeliveries', 'runResumeLinks', 'signatureRequests',
  'sliConfigs', 'sliWindows', 'teams', 'tenantDomains', 'users',
  'workflowBlueprints', 'workflows', 'pages', 'steps', 'datavaultRows',
  'datavaultValues', 'datavaultColumns',
];

/**
 * The same tables in SQL form, for raw `db.execute(sql`…`)` — a whole category
 * the two scanners above are blind to, because it never names a Drizzle table
 * object or a repository. Added 2026-08-21 after the Phase 1 sweep found the
 * metrics-rollup job reading `metrics_rollups` this way: a background job with
 * no tenant, whose unscoped read under enforcement returns nothing and rolls
 * up silence.
 */
const COVERED_TABLES_SQL = [
  'ai_usage', 'audit_logs', 'collab_docs', 'collections', 'connections',
  'datavault_api_tokens', 'datavault_columns', 'datavault_database_access',
  'datavault_databases', 'datavault_number_sequences', 'datavault_row_notes',
  'datavault_rows', 'datavault_table_access', 'datavault_table_permissions',
  'datavault_tables', 'datavault_unique_keys', 'datavault_values',
  'external_destinations', 'metrics_events', 'metrics_rollups', 'organizations',
  'projects', 'records', 'review_tasks', 'run_document_deliveries',
  'run_resume_links', 'pages', 'signature_requests', 'sli_configs',
  'sli_windows', 'steps', 'teams', 'tenant_domains', 'users',
  'workflow_blueprints', 'workflows',
];
const EXECUTE_CALL = /\bdb\.execute\(/g;
const COVERED_SQL_RE = new RegExp(String.raw`\b(${COVERED_TABLES_SQL.join('|')})\b`);

/**
 * A bare `db.transaction(...)` in application code — the fourth way to reach a
 * covered table unscoped, and the one that produced the worst defects of the
 * 2026-08-21 sweep. It is invisible to every other scanner here, because the
 * writes inside it are issued on the transaction handle (`tx.insert(...)`),
 * never on `db`.
 *
 * Three real examples, all silent: `WriteRunner` reported a successful write
 * while inserting nothing, `WorkflowContentIngestService` had every
 * page/step insert rejected, and `LogicRuleService` read `steps` through one
 * (so alias resolution would have run against an empty set).
 *
 * The correct spelling is always `withCurrentTenant` / `withTenant`, so this
 * flags the CONSTRUCT rather than trying to infer which tables it touches.
 */
const BARE_TRANSACTION = /\bdb\.transaction\(/g;

/**
 * Drizzle's RELATIONAL query API — `db.query.<table>.findFirst/findMany`.
 *
 * A fifth blind spot, and the most expensive one found so far: it names no
 * Drizzle table object, no repository, no raw SQL and no transaction, so all
 * four scanners above are blind to it. 12 such reads on covered tables existed
 * in `server/` on 2026-08-21, and two were user-facing defects that fail
 * SILENTLY:
 *
 *  - `AuthService.generatePasswordResetToken` looks a user up BY EMAIL. Under
 *    enforcement it finds nobody who has a tenant — and the route's
 *    anti-enumeration reply is identical either way, so password reset simply
 *    stops working with no error anywhere.
 *  - `MfaService.isMfaEnabled` reads the caller's own row, so MFA would report
 *    as DISABLED for everyone and a login needing a second factor would skip
 *    it. That one fails OPEN.
 *
 * Matched by table name, so it only reports covered tables.
 */
const RELATIONAL_READ = new RegExp(
  String.raw`\bdb\.query\.(${COVERED_TABLES.join('|')})\b`,
  'g',
);

/**
 * A relational read whose `with: { … }` JOINS a covered table, even though the
 * table named at the call site is not covered.
 *
 * The sixth blind spot, and the subtlest: `db.query.templates.findFirst({ with:
 * { project: true } })` names `templates`, which has no policy — so every
 * scanner above, including the relational one, correctly ignores it. But the
 * join pulls `projects`, which IS covered. Unscoped, `project` comes back NULL
 * and the next line (`template.project.tenantId !== tenantId`) throws a
 * TypeError: the route returns **500**, so an authorization check becomes a
 * crash. 14 sites in `templates.routes.ts` alone, and it accounted for a whole
 * cluster of failing suites.
 *
 * Detection is a heuristic — a `db.query.…` block containing both `with:` and a
 * relation key naming something covered. Relation keys are singular or plural
 * depending on cardinality, so both spellings are listed.
 */
const COVERED_RELATION_KEYS = [
  'project', 'projects', 'workflow', 'workflows', 'user', 'users',
  'organization', 'organizations', 'page', 'pages', 'step', 'steps',
  'team', 'teams', 'record', 'records', 'collection', 'collections',
  'tenantDomain', 'tenantDomains', 'datavaultTable', 'datavaultDatabase',
];
// Deliberately NOT a balanced-brace regex: the nested-quantifier version of
// this tripped `security/detect-unsafe-regex` (catastrophic backtracking on a
// long file is a real risk in a script anyone can point at a big tree). Match
// the call opening only, then inspect a bounded window after it.
const RELATIONAL_BLOCK = /db\.query\.[A-Za-z]+\.find\w+\(\{/g;
const RELATIONAL_WINDOW = 400;
const COVERED_RELATION_RE = new RegExp(
  String.raw`\b(${COVERED_RELATION_KEYS.join('|')})\s*:\s*true`,
);

const REPO_CALL = new RegExp(
  String.raw`\b(?:${RLS_REPOS}|datavault[A-Za-z]*)Repository\.([a-zA-Z]\w*)\(([^;]{0,400})`,
  'gs',
);
/**
 * A direct query-builder call on the bare pool.
 *
 * The `\s*` around the dot is load-bearing — a SEVENTH blind spot, and the one
 * that hid an entire broken feature. This was `\bdb\.(select|…)\(` until
 * 2026-08-22, which cannot see the extremely common
 *
 *     const results = await db
 *       .select()
 *       .from(connections)
 *
 * because `db` and `.select(` are on different lines. Every one of the ~12
 * reads and writes in `server/services/connections.ts` is written that way, so
 * the file scored ZERO hits while API integrations were broken end to end
 * under enforcement: connection setup 404'd, and three id-only UPDATEs matched
 * no rows silently. Found by attributing a runtime failure, not by this script
 * — the same way `DataSourceService` was.
 *
 * (No ReDoS risk: `\s*` is anchored on both sides by literals, no nesting.)
 */
const DB_CALL = /\bdb\s*\.\s*(select|insert|update|delete)\(/g;
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
  const reportOnly = process.argv.includes('--report');
  const repoRows: Row[] = [];
  const dbRows: Array<{ hits: number; file: string }> = [];
  const rawRows: Array<{ hits: number; file: string }> = [];
  const txRows: Array<{ hits: number; file: string }> = [];
  const relRows: Array<{ hits: number; file: string }> = [];
  const joinRows: Array<{ hits: number; file: string }> = [];

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

    // Bare transactions. `rlsContext` IS the scoping mechanism and
    // `BaseRepository` is the generic data layer a caller's tx flows through;
    // adminDb is excluded above. Comment lines are skipped because several
    // files legitimately DISCUSS the construct.
    let txHits = 0;
    if (!file.endsWith('utils/rlsContext.ts') && !file.endsWith('repositories/BaseRepository.ts')) {
      for (const m of src.matchAll(BARE_TRANSACTION)) {
        const lineStart = src.lastIndexOf('\n', m.index ?? 0) + 1;
        if (/^\s*(\*|\/\/)/.test(src.slice(lineStart, m.index ?? 0))) { continue; }
        txHits += 1;
      }
    }
    if (txHits > 0) { txRows.push({ hits: txHits, file }); }

    let relHits = 0;
    for (const _m of src.matchAll(RELATIONAL_READ)) { relHits += 1; }
    if (relHits > 0) { relRows.push({ hits: relHits, file }); }

    let joinHits = 0;
    for (const m of src.matchAll(RELATIONAL_BLOCK)) {
      const block = src.slice(m.index ?? 0, (m.index ?? 0) + RELATIONAL_WINDOW);
      if (!block.includes('with:') || !COVERED_RELATION_RE.test(block)) { continue; }
      // Skip matches inside comments — this file's own doc comment describing
      // the hazard was the last remaining "hit" after the real ones were fixed,
      // which is a nice demonstration that a scanner reports text, not code.
      const lineStart = src.lastIndexOf('\n', m.index ?? 0) + 1;
      if (/^\s*(\*|\/\/)/.test(src.slice(lineStart, m.index ?? 0))) { continue; }
      joinHits += 1;
    }
    if (joinHits > 0) { joinRows.push({ hits: joinHits, file }); }

    // Raw SQL. The window looks BACKWARDS as well as forwards, because the
    // query is usually built into a `const query = sql`…`` above and only
    // passed at the call site.
    let rawHits = 0;
    for (const m of src.matchAll(EXECUTE_CALL)) {
      const start = m.index ?? 0;
      if (COVERED_SQL_RE.test(src.slice(Math.max(0, start - 900), start + 900))) { rawHits += 1; }
    }
    if (rawHits > 0) { rawRows.push({ hits: rawHits, file }); }
  }

  repoRows.sort((a, b) => b.unthreaded - a.unthreaded);
  dbRows.sort((a, b) => b.hits - a.hits);
  rawRows.sort((a, b) => b.hits - a.hits);
  txRows.sort((a, b) => b.hits - a.hits);
  relRows.sort((a, b) => b.hits - a.hits);
  joinRows.sort((a, b) => b.hits - a.hits);

  const repoTotal = repoRows.reduce((n, r) => n + r.unthreaded, 0);
  const dbTotal = dbRows.reduce((n, r) => n + r.hits, 0);
  const rawTotal = rawRows.reduce((n, r) => n + r.hits, 0);
  const txTotal = txRows.reduce((n, r) => n + r.hits, 0);
  const relTotal = relRows.reduce((n, r) => n + r.hits, 0);
  const joinTotal = joinRows.reduce((n, r) => n + r.hits, 0);

  console.log('=== RLS surface audit ===\n');
  console.log(`Repository calls on RLS-covered tables with no tx argument: ${repoTotal} across ${repoRows.length} files`);
  console.log(`Direct db.* calls on RLS-covered tables:                    ${dbTotal} across ${dbRows.length} files`);
  console.log(`Raw db.execute() SQL naming a covered table:                ${rawTotal} across ${rawRows.length} files`);
  console.log(`Bare db.transaction() in application code:                  ${txTotal} across ${txRows.length} files`);
  console.log(`Relational db.query.<table> reads on covered tables:      ${relTotal} across ${relRows.length} files`);
  console.log(`Relational reads JOINING a covered table (with: {…}):     ${joinTotal} across ${joinRows.length} files`);
  console.log(`TOTAL call sites to triage:                                 ${repoTotal + dbTotal + rawTotal + txTotal + relTotal + joinTotal}\n`);

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
  console.log('\n--- relational reads JOINING a covered table via with: {…} ---');
  for (const r of joinRows) {
    console.log(`${String(r.hits).padStart(4)}       ${r.file}`);
  }
  console.log('\n--- relational db.query.<table> reads on covered tables ---');
  for (const r of relRows) {
    console.log(`${String(r.hits).padStart(4)}       ${r.file}`);
  }
  console.log('\n--- bare db.transaction() (should be withCurrentTenant/withTenant) ---');
  for (const r of txRows) {
    console.log(`${String(r.hits).padStart(4)}       ${r.file}`);
  }
  console.log('\n--- raw db.execute() SQL naming a covered table (widest net, most false positives) ---');
  for (const r of rawRows) {
    console.log(`${String(r.hits).padStart(4)}       ${r.file}`);
  }

  // Structured view of the same numbers, for the ratchet. These category names
  // are STABLE IDENTIFIERS, not the human headings above — renaming a heading
  // must not silently invalidate every allowlist entry.
  const findings: Finding[] = [
    ...repoRows.map((r) => ({ category: 'repo-call', file: r.file, count: r.unthreaded })),
    ...dbRows.map((r) => ({ category: 'db-call', file: r.file, count: r.hits })),
    ...joinRows.map((r) => ({ category: 'relational-join', file: r.file, count: r.hits })),
    ...relRows.map((r) => ({ category: 'relational-read', file: r.file, count: r.hits })),
    ...txRows.map((r) => ({ category: 'bare-transaction', file: r.file, count: r.hits })),
    ...rawRows.map((r) => ({ category: 'raw-execute', file: r.file, count: r.hits })),
  ].sort((a, b) => a.category.localeCompare(b.category) || a.file.localeCompare(b.file));

  if (reportOnly) {
    console.log('(--report: gate skipped)');
    return;
  }
  runGate(findings);
}

// ---------------------------------------------------------------------------
// RLS-9 — the ratchet
// ---------------------------------------------------------------------------

const ALLOWLIST_PATH = resolve(process.cwd(), '.rls-surface-allowlist.json');

/** One finding: a stable category, a file, and how many hits that file has. */
interface Finding { category: string; file: string; count: number }

interface AllowEntry { category: string; file: string; count: number; reason: string }

function loadAllowlist(): AllowEntry[] {
  if (!existsSync(ALLOWLIST_PATH)) {
    console.error(`\n❌ No allowlist at ${ALLOWLIST_PATH}.`);
    console.error('   A missing allowlist is a FAILURE, never a pass — that failure mode is how');
    console.error('   a gate goes months without actually gating anything.');
    process.exit(1);
  }
  const parsed = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8')) as { allow?: AllowEntry[] };
  const allow = parsed.allow ?? [];
  for (const e of allow) {
    if (!e.reason || e.reason.trim().length < 10) {
      console.error(`\n❌ Allowlist entry ${e.category}:${e.file} has no usable reason.`);
      console.error('   An unexplained entry is how this gate rots. Diagnose it or remove it.');
      process.exit(1);
    }
  }
  return allow;
}

function findingKey(f: { category: string; file: string }): string {
  return `${f.category}\u0000${f.file}`;
}

function runGate(findings: Finding[]): void {
  const allow = loadAllowlist();
  const allowByKey = new Map(allow.map((e) => [findingKey(e), e]));
  const foundByKey = new Map(findings.map((f) => [findingKey(f), f]));

  const unlisted: Finding[] = [];
  const increased: Array<{ f: Finding; was: number }> = [];
  const decreased: Array<{ e: AllowEntry; now: number }> = [];
  const stale: AllowEntry[] = [];

  for (const f of findings) {
    const e = allowByKey.get(findingKey(f));
    if (!e) {
      unlisted.push(f);
    } else if (f.count > e.count) {
      increased.push({ f, was: e.count });
    }
  }
  for (const e of allow) {
    const f = foundByKey.get(findingKey(e));
    if (!f) {
      stale.push(e);
    } else if (f.count < e.count) {
      decreased.push({ e, now: f.count });
    }
  }

  const total = findings.reduce((n, f) => n + f.count, 0);
  console.log('\n=== RLS surface gate ===');
  console.log(`${total} call site(s) across ${findings.length} file/category pair(s); ${allow.length} allowlisted.`);

  let failed = false;

  if (unlisted.length > 0) {
    failed = true;
    console.error('\n❌ NEW unscoped call sites — these are not on the allowlist:\n');
    for (const f of unlisted) {
      console.error(`   ${String(f.count).padStart(3)}  ${f.category.padEnd(17)} ${f.file}`);
    }
    console.error('\n   Scope the query (withCurrentTenant / thread `tx`), route it through the');
    console.error('   adminDb path if it is a deliberate cross-tenant admin read, or add it to');
    console.error('   .rls-surface-allowlist.json WITH a diagnosed reason. Do not add an entry');
    console.error('   merely to make the build green.');
  }

  if (increased.length > 0) {
    failed = true;
    console.error('\n❌ Allowlisted files that got WORSE:\n');
    for (const { f, was } of increased) {
      console.error(`   ${f.category.padEnd(17)} ${f.file}: ${was} -> ${f.count}`);
    }
    console.error('\n   An allowlist entry freezes a KNOWN count. It is not a licence to add more.');
  }

  if (decreased.length > 0) {
    failed = true;
    console.error('\n❌ Allowlisted files that IMPROVED — tighten the ratchet:\n');
    for (const { e, now } of decreased) {
      console.error(`   ${e.category.padEnd(17)} ${e.file}: ${e.count} -> ${now}   (set count to ${now})`);
    }
    console.error('\n   This is the good direction. Lower the count so the progress cannot');
    console.error('   silently revert later.');
  }

  if (stale.length > 0) {
    failed = true;
    console.error('\n❌ Allowlist entries that no longer reproduce — DELETE them:\n');
    for (const e of stale) {
      console.error(`   ${e.category.padEnd(17)} ${e.file}   (was ${e.count})`);
    }
    console.error('\n   A list that only ever grows certifies nothing.');
  }

  if (failed) {
    process.exit(1);
  }
  console.log('\n✅ RLS surface gate passed: no new unscoped sites, and every allowlist entry still earns its place.');
}

main();
