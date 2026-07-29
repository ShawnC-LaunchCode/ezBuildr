import { it, expect, beforeEach, vi, afterEach } from 'vitest';
import { describeWithDb } from '../../helpers/dbTestHelper';
import { importService } from '../../../server/services/portability/ImportService';
import { exportService } from '../../../server/services/portability/ExportService';
import { TestFactory } from '../../helpers/testFactory';
import AdmZip from 'adm-zip';
import { randomUUID } from 'crypto';
import { FORMAT_VERSION } from '../../../server/services/portability/bundleFormat';
import { db } from '../../../server/db';
import { projects, workflows, datavaultTables, steps, secrets, externalConnections, transformBlocks } from '@shared/schema';

import { recomputeChecksum } from '../../helpers/bundleTestHelper';

describeWithDb('ImportService - preview', () => {
  let tf: TestFactory;
  let user: any;
  let project: any;
  let workflow: any;
  let projectBundle: Buffer;
  let workflowBundle: Buffer;
  
  beforeEach(async () => {
    tf = new TestFactory();
    const t = await tf.createTenant();
    user = t.user;
    project = t.project;
    const w = await tf.createWorkflow(project.id, user.id);
    workflow = w.workflow;
    
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

    const sec = await tf.createSection(workflow.id);
    await db.insert(steps).values({
      id: randomUUID(),
      workflowId: workflow.id,
      sectionId: sec.id,
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
      sectionId: sec.id,
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

    const preview = await importService.preview(projectBundle, user.id);

    const afterProjects = await db.select().from(projects);
    const afterWorkflows = await db.select().from(workflows);

    expect(preview.canProceed).toBe(true);
    expect(beforeProjects.length).toBe(afterProjects.length);
    expect(beforeWorkflows.length).toBe(afterWorkflows.length);
  });

  it('rejects bundle with newer formatVersion', async () => {
    const zip = new AdmZip(projectBundle);
    const manifestEntry = zip.getEntry('manifest.json');
    const manifest = JSON.parse(manifestEntry!.getData().toString('utf8'));
    manifest.formatVersion = FORMAT_VERSION + 1;
    zip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)));
    
    const newBuffer = zip.toBuffer();
    
    await expect(importService.preview(newBuffer, user.id)).rejects.toThrow(/newer than supported/);
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
    const preview = await importService.preview(newBuffer, user.id);
    
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
    const preview = await importService.preview(newBuffer, user.id);
    
    expect(preview.canProceed).toBe(true);
    expect(preview.entityCounts['connections']).toBeGreaterThan(0);
  });

  it('counts entities across all affected tables', async () => {
    const previewProject = await importService.preview(projectBundle, user.id);
    const previewWorkflow = await importService.preview(workflowBundle, user.id);
    
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
    const preview = await importService.preview(newBuffer, user.id);
    
    expect(preview.canProceed).toBe(false);
    expect(preview.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('Validation failed in workflows')])
    );
  });

  it('detects name/slug/alias collisions', async () => {
    const previewProject = await importService.preview(projectBundle, user.id);
    const previewWorkflow = await importService.preview(workflowBundle, user.id);
    expect(previewProject.collisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entity: 'projects' }),
        expect.objectContaining({ entity: 'workflows' })
      ])
    );
    expect(previewWorkflow.collisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entity: 'workflows' }),
        expect.objectContaining({ entity: 'steps' })
      ])
    );
  });

  it('sets executable-code flag when hooks or transform blocks are present', async () => {
    const preview = await importService.preview(workflowBundle, user.id);
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

    const previewProject = await importService.preview(projectBundle, user.id);
    const previewWorkflow = await importService.preview(newBuffer, user.id);
    
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
    const preview = await importService.preview(badBuffer, user.id);
    
    expect(preview.canProceed).toBe(false);
    expect(preview.errors[0]).toMatch(/Failed to parse bundle/);
  });

  it('throws Access denied or Project not found for unauthorized targetProjectId', async () => {
    // Non-existent project
    await expect(importService.preview(projectBundle, user.id, randomUUID()))
      .rejects.toThrow('Project not found');

    // Unauthorized project
    const attackerTf = new TestFactory();
    const attacker = await attackerTf.createTenant();
    
    await expect(importService.preview(projectBundle, attacker.user.id, project.id))
      .rejects.toThrow('Access denied - insufficient permissions for this project');
  });

  it('rejects bundle with empty checksum', async () => {
    const zip = new AdmZip(projectBundle);
    const manifestEntry = zip.getEntry('manifest.json');
    const manifest = JSON.parse(manifestEntry!.getData().toString('utf8'));
    manifest.checksum = ''; 
    zip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)));
    
    const newBuffer = zip.toBuffer();
    
    const preview = await importService.preview(newBuffer, user.id);
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
    const preview = await importService.preview(newBuffer, user.id);
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
    const preview = await importService.preview(newBuffer, user.id);
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
    await expect(importService.preview(newBuffer, user.id)).rejects.toThrow(/Checksum mismatch/);
  });
});
