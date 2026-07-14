import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '@shared/schema';

import { db } from '../../server/db';
import {
  workflowContentIngestService,
  type WorkflowContentData,
} from '../../server/services/WorkflowContentIngestService';
import { TestFactory } from '../helpers/testFactory';
import { setupIntegrationTest, type IntegrationTestContext } from '../helpers/integrationTestHelper';

interface PersistedStepShape {
  title: string;
  type: string;
  alias: string | null;
  required: boolean;
  order: number;
  config: unknown;
}

interface PersistedSectionShape {
  title: string;
  description: string | null;
  order: number;
  config: unknown;
  visibleIf: unknown;
  steps: PersistedStepShape[];
}

interface PersistedRuleShape {
  conditionStepAlias: string | null;
  operator: string;
  conditionValue: unknown;
  targetType: string;
  targetAlias: string | null;
  action: string;
}

interface PersistedWorkflowShape {
  sections: PersistedSectionShape[];
  logicRules: PersistedRuleShape[];
}

const parityFixture: WorkflowContentData = {
  title: 'Parity Fixture',
  description: 'Fixture shared by AI and manual ingest paths',
  sections: [
    {
      id: 'applicant-section',
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
      id: 'eligibility-section',
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
            displayStyle: 'segmented',
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
      operator: 'equals',
      conditionValue: 'Email',
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
  const [dbSections, dbSteps, dbRules] = await Promise.all([
    db.select().from(schema.sections).where(eq(schema.sections.workflowId, workflowId)),
    db.select().from(schema.steps).where(eq(schema.steps.workflowId, workflowId)),
    db.select().from(schema.logicRules).where(eq(schema.logicRules.workflowId, workflowId)),
  ]);

  const sectionById = new Map(dbSections.map((section) => [section.id, section]));
  const stepById = new Map(dbSteps.map((step) => [step.id, step]));

  const sections = [...dbSections]
    .sort((a, b) => a.order - b.order)
    .map((section) => ({
      title: section.title,
      description: section.description,
      order: section.order,
      config: stableJson(section.config),
      visibleIf: stableJson(section.visibleIf),
      steps: dbSteps
        .filter((step) => step.sectionId === section.id)
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
        : sectionById.get(rule.targetSectionId ?? '')?.title ?? null;

      return {
        conditionStepAlias,
        operator: rule.operator,
        conditionValue: stableJson(rule.conditionValue),
        targetType: rule.targetType,
        targetAlias,
        action: rule.action,
      };
    })
    .sort((a, b) => `${a.targetType}:${a.targetAlias}`.localeCompare(`${b.targetType}:${b.targetAlias}`));

  return { sections, logicRules };
}

describe.sequential('WorkflowContentIngestService source parity', () => {
  let ctx: IntegrationTestContext;
  let factory: TestFactory;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: 'Ingest Parity Tenant',
      createProject: true,
    });
    factory = new TestFactory(db);
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  async function createWorkflow(title: string): Promise<string> {
    if (ctx.projectId === undefined) {
      throw new Error('Integration test project was not created');
    }

    const { workflow } = await factory.createWorkflow(ctx.projectId, ctx.userId, {
      workflow: { title },
    });
    return workflow.id;
  }

  it('persists identical sections, steps, config, aliases, and logic rules for AI and manual sources', async () => {
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
    const booleanStep = mutatedFixture.sections?.[1]?.steps?.[0];
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
});
