// @vitest-environment jsdom
/**
 * HND-7 keyboard checklist for this representative runner section:
 * - Tab/Shift+Tab: text, validated inputs, boolean buttons, choice checkboxes,
 *   address fields, grouped fields, final download, and signature actions remain reachable.
 * - Enter/Space: button, checkbox, and action controls expose native keyboard activation.
 * - Arrows: slider, radio stars, and Radix choice primitives keep their library/custom-managed keyboard handling.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ListDrillProvider } from '../../../client/src/components/runner/list/ListDrillContext';
import { SectionSteps } from '../../../client/src/components/runner/SectionSteps';
import { RUNNER_RENDERED_STEP_TYPES } from '../../../client/src/components/runner/blocks/stepTypeRouting';

import type { ApiStep, StepType } from '../../../client/src/lib/vault-api';

const createdAt = '2026-07-14T00:00:00.000Z';
const sectionId = 'runner-a11y-section';
const workflowId = 'runner-a11y-workflow';

function createStep(
  type: StepType,
  order: number,
  title: string,
  config: Record<string, unknown> | null = null,
  required = true
): ApiStep {
  return {
    id: type,
    workflowId,
    sectionId,
    type,
    title,
    description: `${title} help text`,
    required,
    alias: type,
    order,
    isVirtual: false,
    config,
    createdAt,
  };
}

const steps: ApiStep[] = [
  createStep('short_text', 1, 'Short text', { placeholder: 'Short answer' }),
  createStep('long_text', 2, 'Long text', { placeholder: 'Long answer', maxLength: 200 }),
  createStep('text', 3, 'Advanced text', { variant: 'short', placeholder: 'Advanced text' }),
  createStep('boolean', 4, 'Boolean choice', {
    trueLabel: 'Approve',
    falseLabel: 'Decline',
    displayStyle: 'buttons',
  }, false),
  createStep('phone', 5, 'Phone'),
  createStep('email', 6, 'Email'),
  createStep('website', 7, 'Website'),
  createStep('date', 8, 'Date'),
  createStep('time', 9, 'Time'),
  createStep('date_time', 10, 'Date and time'),
  createStep('number', 11, 'Number'),
  createStep('currency', 12, 'Currency'),
  createStep('scale', 13, 'Scale', {
    min: 1,
    max: 5,
    step: 1,
    display: 'slider',
    minLabel: 'Low',
    maxLabel: 'High',
  }),
  createStep('choice', 14, 'Choice', {
    display: 'multiple',
    allowMultiple: true,
    options: [
      { id: 'choice-alpha', label: 'Choice Alpha', alias: 'alpha' },
      { id: 'choice-beta', label: 'Choice Beta', alias: 'beta' },
    ],
  }),
  createStep('address', 15, 'Address'),
  createStep('multi_field', 16, 'Grouped fields', {
    layout: 'custom',
    fields: [
      { key: 'firstName', label: 'First name', type: 'text', required: true },
      { key: 'lastName', label: 'Last name', type: 'text', required: true },
    ],
  }),
  createStep('display', 17, 'Display', {
    markdown: '### Review Notice\nConfirm the details before continuing.',
  }, false),
  createStep('final_documents', 18, 'Final documents', {
    markdownHeader: '### Download Packet',
    documents: [
      { id: 'packet', alias: 'client_packet' },
    ],
  }, false),
  createStep('signature_block', 19, 'Signature block', {
    signerRole: 'Client',
    signerName: 'Ada Lovelace',
    signerEmail: 'ada@example.com',
    message: 'Please sign the packet.',
    markdownHeader: '### Signature Required',
    documents: [
      { id: 'signature-packet', documentId: 'client_packet' },
    ],
    provider: 'docusign',
    allowDecline: true,
  }, false),
  createStep('list', 20, 'Children', {
    allowReorder: true,
    fields: [
      { kind: 'question', id: 'name-field', alias: 'name', type: 'short_text', title: 'Name', order: 0, required: true },
    ],
    labelTemplate: '{name}',
    addButtonText: 'Add child',
  }, false),
];

const values: Record<string, unknown> = {
  short_text: '',
  long_text: 'A longer response',
  text: 'Advanced response',
  boolean: true,
  phone: '555-123-4567',
  email: 'ada@example.com',
  website: 'https://example.com',
  date: '2026-07-14',
  time: '10:30',
  date_time: '2026-07-14T10:30',
  number: 42,
  currency: 1250,
  scale: 3,
  choice: ['alpha'],
  address: { street: '', city: 'Chicago', state: 'IL', zip: '60601' },
  multi_field: { firstName: 'Ada', lastName: 'Lovelace' },
  list: { items: [{ itemId: 'item-1', values: { name: 'Ava' } }] },
};

function renderSection(errors: Record<string, string[]> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  const onChange = vi.fn();

  const view = render(
    <QueryClientProvider client={queryClient}>
      <main>
        <ListDrillProvider>
          <SectionSteps
            sectionId={sectionId}
            steps={steps}
            values={values}
            logicRules={[]}
            errors={errors}
            onChange={onChange}
          />
        </ListDrillProvider>
      </main>
    </QueryClientProvider>
  );

  return { ...view, onChange };
}

afterEach(() => {
  cleanup();
});

describe('SectionSteps accessibility smoke', () => {
  it('visually separates each runner question', () => {
    renderSection();

    expect(screen.getByTestId('runner-section-steps')).toHaveClass('space-y-8');
  });

  it('covers every rendered runner step type in the fixture', () => {
    const fixtureTypes = new Set(steps.map((step) => step.type));

    expect(RUNNER_RENDERED_STEP_TYPES.every((type) => fixtureTypes.has(type))).toBe(true);
  });

  it('has no serious or critical axe violations for representative runner blocks', async () => {
    const { container } = renderSection({
      short_text: ['Short text is required'],
    });

    await screen.findByRole('checkbox', { name: 'Choice Alpha' });

    const results = await axe(container, {
      rules: {
        'color-contrast': { enabled: false },
      },
    });
    const severeViolations = results.violations.filter((violation) => (
      violation.impact === 'serious' || violation.impact === 'critical'
    ));

    expect(severeViolations).toEqual([]);
    expect(screen.getByLabelText(/Short text/)).toHaveAttribute('aria-required', 'true');
    expect(screen.getByLabelText(/Short text/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('keeps primary runner controls operable from the keyboard', async () => {
    const user = userEvent.setup();
    const { onChange } = renderSection();

    await screen.findByRole('checkbox', { name: 'Choice Alpha' });

    screen.getByLabelText(/Short text/).focus();
    await user.keyboard('K');

    const booleanDeclineButton = screen.getAllByRole('button', { name: 'Decline' })[0];
    if (booleanDeclineButton === undefined) {
      throw new Error('Expected Boolean decline button to be rendered');
    }
    booleanDeclineButton.focus();
    await user.keyboard('{Enter}');

    screen.getByRole('checkbox', { name: 'Choice Beta' }).focus();
    await user.keyboard('[Space]');

    screen.getByRole('button', { name: /continue to sign/i }).focus();
    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledWith('short_text', 'K');
    expect(onChange).toHaveBeenCalledWith('boolean', false);
    expect(onChange).toHaveBeenCalledWith('choice', ['alpha', 'beta']);
  });

  it('renders star scale rating with radiogroup semantics and keyboard operability', async () => {
    const user = userEvent.setup();
    const starSteps = [
      createStep('scale', 1, 'Star Rating', {
        min: 1,
        max: 5,
        display: 'stars',
      }),
    ];
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onChange = vi.fn();

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <main>
          <ListDrillProvider>
            <SectionSteps
              sectionId={sectionId}
              steps={starSteps}
              values={{ scale: 3 }}
              logicRules={[]}
              errors={{}}
              onChange={onChange}
            />
          </ListDrillProvider>
        </main>
      </QueryClientProvider>
    );

    const radiogroup = screen.getByRole('radiogroup', { name: 'Star Rating' });
    expect(radiogroup).toBeInTheDocument();

    const star1 = screen.getByRole('radio', { name: '1 of 5 stars' });
    const star3 = screen.getByRole('radio', { name: '3 of 5 stars' });
    const star4 = screen.getByRole('radio', { name: '4 of 5 stars' });
    const star5 = screen.getByRole('radio', { name: '5 of 5 stars' });

    // Verify roving tabindex: checked star has tabIndex=0, others have tabIndex=-1
    expect(star3).toHaveAttribute('aria-checked', 'true');
    expect(star3).toHaveAttribute('tabIndex', '0');
    expect(star1).toHaveAttribute('aria-checked', 'false');
    expect(star1).toHaveAttribute('tabIndex', '-1');
    expect(star4).toHaveAttribute('aria-checked', 'false');
    expect(star4).toHaveAttribute('tabIndex', '-1');
    expect(star5).toHaveAttribute('aria-checked', 'false');
    expect(star5).toHaveAttribute('tabIndex', '-1');
    expect(star3.querySelector('svg')).toHaveClass('fill-warning', 'text-warning');
    expect(star4.querySelector('svg')).toHaveClass('text-muted-foreground');

    // Arrow-key radio group navigation
    star3.focus();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith('scale', 4);

    star4.focus();
    await user.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenCalledWith('scale', 3);

    await user.keyboard('{Home}');
    expect(onChange).toHaveBeenCalledWith('scale', 1);

    await user.keyboard('{End}');
    expect(onChange).toHaveBeenCalledWith('scale', 5);

    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    const severeViolations = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical'
    );
    expect(severeViolations).toEqual([]);
  });

  it('gives list item controls explicit focus-visible indicators', async () => {
    renderSection();

    const reorderButton = await screen.findByRole('button', { name: 'Reorder Ava' });
    const openButton = screen.getByRole('button', { name: /^Ava/ });

    expect(reorderButton).toHaveClass('focus-visible:ring-2', 'focus-visible:ring-ring');
    expect(openButton).toHaveClass('focus-visible:ring-2', 'focus-visible:ring-ring');

    reorderButton.focus();
    expect(reorderButton).toHaveFocus();
    openButton.focus();
    expect(openButton).toHaveFocus();
  });

  it('associates validation errors with inputs and exposes role=alert', () => {
    renderSection({
      short_text: ['Please provide a valid short answer'],
      email: ['Must be a valid email address'],
    });

    const errorAlerts = screen.getAllByRole('alert');
    expect(errorAlerts.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Please provide a valid short answer')).toBeInTheDocument();
    expect(screen.getByText('Must be a valid email address')).toBeInTheDocument();

    const emailInput = screen.getByLabelText(/Email/);
    expect(emailInput).toHaveAttribute('aria-invalid', 'true');
    expect(emailInput).toHaveAttribute('aria-describedby');
  });
});
