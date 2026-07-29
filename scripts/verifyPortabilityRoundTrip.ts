/**
 * Portability round-trip harness (IEX-11 AC 8 / Phase 2 Gate).
 *
 * Seeds a workflow with real contents on the running dev server, exports it,
 * imports it back through preview -> apply, then reads the result back through
 * the same endpoints the builder uses. Prints login credentials and the builder
 * URL for the imported workflow so the result can be confirmed visually.
 *
 * Usage — dev server must already be running on :5000 (`npm run dev`):
 *
 *   npx tsx scripts/verifyPortabilityRoundTrip.ts
 *
 * Everything except the tenant bootstrap goes over real HTTP with a real JWT.
 * The bootstrap has to touch the DB directly because POST /api/auth/register
 * does not assign a tenant, and every subsequent call 400s without one.
 */
import { eq } from 'drizzle-orm';

import * as schema from '@shared/schema';

import { db } from '../server/db';

const BASE = process.env.PORTABILITY_VERIFY_BASE ?? 'http://localhost:5000';
const stamp = Date.now();
const PASSWORD = 'TestPassword123!@#Strong';
const EMAIL = `portability-verify-${stamp}@example.com`;

const log = (...args: unknown[]): void => { console.log(...args); };

async function ok(res: Response, what: string): Promise<Response> {
  if (!res.ok) {
    let body = '';
    try { body = await res.clone().text(); } catch { /* body already consumed */ }
    throw new Error(`${what} -> HTTP ${res.status} :: ${body.slice(0, 400)}`);
  }
  return res;
}

async function main(): Promise<void> {
  const health = await fetch(`${BASE}/health`).catch(() => null);
  if (health?.ok !== true) {
    throw new Error(`No dev server responding at ${BASE}. Start it with "npm run dev" first.`);
  }

  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, firstName: 'Portability', lastName: 'Verify' })
  });
  await ok(reg, 'register');
  const { token, user } = await reg.json() as { token: string; user: { id: string } };
  const H = { Authorization: `Bearer ${token}` };
  const JH = { ...H, 'Content-Type': 'application/json' };

  // Registration leaves the user tenant-less; everything downstream needs one.
  const [tenant] = await db.insert(schema.tenants)
    .values({ name: `Portability Verify ${stamp}`, plan: 'free' }).returning();
  await db.update(schema.users)
    .set({ tenantId: tenant.id, tenantRole: 'owner' })
    .where(eq(schema.users.id, user.id));
  log(`1. user ${user.id} in tenant ${tenant.id}`);

  const projRes = await fetch(`${BASE}/api/projects`, {
    method: 'POST', headers: JH, body: JSON.stringify({ name: `Portability Verify ${stamp}` })
  });
  await ok(projRes, 'create project');
  const project = await projRes.json() as { id: string };

  const wfRes = await fetch(`${BASE}/api/workflows`, {
    method: 'POST', headers: JH,
    body: JSON.stringify({ title: `Round Trip ${stamp}`, projectId: project.id })
  });
  await ok(wfRes, 'create workflow');
  const workflow = await wfRes.json() as { id: string };

  const secRes = await fetch(`${BASE}/api/workflows/${workflow.id}/sections`, {
    method: 'POST', headers: JH, body: JSON.stringify({ title: 'Applicant Details', order: 0 })
  });
  await ok(secRes, 'create section');
  const section = await secRes.json() as { id: string; title: string };

  const stepTitles = ['Full name', 'Email address'];
  for (const [i, title] of stepTitles.entries()) {
    const stepRes = await fetch(`${BASE}/api/workflows/${workflow.id}/sections/${section.id}/steps`, {
      method: 'POST', headers: JH, body: JSON.stringify({ type: 'text', title, order: i })
    });
    await ok(stepRes, `create step "${title}"`);
  }
  log(`2. source workflow ${workflow.id} with section "${section.title}" and ${stepTitles.length} steps`);

  const exp = await fetch(`${BASE}/api/portability/export/workflow/${workflow.id}`, { headers: H });
  await ok(exp, 'export');
  const bundle = Buffer.from(await exp.arrayBuffer());
  log(`3. exported ${bundle.length} bytes (${exp.headers.get('content-type')})`);

  const fdPrev = new FormData();
  fdPrev.append('file', new Blob([bundle]), 'verify.ezb');
  const prev = await fetch(`${BASE}/api/portability/import/preview`, { method: 'POST', headers: H, body: fdPrev });
  await ok(prev, 'preview');
  const preview = await prev.json() as { canProceed: boolean; entityCounts: Record<string, number> };
  log(`4. preview HTTP ${prev.status} canProceed=${preview.canProceed} counts=${JSON.stringify(preview.entityCounts)}`);

  const fdApply = new FormData();
  fdApply.append('file', new Blob([bundle]), 'verify.ezb');
  const applyRes = await fetch(`${BASE}/api/portability/import/apply`, { method: 'POST', headers: H, body: fdApply });
  await ok(applyRes, 'apply');
  const applied = await applyRes.json() as { rootId: string; blobsRestored: number };
  log(`5. apply HTTP ${applyRes.status} rootId=${applied.rootId} blobsRestored=${applied.blobsRestored}`);

  if (applied.rootId === workflow.id) {
    throw new Error('FAIL: imported workflow reused the source id');
  }

  // Read both workflows back through the endpoints the builder itself calls.
  const readSections = async (id: string): Promise<Array<{ id: string; title: string }>> => {
    const r = await fetch(`${BASE}/api/workflows/${id}/sections`, { headers: H });
    await ok(r, 'read sections');
    return await r.json() as Array<{ id: string; title: string }>;
  };

  const sourceSections = await readSections(workflow.id);
  const importedSections = await readSections(applied.rootId);

  let importedStepCount = 0;
  for (const s of importedSections) {
    const r = await fetch(`${BASE}/api/sections/${s.id}/steps`, { headers: H });
    await ok(r, 'read steps');
    const steps = await r.json() as Array<{ id: string; title: string; sectionId: string }>;
    importedStepCount += steps.length;
    const titles = steps.map(x => `"${x.title}"`).join(', ');
    log(`   "${s.title}" -> ${steps.length} step(s): ${titles}`);
    for (const st of steps) {
      if (st.sectionId !== s.id) {throw new Error('FAIL: imported step points at the wrong section');}
    }
  }

  const sourceTitles = sourceSections.map(s => s.title).sort().join('|');
  const importedTitles = importedSections.map(s => s.title).sort().join('|');
  if (sourceTitles !== importedTitles) {
    throw new Error(`FAIL: section titles differ. source=[${sourceTitles}] imported=[${importedTitles}]`);
  }
  if (importedStepCount !== stepTitles.length) {
    throw new Error(`FAIL: expected ${stepTitles.length} steps, got ${importedStepCount}`);
  }
  const sourceIds = new Set(sourceSections.map(s => s.id));
  for (const s of importedSections) {
    if (sourceIds.has(s.id)) {throw new Error('FAIL: imported section reused a source id');}
  }

  const auditRows = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.userId, user.id));
  const imports = auditRows.filter(r => r.action === 'data_imported').length;
  const exports = auditRows.filter(r => r.action === 'data_exported').length;
  log(`6. audit: ${exports} data_exported, ${imports} data_imported`);
  if (imports !== 1) {throw new Error(`FAIL: expected exactly 1 import audit row, got ${imports}`);}

  log('');
  log('RESULT: PASS');
  log('─────────────────────────────────────────────────────────────');
  log(`  Log in with:      ${EMAIL}`);
  log(`  Password:         ${PASSWORD}`);
  log(`  SOURCE builder:   ${BASE}/builder/${workflow.id}`);
  log(`  IMPORTED builder: ${BASE}/builder/${applied.rootId}`);
  log('─────────────────────────────────────────────────────────────');
  log('  Screenshot the IMPORTED builder URL: it must show the same');
  log('  sections and steps as the source, with different ids.');
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
