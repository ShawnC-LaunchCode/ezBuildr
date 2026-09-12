// @vitest-environment jsdom
/**
 * VariableCombobox (LU-4) — the searchable, keyboard-navigable operand
 * picker that replaces the plain `Select` used by ConditionRow's variable
 * picker and ConditionValueInput's variable-reference mode. Covers the
 * ticket's AC4 (filtering, keyboard selection, grouped rendering) directly
 * against the shared primitive; ConditionRow.test.tsx and
 * ConditionValueInput.test.tsx cover it wired into its two call sites.
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { VariableCombobox } from '../../../../client/src/components/logic/VariableCombobox';

import type { VariableInfo } from '@shared/types/conditions';

// Radix Popover/cmdk need these polyfilled in jsdom before they behave (same
// recipe used for Radix Select elsewhere in this test suite, e.g.
// tests/unit/client/LogicBuilder.test.tsx).
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
    type: 'text',
    pageId: 'sec1',
    pageTitle: 'Page 1',
  },
  {
    id: 's2',
    alias: 'last_name',
    label: 'Last name',
    title: 'Last name',
    type: 'text',
    pageId: 'sec1',
    pageTitle: 'Page 1',
  },
  {
    id: 's3',
    // Alias unrelated to the title on purpose — proves filtering matches
    // BOTH fields rather than just whichever one happens to be the value.
    alias: 'xyz123',
    label: 'Amount Due',
    title: 'Amount Due',
    type: 'text',
    pageId: 'sec2',
    pageTitle: 'Page 2',
  },
];

describe('VariableCombobox — grouped rendering (LU-4 AC2/AC4)', () => {
  it('renders page headings and every variable within its page when opened', async () => {
    const user = userEvent.setup();
    render(<VariableCombobox variables={VARIABLES} value="" onChange={vi.fn()} />);

    await user.click(screen.getByRole('combobox'));

    expect(await screen.findByText('Page 1')).toBeInTheDocument();
    expect(screen.getByText('Page 2')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /first_name/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /last_name/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /xyz123/i })).toBeInTheDocument();
  });
});

describe('VariableCombobox — filtering matches alias and label (LU-4 AC2/AC4)', () => {
  it('filters by alias', async () => {
    const user = userEvent.setup();
    render(<VariableCombobox variables={VARIABLES} value="" onChange={vi.fn()} />);

    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByPlaceholderText(/search variables/i), 'xyz123');

    expect(await screen.findByRole('option', { name: /xyz123/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /first_name/i })).not.toBeInTheDocument();
  });

  it('filters by label/title even when it shares no text with the alias', async () => {
    const user = userEvent.setup();
    render(<VariableCombobox variables={VARIABLES} value="" onChange={vi.fn()} />);

    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByPlaceholderText(/search variables/i), 'Amount');

    expect(await screen.findByRole('option', { name: /xyz123/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /first_name/i })).not.toBeInTheDocument();
  });

  it('shows the empty state when nothing matches', async () => {
    const user = userEvent.setup();
    render(<VariableCombobox variables={VARIABLES} value="" onChange={vi.fn()} emptyText="No matching fields." />);

    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByPlaceholderText(/search variables/i), 'nonexistent-term');

    expect(await screen.findByText('No matching fields.')).toBeInTheDocument();
  });
});

describe('VariableCombobox — keyboard selection (LU-4 AC1/AC4)', () => {
  it('selects the sole filtered match by typing then pressing Enter', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<VariableCombobox variables={VARIABLES} value="" onChange={onChange} />);

    await user.click(screen.getByRole('combobox'));
    const input = screen.getByPlaceholderText(/search variables/i);
    await user.type(input, 'xyz123');
    await screen.findByRole('option', { name: /xyz123/i });
    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledWith('xyz123');
  });

  it('moves the highlight with ArrowDown and selects the second item with Enter', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<VariableCombobox variables={VARIABLES} value="" onChange={onChange} />);

    await user.click(screen.getByRole('combobox'));
    await screen.findByRole('option', { name: /first_name/i });
    // Focus lands in the search input on open; ArrowDown/Enter are handled
    // by the Command root regardless, matching real keyboard use.
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenCalledWith('last_name');
  });
});

describe('VariableCombobox — accessibility (LU-4 AC5)', () => {
  it('reports aria-expanded on the trigger and closes the popover after a selection', async () => {
    const user = userEvent.setup();
    render(<VariableCombobox variables={VARIABLES} value="" onChange={vi.fn()} />);

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await user.click(await screen.findByRole('option', { name: /first_name/i }));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders items with role="option" inside a listbox', async () => {
    const user = userEvent.setup();
    render(<VariableCombobox variables={VARIABLES} value="" onChange={vi.fn()} />);

    await user.click(screen.getByRole('combobox'));
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getAllByRole('option').length).toBe(VARIABLES.length);
  });
});

describe('VariableCombobox — selected value display', () => {
  it('shows the alias of the currently selected variable on the trigger', () => {
    render(<VariableCombobox variables={VARIABLES} value="last_name" onChange={vi.fn()} />);

    expect(screen.getByRole('combobox')).toHaveTextContent('last_name');
  });
});
