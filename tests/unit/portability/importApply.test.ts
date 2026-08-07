import { it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describeWithDb } from '../../helpers/dbTestHelper';
import { exportService } from '../../../server/services/portability/ExportService';
import { importService } from '../../../server/services/portability/ImportService';
import { storageProvider } from '../../../server/services/storage';
import { logger } from '../../../server/logger';
import { TestFactory } from '../../helpers/testFactory';
import AdmZip from 'adm-zip';
import { randomUUID } from 'crypto';
import { db } from '../../../server/db';
import {
  projects, workflows, datavaultTables, datavaultDatabases, steps, projectAccess, workflowAccess,
  sections, logicRules, blocks, transformBlocks, lifecycleHooks, documentHooks,
  workflowVersions, datavaultRows
} from '@shared/schema';
import { recomputeChecksum, previewBundle, applyBundle } from '../../helpers/bundleTestHelper';
import { eq } from 'drizzle-orm';

describeWithDb('ImportService - apply', () => {
  let tf: TestFactory;
  let user: any;
  let project: any;
  let workflow: any;
  let projectBundle: Buffer;
  let workflowBundle: Buffer;
  let sectionId: string;
  let stepId: string;
  
  beforeEach(async () => {
    tf = new TestFactory();
    const t = await tf.createTenant();
    user = t.user;
    project = t.project;
    const w = await tf.createWorkflow(project.id, user.id);
    workflow = w.workflow;

    const sec = await tf.createSection(workflow.id);
    sectionId = sec.id;
    stepId = randomUUID();
    await db.insert(steps).values({
      id: stepId,
      workflowId: workflow.id,
      sectionId: sec.id,
      type: 'text',
      title: 'Test Step',
      alias: 'test_step_alias',
      order: 0
    });

    // AC 1 needs one of every workflow-scoped child entity present, so the
    // structural round-trip below is exercising real rows rather than absence.
    await db.insert(logicRules).values({
      id: randomUUID(),
      workflowId: workflow.id,
      conditionStepId: stepId,
      when: { stepId },
      targetType: 'step',
      targetStepId: stepId,
      action: 'show',
      order: 1
    });
    await db.insert(blocks).values({
      id: randomUUID(),
      workflowId: workflow.id,
      sectionId: sec.id,
      type: 'prefill',
      phase: 'onSectionEnter',
      config: {},
      virtualStepId: stepId,
      order: 0
    });
    await db.insert(transformBlocks).values({
      id: randomUUID(),
      workflowId: workflow.id,
      sectionId: sec.id,
      name: 'Test Transform',
      language: 'javascript',
      code: 'emit(1);',
      outputKey: 'out',
      virtualStepId: stepId,
      order: 0
    });
    await db.insert(lifecycleHooks).values({
      id: randomUUID(),
      workflowId: workflow.id,
      sectionId: sec.id,
      name: 'Test Lifecycle Hook',
      phase: 'beforePage',
      language: 'javascript',
      code: 'emit(1);',
      order: 0
    });
    await db.insert(documentHooks).values({
      id: randomUUID(),
      workflowId: workflow.id,
      name: 'Test Document Hook',
      phase: 'beforeGeneration',
      language: 'javascript',
      code: 'emit(1);',
      order: 0
    });

    const [dbRow] = await db.insert(datavaultDatabases).values({
      id: randomUUID(),
      tenantId: user.tenantId,
      name: 'Test DB',
      scopeType: 'project',
      scopeId: project.id
    }).returning();

    await db.insert(datavaultTables).values({
      id: randomUUID(),
      tenantId: user.tenantId,
      databaseId: dbRow.id,
      name: 'Test Table',
      slug: 'test-table-slug'
    });

    await db.insert(projectAccess).values({
      id: randomUUID(),
      projectId: project.id,
      principalType: 'user',
      principalId: user.id,
      role: 'edit'
    });

    await db.insert(workflowAccess).values({
      id: randomUUID(),
      workflowId: workflow.id,
      principalType: 'user',
      principalId: user.id,
      role: 'edit'
    });

    projectBundle = await exportService.export({ scope: 'project', id: project.id }, user.id);
    workflowBundle = await exportService.export({ scope: 'workflow', id: workflow.id }, user.id);
  });

  afterEach(async () => {
    if (tf && user) {
      await tf.cleanup({ tenantIds: [user.tenantId] });
    }
    vi.restoreAllMocks();
  });

  it('performs import successfully', async () => {
    const beforeProjects = await db.select().from(projects);
    const beforeWorkflows = await db.select().from(workflows);

    const newRootId = (await applyBundle(projectBundle, user.id)).rootId;

    const afterProjects = await db.select().from(projects);
    const afterWorkflows = await db.select().from(workflows);

    expect(newRootId).toBeDefined();
    expect(afterProjects.length).toBe(beforeProjects.length + 1);
    expect(afterWorkflows.length).toBe(beforeWorkflows.length + 1);
  });

  it('reads the caller-supplied file path directly with no second whole-bundle copy (IEX2-10 AC 1, AC 2)', async () => {
    // Stand in for the multer upload: our own file on disk, at a path we own.
    const filePath = path.join(os.tmpdir(), `ac-test-${randomUUID()}.ezb`);
    await fs.promises.writeFile(filePath, projectBundle);
    const writeFileSpy = vi.spyOn(fs.promises, 'writeFile');

    const result = await importService.apply(filePath, user.id);
    expect(result.rootId).toBeDefined();

    // The old `import_apply_*`/`import_preview_*` write-back of the whole
    // buffer to a second temp file is gone. Checked by call target rather
    // than a temp-dir directory diff: os.tmpdir() is shared across this
    // suite's concurrent workers, so a diff would false-positive on
    // unrelated tests' own temp files.
    const wholeBundleCopies = writeFileSpy.mock.calls.filter(([target]) =>
      typeof target === 'string' &&
      (target.includes('import_apply_') || target.includes('import_preview_')));
    expect(wholeBundleCopies).toEqual([]);

    await fs.promises.rm(filePath, { force: true });
  });

  it('reproduces the full workflow structure and rewires every child FK (AC 1)', async () => {
    // Workflow scope, not project scope: sections/steps/logic rules/blocks/hooks
    // are all ["workflow"]-scoped, so a project bundle would assert nothing here.
    const newRootId = (await applyBundle(workflowBundle, user.id)).rootId;
    expect(newRootId).not.toBe(workflow.id);

    const [newSection] = await db.select().from(sections).where(eq(sections.workflowId, newRootId));
    const newSteps = await db.select().from(steps).where(eq(steps.workflowId, newRootId));
    const newRules = await db.select().from(logicRules).where(eq(logicRules.workflowId, newRootId));
    const newBlocks = await db.select().from(blocks).where(eq(blocks.workflowId, newRootId));
    const newTransforms = await db.select().from(transformBlocks).where(eq(transformBlocks.workflowId, newRootId));
    const newLifecycle = await db.select().from(lifecycleHooks).where(eq(lifecycleHooks.workflowId, newRootId));
    const newDocHooks = await db.select().from(documentHooks).where(eq(documentHooks.workflowId, newRootId));

    // Structure matches the source workflow.
    expect(newSection).toBeDefined();
    expect(newSteps).toHaveLength(1);
    expect(newRules).toHaveLength(1);
    expect(newBlocks).toHaveLength(1);
    expect(newTransforms).toHaveLength(1);
    expect(newLifecycle).toHaveLength(1);
    expect(newDocHooks).toHaveLength(1);

    // Every child carries a fresh id, not the bundle's.
    expect(newSection.id).not.toBe(sectionId);
    expect(newSteps[0].id).not.toBe(stepId);

    // ...and every FK points at the imported copy, not the source row.
    expect(newSteps[0].sectionId).toBe(newSection.id);
    expect(newBlocks[0].sectionId).toBe(newSection.id);
    expect(newTransforms[0].sectionId).toBe(newSection.id);
    expect(newLifecycle[0].sectionId).toBe(newSection.id);
    expect(newBlocks[0].virtualStepId).toBe(newSteps[0].id);
    expect(newTransforms[0].virtualStepId).toBe(newSteps[0].id);
    expect(newRules[0].conditionStepId).toBe(newSteps[0].id);
    expect(newRules[0].targetStepId).toBe(newSteps[0].id);

    // jsonRefs inside the rule's `when` are remapped too.
    expect((newRules[0].when as { stepId: string }).stepId).toBe(newSteps[0].id);
  });

  it('project-scope bundle carries workflow internals and round-trips them (IEX-13)', async () => {
    // Before IEX-13 a project bundle held workflow ROWS but none of their
    // contents, so this import produced a hollow workflow and the assertions
    // below all read zero.
    const newProjectId = (await applyBundle(projectBundle, user.id)).rootId;

    const [newWorkflow] = await db.select().from(workflows).where(eq(workflows.projectId, newProjectId));
    expect(newWorkflow).toBeDefined();
    expect(newWorkflow.id).not.toBe(workflow.id);

    const newSections = await db.select().from(sections).where(eq(sections.workflowId, newWorkflow.id));
    const newSteps = await db.select().from(steps).where(eq(steps.workflowId, newWorkflow.id));
    const newRules = await db.select().from(logicRules).where(eq(logicRules.workflowId, newWorkflow.id));
    const newBlocks = await db.select().from(blocks).where(eq(blocks.workflowId, newWorkflow.id));
    const newTransforms = await db.select().from(transformBlocks).where(eq(transformBlocks.workflowId, newWorkflow.id));
    const newLifecycle = await db.select().from(lifecycleHooks).where(eq(lifecycleHooks.workflowId, newWorkflow.id));
    const newDocHooks = await db.select().from(documentHooks).where(eq(documentHooks.workflowId, newWorkflow.id));

    expect(newSections).toHaveLength(1);
    expect(newSteps).toHaveLength(1);
    expect(newRules).toHaveLength(1);
    expect(newBlocks).toHaveLength(1);
    expect(newTransforms).toHaveLength(1);
    expect(newLifecycle).toHaveLength(1);
    expect(newDocHooks).toHaveLength(1);

    // Child FKs are rewired to the imported copies, not left pointing at the source.
    expect(newSteps[0].sectionId).toBe(newSections[0].id);
    expect(newRules[0].conditionStepId).toBe(newSteps[0].id);
    expect(newSteps[0].id).not.toBe(stepId);
  });

  it('nulls a workflow slug on same-system import (AC 1)', async () => {
    await db.update(workflows).set({ slug: 'test-slug-123' }).where(eq(workflows.id, workflow.id));
    const bundle = await exportService.export({ scope: 'workflow', id: workflow.id }, user.id);
    
    const result = await applyBundle(bundle, user.id);
    const [imported] = await db.select().from(workflows).where(eq(workflows.id, result.rootId));
    
    expect(imported.slug).toBeNull();
    const [source] = await db.select().from(workflows).where(eq(workflows.id, workflow.id));
    expect(source.slug).toBe('test-slug-123');
  });

  it('imports the same bundle twice successfully (AC 2)', async () => {
    // The bundle must carry a slug, or this asserts nothing: workflows.slug is
    // the globally-unique column that made re-import impossible, and the shared
    // fixture workflow has none. Verified by mutation — with the publication
    // reset removed, a slug-less bundle imports twice quite happily.
    await db.update(workflows).set({ slug: 'repeat-import-slug' }).where(eq(workflows.id, workflow.id));
    const bundle = await exportService.export({ scope: 'workflow', id: workflow.id }, user.id);

    const first = await applyBundle(bundle, user.id);
    const second = await applyBundle(bundle, user.id);

    // Two distinct copies, neither of which took the source's slug.
    expect(second.rootId).not.toBe(first.rootId);
    const [firstWf] = await db.select().from(workflows).where(eq(workflows.id, first.rootId));
    const [secondWf] = await db.select().from(workflows).where(eq(workflows.id, second.rootId));
    expect(firstWf.slug).toBeNull();
    expect(secondWf.slug).toBeNull();

    // ...and the source still owns it.
    const [source] = await db.select().from(workflows).where(eq(workflows.id, workflow.id));
    expect(source.slug).toBe('repeat-import-slug');
  });

  it('forces isPublic, publicLink, and status on import, leaving source untouched (AC 3)', async () => {
    await db.update(workflows).set({ 
      isPublic: true, 
      publicLink: 'public-link-abc',
      status: 'active'
    }).where(eq(workflows.id, workflow.id));
    
    const bundle = await exportService.export({ scope: 'workflow', id: workflow.id }, user.id);
    const result = await applyBundle(bundle, user.id);
    
    const [imported] = await db.select().from(workflows).where(eq(workflows.id, result.rootId));
    expect(imported.isPublic).toBe(false);
    expect(imported.publicLink).toBeNull();
    expect(imported.status).toBe('draft');
    
    const [source] = await db.select().from(workflows).where(eq(workflows.id, workflow.id));
    expect(source.isPublic).toBe(true);
    expect(source.publicLink).toBe('public-link-abc');
    expect(source.status).toBe('active');
  });

  it('forces workflow_versions to unpublished (AC 4)', async () => {
    await db.update(workflowVersions)
      .set({ published: true, publishedAt: new Date() })
      .where(eq(workflowVersions.workflowId, workflow.id));
    
    const bundle = await exportService.export({ scope: 'workflow', id: workflow.id }, user.id);
    const result = await applyBundle(bundle, user.id);
    
    const [importedWf] = await db.select().from(workflows).where(eq(workflows.id, result.rootId));
    const importedVersions = await db.select().from(workflowVersions).where(eq(workflowVersions.workflowId, importedWf.id));
    
    expect(importedVersions.length).toBeGreaterThan(0);
    for (const v of importedVersions) {
      expect(v.published).toBe(false);
      expect(v.publishedAt).toBeNull();
    }
  });

  it('rejects hostile bundle smuggling isPublic (AC 5 unconditional stamp)', async () => {
    const zip = new AdmZip(workflowBundle);
    const wfEntry = zip.getEntry('entities/workflows.jsonl');
    
    const lines = wfEntry!.getData().toString('utf8').split('\n').filter(Boolean);
    const row = JSON.parse(lines[0]);
    row.isPublic = true;
    row.publicLink = 'hostile-link';
    row.slug = 'hostile-slug';
    row.status = 'active';
    lines[0] = JSON.stringify(row);
    zip.updateFile('entities/workflows.jsonl', Buffer.from(`${lines.join('\n')}\n`));
    
    const manifestEntry = zip.getEntry('manifest.json');
    const manifest = JSON.parse(manifestEntry!.getData().toString('utf8'));
    recomputeChecksum(zip, manifest);
    zip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)));
    
    const newRootId = (await applyBundle(zip.toBuffer(), user.id)).rootId;
    
    const [importedWf] = await db.select().from(workflows).where(eq(workflows.id, newRootId));
    expect(importedWf.isPublic).toBe(false);
    expect(importedWf.publicLink).toBeNull();
    expect(importedWf.slug).toBeNull();
    expect(importedWf.status).toBe('draft');
  });

  // IEX-15. A workflow-scope bundle carries `workflows` but not `projects`, so
  // workflows.projectId is a foreign id. This surfaced visually: an imported
  // workflow came back titled "... (2)", because it had silently re-attached to
  // the SOURCE project and collided with its own source title.
  it('re-parents a workflow-scope import into targetProjectId (IEX-15)', async () => {
    const [other] = await db.insert(projects).values({
      id: randomUUID(),
      title: 'Destination Project',
      name: 'Destination Project',
      tenantId: user.tenantId,
      creatorId: user.id,
      createdBy: user.id,
      ownerId: user.id,
      ownerType: 'user',
      ownerUuid: user.id,
    }).returning();

    const result = await applyBundle(workflowBundle, user.id, { targetProjectId: other.id });

    const [imported] = await db.select().from(workflows).where(eq(workflows.id, result.rootId));
    expect(imported.projectId).toBe(other.id);
    expect(imported.projectId).not.toBe(project.id);
  });

  it('keeps the original project when it is the caller\'s own (IEX-15)', async () => {
    // Same-system re-import with no target: the bundle's project really is the
    // caller's, so attaching there is correct rather than a foreign reference.
    const result = await applyBundle(workflowBundle, user.id);

    const [imported] = await db.select().from(workflows).where(eq(workflows.id, result.rootId));
    expect(imported.projectId).toBe(project.id);
    expect(result.adjustments).toHaveLength(0);
  });

  it('leaves a workflow unparented when the bundle names a project that is not the caller\'s (IEX-15)', async () => {
    // Simulates a cross-system bundle: rewrite projectId to an id that does not
    // exist here. Previously this was written straight into the database.
    const foreignProjectId = randomUUID();
    const zip = new AdmZip(workflowBundle);
    const lines = zip.getEntry('entities/workflows.jsonl')!.getData().toString('utf8').split('\n').filter(Boolean);
    const row = JSON.parse(lines[0]);
    row.projectId = foreignProjectId;
    lines[0] = JSON.stringify(row);
    zip.updateFile('entities/workflows.jsonl', Buffer.from(`${lines.join('\n')}\n`));
    const manifest = JSON.parse(zip.getEntry('manifest.json')!.getData().toString('utf8'));
    recomputeChecksum(zip, manifest);
    zip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)));

    const result = await applyBundle(zip.toBuffer(), user.id);

    const [imported] = await db.select().from(workflows).where(eq(workflows.id, result.rootId));
    expect(imported.projectId).toBeNull();
    expect(imported.projectId).not.toBe(foreignProjectId);
    expect(result.adjustments.join(' ')).toMatch(/without a project/i);
  });

  it('rejects hostile bundle smuggling foreign tenantId and ownerUuid (AC 4 unconditional stamp)', async () => {
    const zip = new AdmZip(projectBundle);
    const projectsEntry = zip.getEntry('entities/projects.jsonl');
    
    const lines = projectsEntry!.getData().toString('utf8').split('\n').filter(Boolean);
    const row = JSON.parse(lines[0]);
    row.tenantId = randomUUID();
    row.ownerUuid = randomUUID();
    lines[0] = JSON.stringify(row);
    zip.updateFile('entities/projects.jsonl', Buffer.from(`${lines.join('\n')}\n`));
    
    const manifestEntry = zip.getEntry('manifest.json');
    const manifest = JSON.parse(manifestEntry!.getData().toString('utf8'));
    recomputeChecksum(zip, manifest);
    zip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)));
    
    const newRootId = (await applyBundle(zip.toBuffer(), user.id)).rootId;
    
    const [importedProject] = await db.select().from(projects).where(eq(projects.id, newRootId));
    expect(importedProject).toBeDefined();
    expect(importedProject.tenantId).toBe(user.tenantId);
    expect(importedProject.ownerUuid).toBe(user.id);
  });

  it('preserves forward references (AC 2)', async () => {
    // Add a forward reference (workflows.currentVersionId) to the bundle
    const zip = new AdmZip(workflowBundle);
    const workflowsEntry = zip.getEntry('entities/workflows.jsonl');
    
    const lines = workflowsEntry!.getData().toString('utf8').split('\n').filter(Boolean);
    const wfRow = JSON.parse(lines[0]);
    const fakeVersionId = randomUUID();
    wfRow.currentVersionId = fakeVersionId;
    lines[0] = JSON.stringify(wfRow);
    zip.updateFile('entities/workflows.jsonl', Buffer.from(`${lines.join('\n')}\n`));

    const versionsEntry = zip.getEntry('entities/workflow_versions.jsonl');
    const versionsLines = versionsEntry ? versionsEntry.getData().toString('utf8').split('\n').filter(Boolean) : [];
    versionsLines.push(JSON.stringify({
      id: fakeVersionId,
      workflowId: wfRow.id,
      versionNumber: 2,
      isDraft: false,
      graphJson: {},
      migrationInfo: {},
      changelog: {},
      checksum: 'fake'
    }));
    
    if (versionsEntry) {
      zip.updateFile('entities/workflow_versions.jsonl', Buffer.from(`${versionsLines.join('\n')}\n`));
    } else {
      zip.addFile('entities/workflow_versions.jsonl', Buffer.from(`${versionsLines.join('\n')}\n`));
    }
    
    const manifestEntry2 = zip.getEntry('manifest.json');
    const manifest2 = JSON.parse(manifestEntry2!.getData().toString('utf8'));
    manifest2.entityCounts['workflow_versions'] = (manifest2.entityCounts['workflow_versions'] || 0) + 1;
    recomputeChecksum(zip, manifest2);
    zip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest2)));

    const newRootId = (await applyBundle(zip.toBuffer(), user.id)).rootId;
    
    const [importedWf] = await db.select().from(workflows).where(eq(workflows.id, newRootId));
    expect(importedWf.currentVersionId).not.toBeNull();
    expect(importedWf.currentVersionId).not.toBe(fakeVersionId); // Re-mapped!
  });

  it('remaps JSON IDs (AC 3)', async () => {
    // We use a workflow bundle because it natively exports steps and sections
    const zip = new AdmZip(workflowBundle);
    
    // Inject fake step ID into workflows.intakeConfig
    const workflowsEntry = zip.getEntry('entities/workflows.jsonl');
    const lines = workflowsEntry!.getData().toString('utf8').split('\n').filter(Boolean);
    const wfRow = JSON.parse(lines[0]);
    const fakeStepId = randomUUID();
    wfRow.intakeConfig = {
      defaultStepId: fakeStepId, // Smuggled ID
      nested: { step: fakeStepId }
    };
    lines[0] = JSON.stringify(wfRow);
    zip.updateFile('entities/workflows.jsonl', Buffer.from(`${lines.join('\n')}\n`));
    
    // Inject fake step into entities/steps.jsonl
    const stepsEntry = zip.getEntry('entities/steps.jsonl');
    const stepsLines = stepsEntry!.getData().toString('utf8').split('\n').filter(Boolean);
    stepsLines.push(JSON.stringify({
      id: fakeStepId,
      workflowId: wfRow.id,
      sectionId: JSON.parse(stepsLines[0]).sectionId, // Use real section
      type: 'text',
      title: 'Fake Step',
      order: 1
    }));
    zip.updateFile('entities/steps.jsonl', Buffer.from(`${stepsLines.join('\n')}\n`));
    
    const manifestEntry = zip.getEntry('manifest.json');
    const manifest = JSON.parse(manifestEntry!.getData().toString('utf8'));
    manifest.entityCounts['steps'] = (manifest.entityCounts['steps'] || 0) + 1;
    recomputeChecksum(zip, manifest);
    zip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)));

    const newRootId = (await applyBundle(zip.toBuffer(), user.id)).rootId;
    const [importedWf] = await db.select().from(workflows).where(eq(workflows.id, newRootId));
    
    const importedSteps = await db.select().from(steps).where(eq(steps.workflowId, importedWf.id));
    const newFakeStep = importedSteps.find(s => s.title === 'Fake Step');
    expect(newFakeStep).toBeDefined();
    
    const config = importedWf.intakeConfig as any;
    expect(config.defaultStepId).toBe(newFakeStep!.id);
    expect(config.nested.step).toBe(newFakeStep!.id);
  });

  it('silently drops role assignments to prevent privilege escalation (AC 5)', async () => {
    // Inject a project_access record into the bundle
    const zip = new AdmZip(projectBundle);
    const row = {
      id: randomUUID(),
      projectId: project.id,
      principalType: 'user',
      principalId: user.id,
      role: 'admin'
    };
    zip.addFile('entities/project_access.jsonl', Buffer.from(`${JSON.stringify(row)}\n`));
    const manifestEntry = zip.getEntry('manifest.json');
    const manifest = JSON.parse(manifestEntry!.getData().toString('utf8'));
    manifest.entityCounts['project_access'] = (manifest.entityCounts['project_access'] || 0) + 1;
    recomputeChecksum(zip, manifest);
    zip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)));
    
    const newRootId = (await applyBundle(zip.toBuffer(), user.id)).rootId;
    
    const accesses = await db.select().from(projectAccess).where(eq(projectAccess.projectId, newRootId));
    expect(accesses.length).toBe(0);
  });

  it('rolls back on forced failure mid-import and cleans up written blobs (AC 1, AC 2)', async () => {
    // Inject a template into the project and re-export so we have a blob
    await tf.createTemplate(project.id, user.id, { name: 'Rollback Blob Temp', fileRef: 'src/blob.bin' });
    vi.spyOn(storageProvider, 'exists').mockResolvedValue(true);
    vi.spyOn(storageProvider, 'getFile').mockResolvedValue(Buffer.from('test data'));
    vi.spyOn(storageProvider, 'getMetadata').mockResolvedValue({ contentType: 'application/octet-stream' } as any);
    
    let savedRef = '';
    vi.spyOn(storageProvider, 'saveFile').mockImplementation(async () => {
      savedRef = `imported/${randomUUID()}`;
      return savedRef;
    });
    const deleteSpy = vi.spyOn(storageProvider, 'deleteFile').mockResolvedValue();

    const bundleBuffer = await exportService.export({ scope: 'project', id: project.id }, user.id);

    const beforeProjects = await db.select().from(projects);
    const beforeWorkflows = await db.select().from(workflows);

    const zip = new AdmZip(bundleBuffer);
    const workflowsEntry = zip.getEntry('entities/workflows.jsonl');
    const lines = workflowsEntry!.getData().toString('utf8').split('\n').filter(Boolean);
    const wfRow = JSON.parse(lines[0]);
    
    wfRow.isPublic = "not_a_boolean"; 
    lines[0] = JSON.stringify(wfRow);
    zip.updateFile('entities/workflows.jsonl', Buffer.from(`${lines.join('\n')}\n`));
    
    const manifestEntry = zip.getEntry('manifest.json');
    const manifest = JSON.parse(manifestEntry!.getData().toString('utf8'));
    recomputeChecksum(zip, manifest);
    zip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)));

    // AC 2: original error is propagated unchanged
    await expect(applyBundle(zip.toBuffer(), user.id)).rejects.toThrow(/Validation failed in workflows:[\s\S]*isPublic/);

    // AC 1: every blob written by this call is gone
    expect(savedRef).not.toBe('');
    expect(deleteSpy).toHaveBeenCalledWith(savedRef);

    const afterProjects = await db.select().from(projects);
    const afterWorkflows = await db.select().from(workflows);

    expect(afterProjects.length).toBe(beforeProjects.length);
    expect(afterWorkflows.length).toBe(beforeWorkflows.length);
  });

  it('leaves blobs in place on successful import (AC 3)', async () => {
    await tf.createTemplate(project.id, user.id, { name: 'Success Blob Temp', fileRef: 'src/blob2.bin' });
    vi.spyOn(storageProvider, 'exists').mockResolvedValue(true);
    vi.spyOn(storageProvider, 'getFile').mockResolvedValue(Buffer.from('test data 2'));
    vi.spyOn(storageProvider, 'getMetadata').mockResolvedValue({ contentType: 'application/octet-stream' } as any);
    vi.spyOn(storageProvider, 'saveFile').mockResolvedValue(`imported/success-blob.bin`);
    const deleteSpy = vi.spyOn(storageProvider, 'deleteFile').mockResolvedValue();

    const bundleBuffer = await exportService.export({ scope: 'project', id: project.id }, user.id);
    await applyBundle(bundleBuffer, user.id);

    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('surfaces original error and logs warning when cleanup fails (AC 4)', async () => {
    await tf.createTemplate(project.id, user.id, { name: 'Fail Cleanup Temp', fileRef: 'src/blob3.bin' });
    vi.spyOn(storageProvider, 'exists').mockResolvedValue(true);
    vi.spyOn(storageProvider, 'getFile').mockResolvedValue(Buffer.from('test data 3'));
    vi.spyOn(storageProvider, 'getMetadata').mockResolvedValue({ contentType: 'application/octet-stream' } as any);
    vi.spyOn(storageProvider, 'saveFile').mockResolvedValue(`imported/fail-blob.bin`);
    
    const deleteSpy = vi.spyOn(storageProvider, 'deleteFile').mockRejectedValue(new Error('Cleanup exploded'));
    // A silent cleanup failure is the whole hazard this ticket is about: the
    // blob stays in storage and nothing anywhere records that it leaked.
    const warnSpy = vi.spyOn(logger, 'warn');

    const bundleBuffer = await exportService.export({ scope: 'project', id: project.id }, user.id);

    const zip = new AdmZip(bundleBuffer);
    const workflowsEntry = zip.getEntry('entities/workflows.jsonl');
    const lines = workflowsEntry!.getData().toString('utf8').split('\n').filter(Boolean);
    const wfRow = JSON.parse(lines[0]);
    wfRow.isPublic = "not_a_boolean"; 
    lines[0] = JSON.stringify(wfRow);
    zip.updateFile('entities/workflows.jsonl', Buffer.from(`${lines.join('\n')}\n`));
    
    const manifestEntry = zip.getEntry('manifest.json');
    const manifest = JSON.parse(manifestEntry!.getData().toString('utf8'));
    recomputeChecksum(zip, manifest);
    zip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)));

    // Must still throw the original validation error, not the cleanup error
    await expect(applyBundle(zip.toBuffer(), user.id)).rejects.toThrow(/Validation failed in workflows:[\s\S]*isPublic/);
    
    // The cleanup attempt MUST have happened
    expect(deleteSpy).toHaveBeenCalledWith('imported/fail-blob.bin');

    // ...and its failure must be recorded rather than swallowed, naming the ref
    // so the leaked object can actually be found and reclaimed.
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ fileRef: 'imported/fail-blob.bin' }),
      expect.stringContaining('clean up')
    );
  });

  it('suffixes collisions in alias and slugs (AC 7)', async () => {
    // 1. Slug collision: projectBundle has datavault_tables
    await applyBundle(projectBundle, user.id);
    
    const tables = await db.select().from(datavaultTables).where(eq(datavaultTables.tenantId, user.tenantId));
    const importedTable = tables.find(t => t.slug === 'test-table-slug-2');
    expect(importedTable).toBeDefined();

    // 2. Alias collision: workflowBundle has steps. 
    // We inject a duplicate step inside the bundle to trigger suffixing!
    const zip = new AdmZip(workflowBundle);
    const stepsEntry = zip.getEntry('entities/steps.jsonl');
    const stepsLines = stepsEntry!.getData().toString('utf8').split('\n').filter(Boolean);
    const firstStep = JSON.parse(stepsLines[0]);
    
    const dupStep = { ...firstStep, id: randomUUID(), title: 'Duplicate Step', order: 1 };
    stepsLines.push(JSON.stringify(dupStep));
    zip.updateFile('entities/steps.jsonl', Buffer.from(`${stepsLines.join('\n')}\n`));
    
    const manifestEntry = zip.getEntry('manifest.json');
    const manifest = JSON.parse(manifestEntry!.getData().toString('utf8'));
    manifest.entityCounts['steps'] = (manifest.entityCounts['steps'] || 0) + 1;
    recomputeChecksum(zip, manifest);
    zip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)));

    const newRootIdWf = (await applyBundle(zip.toBuffer(), user.id)).rootId;
    
    const allSteps = await db.select().from(steps).where(eq(steps.workflowId, newRootIdWf));
    const importedStep = allSteps.find(s => s.alias === 'test_step_alias_2');
    expect(importedStep).toBeDefined();
  });

  it('imports timestamp columns correctly (IEX2-1 AC1, AC2, AC3, AC4, AC5)', async () => {
    const publishedAt = new Date('2026-07-29T10:00:00.000Z');
    const deletedAt = new Date('2026-07-29T11:00:00.000Z');
    
    await db.insert(workflowVersions).values({
      id: randomUUID(),
      workflowId: workflow.id,
      versionNumber: 1,
      isDraft: false,
      published: true,
      publishedAt: publishedAt,
      createdBy: user.id,
      graphJson: {},
      migrationInfo: {},
      changelog: {},
      checksum: 'fake'
    });
    await db.insert(workflowVersions).values({
      id: randomUUID(),
      workflowId: workflow.id,
      versionNumber: 2,
      isDraft: true,
      published: false,
      publishedAt: null,
      createdBy: user.id,
      graphJson: {},
      migrationInfo: {},
      changelog: {},
      checksum: 'fake2'
    });

    const [dbRow] = await db.select().from(datavaultDatabases).where(eq(datavaultDatabases.name, 'Test DB'));
    const [tableRow] = await db.select().from(datavaultTables).where(eq(datavaultTables.databaseId, dbRow.id));

    await db.insert(datavaultRows).values({
      id: randomUUID(),
      tableId: tableRow.id,
      deletedAt: deletedAt,
      createdBy: user.id
    });

    const bundleBuffer = await exportService.export({ scope: 'project', id: project.id }, user.id);

    // AC 4: preview returns canProceed: true with no Validation failed errors
    const previewResult = await previewBundle(bundleBuffer, user.id);
    expect(previewResult.canProceed).toBe(true);
    expect(previewResult.errors.some(e => e.includes('Validation failed'))).toBe(false);

    // AC 1 & 2: import succeeds
    const newRootId = (await applyBundle(bundleBuffer, user.id)).rootId;

    const [importedWf] = await db.select().from(workflows).where(eq(workflows.projectId, newRootId));
    
    const importedVersions = await db.select().from(workflowVersions).where(eq(workflowVersions.workflowId, importedWf.id));

    const pubV = importedVersions.find(v => v.versionNumber === 1);
    const unpubV = importedVersions.find(v => v.versionNumber === 2);
    expect(pubV).toBeDefined();

    const importedDatabases = await db.select().from(datavaultDatabases).where(eq(datavaultDatabases.scopeId, newRootId));
    const importedTables = await db.select().from(datavaultTables).where(eq(datavaultTables.databaseId, importedDatabases[0].id));
    const importedRows = await db.select().from(datavaultRows).where(eq(datavaultRows.tableId, importedTables[0].id));
    
    expect(importedRows).toHaveLength(1);
    expect(importedRows[0].deletedAt).toBeDefined();
    expect(importedRows[0].deletedAt!.getTime()).toBe(deletedAt.getTime());

    // AC 3: null timestamp round-trips as null
    expect(unpubV!.publishedAt).toBeNull();

    // AC 5: malformed timestamp rejected
    const zip = new AdmZip(bundleBuffer);
    const versionsEntry = zip.getEntry('entities/workflow_versions.jsonl');
    const lines = versionsEntry!.getData().toString('utf8').split('\n').filter(Boolean);
    const vRow = JSON.parse(lines[0]);
    vRow.publishedAt = 'not-a-date';
    lines[0] = JSON.stringify(vRow);
    zip.updateFile('entities/workflow_versions.jsonl', Buffer.from(`${lines.join('\n')}\n`));
    
    const manifestEntry = zip.getEntry('manifest.json');
    const manifest = JSON.parse(manifestEntry!.getData().toString('utf8'));
    recomputeChecksum(zip, manifest);
    zip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)));

    await expect(applyBundle(zip.toBuffer(), user.id)).rejects.toThrow(/Validation failed/);
  });
  it('rejects unresolvable NOT NULL references and warns for nullable references (IEX2-2)', async () => {
    // We will use workflowBundle. We will inject a dangling NOT NULL reference (steps.sectionId)
    // and a dangling nullable reference (logic_rules.targetStepId).
    
    const zip = new AdmZip(workflowBundle);
    const stepsEntry = zip.getEntry('entities/steps.jsonl');
    const stepsLines = stepsEntry!.getData().toString('utf8').split('\n').filter(Boolean);
    const firstStep = JSON.parse(stepsLines[0]);
    
    // NOT NULL ref
    const fakeSectionId = randomUUID();
    const badStep = { ...firstStep, id: randomUUID(), title: 'Bad Step', sectionId: fakeSectionId, order: 2 };
    stepsLines.push(JSON.stringify(badStep));
    zip.updateFile('entities/steps.jsonl', Buffer.from(`${stepsLines.join('\n')}\n`));
    
    // Nullable ref
    const rulesEntry = zip.getEntry('entities/logic_rules.jsonl');
    const rulesLines = rulesEntry!.getData().toString('utf8').split('\n').filter(Boolean);
    const firstRule = JSON.parse(rulesLines[0]);
    
    const fakeTargetStepId = randomUUID();
    const badRule = { ...firstRule, id: randomUUID(), conditionStepId: firstStep.id, targetStepId: fakeTargetStepId };
    rulesLines.push(JSON.stringify(badRule));
    zip.updateFile('entities/logic_rules.jsonl', Buffer.from(`${rulesLines.join('\n')}\n`));
    
    const manifestEntry = zip.getEntry('manifest.json');
    const manifest = JSON.parse(manifestEntry!.getData().toString('utf8'));
    manifest.entityCounts['steps'] = (manifest.entityCounts['steps'] || 0) + 1;
    manifest.entityCounts['logic_rules'] = (manifest.entityCounts['logic_rules'] || 0) + 1;
    recomputeChecksum(zip, manifest);
    zip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)));
    
    // AC 5: preview reports dangling references
    const preview = await previewBundle(zip.toBuffer(), user.id);
    expect(preview.canProceed).toBe(false);
    expect(preview.errors.some(e => e.includes('Unresolvable reference') && e.includes('sectionId') && e.includes('steps'))).toBe(true);
    expect(preview.warnings.some(w => w.type === 'dangling_reference' && w.column === 'targetStepId' && w.entity === 'logic_rules')).toBe(true);
    
    // AC 2 & 3: apply rejects NOT NULL ref with 400-classified error
    // (Our classifyImportError in portability.routes.ts matches 'Unresolvable reference' to 400)
    await expect(applyBundle(zip.toBuffer(), user.id)).rejects.toThrow(/Unresolvable reference: steps\.sectionId/);
    
    // Now fix the NOT NULL ref to test AC 4 (nullable ref imports as null + warning)
    badStep.sectionId = firstStep.sectionId;
    stepsLines[1] = JSON.stringify(badStep);
    zip.updateFile('entities/steps.jsonl', Buffer.from(`${stepsLines.join('\n')}\n`));
    recomputeChecksum(zip, manifest);
    zip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)));
    
    const result = await applyBundle(zip.toBuffer(), user.id);
    expect(result.warnings.some(w => w.type === 'dangling_reference' && w.column === 'targetStepId' && w.entity === 'logic_rules')).toBe(true);
    
    // Verify it actually imported as null
    const [importedWf] = await db.select().from(workflows).where(eq(workflows.id, result.rootId));
    const rules = await db.select().from(logicRules).where(eq(logicRules.workflowId, importedWf.id));
    
    const nullTargetRule = rules.find(r => r.targetStepId === null);
    expect(nullTargetRule).toBeDefined();
    expect(rules.length).toBe(2);
  });

  it('reads importable flag instead of field matching (IEX2-6 AC 1/AC 2)', () => {
    const shouldSkipEntity = (importService as any).shouldSkipEntity.bind(importService);
    
    // importable: false and no role field -> skipped
    const skippedDesc = { importable: false, fields: ['id', 'someField'] };
    expect(shouldSkipEntity(skippedDesc)).toBe(true);

    // importable: true (or undefined) and role field -> NOT skipped
    const notSkippedDesc = { fields: ['id', 'role'] };
    expect(shouldSkipEntity(notSkippedDesc)).toBe(false);

    const explicitlyNotSkippedDesc = { importable: true, fields: ['id', 'role'] };
    expect(shouldSkipEntity(explicitlyNotSkippedDesc)).toBe(false);
  });

  it('bundle contains no principalId values from the source system (IEX2-6 AC 3)', async () => {
    // We already have projectBundle exported from beforeEach.
    // Check its zip entries.
    const zip = new AdmZip(projectBundle);
    for (const entry of zip.getEntries()) {
      if (entry.entryName.startsWith('entities/') && entry.entryName.endsWith('.jsonl')) {
        const lines = entry.getData().toString('utf8').split('\n').filter(Boolean);
        for (const line of lines) {
          const row = JSON.parse(line);
          expect(row.principalId).toBeUndefined();
        }
      }
    }
    
    const wfZip = new AdmZip(workflowBundle);
    for (const entry of wfZip.getEntries()) {
      if (entry.entryName.startsWith('entities/') && entry.entryName.endsWith('.jsonl')) {
        const lines = entry.getData().toString('utf8').split('\n').filter(Boolean);
        for (const line of lines) {
          const row = JSON.parse(line);
          expect(row.principalId).toBeUndefined();
        }
      }
    }
  });

  it('does not write a REAL foreign step id verbatim (IEX2-2 AC 1)', async () => {
    // This is the audit's actual reproduction, and it is not interchangeable
    // with a random UUID. `logic_rules.targetStepId` carries a real FK to
    // `steps.id`, so a random UUID is rejected by Postgres whether or not the
    // fix is present — the interesting case is an id that EXISTS in the
    // database (satisfying the constraint) but is NOT in the bundle, because
    // that is what silently landed verbatim and let a crafted bundle attach
    // imported rows to a workflow the uploader does not own.
    const otherW = await tf.createWorkflow(project.id, user.id);
    const otherSec = await tf.createSection(otherW.workflow.id);
    const foreignStepId = randomUUID();
    await db.insert(steps).values({
      id: foreignStepId,
      workflowId: otherW.workflow.id,
      sectionId: otherSec.id,
      type: 'text',
      title: 'Foreign Step',
      alias: 'foreign_step_alias',
      order: 0
    });

    const zip = new AdmZip(workflowBundle);
    const rulesLines = zip.getEntry('entities/logic_rules.jsonl')!.getData()
      .toString('utf8').split(/\r?\n/).filter(Boolean);
    const rule = JSON.parse(rulesLines[0]);
    rule.targetStepId = foreignStepId;
    rulesLines[0] = JSON.stringify(rule);
    zip.updateFile('entities/logic_rules.jsonl', Buffer.from(`${rulesLines.join('\n')}\n`));

    const manifest = JSON.parse(zip.getEntry('manifest.json')!.getData().toString('utf8'));
    recomputeChecksum(zip, manifest);
    zip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)));

    const result = await applyBundle(zip.toBuffer(), user.id);
    const rules = await db.select().from(logicRules)
      .where(eq(logicRules.workflowId, result.rootId));

    expect(rules.some(r => r.targetStepId === foreignStepId)).toBe(false);
    expect(rules.some(r => r.targetStepId === null)).toBe(true);
    expect(result.warnings.some(w =>
      w.type === 'dangling_reference' && w.entity === 'logic_rules' && w.column === 'targetStepId'
    )).toBe(true);

    // The foreign workflow is untouched — nothing was re-pointed into it.
    const foreignRules = await db.select().from(logicRules)
      .where(eq(logicRules.workflowId, otherW.workflow.id));
    expect(foreignRules).toHaveLength(0);
  });
});
