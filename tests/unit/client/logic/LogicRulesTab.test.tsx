// @vitest-environment jsdom
/**
 * LogicRulesTab (LU-6b) — the workflow-scoped rule list: create, edit,
 * delete, and reorder. Ordering is author-visible (AC2): `evaluateRules`
 * (shared/workflowLogic.ts) sorts section-targeted rules by `order` and the
 * first firing `skip_to` wins.
 *
 * `LogicRuleEditor`'s own target/action-pairing coverage lives in
 * `LogicRuleEditor.test.tsx`; this file exercises what the LIST owns:
 * rendering, wiring Add/Edit/Delete/Reorder to the right mutation with the
 * right arguments, and the empty state.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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

const listRulesMock = vi.fn();
const createMutateMock = vi.fn();
const updateMutateMock = vi.fn();
const deleteMutateMock = vi.fn();
const reorderMutateMock = vi.fn();

vi.mock('@/hooks/api/useLogicRules', () => ({
  useLogicRules: () => listRulesMock(),
  useCreateLogicRule: () => ({ mutate: createMutateMock, isPending: false }),
  useUpdateLogicRule: () => ({ mutate: updateMutateMock, isPending: false }),
  useDeleteLogicRule: () => ({ mutate: deleteMutateMock, isPending: false }),
  useReorderLogicRules: () => ({ mutate: reorderMutateMock, isPending: false }),
}));

vi.mock('@/lib/vault-hooks', () => ({
  useSections: () => ({
    data: [
      { id: 'section-1', title: 'Section One' },
      { id: 'section-2', title: 'Section Two' },
    ],
  }),
  useWorkflowSteps: () => ({
    data: [
      { id: 'step-1', title: 'First step', alias: 'firstStep' },
      { id: 'step-2', title: 'Second step', alias: null },
    ],
  }),
}));

import { LogicRulesTab } from '../../../../client/src/components/builder/logic/LogicRulesTab';

import type { ApiLogicRule } from '@/lib/vault-api';

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

function rule(overrides: Partial<ApiLogicRule>): ApiLogicRule {
  return {
    id: 'rule-1',
    workflowId: 'wf-1',
    conditionStepId: 'step-1',
    when: FAKE_WHEN,
    targetType: 'step',
    targetStepId: 'step-2',
    targetSectionId: null,
    action: 'show',
    order: 1,
    ...overrides,
  };
}

beforeEach(() => {
  // mutate() calls its onSuccess callback synchronously by default, matching
  // a resolved React Query mutation — individual tests override when they
  // need to assert the pre-callback call shape only.
  createMutateMock.mockImplementation((_vars, opts) => opts?.onSuccess?.());
  updateMutateMock.mockImplementation((_vars, opts) => opts?.onSuccess?.());
  deleteMutateMock.mockImplementation((_vars, opts) => opts?.onSuccess?.());
});

describe('LogicRulesTab — empty state', () => {
  it('shows a prompt to add a rule when there are none', () => {
    listRulesMock.mockReturnValue({ data: [], isLoading: false });
    render(<LogicRulesTab workflowId="wf-1" />);

    expect(screen.getByText(/no rules yet/i)).toBeInTheDocument();
  });
});

describe('LogicRulesTab — rendering existing rules', () => {
  it('shows the action, target label, and condition summary for each rule', () => {
    listRulesMock.mockReturnValue({
      data: [rule({ id: 'r1', action: 'hide', targetType: 'step', targetStepId: 'step-2' })],
      isLoading: false,
    });
    render(<LogicRulesTab workflowId="wf-1" />);

    const row = screen.getByTestId('logic-rule-r1');
    expect(within(row).getByText('Hide')).toBeInTheDocument();
    expect(within(row).getByText('Second step')).toBeInTheDocument();
    expect(within(row).getByText(/When:/)).toBeInTheDocument();
  });

  it('resolves a section target label from the sections list', () => {
    listRulesMock.mockReturnValue({
      data: [rule({ id: 'r1', action: 'skip_to', targetType: 'section', targetStepId: null, targetSectionId: 'section-2' })],
      isLoading: false,
    });
    render(<LogicRulesTab workflowId="wf-1" />);

    const row = screen.getByTestId('logic-rule-r1');
    expect(within(row).getByText('Skip to')).toBeInTheDocument();
    expect(within(row).getByText('Section Two')).toBeInTheDocument();
  });
});

describe('LogicRulesTab — create (AC1)', () => {
  it('opens the editor from "Add rule" and creates via useCreateLogicRule with the workflowId', async () => {
    listRulesMock.mockReturnValue({ data: [], isLoading: false });
    render(<LogicRulesTab workflowId="wf-1" />);

    fireEvent.click(screen.getByText('Add rule'));
    // Section target type is the editor's default; a target must still be chosen.
    const user = userEvent.setup();
    await user.click(document.getElementById('rule-target')!);
    await user.click(await screen.findByRole('option', { name: 'Section One' }));
    fireEvent.click(screen.getByText('set-condition'));
    fireEvent.click(screen.getByText('Add rule'));

    expect(createMutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: 'wf-1',
        targetType: 'section',
        targetSectionId: 'section-1',
        action: 'show',
        when: FAKE_WHEN,
      }),
      expect.anything()
    );
  });
});

describe('LogicRulesTab — edit (AC1)', () => {
  it('opens the editor pre-filled from Edit and updates via useUpdateLogicRule with the rule id', () => {
    listRulesMock.mockReturnValue({
      data: [rule({ id: 'r1', action: 'hide' })],
      isLoading: false,
    });
    render(<LogicRulesTab workflowId="wf-1" />);

    fireEvent.click(screen.getByLabelText('Edit rule'));
    expect(screen.getByText('Save rule')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Save rule'));

    expect(updateMutateMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'r1', workflowId: 'wf-1', action: 'hide' }),
      expect.anything()
    );
  });
});

describe('LogicRulesTab — delete (AC1)', () => {
  it('confirms via dialog before calling useDeleteLogicRule', () => {
    listRulesMock.mockReturnValue({
      data: [rule({ id: 'r1' })],
      isLoading: false,
    });
    render(<LogicRulesTab workflowId="wf-1" />);

    fireEvent.click(screen.getByLabelText('Delete rule'));
    expect(screen.getByText('Delete this rule?')).toBeInTheDocument();
    expect(deleteMutateMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Delete'));

    expect(deleteMutateMock).toHaveBeenCalledWith(
      { id: 'r1', workflowId: 'wf-1' },
      expect.anything()
    );
  });

  it('does not delete when the confirmation is cancelled', () => {
    listRulesMock.mockReturnValue({
      data: [rule({ id: 'r1' })],
      isLoading: false,
    });
    render(<LogicRulesTab workflowId="wf-1" />);

    fireEvent.click(screen.getByLabelText('Delete rule'));
    fireEvent.click(screen.getByText('Cancel'));

    expect(deleteMutateMock).not.toHaveBeenCalled();
  });
});

describe('LogicRulesTab — reorder (AC2, author-controllable order)', () => {
  it('moving a rule down swaps its order with the next rule', () => {
    listRulesMock.mockReturnValue({
      data: [rule({ id: 'r1', order: 1 }), rule({ id: 'r2', order: 2 })],
      isLoading: false,
    });
    render(<LogicRulesTab workflowId="wf-1" />);

    const firstRow = screen.getByTestId('logic-rule-r1');
    fireEvent.click(within(firstRow).getByLabelText('Move rule down'));

    expect(reorderMutateMock).toHaveBeenCalledWith({
      workflowId: 'wf-1',
      rules: [
        { id: 'r1', order: 2 },
        { id: 'r2', order: 1 },
      ],
    });
  });

  it('moving a rule up swaps its order with the previous rule', () => {
    listRulesMock.mockReturnValue({
      data: [rule({ id: 'r1', order: 1 }), rule({ id: 'r2', order: 2 })],
      isLoading: false,
    });
    render(<LogicRulesTab workflowId="wf-1" />);

    const secondRow = screen.getByTestId('logic-rule-r2');
    fireEvent.click(within(secondRow).getByLabelText('Move rule up'));

    expect(reorderMutateMock).toHaveBeenCalledWith({
      workflowId: 'wf-1',
      rules: [
        { id: 'r2', order: 1 },
        { id: 'r1', order: 2 },
      ],
    });
  });

  it('disables "up" on the first rule and "down" on the last rule', () => {
    listRulesMock.mockReturnValue({
      data: [rule({ id: 'r1', order: 1 }), rule({ id: 'r2', order: 2 })],
      isLoading: false,
    });
    render(<LogicRulesTab workflowId="wf-1" />);

    const firstRow = screen.getByTestId('logic-rule-r1');
    const secondRow = screen.getByTestId('logic-rule-r2');
    expect(within(firstRow).getByLabelText('Move rule up')).toBeDisabled();
    expect(within(secondRow).getByLabelText('Move rule down')).toBeDisabled();
    expect(within(firstRow).getByLabelText('Move rule down')).toBeEnabled();
    expect(within(secondRow).getByLabelText('Move rule up')).toBeEnabled();
  });
});
