// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import {
  FilterPanel,
  getOperatorsForType,
  operatorLabels,
  operatorNeedsValue,
} from '../../../client/src/components/datavault/FilterPanel';
import { useDatavaultFilterStore, type FilterOperator } from '../../../client/src/store/useDatavaultFilterStore';
import { DATAVAULT_FILTER_OPERATORS, datavaultRowFilterSchema, type DatavaultColumn } from '../../../shared/schema/datavault';

afterEach(() => {
  cleanup();
  useDatavaultFilterStore.getState().clearFilters('table-1');
});

const mockColumns: DatavaultColumn[] = [
  {
    id: 'col-text-1',
    tableId: 'table-1',
    name: 'Customer Name',
    slug: 'customer_name',
    type: 'text',
    description: null,
    widthPx: 150,
    required: false,
    isPrimaryKey: false,
    isUnique: false,
    orderIndex: 0,
    autoNumberStart: 1,
    autonumberPrefix: null,
    autonumberPadding: 4,
    autonumberResetPolicy: 'never',
    referenceTableId: null,
    referenceDisplayColumnSlug: null,
    options: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'col-num-2',
    tableId: 'table-1',
    name: 'Order Total',
    slug: 'order_total',
    type: 'number',
    description: null,
    widthPx: 150,
    required: false,
    isPrimaryKey: false,
    isUnique: false,
    orderIndex: 1,
    autoNumberStart: 1,
    autonumberPrefix: null,
    autonumberPadding: 4,
    autonumberResetPolicy: 'never',
    referenceTableId: null,
    referenceDisplayColumnSlug: null,
    options: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'col-auto-3',
    tableId: 'table-1',
    name: 'Invoice ID',
    slug: 'invoice_id',
    type: 'auto_number',
    description: null,
    widthPx: 150,
    required: false,
    isPrimaryKey: false,
    isUnique: false,
    orderIndex: 2,
    autoNumberStart: 100,
    autonumberPrefix: 'INV-',
    autonumberPadding: 4,
    autonumberResetPolicy: 'never',
    referenceTableId: null,
    referenceDisplayColumnSlug: null,
    options: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

describe('FilterPanel operator helpers', () => {
  it('returns valid operators for text types', () => {
    const textOps = getOperatorsForType('text');
    expect(textOps).toEqual(['equals', 'not_equals', 'contains', 'not_contains', 'is_empty', 'is_not_empty']);

    expect(getOperatorsForType('short_text')).toEqual(textOps);
    expect(getOperatorsForType('long_text')).toEqual(textOps);
    expect(getOperatorsForType('email')).toEqual(textOps);
    expect(getOperatorsForType('phone')).toEqual(textOps);
    expect(getOperatorsForType('url')).toEqual(textOps);
  });

  it('returns valid operators for number, auto_number, and autonumber types', () => {
    const numberOps = getOperatorsForType('number');
    expect(numberOps).toContain('greater_than');
    expect(numberOps).toContain('less_than');
    expect(numberOps).toContain('greater_than_or_equal');
    expect(numberOps).toContain('less_than_or_equal');
    expect(numberOps).toContain('equals');
    expect(numberOps).toContain('not_equals');
    expect(numberOps).toContain('is_empty');
    expect(numberOps).toContain('is_not_empty');

    expect(getOperatorsForType('auto_number')).toEqual(numberOps);
    expect(getOperatorsForType('autonumber')).toEqual(numberOps);
  });

  it('returns valid operators for date and datetime types', () => {
    const dateOps = getOperatorsForType('date');
    expect(dateOps).toContain('greater_than');
    expect(dateOps).toContain('less_than');
    expect(getOperatorsForType('datetime')).toEqual(dateOps);
  });

  it('returns valid operators for boolean and choice types', () => {
    const boolOps = getOperatorsForType('boolean');
    expect(boolOps).toEqual(['equals', 'not_equals', 'is_empty', 'is_not_empty']);
    expect(getOperatorsForType('yes_no')).toEqual(boolOps);

    const choiceOps = getOperatorsForType('multiple_choice');
    expect(choiceOps).toContain('in');
    expect(choiceOps).toContain('not_in');
    expect(choiceOps).toContain('contains');
    expect(choiceOps).toContain('not_contains');
    expect(getOperatorsForType('select')).toEqual(choiceOps);
    expect(getOperatorsForType('multiselect')).toEqual(choiceOps);
    expect(getOperatorsForType('radio')).toEqual(choiceOps);
    expect(getOperatorsForType('checkbox')).toEqual(choiceOps);
  });

  it('ensures every UI operator is a valid server operator accepted by datavaultRowFilterSchema', () => {
    const allTypes = [
      'short_text',
      'long_text',
      'number',
      'auto_number',
      'autonumber',
      'date',
      'datetime',
      'boolean',
      'yes_no',
      'multiple_choice',
      'radio',
      'checkbox',
      'other_unknown_type',
    ];

    for (const type of allTypes) {
      const operators = getOperatorsForType(type);
      for (const op of operators) {
        // Assert operator is recognized in shared constant
        expect(DATAVAULT_FILTER_OPERATORS).toContain(op);

        // Assert schema parses it successfully
        const testFilter = {
          columnId: '11111111-1111-4111-8111-111111111111',
          operator: op,
          value: op === 'is_empty' || op === 'is_not_empty' ? undefined : 'test-val',
        };
        const parsed = datavaultRowFilterSchema.safeParse(testFilter);
        expect(parsed.success).toBe(true);
      }
    }
  });

  it('provides human-readable labels for all FilterOperator variants', () => {
    const sampleOps: FilterOperator[] = [
      'equals',
      'not_equals',
      'contains',
      'not_contains',
      'greater_than',
      'less_than',
      'greater_than_or_equal',
      'less_than_or_equal',
      'is_empty',
      'is_not_empty',
      'in',
      'not_in',
    ];

    for (const op of sampleOps) {
      expect(operatorLabels[op]).toBeDefined();
      expect(operatorLabels[op].length).toBeGreaterThan(0);
    }
  });

  it('correctly determines whether an operator needs a value input', () => {
    expect(operatorNeedsValue('is_empty')).toBe(false);
    expect(operatorNeedsValue('is_not_empty')).toBe(false);
    expect(operatorNeedsValue('equals')).toBe(true);
    expect(operatorNeedsValue('contains')).toBe(true);
    expect(operatorNeedsValue('greater_than')).toBe(true);
  });
});

describe('FilterPanel Component', () => {
  it('renders filter panel and allows adding and clearing filters', async () => {
    const user = userEvent.setup();

    render(<FilterPanel tableId="table-1" columns={mockColumns} />);

    expect(screen.getByText('Filters')).toBeDefined();
    expect(screen.getByRole('button', { name: /Add Filter/i })).toBeDefined();

    await user.click(screen.getByRole('button', { name: /Add Filter/i }));

    const storeState = useDatavaultFilterStore.getState().filtersByTable['table-1'];
    expect(storeState).toHaveLength(1);
    expect(storeState[0].columnId).toBe('col-text-1');

    const clearButton = screen.getByRole('button', { name: /Clear All/i });
    expect(clearButton).toBeDefined();

    await user.click(clearButton);
    expect(useDatavaultFilterStore.getState().filtersByTable['table-1']).toHaveLength(0);
  });
});
