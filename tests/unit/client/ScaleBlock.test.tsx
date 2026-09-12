// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ScaleBlockRenderer } from '../../../client/src/components/runner/blocks/ScaleBlock';
import type { Step } from '../../../client/src/types';
import type { ScaleConfig } from '../../../shared/types/stepConfigs';

function scaleStep(config: ScaleConfig): Step {
  return {
    id: 'scale-1',
    workflowId: 'workflow-1',
    pageId: 'page-1',
    type: 'scale',
    title: 'Rate your experience',
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

describe('ScaleBlockRenderer — storage stays numeric', () => {
  it('emits numbers when slider changes', () => {
    const onChange = vi.fn();
    render(
      <ScaleBlockRenderer
        step={scaleStep({ min: 1, max: 10, step: 1, display: 'slider' })}
        value={null}
        onChange={onChange}
      />
    );

    const slider = screen.getByRole('slider');
    slider.focus();
    fireEvent.keyDown(slider, { key: 'ArrowRight' });

    expect(onChange).toHaveBeenCalled();
    // Decision 8: numeric storage stays numeric. Asserting only that onChange fired
    // would not catch a regression that emitted the value as a string.
    expect(typeof onChange.mock.calls.at(-1)?.[0]).toBe('number');
  });

  it('renders stars mode and emits numeric values on click', () => {
    const onChange = vi.fn();
    render(
      <ScaleBlockRenderer
        step={scaleStep({ min: 1, max: 5, step: 1, display: 'stars' })}
        value={null}
        onChange={onChange}
      />
    );

    const stars = screen.getAllByRole('radio');
    expect(stars).toHaveLength(5);
    
    fireEvent.click(stars[3]);
    expect(onChange).toHaveBeenLastCalledWith(4);
  });
});
