import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logicRules } from '@shared/schema';
import type { DbTransaction } from '../../../server/repositories/BaseRepository';
import { db } from '../../../server/db';
import { stepRepository, logicRuleRepository } from '../../../server/repositories';
import { createTestFactory, TestFactory } from '../../helpers/testFactory';
import { describeWithDb } from '../../helpers/dbTestHelper';
import { run as runMigration } from '../../../scripts/migrateOptionAliases';
import { stepService } from '../../../server/services/StepService';
import { buildTestWhen } from '../../helpers/conditionFixtures';
import type { ConditionExpression, Condition } from '../../../shared/types/conditions';

/** Reads the (single, leaf) comparison value out of a `when` built by `buildTestWhen`. */
function leafValue(when: unknown): unknown {
  const group = when as ConditionExpression;
  return (group?.conditions[0] as Condition)?.value;
}

describeWithDb('migrateOptionAliases DB', () => {
  let _factory: ReturnType<typeof createTestFactory>;
  let _testUserId: string;
  let _testProjectId: string;
  let testWorkflowId: string;
  let testSectionId: string;
  let txFactory: TestFactory;

  beforeEach(async () => {
    _factory = createTestFactory();
    await db.transaction(async (tx: DbTransaction) => {
      txFactory = new TestFactory(tx as ConstructorParameters<typeof TestFactory>[0]);
      
      const { user, project } = await txFactory.createTenant();
      _testUserId = user.id;
      _testProjectId = project.id;

      const { workflow } = await txFactory.createWorkflow(project.id, user.id, {
        workflow: { name: 'Migration Test Workflow' },
      });
      testWorkflowId = workflow.id;

      const section = await txFactory.createSection(testWorkflowId, { title: 'Test Section' });
      testSectionId = section.id;
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it('migrates an option alias and its logic rules', async () => {
    let stepId: string = '';
    await db.transaction(async (tx: DbTransaction) => {
      const step = await txFactory.createStep(testSectionId, {
        type: 'choice',
        title: 'Q1',
        alias: 'q1',
        config: {
          options: {
            type: 'static',
            options: [
              { id: 'opt_1', alias: 'oldAlias', label: 'New Label', value: 'oldAlias' }
            ]
          }
        }
      });
      stepId = step.id;

      await tx.insert(logicRules).values({
        workflowId: testWorkflowId,
        conditionStepId: step.id,
        when: buildTestWhen(step.id, 'equals', 'oldAlias'),
        action: 'show',
        targetType: 'step',
        targetStepId: step.id,
        order: 1
      });
    });

    const propagateSpy = vi.spyOn(stepService, 'propagateChoiceOptionRenames');
    const { migratedSteps } = await runMigration(true);

    expect(migratedSteps).toBeGreaterThan(0);
    
    const updated = await stepRepository.findById(stepId);
    const opts = (updated!.config as any).options.options;
    expect(opts[0].alias).toBe('New Label');

    expect(propagateSpy).toHaveBeenCalled();

    const rules = await logicRuleRepository.findByConditionStepId(stepId);
    expect(leafValue(rules[0].when)).toBe('New Label');
  });

  it('is idempotent on second run', async () => {
    await db.transaction(async (_tx: DbTransaction) => {
      await txFactory.createStep(testSectionId, {
        type: 'choice',
        title: 'Q1',
        alias: 'q1',
        config: {
          options: {
            type: 'static',
            options: [
              { id: 'opt_1', alias: 'oldAlias', label: 'New Label', value: 'oldAlias' }
            ]
          }
        }
      });
    });

    // First run
    await runMigration(true);

    // Second run
    const result2 = await runMigration(true);
    expect(result2.migratedSteps).toBe(0);
    expect(result2.skippedOptions).toBe(0);
  });

  it('performs no writes in dry-run mode while reporting counts', async () => {
    let stepId: string = '';
    await db.transaction(async (_tx: DbTransaction) => {
      const step = await txFactory.createStep(testSectionId, {
        type: 'choice',
        title: 'Q1',
        alias: 'q1',
        config: {
          options: {
            type: 'static',
            options: [
              { id: 'opt_1', alias: 'oldAlias', label: 'New Label', value: 'oldAlias' }
            ]
          }
        }
      });
      stepId = step.id;
    });

    const result = await runMigration(false); // Dry run

    expect(result.migratedSteps).toBeGreaterThan(0);
    
    // Assert no writes happened
    const updated = await stepRepository.findById(stepId);
    const opts = (updated!.config as any).options.options;
    expect(opts[0].alias).toBe('oldAlias');
  });

  it('skips migration if label is duplicated within the step', async () => {
    let stepId: string = '';
    await db.transaction(async (_tx: DbTransaction) => {
      const step = await txFactory.createStep(testSectionId, {
        type: 'choice',
        title: 'Q2',
        alias: 'q2',
        config: {
          options: {
            type: 'static',
            options: [
              { id: 'opt_1', alias: 'alias1', label: 'Duplicate Label', value: 'v1' },
              { id: 'opt_2', alias: 'alias2', label: 'Duplicate Label', value: 'v2' }
            ]
          }
        }
      });
      stepId = step.id;
    });

    const { skippedOptions } = await runMigration(true);

    expect(skippedOptions).toBeGreaterThanOrEqual(2);

    const updated = await stepRepository.findById(stepId);
    const opts = (updated!.config as any).options.options;
    expect(opts[0].alias).toBe('alias1');
    expect(opts[1].alias).toBe('alias2');
  });
});
