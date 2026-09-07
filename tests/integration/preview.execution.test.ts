/**
 * CB-9a-2: preview submissions are authoritative and replay-safe.
 *
 * The defect this closes: one user action ("Next") is TWO requests — submit,
 * then next — and both called `evaluateAll(..., 'submit', ...)`. Every
 * `repeat: 'always'` block therefore fired twice per action, and the second
 * pass could overwrite a `fired` state with `skipped_unchanged` before the
 * client had read it.
 *
 * The fix is a shared logical-operation boundary, not a change to what
 * `onChange` means, so the tests below assert the boundary directly: the same
 * `submissionKey` across submit and next evaluates once, a retry replays a
 * stored response rather than executing, and a NEW key still evaluates per the
 * block's repeat policy. Every scenario is run over real HTTP against a real
 * database, and the preview cases are paired with ordinary-run controls so a
 * change that broke live behaviour fails rather than passes.
 */
import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import * as schema from '@shared/schema';

import { codeBlockService } from '../../server/services/codeBlocks/CodeBlockService';
import { createAuthenticatedAgent, setupIntegrationTest, type IntegrationTestContext } from '../helpers/integrationTestHelper';
import { getOwnerDb } from '../helpers/ownerDb';

describe.sequential('CB-9a-2 preview execution', () => {
  let ctx: IntegrationTestContext;
  let agent: ReturnType<typeof createAuthenticatedAgent>;
  const workflows: string[] = [];

  beforeAll(async () => {
    ctx = await setupIntegrationTest({ tenantName: 'CB-9a-2 execution', createProject: true });
    agent = createAuthenticatedAgent(ctx.baseURL, ctx.authToken);
  });
  afterEach(() => { vi.restoreAllMocks(); });
  afterAll(async () => {
    for (const id of workflows) { await getOwnerDb().delete(schema.workflows).where(eq(schema.workflows.id, id)); }
    await ctx.cleanup();
  });

  /**
   * Three pages. Page 1 asks for adults, page 2 for children, page 3 is a
   * plain confirmation. One Code Block reads BOTH counts, so it is
   * `skipped_unready` after page 1, `fired` after page 2, and — with nothing
   * moved — `skipped_unchanged` after page 3.
   */
  async function threePageFixture(repeat: 'onChange' | 'always' = 'onChange'): Promise<{
    workflowId: string; pages: string[]; adults: string; children: string; blockId: string;
  }> {
    const created = await agent.post('/api/workflows')
      .send({ title: `Preview execution ${randomUUID()}`, projectId: ctx.projectId }).expect(201);
    const workflowId = created.body.id as string;
    workflows.push(workflowId);

    const [firstPage] = await getOwnerDb().select().from(schema.pages).where(eq(schema.pages.workflowId, workflowId));
    const second = await agent.post(`/api/workflows/${workflowId}/pages`).send({ title: 'Children' }).expect(201);
    const third = await agent.post(`/api/workflows/${workflowId}/pages`).send({ title: 'Confirm' }).expect(201);
    const pages = [firstPage.id, second.body.id as string, third.body.id as string];

    const adults = await agent.post(`/api/pages/${pages[0]}/steps`)
      .send({ type: 'number', title: 'Adults', alias: 'num_adults', config: {} }).expect(201);
    const children = await agent.post(`/api/pages/${pages[1]}/steps`)
      .send({ type: 'number', title: 'Children', alias: 'num_children', config: {} }).expect(201);

    const block = await agent.post(`/api/pages/${pages[1]}/steps`).send({
      type: 'js_question', title: 'Party size', alias: 'partySizeBlock',
      config: {
        code: 'emit({ party_size: input.num_adults + input.num_children });',
        inputs: [{ key: 'num_adults', required: true }, { key: 'num_children', required: true }],
        outputs: [{ key: 'party_size', type: 'number' }],
        repeat,
      },
    }).expect(201);

    return { workflowId, pages, adults: adults.body.id as string, children: children.body.id as string, blockId: block.body.id as string };
  }

  async function preview(workflowId: string): Promise<string> {
    const response = await agent.post(`/api/workflows/${workflowId}/preview-runs`).send({}).expect(201);
    return response.body.runId as string;
  }

  async function blockState(runId: string, stepId: string): Promise<schema.CodeBlockRun | undefined> {
    const [row] = await getOwnerDb().select().from(schema.codeBlockRuns)
      .where(and(eq(schema.codeBlockRuns.runId, runId), eq(schema.codeBlockRuns.stepId, stepId)));
    return row;
  }

  /** One logical submission: submit and its paired next share a key. */
  async function submitAndAdvance(runId: string, pageId: string, values: Array<{ stepId: string; value: unknown }>, key = randomUUID()): Promise<{ key: string }> {
    await agent.post(`/api/runs/${runId}/pages/${pageId}/submit`).send({ values, submissionKey: key }).expect(200);
    await agent.post(`/api/runs/${runId}/next`).send({ submissionKey: key }).expect(200);
    return { key };
  }

  it('moves a block through skipped_unready → fired → skipped_unchanged across three pages', async () => {
    const { workflowId, pages, adults, children, blockId } = await threePageFixture();
    const runId = await preview(workflowId);

    await submitAndAdvance(runId, pages[0], [{ stepId: adults, value: 2 }]);
    const afterPageOne = await blockState(runId, blockId);
    expect(afterPageOne?.status).toBe('skipped_unready');
    expect(afterPageOne?.pendingInputs).toEqual(['num_children']);

    await submitAndAdvance(runId, pages[1], [{ stepId: children, value: 3 }]);
    const afterPageTwo = await blockState(runId, blockId);
    expect(afterPageTwo?.status).toBe('fired');
    expect(afterPageTwo?.firedAt).not.toBeNull();
    const [output] = await getOwnerDb().select().from(schema.steps)
      .where(and(eq(schema.steps.workflowId, workflowId), eq(schema.steps.alias, 'party_size')));
    const [value] = await getOwnerDb().select().from(schema.stepValues)
      .where(and(eq(schema.stepValues.runId, runId), eq(schema.stepValues.stepId, output.id)));
    expect(value.value).toBe(5);

    await submitAndAdvance(runId, pages[2], []);
    const afterPageThree = await blockState(runId, blockId);
    expect(afterPageThree?.status).toBe('skipped_unchanged');
    // The fired result survives the third submission rather than being erased.
    expect(afterPageThree?.firedAt).not.toBeNull();
  });

  it('produces identical results for a preview and an ordinary run on the same pure inputs', async () => {
    const { workflowId, pages, adults, children, blockId } = await threePageFixture();
    const previewRun = await preview(workflowId);
    const liveResponse = await agent.post(`/api/workflows/${workflowId}/runs`).send({}).expect(201);
    const liveRun = liveResponse.body.data.runId as string;

    for (const runId of [previewRun, liveRun]) {
      await submitAndAdvance(runId, pages[0], [{ stepId: adults, value: 4 }]);
      await submitAndAdvance(runId, pages[1], [{ stepId: children, value: 1 }]);
    }

    const previewState = await blockState(previewRun, blockId);
    const liveState = await blockState(liveRun, blockId);
    expect(previewState?.status).toBe(liveState?.status);
    expect(previewState?.inputHash).toBe(liveState?.inputHash);
    expect(previewState?.pendingInputs).toEqual(liveState?.pendingInputs);

    const [output] = await getOwnerDb().select().from(schema.steps)
      .where(and(eq(schema.steps.workflowId, workflowId), eq(schema.steps.alias, 'party_size')));
    const values = await getOwnerDb().select().from(schema.stepValues).where(eq(schema.stepValues.stepId, output.id));
    const byRun = Object.fromEntries(values.map(row => [row.runId, row.value]));
    expect(byRun[previewRun]).toBe(5);
    expect(byRun[liveRun]).toBe(5);
  });

  it('evaluates ONCE per logical submission, so an always block cannot double-fire', async () => {
    const { workflowId, pages, adults, children, blockId } = await threePageFixture('always');
    const runId = await preview(workflowId);
    await submitAndAdvance(runId, pages[0], [{ stepId: adults, value: 1 }]);

    const evaluate = vi.spyOn(codeBlockService, 'evaluate');
    await submitAndAdvance(runId, pages[1], [{ stepId: children, value: 1 }]);
    // Submit evaluated; the paired next must not evaluate the same submission
    // again. Before CB-9a-2 this was 2 for one user action.
    expect(evaluate.mock.calls.filter(call => call[1].id === blockId)).toHaveLength(1);
    expect((await blockState(runId, blockId))?.status).toBe('fired');
  });

  it('still evaluates a NEW submission, so repeat policy is unchanged', async () => {
    const { workflowId, pages, adults, children, blockId } = await threePageFixture('always');
    const runId = await preview(workflowId);
    await submitAndAdvance(runId, pages[0], [{ stepId: adults, value: 1 }]);
    await submitAndAdvance(runId, pages[1], [{ stepId: children, value: 1 }]);

    const evaluate = vi.spyOn(codeBlockService, 'evaluate');
    // A genuinely new user action with unchanged inputs: `always` must fire.
    await agent.post(`/api/runs/${runId}/pages/${pages[1]}/submit`)
      .send({ values: [{ stepId: children, value: 1 }], submissionKey: randomUUID() }).expect(200);
    expect(evaluate.mock.calls.filter(call => call[1].id === blockId)).toHaveLength(1);
    expect((await blockState(runId, blockId))?.status).toBe('fired');
  });

  it('replays a lost response instead of executing again', async () => {
    const { workflowId, pages, adults, blockId } = await threePageFixture('always');
    const runId = await preview(workflowId);
    const key = randomUUID();

    const first = await agent.post(`/api/runs/${runId}/pages/${pages[0]}/submit`)
      .send({ values: [{ stepId: adults, value: 7 }], submissionKey: key }).expect(200);

    const evaluate = vi.spyOn(codeBlockService, 'evaluate');
    // The client never saw the response and retries the same key.
    const replay = await agent.post(`/api/runs/${runId}/pages/${pages[0]}/submit`)
      .send({ values: [{ stepId: adults, value: 7 }], submissionKey: key }).expect(200);

    expect(replay.body).toEqual(first.body);
    expect(evaluate.mock.calls.filter(call => call[1].id === blockId)).toHaveLength(0);
    const submissions = await getOwnerDb().select().from(schema.runSubmissions).where(eq(schema.runSubmissions.runId, runId));
    expect(submissions).toHaveLength(1);
    expect(submissions[0].status).toBe('succeeded');
  });

  it('replays a retried next rather than navigating twice', async () => {
    const { workflowId, pages, adults } = await threePageFixture();
    const runId = await preview(workflowId);
    const key = randomUUID();
    await agent.post(`/api/runs/${runId}/pages/${pages[0]}/submit`)
      .send({ values: [{ stepId: adults, value: 2 }], submissionKey: key }).expect(200);
    const first = await agent.post(`/api/runs/${runId}/next`).send({ submissionKey: key }).expect(200);
    const replay = await agent.post(`/api/runs/${runId}/next`).send({ submissionKey: key }).expect(200);
    expect(replay.body.data).toEqual(first.body.data);
  });

  it('refuses a concurrent duplicate rather than executing it twice', async () => {
    const { workflowId, pages, adults } = await threePageFixture('always');
    const runId = await preview(workflowId);
    const key = randomUUID();
    const body = { values: [{ stepId: adults, value: 3 }], submissionKey: key };

    const [a, b] = await Promise.all([
      agent.post(`/api/runs/${runId}/pages/${pages[0]}/submit`).send(body),
      agent.post(`/api/runs/${runId}/pages/${pages[0]}/submit`).send(body),
    ]);
    const statuses = [a.status, b.status].sort();
    // Exactly one wins. The loser is refused -- either by the submission
    // boundary or by 9a-1's preview operation lease; both are serialization,
    // and neither executes a second time.
    expect(statuses[0]).toBe(200);
    expect(statuses[1]).not.toBe(200);
    const submissions = await getOwnerDb().select().from(schema.runSubmissions).where(eq(schema.runSubmissions.runId, runId));
    expect(submissions).toHaveLength(1);
  });

  it('records a failed validation once and replays the same failure', async () => {
    const { workflowId, pages, adults } = await threePageFixture();
    await getOwnerDb().update(schema.steps).set({ required: true }).where(eq(schema.steps.id, adults));
    const runId = await preview(workflowId);
    const key = randomUUID();

    const first = await agent.post(`/api/runs/${runId}/pages/${pages[0]}/submit`)
      .send({ values: [], submissionKey: key }).expect(200);
    expect(first.body.success).toBe(false);
    expect(first.body.errors.join(' ')).toContain('Adults');

    const replay = await agent.post(`/api/runs/${runId}/pages/${pages[0]}/submit`)
      .send({ values: [], submissionKey: key }).expect(200);
    expect(replay.body).toEqual(first.body);
    const [row] = await getOwnerDb().select().from(schema.runSubmissions).where(eq(schema.runSubmissions.runId, runId));
    expect(row.status).toBe('failed');
  });

  it('leaves the standalone next contract evaluating, exactly as before', async () => {
    const { workflowId, pages, adults, children, blockId } = await threePageFixture('always');
    const runId = await preview(workflowId);
    await agent.post(`/api/runs/${runId}/pages/${pages[0]}/submit`).send({ values: [{ stepId: adults, value: 1 }] }).expect(200);
    await agent.post(`/api/runs/${runId}/next`).send({}).expect(200);
    await agent.post(`/api/runs/${runId}/pages/${pages[1]}/submit`).send({ values: [{ stepId: children, value: 1 }] }).expect(200);

    const evaluate = vi.spyOn(codeBlockService, 'evaluate');
    // No key anywhere: `next` must still evaluate, which is what every
    // pre-CB-9a-2 caller depends on.
    await agent.post(`/api/runs/${runId}/next`).send({}).expect(200);
    expect(evaluate.mock.calls.filter(call => call[1].id === blockId).length).toBeGreaterThan(0);
  });

  it('returns answers, block states and navigation from ONE logical submission', async () => {
    const { workflowId, pages, adults, children, blockId } = await threePageFixture();
    const runId = await preview(workflowId);
    await submitAndAdvance(runId, pages[0], [{ stepId: adults, value: 2 }]);

    const key = randomUUID();
    const response = await agent.post(`/api/runs/${runId}/pages/${pages[1]}/advance`)
      .send({ values: [{ stepId: children, value: 3 }], submissionKey: key }).expect(200);

    const data = response.body.data;
    expect(data.success).toBe(true);
    expect(data.submissionKey).toBe(key);
    // Committed answers, from the server rather than the client's optimistic copy.
    expect(data.values[children]).toBe(3);
    expect(data.values[adults]).toBe(2);
    // Computed output, in the same response that produced it.
    const [output] = await getOwnerDb().select().from(schema.steps)
      .where(and(eq(schema.steps.workflowId, workflowId), eq(schema.steps.alias, 'party_size')));
    expect(data.values[output.id]).toBe(5);
    // Block states, so the client never has to infer readiness.
    const block = data.blockStates.find((state: { stepId: string }) => state.stepId === blockId);
    expect(block).toMatchObject({ status: 'fired', pendingInputs: [] });
    expect(block.firedAt).not.toBeNull();
    // Authoritative navigation, in the same answer.
    expect(data.navigation.nextPageId).toBe(pages[2]);
  });

  it('advance evaluates once and replays on retry, like the pair it replaces', async () => {
    const { workflowId, pages, adults, blockId } = await threePageFixture('always');
    const runId = await preview(workflowId);
    const key = randomUUID();
    const body = { values: [{ stepId: adults, value: 6 }], submissionKey: key };

    const first = await agent.post(`/api/runs/${runId}/pages/${pages[0]}/advance`).send(body).expect(200);
    const evaluate = vi.spyOn(codeBlockService, 'evaluate');
    const replay = await agent.post(`/api/runs/${runId}/pages/${pages[0]}/advance`).send(body).expect(200);

    expect(evaluate.mock.calls.filter(call => call[1].id === blockId)).toHaveLength(0);
    expect(replay.body.data.navigation).toEqual(first.body.data.navigation);
    expect(replay.body.data.values).toEqual(first.body.data.values);
  });

  it('advance reports a validation failure without navigating', async () => {
    const { workflowId, pages, adults } = await threePageFixture();
    await getOwnerDb().update(schema.steps).set({ required: true }).where(eq(schema.steps.id, adults));
    const runId = await preview(workflowId);

    const response = await agent.post(`/api/runs/${runId}/pages/${pages[0]}/advance`)
      .send({ values: [], submissionKey: randomUUID() }).expect(200);
    expect(response.body.data.success).toBe(false);
    expect(response.body.data.errors.join(' ')).toContain('Adults');
    // No authoritative move exists for a submission that did not commit.
    expect(response.body.data.navigation).toBeNull();
    const [run] = await getOwnerDb().select().from(schema.workflowRuns).where(eq(schema.workflowRuns.id, runId));
    expect(run.currentPageId).toBe(pages[0]);
  });

  it('advance requires a submissionKey, because a submission with no identity cannot be replayed', async () => {
    const { workflowId, pages } = await threePageFixture();
    const runId = await preview(workflowId);
    const response = await agent.post(`/api/runs/${runId}/pages/${pages[0]}/advance`).send({ values: [] });
    expect(response.status).toBe(400);
    expect(response.body.errors.join(' ')).toContain('submissionKey is required');
  });

  it('serves a run-token respondent too, and still refuses a preview run', async () => {
    // The production transport uses `advance` for EVERY run, so an anonymous
    // respondent authenticating with a run token must be able to use it. This
    // is the regression that a session-auth-only route would have shipped: a
    // 401 on Next for every anonymous respondent.
    const { workflowId, pages, adults } = await threePageFixture();
    const created = await agent.post(`/api/workflows/${workflowId}/runs`).send({}).expect(201);
    const liveRun = created.body.data.runId as string;
    const runToken = created.body.data.runToken as string;

    const response = await request(ctx.baseURL)
      .post(`/api/runs/${liveRun}/pages/${pages[0]}/advance`)
      .set('Authorization', `Bearer ${runToken}`)
      .send({ values: [{ stepId: adults, value: 4 }], submissionKey: randomUUID() })
      .expect(200);
    expect(response.body.data.values[adults]).toBe(4);
    expect(response.body.data.navigation.nextPageId).toBe(pages[1]);

    // A preview session has no run token by construction, and the token path
    // must refuse one even if a token were somehow presented.
    const previewRun = await preview(workflowId);
    const denied = await request(ctx.baseURL)
      .post(`/api/runs/${previewRun}/pages/${pages[0]}/advance`)
      .set('Authorization', `Bearer ${runToken}`)
      .send({ values: [], submissionKey: randomUUID() });
    expect(denied.status).toBe(403);
  });

  it('rejects an unusable submissionKey instead of silently ignoring it', async () => {
    const { workflowId, pages } = await threePageFixture();
    const runId = await preview(workflowId);
    for (const submissionKey of [42, '', 'x'.repeat(201)]) {
      const response = await agent.post(`/api/runs/${runId}/pages/${pages[0]}/submit`)
        .send({ values: [], submissionKey });
      expect(response.status).toBe(400);
    }
    expect(await getOwnerDb().select().from(schema.runSubmissions).where(eq(schema.runSubmissions.runId, runId))).toHaveLength(0);
  });

  it('keys submissions per run, so the same key in another run is independent', async () => {
    const { workflowId, pages, adults } = await threePageFixture();
    const first = await preview(workflowId);
    const second = await preview(workflowId);
    const key = 'shared-key';
    await agent.post(`/api/runs/${first}/pages/${pages[0]}/submit`).send({ values: [{ stepId: adults, value: 1 }], submissionKey: key }).expect(200);
    await agent.post(`/api/runs/${second}/pages/${pages[0]}/submit`).send({ values: [{ stepId: adults, value: 9 }], submissionKey: key }).expect(200);
    const [secondValue] = await getOwnerDb().select().from(schema.stepValues)
      .where(and(eq(schema.stepValues.runId, second), eq(schema.stepValues.stepId, adults)));
    expect(secondValue.value).toBe(9);
  });

  it('runs a preview against its frozen draft, not a later builder edit', async () => {
    const { workflowId, pages, adults, children, blockId } = await threePageFixture();
    const runId = await preview(workflowId);
    // Change the block AFTER the preview pinned its version.
    await agent.put(`/api/steps/${blockId}`).send({
      config: {
        code: 'emit({ party_size: 999 });',
        inputs: [], outputs: [{ key: 'party_size', type: 'number' }],
      },
    }).expect(200);

    await submitAndAdvance(runId, pages[0], [{ stepId: adults, value: 2 }]);
    await submitAndAdvance(runId, pages[1], [{ stepId: children, value: 3 }]);

    const [output] = await getOwnerDb().select().from(schema.steps)
      .where(and(eq(schema.steps.workflowId, workflowId), eq(schema.steps.alias, 'party_size')));
    const [value] = await getOwnerDb().select().from(schema.stepValues)
      .where(and(eq(schema.stepValues.runId, runId), eq(schema.stepValues.stepId, output.id)));
    // The pinned draft still adds; it did not pick up the 999 edit.
    expect(value.value).toBe(5);
  });
});
