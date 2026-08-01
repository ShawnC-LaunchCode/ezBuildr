import { it, expect, beforeEach, vi } from 'vitest';
import type { DbTransaction } from '../../../server/repositories/BaseRepository';
import { db } from '../../../server/db';
import { createTestFactory, TestFactory } from '../../helpers/testFactory';
import { describeWithDb } from '../../helpers/dbTestHelper';
import { stepService } from '../../../server/services/StepService';
import { logicRuleRepository } from '../../../server/repositories/LogicRuleRepository';
import { stepRepository, transformBlockRepository } from '../../../server/repositories';

describeWithDb('StepService DB', () => {
  let _factory: ReturnType<typeof createTestFactory>;
  let testUserId: string;
  let _testProjectId: string;
  let testWorkflowId: string;
  let testSectionId: string;
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

      const section = await txFactory.createSection(testWorkflowId, { title: 'Test Section' });
      testSectionId = section.id;
    });
  });

  it('rewrites logic rules on choice alias change', async () => {
    // 1. Create a choice step
    const choiceStep = await stepService.createStep(testWorkflowId, testSectionId, testUserId, {
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
        operator: 'equals',
        conditionValue: 'old_val1',
        action: 'show',
        targetType: 'step',
        targetStepId: choiceStep.id,
        order: 1
      }, tx);
      await logicRuleRepository.create({
        workflowId: testWorkflowId,
        conditionStepId: choiceStep.id,
        operator: 'contains',
        conditionValue: ['old_val1', 'old_val2'],
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
    expect(rule1?.conditionValue).toBe('new_val1');
    
    const rule2 = rules.find(r => r.order === 2);
    expect(rule2?.conditionValue).toEqual(['new_val1', 'old_val2']);
  });

  it('scans visibleIf for old alias occurrences and returns warnings', async () => {
    // 1. Create a choice step
    const choiceStep = await stepService.createStep(testWorkflowId, testSectionId, testUserId, {
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
    await stepService.createStep(testWorkflowId, testSectionId, testUserId, {
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

  it('does not rewrite logic rules for a different step with a coincidentally equal conditionValue', async () => {
    const choiceStep = await stepService.createStep(testWorkflowId, testSectionId, testUserId, {
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

    const otherChoiceStep = await stepService.createStep(testWorkflowId, testSectionId, testUserId, {
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
        operator: 'equals',
        conditionValue: 'shared_val',
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
    expect(rules[0].conditionValue).toBe('shared_val'); // Untouched
  });

  it('does not rewrite rules if step update fails', async () => {
    const choiceStep = await stepService.createStep(testWorkflowId, testSectionId, testUserId, {
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
        operator: 'equals',
        conditionValue: 'old_val',
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
    expect(rules[0].conditionValue).toBe('old_val'); // Untouched
  });

  it('rolls back the step alias update when propagation fails atomically (DEBT-16)', async () => {
    const step = await stepService.createStep(testWorkflowId, testSectionId, testUserId, {
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
    const choiceStep = await stepService.createStep(testWorkflowId, testSectionId, testUserId, {
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
