// @vitest-environment jsdom
/**
 * LogicRuleEditor (LU-6b) — the target/action picker wrapped around the
 * shared `LogicBuilder`. `LogicBuilder` itself is mocked to a minimal stub
 * here: its own condition-tree behavior is already covered by
 * `tests/unit/client/LogicBuilder.test.tsx` and `ConditionRow.test.tsx` — this
 * file exercises what THIS component owns: target-type/action pairing
 * (AC1/AC2), skip_to's section-only target, and the create/update payload
 * shape (never sending `conditionStepId` — the server derives it, O-7).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const toastSpy = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastSpy }) }));

const FAKE_WHEN = {
  type: 'group' as const,
  id: 'g1',
  operator: 'AND' as const,
  conditions: [
    { type: 'condition' as const, id: 'c1', variable: 'trigger', operator: 'equals' as const, value: 'yes', valueType: 'constant' as const },
  ],
};

vi.mock('@/components/logic', () => ({
  LogicBuilder: (props: any) => (
    <button type="button" onClick={() => props.onChange(FAKE_WHEN)}>
      set-condition
    </button>
  ),
}));

import { LogicRuleEditor } from '../../../../client/src/components/builder/logic/LogicRuleEditor';

import type { ApiSection, ApiStep } from '@/lib/vault-api';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => undefined;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined;
  }
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const STEPS = [
  { id: 'step-1', title: 'First step', alias: 'firstStep' },
  { id: 'step-2', title: 'Second step', alias: null },
] as unknown as ApiStep[];

const SECTIONS = [
  { id: 'section-1', title: 'Section One' },
  { id: 'section-2', title: 'Section Two' },
] as unknown as ApiSection[];

async function chooseSelectOption(triggerId: string, optionText: string): Promise<void> {
  const user = userEvent.setup();
  const trigger = document.getElementById(triggerId);
  if (!trigger) { throw new Error(`No trigger with id ${triggerId}`); }
  await user.click(trigger);
  const option = await screen.findByText(optionText);
  await user.click(option);
}

async function openSelect(triggerId: string): Promise<void> {
  const user = userEvent.setup();
  const trigger = document.getElementById(triggerId);
  if (!trigger) { throw new Error(`No trigger with id ${triggerId}`); }
  await user.click(trigger);
}

describe('LogicRuleEditor — target/action pairing (LU-6b AC1/AC2)', () => {
  it('defaults to section target with show/hide/skip_to actions available', async () => {
    render(
      <LogicRuleEditor workflowId="wf-1" steps={STEPS} sections={SECTIONS} isSaving={false} onSave={vi.fn()} onCancel={vi.fn()} />
    );

    await openSelect('rule-action');
    expect(await screen.findByRole('option', { name: 'Show' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Hide' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Skip to' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Require' })).not.toBeInTheDocument();
  });

  it('switching target type to Question offers require/make_optional instead of skip_to', async () => {
    render(
      <LogicRuleEditor workflowId="wf-1" steps={STEPS} sections={SECTIONS} isSaving={false} onSave={vi.fn()} onCancel={vi.fn()} />
    );

    await chooseSelectOption('rule-target-type', 'Question');

    await openSelect('rule-action');
    expect(await screen.findByRole('option', { name: 'Require' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Make optional' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Skip to' })).not.toBeInTheDocument();
  });

  it('the target picker lists sections when target type is section, and steps when it is a question', async () => {
    render(
      <LogicRuleEditor workflowId="wf-1" steps={STEPS} sections={SECTIONS} isSaving={false} onSave={vi.fn()} onCancel={vi.fn()} />
    );

    await openSelect('rule-target');
    expect(await screen.findByRole('option', { name: 'Section One' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Section Two' })).toBeInTheDocument();
    await userEvent.setup().keyboard('{Escape}'); // close the open listbox before touching another trigger

    await chooseSelectOption('rule-target-type', 'Question');

    await openSelect('rule-target');
    expect(await screen.findByRole('option', { name: 'First step (firstStep)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Second step' })).toBeInTheDocument();
  });
});

describe('LogicRuleEditor — save payload (LU-6b AC1/AC3, O-7)', () => {
  it('rejects saving without a chosen target', async () => {
    const onSave = vi.fn();
    render(
      <LogicRuleEditor workflowId="wf-1" steps={STEPS} sections={SECTIONS} isSaving={false} onSave={onSave} onCancel={vi.fn()} />
    );

    fireEvent.click(screen.getByText('set-condition'));
    fireEvent.click(screen.getByText('Add rule'));

    expect(onSave).not.toHaveBeenCalled();
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: 'Choose a target' }));
  });

  it('rejects saving without a valid condition', async () => {
    const onSave = vi.fn();
    render(
      <LogicRuleEditor workflowId="wf-1" steps={STEPS} sections={SECTIONS} isSaving={false} onSave={onSave} onCancel={vi.fn()} />
    );

    await chooseSelectOption('rule-target', 'Section One');
    fireEvent.click(screen.getByText('Add rule'));

    expect(onSave).not.toHaveBeenCalled();
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: 'Add a condition' }));
  });

  it('calls onSave with the target/action/when payload and never includes conditionStepId (O-7 — server derives it)', async () => {
    const onSave = vi.fn();
    render(
      <LogicRuleEditor workflowId="wf-1" steps={STEPS} sections={SECTIONS} isSaving={false} onSave={onSave} onCancel={vi.fn()} />
    );

    await chooseSelectOption('rule-target', 'Section One');
    fireEvent.click(screen.getByText('set-condition'));
    fireEvent.click(screen.getByText('Add rule'));

    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0];
    expect(payload).toEqual(
      expect.objectContaining({
        targetType: 'section',
        targetSectionId: 'section-1',
        targetStepId: null,
        action: 'show',
        when: FAKE_WHEN,
      })
    );
    expect(payload).not.toHaveProperty('conditionStepId');
  });

  it('offers skip_to as an action and includes it in the saved payload', async () => {
    const onSave = vi.fn();
    render(
      <LogicRuleEditor workflowId="wf-1" steps={STEPS} sections={SECTIONS} isSaving={false} onSave={onSave} onCancel={vi.fn()} />
    );

    await chooseSelectOption('rule-target', 'Section Two');
    await chooseSelectOption('rule-action', 'Skip to');
    fireEvent.click(screen.getByText('set-condition'));
    fireEvent.click(screen.getByText('Add rule'));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'skip_to', targetType: 'section', targetSectionId: 'section-2' })
    );
  });

  it('saving a require rule against a question target', async () => {
    const onSave = vi.fn();
    render(
      <LogicRuleEditor workflowId="wf-1" steps={STEPS} sections={SECTIONS} isSaving={false} onSave={onSave} onCancel={vi.fn()} />
    );

    await chooseSelectOption('rule-target-type', 'Question');
    await chooseSelectOption('rule-target', 'First step (firstStep)');
    await chooseSelectOption('rule-action', 'Require');
    fireEvent.click(screen.getByText('set-condition'));
    fireEvent.click(screen.getByText('Add rule'));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'require', targetType: 'step', targetStepId: 'step-1' })
    );
  });

  it('saving a make_optional rule against a question target', async () => {
    const onSave = vi.fn();
    render(
      <LogicRuleEditor workflowId="wf-1" steps={STEPS} sections={SECTIONS} isSaving={false} onSave={onSave} onCancel={vi.fn()} />
    );

    await chooseSelectOption('rule-target-type', 'Question');
    await chooseSelectOption('rule-target', 'Second step');
    await chooseSelectOption('rule-action', 'Make optional');
    fireEvent.click(screen.getByText('set-condition'));
    fireEvent.click(screen.getByText('Add rule'));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'make_optional', targetType: 'step', targetStepId: 'step-2' })
    );
  });

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn();
    render(
      <LogicRuleEditor workflowId="wf-1" steps={STEPS} sections={SECTIONS} isSaving={false} onSave={vi.fn()} onCancel={onCancel} />
    );

    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('LogicRuleEditor — editing an existing rule', () => {
  it('seeds target/action/when from the passed rule and saves "Save rule"', async () => {
    const onSave = vi.fn();
    const rule = {
      id: 'rule-1',
      workflowId: 'wf-1',
      conditionStepId: 'step-1',
      when: FAKE_WHEN,
      targetType: 'step' as const,
      targetStepId: 'step-2',
      targetSectionId: null,
      action: 'hide' as const,
      order: 1,
    };

    render(
      <LogicRuleEditor workflowId="wf-1" steps={STEPS} sections={SECTIONS} rule={rule} isSaving={false} onSave={onSave} onCancel={vi.fn()} />
    );

    expect(screen.getByText('Save rule')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Save rule'));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ targetType: 'step', targetStepId: 'step-2', action: 'hide', when: FAKE_WHEN, order: 1 })
    );
  });
});
