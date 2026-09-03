import { it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describeWithDb } from '../../helpers/dbTestHelper';
import { exportService } from '../../../server/services/portability/ExportService';
import { importService } from '../../../server/services/portability/ImportService';
import { TestFactory } from '../../helpers/testFactory';
import AdmZip from 'adm-zip';
import { randomUUID } from 'crypto';
import { FORMAT_VERSION } from '../../../server/services/portability/bundleFormat';
import { db } from '../../../server/db';
import { eq } from 'drizzle-orm';
import { projects, workflows, datavaultTables, steps, secrets, externalConnections, transformBlocks } from '@shared/schema';

import { recomputeChecksum, previewBundle } from '../../helpers/bundleTestHelper';

describeWithDb('ImportService - preview', () => {
  let tf: TestFactory;
  let user: any;
  let project: any;
  let workflow: any;
  let projectBundle: Buffer;
  let workflowBundle: Buffer;
  
  beforeEach(async () => {
    tf = new TestFactory();
    const tfResult = await tf.createTenant();
    user = tfResult.user;
    project = tfResult.project;

    // Set ownerType and ownerUuid so that ensureUniqueProjectTitle will find it
    await db.update(projects).set({ ownerType: 'user', ownerUuid: user.id }).where(eq(projects.id, project.id));
    project.ownerType = 'user';
    project.ownerUuid = user.id;

    workflow = (await tf.createWorkflow(project.id, user.id)).workflow;
    
    // Set ownerType and ownerUuid on workflow so ensureUniqueWorkflowTitle will find it
    await db.update(workflows).set({ ownerType: 'user', ownerUuid: user.id }).where(eq(workflows.id, workflow.id));
    workflow.ownerType = 'user';
    workflow.ownerUuid = user.id;
    
    // Add some entities to test collisions and re-entry
    await db.insert(secrets).values({
      id: randomUUID(),
      projectId: project.id,
      key: 'TEST_SECRET',
      type: 'api_key',
      environment: 'production',
      valueEnc: 'encrypted_stuff'
    });

    await db.insert(externalConnections).values({
      id: randomUUID(),
      tenantId: user.tenantId,
      projectId: project.id,
      name: 'Test Connection',
      type: 'api_key',
      authConfig: { token: 'secret' }
    });

    const page = await tf.createPage(workflow.id);
    await db.insert(steps).values({
      id: randomUUID(),
      workflowId: workflow.id,
      pageId: page.id,
      type: 'text',
      title: 'Test Step',
      alias: 'test_step_alias',
      order: 0
    });

    await db.insert(datavaultTables).values({
      id: randomUUID(),
      tenantId: user.tenantId,
      databaseId: (await tf.createDatabase(project.id, user.tenantId, user.id)).id,
      name: 'Test Table',
      slug: 'test_table_slug'
    });
    
    await db.insert(transformBlocks).values({
      id: randomUUID(),
      workflowId: workflow.id,
      pageId: page.id,
      name: 'Test Hook',
      language: 'javascript',
      code: 'const x = "sk-1234567890123456789012345678901234567890";',
      outputKey: 'test_output',
      phase: 'onRunStart',
      order: 0
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

  it('performs zero writes during preview', async () => {
    const beforeProjects = await db.select().from(projects);
    const beforeWorkflows = await db.select().from(workflows);

    const preview = await previewBundle(projectBundle, user.id);

    const afterProjects = await db.select().from(projects);
    const afterWorkflows = await db.select().from(workflows);

    expect(preview.canProceed).toBe(true);
    expect(beforeProjects.length).toBe(afterProjects.length);
    expect(beforeWorkflows.length).toBe(afterWorkflows.length);
  });

  it('reads the caller-supplied file path directly with no second whole-bundle copy (IEX2-10 AC 1, AC 2)', async () => {
    const filePath = path.join(os.tmpdir(), `ac-test-${randomUUID()}.ezb`);
    await fs.promises.writeFile(filePath, projectBundle);
    const writeFileSpy = vi.spyOn(fs.promises, 'writeFile');

    const preview = await importService.preview(filePath, user.id);
    expect(preview.canProceed).toBe(true);

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

  it('rejects bundle with newer formatVersion', async () => {
    const zip = new AdmZip(projectBundle);
    const manifestEntry = zip.getEntry('manifest.json');
    const manifest = JSON.parse(manifestEntry!.getData().toString('utf8'));
    manifest.formatVersion = FORMAT_VERSION + 1;
    zip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)));
    
    const newBuffer = zip.toBuffer();
    
    await expect(previewBundle(newBuffer, user.id)).rejects.toThrow(/newer than supported/);
  });

  it('accepts row with unknown column, dropping it', async () => {
    const zip = new AdmZip(projectBundle);
    const workflowsEntry = zip.getEntry('entities/workflows.jsonl');
    
    const lines = workflowsEntry!.getData().toString('utf8').split('\n').filter(Boolean);
    const row = JSON.parse(lines[0]);
    row.extra_unknown_column = 'this should be dropped';
    lines[0] = JSON.stringify(row);
    zip.updateFile('entities/workflows.jsonl', Buffer.from(`${lines.join('\n')}\n`));
    
    const manifestEntry = zip.getEntry('manifest.json');
    const manifest = JSON.parse(manifestEntry!.getData().toString('utf8'));
    recomputeChecksum(zip, manifest);
    zip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)));

    const newBuffer = zip.toBuffer();
    const preview = await previewBundle(newBuffer, user.id);
    
    expect(preview.canProceed).toBe(true);
    expect(preview.entityCounts['workflows']).toBeGreaterThan(0);
  });

  it('drops smuggled fields (e.g. authConfig, valueEnc) without validating them', async () => {
    const zip = new AdmZip(projectBundle);
    const connectionsEntry = zip.getEntry('entities/connections.jsonl');
    
    // authConfig is in the DB schema but NOT in ENTITY_GRAPH.fields for connections.
    // If the schema includes authConfig, it will fail Zod validation because 123 is not valid.
    const lines = connectionsEntry!.getData().toString('utf8').split('\n').filter(Boolean);
    const row = JSON.parse(lines[0]);
    row.authConfig = 123; // invalid type, should be dropped silently
    lines[0] = JSON.stringify(row);
    zip.updateFile('entities/connections.jsonl', Buffer.from(`${lines.join('\n')}\n`));
    
    const manifestEntry = zip.getEntry('manifest.json');
    const manifest = JSON.parse(manifestEntry!.getData().toString('utf8'));
    recomputeChecksum(zip, manifest);
    zip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)));

    const newBuffer = zip.toBuffer();
    const preview = await previewBundle(newBuffer, user.id);
    
    expect(preview.canProceed).toBe(true);
    expect(preview.entityCounts['connections']).toBeGreaterThan(0);
  });

  it('counts entities across all affected tables', async () => {
    const previewProject = await previewBundle(projectBundle, user.id);
    const previewWorkflow = await previewBundle(workflowBundle, user.id);
    
    // Project bundle
    expect(previewProject.entityCounts['projects']).toBeGreaterThan(0);
    expect(previewProject.entityCounts['workflows']).toBeGreaterThan(0);
    expect(previewProject.entityCounts['secrets']).toBeGreaterThan(0);
    expect(previewProject.entityCounts['connections']).toBeGreaterThan(0);
    // Workflow bundle
    expect(previewWorkflow.entityCounts['workflows']).toBeGreaterThan(0);
    expect(previewWorkflow.entityCounts['steps']).toBeGreaterThan(0);
    expect(previewWorkflow.entityCounts['transform_blocks']).toBeGreaterThan(0);
  });

  it('reports row failing Zod schema in preview, not throwing', async () => {
    const zip = new AdmZip(projectBundle);
    const workflowsEntry = zip.getEntry('entities/workflows.jsonl');
    
    const lines = workflowsEntry!.getData().toString('utf8').split('\n').filter(Boolean);
    const row = JSON.parse(lines[0]);
    row.title = 123; // invalid type
    lines[0] = JSON.stringify(row);
    zip.updateFile('entities/workflows.jsonl', Buffer.from(`${lines.join('\n')}\n`));
    
    const manifestEntry = zip.getEntry('manifest.json');
    const manifest = JSON.parse(manifestEntry!.getData().toString('utf8'));
    recomputeChecksum(zip, manifest);
    zip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)));

    const newBuffer = zip.toBuffer();
    const preview = await previewBundle(newBuffer, user.id);
    
    expect(preview.canProceed).toBe(false);
    expect(preview.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('Validation failed in workflows')])
    );
  });

  it('detects accurate project/workflow collisions but ignores false alias/workflow collisions (IEX2-7)', async () => {
    const previewProject = await previewBundle(projectBundle, user.id);
    const previewWorkflow = await previewBundle(workflowBundle, user.id, project.id);
    
    // Project bundle: project title collides, but workflows don't (they go into the new project)
    expect(previewProject.collisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entity: 'projects' })
      ])
    );
    expect(previewProject.collisions.find(c => c.entity === 'workflows')).toBeUndefined();

    // Workflow bundle: workflow title collides, but step aliases don't (they are unique to the new workflow)
    expect(previewWorkflow.collisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entity: 'workflows' })
      ])
    );
    expect(previewWorkflow.collisions.find(c => c.entity === 'steps')).toBeUndefined();
  });

  it('detects step alias collisions within the same bundle (IEX2-7 AC 2)', async () => {
    // We inject a duplicate step into the workflow bundle
    const zip = new AdmZip(workflowBundle);
    // Insert two steps with the SAME alias into the same workflow bundle
    const pageId = randomUUID();
    const stepRow1 = { 
      id: randomUUID(), 
      workflowId: workflow.id, 
      pageId: pageId,
      title: 'Step 1',
      order: 1,
      alias: 'duplicate_alias', 
      type: 'text' 
    };
    const stepRow2 = { 
      id: randomUUID(), 
      workflowId: workflow.id, 
      pageId: pageId,
      title: 'Step 2',
      order: 2,
      alias: 'duplicate_alias', 
      type: 'text' 
    };
    
    // Delete existing steps.jsonl and add the tampered one
    zip.deleteFile('entities/steps.jsonl');
    zip.addFile('entities/steps.jsonl', Buffer.from(`${JSON.stringify(stepRow1)}\n${JSON.stringify(stepRow2)}\n`));
    
    let newBuffer = zip.toBuffer();

    // Recompute the checksum of the zip contents because we tampered with steps.jsonl
    const zip2 = new AdmZip(newBuffer);
    const manifestEntry = zip2.getEntry('manifest.json');
    const manifest = JSON.parse(manifestEntry!.getData().toString('utf8'));
    
    // Ensure steps are counted in the manifest so the reader actually processes them
    manifest.entityCounts = manifest.entityCounts || {};
    manifest.entityCounts.steps = 2;
    
    recomputeChecksum(zip2, manifest);
    zip2.deleteFile('manifest.json');
    zip2.addFile('manifest.json', Buffer.from(JSON.stringify(manifest)));
    newBuffer = zip2.toBuffer();

    const preview = await previewBundle(newBuffer, user.id);
    
    expect(preview.collisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entity: 'steps', name: 'duplicate_alias', type: 'step_alias' })
      ])
    );
  });

  it('ignores identical step aliases across different workflows in the same bundle', async () => {
      // Simulate two different workflows in a project bundle sharing an alias 'email'
      const zip = new AdmZip(projectBundle);
      const pageId = randomUUID();
      const stepRow1 = { 
        id: randomUUID(), 
        workflowId: randomUUID(), // Workflow A
        pageId: pageId,
        title: 'Email Step A',
        order: 1,
        alias: 'email', 
        type: 'text' 
      };
      const stepRow2 = { 
        id: randomUUID(), 
        workflowId: randomUUID(), // Workflow B
        pageId: pageId,
        title: 'Email Step B',
        order: 1,
        alias: 'email', 
        type: 'text' 
      };
      
      // Since it's a project bundle, it might not have steps.jsonl yet, or we can just create/overwrite it
      if (zip.getEntry('entities/steps.jsonl')) {
        zip.deleteFile('entities/steps.jsonl');
      }
      zip.addFile('entities/steps.jsonl', Buffer.from(`${JSON.stringify(stepRow1)}\n${JSON.stringify(stepRow2)}\n`));
      
      let newBuffer = zip.toBuffer();

      const zip2 = new AdmZip(newBuffer);
      const manifestEntry = zip2.getEntry('manifest.json');
      const manifest = JSON.parse(manifestEntry!.getData().toString('utf8'));
      
      manifest.entityCounts = manifest.entityCounts || {};
      manifest.entityCounts.steps = 2;
      
      recomputeChecksum(zip2, manifest);
      zip2.deleteFile('manifest.json');
      zip2.addFile('manifest.json', Buffer.from(JSON.stringify(manifest)));
      newBuffer = zip2.toBuffer();

      const preview = await previewBundle(newBuffer, user.id);
      
      // Should NOT report a collision for 'email' because they are in different workflows
      expect(preview.collisions.find(c => c.entity === 'steps' && c.name === 'email')).toBeUndefined();
    });

  it('detects project title collisions accurately based on target owner (IEX2-7 AC 3)', async () => {
    // The testFactory created a project for 'user'. So importing it for 'user' causes a collision.
    const previewSelf = await previewBundle(projectBundle, user.id);
    expect(previewSelf.collisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entity: 'projects' })
      ])
    );
    
    // If imported by another user (who doesn't have a project with that title), no collision!
    const otherUserTenant = await tf.createTenant();
    const previewOther = await previewBundle(projectBundle, otherUserTenant.user.id);
    expect(previewOther.collisions.find(c => c.entity === 'projects')).toBeUndefined();
  });

  it('sets executable-code flag when hooks or transform blocks are present', async () => {
    const preview = await previewBundle(workflowBundle, user.id);
    expect(preview.hasExecutableCode).toBe(true);
  });

  it('surfaces requiresReentry, missing_blob, and secret_scan warnings', async () => {
    // Add missing_blob warning to workflow bundle manifest
    const zip = new AdmZip(workflowBundle);
    const manifestEntry = zip.getEntry('manifest.json');
    const manifest = JSON.parse(manifestEntry!.getData().toString('utf8'));
    manifest.warnings.push({ type: 'missing_blob', entity: 'templates', column: 'fileRef', fileRef: 'some-path', message: 'Missing' });
    recomputeChecksum(zip, manifest);
    zip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)));
    const newBuffer = zip.toBuffer();

    const previewProject = await previewBundle(projectBundle, user.id);
    const previewWorkflow = await previewBundle(newBuffer, user.id);
    
    // Workflow bundle naturally has a secret_scan warning from our mock transform block
    expect(previewWorkflow.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'secret_scan' }),
        expect.objectContaining({ type: 'missing_blob' })
      ])
    );
    // Project bundle has a secret, so requiresReentry
    expect(previewProject.requiresReentry.length).toBeGreaterThan(0);
  });

  it('rejects truncated/corrupt zip cleanly', async () => {
    const badBuffer = Buffer.from('not a zip file');
    const preview = await previewBundle(badBuffer, user.id);
    
    expect(preview.canProceed).toBe(false);
    expect(preview.errors[0]).toMatch(/Failed to parse bundle/);
  });

  it('throws Access denied or Project not found for unauthorized targetProjectId', async () => {
    // Non-existent project
    await expect(previewBundle(projectBundle, user.id, randomUUID()))
      .rejects.toThrow('Project not found');

    // Unauthorized project
    const attackerTf = new TestFactory();
    const attacker = await attackerTf.createTenant();
    
    await expect(previewBundle(projectBundle, attacker.user.id, project.id))
      .rejects.toThrow('Access denied - insufficient permissions for this project');
  });

  it('rejects bundle with empty checksum', async () => {
    const zip = new AdmZip(projectBundle);
    const manifestEntry = zip.getEntry('manifest.json');
    const manifest = JSON.parse(manifestEntry!.getData().toString('utf8'));
    manifest.checksum = ''; 
    zip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)));
    
    const newBuffer = zip.toBuffer();
    
    const preview = await previewBundle(newBuffer, user.id);
    expect(preview.canProceed).toBe(false);
    expect(preview.errors[0]).toMatch(/Invalid checksum format/);
  });

  it('rejects bundle with tampered entity stream and blanked checksum', async () => {
    const zip = new AdmZip(projectBundle);
    const workflowsEntry = zip.getEntry('entities/workflows.jsonl');
    
    const lines = workflowsEntry!.getData().toString('utf8').split('\n').filter(Boolean);
    const row = JSON.parse(lines[0]);
    row.title = 'Tampered Title';
    lines[0] = JSON.stringify(row);
    zip.updateFile('entities/workflows.jsonl', Buffer.from(`${lines.join('\n')}\n`));
    
    const manifestEntry = zip.getEntry('manifest.json');
    const manifest = JSON.parse(manifestEntry!.getData().toString('utf8'));
    manifest.checksum = ''; 
    zip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)));

    const newBuffer = zip.toBuffer();
    const preview = await previewBundle(newBuffer, user.id);
    expect(preview.canProceed).toBe(false);
    expect(preview.errors[0]).toMatch(/Invalid checksum format/);
  });

  it('rejects bundle with tampered entity stream and wrong length checksum', async () => {
    const zip = new AdmZip(projectBundle);
    const workflowsEntry = zip.getEntry('entities/workflows.jsonl');
    
    const lines = workflowsEntry!.getData().toString('utf8').split('\n').filter(Boolean);
    const row = JSON.parse(lines[0]);
    row.title = 'Tampered Title';
    lines[0] = JSON.stringify(row);
    zip.updateFile('entities/workflows.jsonl', Buffer.from(`${lines.join('\n')}\n`));
    
    const manifestEntry = zip.getEntry('manifest.json');
    const manifest = JSON.parse(manifestEntry!.getData().toString('utf8'));
    manifest.checksum = '12345'; // wrong length and format
    zip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)));

    const newBuffer = zip.toBuffer();
    const preview = await previewBundle(newBuffer, user.id);
    expect(preview.canProceed).toBe(false);
    expect(preview.errors[0]).toMatch(/Invalid checksum format/);
  });

  // The attack the ticket exists for: tamper the payload but leave a
  // well-formed checksum in place, so the manifest regex passes and only
  // verification can catch it. This is the one case that exercises the
  // reader's comparison rather than the schema guard — the other checksum
  // tests all trip the regex first and would still pass if the reader's
  // integrity check were removed entirely.
  it('rejects a tampered entity stream whose checksum is still well-formed', async () => {
    const zip = new AdmZip(projectBundle);
    const workflowsEntry = zip.getEntry('entities/workflows.jsonl');

    const lines = workflowsEntry!.getData().toString('utf8').split('\n').filter(Boolean);
    const row = JSON.parse(lines[0]);
    row.title = 'Tampered Title';
    lines[0] = JSON.stringify(row);
    zip.updateFile('entities/workflows.jsonl', Buffer.from(`${lines.join('\n')}\n`));

    // Deliberately leave the ORIGINAL checksum: 64 hex chars, so it satisfies
    // manifestSchema, but no longer matches the tampered payload.
    const manifestEntry = zip.getEntry('manifest.json');
    const manifest = JSON.parse(manifestEntry!.getData().toString('utf8'));
    expect(manifest.checksum).toMatch(/^[a-f0-9]{64}$/);

    const newBuffer = zip.toBuffer();
    await expect(previewBundle(newBuffer, user.id)).rejects.toThrow(/Checksum mismatch/);
  });
  it('AC 4: a bundle with an older migrationHead still imports successfully and produces a warning in the preview', async () => {
    const zip = new AdmZip(projectBundle);
    const manifestEntry = zip.getEntry('manifest.json');
    const manifest = JSON.parse(manifestEntry!.getData().toString('utf8'));
    
    // Claim an older migrationHead
    manifest.migrationHead = '0003_rich_wild_child';
    
    recomputeChecksum(zip, manifest);
    zip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)));
    const newBuffer = zip.toBuffer();
    
    const preview = await previewBundle(newBuffer, user.id);
    
    expect(preview.canProceed).toBe(true);
    const hasSchemaDrift = preview.warnings.some(w => w.type === 'schema_drift');
    expect(hasSchemaDrift).toBe(true);
  });

  it('AC 5: a bundle with migrationHead: null imports successfully (backward compatibility)', async () => {
    const zip = new AdmZip(projectBundle);
    const manifestEntry = zip.getEntry('manifest.json');
    const manifest = JSON.parse(manifestEntry!.getData().toString('utf8'));
    
    manifest.migrationHead = null;
    
    recomputeChecksum(zip, manifest);
    zip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)));
    const newBuffer = zip.toBuffer();
    
    const preview = await previewBundle(newBuffer, user.id);
    
    expect(preview.canProceed).toBe(true);
    const hasSchemaDrift = preview.warnings.some(w => w.type === 'schema_drift');
    expect(hasSchemaDrift).toBe(false);
  });
});
