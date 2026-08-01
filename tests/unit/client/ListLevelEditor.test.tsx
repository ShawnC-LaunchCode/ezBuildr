// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ListLevelEditor } from '../../../client/src/components/builder/cards/list/ListLevelEditor';
import { reorderFields, removeField } from '../../../client/src/components/builder/cards/list/listEditorHelpers';

import { LIST_VALIDATION_MAX_DEPTH } from '@shared/validation/BlockValidation';
import type { ListConfig, ListField } from '@shared/types/stepConfigs';

afterEach(() => {
  cleanup();
});

function questionField(overrides: Partial<Extract<ListField, { kind: 'question' }>> & { id: string; alias: string; title: string; order: number }): ListField {
  return {
    kind: 'question',
    type: 'short_text',
    ...overrides,
  };
}

function listField(overrides: Partial<Extract<ListField, { kind: 'list' }>> & { id: string; alias: string; title: string; order: number; list: ListConfig }): ListField {
  return {
    kind: 'list',
    ...overrides,
  };
}

describe('ListLevelEditor — alias uniqueness (LIST-6 AC5)', () => {
  it('flags aliases duplicated within the same level', () => {
    const config: ListConfig = {
      fields: [
        questionField({ id: 'f1', alias: 'name', title: 'First', order: 0 }),
        questionField({ id: 'f2', alias: 'Name', title: 'Second', order: 1 }), // same alias, different case
      ],
    };

    render(<ListLevelEditor config={config} onChange={vi.fn()} depth={1} />);

    expect(screen.getAllByText('Duplicate alias at this level')).toHaveLength(2);
  });

  it('allows the same alias to appear at two different nesting levels', () => {
    const config: ListConfig = {
      fields: [
        questionField({ id: 'f1', alias: 'name', title: 'Top-level name', order: 0 }),
        listField({
          id: 'nested',
          alias: 'children',
          title: 'Children',
          order: 1,
          list: {
            fields: [questionField({ id: 'nf1', alias: 'name', title: 'Nested name', order: 0 })],
          },
        }),
      ],
    };

    render(<ListLevelEditor config={config} onChange={vi.fn()} depth={1} />);

    // Nested level is expanded by default (ListFieldRow starts expanded).
    expect(screen.queryByText('Duplicate alias at this level')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Top-level name')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Nested name')).toBeInTheDocument();
  });
});

describe('ListLevelEditor — nesting depth cap (LIST-6 AC6)', () => {
  it('prevents adding a nested list at the maximum depth, reading the limit from the shared constant', () => {
    const config: ListConfig = {
      fields: [questionField({ id: 'f1', alias: 'field_1', title: 'Field 1', order: 0 })],
    };

    render(<ListLevelEditor config={config} onChange={vi.fn()} depth={LIST_VALIDATION_MAX_DEPTH} />);

    const addNestedButton = screen.getByRole('button', { name: /add nested list/i });
    expect(addNestedButton).toBeDisabled();
    expect(
      screen.getByText(new RegExp(`nest up to ${LIST_VALIDATION_MAX_DEPTH} levels deep`, 'i'))
    ).toBeInTheDocument();
  });

  it('allows adding a nested list one level below the maximum', () => {
    const config: ListConfig = {
      fields: [questionField({ id: 'f1', alias: 'field_1', title: 'Field 1', order: 0 })],
    };

    render(<ListLevelEditor config={config} onChange={vi.fn()} depth={LIST_VALIDATION_MAX_DEPTH - 1} />);

    const addNestedButton = screen.getByRole('button', { name: /add nested list/i });
    expect(addNestedButton).not.toBeDisabled();
    expect(
      screen.queryByText(new RegExp(`nest up to ${LIST_VALIDATION_MAX_DEPTH} levels deep`, 'i'))
    ).not.toBeInTheDocument();
  });

  it('appends a new nested list field when the button is clicked below the cap', () => {
    const config: ListConfig = {
      fields: [questionField({ id: 'f1', alias: 'field_1', title: 'Field 1', order: 0 })],
    };
    const onChange = vi.fn();

    render(<ListLevelEditor config={config} onChange={onChange} depth={1} />);
    fireEvent.click(screen.getByRole('button', { name: /add nested list/i }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const [nextConfig] = onChange.mock.calls[0] as [ListConfig];
    expect(nextConfig.fields).toHaveLength(2);
    expect(nextConfig.fields[1].kind).toBe('list');
  });
});

describe('listEditorHelpers — reorderFields / removeField (LIST-6 AC2)', () => {
  it('reorders fields and reassigns order sequentially', () => {
    const fields: ListField[] = [
      questionField({ id: 'a', alias: 'a', title: 'A', order: 0 }),
      questionField({ id: 'b', alias: 'b', title: 'B', order: 1 }),
      questionField({ id: 'c', alias: 'c', title: 'C', order: 2 }),
    ];

    const reordered = reorderFields(fields, 0, 2);

    expect(reordered.map((f) => f.id)).toEqual(['b', 'c', 'a']);
    expect(reordered.map((f) => f.order)).toEqual([0, 1, 2]);
  });

  it('removes a field by id and reassigns order for the remainder', () => {
    const fields: ListField[] = [
      questionField({ id: 'a', alias: 'a', title: 'A', order: 0 }),
      questionField({ id: 'b', alias: 'b', title: 'B', order: 1 }),
      questionField({ id: 'c', alias: 'c', title: 'C', order: 2 }),
    ];

    const remaining = removeField(fields, 'b');

    expect(remaining.map((f) => f.id)).toEqual(['a', 'c']);
    expect(remaining.map((f) => f.order)).toEqual([0, 1]);
  });

  it('removes a field via the row Remove button, end to end through ListLevelEditor', () => {
    const config: ListConfig = {
      fields: [
        questionField({ id: 'a', alias: 'a', title: 'First', order: 0 }),
        questionField({ id: 'b', alias: 'b', title: 'Second', order: 1 }),
      ],
    };
    const onChange = vi.fn();

    render(<ListLevelEditor config={config} onChange={onChange} depth={1} />);
    const removeButtons = screen.getAllByRole('button', { name: 'Remove field' });
    fireEvent.click(removeButtons[1]);

    expect(onChange).toHaveBeenCalledTimes(1);
    const [nextConfig] = onChange.mock.calls[0] as [ListConfig];
    expect(nextConfig.fields).toHaveLength(1);
    expect(nextConfig.fields[0]).toMatchObject({ id: 'a', title: 'First' });
  });
});

describe('ListLevelEditor — structural round-trip across a 3-level tree (LIST-6 AC7)', () => {
  function threeLevelConfig(): ListConfig {
    return {
      fields: [
        questionField({ id: 'top-name', alias: 'name', title: 'Child name', order: 0 }),
        listField({
          id: 'top-addresses',
          alias: 'addresses',
          title: 'Addresses',
          order: 1,
          list: {
            fields: [
              questionField({ id: 'addr-street', alias: 'street', title: 'Street', order: 0 }),
              listField({
                id: 'addr-occupants',
                alias: 'occupants',
                title: 'Occupants',
                order: 1,
                list: {
                  fields: [
                    questionField({ id: 'occ-name', alias: 'occupant_name', title: 'Occupant name', order: 0 }),
                  ],
                },
              }),
            ],
          },
        }),
      ],
    };
  }

  it('renders all 3 levels of an authored tree with no data loss', () => {
    render(<ListLevelEditor config={threeLevelConfig()} onChange={vi.fn()} depth={1} />);

    expect(screen.getByDisplayValue('Child name')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Street')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Occupant name')).toBeInTheDocument();
    expect(screen.getByText('Level 2 of 3')).toBeInTheDocument();
    expect(screen.getByText('Level 3 of 3')).toBeInTheDocument();
  });

  it('propagates a deepest-level edit up while leaving every other field byte-for-byte unchanged', () => {
    const original = threeLevelConfig();
    const onChange = vi.fn();

    render(<ListLevelEditor config={original} onChange={onChange} depth={1} />);

    const occupantNameInput = screen.getByDisplayValue('Occupant name');
    fireEvent.change(occupantNameInput, { target: { value: 'Resident name' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    const [next] = onChange.mock.calls[0] as [ListConfig];

    // The edited leaf changed...
    const nestedAddresses = next.fields[1];
    if (nestedAddresses.kind !== 'list') { throw new Error('expected addresses field to stay kind: list'); }
    const occupantsField = nestedAddresses.list.fields[1];
    if (occupantsField.kind !== 'list') { throw new Error('expected occupants field to stay kind: list'); }
    expect(occupantsField.list.fields[0]).toMatchObject({ title: 'Resident name' });

    // ...but every sibling/ancestor field is untouched.
    expect(next.fields[0]).toEqual(original.fields[0]);
    expect(nestedAddresses.list.fields[0]).toEqual(
      (original.fields[1] as Extract<ListField, { kind: 'list' }>).list.fields[0]
    );
    expect(nestedAddresses.id).toBe('top-addresses');
    expect(nestedAddresses.alias).toBe('addresses');
    expect(occupantsField.id).toBe('addr-occupants');
  });
});
