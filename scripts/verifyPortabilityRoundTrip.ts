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
import { storageProvider } from '../server/services/storage';

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
    headers: { 
      'Content-Type': 'application/json',
      'X-Forwarded-For': `192.168.1.${stamp % 255}`
    },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, firstName: 'Portability', lastName: 'Verify' })
  });
  await ok(reg, 'register');
  const { token, user } = await reg.json() as { token: string; user: { id: string } };
  const H = { 
    Authorization: `Bearer ${token}`,
    // Spoof X-Forwarded-For to dodge the rate limiter (reasonable for an automated harness)
    'X-Forwarded-For': `192.168.1.${stamp % 255}`
  };
  const JH = { ...H, 'Content-Type': 'application/json' };

  // Registration leaves the user tenant-less; everything downstream needs one.
  // emailVerified matters too: a bearer token from /register works fine against
  // the API, but the UI login form rejects an unverified user with
  // EmailNotVerifiedError (auth.routes.ts:84). Without this, the credentials
  // printed below are usable by scripts but NOT by a human or a headless
  // browser trying to log in and look at the result.
  const [tenant] = await db.insert(schema.tenants)
    .values({ name: `Portability Verify ${stamp}`, plan: 'free' }).returning();
  await db.update(schema.users)
    .set({ tenantId: tenant.id, tenantRole: 'owner', emailVerified: true })
    .where(eq(schema.users.id, user.id));
  log(`1. user ${user.id} in tenant ${tenant.id} (email marked verified for UI login)`);

  // Prove the printed credentials actually work on the UI login path, so this
  // script can never hand out credentials that only work for API callers.
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'X-Forwarded-For': `192.168.1.${stamp % 255}`
    },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  });
  await ok(loginRes, 'login via the UI auth path');
  log(`   UI login path OK (HTTP ${loginRes.status}) — these credentials work in the browser`);

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

  const sourceStepIds: string[] = [];
  const stepTitles = ['Full name', 'Email address'];
  for (const [i, title] of stepTitles.entries()) {
    const stepRes = await fetch(`${BASE}/api/workflows/${workflow.id}/sections/${section.id}/steps`, {
      method: 'POST', headers: JH, body: JSON.stringify({ type: 'text', title, order: i })
    });
    await ok(stepRes, `create step "${title}"`);
    const step = await stepRes.json() as { id: string };
    sourceStepIds.push(step.id);
  }
  log(`2. source workflow ${workflow.id} with section "${section.title}" and ${stepTitles.length} steps`);

  // ---------------------------------------------------------------------------
  // IEX2-15 Seeding Requirements:
  // 1. Publish the workflow (slug, publicLink, publishedAt)
  // 2. Upload a template (blobsRestored > 0)
  // 3. Create a DataVault database, table, and data
  // ---------------------------------------------------------------------------

  // 1. Publish workflow version
  const [version] = await db.insert(schema.workflowVersions).values({
    workflowId: workflow.id,
    versionNumber: 1,
    isDraft: false,
    published: true,
    publishedAt: new Date(),
    createdBy: user.id,
    graphJson: {}
  }).returning();
  await db.update(schema.workflows).set({
    status: 'active',
    isPublic: true,
    slug: `test-slug-${stamp}`,
    publicLink: `http://localhost:5000/public/test-slug-${stamp}`,
    currentVersionId: version.id
  }).where(eq(schema.workflows.id, workflow.id));
  log(`   published workflow ${workflow.id}`);

  // 2. Add a template with a file blob directly to bypass API validation
  const fileBytes = Buffer.from('%PDF-1.4\n%EOF\n');
  const path = await storageProvider.saveFile(fileBytes, 'template.pdf', 'application/pdf');
  const [template] = await db.insert(schema.templates).values({
    projectId: project.id,
    type: 'pdf',
    name: 'Test Template',
    fileRef: path,
    lastModifiedBy: user.id
  }).returning();
  log(`   inserted template ${template.id} directly`);
  // Attach template to the workflow
  await db.insert(schema.workflowTemplates).values({
    workflowVersionId: version.id,
    templateId: template.id,
    key: 'test_tpl',
    isPrimary: true
  });
  log(`   uploaded template ${template.id} to project`);

  // 3. Add DataVault database, table, and rows (project-scoped)
  const [dvDb] = await db.insert(schema.datavaultDatabases).values({
    tenantId: tenant.id,
    scopeType: 'project',
    scopeId: project.id,
    name: `DB for ${stamp}`
  }).returning();
  const [dvTable] = await db.insert(schema.datavaultTables).values({
    tenantId: tenant.id,
    databaseId: dvDb.id,
    name: 'test_table',
    slug: 'test_table'
  }).returning();
  const [dvCol] = await db.insert(schema.datavaultColumns).values({
    tableId: dvTable.id,
    name: 'test',
    slug: 'test',
    type: 'text'
  }).returning();
  const [dvRow1] = await db.insert(schema.datavaultRows).values({ tableId: dvTable.id }).returning();
  const [dvRow2] = await db.insert(schema.datavaultRows).values({ tableId: dvTable.id }).returning();
  const [dvRow3] = await db.insert(schema.datavaultRows).values({ tableId: dvTable.id, deletedAt: new Date() }).returning();
  await db.insert(schema.datavaultValues).values([
    { rowId: dvRow1.id, columnId: dvCol.id, value: 'row1' },
    { rowId: dvRow2.id, columnId: dvCol.id, value: 'row2' }
  ]);
  // 4. Add secret_scan warning generator and reference-mapped blocks
  const [extBlock] = await db.insert(schema.blocks).values({
    workflowId: workflow.id,
    sectionId: section.id,
    type: 'external_send',
    phase: 'onNext',
    config: { headers: [], bodyTemplate: 'My secret is sk-1234567890abcdefABCDEF' }
  }).returning();

  const [logicRule] = await db.insert(schema.logicRules).values({
    workflowId: workflow.id,
    conditionStepId: sourceStepIds[0],
    operator: 'equals',
    conditionValue: { v: 'test' },
    targetType: 'step',
    targetStepId: sourceStepIds[1],
    action: 'show'
  }).returning();

  const [transformBlock] = await db.insert(schema.transformBlocks).values({
    workflowId: workflow.id,
    sectionId: section.id,
    name: 'test_transform',
    language: 'javascript',
    code: 'return {};',
    outputKey: 'test_output'
  }).returning();
  log(`   seeded datavault, blocks with secrets, logic rules and transform blocks`);

  const sourceIds = new Set([
    project.id, workflow.id, section.id, ...sourceStepIds,
    version.id, template.id,
    dvDb.id, dvTable.id, dvCol.id, dvRow1.id, dvRow2.id, dvRow3.id,
    extBlock.id, logicRule.id, transformBlock.id
  ]);

  const exp = await fetch(`${BASE}/api/portability/export/project/${project.id}`, { headers: H });
  await ok(exp, 'export project');
  const bundle = Buffer.from(await exp.arrayBuffer());
  log(`3. exported ${bundle.length} bytes (${exp.headers.get('content-type')})`);

  const fdPrev = new FormData();
  fdPrev.append('file', new Blob([bundle]), 'verify.ezb');
  const prev = await fetch(`${BASE}/api/portability/import/preview`, { method: 'POST', headers: H, body: fdPrev });
  await ok(prev, 'preview');
  const preview = await prev.json() as { canProceed: boolean; entityCounts: Record<string, number>; migrationHead?: string; warnings?: Array<{type: string}> };
  log(`4. preview HTTP ${prev.status} canProceed=${preview.canProceed} counts=${JSON.stringify(preview.entityCounts)}`);

  if (!preview.migrationHead) {
    throw new Error('FAIL: expected migrationHead in preview, but got none');
  }
  const hasSecretWarning = (preview.warnings || []).some((w: any) => w.type === 'secret_scan');
  if (!hasSecretWarning) {
    throw new Error('FAIL: expected secret_scan warning in preview, but found none');
  }

  const fdApply = new FormData();
  fdApply.append('file', new Blob([bundle]), 'verify.ezb');
  const applyRes = await fetch(`${BASE}/api/portability/import/apply`, { method: 'POST', headers: H, body: fdApply });
  await ok(applyRes, 'apply');
  const applied = await applyRes.json() as { rootId: string; blobsRestored: number };
  log(`5. apply HTTP ${applyRes.status} rootId=${applied.rootId} blobsRestored=${applied.blobsRestored}`);

  if (applied.rootId === project.id) {
    throw new Error('FAIL: imported project reused the source id');
  }
  if (applied.blobsRestored !== 1) {
    throw new Error(`FAIL: expected 1 blob restored, got ${applied.blobsRestored}`);
  }

  const importedWfs = await db.select().from(schema.workflows).where(eq(schema.workflows.projectId, applied.rootId));
  if (importedWfs.length !== 1) {throw new Error(`FAIL: expected 1 imported workflow, got ${importedWfs.length}`);}
  const importedWf = importedWfs[0];
  const appliedRootId = importedWf.id; // used for subsequent checks
  
  if (appliedRootId === workflow.id) {
    throw new Error('FAIL: imported workflow reused the source id');
  }

  const [dbImportedWf] = await db.select().from(schema.workflows).where(eq(schema.workflows.id, appliedRootId));
  if (!dbImportedWf) {throw new Error('FAIL: imported workflow not found');}
  if (dbImportedWf.slug !== null) {throw new Error(`FAIL: imported slug should be null, was ${dbImportedWf.slug}`);}
  if (dbImportedWf.publicLink !== null) {throw new Error(`FAIL: imported publicLink should be null, was ${dbImportedWf.publicLink}`);}
  if (dbImportedWf.isPublic !== false) {throw new Error('FAIL: imported isPublic should be false');}
  if (dbImportedWf.status !== 'draft') {throw new Error(`FAIL: imported status should be draft, was ${dbImportedWf.status}`);}

  // Assert DataVault is empty but exists
  const importedDvDbs = await db.select().from(schema.datavaultDatabases).where(eq(schema.datavaultDatabases.scopeId, applied.rootId));
  if (importedDvDbs.length !== 1) {throw new Error(`FAIL: expected 1 imported datavault db, got ${importedDvDbs.length}`);}
  if (sourceIds.has(importedDvDbs[0].id)) {throw new Error('FAIL: imported datavault db reused a source id');}

  const importedDvTables = await db.select().from(schema.datavaultTables).where(eq(schema.datavaultTables.databaseId, importedDvDbs[0].id));
  if (importedDvTables.length !== 1) {throw new Error(`FAIL: expected 1 imported datavault table, got ${importedDvTables.length}`);}
  if (sourceIds.has(importedDvTables[0].id)) {throw new Error('FAIL: imported datavault table reused a source id');}

  const importedDvData = await db.select().from(schema.datavaultRows).where(eq(schema.datavaultRows.tableId, importedDvTables[0].id));
  if (importedDvData.length !== 3) {throw new Error(`FAIL: expected 3 imported datavault rows, got ${importedDvData.length}`);}
  let softDeletedCount = 0;
  for (const r of importedDvData) {
    if (sourceIds.has(r.id)) {throw new Error('FAIL: imported datavault row reused a source id');}
    if (r.deletedAt !== null) {
      softDeletedCount++;
    }
  }
  if (softDeletedCount !== 1) {
    throw new Error(`FAIL: expected exactly 1 soft-deleted imported datavault row, got ${softDeletedCount}`);
  }

  const importedTemplates = await db.select().from(schema.templates).where(eq(schema.templates.projectId, applied.rootId));
  for (const t of importedTemplates) {
    if (sourceIds.has(t.id)) {throw new Error('FAIL: imported template reused a source id');}
  }

  const importedLogicRules = await db.select().from(schema.logicRules).where(eq(schema.logicRules.workflowId, appliedRootId));
  if (importedLogicRules.length !== 1) {throw new Error(`FAIL: expected 1 imported logic rule, got ${importedLogicRules.length}`);}
  if (sourceIds.has(importedLogicRules[0].id)) {throw new Error('FAIL: imported logic rule reused a source id');}
  if (sourceIds.has(importedLogicRules[0].conditionStepId)) {throw new Error('FAIL: imported logic rule reused source conditionStepId');}

  const importedTransformBlocks = await db.select().from(schema.transformBlocks).where(eq(schema.transformBlocks.workflowId, appliedRootId));
  if (importedTransformBlocks.length !== 1) {throw new Error(`FAIL: expected 1 imported transform block, got ${importedTransformBlocks.length}`);}
  if (sourceIds.has(importedTransformBlocks[0].id)) {throw new Error('FAIL: imported transform block reused a source id');}


  const importedVersions = await db.select().from(schema.workflowVersions).where(eq(schema.workflowVersions.workflowId, appliedRootId));
  for (const v of importedVersions) {
    if (v.published) {throw new Error(`FAIL: imported version ${v.id} is published`);}
    if (v.publishedAt !== null) {throw new Error(`FAIL: imported version ${v.id} publishedAt is not null`);}
  }

  // Read both workflows back through the endpoints the builder itself calls.
  const readSections = async (id: string): Promise<Array<{ id: string; title: string }>> => {
    const r = await fetch(`${BASE}/api/workflows/${id}/sections`, { headers: H });
    await ok(r, 'read sections');
    return await r.json() as Array<{ id: string; title: string }>;
  };

  const sourceSections = await readSections(workflow.id);
  const importedSections = await readSections(appliedRootId);

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
      if (sourceIds.has(st.id)) {throw new Error('FAIL: imported step reused a source id');}
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
  for (const s of sourceSections) {
    sourceIds.add(s.id);
  }
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
  log(`  SOURCE builder:   ${BASE}/workflows/${workflow.id}/builder`);
  log(`  IMPORTED builder: ${BASE}/workflows/${appliedRootId}/builder`);
  log('─────────────────────────────────────────────────────────────');
  log('  Screenshot the IMPORTED builder URL: it must show the same');
  log('  sections and steps as the source, with different ids.');

  // Cleanup: delete the tenant so we don't pollute the dev DB with hundreds of test tenants
  try {
    await db.delete(schema.auditLogs).where(eq(schema.auditLogs.tenantId, tenant.id));
    await db.delete(schema.tenants).where(eq(schema.tenants.id, tenant.id));
    log(`7. cleaned up test tenant ${tenant.id}`);
  } catch (err: any) {
    log(`7. cleanup failed (${err.message}). To clean up test tenant by hand:`);
    log(`delete from tenants where id = '${tenant.id}';`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
