// @vitest-environment jsdom
/**
 * Document onboarding wizard (GH-167) — Review & Approve step.
 *
 * AC2: the author can edit a generated question's type and alias before
 * anything is persisted, editing changes the payload sent on approve, and
 * cancelling persists nothing (no network call, `onApprove` never fires).
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ReviewStep } from '../../../../client/src/pages/onboarding/ReviewStep';

import type { OnboardingVariable } from '../../../../client/src/pages/onboarding/onboardingTypes';
import type { ComponentProps } from 'react';

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
  vi.unstubAllGlobals();
});

const PROJECTS = [{ id: 'p1', title: 'Estate Planning' }];

function makeVariables(): OnboardingVariable[] {
  return [
    {
      name: 'client_name',
      alias: 'clientName',
      type: 'text',
      presetId: 'easy.short-text',
      config: { variant: 'short' },
      label: 'Client Name',
      confidence: 0.95,
      source: 'explicit_tag',
    },
  ];
}

function renderReviewStep(overrides: Partial<ComponentProps<typeof ReviewStep>> = {}) {
  const onApprove = vi.fn();
  const onCancel = vi.fn();
  const onProjectChange = vi.fn();
  const onRetry = vi.fn();
  render(
    <ReviewStep
      variables={makeVariables()}
      projects={PROJECTS}
      projectId="p1"
      onProjectChange={onProjectChange}
      onApprove={onApprove}
      onCancel={onCancel}
      isSubmitting={false}
      error={null}
      onRetry={onRetry}
      {...overrides}
    />
  );
  return { onApprove, onCancel, onProjectChange, onRetry };
}

describe('ReviewStep (GH-167 AC2)', () => {
  it('sends the edited type and alias in the approve payload, not the original values', async () => {
    const user = userEvent.setup();
    const { onApprove } = renderReviewStep();

    const row = screen.getAllByRole('row')[1];

    const aliasInput = within(row).getByLabelText('Alias for Client Name');
    await user.clear(aliasInput);
    await user.type(aliasInput, 'clientFullName');

    const typeTrigger = within(row).getByRole('combobox');
    await user.click(typeTrigger);
    await user.click(await screen.findByRole('option', { name: 'Long Text' }));

    await user.click(screen.getByRole('button', { name: /Approve & generate workflow/ }));

    expect(onApprove).toHaveBeenCalledTimes(1);
    const payload = onApprove.mock.calls[0][0] as { projectId: string; variables: OnboardingVariable[] };
    expect(payload.projectId).toBe('p1');
    expect(payload.variables).toHaveLength(1);
    expect(payload.variables[0]).toMatchObject({
      name: 'client_name',
      alias: 'clientFullName',
      type: 'text',
      presetId: 'easy.long-text',
      config: { variant: 'long' },
    });
  });

  it('leaves the payload at its original values when nothing is edited', async () => {
    const user = userEvent.setup();
    const { onApprove } = renderReviewStep();

    await user.click(screen.getByRole('button', { name: /Approve & generate workflow/ }));

    expect(onApprove).toHaveBeenCalledWith({
      projectId: 'p1',
      variables: makeVariables(),
    });
  });

  it('cancelling calls onCancel, never onApprove, and makes no network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    const { onApprove, onCancel } = renderReviewStep();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onApprove).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('disables Approve until a project is chosen', () => {
    renderReviewStep({ projectId: '' });

    expect(screen.getByRole('button', { name: /Approve & generate workflow/ })).toBeDisabled();
  });
});
