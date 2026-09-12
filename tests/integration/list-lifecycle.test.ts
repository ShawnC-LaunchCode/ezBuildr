import fs from 'fs/promises';
import path from 'path';

import { eq } from 'drizzle-orm';
import PizZip from 'pizzip';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '@shared/schema';
import type { ListConfig, ListValue } from '@shared/types/stepConfigs';

import { storageProvider } from '../../server/services/storage/index';
import { versionService } from '../../server/services/VersionService';
import {
  createAuthenticatedAgent,
  setupIntegrationTest,
  type IntegrationTestContext,
} from '../helpers/integrationTestHelper';
import { TestFactory } from '../helpers/testFactory';
// RLS-5: fixture writes and verification reads are the OBSERVER, not the
// application under test — see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";
// RLS-5 recipe step 3: direct service calls get no middleware, so the tenant
// context is entered per test body — a hook entry does not propagate.
import { enterTenantContextForTests } from "../../server/utils/rlsContext";

const FILES_DIR = path.join(process.cwd(), 'server', 'files');

function createDocxBuffer(content: string): Buffer {
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>${content}</w:t></w:r></w:p></w:body>
</w:document>`
  );
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function readDocxText(buffer: Buffer): string {
  const zip = new PizZip(buffer);
  return (zip.file('word/document.xml')?.asText() ?? '').replace(/<[^>]+>/g, '');
}

function makeHouseholdValue(age: number): ListValue {
  return {
    items: [
      {
        itemId: 'member-1',
        values: {
          name: 'Ava Whitmore',
          favoriteColor: 'blue',
          age,
          addresses: {
            items: [
              {
                itemId: 'address-1',
                values: { street: '12 Oak Street' },
              },
            ],
          },
        },
      },
    ],
  };
}

describe.sequential('LIST2-9: list lifecycle', () => {
  let ctx: IntegrationTestContext;
  let agent: ReturnType<typeof createAuthenticatedAgent>;
  let factory: TestFactory;
  const templateFileRefs: string[] = [];
  const generatedStorageKeys: string[] = [];
  const originalValidationMode = process.env.SERVER_FIELD_VALIDATION;

  beforeAll(async () => {
    process.env.SERVER_FIELD_VALIDATION = 'enforce';
    ctx = await setupIntegrationTest({
      tenantName: 'List Lifecycle Tenant',
      createProject: true,
      projectName: 'List Lifecycle Project',
      userRole: 'admin',
      tenantRole: 'owner',
    });
    agent = createAuthenticatedAgent(ctx.baseURL, ctx.authToken);
    factory = new TestFactory();
  });

  afterAll(async () => {
    for (const storageKey of generatedStorageKeys) {
      await storageProvider.deleteFile(storageKey);
    }
    for (const fileRef of templateFileRefs) {
      await fs.unlink(path.join(FILES_DIR, fileRef)).catch(() => { });
    }
    await ctx.cleanup();
    if (originalValidationMode === undefined) {
      delete process.env.SERVER_FIELD_VALIDATION;
    } else {
      process.env.SERVER_FIELD_VALIDATION = originalValidationMode;
    }
  });

  it('creates, saves, validates, completes, and renders a nested list through the real APIs', { timeout: 30_000 }, async () => {

    enterTenantContextForTests(ctx.tenantId);
    const workflowResponse = await agent
      .post('/api/workflows')
      .send({ title: 'List lifecycle workflow', projectId: ctx.projectId });
    expect(workflowResponse.status, JSON.stringify(workflowResponse.body)).toBe(201);
    const workflowId = workflowResponse.body.id as string;

    const pageResponse = await agent
      .post(`/api/workflows/${workflowId}/pages`)
      .send({ title: 'Household details' });
    expect(pageResponse.status, JSON.stringify(pageResponse.body)).toBe(201);
    const pageId = pageResponse.body.id as string;

    const listConfig: ListConfig = {
      fields: [
        {
          kind: 'question',
          id: 'member-name',
          alias: 'name',
          type: 'text',
          title: 'Name',
          order: 0,
          config: { variant: 'short' },
        },
        {
          kind: 'question',
          id: 'favorite-color',
          alias: 'favoriteColor',
          type: 'choice',
          title: 'Favorite color',
          order: 1,
          config: {
            display: 'radio',
            options: {
              type: 'static',
              options: [
                { id: 'blue-option', label: 'Blue', alias: 'blue' },
                { id: 'green-option', label: 'Green', alias: 'green' },
              ],
            },
          },
        },
        {
          kind: 'question',
          id: 'member-age',
          alias: 'age',
          type: 'number',
          title: 'Age',
          order: 2,
          config: { min: 0, max: 10 },
        },
        {
          kind: 'list',
          id: 'member-addresses',
          alias: 'addresses',
          title: 'Addresses',
          order: 3,
          list: {
            fields: [
              {
                kind: 'question',
                id: 'address-street',
                alias: 'street',
                type: 'text',
                title: 'Street',
                order: 0,
                config: { variant: 'short' },
              },
            ],
          },
        },
      ],
    };

    const listStepResponse = await agent
      .post(`/api/workflows/${workflowId}/pages/${pageId}/steps`)
      .send({
        type: 'list',
        title: 'Household members',
        alias: 'household',
        config: listConfig,
      });
    expect(listStepResponse.status, JSON.stringify(listStepResponse.body)).toBe(201);
    expect(listStepResponse.body).toMatchObject({ type: 'list', alias: 'household', config: listConfig });
    const listStepId = listStepResponse.body.id as string;

    const templateFileRef = `list-lifecycle-${Date.now()}.docx`;
    await fs.mkdir(FILES_DIR, { recursive: true });
    await fs.writeFile(
      path.join(FILES_DIR, templateFileRef),
      createDocxBuffer(
        '{{#household}}Member={{name}};{{#addresses}}Address={{street}};{{/addresses}}{{/household}}'
      )
    );
    templateFileRefs.push(templateFileRef);
    const { template } = await factory.createTemplate(ctx.projectId!, ctx.userId, {
      name: 'List lifecycle document',
      fileRef: templateFileRef,
    });

    const finalStepResponse = await agent
      .post(`/api/workflows/${workflowId}/pages/${pageId}/steps`)
      .send({
        type: 'final_documents',
        title: 'Final documents',
        config: {
          markdownHeader: '',
          documents: [
            { id: 'list-document', documentId: template.id, alias: 'household-summary' },
          ],
        },
      });
    expect(finalStepResponse.status, JSON.stringify(finalStepResponse.body)).toBe(201);

    const pinnedVersion = await versionService.createDraftVersion(workflowId, ctx.userId);
    expect(pinnedVersion).not.toBeNull();
    if (pinnedVersion === null) {
      throw new Error('Expected the completed list workflow to produce a draft version');
    }
    await getOwnerDb()
      .update(schema.workflows)
      .set({ currentVersionId: pinnedVersion.id })
      .where(eq(schema.workflows.id, workflowId));

    const runResponse = await agent.post(`/api/workflows/${workflowId}/runs`).send({});
    expect(runResponse.status, JSON.stringify(runResponse.body)).toBe(201);
    const runId = runResponse.body.data.runId as string;
    const runToken = runResponse.body.data.runToken as string;

    const validValue = makeHouseholdValue(9);
    const bulkSaveResponse = await agent
      .post(`/api/runs/${runId}/values/bulk`)
      .send({ values: [{ stepId: listStepId, value: validValue }] });
    expect(bulkSaveResponse.status, JSON.stringify(bulkSaveResponse.body)).toBe(200);

    const readResponse = await request(ctx.baseURL)
      .get(`/api/runs/${runId}/values`)
      .set('Authorization', `Bearer ${runToken}`);
    expect(readResponse.status, JSON.stringify(readResponse.body)).toBe(200);
    const savedValues = readResponse.body.data.values as Array<{ stepId: string; value: unknown }>;
    expect(savedValues.find(value => value.stepId === listStepId)?.value).toStrictEqual(validValue);

    const invalidSubmitResponse = await agent
      .post(`/api/runs/${runId}/pages/${pageId}/submit`)
      .send({ values: [{ stepId: listStepId, value: makeHouseholdValue(99) }] });
    expect(invalidSubmitResponse.status, JSON.stringify(invalidSubmitResponse.body)).toBe(200);
    expect(invalidSubmitResponse.body.success).toBe(false);
    // AC3: the message must name the offending *path*, not just the step, so a
    // respondent can tell which item failed. LIST2-9 originally asserted the
    // pathless `Household members: ...` because the path was discarded at the
    // response boundary; LIST2-15 fixed that, so this now asserts the stronger
    // form the acceptance criterion always wanted.
    expect(invalidSubmitResponse.body.errors).toEqual([
      expect.stringMatching(/^Household members \(household\[0\]\.age\):.*10/),
    ]);

    const validSubmitResponse = await agent
      .post(`/api/runs/${runId}/pages/${pageId}/submit`)
      .send({ values: [{ stepId: listStepId, value: validValue }] });
    expect(validSubmitResponse.status, JSON.stringify(validSubmitResponse.body)).toBe(200);
    expect(validSubmitResponse.body).toMatchObject({ success: true });

    const completeResponse = await request(ctx.baseURL)
      .put(`/api/runs/${runId}/complete`)
      .set('Authorization', `Bearer ${runToken}`);
    expect(completeResponse.status, JSON.stringify(completeResponse.body)).toBe(200);
    expect(completeResponse.body).toMatchObject({ success: true, data: { completed: true } });

    const generateResponse = await request(ctx.baseURL)
      .post(`/api/runs/${runId}/generate-documents`)
      .set('Authorization', `Bearer ${runToken}`);
    expect(generateResponse.status, JSON.stringify(generateResponse.body)).toBe(200);
    expect(generateResponse.body.success).toBe(true);

    const documentsResponse = await request(ctx.baseURL)
      .get(`/api/runs/${runId}/documents`)
      .set('Authorization', `Bearer ${runToken}`);
    expect(documentsResponse.status, JSON.stringify(documentsResponse.body)).toBe(200);
    expect(documentsResponse.body.documents).toHaveLength(1);
    const [document] = documentsResponse.body.documents as Array<{
      fileName: string;
      storageKey: string;
    }>;
    generatedStorageKeys.push(document.storageKey);

    const downloadResponse = await request(ctx.baseURL)
      .get(`/api/runs/${runId}/final-documents/${document.fileName}/download`)
      .set('Authorization', `Bearer ${runToken}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(downloadResponse.status).toBe(200);
    const renderedText = readDocxText(downloadResponse.body as Buffer);
    expect(renderedText).toContain('Member=Ava Whitmore;');
    expect(renderedText).toContain('Address=12 Oak Street;');
  });

  it('serves canonical nested List fields to the runner and validates them on page submit', async () => {
    enterTenantContextForTests(ctx.tenantId);
    const workflowResponse = await agent
      .post('/api/workflows')
      .send({ title: 'Canonical List runner workflow', projectId: ctx.projectId });
    expect(workflowResponse.status, JSON.stringify(workflowResponse.body)).toBe(201);
    const workflowId = workflowResponse.body.id as string;

    const pageResponse = await agent
      .post(`/api/workflows/${workflowId}/pages`)
      .send({ title: 'Visit details' });
    expect(pageResponse.status, JSON.stringify(pageResponse.body)).toBe(201);
    const pageId = pageResponse.body.id as string;

    const listConfig: ListConfig = {
      fields: [
        {
          kind: 'question',
          id: 'visitor-name',
          alias: 'name',
          type: 'text',
          title: 'Name',
          order: 0,
        },
        {
          kind: 'list',
          id: 'visitor-visits',
          alias: 'visits',
          title: 'Visits',
          order: 1,
          list: {
            fields: [
              {
                kind: 'question',
                id: 'visit-date',
                alias: 'date',
                type: 'date_time',
                title: 'Visit date',
                order: 0,
                config: { kind: 'date' },
              },
              {
                kind: 'question',
                id: 'visit-attendees',
                alias: 'attendees',
                type: 'number',
                title: 'Attendees',
                order: 1,
                config: { min: 1, max: 5 },
              },
            ],
          },
        },
      ],
    };

    const listStepResponse = await agent
      .post(`/api/workflows/${workflowId}/pages/${pageId}/steps`)
      .send({
        type: 'list',
        title: 'Visitors',
        alias: 'visitors',
        config: listConfig,
      });
    expect(listStepResponse.status, JSON.stringify(listStepResponse.body)).toBe(201);
    const listStepId = listStepResponse.body.id as string;

    const pinnedVersion = await versionService.createDraftVersion(workflowId, ctx.userId);
    expect(pinnedVersion).not.toBeNull();
    if (pinnedVersion === null) {
      throw new Error('Expected the canonical List workflow to produce a draft version');
    }
    await getOwnerDb()
      .update(schema.workflows)
      .set({ currentVersionId: pinnedVersion.id })
      .where(eq(schema.workflows.id, workflowId));

    const runResponse = await agent.post(`/api/workflows/${workflowId}/runs`).send({});
    expect(runResponse.status, JSON.stringify(runResponse.body)).toBe(201);
    const runId = runResponse.body.data.runId as string;
    const runToken = runResponse.body.data.runToken as string;

    const runtimeResponse = await request(ctx.baseURL)
      .get(`/api/runs/${runId}/runtime`)
      .set('Authorization', `Bearer ${runToken}`);
    expect(runtimeResponse.status, JSON.stringify(runtimeResponse.body)).toBe(200);
    const runtimeStep = (runtimeResponse.body.data.steps as Array<{
      id: string;
      type: string;
      config: ListConfig;
    }>).find((step) => step.id === listStepId);
    expect(runtimeStep).toMatchObject({ type: 'list' });
    expect(runtimeStep?.config.fields[0]).toMatchObject({ kind: 'question', type: 'text' });
    const nestedList = runtimeStep?.config.fields[1];
    expect(nestedList).toMatchObject({ kind: 'list', alias: 'visits' });
    if (nestedList?.kind !== 'list') {
      throw new Error('Expected the runner contract to retain the nested List field');
    }
    expect(nestedList.list.fields).toEqual([
      expect.objectContaining({ kind: 'question', type: 'date_time' }),
      expect.objectContaining({ kind: 'question', type: 'number' }),
    ]);

    const makeValue = (attendees: number): ListValue => ({
      items: [
        {
          itemId: 'visitor-1',
          values: {
            name: 'Ava Whitmore',
            visits: {
              items: [
                {
                  itemId: 'visit-1',
                  values: { date: '2026-08-31', attendees },
                },
              ],
            },
          },
        },
      ],
    });

    const invalidSubmitResponse = await request(ctx.baseURL)
      .post(`/api/runs/${runId}/pages/${pageId}/submit`)
      .set('Authorization', `Bearer ${runToken}`)
      .send({ values: [{ stepId: listStepId, value: makeValue(6) }] });
    expect(invalidSubmitResponse.status, JSON.stringify(invalidSubmitResponse.body)).toBe(200);
    expect(invalidSubmitResponse.body.success).toBe(false);
    expect(invalidSubmitResponse.body.errors).toEqual([
      expect.stringMatching(/^Visitors \(visitors\[0\]\.visits\[0\]\.attendees\):.*5/),
    ]);

    const validValue = makeValue(5);
    const validSubmitResponse = await request(ctx.baseURL)
      .post(`/api/runs/${runId}/pages/${pageId}/submit`)
      .set('Authorization', `Bearer ${runToken}`)
      .send({ values: [{ stepId: listStepId, value: validValue }] });
    expect(validSubmitResponse.status, JSON.stringify(validSubmitResponse.body)).toBe(200);
    expect(validSubmitResponse.body).toMatchObject({ success: true });

    const valuesResponse = await request(ctx.baseURL)
      .get(`/api/runs/${runId}/values`)
      .set('Authorization', `Bearer ${runToken}`);
    expect(valuesResponse.status, JSON.stringify(valuesResponse.body)).toBe(200);
    expect(valuesResponse.body.data.values).toContainEqual(
      expect.objectContaining({ stepId: listStepId, value: validValue }),
    );
  });
});
