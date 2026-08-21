import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';

import * as schema from '@shared/schema';
import { versionService } from '../../server/services/VersionService';
import { setupIntegrationTest, type IntegrationTestContext } from '../helpers/integrationTestHelper';
import { TestFactory } from '../helpers/testFactory';
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";

describe.sequential('POST /api/runs/:runId/values/bulk', () => {
  let ctx: IntegrationTestContext;
  let factory: TestFactory;
  let workflowId: string;
  let sectionId: string;
  let stepId1: string;
  let stepId2: string;
  let radioStepId: string;
  let dateStepId: string;
  let emailStepId: string;
  let requiredRadioStepId: string;
  let otherSectionStepId: string;
  let runId: string;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: 'Test Tenant',
      createProject: true,
    });
    factory = new TestFactory();

    const { workflow, version } = await factory.createWorkflow(ctx.projectId!, ctx.userId);
    workflowId = workflow.id;

    const section = await factory.createSection(workflowId);
    sectionId = section.id;
    
    const step1 = await factory.createStep(section.id, {
      title: 'First Name',
      alias: 'firstName',
      type: 'short_text',
      order: 0
    });
    stepId1 = step1.id;

    const step2 = await factory.createStep(section.id, {
      title: 'Last Name',
      alias: 'lastName',
      type: 'short_text',
      order: 1
    });
    stepId2 = step2.id;

    const radioStep = await factory.createStep(section.id, {
      title: 'Plan',
      alias: 'plan',
      type: 'radio',
      order: 2,
      config: {
        options: [
          { id: 'basic', label: 'Basic' },
          { id: 'pro', label: 'Pro', alias: 'pro-plan' },
        ],
      },
    });
    radioStepId = radioStep.id;

    const dateStep = await factory.createStep(section.id, {
      title: 'Start Date',
      alias: 'startDate',
      type: 'date',
      order: 3,
      config: {},
    });
    dateStepId = dateStep.id;

    const emailStep = await factory.createStep(section.id, {
      title: 'Email',
      alias: 'email',
      type: 'email',
      order: 4,
      config: {},
    });
    emailStepId = emailStep.id;

    const requiredRadioStep = await factory.createStep(section.id, {
      title: 'Required Plan',
      alias: 'requiredPlan',
      type: 'radio',
      order: 5,
      required: true,
      config: {
        options: [
          { id: 'starter', label: 'Starter' },
        ],
      },
    });
    requiredRadioStepId = requiredRadioStep.id;

    const otherSection = await factory.createSection(workflowId, {
      title: 'Other Section',
      order: 1,
    });
    const otherSectionStep = await factory.createStep(otherSection.id, {
      title: 'Other Section Step',
      alias: 'otherSectionStep',
      type: 'short_text',
      order: 0,
    });
    otherSectionStepId = otherSectionStep.id;

    // RVP-3: section submit now resolves this run's steps from its pinned
    // version rather than the live tables, so the pinned graph has to contain
    // the sections and steps created above. `factory.createWorkflow` produced
    // its version before any of them existed, and a run pinned to that empty
    // snapshot would have every submitted value treated as "not part of this
    // interview" and dropped — including the cross-section one this suite
    // asserts is rejected. Regenerate the version now that the content exists.
    const pinnedVersion = (await versionService.createDraftVersion(workflowId, ctx.userId)) ?? version;

    const [run] = await getOwnerDb().insert(schema.workflowRuns).values({
      workflowId,
      workflowVersionId: pinnedVersion.id,
      runToken: 'bulk-values-run-token',
      completed: false,
    }).returning();
    runId = run.id;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('persists bulk autosave values to step_values', async () => {
    const res = await request(ctx.app)
      .post(`/api/runs/${runId}/values/bulk`)
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .send({
        values: [
          { stepId: stepId1, value: 'Alice' },
          { stepId: stepId2, value: 'Smith' },
        ]
      });

    expect(res.status).toBe(200);

    const savedValues = await getOwnerDb().select()
      .from(schema.stepValues)
      .where(eq(schema.stepValues.runId, runId));

    expect(savedValues).toHaveLength(2);
    
    const v1 = savedValues.find(v => v.stepId === stepId1);
    const v2 = savedValues.find(v => v.stepId === stepId2);
    
    expect(v1?.value).toBe('Alice');
    expect(v2?.value).toBe('Smith');
  });

  it('rejects invalid typed values without persisting any part of the batch', async () => {
    const res = await request(ctx.app)
      .post(`/api/runs/${runId}/values/bulk`)
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .send({
        values: [
          { stepId: radioStepId, value: 'enterprise' },
          { stepId: dateStepId, value: 123 },
        ]
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid step values');
    expect(res.body.details.stepIds).toEqual([radioStepId, dateStepId]);

    const savedValues = await getOwnerDb().select()
      .from(schema.stepValues)
      .where(eq(schema.stepValues.runId, runId));

    expect(savedValues.find(v => v.stepId === radioStepId)).toBeUndefined();
    expect(savedValues.find(v => v.stepId === dateStepId)).toBeUndefined();
  });

  it('allows blank required values during autosave-style bulk writes', async () => {
    const res = await request(ctx.app)
      .post(`/api/runs/${runId}/values/bulk`)
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .send({
        values: [
          { stepId: requiredRadioStepId, value: '' },
        ]
      });

    expect(res.status).toBe(200);

    const savedValues = await getOwnerDb().select()
      .from(schema.stepValues)
      .where(eq(schema.stepValues.runId, runId));

    const saved = savedValues.find(v => v.stepId === requiredRadioStepId);
    expect(saved?.value).toBe('');
  });

  it('preserves an unfinished formatted value as a resumable draft', async () => {
    const res = await request(ctx.app)
      .post(`/api/runs/${runId}/values/bulk`)
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .send({
        values: [
          { stepId: emailStepId, value: 'person@' },
        ]
      });

    expect(res.status).toBe(200);

    const savedValues = await getOwnerDb().select()
      .from(schema.stepValues)
      .where(eq(schema.stepValues.runId, runId));

    expect(savedValues.find(v => v.stepId === emailStepId)?.value).toBe('person@');
  });

  it('validates and persists run-token bulk writes through the same endpoint', async () => {
    const res = await request(ctx.app)
      .post(`/api/runs/${runId}/values/bulk`)
      .set('Authorization', 'Bearer bulk-values-run-token')
      .send({
        values: [
          { stepId: radioStepId, value: 'pro-plan' },
        ]
      });

    expect(res.status).toBe(200);

    const savedValues = await getOwnerDb().select()
      .from(schema.stepValues)
      .where(eq(schema.stepValues.runId, runId));

    const saved = savedValues.find(v => v.stepId === radioStepId);
    expect(saved?.value).toBe('pro-plan');
  });

  it('rejects section submit values that belong to a different section', async () => {
    const res = await request(ctx.app)
      .post(`/api/runs/${runId}/sections/${sectionId}/submit`)
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .send({
        values: [
          { stepId: stepId1, value: 'Alice' },
          { stepId: otherSectionStepId, value: 'Cross-section write' },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toContain(otherSectionStepId);

    const savedValues = await getOwnerDb().select()
      .from(schema.stepValues)
      .where(eq(schema.stepValues.runId, runId));

    expect(savedValues.find(v => v.stepId === otherSectionStepId)).toBeUndefined();
  });
});
