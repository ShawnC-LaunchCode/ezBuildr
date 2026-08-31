import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '@shared/schema';
import { AIGeneratedWorkflowSchema } from '@shared/types/ai';
import { evaluateRules, type EvaluableLogicRule } from '@shared/workflowLogic';

import { AliasResolver } from '../../server/services/AliasResolver';
import {
  workflowContentIngestService,
  type WorkflowContentData,
} from '../../server/services/WorkflowContentIngestService';
import { workflowService } from '../../server/services/WorkflowService';
import { enterTenantContextForTests } from '../../server/utils/rlsContext';
import { TestFactory } from '../helpers/testFactory';
import { setupIntegrationTest, type IntegrationTestContext } from '../helpers/integrationTestHelper';
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";

interface PersistedStepShape {
  title: string;
  type: string;
  alias: string | null;
  required: boolean;
  order: number;
  config: unknown;
}

interface PersistedPageShape {
  title: string;
  description: string | null;
  order: number;
  config: unknown;
  visibleIf: unknown;
  steps: PersistedStepShape[];
}

interface PersistedRuleShape {
  conditionStepAlias: string | null;
  when: unknown;
  targetType: string;
  targetAlias: string | null;
  action: string;
}

interface PersistedWorkflowShape {
  pages: PersistedPageShape[];
  logicRules: PersistedRuleShape[];
}

const parityFixture: WorkflowContentData = {
  title: 'Parity Fixture',
  description: 'Fixture shared by AI and manual ingest paths',
  pages: [
    {
      id: 'applicant-page',
      title: 'Applicant',
      description: 'Basic applicant details',
      order: 0,
      config: { layout: 'single-column' },
      steps: [
        {
          id: 'applicant-name',
          type: 'short_text',
          title: 'Applicant name',
          alias: 'applicantName',
          required: true,
          config: { placeholder: 'Full legal name' },
          order: 0,
        },
        {
          id: 'contact-preference',
          type: 'radio',
          title: 'Preferred contact method',
          alias: 'contactPreference',
          required: true,
          options: ['Email', 'Phone'],
          order: 1,
        },
      ],
    },
    {
      id: 'eligibility-page',
      title: 'Eligibility',
      description: 'Eligibility details',
      order: 1,
      steps: [
        {
          id: 'is-veteran',
          type: 'boolean',
          title: 'Veteran status',
          alias: 'isVeteran',
          required: false,
          config: {
            trueLabel: 'Veteran',
            falseLabel: 'Civilian',
            displayStyle: 'toggle',
          },
          order: 0,
        },
        {
          id: 'eligibility-notes',
          type: 'long_text',
          title: 'Eligibility notes',
          alias: 'eligibilityNotes',
          required: false,
          config: { maxLength: 500, rows: 4 },
          order: 1,
        },
      ],
    },
  ],
  logicRules: [
    {
      conditionStepAlias: 'contactPreference',
      when: {
        type: 'group',
        id: 'parity-group',
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: 'parity-condition',
            variable: 'contactPreference',
            operator: 'equals',
            value: 'Email',
            valueType: 'constant',
          },
        ],
      },
      targetType: 'step',
      targetAlias: 'eligibilityNotes',
      action: 'show',
    },
  ],
};

function cloneFixture(overrides?: Partial<WorkflowContentData>): WorkflowContentData {
  return {
    ...(JSON.parse(JSON.stringify(parityFixture)) as WorkflowContentData),
    ...overrides,
  };
}

function stableJson(value: unknown): unknown {
  return value === undefined ? null : value;
}

async function readPersistedShape(workflowId: string): Promise<PersistedWorkflowShape> {
  const [dbPages, dbSteps, dbRules] = await Promise.all([
    getOwnerDb().select().from(schema.pages).where(eq(schema.pages.workflowId, workflowId)),
    getOwnerDb().select().from(schema.steps).where(eq(schema.steps.workflowId, workflowId)),
    getOwnerDb().select().from(schema.logicRules).where(eq(schema.logicRules.workflowId, workflowId)),
  ]);

  const pageById = new Map(dbPages.map((page) => [page.id, page]));
  const stepById = new Map(dbSteps.map((step) => [step.id, step]));

  const pages = [...dbPages]
    .sort((a, b) => a.order - b.order)
    .map((page) => ({
      title: page.title,
      description: page.description,
      order: page.order,
      config: stableJson(page.config),
      visibleIf: stableJson(page.visibleIf),
      steps: dbSteps
        .filter((step) => step.pageId === page.id)
        .sort((a, b) => a.order - b.order)
        .map((step) => ({
          title: step.title,
          type: step.type,
          alias: step.alias,
          required: step.required ?? false,
          order: step.order,
          config: stableJson(step.config),
        })),
    }));

  const logicRules = dbRules
    .map((rule) => {
      const conditionStepAlias = stepById.get(rule.conditionStepId)?.alias ?? null;
      const targetAlias = rule.targetType === 'step'
        ? stepById.get(rule.targetStepId ?? '')?.alias ?? null
        : pageById.get(rule.targetPageId ?? '')?.title ?? null;

      return {
        conditionStepAlias,
        when: stableJson(rule.when),
        targetType: rule.targetType,
        targetAlias,
        action: rule.action,
      };
    })
    .sort((a, b) => `${a.targetType}:${a.targetAlias}`.localeCompare(`${b.targetType}:${b.targetAlias}`));

  return { pages, logicRules };
}

describe.sequential('WorkflowContentIngestService source parity', () => {
  let ctx: IntegrationTestContext;
  let factory: TestFactory;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: 'Ingest Parity Tenant',
      createProject: true,
    });
    // Fixture rows go through the observer connection, not the app pool.
    factory = new TestFactory(getOwnerDb());
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  /**
   * RLS-5: this suite calls `workflowContentIngestService.apply` DIRECTLY
   * rather than over HTTP, so no middleware ever opens a tenant context and
   * the service's `withCurrentTenant` has nothing to read. `beforeAll` and
   * `beforeEach` both fail to propagate through AsyncLocalStorage (measured),
   * so the context has to be entered inside each test body — which is what
   * `createWorkflow` does here, since every test starts by calling it.
   */
  async function createWorkflow(title: string): Promise<string> {
    if (ctx.projectId === undefined) {
      throw new Error('Integration test project was not created');
    }
    enterTenantContextForTests(ctx.tenantId);

    const { workflow } = await factory.createWorkflow(ctx.projectId, ctx.userId, {
      workflow: { title },
    });
    return workflow.id;
  }

  it('persists identical pages, steps, config, aliases, and logic rules for AI and manual sources', async () => {
    const aiWorkflowId = await createWorkflow('AI source workflow');
    const manualWorkflowId = await createWorkflow('Manual source workflow');

    await workflowContentIngestService.apply(aiWorkflowId, cloneFixture(), { source: 'ai' });
    await workflowContentIngestService.apply(manualWorkflowId, cloneFixture(), { source: 'manual' });

    await expect(readPersistedShape(manualWorkflowId)).resolves.toEqual(
      await readPersistedShape(aiWorkflowId)
    );
  });

  it('detects a deliberate fixture mutation', async () => {
    const baseWorkflowId = await createWorkflow('Base parity workflow');
    const mutatedWorkflowId = await createWorkflow('Mutated parity workflow');
    const mutatedFixture = cloneFixture();
    const booleanStep = mutatedFixture.pages?.[1]?.steps?.[0];
    if (booleanStep === undefined) {
      throw new Error('Expected boolean step fixture to exist');
    }

    booleanStep.config = {
      ...(booleanStep.config ?? {}),
      trueLabel: 'Service member',
    };

    await workflowContentIngestService.apply(baseWorkflowId, cloneFixture(), { source: 'ai' });
    await workflowContentIngestService.apply(mutatedWorkflowId, mutatedFixture, { source: 'manual' });

    await expect(readPersistedShape(mutatedWorkflowId)).resolves.not.toEqual(
      await readPersistedShape(baseWorkflowId)
    );
  });

  it('sanitizes invalid ingest aliases into the canonical format (ICW-4)', async () => {
    const workflowId = await createWorkflow('Alias sanitize workflow');
    const fixture = cloneFixture();
    // Only mutate aliases NOT referenced by the fixture's logic rule
    // (contactPreference / eligibilityNotes must stay resolvable).
    const applicantStep = fixture.pages?.[0]?.steps?.[0];
    const veteranStep = fixture.pages?.[1]?.steps?.[0];
    if (applicantStep === undefined || veteranStep === undefined) {
      throw new Error('Expected fixture steps to exist');
    }
    applicantStep.alias = 'applicant.name!'; // punctuation stripped
    veteranStep.alias = '1st-choice'; // leading digit prefixed

    await workflowContentIngestService.apply(workflowId, fixture, { source: 'ai' });

    const stored = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.workflowId, workflowId));
    const aliases = stored.map((step) => step.alias);
    expect(aliases).toContain('applicantname');
    expect(aliases).toContain('_1stchoice');
    for (const alias of aliases) {
      if (alias !== null && alias !== '') {
        expect(alias).toMatch(/^[a-zA-Z_][a-zA-Z0-9_]*$/);
      }
    }
  });

  it('rolls back metadata and audit log when content sync fails mid-transaction (ICW-3)', async () => {
    const workflowId = await createWorkflow('Original Title');

    // An invalid logic-rule action passes in-memory validation
    // (validateWorkflowStructure only checks alias references) but violates
    // the conditionalActionEnum DURING the logic-rule insert — i.e. after the
    // workflow-metadata UPDATE and the page/step inserts have executed
    // inside the same replaceWorkflowContent transaction. This is the
    // torn-write scenario ICW-3 fixed.
    const badFixture = cloneFixture({ title: 'Torn Title' });
    const rule = badFixture.logicRules?.[0];
    if (rule === undefined) {
      throw new Error('Expected fixture logic rule to exist');
    }
    rule.action = 'not_a_real_action';

    await expect(
      workflowService.replaceWorkflowContent(workflowId, ctx.userId, badFixture)
    ).rejects.toThrow();

    const [wf] = await getOwnerDb()
      .select()
      .from(schema.workflows)
      .where(eq(schema.workflows.id, workflowId));
    expect(wf?.title).toBe('Original Title');

    const audits = await getOwnerDb()
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.entityId, workflowId));
    expect(audits.filter((row) => row.action === 'ai_revision_apply')).toHaveLength(0);

    // Happy path through the same method still works end-to-end (metadata +
    // content + audit all land when nothing fails).
    await workflowService.replaceWorkflowContent(workflowId, ctx.userId, cloneFixture({ title: 'Replaced Title' }));

    const [wfAfter] = await getOwnerDb()
      .select()
      .from(schema.workflows)
      .where(eq(schema.workflows.id, workflowId));
    expect(wfAfter?.title).toBe('Replaced Title');

    const auditsAfter = await getOwnerDb()
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.entityId, workflowId));
    expect(auditsAfter.filter((row) => row.action === 'ai_revision_apply')).toHaveLength(1);
  });

  it('an AI-shaped payload (AIGeneratedWorkflowSchema) round-trips its `when` rule into one that actually evaluates (LU-6c AC4)', async () => {
    const workflowId = await createWorkflow('AI schema round-trip workflow');

    // A real AI-provider response would parse through this schema before
    // ever reaching the ingest service — proves the schema itself now
    // speaks ConditionExpression, not the retired flat shape.
    const parsed = AIGeneratedWorkflowSchema.parse({
      title: 'Pet Intake',
      pages: [
        {
          id: 'page_1',
          title: 'Page 1',
          order: 0,
          steps: [
            {
              id: 'step_1', type: 'boolean', title: 'Do you have pets?', alias: 'has_pets', required: false,
              config: { trueLabel: 'Yes', falseLabel: 'No', displayStyle: 'buttons' },
            },
            {
              id: 'step_2', type: 'text', title: 'Pet name', alias: 'pet_name', required: false,
              config: { variant: 'short' },
            },
          ],
        },
      ],
      logicRules: [
        {
          id: 'rule_1',
          when: {
            type: 'group',
            id: 'ai-round-trip-group',
            operator: 'AND',
            conditions: [
              { type: 'condition', id: 'ai-round-trip-condition', variable: 'has_pets', operator: 'is_true', valueType: 'constant' },
            ],
          },
          targetType: 'step',
          targetAlias: 'pet_name',
          action: 'show',
        },
      ],
      transformBlocks: [],
    });

    await workflowContentIngestService.apply(workflowId, parsed as unknown as WorkflowContentData, { source: 'ai' });

    const storedSteps = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.workflowId, workflowId));
    const controller = storedSteps.find((step) => step.alias === 'has_pets');
    const target = storedSteps.find((step) => step.alias === 'pet_name');
    expect(controller).toBeDefined();
    expect(target).toBeDefined();

    const storedRules = await getOwnerDb().select().from(schema.logicRules).where(eq(schema.logicRules.workflowId, workflowId));
    expect(storedRules).toHaveLength(1);
    const [rule] = storedRules;
    expect(rule.action).toBe('show');
    expect(rule.targetType).toBe('step');
    // The alias-based FK bookkeeping resolved to the freshly-created steps.
    expect(rule.conditionStepId).toBe(controller!.id);
    expect(rule.targetStepId).toBe(target!.id);

    // Not just stored — evaluate it through the real production path
    // (shared/workflowLogic.ts, the same evaluator a run uses) with a
    // negative and a positive control, proving `when` is a working
    // condition and not inert JSON.
    const resolveAlias = AliasResolver.createInlineResolver(storedSteps);
    const hiddenResult = evaluateRules([rule as EvaluableLogicRule], {}, resolveAlias);
    expect(hiddenResult.visibleSteps.has(target!.id)).toBe(false);

    const shownResult = evaluateRules([rule as EvaluableLogicRule], { [controller!.id]: true }, resolveAlias);
    expect(shownResult.visibleSteps.has(target!.id)).toBe(true);
  });

  describe('Section ingestion (SECT-B4)', () => {
    // Before this, `sections` and `pages[].sectionId` were accepted by the type
    // and then dropped on the floor — a generated workflow could describe its
    // grouping and land completely flat, with no error anywhere.
    function grouped(): Parameters<typeof workflowContentIngestService.apply>[1] {
      return {
        title: 'Estate intake',
        sections: [
          { id: 'sec-assets', title: 'Assets' },
          { id: 'sec-debts', title: 'Debts' },
        ],
        pages: [
          { id: 'pg-1', title: 'Real property', order: 0, sectionId: 'sec-assets', steps: [] },
          { id: 'pg-2', title: 'Accounts', order: 1, sectionId: 'sec-assets', steps: [] },
          { id: 'pg-3', title: 'Loans', order: 2, sectionId: 'sec-debts', steps: [] },
          { id: 'pg-4', title: 'Declarations', order: 3, steps: [] },
        ],
      };
    }

    async function readLayout(workflowId: string): Promise<Array<{ title: string; section: string | null }>> {
      const persistedSections = await getOwnerDb()
        .select()
        .from(schema.sections)
        .where(eq(schema.sections.workflowId, workflowId));
      const titleById = new Map(persistedSections.map((section) => [section.id, section.title]));

      const persistedPages = await getOwnerDb()
        .select()
        .from(schema.pages)
        .where(eq(schema.pages.workflowId, workflowId));

      return persistedPages
        .filter((page) => page.deletedAt === null)
        .sort((left, right) => left.order - right.order)
        .map((page) => ({
          title: page.title,
          section: page.sectionId === null ? null : titleById.get(page.sectionId) ?? '(dangling)',
        }));
    }

    it('creates Sections and points each page at the right one', async () => {
      const workflowId = await createWorkflow('Grouped intake');

      await workflowContentIngestService.apply(workflowId, grouped(), { source: 'ai' });

      expect(await readLayout(workflowId)).toEqual([
        { title: 'Real property', section: 'Assets' },
        { title: 'Accounts', section: 'Assets' },
        { title: 'Loans', section: 'Debts' },
        { title: 'Declarations', section: null },
      ]);
    });

    it('rejects a payload whose Sections interleave, committing nothing', async () => {
      const workflowId = await createWorkflow('Interleaved intake');
      const payload = grouped();
      // Assets now covers orders 0 and 2 with a Debts page wedged between them,
      // which is precisely the layout no Section may have.
      payload.pages![1].sectionId = 'sec-debts';
      payload.pages![2].sectionId = 'sec-assets';

      await expect(
        workflowContentIngestService.apply(workflowId, payload, { source: 'ai' })
      ).rejects.toThrow(/contiguous/i);

      // Whole transaction rolled back: not even the pages landed.
      expect(await readLayout(workflowId)).toEqual([]);
    });

    it('drops a Section the payload no longer mentions and ungroups its pages', async () => {
      const workflowId = await createWorkflow('Shrinking intake');
      await workflowContentIngestService.apply(workflowId, grouped(), { source: 'ai' });

      const flattened = grouped();
      flattened.sections = [{ id: 'sec-assets', title: 'Assets' }];
      flattened.pages![2].sectionId = undefined;

      await workflowContentIngestService.apply(workflowId, flattened, { source: 'ai' });

      expect(await readLayout(workflowId)).toEqual([
        { title: 'Real property', section: 'Assets' },
        { title: 'Accounts', section: 'Assets' },
        { title: 'Loans', section: null },
        { title: 'Declarations', section: null },
      ]);
    });

    it('ungroups a page whose sectionId matches no Section in the payload', async () => {
      const workflowId = await createWorkflow('Dangling reference intake');
      const payload = grouped();
      payload.pages![3].sectionId = 'sec-does-not-exist';

      await workflowContentIngestService.apply(workflowId, payload, { source: 'ai' });

      const layout = await readLayout(workflowId);
      expect(layout[3]).toEqual({ title: 'Declarations', section: null });
    });
  });
});
