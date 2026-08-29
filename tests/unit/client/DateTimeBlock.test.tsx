// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BlockRenderer } from '../../../client/src/components/runner/blocks/BlockRenderer';
import type { Step } from '../../../client/src/types';

function dateTimeStep(
  kind: 'date' | 'time' | 'datetime',
  config: Record<string, unknown> = {},
): Step {
  return {
    id: `date-time-${kind}`,
    workflowId: 'workflow-1',
    pageId: 'page-1',
    type: 'date_time',
    title: `${kind} answer`,
    description: null,
    required: false,
    alias: null,
    order: 0,
    config: { kind, ...config },
    createdAt: '2026-08-28T00:00:00.000Z',
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('canonical date_time runner', () => {
  it.each([
    ['date', 'date', '2026-08-28', '2026-08-29'],
    ['time', 'time', '14:35', '14:40'],
    ['datetime', 'datetime-local', '2026-08-28T14:35', '2026-08-29T14:40'],
  ] as const)('renders kind %s as the matching HTML control', (kind, inputType, value, changedValue) => {
    const onChange = vi.fn();
    render(<BlockRenderer step={dateTimeStep(kind)} value={value} onChange={onChange} />);

    const input = screen.getByLabelText(`${kind} answer`);
    expect(input).toHaveAttribute('type', inputType);
    expect(input).toHaveValue(value);
    expect(input).toBeEnabled();

    fireEvent.change(input, { target: { value: changedValue } });
    expect(onChange).toHaveBeenLastCalledWith(changedValue);
  });

  it('preserves date bounds, date default, time format, and minute step behavior', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));
    const onDateChange = vi.fn();
    const { unmount } = render(<BlockRenderer
      step={dateTimeStep('date', {
        minDate: '2026-01-01',
        maxDate: '2026-12-31',
        defaultToToday: true,
      })}
      value={null}
      onChange={onDateChange}
    />);

    const date = screen.getByLabelText('date answer');
    expect(date).toHaveAttribute('min', '2026-01-01');
    expect(date).toHaveAttribute('max', '2026-12-31');
    expect(onDateChange).toHaveBeenCalledWith('2026-08-28');
    unmount();

    render(<BlockRenderer
      step={dateTimeStep('time', { timeFormat: '24h', timeStep: 5 })}
      value="14:35"
      onChange={vi.fn()}
    />);
    const time = screen.getByLabelText('time answer');
    expect(time).toHaveAttribute('step', '300');
    expect(time).toHaveAttribute('lang', 'en-GB');
  });

  it.each([
    ['date', { minDate: '2026-01-01' }, 'date'],
    ['time', { format: '24h', step: 10 }, 'time'],
    ['datetime', { timeFormat: '12h', timeStep: 15 }, 'datetime-local'],
    ['datetime_unified', { kind: 'date' }, 'date'],
  ] as const)('adapts legacy %s rows at the runner boundary', (type, config, inputType) => {
    const legacy = {
      ...dateTimeStep('datetime'),
      type,
      title: `Legacy ${type}`,
      config,
    } as Step;

    render(<BlockRenderer step={legacy} value={null} onChange={vi.fn()} />);
    expect(screen.getByLabelText(`Legacy ${type}`)).toHaveAttribute('type', inputType);
  });
});
