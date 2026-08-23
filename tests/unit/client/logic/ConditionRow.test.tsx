// @vitest-environment jsdom
/**
 * ConditionRow (LU-4) — the variable/operand picker is now a searchable
 * `VariableCombobox` instead of a plain `Select`. This covers the ticket's
 * AC1 (searchable + keyboard-navigable), AC2 (grouping + alias/label
 * filtering) and AC3 (type-aware value inputs unchanged) at the ConditionRow
 * call site; VariableCombobox.test.tsx covers the picker itself in
 * isolation.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ConditionRow } from '../../../../client/src/components/logic/ConditionRow';

import type { Condition, VariableInfo } from '@shared/types/conditions';

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
});

const VARIABLES: VariableInfo[] = [
  {
    id: 's1',
    alias: 'first_name',
    label: 'First name',
    title: 'First name',
    type: 'short_text',
    pageId: 'sec1',
    pageTitle: 'Page 1',
  },
  {
    id: 's2',
    alias: 'signup_date',
    label: 'When they signed up',
    title: 'When they signed up',
    type: 'date_time',
    pageId: 'sec2',
    pageTitle: 'Page 2',
  },
];

function makeCondition(overrides: Partial<Condition> = {}): Condition {
  return {
    type: 'condition',
    id: 'c1',
    variable: '',
    operator: 'equals',
    value: '',
    valueType: 'constant',
    ...overrides,
  };
}

describe('ConditionRow — operand picker is a searchable combobox (LU-4 AC1/AC2)', () => {
  it('opens, filters by alias, and selects an operand via the keyboard', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ConditionRow
        condition={makeCondition()}
        variables={VARIABLES}
        onChange={onChange}
        onDelete={vi.fn()}
        canDelete
      />
    );

    // Grouping preserved: both page titles are present once opened.
    await user.click(screen.getAllByRole('combobox')[0]);
    expect(await screen.findByText('Page 1')).toBeInTheDocument();
    expect(screen.getByText('Page 2')).toBeInTheDocument();

    // Filter by alias.
    await user.type(screen.getByPlaceholderText(/search variables/i), 'first_name');
    expect(await screen.findByRole('option', { name: /first_name/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /signup_date/i })).not.toBeInTheDocument();

    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ variable: 'first_name' })
    );
  });

  it('filters by label text that does not appear in the alias', async () => {
    const user = userEvent.setup();
    render(
      <ConditionRow
        condition={makeCondition()}
        variables={VARIABLES}
        onChange={vi.fn()}
        onDelete={vi.fn()}
        canDelete
      />
    );

    await user.click(screen.getAllByRole('combobox')[0]);
    await user.type(screen.getByPlaceholderText(/search variables/i), 'signed up');

    expect(await screen.findByRole('option', { name: /signup_date/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /first_name/i })).not.toBeInTheDocument();
  });

  it('reports aria-expanded on the operand trigger', async () => {
    const user = userEvent.setup();
    render(
      <ConditionRow
        condition={makeCondition()}
        variables={VARIABLES}
        onChange={vi.fn()}
        onDelete={vi.fn()}
        canDelete
      />
    );

    const trigger = screen.getAllByRole('combobox')[0];
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('ConditionRow — type-aware value inputs are unchanged (LU-4 AC3)', () => {
  it('still renders a native date input for a date-type variable operand', () => {
    render(
      <ConditionRow
        condition={makeCondition({ variable: 'signup_date', operator: 'equals', value: '' })}
        variables={VARIABLES}
        onChange={vi.fn()}
        onDelete={vi.fn()}
        canDelete
      />
    );

    expect(screen.getByLabelText(/date value/i)).toHaveAttribute('type', 'date');
  });

  it('still renders a native number input for a numeric-valued comparison', () => {
    const numericVariables: VariableInfo[] = [
      {
        id: 's3',
        alias: 'age',
        label: 'Age',
        title: 'Age',
        type: 'computed',
        pageId: 'sec1',
        pageTitle: 'Page 1',
      },
    ];

    render(
      <ConditionRow
        condition={makeCondition({ variable: 'age', operator: 'greater_than', value: '' })}
        variables={numericVariables}
        onChange={vi.fn()}
        onDelete={vi.fn()}
        canDelete
      />
    );

    expect(screen.getByLabelText(/numeric value/i)).toHaveAttribute('type', 'number');
  });
});
