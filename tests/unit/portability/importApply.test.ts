import { it, expect, beforeEach, vi, afterEach } from 'vitest';
import { describeWithDb } from '../../helpers/dbTestHelper';
import { importService } from '../../../server/services/portability/ImportService';
import { exportService } from '../../../server/services/portability/ExportService';
import { TestFactory } from '../../helpers/testFactory';
import AdmZip from 'adm-zip';
import { randomUUID } from 'crypto';
import { db } from '../../../server/db';
import {
  projects, workflows, datavaultTables, datavaultDatabases, steps, projectAccess,
  sections, logicRules, blocks, transformBlocks, lifecycleHooks, documentHooks
} from '@shared/schema';
import { recomputeChecksum } from '../../helpers/bundleTestHelper';
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
      operator: 'equals',
      conditionValue: { stepId },
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

    const newRootId = await importService.apply(projectBundle, user.id);

    const afterProjects = await db.select().from(projects);
    const afterWorkflows = await db.select().from(workflows);

    expect(newRootId).toBeDefined();
    expect(afterProjects.length).toBe(beforeProjects.length + 1);
    expect(afterWorkflows.length).toBe(beforeWorkflows.length + 1);
  });

  it('reproduces the full workflow structure and rewires every child FK (AC 1)', async () => {
    // Workflow scope, not project scope: sections/steps/logic rules/blocks/hooks
    // are all ["workflow"]-scoped, so a project bundle would assert nothing here.
    const newRootId = await importService.apply(workflowBundle, user.id);
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

    // jsonRefs inside the rule's conditionValue are remapped too.
    expect((newRules[0].conditionValue as { stepId: string }).stepId).toBe(newSteps[0].id);
  });

  it('project-scope bundle carries workflow internals and round-trips them (IEX-13)', async () => {
    // Before IEX-13 a project bundle held workflow ROWS but none of their
    // contents, so this import produced a hollow workflow and the assertions
    // below all read zero.
    const newProjectId = await importService.apply(projectBundle, user.id);

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
    
    const newRootId = await importService.apply(zip.toBuffer(), user.id);
    
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

    const newRootId = await importService.apply(zip.toBuffer(), user.id);
    
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

    const newRootId = await importService.apply(zip.toBuffer(), user.id);
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
    
    const newRootId = await importService.apply(zip.toBuffer(), user.id);
    
    const accesses = await db.select().from(projectAccess).where(eq(projectAccess.projectId, newRootId));
    expect(accesses.length).toBe(0);
  });

  it('rolls back on forced failure mid-import (AC 6)', async () => {
    const beforeProjects = await db.select().from(projects);
    const beforeWorkflows = await db.select().from(workflows);

    const zip = new AdmZip(projectBundle);
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

    await expect(importService.apply(zip.toBuffer(), user.id)).rejects.toThrow();

    const afterProjects = await db.select().from(projects);
    const afterWorkflows = await db.select().from(workflows);

    expect(afterProjects.length).toBe(beforeProjects.length);
    expect(afterWorkflows.length).toBe(beforeWorkflows.length);
  });

  it('suffixes collisions in alias and slugs (AC 7)', async () => {
    // 1. Slug collision: projectBundle has datavault_tables
    await importService.apply(projectBundle, user.id);
    
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

    const newRootIdWf = await importService.apply(zip.toBuffer(), user.id);
    
    const allSteps = await db.select().from(steps).where(eq(steps.workflowId, newRootIdWf));
    const importedStep = allSteps.find(s => s.alias === 'test_step_alias_2');
    expect(importedStep).toBeDefined();
  });
});
