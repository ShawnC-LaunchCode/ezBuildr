// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PHONE_IDLE_CHECK_MS, PhoneBlockRenderer } from '../../../client/src/components/runner/blocks/PhoneBlock';
import type { Step } from '../../../client/src/types';

function phoneStep(config: Record<string, unknown> = { format: 'international' }): Step {
  return {
    id: 'phone-1',
    workflowId: 'workflow-1',
    pageId: 'page-1',
    type: 'phone',
    title: 'Phone',
    description: null,
    required: false,
    alias: null,
    order: 0,
    config,
    createdAt: '2026-09-15T00:00:00.000Z',
    updatedAt: '2026-09-15T00:00:00.000Z',
  } as unknown as Step;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('PhoneBlockRenderer — digits stored, right-filled display', () => {
  it('stores digits only and shows them right-filled', () => {
    const onChange = vi.fn();
    const { rerender } = render(<PhoneBlockRenderer step={phoneStep()} value="" onChange={onChange} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '120987654321' } });
    expect(onChange).toHaveBeenLastCalledWith('120987654321');

    rerender(<PhoneBlockRenderer step={phoneStep()} value="120987654321" onChange={onChange} />);
    expect(screen.getByRole<HTMLInputElement>('textbox').value).toBe('+12 (098) 765-4321');
  });

  it('strips the formatting a respondent types or pastes', () => {
    const onChange = vi.fn();
    render(<PhoneBlockRenderer step={phoneStep()} value="" onChange={onChange} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '+1 (555) 201-3344' } });
    expect(onChange).toHaveBeenLastCalledWith('15552013344');
  });

  it('stops at 15 digits', () => {
    const onChange = vi.fn();
    render(<PhoneBlockRenderer step={phoneStep()} value="" onChange={onChange} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '12345678901234567' } });
    expect(onChange).toHaveBeenLastCalledWith('123456789012345');
  });

  it('formats the same way whatever the configured format', () => {
    render(<PhoneBlockRenderer step={phoneStep({ format: 'US' })} value="15552013344" onChange={vi.fn()} />);
    expect(screen.getByRole<HTMLInputElement>('textbox').value).toBe('+1 (555) 201-3344');
  });
});

describe('PhoneBlockRenderer — too-short numbers, after a one-second pause', () => {
  it('flags fewer than 7 digits once typing pauses for a second, not before', () => {
    vi.useFakeTimers();
    render(<PhoneBlockRenderer step={phoneStep()} value="" onChange={vi.fn()} />);
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: '123456' } });
    act(() => { vi.advanceTimersByTime(PHONE_IDLE_CHECK_MS - 1); });
    expect(screen.queryByRole('alert')).toBeNull();

    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.getByRole('alert')).toHaveTextContent('Phone numbers need at least 7 digits');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('does not flag 7 or more digits', () => {
    vi.useFakeTimers();
    render(<PhoneBlockRenderer step={phoneStep()} value="" onChange={vi.fn()} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '7654321' } });
    act(() => { vi.advanceTimersByTime(PHONE_IDLE_CHECK_MS); });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('clears the flag as soon as typing resumes', () => {
    vi.useFakeTimers();
    render(<PhoneBlockRenderer step={phoneStep()} value="" onChange={vi.fn()} />);
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: '123' } });
    act(() => { vi.advanceTimersByTime(PHONE_IDLE_CHECK_MS); });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: '1234' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('leaves the message to page validation when that is already showing one', () => {
    vi.useFakeTimers();
    render(<PhoneBlockRenderer step={phoneStep()} value="" onChange={vi.fn()} hasError />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '123' } });
    act(() => { vi.advanceTimersByTime(PHONE_IDLE_CHECK_MS); });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
