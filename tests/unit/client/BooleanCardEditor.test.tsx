// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BooleanCardEditor } from '../../../client/src/components/builder/cards/BooleanCardEditor';
import type { ApiStep } from '../../../client/src/lib/vault-api';
import { useUpdateStep, useWorkflowMode } from '../../../client/src/lib/vault-hooks';

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => undefined;
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => undefined;
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => undefined;
}

vi.mock('@/lib/vault-hooks', () => ({
  useUpdateStep: vi.fn(),
  useWorkflowMode: vi.fn(),
}));

vi.mock('@/components/builder/cards/common/AliasField', () => ({
  AliasField: () => <div data-testid="alias-field" />,
}));

vi.mock('@/components/builder/cards/common/RequiredToggle', () => ({
  RequiredToggle: () => <div data-testid="required-toggle" />,
}));

vi.mock('@/components/builder/cards/common/VisibilityField', () => ({
  VisibilityField: () => <div data-testid="visibility-field" />,
}));

vi.mock('@/components/builder/cards/common/DefaultValueField', () => ({
  DefaultValueField: ({ mode }: { mode: string }) => (
    <div data-testid="default-value" data-mode={mode} />
  ),
}));

function step(config: ApiStep['config'], type: ApiStep['type'] = 'boolean'): ApiStep {
  return {
    id: 'boolean-step',
    workflowId: 'workflow-1',
    pageId: 'page-1',
    type,
    title: 'Decision',
    description: null,
    required: false,
    alias: 'decision',
    order: 0,
    isVirtual: false,
    config,
    createdAt: '2026-08-28T00:00:00.000Z',
  };
}

function mockEditor(mode: 'easy' | 'advanced', mutate = vi.fn()): void {
  vi.mocked(useWorkflowMode).mockReturnValue({ data: { mode } } as ReturnType<typeof useWorkflowMode>);
  vi.mocked(useUpdateStep).mockReturnValue({ mutate } as unknown as ReturnType<typeof useUpdateStep>);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('BooleanCardEditor canonical modes', () => {
  it('exposes all implemented styles in Easy and persists the selected style canonically', async () => {
    const mutate = vi.fn();
    const user = userEvent.setup();
    mockEditor('easy', mutate);
    render(<BooleanCardEditor
      stepId="boolean-step"
      pageId="page-1"
      workflowId="workflow-1"
      step={step({
        trueLabel: 'Approve',
        falseLabel: 'Decline',
        storeAsBoolean: true,
        displayStyle: 'buttons',
      })}
    />);

    expect(screen.getByRole('combobox', { name: 'Answer style' })).toHaveTextContent('Buttons');
    expect(screen.queryByText('Storage Mode')).not.toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Answer style' }));
    expect(screen.getByRole('option', { name: 'Buttons' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Radio choices' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Toggle switch' })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Radio choices' }));

    expect(mutate).toHaveBeenLastCalledWith({
      id: 'boolean-step',
      pageId: 'page-1',
      config: {
        trueLabel: 'Approve',
        falseLabel: 'Decline',
        storeAsBoolean: true,
        displayStyle: 'radio',
      },
    });
    expect(mutate.mock.calls.flatMap((call) => Object.keys(call[0] as object))).not.toContain('type');
  });

  it('changes mode exposure without rewriting style, labels, or aliases', () => {
    const mutate = vi.fn();
    const canonicalStep = step({
      trueLabel: 'Enabled',
      falseLabel: 'Disabled',
      storeAsBoolean: false,
      trueAlias: 'enabled_value',
      falseAlias: 'disabled_value',
      displayStyle: 'toggle',
    });
    mockEditor('easy', mutate);
    const view = render(<BooleanCardEditor
      stepId="boolean-step" pageId="page-1" workflowId="workflow-1" step={canonicalStep}
    />);

    expect(screen.getByDisplayValue('Enabled')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Answer style' })).toHaveTextContent('Toggle switch');
    expect(screen.queryByDisplayValue('enabled_value')).not.toBeInTheDocument();

    mockEditor('advanced', mutate);
    view.rerender(<BooleanCardEditor
      stepId="boolean-step" pageId="page-1" workflowId="workflow-1" step={canonicalStep}
    />);

    expect(screen.getByDisplayValue('Enabled')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Disabled')).toBeInTheDocument();
    expect(screen.getByDisplayValue('enabled_value')).toBeInTheDocument();
    expect(screen.getByDisplayValue('disabled_value')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Answer style' })).toHaveTextContent('Toggle switch');
    expect(screen.getByTestId('default-value')).toHaveAttribute('data-mode', 'advanced');
    expect(mutate).not.toHaveBeenCalled();
  });

  it('reads a legacy Yes/No row without rewriting it on render', () => {
    const mutate = vi.fn();
    mockEditor('easy', mutate);
    render(<BooleanCardEditor
      stepId="boolean-step"
      pageId="page-1"
      workflowId="workflow-1"
      step={step({ yesLabel: 'Absolutely', noLabel: 'Never' }, 'yes_no')}
    />);

    expect(screen.getByDisplayValue('Absolutely')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Never')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Answer style' })).not.toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });
});
