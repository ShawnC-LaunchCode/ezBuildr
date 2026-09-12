import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import * as schema from '@shared/schema';
import type { JsQuestionConfig } from '@shared/types/steps';

import { runLifecycleService } from '../../server/services/workflow-runs/RunLifecycleService';
import * as sandbox from '../../server/utils/enhancedSandboxExecutor';
import { buildTestWhen } from '../helpers/conditionFixtures';
import { createAuthenticatedAgent, setupIntegrationTest, type IntegrationTestContext } from '../helpers/integrationTestHelper';
import { getOwnerDb } from '../helpers/ownerDb';

/**
 * CB-3 AC 3-7. The eligibility table itself (AC 1, 2) and the triggerPageId
 * validation (AC 8) are proven without a database in
 * tests/unit/services/codeBlocks/firingPolicy.test.ts; this file proves the
 * parts that only exist once a real run, a real database and the real sandbox
 * are involved.
 *
 * Every assertion about "did it fire?" counts SANDBOX EXECUTIONS rather than
 * reading the stored value. A re-fire and a skip leave byte-identical output
 * whenever the inputs have not moved, so a value assertion passes in both
 * directions and proves nothing -- which is exactly what AC 3, 4 and 6 are
 * about.
 */
describe.sequential('CB-3 Code Block firing: trigger x repeat', () => {
  let ctx: IntegrationTestContext;
  let agent: ReturnType<typeof createAuthenticatedAgent>;
  const workflowIds: string[] = [];

  beforeAll(async () => {
    ctx = await setupIntegrationTest({ tenantName: 'CB-3 firing', createProject: true });
    agent = createAuthenticatedAgent(ctx.baseURL, ctx.authToken);
  });

  afterEach(() => { vi.restoreAllMocks(); });
  afterAll(async () => {
    for (const id of workflowIds) {
      await getOwnerDb().delete(schema.workflows).where(eq(schema.workflows.id, id));
    }
    await ctx.cleanup();
  });

  /**
   * Two input pages, one block page. The block reads `amount` (page 1) and
   * `rate` (page 2), so it is unready until page 2 is submitted -- which lets
   * every test below choose when it first becomes eligible AND ready.
   */
  async function fixture(config: Partial<JsQuestionConfig> = {}, hideMarkerWhenTotalIs?: number) {
    const created = await agent.post('/api/workflows')
      .send({ title: `Firing proof ${nanoid()}`, projectId: ctx.projectId }).expect(201);
    const workflowId = created.body.id as string;
    workflowIds.push(workflowId);

    const pages = await getOwnerDb().insert(schema.pages).values(
      [1, 2, 3].map(order => ({ workflowId, title: `Page ${order}`, order }))
    ).returning();

    const inputs = await getOwnerDb().insert(schema.steps).values([
      { workflowId, pageId: pages[0].id, type: 'number' as const, title: 'Amount', alias: 'amount', order: 1 },
      { workflowId, pageId: pages[1].id, type: 'number' as const, title: 'Rate', alias: 'rate', order: 1 },
      { workflowId, pageId: pages[2].id, type: 'text' as const, title: 'Marker', alias: 'marker', order: 5 },
    ]).returning();

    const fullConfig: JsQuestionConfig = {
      code: 'emit({ total: input.amount * input.rate });',
      inputs: [{ key: 'amount', required: true }, { key: 'rate', required: true }],
      outputs: [{ key: 'total', type: 'number' }],
      ...config,
    };
    const blockResponse = await agent.post(`/api/pages/${pages[2].id}/steps`)
      .send({ type: 'js_question', title: 'Firing calculation', config: fullConfig }).expect(201);
    const blockId = blockResponse.body.id as string;

    const [output] = await getOwnerDb().select().from(schema.steps)
      .where(and(eq(schema.steps.workflowId, workflowId), eq(schema.steps.alias, 'total')));

    // The rule must exist BEFORE the run is created: a run resolves its
    // definition (pages, steps, logic rules) once at creation, so a rule
    // inserted afterwards is invisible to that run's navigation.
    if (hideMarkerWhenTotalIs !== undefined) {
      await getOwnerDb().insert(schema.logicRules).values({
        workflowId,
        conditionStepId: output.id,
        when: buildTestWhen(output.id, 'equals', hideMarkerWhenTotalIs),
        targetType: 'step',
        targetStepId: inputs.find(step => step.alias === 'marker')!.id,
        action: 'hide',
      });
    }

    const runResponse = await agent.post(`/api/workflows/${workflowId}/runs`).send({}).expect(201);
    const runId = runResponse.body.data.runId as string;
    const token = runResponse.body.data.runToken as string;

    async function submit(page: number, answers: Record<string, unknown>): Promise<void> {
      const values = Object.entries(answers).map(([alias, value]) => ({
        stepId: inputs.find(step => step.alias === alias)!.id, value,
      }));
      const response = await request(ctx.baseURL)
        .post(`/api/runs/${runId}/pages/${pages[page - 1].id}/submit`)
        .set('Authorization', `Bearer ${token}`).send({ values }).expect(200);
      expect(response.body.success).toBe(true);
    }
    async function saveValue(alias: string, value: unknown) {
      // Autosave endpoint: persists a value WITHOUT running the submit sweep,
      // so a block can be left ready-but-unfired going into next().
      return request(ctx.baseURL).post(`/api/runs/${runId}/values`)
        .set('Authorization', `Bearer ${token}`)
        .send({ stepId: inputs.find(step => step.alias === alias)!.id, value })
        .expect(200);
    }
    async function next(fromPage: number | null) {
      return request(ctx.baseURL).post(`/api/runs/${runId}/next`)
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPageId: fromPage === null ? null : pages[fromPage - 1].id })
        .expect(200);
    }
    async function state() {
      const rows = await getOwnerDb().select().from(schema.codeBlockRuns)
        .where(and(eq(schema.codeBlockRuns.runId, runId), eq(schema.codeBlockRuns.stepId, blockId)));
      return rows[0];
    }
    async function outputValue() {
      const rows = await getOwnerDb().select().from(schema.stepValues)
        .where(and(eq(schema.stepValues.runId, runId), eq(schema.stepValues.stepId, output.id)));
      return rows[0]?.value;
    }
    return { workflowId, pages, inputs, output, blockId, runId, token, submit, saveValue, next, state, outputValue };
  }

  it('AC 6: a clean run through every call site performs ZERO sandbox executions', async () => {
    const f = await fixture();
    await f.submit(1, { amount: 10 });
    await f.submit(2, { rate: 3 });
    expect(await f.outputValue()).toBe(30);

    // Everything is settled. Now sweep every wired evaluation point again with
    // nothing changed. CB-2's change gate makes each one a no-op, which is what
    // makes it safe to call recompute from all of them (Decisions 6).
    const executions = vi.spyOn(sandbox, 'executeCodeWithHelpers');
    await f.submit(1, { amount: 10 });   // submitPage, identical answer
    await f.next(1);                     // navigation
    await f.next(2);                     // navigation again
    await request(ctx.baseURL).post(`/api/runs/${f.runId}/resume`)
      .send({ token: 'not-a-real-token' });                       // resume landing (rejected, still no execution)
    await runLifecycleService.executeOnRunStart(f.runId, f.workflowId); // runStart point

    expect(executions).toHaveBeenCalledTimes(0);
    expect(await f.outputValue()).toBe(30);
  });

  it('AC 3: repeat "once" fires exactly once and a later input change does not re-fire it', async () => {
    const f = await fixture({ repeat: 'once' });
    const executions = vi.spyOn(sandbox, 'executeCodeWithHelpers');

    await f.submit(1, { amount: 10 });
    await f.submit(2, { rate: 3 });
    expect(executions).toHaveBeenCalledTimes(1);
    const frozen = await f.outputValue();
    expect(frozen).toBe(30);

    // A real change to a REQUIRED input. Under `onChange` this re-fires; under
    // `once` it must not, or every generated id, timestamp and captured rate
    // drifts whenever an unrelated answer moves.
    await f.submit(1, { amount: 999 });
    expect(executions).toHaveBeenCalledTimes(1);
    expect(await f.outputValue()).toBe(frozen);
    expect((await f.state()).status).toBe('skipped_unchanged');
  });

  it('AC 4: repeat "always" fires at every eligible evaluation even when the hash is unchanged', async () => {
    const f = await fixture({ repeat: 'always' });
    await f.submit(1, { amount: 10 });
    await f.submit(2, { rate: 3 });

    const executions = vi.spyOn(sandbox, 'executeCodeWithHelpers');
    await f.submit(1, { amount: 10 });  // identical answer: hash cannot have moved
    expect(executions).toHaveBeenCalledTimes(1);
    await f.next(1);
    expect(executions).toHaveBeenCalledTimes(2);
  });

  it('AC 5: trigger "runStart" fires at run creation, with no page context', async () => {
    // No required inputs: the point of runStart is inbound/prefill data before
    // any page exists to submit. Run creation itself is the evaluation point --
    // `RunService.createRun` calls `executeOnRunStart`, so by the time the
    // fixture returns the block has already fired without any page being
    // submitted. That is the claim, so it is asserted directly rather than by
    // driving the point a second time.
    const f = await fixture({
      code: 'emit({ total: 7 });',
      inputs: [],
      trigger: 'runStart',
    });

    expect(await f.outputValue()).toBe(7);
    expect((await f.state()).status).toBe('fired');
  });

  it('AC 5 (negative): a runStart block is NOT eligible at a page submit', async () => {
    const f = await fixture({ code: 'emit({ total: 7 });', inputs: [], trigger: 'runStart' });
    // It already fired at creation (above). A page submit must not be an
    // eligible point for it, so no FURTHER execution may happen here -- which
    // is what distinguishes "runStart only" from "everySubmit".
    const executions = vi.spyOn(sandbox, 'executeCodeWithHelpers');

    await f.submit(1, { amount: 10 });
    await f.next(1);

    expect(executions).toHaveBeenCalledTimes(0);
  });

  it('AC 7: a value computed during submit is visible to navigation on the SAME submit', async () => {
    // Hide `marker` once `total` reaches 30. The rule reads the block's OUTPUT
    // step, so it can only hide if the block fired BEFORE navigation was
    // computed on the same request rather than one request later.
    const f = await fixture({}, 30);
    const marker = f.inputs.find(step => step.alias === 'marker')!;

    // Control: before the value exists the marker is visible. Without this the
    // assertion below would pass even if the step were hidden for an unrelated
    // reason.
    await f.submit(1, { amount: 10 });
    const before = await f.next(1);
    const visibleBefore = before.body.data?.visibleSteps ?? before.body.visibleSteps;
    expect(visibleBefore).toContain(marker.id);

    // This submit supplies the block's last input.
    await f.submit(2, { rate: 3 });
    expect(await f.outputValue()).toBe(30);
    const after = await f.next(2);
    const visibleAfter = after.body.data?.visibleSteps ?? after.body.visibleSteps;
    expect(visibleAfter).not.toContain(marker.id);
  });

  it('AC 7 (ordering): the sweep runs BEFORE navigation, so a value computed in next() gates that same response', async () => {
    // The autosave path persists inputs without running the submit sweep, so
    // the block enters next() ready but unfired. That is the only shape where
    // the ORDER of the two calls inside next() is observable: fire-then-navigate
    // hides the marker in THIS response, navigate-then-fire hides it only in the
    // next one. Without this test the ordering can be inverted and every other
    // test still passes -- verified by mutation.
    const f = await fixture({}, 30);
    const marker = f.inputs.find(step => step.alias === 'marker')!;

    await f.saveValue('amount', 10);
    await f.saveValue('rate', 3);
    expect(await f.outputValue()).toBeUndefined();   // nothing has fired yet

    const response = await f.next(1);

    expect(await f.outputValue()).toBe(30);
    const visible = response.body.data?.visibleSteps ?? response.body.visibleSteps;
    expect(visible).not.toContain(marker.id);
  });
});
