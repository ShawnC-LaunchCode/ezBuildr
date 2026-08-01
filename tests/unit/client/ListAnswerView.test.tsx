// @vitest-environment jsdom
/**
 * LIST-10 — the review step's read-only nested outline for a List answer.
 * Covers AC1 (item labels + field values), AC2 (nested lists indented under
 * their parent item), AC3 (an empty list renders "None added" rather than
 * blank space, at both the top level and a nested level), and the display
 * depth cap ("+N more levels" past LIST_VALIDATION_MAX_DEPTH).
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ListAnswerView } from '../../../client/src/components/runner/list/ListAnswerView';

import { LIST_VALIDATION_MAX_DEPTH } from '../../../shared/validation/BlockValidation';
import type { ListConfig, ListValue } from '../../../shared/types/stepConfigs';

afterEach(() => {
  cleanup();
});

const addressesField = {
  kind: 'list' as const,
  id: 'f-addresses',
  alias: 'addresses',
  title: 'Addresses',
  order: 1,
  list: {
    fields: [
      { kind: 'question' as const, id: 'f-street', alias: 'street', type: 'short_text' as const, title: 'Street', order: 0 },
    ],
  },
};

const config: ListConfig = {
  fields: [
    { kind: 'question', id: 'f-name', alias: 'name', type: 'short_text', title: 'Name', order: 0 },
    addressesField,
  ],
  labelTemplate: '{name}',
};

describe('ListAnswerView: nested outline (AC1)', () => {
  it('renders item labels resolved via the shared labelTemplate helper, and each field value', () => {
    const value: ListValue = {
      items: [
        {
          itemId: 'a',
          values: {
            name: 'Ava Chen',
            addresses: { items: [{ itemId: 'addr-1', values: { street: '1 Oak St' } }] },
          },
        },
      ],
    };

    render(<ListAnswerView config={config} value={value} />);

    // Appears twice: once as the resolved item heading, once as the "Name" field's own value row.
    expect(screen.getAllByText('Ava Chen')).toHaveLength(2);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('1 Oak St')).toBeInTheDocument();
  });

  it('falls back to a placeholder label when the template resolves empty', () => {
    const value: ListValue = { items: [{ itemId: 'a', values: {} }] };
    render(<ListAnswerView config={config} value={value} />);
    expect(screen.getByText('Item 1')).toBeInTheDocument();
  });
});

describe('ListAnswerView: nested indentation (AC2)', () => {
  it('renders a nested list field indented under its parent item', () => {
    const value: ListValue = {
      items: [
        {
          itemId: 'a',
          values: {
            name: 'Ava Chen',
            addresses: { items: [{ itemId: 'addr-1', values: { street: '1 Oak St' } }] },
          },
        },
      ],
    };

    const { container } = render(<ListAnswerView config={config} value={value} />);

    const [heading] = screen.getAllByText('Ava Chen');
    const item = heading.closest('li') as HTMLElement;
    // Nested content lives inside a bordered/indented wrapper under the item, not as a sibling of it.
    const indentWrapper = item.querySelector('.border-l-2');
    expect(indentWrapper).not.toBeNull();
    expect(within(indentWrapper as HTMLElement).getByText('1 Oak St')).toBeInTheDocument();
    expect(container.querySelectorAll('.border-l-2').length).toBeGreaterThan(0);
  });
});

describe('ListAnswerView: empty lists (AC3)', () => {
  it('renders "None added" for a top-level list with no items', () => {
    render(<ListAnswerView config={config} value={{ items: [] }} />);
    expect(screen.getByText('None added')).toBeInTheDocument();
  });

  it('renders "None added" for a nested list field with no items', () => {
    const value: ListValue = {
      items: [{ itemId: 'a', values: { name: 'Ava Chen', addresses: { items: [] } } }],
    };
    render(<ListAnswerView config={config} value={value} />);
    expect(screen.getByText('None added')).toBeInTheDocument();
  });

  it('treats a missing/undefined value as an empty list rather than blank space', () => {
    render(<ListAnswerView config={config} value={undefined} />);
    expect(screen.getByText('None added')).toBeInTheDocument();
  });
});

describe('ListAnswerView: display depth cap', () => {
  function buildNested(depth: number): { config: ListConfig; value: ListValue } {
    let leafConfig: ListConfig = { fields: [{ kind: 'question', id: 'f-leaf', alias: 'leaf', type: 'short_text', title: 'Leaf', order: 0 }] };
    let leafValue: ListValue = { items: [{ itemId: `item-${depth}`, values: { leaf: 'value' } }] };

    for (let level = depth - 1; level >= 1; level -= 1) {
      const fieldConfig: ListConfig = {
        fields: [{ kind: 'list', id: `f-nested-${level}`, alias: 'nested', title: 'Nested', order: 0, list: leafConfig }],
      };
      leafConfig = fieldConfig;
      leafValue = { items: [{ itemId: `item-${level}`, values: { nested: leafValue } }] };
    }

    return { config: leafConfig, value: leafValue };
  }

  it(`stops recursing past ${LIST_VALIDATION_MAX_DEPTH} levels and shows a "+N more levels" summary instead`, () => {
    const { config: deepConfig, value: deepValue } = buildNested(LIST_VALIDATION_MAX_DEPTH + 2);

    render(<ListAnswerView config={deepConfig} value={deepValue} />);

    expect(screen.queryByText('Leaf')).not.toBeInTheDocument();
    expect(screen.getByText(/more levels?$/)).toBeInTheDocument();
  });

  it(`renders fully when nesting is exactly at the ${LIST_VALIDATION_MAX_DEPTH}-level cap`, () => {
    const { config: exactConfig, value: exactValue } = buildNested(LIST_VALIDATION_MAX_DEPTH);

    render(<ListAnswerView config={exactConfig} value={exactValue} />);

    expect(screen.getByText('Leaf')).toBeInTheDocument();
    expect(screen.getByText('value')).toBeInTheDocument();
    expect(screen.queryByText(/more levels?$/)).not.toBeInTheDocument();
  });
});
