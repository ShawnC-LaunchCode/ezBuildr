// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TextCardEditor } from '../../../client/src/components/builder/cards/TextCardEditor';
import { useUpdateStep, useWorkflowMode } from '../../../client/src/lib/vault-hooks';
import type { ApiStep } from '../../../client/src/lib/vault-api';

vi.mock('@/lib/vault-hooks', () => ({
  useUpdateStep: vi.fn(),
  useWorkflowMode: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
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
  DefaultValueField: ({ mode, type, defaultValue }: { mode: string; type: string; defaultValue: unknown }) => (
    <div data-testid="default-value" data-mode={mode} data-type={type}>{String(defaultValue ?? '')}</div>
  ),
}));

function step(config: ApiStep['config'], type: ApiStep['type'] = 'text'): ApiStep {
  return {
    id: 'step-1',
    workflowId: 'workflow-1',
    pageId: 'page-1',
    type,
    title: 'Biography',
    description: null,
    required: false,
    alias: 'biography',
    defaultValue: 'Existing default',
    order: 0,
    isVirtual: false,
    config,
    createdAt: '2026-08-27T00:00:00.000Z',
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

describe('TextCardEditor canonical modes', () => {
  it('uses effective Easy mode to keep the preset variant fixed without rewriting identity', () => {
    const mutate = vi.fn();
    mockEditor('easy', mutate);

    render(<TextCardEditor
      stepId="step-1"
      pageId="page-1"
      workflowId="workflow-1"
      step={step({
        variant: 'long',
        placeholder: 'Tell us more',
        helpText: 'Stored guidance',
        autoComplete: 'off',
        validation: { minLength: 5, maxLength: 200, pattern: '^[A-Z]', patternMessage: 'Start uppercase' },
      })}
    />);

    expect(screen.getByRole('radio', { name: /Long Text/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Long Text/ })).toBeDisabled();
    expect(screen.getByDisplayValue('Tell us more')).toBeInTheDocument();
    expect(screen.getByDisplayValue('5')).toBeInTheDocument();
    expect(screen.getByDisplayValue('200')).toBeInTheDocument();
    expect(screen.queryByLabelText('Pattern (Regex)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Custom Error Message')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Help Text')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Browser Autocomplete')).not.toBeInTheDocument();
    expect(screen.getByTestId('default-value')).toHaveAttribute('data-mode', 'easy');
    expect(screen.getByTestId('default-value')).toHaveAttribute('data-type', 'text');
    expect(screen.getByTestId('default-value')).toHaveTextContent('Existing default');
    expect(mutate).not.toHaveBeenCalled();
  });

  it('switches exposure to Advanced without changing type or dropping config', async () => {
    const mutate = vi.fn();
    mockEditor('easy', mutate);
    const canonicalStep = step({
      variant: 'long',
      placeholder: 'Tell us more',
      helpText: 'Include relevant details',
      autoComplete: 'off',
      validation: { minLength: 5, maxLength: 200, pattern: '^[A-Z]', patternMessage: 'Start uppercase' },
    });
    const view = render(<TextCardEditor stepId="step-1" pageId="page-1" workflowId="workflow-1" step={canonicalStep} />);

    mockEditor('advanced', mutate);
    view.rerender(<TextCardEditor stepId="step-1" pageId="page-1" workflowId="workflow-1" step={canonicalStep} />);

    expect(screen.getByRole('radio', { name: /Long Text/ })).toBeEnabled();
    expect(screen.getByDisplayValue('Tell us more')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Include relevant details')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('off')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('^[A-Z]')).toBeInTheDocument();
    expect(screen.getByTestId('default-value')).toHaveAttribute('data-mode', 'advanced');
    expect(mutate).not.toHaveBeenCalled();

    mockEditor('easy', mutate);
    view.rerender(<TextCardEditor stepId="step-1" pageId="page-1" workflowId="workflow-1" step={canonicalStep} />);
    expect(screen.queryByDisplayValue('^[A-Z]')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('5')).toBeInTheDocument();
    expect(screen.getByDisplayValue('200')).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();

    mockEditor('advanced', mutate);
    view.rerender(<TextCardEditor stepId="step-1" pageId="page-1" workflowId="workflow-1" step={canonicalStep} />);

    await userEvent.click(screen.getByRole('radio', { name: /Short Text/ }));

    expect(mutate).toHaveBeenLastCalledWith({
      id: 'step-1',
      pageId: 'page-1',
      config: {
        variant: 'short',
        placeholder: 'Tell us more',
        helpText: 'Include relevant details',
        autoComplete: 'off',
        validation: { minLength: 5, maxLength: 200, pattern: '^[A-Z]', patternMessage: 'Start uppercase' },
      },
    });
    expect(mutate.mock.calls.flatMap((call) => Object.keys(call[0] as object))).not.toContain('type');
  });

  it('reads legacy long-text config without writing until the author edits', () => {
    const mutate = vi.fn();
    mockEditor('advanced', mutate);

    render(<TextCardEditor
      stepId="step-1"
      pageId="page-1"
      workflowId="workflow-1"
      step={step({ placeholder: 'Legacy hint', maxLength: 80 }, 'long_text')}
    />);

    expect(screen.getByRole('radio', { name: /Long Text/ })).toBeChecked();
    expect(screen.getByDisplayValue('Legacy hint')).toBeInTheDocument();
    expect(screen.getByDisplayValue('80')).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });
});
