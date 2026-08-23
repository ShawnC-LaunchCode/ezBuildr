// @vitest-environment jsdom
/**
 * ConditionValueInput (LU-4) — the variable-reference mode's operand picker
 * is now a searchable `VariableCombobox`. Everything else in this
 * component's `valueType` branching (date/number/choices/text) is
 * out-of-scope for LU-4 and must render exactly as before — these tests
 * pin that behavior alongside the new combobox coverage.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ConditionValueInput } from '../../../../client/src/components/logic/ConditionValueInput';

import type { Condition, OperatorConfig, VariableInfo } from '@shared/types/conditions';

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
    alias: 'last_name',
    label: 'Last name',
    title: 'Last name',
    type: 'short_text',
    pageId: 'sec1',
    pageTitle: 'Page 1',
  },
];

function makeCondition(overrides: Partial<Condition> = {}): Condition {
  return {
    type: 'condition',
    id: 'c1',
    variable: 's1',
    operator: 'equals',
    value: '',
    valueType: 'constant',
    ...overrides,
  };
}

const TEXT_OPERATOR: OperatorConfig = {
  value: 'equals',
  label: 'equals',
  needsValue: true,
  valueType: 'text',
};

describe('ConditionValueInput — variable-reference mode combobox (LU-4 AC1/AC2)', () => {
  it('excludes the condition\'s own variable and lets the user pick another as the comparison operand', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ConditionValueInput
        condition={makeCondition({ valueType: 'variable', variable: 's1' })}
        operatorConfig={TEXT_OPERATOR}
        selectedVariable={VARIABLES[0]}
        allVariables={VARIABLES}
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole('combobox'));
    expect(screen.queryByRole('option', { name: /first_name/i })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('option', { name: /last_name/i }));

    expect(onChange).toHaveBeenCalledWith({ value: 'last_name' });
  });

  it('is keyboard-navigable and reports aria-expanded', async () => {
    const user = userEvent.setup();
    render(
      <ConditionValueInput
        condition={makeCondition({ valueType: 'variable', variable: 's1' })}
        operatorConfig={TEXT_OPERATOR}
        selectedVariable={VARIABLES[0]}
        allVariables={VARIABLES}
        onChange={vi.fn()}
      />
    );

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Enter}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('ConditionValueInput — constant-mode branching is unchanged (LU-4 AC3, out of scope)', () => {
  it('renders a date input unchanged when operatorConfig.valueType is "date"', () => {
    render(
      <ConditionValueInput
        condition={makeCondition({ valueType: 'constant' })}
        operatorConfig={{ value: 'equals', label: 'is', needsValue: true, valueType: 'date' }}
        selectedVariable={VARIABLES[0]}
        allVariables={VARIABLES}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByLabelText(/date value/i)).toHaveAttribute('type', 'date');
  });

  it('renders a number input unchanged when operatorConfig.valueType is "number"', () => {
    render(
      <ConditionValueInput
        condition={makeCondition({ valueType: 'constant' })}
        operatorConfig={{ value: 'greater_than', label: 'is greater than', needsValue: true, valueType: 'number' }}
        selectedVariable={VARIABLES[0]}
        allVariables={VARIABLES}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByLabelText(/numeric value/i)).toHaveAttribute('type', 'number');
  });

  it('renders a choices dropdown unchanged when the selected variable has choices', () => {
    const choiceVariable: VariableInfo = {
      ...VARIABLES[0],
      choices: [
        { value: 'red', label: 'Red' },
        { value: 'blue', label: 'Blue' },
      ],
    };

    render(
      <ConditionValueInput
        condition={makeCondition({ valueType: 'constant' })}
        operatorConfig={{ value: 'equals', label: 'equals', needsValue: true, valueType: 'choices' }}
        selectedVariable={choiceVariable}
        allVariables={[choiceVariable]}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText('Select option...')).toBeInTheDocument();
  });

  it('renders a plain text input unchanged as the default case', () => {
    render(
      <ConditionValueInput
        condition={makeCondition({ valueType: 'constant' })}
        operatorConfig={TEXT_OPERATOR}
        selectedVariable={VARIABLES[0]}
        allVariables={VARIABLES}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByLabelText(/text value/i)).toHaveAttribute('type', 'text');
  });
});
