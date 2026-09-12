import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { MappingValidator } from '../../server/services/document/MappingValidator';
import { stepService } from '../../server/services/StepService';
import {
  setupIntegrationTest,
  type IntegrationTestContext,
} from '../helpers/integrationTestHelper';
import { TestFactory } from '../helpers/testFactory';
import { expectCrossTenantDenied } from '../helpers/expectDenied';

const OWNER_ITEM_ID = '11111111-1111-4111-8111-111111111111';

describe.sequential('Template mapping normalization', () => {
  let ctx: IntegrationTestContext;
  let otherCtx: IntegrationTestContext;
  let templateId: string;
  let workflowId: string;
  let otherWorkflowId: string;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: 'Template mapping normalization tenant',
      createProject: true,
      userRole: 'admin',
      tenantRole: 'owner',
    });
    otherCtx = await setupIntegrationTest({
      tenantName: 'Foreign template mapping normalization tenant',
      createProject: true,
      userRole: 'admin',
      tenantRole: 'owner',
    });

    if (ctx.projectId === undefined || otherCtx.projectId === undefined) {
      throw new Error('Template mapping normalization tests require projects');
    }

    const factory = new TestFactory();
    const { template } = await factory.createTemplate(ctx.projectId, ctx.userId, {
      metadata: { fields: [] },
    });
    templateId = template.id;

    const ownWorkflow = await factory.createWorkflow(ctx.projectId, ctx.userId);
    workflowId = ownWorkflow.workflow.id;
    const page = await factory.createPage(workflowId);
    await factory.createStep(page.id, {
      workflowId,
      type: 'list',
      alias: 'owners',
      title: 'Owners',
      order: 0,
      config: {
        fields: [
          {
            kind: 'question',
            id: 'owner-name',
            alias: 'ownerName',
            type: 'short_text',
            title: 'Name',
            order: 0,
          },
        ],
        labelTemplate: '{ownerName}',
      },
    });
    await factory.createStep(page.id, {
      workflowId,
      type: 'choice',
      alias: 'favoriteOwner',
      title: 'Favorite owner',
      order: 1,
      config: {
        display: 'dropdown',
        allowMultiple: false,
        options: {
          type: 'list',
          listVariable: 'owners',
          labelPath: 'ownerName',
          valuePath: 'itemId',
        },
      },
    });

    const foreignWorkflow = await factory.createWorkflow(otherCtx.projectId, otherCtx.userId);
    otherWorkflowId = foreignWorkflow.workflow.id;
  });

  afterAll(async () => {
    await otherCtx.cleanup();
    await ctx.cleanup();
  });

  const owners = {
    items: [
      {
        itemId: OWNER_ITEM_ID,
        values: { ownerName: 'Ava Whitmore' },
      },
    ],
  };

  it('validates a mapping onto a list alias with workflow normalization', async () => {
    const response = await request(ctx.baseURL)
      .post(`/api/templates/${templateId}/test-mapping`)
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .send({
        workflowId,
        mapping: { ownerRows: { type: 'variable', source: 'owners' } },
        testData: { owners },
      })
      .expect(200);

    expect(response.body.warnings).toEqual([]);
    expect(response.body.dryRunOutput).toEqual({
      ownerRows: [{ ownerName: 'Ava Whitmore' }],
    });
  });

  it('validates a list-bound choice using its resolved label', async () => {
    const response = await request(ctx.baseURL)
      .post(`/api/templates/${templateId}/test-mapping`)
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .send({
        workflowId,
        mapping: { selectedOwner: { type: 'variable', source: 'favoriteOwner' } },
        testData: { owners, favoriteOwner: OWNER_ITEM_ID },
      })
      .expect(200);

    expect(response.body.warnings).toEqual([]);
    expect(response.body.dryRunOutput).toEqual({ selectedOwner: 'Ava Whitmore' });
  });

  it('preserves the warning-producing legacy result when workflowId is omitted', async () => {
    const response = await request(ctx.baseURL)
      .post(`/api/templates/${templateId}/test-mapping`)
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .send({
        mapping: { ownerRows: { type: 'variable', source: 'owners' } },
        testData: { owners },
      })
      .expect(200);

    expect(MappingValidator.prototype.validateWithTestData.length).toBe(4);
    expect(JSON.stringify(response.body)).toBe(JSON.stringify({
      valid: true,
      errors: [],
      warnings: [{
        type: 'missing_source_variable',
        message: 'Source variable "owners" not found in test data',
        field: 'ownerRows',
        suggestion: 'Add "owners" to test data or change the mapping',
      }],
      coverage: {
        totalTemplateFields: 0,
        mappedFields: 1,
        unmappedFields: [],
        unusedSources: [],
        coveragePercentage: 0,
      },
      typeMismatches: [],
      dryRunSuccess: true,
      dryRunOutput: {},
    }));
  });

  it('rejects a foreign workflow before either endpoint reads its steps', async () => {
    const getStepsSpy = vi.spyOn(stepService, 'getWorkflowSteps');

    try {
      await request(ctx.baseURL)
        .post(`/api/templates/${templateId}/test-mapping`)
        .set('Authorization', `Bearer ${ctx.authToken}`)
        .send({
          workflowId: otherWorkflowId,
          mapping: { ownerRows: { type: 'variable', source: 'owners' } },
          testData: { owners },
        })
        .then((r) => { expectCrossTenantDenied(r.status); });

      await request(ctx.baseURL)
        .post(`/api/templates/${templateId}/preview`)
        .set('Authorization', `Bearer ${ctx.authToken}`)
        .send({ workflowId: otherWorkflowId, sampleData: { owners } })
        .then((r) => { expectCrossTenantDenied(r.status); });

      expect(getStepsSpy).not.toHaveBeenCalled();
    } finally {
      getStepsSpy.mockRestore();
    }
  });
});
