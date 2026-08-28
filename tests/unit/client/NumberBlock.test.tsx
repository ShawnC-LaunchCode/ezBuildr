// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BlockRenderer } from '../../../client/src/components/runner/blocks/BlockRenderer';
import { NumberBlockRenderer } from '../../../client/src/components/runner/blocks/NumberBlock';
import type { Step } from '../../../client/src/types';

function numberStep(config: Record<string, unknown>, type = 'number'): Step {
  return {
    id: 'num-1',
    workflowId: 'workflow-1',
    pageId: 'page-1',
    type,
    title: 'Amount',
    description: null,
    required: false,
    alias: null,
    order: 0,
    config,
    createdAt: '2026-08-28T00:00:00.000Z',
    updatedAt: '2026-08-28T00:00:00.000Z',
  } as unknown as Step;
}

afterEach(cleanup);

describe('NumberBlockRenderer — storage stays numeric', () => {
  it('emits numbers, never formatted strings', () => {
    const onChange = vi.fn();
    render(
      <NumberBlockRenderer
        step={numberStep({ mode: 'number', thousandsSeparator: true })}
        value={null}
        onChange={onChange}
      />
    );

    fireEvent.change(screen.getByRole<HTMLInputElement>('textbox'), { target: { value: '1,234', selectionStart: 5 } });
    expect(onChange).toHaveBeenLastCalledWith(1234);
  });

  it('emits null for an emptied field', () => {
    const onChange = vi.fn();
    render(<NumberBlockRenderer step={numberStep({ mode: 'number' })} value={42} onChange={onChange} />);

    fireEvent.change(screen.getByRole<HTMLInputElement>('textbox'), { target: { value: '', selectionStart: 0 } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it.each(['-', '1.', '-0.'])('keeps intermediate text %s on screen and emits nothing', (text) => {
    const onChange = vi.fn();
    render(<NumberBlockRenderer step={numberStep({ mode: 'number' })} value={null} onChange={onChange} />);

    const input = screen.getByRole<HTMLInputElement>('textbox');
    fireEvent.change(input, { target: { value: text, selectionStart: text.length } });

    expect(input.value).toBe(text);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reports out-of-range values instead of swallowing the keystroke', () => {
    // The previous control returned early when the parsed value fell outside
    // min/max, so typing "5" into a min-10 field silently ate the character.
    const onChange = vi.fn();
    render(
      <NumberBlockRenderer
        step={numberStep({ mode: 'number', validation: { min: 10, max: 20 } })}
        value={null}
        onChange={onChange}
      />
    );

    const input = screen.getByRole<HTMLInputElement>('textbox');
    fireEvent.change(input, { target: { value: '5', selectionStart: 1 } });

    expect(input.value).toBe('5');
    expect(onChange).toHaveBeenLastCalledWith(5);
  });
});

describe('NumberBlockRenderer — grouping is display only', () => {
  it('groups when unfocused and ungroups for editing', () => {
    render(
      <NumberBlockRenderer
        step={numberStep({ mode: 'number', thousandsSeparator: true })}
        value={1234567}
        onChange={vi.fn()}
      />
    );

    const input = screen.getByRole<HTMLInputElement>('textbox');
    expect(input.value).toBe('1,234,567');

    fireEvent.focus(input);
    expect(input.value).toBe('1234567');

    fireEvent.blur(input);
    expect(input.value).toBe('1,234,567');
  });

  it('keeps grouping while typing when formatOnInput is set', () => {
    render(
      <NumberBlockRenderer
        step={numberStep({ mode: 'number', thousandsSeparator: true, formatOnInput: true })}
        value={1234567}
        onChange={vi.fn()}
      />
    );

    const input = screen.getByRole<HTMLInputElement>('textbox');
    fireEvent.focus(input);
    // Unlike the non-live case above, focus does not strip the separators.
    expect(input.value).toBe('1,234,567');

    fireEvent.change(input, { target: { value: '12345678', selectionStart: 8 } });
    expect(input.value).toBe('12,345,678');
  });

  it('does not group at all when the switch is off', () => {
    render(
      <NumberBlockRenderer step={numberStep({ mode: 'number' })} value={1234567} onChange={vi.fn()} />
    );
    expect(screen.getByRole<HTMLInputElement>('textbox').value).toBe('1234567');
  });
});

describe('NumberBlockRenderer — decorations', () => {
  it('renders prefix and suffix without putting them in the editable value', () => {
    render(
      <NumberBlockRenderer
        step={numberStep({ mode: 'number', prefix: '#', suffix: 'kg' })}
        value={12}
        onChange={vi.fn()}
      />
    );

    const input = screen.getByRole<HTMLInputElement>('textbox');
    expect(input.value).toBe('12');
    expect(screen.getByText('#')).toBeInTheDocument();
    expect(screen.getByText('kg')).toBeInTheDocument();
    expect(input.className).toContain('pl-7');
    expect(input.className).toContain('pr-10');
  });

  it('exposes the unit to assistive tech, since the adornments are aria-hidden', () => {
    render(
      <NumberBlockRenderer
        step={numberStep({ mode: 'number', suffix: '%' })}
        value={5}
        onChange={vi.fn()}
      />
    );

    const input = screen.getByRole<HTMLInputElement>('textbox');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toContain('num-1-unit');
    expect(document.getElementById('num-1-unit')?.textContent).toBe('%');
  });

  it('adds no padding or description when there are no decorations', () => {
    render(<NumberBlockRenderer step={numberStep({ mode: 'number' })} value={1} onChange={vi.fn()} />);
    const input = screen.getByRole<HTMLInputElement>('textbox');
    expect(input.className).not.toContain('pl-7');
    expect(input.getAttribute('aria-describedby')).toBeNull();
  });
});

describe('BlockRenderer — retired number rows', () => {
  it('renders a number_advanced row through the canonical control', () => {
    render(
      <BlockRenderer
        step={numberStep({ mode: 'currency_whole', validation: { min: 0 }, thousandsSeparator: true }, 'number_advanced')}
        value={1234}
        onChange={vi.fn()}
      />
    );

    // Adapted by LEGACY_STEP_ADAPTERS before the switch: it renders, and it
    // honours the grouping the old control ignored entirely.
    expect(screen.getByRole<HTMLInputElement>('textbox').value).toBe('1,234');
  });

  it('lifts a retired root-shape number row into nested validation', () => {
    render(
      <BlockRenderer
        step={numberStep({ min: 1, max: 5, allowDecimal: false })}
        value={3}
        onChange={vi.fn()}
      />
    );

    const input = screen.getByRole<HTMLInputElement>('textbox');
    expect(input.value).toBe('3');
    // Always "decimal", even though the retired `allowDecimal: false` maps to
    // precision 0. Precision is display-only (Decision 13), so the keypad must
    // still offer a decimal point -- a cosmetic setting must never stop someone
    // entering the number they actually have.
    expect(input.getAttribute('inputmode')).toBe('decimal');
  });
});
