// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ListCardEditor } from '../../../client/src/components/builder/cards/ListCardEditor';
import type { ApiStep } from '../../../client/src/lib/vault-api';

import type { ListConfig } from '@shared/types/stepConfigs';

const { updateStepMock } = vi.hoisted(() => ({
  updateStepMock: vi.fn(),
}));

vi.mock('@/lib/vault-hooks', () => ({
  useUpdateStep: () => ({ mutate: updateStepMock }),
}));

vi.mock('@/hooks/api/useSteps', () => ({
  useWorkflowSteps: () => ({ data: [] }),
}));

function listConfig(title = 'Guest name', alias = 'guest_name'): ListConfig {
  return {
    fields: [{
      id: 'field-1',
      kind: 'question',
      type: 'scale',
      title,
      alias,
      order: 0,
      config: { min: 1, max: 10, step: 1, display: 'slider' },
    }],
  };
}

function listStep(id: string, config: ListConfig): ApiStep {
  return {
    id,
    workflowId: 'workflow-1',
    sectionId: 'section-1',
    type: 'list',
    title: 'Guests',
    description: null,
    required: false,
    alias: 'guests',
    order: 0,
    config,
    createdAt: '2026-08-02T00:00:00.000Z',
  };
}

function renderEditor(step: ApiStep) {
  return render(
    <ListCardEditor
      stepId={step.id}
      sectionId={step.sectionId}
      workflowId=""
      step={step}
    />
  );
}

function changeFieldTitle(value: string): void {
  const titleInput = screen.getByPlaceholderText('Field title');
  fireEvent.change(titleInput, { target: { value } });
}

describe('ListCardEditor config debounce (LIST2-13)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    updateStepMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('updates title, alias, and config locally on every keystroke but sends one latest-value mutation', () => {
    renderEditor(listStep('step-1', listConfig()));

    changeFieldTitle('G');
    changeFieldTitle('Guest');
    changeFieldTitle('Guest full name');

    const aliasInput = screen.getByPlaceholderText('alias');
    fireEvent.change(aliasInput, { target: { value: 'guest' } });
    fireEvent.change(aliasInput, { target: { value: 'guest_full_name' } });

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const minimumLabel = screen.getByText(/^Minimum Value/, { selector: 'label' });
    const minimumInput = minimumLabel.nextElementSibling as HTMLInputElement;
    fireEvent.change(minimumInput, { target: { value: '3' } });

    expect(screen.getByDisplayValue('Guest full name')).toBeInTheDocument();
    expect(screen.getByDisplayValue('guest_full_name')).toBeInTheDocument();
    expect(minimumInput).toHaveValue(3);
    expect(updateStepMock).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(599);
    });
    expect(updateStepMock).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(updateStepMock).toHaveBeenCalledTimes(1);
    expect(updateStepMock).toHaveBeenCalledWith({
      id: 'step-1',
      sectionId: 'section-1',
      config: {
        fields: [{
          id: 'field-1',
          kind: 'question',
          type: 'scale',
          title: 'Guest full name',
          alias: 'guest_full_name',
          order: 0,
          config: { min: 3, max: 10, step: 1, display: 'slider', showValue: true },
        }],
      },
    });
  });

  it('flushes the final pending config when the editor unmounts', () => {
    const view = renderEditor(listStep('step-1', listConfig()));

    changeFieldTitle('Final before close');
    expect(updateStepMock).not.toHaveBeenCalled();

    view.unmount();

    expect(updateStepMock).toHaveBeenCalledTimes(1);
    expect(updateStepMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 'step-1',
      sectionId: 'section-1',
      config: expect.objectContaining({
        fields: [expect.objectContaining({ title: 'Final before close' })],
      }),
    }));
  });

  it('flushes the old step before syncing local state for a newly selected step', () => {
    const firstStep = listStep('step-1', listConfig());
    const secondStep = listStep('step-2', listConfig('Attendee name', 'attendee_name'));
    const view = renderEditor(firstStep);

    changeFieldTitle('Final first-step title');
    expect(updateStepMock).not.toHaveBeenCalled();

    view.rerender(
      <ListCardEditor
        stepId={secondStep.id}
        sectionId={secondStep.sectionId}
        workflowId=""
        step={secondStep}
      />
    );

    expect(updateStepMock).toHaveBeenCalledTimes(1);
    expect(updateStepMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 'step-1',
      config: expect.objectContaining({
        fields: [expect.objectContaining({ title: 'Final first-step title' })],
      }),
    }));
    expect(screen.getByDisplayValue('Attendee name')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(updateStepMock).toHaveBeenCalledTimes(1);
  });
});
