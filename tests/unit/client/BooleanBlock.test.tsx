// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BooleanBlockRenderer } from '../../../client/src/components/runner/blocks/BooleanBlock';
import type { Step } from '../../../client/src/types';

function step(
  displayStyle: 'buttons' | 'radio' | 'toggle' | 'checkbox',
  configOverrides: Record<string, unknown> = {},
): Step {
  return {
    id: `boolean-${displayStyle}`,
    workflowId: 'workflow-1',
    pageId: 'page-1',
    type: 'boolean',
    title: 'Accept decision',
    description: null,
    required: false,
    alias: 'acceptDecision',
    order: 0,
    isVirtual: false,
    config: {
      trueLabel: 'Approve',
      falseLabel: 'Decline',
      storeAsBoolean: true,
      displayStyle,
      ...configOverrides,
    },
    createdAt: '2026-08-28T00:00:00.000Z',
  };
}

afterEach(cleanup);

describe('BooleanBlockRenderer', () => {
  it('renders accessible buttons and preserves null, true, and false selection states', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const view = render(
      <BooleanBlockRenderer step={step('buttons')} value={null} onChange={onChange} />
    );

    expect(screen.getByRole('group', { name: 'Accept decision' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Decline' })).toHaveAttribute('aria-pressed', 'false');

    await user.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onChange).toHaveBeenLastCalledWith(true);

    view.rerender(
      <BooleanBlockRenderer step={step('buttons')} value={false} onChange={onChange} />
    );
    expect(screen.getByRole('button', { name: 'Decline' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders a labelled radio group that supports keyboard selection', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<BooleanBlockRenderer step={step('radio')} value={null} onChange={onChange} />);

    const group = screen.getByRole('radiogroup', { name: 'Accept decision' });
    const approve = screen.getByRole('radio', { name: 'Approve' });
    const decline = screen.getByRole('radio', { name: 'Decline' });
    expect(group).toBeInTheDocument();
    expect(approve).not.toBeChecked();
    expect(decline).not.toBeChecked();

    decline.focus();
    await user.keyboard('[Space]');
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('renders a visually distinct toggle without converting an unset value on mount', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const view = render(
      <BooleanBlockRenderer step={step('toggle')} value={null} onChange={onChange} />
    );

    const group = screen.getByRole('group', { name: 'Accept decision' });
    const toggle = screen.getByRole('switch', { name: 'Accept decision: Approve' });
    expect(group).toHaveAttribute('data-value-state', 'unset');
    expect(toggle).not.toBeChecked();
    expect(onChange).not.toHaveBeenCalled();

    toggle.focus();
    await user.keyboard('[Space]');
    expect(onChange).toHaveBeenLastCalledWith(true);

    view.rerender(
      <BooleanBlockRenderer step={step('toggle')} value={false} onChange={onChange} />
    );
    expect(group).toHaveAttribute('data-value-state', 'false');
    expect(toggle).not.toBeChecked();
  });

  it('renders one accessible consent checkbox, preserves missing state, and stores aliases instead of labels', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const aliasStep = step('checkbox', {
      storeAsBoolean: false,
      trueAlias: 'decision_accepted',
      falseAlias: 'decision_declined',
    });
    const view = render(
      <BooleanBlockRenderer
        step={aliasStep}
        value={null}
        onChange={onChange}
        required
        hasError
        ariaDescribedBy="consent-error"
      />
    );

    const checkbox = screen.getByRole('checkbox', { name: 'Approve' });
    expect(checkbox).not.toBeChecked();
    expect(checkbox).toHaveAttribute('aria-required', 'true');
    expect(checkbox).toHaveAttribute('aria-invalid', 'true');
    expect(checkbox).toHaveAttribute('aria-describedby', 'consent-error');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByText('Decline')).not.toBeInTheDocument();

    checkbox.focus();
    await user.keyboard('[Space]');
    expect(onChange).toHaveBeenLastCalledWith('decision_accepted');

    view.rerender(
      <BooleanBlockRenderer step={aliasStep} value="decision_accepted" onChange={onChange} />
    );
    await user.click(screen.getByRole('checkbox', { name: 'Approve' }));
    expect(onChange).toHaveBeenLastCalledWith('decision_declined');
  });
});
