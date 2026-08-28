import { it, expect, beforeEach, vi } from 'vitest';
import type { DbTransaction } from '../../../server/repositories/BaseRepository';
import { db } from '../../../server/db';
import { createTestFactory, TestFactory } from '../../helpers/testFactory';
import { describeWithDb } from '../../helpers/dbTestHelper';
import { stepService } from '../../../server/services/StepService';
import { logicRuleRepository } from '../../../server/repositories/LogicRuleRepository';
import { stepRepository, transformBlockRepository } from '../../../server/repositories';
import { buildTestWhen } from '../../helpers/conditionFixtures';
import type { ConditionExpression, Condition } from '../../../shared/types/conditions';

/** Reads the (single, leaf) comparison value out of a `when` built by `buildTestWhen`. */
function leafValue(when: unknown): unknown {
  const group = when as ConditionExpression;
  return (group?.conditions[0] as Condition)?.value;
}

describeWithDb('StepService DB', () => {
  let _factory: ReturnType<typeof createTestFactory>;
  let testUserId: string;
  let _testProjectId: string;
  let testWorkflowId: string;
  let testPageId: string;
  let txFactory: TestFactory;

  beforeEach(async () => {
    _factory = createTestFactory();
    await db.transaction(async (tx: unknown) => {
      txFactory = new TestFactory(tx as ConstructorParameters<typeof TestFactory>[0]);
      
      const { user, project } = await txFactory.createTenant();
      testUserId = user.id;
      _testProjectId = project.id;

      const { workflow } = await txFactory.createWorkflow(project.id, user.id, {
        workflow: { name: 'Test Workflow' },
      });
      testWorkflowId = workflow.id;

      const page = await txFactory.createPage(testWorkflowId, { title: 'Test Page' });
      testPageId = page.id;
    });
  });

  it.each(['short', 'long'] as const)('persists canonical text config for the %s variant', async (variant) => {
    const config = {
      variant,
      placeholder: `${variant} placeholder`,
      validation: { minLength: 2, maxLength: 40 },
    };

    const step = await stepService.createStep(testWorkflowId, testPageId, testUserId, {
      title: `${variant} text`,
      type: 'text',
      defaultValue: `${variant} default`,
      config,
    });
    const reloaded = await stepRepository.findById(step.id);

    expect(reloaded).toMatchObject({
      type: 'text',
      defaultValue: `${variant} default`,
      config,
    });
  });

  it('rejects a canonical text config without a variant and writes no row', async () => {
    const before = await stepRepository.findByPageId(testPageId);

    await expect(stepService.createStep(testWorkflowId, testPageId, testUserId, {
      title: 'Missing variant',
      type: 'text',
      config: { placeholder: 'Not enough identity' },
    })).rejects.toThrow(/validation error/i);

    const after = await stepRepository.findByPageId(testPageId);
    expect(after).toHaveLength(before.length);
  });

  it('rewrites logic rules on choice alias change', async () => {
    // 1. Create a choice step
    const choiceStep = await stepService.createStep(testWorkflowId, testPageId, testUserId, {
      title: 'Choice',
      type: 'choice',
      config: {
        display: 'dropdown',
        allowMultiple: false,
        options: {
          type: 'static',
          options: [
            { id: 'opt1', label: 'Option 1', alias: 'old_val1' },
            { id: 'opt2', label: 'Option 2', alias: 'old_val2' }
          ]
        }
      }
    });

    // 2. Create logic rules dependent on it
    await db.transaction(async (tx: DbTransaction) => {
      await logicRuleRepository.create({
        workflowId: testWorkflowId,
        conditionStepId: choiceStep.id,
        when: buildTestWhen(choiceStep.id, 'equals', 'old_val1'),
        action: 'show',
        targetType: 'step',
        targetStepId: choiceStep.id,
        order: 1
      }, tx);
      await logicRuleRepository.create({
        workflowId: testWorkflowId,
        conditionStepId: choiceStep.id,
        when: buildTestWhen(choiceStep.id, 'contains', ['old_val1', 'old_val2']),
        action: 'show',
        targetType: 'step',
        targetStepId: choiceStep.id,
        order: 2
      }, tx);
    });

    // 3. Update choice step aliases
    const updated = await stepService.updateStepById(choiceStep.id, testUserId, {
      config: {
        display: 'dropdown',
        allowMultiple: false,
        options: {
          type: 'static',
          options: [
            { id: 'opt1', label: 'Option 1', alias: 'new_val1' },
            { id: 'opt2', label: 'Option 2', alias: 'old_val2' } // untouched
          ]
        }
      }
    });

    expect(updated.warnings).toBeUndefined();

    // 4. Verify rules were rewritten
    const rules = await logicRuleRepository.findByConditionStepId(choiceStep.id);
    expect(rules).toHaveLength(2);
    
    const rule1 = rules.find(r => r.order === 1);
    expect(leafValue(rule1?.when)).toBe('new_val1');

    const rule2 = rules.find(r => r.order === 2);
    expect(leafValue(rule2?.when)).toEqual(['new_val1', 'old_val2']);
  });

  it('scans visibleIf for old alias occurrences and returns warnings', async () => {
    // 1. Create a choice step
    const choiceStep = await stepService.createStep(testWorkflowId, testPageId, testUserId, {
      title: 'Choice',
      type: 'choice',
      config: {
        display: 'dropdown',
        allowMultiple: false,
        options: {
          type: 'static',
          options: [
            { id: 'opt1', label: 'Option 1', alias: 'old_val1' }
          ]
        }
      }
    });

    // 2. Create another step with visibleIf referencing 'old_val1'
    await stepService.createStep(testWorkflowId, testPageId, testUserId, {
      title: 'Dependent Step',
      type: 'short_text',
      visibleIf: { '===': [{ var: `steps.${choiceStep.alias}` }, 'old_val1'] }
    });

    // 3. Update choice step alias
    const updated = await stepService.updateStepById(choiceStep.id, testUserId, {
      config: {
        display: 'dropdown',
        allowMultiple: false,
        options: {
          type: 'static',
          options: [
            { id: 'opt1', label: 'Option 1', alias: 'new_val1' }
          ]
        }
      }
    });

    // 4. Expect warnings to contain the old alias mention
    expect(updated.warnings).toBeDefined();
    expect(updated.warnings?.length).toBeGreaterThan(0);
    expect(updated.warnings?.[0]).toContain('old_val1');
    expect(updated.warnings?.[0]).toContain('Dependent Step');
  });

  it('does not rewrite logic rules for a different step with a coincidentally equal condition value', async () => {
    const choiceStep = await stepService.createStep(testWorkflowId, testPageId, testUserId, {
      title: 'Choice',
      type: 'choice',
      config: {
        display: 'dropdown',
        allowMultiple: false,
        options: {
          type: 'static',
          options: [{ id: 'opt1', label: 'Option 1', alias: 'shared_val' }]
        }
      }
    });

    const otherChoiceStep = await stepService.createStep(testWorkflowId, testPageId, testUserId, {
      title: 'Other Choice',
      type: 'choice',
      config: {
        display: 'dropdown',
        allowMultiple: false,
        options: {
          type: 'static',
          options: [{ id: 'opt1', label: 'Option 1', alias: 'shared_val' }]
        }
      }
    });

    let _ruleId: string = '';
    await db.transaction(async (tx: DbTransaction) => {
      const rule = await logicRuleRepository.create({
        workflowId: testWorkflowId,
        conditionStepId: otherChoiceStep.id,
        when: buildTestWhen(otherChoiceStep.id, 'equals', 'shared_val'),
        action: 'show',
        targetType: 'step',
        targetStepId: otherChoiceStep.id,
        order: 1
      }, tx);
      _ruleId = rule.id;
    });

    await stepService.updateStepById(choiceStep.id, testUserId, {
      config: {
        display: 'dropdown',
        allowMultiple: false,
        options: {
          type: 'static',
          options: [{ id: 'opt1', label: 'Option 1', alias: 'new_val' }]
        }
      }
    });

    const rules = await logicRuleRepository.findByConditionStepId(otherChoiceStep.id);
    expect(leafValue(rules[0].when)).toBe('shared_val'); // Untouched
  });

  it('does not rewrite rules if step update fails', async () => {
    const choiceStep = await stepService.createStep(testWorkflowId, testPageId, testUserId, {
      title: 'Choice',
      type: 'choice',
      config: {
        display: 'dropdown',
        allowMultiple: false,
        options: {
          type: 'static',
          options: [{ id: 'opt1', label: 'Option 1', alias: 'old_val' }]
        }
      }
    });

    await db.transaction(async (tx: DbTransaction) => {
      await logicRuleRepository.create({
        workflowId: testWorkflowId,
        conditionStepId: choiceStep.id,
        when: buildTestWhen(choiceStep.id, 'equals', 'old_val'),
        action: 'show',
        targetType: 'step',
        targetStepId: choiceStep.id,
        order: 1
      }, tx);
    });

    await expect(stepService.updateStepById(choiceStep.id, testUserId, {
      config: {
        display: 'dropdown',
        allowMultiple: false,
        options: {
          type: 'static',
          options: [{ id: 'opt1', label: 'Option 1', alias: 'new_val' }]
        }
      },
      // Deliberately invalid: title is NOT NULL, so the write fails and the
      // transaction must roll back without having rewritten any logic rule.
      title: null as unknown as string
    })).rejects.toThrow();

    const rules = await logicRuleRepository.findByConditionStepId(choiceStep.id);
    expect(leafValue(rules[0].when)).toBe('old_val'); // Untouched
  });

  it('rolls back the step alias update when propagation fails atomically (DEBT-16)', async () => {
    const step = await stepService.createStep(testWorkflowId, testPageId, testUserId, {
      title: 'Contact Email',
      type: 'short_text',
      alias: 'contactEmail',
    });

    // Force a real failure in the first alias-rename propagation phase, which
    // now runs inside updateStepById's transaction. Atomic semantics mean this
    // must reject the whole call and leave the step's alias untouched — not
    // be caught, logged, and leave a step update that silently never committed.
    const findSpy = vi
      .spyOn(transformBlockRepository, 'findByWorkflowId')
      .mockRejectedValueOnce(new Error('boom'));

    await expect(
      stepService.updateStepById(step.id, testUserId, { alias: 'clientEmail' })
    ).rejects.toThrow('boom');

    findSpy.mockRestore();

    const reloaded = await stepRepository.findById(step.id);
    expect(reloaded?.alias).toBe('contactEmail');
  });

  it('no-ops when renaming an option that has no logic rules', async () => {
    const choiceStep = await stepService.createStep(testWorkflowId, testPageId, testUserId, {
      title: 'Choice',
      type: 'choice',
      config: {
        display: 'dropdown',
        allowMultiple: false,
        options: {
          type: 'static',
          options: [{ id: 'opt1', label: 'Option 1', alias: 'old_val' }]
        }
      }
    });

    const updateSpy = vi.spyOn(logicRuleRepository, 'update');
    
    await stepService.updateStepById(choiceStep.id, testUserId, {
      config: {
        display: 'dropdown',
        allowMultiple: false,
        options: {
          type: 'static',
          options: [{ id: 'opt1', label: 'Option 1', alias: 'new_val' }]
        }
      }
    });

    expect(updateSpy).not.toHaveBeenCalled();
    updateSpy.mockRestore();
  });
});
