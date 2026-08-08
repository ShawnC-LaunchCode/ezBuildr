// @vitest-environment jsdom
/**
 * LogicBuilder (LU-2) — Decision #2: `LogicBuilder` stays one component and
 * gains an optional injected `variables` prop that replaces its internal
 * `useWorkflowVariables` fetch entirely (O-2 removed the companion
 * `useWorkflowSteps` query), rather than
 * fetching and discarding (`enabled: false`, not "fetch then ignore").
 *
 * This is the plumbing that let `ListFieldSettings` stop hand-wiring
 * `ConditionGroup` itself — see
 * `tests/unit/client/list/ListFieldSettings.test.tsx` for the caller-side
 * (sibling-field) coverage of the same injected path.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const { useWorkflowVariablesMock, useWorkflowStepsMock } = vi.hoisted(() => ({
  useWorkflowVariablesMock: vi.fn(),
  useWorkflowStepsMock: vi.fn(),
}));

vi.mock('@/lib/vault-hooks', () => ({
  useWorkflowVariables: useWorkflowVariablesMock,
  useWorkflowSteps: useWorkflowStepsMock,
}));

import { LogicBuilder } from '../../../client/src/components/logic/LogicBuilder';

import type { VariableInfo } from '@shared/types/conditions';

// Radix Select needs these polyfilled in jsdom before it will open (same
// recipe as tests/unit/client/ListDrillEditor.test.tsx).
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

const SIBLING_VARIABLES: VariableInfo[] = [
  {
    id: 'trigger',
    alias: 'trigger',
    label: 'Trigger field',
    title: 'Trigger field',
    type: 'short_text',
    sectionId: 'this-item',
    sectionTitle: "This item's fields",
  },
];

describe('LogicBuilder — injected variables gate the workflow fetch (LU-2 AC1)', () => {
  it('disables useWorkflowVariables when a variable list is injected', () => {
    useWorkflowVariablesMock.mockReturnValue({ data: undefined, isLoading: false });
    useWorkflowStepsMock.mockReturnValue({ data: undefined });

    render(
      <LogicBuilder
        elementType="field"
        value={null}
        onChange={vi.fn()}
        variables={SIBLING_VARIABLES}
      />
    );

    // The hook is still invoked (Rules of Hooks), but gated off via
    // `enabled: false` rather than fetched and discarded.
    expect(useWorkflowVariablesMock).toHaveBeenCalledWith(undefined, { enabled: false });
    // O-2 removed the companion useWorkflowSteps fetch entirely — choices now
    // arrive on the variable itself, so there is no second query to gate.
    expect(useWorkflowStepsMock).not.toHaveBeenCalled();
  });

  it('leaves the fetch enabled on the workflow-variables path when no list is injected', () => {
    useWorkflowVariablesMock.mockReturnValue({ data: [], isLoading: false });
    useWorkflowStepsMock.mockReturnValue({ data: [] });

    render(
      <LogicBuilder
        workflowId="wf-1"
        elementId="step-1"
        elementType="step"
        value={null}
        onChange={vi.fn()}
      />
    );

    expect(useWorkflowVariablesMock).toHaveBeenCalledWith('wf-1', { enabled: true });
    // O-2: no second steps query on this path either.
    expect(useWorkflowStepsMock).not.toHaveBeenCalled();
  });
});

describe('LogicBuilder — fetch path still renders workflow variables (LU-2 AC4)', () => {
  it('offers the fetched workflow variable as an operand once conditions are enabled', async () => {
    useWorkflowVariablesMock.mockReturnValue({
      data: [
        {
          key: 'q1',
          alias: 'first_name',
          label: 'First name',
          type: 'short_text',
          sectionId: 's1',
          sectionTitle: 'Page 1',
        },
      ],
      isLoading: false,
    });
    useWorkflowStepsMock.mockReturnValue({ data: [] });

    render(
      <LogicBuilder
        workflowId="wf-1"
        elementId="step-2"
        elementType="step"
        value={null}
        onChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('switch'));

    const user = userEvent.setup();
    const variableTrigger = (await screen.findAllByRole('combobox'))[0];
    await user.click(variableTrigger);

    expect(await screen.findByRole('option', { name: /first_name/i })).toBeInTheDocument();
  });
});

describe('LogicBuilder — injected-variables path renders sibling operands (LU-2 AC1/AC4)', () => {
  it('renders the injected sibling as an operand and round-trips an edited condition through onChange on Apply', async () => {
    const onChange = vi.fn();
    useWorkflowVariablesMock.mockReturnValue({ data: undefined, isLoading: false });
    useWorkflowStepsMock.mockReturnValue({ data: undefined });

    render(
      <LogicBuilder
        elementType="field"
        value={null}
        onChange={onChange}
        variables={SIBLING_VARIABLES}
      />
    );

    // No loading skeleton on the injected path — the Switch is available
    // immediately rather than waiting on the (disabled) fetch to resolve.
    fireEvent.click(screen.getByRole('switch'));

    const user = userEvent.setup();
    const variableTrigger = (await screen.findAllByRole('combobox'))[0];
    await user.click(variableTrigger);
    await user.click(await screen.findByRole('option', { name: /trigger/i }));

    fireEvent.click(screen.getByRole('button', { name: /apply changes/i }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const [expression] = onChange.mock.calls[0] as [{ type: string; conditions: Array<{ variable: string }> }];
    expect(expression).toMatchObject({
      type: 'group',
      conditions: [expect.objectContaining({ variable: 'trigger' })],
    });
  });

  it('shows a sibling-specific empty state instead of the workflow-variables message when the injected list is empty', () => {
    useWorkflowVariablesMock.mockReturnValue({ data: undefined, isLoading: false });
    useWorkflowStepsMock.mockReturnValue({ data: undefined });

    render(
      <LogicBuilder elementType="field" value={null} onChange={vi.fn()} variables={[]} />
    );

    expect(screen.getByText(/add another field at this level/i)).toBeInTheDocument();
    expect(screen.queryByText(/add some questions to your workflow/i)).not.toBeInTheDocument();
  });
});
