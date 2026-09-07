import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import PizZip from 'pizzip';

import { eq, and } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import * as schema from '@shared/schema';

import { runPreviewPolicyService } from '../../server/services/workflow-runs/RunPreviewPolicyService';
import { storageProvider } from '../../server/services/storage';
import { runWithTenantContext } from '../../server/utils/rlsContext';
import { TestFactory } from '../helpers/testFactory';
import { versionService } from '../../server/services/VersionService';
import * as outbound from '../../server/utils/safeFetch';
import { createAuthenticatedAgent, createTestUser, setupIntegrationTest, type IntegrationTestContext } from '../helpers/integrationTestHelper';
import { getOwnerDb } from '../helpers/ownerDb';

describe.sequential('CB-9a-1 preview isolation', () => {
  let ctx: IntegrationTestContext;
  let agent: ReturnType<typeof createAuthenticatedAgent>;
  const workflows: string[] = [];
  const artifacts: string[] = [];
  const templateFiles: string[] = [];
  const templateIds: string[] = [];

  beforeAll(async () => {
    ctx = await setupIntegrationTest({ tenantName: 'CB-9a-1 isolation', createProject: true });
    agent = createAuthenticatedAgent(ctx.baseURL, ctx.authToken);
  });
  afterEach(() => { vi.restoreAllMocks(); });
  afterAll(async () => {
    for (const key of artifacts) { await storageProvider.deleteFile(key); }
    for (const id of workflows) { await getOwnerDb().delete(schema.workflows).where(eq(schema.workflows.id, id)); }
    for (const id of templateIds) { await getOwnerDb().delete(schema.templates).where(eq(schema.templates.id, id)); }
    for (const file of templateFiles) { await fs.unlink(file); }
    await ctx.cleanup();
  });

  async function fixture(): Promise<{ workflowId: string; pageId: string }> {
    const response = await agent.post('/api/workflows').send({ title: `Preview isolation ${randomUUID()}`, projectId: ctx.projectId }).expect(201);
    const workflowId = response.body.id as string;
    workflows.push(workflowId);
    const [page] = await getOwnerDb().select().from(schema.pages).where(eq(schema.pages.workflowId, workflowId));
    return { workflowId, pageId: page.id };
  }

  async function preview(workflowId: string): Promise<schema.WorkflowRun> {
    const response = await agent.post(`/api/workflows/${workflowId}/preview-runs`).send({}).expect(201);
    expect(response.body).not.toHaveProperty('runToken');
    const [run] = await getOwnerDb().select().from(schema.workflowRuns).where(eq(schema.workflowRuns.id, response.body.runId as string));
    return run;
  }

  async function documentFixture(): Promise<{ workflowId: string; pageId: string }> {
    const fixtureData = await fixture();
    const zip = new PizZip();
    zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Preview artifact proof</w:t></w:r></w:p></w:body></w:document>');
    const fileRef = `preview-proof-${randomUUID()}.docx`;
    const file = path.join(process.cwd(), 'server', 'files', fileRef);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, zip.generate({ type: 'nodebuffer' }));
    templateFiles.push(file);
    const [template] = await getOwnerDb().insert(schema.templates).values({ projectId: ctx.projectId!, name: fileRef, type: 'docx', fileRef, lastModifiedBy: ctx.userId }).returning();
    templateIds.push(template.id);
    await getOwnerDb().insert(schema.steps).values({ ...fixtureData, type: 'final_documents', title: 'Artifacts', order: 1,
      config: { documents: [
        { id: 'one', documentId: template.id, alias: 'one', filename: 'one.docx' },
        { id: 'two', documentId: template.id, alias: 'two', filename: 'two.docx' },
      ], outputFormats: ['docx'] } });
    return fixtureData;
  }

  it('persists an author-owned expiring preview pinned to the current draft', async () => {
    const { workflowId, pageId } = await fixture();
    const published = await runWithTenantContext(ctx.tenantId, () => versionService.createDraftVersion(workflowId, ctx.userId));
    expect(published).not.toBeNull();
    await getOwnerDb().update(schema.workflows).set({ currentVersionId: published!.id }).where(eq(schema.workflows.id, workflowId));
    await getOwnerDb().update(schema.pages).set({ title: 'Unpublished preview draft' }).where(eq(schema.pages.id, pageId));
    const liveResponse = await agent.post(`/api/workflows/${workflowId}/runs`).send({}).expect(201);
    expect(liveResponse.body).toBeDefined();
    const run = await preview(workflowId);
    expect(run.executionMode).toBe('preview');
    expect(run.createdBy).toBe(ctx.userId);
    expect(run.workflowVersionId).toBeTruthy();
    expect(run.previewExpiresAt!.getTime()).toBeGreaterThan(Date.now());
    expect(run.tokenExpiresAt!.getTime()).toBeLessThan(Date.now());
    const [version] = await getOwnerDb().select().from(schema.workflowVersions).where(eq(schema.workflowVersions.id, run.workflowVersionId!));
    expect(version.workflowId).toBe(workflowId);
    expect(version.id).not.toBe(published!.id);
    expect(JSON.stringify(version.graphJson)).toContain('Unpublished preview draft');
    expect(JSON.stringify(published!.graphJson)).not.toContain('Unpublished preview draft');
  });

  it('rejects unauthenticated and malformed creation without writing runs', async () => {
    const { workflowId } = await fixture();
    await request(ctx.baseURL).post(`/api/workflows/${workflowId}/preview-runs`).send({}).expect(401);
    await agent.post(`/api/workflows/${workflowId}/preview-runs`).send({ executionMode: 'live' }).expect(400);
    const rows = await getOwnerDb().select().from(schema.workflowRuns).where(eq(schema.workflowRuns.workflowId, workflowId));
    expect(rows).toHaveLength(0);
  });

  it('does not interpret metadata as execution policy and refuses a top-level mode', async () => {
    const { workflowId } = await fixture();
    await agent.post(`/api/workflows/${workflowId}/runs`).send({ executionMode: 'preview' }).expect(400);
    await agent.post(`/api/workflows/${workflowId}/runs`).send({ metadata: { preview: true, executionMode: 'preview' } }).expect(201);
    const rows = await getOwnerDb().select().from(schema.workflowRuns).where(eq(schema.workflowRuns.workflowId, workflowId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ executionMode: 'live', previewExpiresAt: null, previewArtifacts: [] });
  });

  it('rejects direct promotion at persistence and leaves the identity unchanged', async () => {
    const { workflowId } = await fixture();
    const run = await preview(workflowId);
    await expect(getOwnerDb().update(schema.workflowRuns).set({ executionMode: 'live' }).where(eq(schema.workflowRuns.id, run.id))).rejects.toThrow();
    const [after] = await getOwnerDb().select().from(schema.workflowRuns).where(eq(schema.workflowRuns.id, run.id));
    expect(after.executionMode).toBe('preview');
    expect(after.workflowVersionId).toBe(run.workflowVersionId);
  });

  it('denies another same-tenant user with no run data or value effects', async () => {
    const { workflowId, pageId } = await fixture();
    const run = await preview(workflowId);
    const stranger = await createTestUser(ctx, 'viewer');
    const other = createAuthenticatedAgent(ctx.baseURL, stranger.token);
    const response = await other.get(`/api/preview-runs/${run.id}`).expect(404);
    expect(JSON.stringify(response.body)).not.toContain(run.workflowVersionId);
    await other.post(`/api/runs/${run.id}/pages/${pageId}/submit`).send({ values: [] }).expect(404);
    expect(await getOwnerDb().select().from(schema.stepValues).where(eq(schema.stepValues.runId, run.id))).toHaveLength(0);
  });


  it('denies cross-tenant creation, reads, submission and retirement without leaking data', async () => {
    const { workflowId, pageId } = await fixture();
    const run = await preview(workflowId);
    const [tenant] = await getOwnerDb().insert(schema.tenants).values({ name: 'CB preview stranger' }).returning();
    const stranger = await createTestUser(ctx, 'owner', tenant.id);
    try {
      const other = createAuthenticatedAgent(ctx.baseURL, stranger.token);
      for (const response of [
        await other.post(`/api/workflows/${workflowId}/preview-runs`).send({}),
        await other.get(`/api/preview-runs/${run.id}`),
        await other.post(`/api/runs/${run.id}/pages/${pageId}/submit`).send({ values: [] }),
        await other.delete(`/api/preview-runs/${run.id}`),
      ]) {
        expect([403, 404]).toContain(response.status);
        expect(response.body).not.toHaveProperty('values');
        expect(JSON.stringify(response.body)).not.toContain(run.workflowVersionId);
      }
      const rows = await getOwnerDb().select().from(schema.workflowRuns).where(eq(schema.workflowRuns.workflowId, workflowId));
      expect(rows).toHaveLength(1);
      expect(rows[0].previewRetiredAt).toBeNull();
    } finally {
      await getOwnerDb().delete(schema.users).where(eq(schema.users.id, stranger.userId));
      await getOwnerDb().delete(schema.tenants).where(eq(schema.tenants.id, tenant.id));
    }
  });

  it('expires preview data and retries swallowed blob deletion while preserving live data', async () => {
    const { workflowId, pageId } = await fixture();
    const [step] = await getOwnerDb().insert(schema.steps).values({ workflowId, pageId, type: 'text', title: 'Retained live answer', order: 1 }).returning();
    const run = await preview(workflowId);
    await agent.post(`/api/workflows/${workflowId}/runs`).send({}).expect(201);
    const [live] = await getOwnerDb().select().from(schema.workflowRuns).where(and(eq(schema.workflowRuns.workflowId, workflowId), eq(schema.workflowRuns.executionMode, 'live')));
    await getOwnerDb().insert(schema.stepValues).values([
      { runId: run.id, stepId: step.id, value: 'preview secret' },
      { runId: live.id, stepId: step.id, value: 'live answer' },
    ]);
    const key = `runs/${run.id}/documents/retry.zip`;
    artifacts.push(key);
    await runPreviewPolicyService.upload(run.id, key, Buffer.from('retry'), 'application/zip');
    await getOwnerDb().update(schema.workflowRuns).set({ previewExpiresAt: new Date(0) }).where(eq(schema.workflowRuns.id, run.id));
    await agent.get(`/api/preview-runs/${run.id}`).expect(404);
    const deletion = vi.spyOn(storageProvider, 'deleteFile').mockResolvedValueOnce(undefined);
    await runPreviewPolicyService.cleanupBatch();
    expect(await storageProvider.exists(key)).toBe(true);
    expect(await getOwnerDb().select().from(schema.stepValues).where(eq(schema.stepValues.runId, run.id))).toHaveLength(1);
    deletion.mockRestore();
    await runPreviewPolicyService.cleanupBatch();
    expect(await storageProvider.exists(key)).toBe(false);
    expect(await getOwnerDb().select().from(schema.stepValues).where(eq(schema.stepValues.runId, run.id))).toHaveLength(0);
    const [survivor] = await getOwnerDb().select().from(schema.stepValues).where(eq(schema.stepValues.runId, live.id));
    expect(survivor.value).toBe('live answer');
  });

  it('excludes previews from ordinary lists and grouped counts', async () => {
    const { workflowId } = await fixture();
    await preview(workflowId);
    await agent.post(`/api/workflows/${workflowId}/runs`).send({}).expect(201);
    const { workflowRunRepository } = await import('../../server/repositories');
    expect(await workflowRunRepository.findByWorkflowId(workflowId)).toHaveLength(1);
    expect(await workflowRunRepository.findByWorkflowIds([workflowId])).toHaveLength(1);
    expect((await workflowRunRepository.countByWorkflowIds([workflowId])).get(workflowId)).toBe(1);
  });

  it('blocks distribution without producing resume credentials', async () => {
    const { workflowId } = await fixture();
    const run = await preview(workflowId);
    const { runService } = await import('../../server/services/RunService');
    await expect(runService.shareRun(run.id, ctx.userId, 'creator', {})).rejects.toThrow('Run not found');
    await expect(getOwnerDb().update(schema.workflowRuns).set({ shareTokenHash: randomUUID() }).where(eq(schema.workflowRuns.id, run.id))).rejects.toThrow();
    expect(await getOwnerDb().select().from(schema.runResumeLinks).where(eq(schema.runResumeLinks.runId, run.id))).toHaveLength(0);
  });

  it('tracks uploads before their document rows and cleans retired artifacts only', async () => {
    const { workflowId } = await fixture();
    const run = await preview(workflowId);
    const active = await preview(workflowId);
    const key = `runs/${run.id}/documents/orphan.zip`;
    artifacts.push(key);
    await runPreviewPolicyService.execute(run.id, () => runPreviewPolicyService.upload(run.id, key, Buffer.from('preview archive'), 'application/zip'));
    expect(await storageProvider.exists(key)).toBe(true);
    expect(await getOwnerDb().select().from(schema.runGeneratedDocuments).where(eq(schema.runGeneratedDocuments.runId, run.id))).toHaveLength(0);
    await agent.delete(`/api/preview-runs/${run.id}`).expect(204);
    await runPreviewPolicyService.cleanupBatch();
    expect(await storageProvider.exists(key)).toBe(false);
    const [survivor] = await getOwnerDb().select().from(schema.workflowRuns).where(eq(schema.workflowRuns.id, active.id));
    expect(survivor.previewRetiredAt).toBeNull();
  });

  it('does not clean while an operation holds a lease; late answer writes fail', async () => {
    const { workflowId, pageId } = await fixture();
    const run = await preview(workflowId);
    const [step] = await getOwnerDb().insert(schema.steps).values({ workflowId, pageId, type: 'text', title: 'Race answer', order: 1 }).returning();
    await runPreviewPolicyService.execute(run.id, async () => {
      await agent.delete(`/api/preview-runs/${run.id}`).expect(204);
      await runPreviewPolicyService.cleanupBatch();
      const [leased] = await getOwnerDb().select().from(schema.workflowRuns).where(eq(schema.workflowRuns.id, run.id));
      expect(leased.previewLeaseOwner).not.toBeNull();
      await expect(getOwnerDb().insert(schema.stepValues).values({ runId: run.id, stepId: step.id, value: 'late' })).rejects.toThrow();
    });
    await runPreviewPolicyService.cleanupBatch();
    expect(await getOwnerDb().select().from(schema.stepValues).where(eq(schema.stepValues.runId, run.id))).toHaveLength(0);
  });

  it('tracks real renderer document and ZIP uploads even when document persistence fails', async () => {
    const { workflowId } = await documentFixture();
    const run = await preview(workflowId);
    const { runLifecycleService } = await import('../../server/services/workflow-runs/RunLifecycleService');
    const { runGeneratedDocumentsRepository } = await import('../../server/repositories');
    const persist = vi.spyOn(runGeneratedDocumentsRepository, 'createDocument').mockRejectedValue(new Error('Injected row failure'));
    const result = await runLifecycleService.generateDocuments(run.id);
    expect(result.success).toBe(false);
    persist.mockRestore();
    const [owned] = await getOwnerDb().select().from(schema.workflowRuns).where(eq(schema.workflowRuns.id, run.id));
    artifacts.push(...owned.previewArtifacts);
    expect(owned.previewArtifacts.filter(key => key.endsWith('.docx'))).toHaveLength(2);
    expect(owned.previewArtifacts.filter(key => key.endsWith('.zip'))).toHaveLength(1);
    for (const key of owned.previewArtifacts) { expect(await storageProvider.exists(key)).toBe(true); }
    await agent.delete(`/api/preview-runs/${run.id}`).expect(204);
    await runPreviewPolicyService.cleanupBatch();
    for (const key of owned.previewArtifacts) { expect(await storageProvider.exists(key)).toBe(false); }
    expect(await fs.stat(runPreviewPolicyService.artifactDirectory(run.id)).then(() => true, () => false)).toBe(false);
  });

  it('reloads queued mode and cleans an upload that finishes after retirement', async () => {
    const { workflowId } = await documentFixture();
    const run = await preview(workflowId);
    await getOwnerDb().insert(schema.runCompletionJobs).values({ runId: run.id, kind: 'documents', payload: { executionMode: 'live' } });
    const { RunCompletionJobWorker } = await import('../../server/services/workflow-runs/RunCompletionJobWorker');
    const originalUpload = storageProvider.uploadFile.bind(storageProvider);
    const uploads = vi.spyOn(storageProvider, 'uploadFile').mockImplementationOnce(async (key, bytes, mime) => {
      await agent.delete(`/api/preview-runs/${run.id}`).expect(204);
      await runPreviewPolicyService.cleanupBatch();
      return originalUpload(key, bytes, mime);
    });
    await new RunCompletionJobWorker().processBatch(`preview-worker-${randomUUID()}`);
    expect(uploads).toHaveBeenCalled();
    const [retired] = await getOwnerDb().select().from(schema.workflowRuns).where(eq(schema.workflowRuns.id, run.id));
    artifacts.push(...retired.previewArtifacts);
    await runPreviewPolicyService.cleanupBatch();
    expect(await storageProvider.list(`runs/${run.id}/documents/`)).toHaveLength(0);
    expect(await getOwnerDb().select().from(schema.runGeneratedDocuments).where(eq(schema.runGeneratedDocuments.runId, run.id))).toHaveLength(0);
    expect(await getOwnerDb().select().from(schema.runCompletionJobs).where(eq(schema.runCompletionJobs.runId, run.id))).toHaveLength(0);
  });

  it('suppresses native and collection write providers while ordinary start still writes', async () => {
    const { workflowId } = await fixture();
    const factory = new TestFactory();
    const database = await factory.createDatabase(ctx.projectId!, ctx.tenantId, ctx.userId);
    const table = await factory.createTable(database.id, ctx.userId, { tenantId: ctx.tenantId });
    const collection = await factory.createCollection(ctx.tenantId, ctx.userId);
    await getOwnerDb().insert(schema.blocks).values([
      { workflowId, type: 'write', phase: 'onRunStart', config: { tableId: table.id, mode: 'create', columnMappings: [], outputKey: 'fakeRow' } },
      { workflowId, type: 'create_record', phase: 'onRunStart', config: { collectionId: collection.id, fieldMap: {}, outputKey: 'fakeRecord' } },
    ]);
    const { datavaultRowsService } = await import('../../server/services/DatavaultRowsService');
    const { recordRepository } = await import('../../server/repositories/RecordRepository');
    const native = vi.spyOn(datavaultRowsService, 'createRow');
    const records = vi.spyOn(recordRepository, 'create');
    const run = await preview(workflowId);
    expect(native).not.toHaveBeenCalled();
    expect(records).not.toHaveBeenCalled();
    const response = await agent.get(`/api/preview-runs/${run.id}`).expect(200);
    expect(response.body.notices.join(' ')).toContain('unsupported');
    expect(response.body.values).toEqual([]);
    await agent.post(`/api/workflows/${workflowId}/runs`).send({}).expect(201);
    expect(native).toHaveBeenCalledTimes(1);
    expect(records).toHaveBeenCalledTimes(1);
    expect(await getOwnerDb().select().from(schema.records).where(eq(schema.records.collectionId, collection.id))).toHaveLength(1);
  });

  it('carries preview mode into the sandbox context and sends no outbound traffic', async () => {
    const { workflowId, pageId } = await fixture();
    // NO `await` in hook code. Both sandbox paths wrap user code in a PLAIN
    // function -- `(function(input, context, helpers) { ... })(...)` in
    // enhancedSandboxExecutor's isolated-vm bootstrap and in its vm fallback --
    // so a top-level `await` is a SyntaxError and the hook never runs at all.
    // Measured: "Script rejected by security validation: Syntax error". A hook
    // that cannot compile proves nothing about isolation, so the mode proof is
    // kept synchronous and the helper's own contract is asserted directly below.
    await agent.post(`/api/workflows/${workflowId}/lifecycle-hooks`).send({ name: 'Preview mode proof', phase: 'afterPage', language: 'javascript',
      code: "helpers.console.log('preview helper proof'); emit({ proof: 'no outbound attempted', mode: context.run.mode || 'live' });",
      inputKeys: [], outputKeys: ['proof', 'mode'], enabled: true }).expect(201);
    const provider = vi.spyOn(outbound, 'safeFetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const run = await preview(workflowId);
    await agent.post(`/api/runs/${run.id}/pages/${pageId}/submit`).send({ values: [] }).expect(200);
    const logs = await getOwnerDb().select().from(schema.scriptExecutionLog).where(eq(schema.scriptExecutionLog.runId, run.id));
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe('success');
    // The whole point: script context reports preview, not the 'live' default.
    expect(logs[0].outputSample).toMatchObject({ proof: 'no outbound attempted', mode: 'preview' });
    expect(provider).not.toHaveBeenCalled();
    await agent.post(`/api/workflows/${workflowId}/runs`).send({}).expect(201);
    expect(provider).not.toHaveBeenCalled(); // The ordinary run reaches no provider either.
  });

  it('leaves the sandbox HTTP helpers unimplemented, so neither mode can send', async () => {
    // Asserted against the helper library itself rather than through a hook:
    // these reject (they are `async`), and a rejection cannot be caught by
    // sandbox code that is forbidden from using `await`.
    const { helperLibrary } = await import('../../server/services/scripting/HelperLibrary');
    await expect(helperLibrary.http.get('https://example.com/x'))
      .rejects.toThrow(/not yet implemented/);
    await expect(helperLibrary.http.post('https://example.com/x', {}))
      .rejects.toThrow(/not yet implemented/);
  });

  it('simulates signature creation before the provider and preserves ordinary provider dispatch', async () => {
    const { workflowId, pageId } = await documentFixture();
    const [step] = await getOwnerDb().insert(schema.steps).values({ workflowId, pageId, type: 'signature_block', title: 'Sign', order: 2,
      config: { signerRole: 'Applicant', signerName: 'Test signer', signerEmail: 'signer@example.com', routingOrder: 1, provider: 'docusign',
        documents: [{ id: 'agreement', documentId: templateIds.at(-1)! }] } }).returning();
    const { DocusignProvider } = await import('../../server/services/esign/DocusignProvider');
    const { EsignProviderFactory } = await import('../../server/services/esign/EsignProvider');
    const provider = new DocusignProvider({ integrationKey: 'test', userId: 'test', accountId: 'test', privateKey: 'test', basePath: 'https://demo.docusign.net/restapi', oauthBasePath: 'https://account-d.docusign.com' });
    vi.spyOn(EsignProviderFactory, 'getProvider').mockReturnValue(provider);
    const envelope = vi.spyOn(provider, 'createEnvelope').mockResolvedValue({ envelopeId: randomUUID(), signingUrl: 'https://demo.docusign.net/Signing/test', status: 'sent' });
    const run = await preview(workflowId);
    const simulated = await agent.post(`/api/esign/execute/${run.id}/${step.id}`).send({}).expect(200);
    expect(simulated.body.preview).toBe(true);
    expect(envelope).not.toHaveBeenCalled();
    expect(await getOwnerDb().select().from(schema.signatureRequests).where(eq(schema.signatureRequests.runId, run.id))).toHaveLength(0);
    await agent.post(`/api/workflows/${workflowId}/runs`).send({}).expect(201);
    const [live] = await getOwnerDb().select().from(schema.workflowRuns).where(and(eq(schema.workflowRuns.workflowId, workflowId), eq(schema.workflowRuns.executionMode, 'live')));
    await agent.post(`/api/esign/execute/${live.id}/${step.id}`).send({}).expect(200);
    expect(envelope).toHaveBeenCalledTimes(1);
    expect(envelope.mock.calls[0][0].preview).toBe(false);
  });

  it('suppresses document delivery jobs and provider sends with an ordinary delivery control', async () => {
    const { workflowId } = await documentFixture();
    const [step] = await getOwnerDb().select().from(schema.steps).where(and(eq(schema.steps.workflowId, workflowId), eq(schema.steps.type, 'final_documents')));
    const config = { ...(step.config as Record<string, unknown>), deliveryDestinations: [{ id: 'webhook-proof', type: 'webhook', config: { url: 'https://example.com/delivery-spy' } }] };
    await getOwnerDb().update(schema.steps).set({ config }).where(eq(schema.steps.id, step.id));
    const { runLifecycleService } = await import('../../server/services/workflow-runs/RunLifecycleService');
    const { documentDeliveryService } = await import('../../server/services/document/delivery/DocumentDeliveryService');
    const provider = vi.spyOn(outbound, 'safeFetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const run = await preview(workflowId);
    expect((await runLifecycleService.generateDocuments(run.id)).success).toBe(true);
    expect(await getOwnerDb().select().from(schema.runDocumentDeliveries).where(eq(schema.runDocumentDeliveries.runId, run.id))).toHaveLength(0);
    await documentDeliveryService.processPendingDeliveries();
    expect(provider).not.toHaveBeenCalled();
    await agent.post(`/api/workflows/${workflowId}/runs`).send({}).expect(201);
    const [live] = await getOwnerDb().select().from(schema.workflowRuns).where(and(eq(schema.workflowRuns.workflowId, workflowId), eq(schema.workflowRuns.executionMode, 'live')));
    const generated = await runLifecycleService.generateDocuments(live.id);
    expect(generated.success).toBe(true);
    const [previewRow] = await getOwnerDb().select().from(schema.workflowRuns).where(eq(schema.workflowRuns.id, run.id));
    artifacts.push(...previewRow.previewArtifacts, ...await storageProvider.list(`runs/${live.id}/documents/`));
    await documentDeliveryService.processPendingDeliveries();
    await vi.waitFor(() => expect(provider).toHaveBeenCalledTimes(1));
    await vi.waitFor(async () => {
      const [delivery] = await getOwnerDb().select().from(schema.runDocumentDeliveries).where(eq(schema.runDocumentDeliveries.runId, live.id));
      expect(delivery.status).toBe('delivered');
    });
  });

  it('suppresses an actual external-send dispatcher on preview start and calls its provider for live start', async () => {
    const { workflowId } = await fixture();
    const [destination] = await getOwnerDb().insert(schema.externalDestinations).values({
      tenantId: ctx.tenantId, name: 'Preview provider spy', type: 'webhook', config: { url: 'https://example.com/preview-spy' },
    }).returning();
    try {
      await getOwnerDb().insert(schema.blocks).values({ workflowId, type: 'external_send', phase: 'onRunStart',
        config: { destinationId: destination.id, payloadMappings: [] } });
      const provider = vi.spyOn(outbound, 'safeFetch').mockResolvedValue(new Response('{}', { status: 200 }));
      await preview(workflowId);
      expect(provider).not.toHaveBeenCalled();
      await agent.post(`/api/workflows/${workflowId}/runs`).send({}).expect(201);
      expect(provider).toHaveBeenCalledTimes(1);
      const previews = await getOwnerDb().select().from(schema.workflowRuns).where(and(eq(schema.workflowRuns.workflowId, workflowId), eq(schema.workflowRuns.executionMode, 'preview')));
      expect(previews).toHaveLength(1);
    } finally { await getOwnerDb().delete(schema.externalDestinations).where(eq(schema.externalDestinations.id, destination.id)); }
  });
});
