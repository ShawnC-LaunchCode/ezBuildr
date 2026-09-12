import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '@shared/schema';
import type { ListConfig, ListValue } from '@shared/types/stepConfigs';

import {
  createAuthenticatedAgent,
  createTestUser,
  setupIntegrationTest,
  type IntegrationTestContext,
} from '../helpers/integrationTestHelper';
import { getOwnerDb } from '../helpers/ownerDb';
import { expectCrossTenantDenied } from '../helpers/expectDenied';

/**
 * CLN-3 / LIST-B15: a `list` question as a List Tools source.
 *
 * Preferred fix normalizes ONLY at `ListToolsBlockRunner`'s input boundary
 * (`shared/listPipeline.ts`'s `listValueToListVariable`) — nothing upstream
 * (block context, `RunDataService`) projects the `ListValue` envelope, so
 * this proof also asserts the source step's OWN persisted value is still the
 * raw envelope after the block runs: that is what "conditional logic,
 * documents and Code Blocks still receive the raw ListValue" (AC4) cashes out
 * to, since every one of those consumers reads from `stepValues` via
 * `RunDataService`/`getRunValues`, not from the block's local working copy.
 *
 * Real, not mocked: the DB, `RunExecutionCoordinator` (via the real HTTP
 * routes) and `ListToolsBlockRunner`.
 */
describe.sequential('LIST-B15: list question as a List Tools source', () => {
  let ctx: IntegrationTestContext;
  let agent: ReturnType<typeof createAuthenticatedAgent>;
  let workflowId: string;
  let pageId: string;
  let listStepId: string;
  let virtualStepId: string;
  let foreignTenantId: string;
  let foreignToken: string;

  const LIST_CONFIG: ListConfig = {
    fields: [
      { kind: 'question', id: 'field-first-name', alias: 'first_name', type: 'text', title: 'First name', order: 0 },
      { kind: 'question', id: 'field-age', alias: 'age', type: 'number', title: 'Age', order: 1 },
    ],
  };

  const SUBMITTED_LIST_VALUE: ListValue = {
    items: [
      { itemId: 'm-1', values: { first_name: 'Alice', age: 30 } },
      { itemId: 'm-2', values: { first_name: 'Bob', age: 17 } },
      { itemId: 'm-3', values: { first_name: 'Cara', age: 42 } },
    ],
  };

  beforeAll(async () => {
    ctx = await setupIntegrationTest({ tenantName: 'LIST-B15', createProject: true });
    agent = createAuthenticatedAgent(ctx.baseURL, ctx.authToken);

    const created = await agent.post('/api/workflows')
      .send({ title: `List source workflow ${nanoid()}`, projectId: ctx.projectId }).expect(201);
    workflowId = created.body.id as string;

    const [page] = await getOwnerDb().insert(schema.pages).values({
      workflowId, title: 'Team', order: 0,
    }).returning();
    pageId = page.id;

    const [listStep] = await getOwnerDb().insert(schema.steps).values({
      workflowId,
      pageId,
      type: 'list',
      title: 'Team members',
      alias: 'team_members',
      required: false,
      order: 0,
      config: LIST_CONFIG,
    }).returning();
    listStepId = listStep.id;

    // Workflow-scoped (pageId omitted) so it runs on every onNext regardless
    // of the current page — this is the shape the Choice editor's
    // convert-to-List-Tools action already produces in the field.
    const block = await agent.post(`/api/workflows/${workflowId}/blocks`)
      .send({
        type: 'list_tools',
        phase: 'onNext',
        name: 'Adults',
        config: {
          sourceListVar: 'team_members',
          outputListVar: 'filtered',
          filters: {
            combinator: 'and',
            rules: [{ fieldPath: 'age', op: 'gte', value: 18, valueSource: 'const' }],
          },
        },
      }).expect(201);
    virtualStepId = block.body.data.virtualStepId as string;

    const [foreignTenant] = await getOwnerDb().insert(schema.tenants)
      .values({ name: `LIST-B15 foreign ${nanoid()}`, plan: 'pro' }).returning();
    foreignTenantId = foreignTenant.id;
    foreignToken = (await createTestUser(ctx, 'owner', foreignTenantId)).token;
  });

  afterAll(async () => {
    await getOwnerDb().delete(schema.users).where(eq(schema.users.tenantId, foreignTenantId));
    await getOwnerDb().delete(schema.tenants).where(eq(schema.tenants.id, foreignTenantId));
    await getOwnerDb().delete(schema.workflows).where(eq(schema.workflows.id, workflowId));
    await ctx.cleanup();
  });

  async function outputValue(runId: string) {
    const rows = await getOwnerDb().select().from(schema.stepValues)
      .where(and(eq(schema.stepValues.runId, runId), eq(schema.stepValues.stepId, virtualStepId)));
    return rows[0]?.value as { rows: Array<Record<string, unknown>>; count: number } | undefined;
  }

  async function sourceValue(runId: string) {
    const rows = await getOwnerDb().select().from(schema.stepValues)
      .where(and(eq(schema.stepValues.runId, runId), eq(schema.stepValues.stepId, listStepId)));
    return rows[0]?.value;
  }

  it('filters a list question source, preserves itemId, and leaves the raw ListValue untouched for every other consumer', async () => {
    const runResponse = await agent.post(`/api/workflows/${workflowId}/runs`).send({}).expect(201);
    const runId = runResponse.body.data.runId as string;
    const token = runResponse.body.data.runToken as string;

    const submit = await request(ctx.baseURL)
      .post(`/api/runs/${runId}/pages/${pageId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ values: [{ stepId: listStepId, value: SUBMITTED_LIST_VALUE }] })
      .expect(200);
    expect(submit.body.success).toBe(true);

    await request(ctx.baseURL)
      .post(`/api/runs/${runId}/next`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);

    // AC1: the block accepted the ListValue and filtered by age >= 18.
    // Bob (17) is excluded; Alice (30) and Cara (42) survive with itemId intact.
    const filtered = await outputValue(runId);
    expect(filtered?.count).toBe(2);
    expect(filtered?.rows).toEqual([
      { id: 'm-1', itemId: 'm-1', first_name: 'Alice', age: 30 },
      { id: 'm-3', itemId: 'm-3', first_name: 'Cara', age: 42 },
    ]);

    // AC4: the source step's OWN persisted value is the untouched envelope —
    // normalization happened only inside the runner's local working copy, so
    // conditional logic, document list loops and Code Blocks reading this same
    // step still see `{ items: [...] }`, not rows.
    expect(await sourceValue(runId)).toEqual(SUBMITTED_LIST_VALUE);
  });

  it('cross-tenant denial: a foreign tenant cannot submit to this run, and no filtered value is written', async () => {
    const runResponse = await agent.post(`/api/workflows/${workflowId}/runs`).send({}).expect(201);
    const runId = runResponse.body.data.runId as string;

    const denied = await request(ctx.baseURL)
      .post(`/api/runs/${runId}/pages/${pageId}/submit`)
      .set('Authorization', `Bearer ${foreignToken}`)
      .send({ values: [{ stepId: listStepId, value: SUBMITTED_LIST_VALUE }] });
    expectCrossTenantDenied(denied.status);

    const deniedNext = await request(ctx.baseURL)
      .post(`/api/runs/${runId}/next`)
      .set('Authorization', `Bearer ${foreignToken}`)
      .send({});
    expectCrossTenantDenied(deniedNext.status);

    expect(await sourceValue(runId)).toBeUndefined();
    expect(await outputValue(runId)).toBeUndefined();
  });
});
