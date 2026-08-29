// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DateTimeCardEditor } from '../../../client/src/components/builder/cards/DateTimeCardEditor';
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
  DefaultValueField: ({ mode, type }: { mode: string; type: string }) => (
    <div data-testid="default-value" data-mode={mode} data-type={type} />
  ),
}));

function step(config: ApiStep['config'], type: ApiStep['type'] = 'date_time'): ApiStep {
  return {
    id: 'step-1',
    workflowId: 'workflow-1',
    pageId: 'page-1',
    type,
    title: 'Appointment',
    description: null,
    required: false,
    alias: 'appointment',
    defaultValue: '2026-08-28T14:30',
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

describe('DateTimeCardEditor canonical modes', () => {
  it.each([
    ['date', 'Date'],
    ['time', 'Time'],
    ['datetime', 'Date & Time'],
  ] as const)('keeps the Easy %s preset fixed by kind without rewriting config', (kind, label) => {
    const mutate = vi.fn();
    mockEditor('easy', mutate);
    render(<DateTimeCardEditor
      stepId="step-1"
      pageId="page-1"
      workflowId="workflow-1"
      step={step({ kind, minDate: '2026-01-01', timeFormat: '24h', timeStep: 5 })}
    />);

    expect(screen.getByRole('radio', { name: label })).toBeChecked();
    expect(screen.getByRole('radio', { name: label })).toBeDisabled();
    expect(screen.getByTestId('default-value')).toHaveAttribute('data-type', 'date_time');
    expect(screen.getByTestId('default-value')).toHaveAttribute('data-mode', 'easy');
    expect(mutate).not.toHaveBeenCalled();
  });

  it('switches mode and kind without dropping sibling settings or changing stored type', async () => {
    const mutate = vi.fn();
    const canonicalStep = step({
      kind: 'datetime',
      minDate: '2026-01-01',
      maxDate: '2026-12-31',
      defaultToToday: true,
      timeFormat: '24h',
      timeStep: 5,
    });
    mockEditor('easy', mutate);
    const view = render(<DateTimeCardEditor
      stepId="step-1"
      pageId="page-1"
      workflowId="workflow-1"
      step={canonicalStep}
    />);

    expect(screen.getByDisplayValue('2026-01-01')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-12-31')).toBeInTheDocument();
    expect(screen.getByDisplayValue('5')).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();

    mockEditor('advanced', mutate);
    view.rerender(<DateTimeCardEditor
      stepId="step-1"
      pageId="page-1"
      workflowId="workflow-1"
      step={canonicalStep}
    />);

    await userEvent.click(screen.getByRole('radio', { name: 'Time' }));
    expect(mutate).toHaveBeenLastCalledWith({
      id: 'step-1',
      pageId: 'page-1',
      config: {
        kind: 'time',
        minDate: '2026-01-01',
        maxDate: '2026-12-31',
        defaultToToday: true,
        timeFormat: '24h',
        timeStep: 5,
      },
    });
    expect(mutate.mock.calls.flatMap((call) => Object.keys(call[0] as object))).not.toContain('type');
  });

  it('reads legacy aliases into the canonical editor without writing until edited', () => {
    const mutate = vi.fn();
    mockEditor('advanced', mutate);
    render(<DateTimeCardEditor
      stepId="step-1"
      pageId="page-1"
      workflowId="workflow-1"
      step={step({ format: '24h', step: 10 }, 'time')}
    />);

    expect(screen.getByRole('radio', { name: 'Time' })).toBeChecked();
    expect(screen.getByDisplayValue('10')).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });
});
