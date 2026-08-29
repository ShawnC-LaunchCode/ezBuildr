// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChoiceBlockRenderer } from '../../../client/src/components/runner/blocks/ChoiceBlock';
import type { Step } from '../../../client/src/types';

/**
 * STB-7 AC3/AC5. `display` decides cardinality and `layout` decides direction;
 * they are independent, and layout must be ignored by the displays that have
 * no rows to lay out. Added by the reviewer: the turn-in shipped no coverage
 * for either axis.
 */
function choiceStep(config: Record<string, unknown>, type = 'choice'): Step {
  return {
    id: 'choice-1',
    workflowId: 'workflow-1',
    pageId: 'page-1',
    type,
    title: 'Pick one',
    description: null,
    required: false,
    alias: null,
    order: 0,
    config: {
      options: [
        { id: '1', label: 'Alpha' },
        { id: '2', label: 'Beta' },
      ],
      ...config,
    },
    createdAt: '2026-08-29T00:00:00.000Z',
    updatedAt: '2026-08-29T00:00:00.000Z',
  } as unknown as Step;
}

/** The container that actually carries the direction classes. */
async function layoutContainer(): Promise<HTMLElement> {
  // Options are resolved in an effect, so nothing exists on first paint.
  const option = await screen.findByText('Alpha');
  let node: HTMLElement | null = option;
  for (let i = 0; i < 6 && node; i += 1) {
    const cls = node.className;
    if (typeof cls === 'string' && (cls.includes('flex-row') || cls.includes('flex-col') || cls.includes('space-y-2'))) {
      return node;
    }
    node = node.parentElement;
  }
  throw new Error('no layout container found');
}

afterEach(cleanup);

describe('ChoiceBlockRenderer — layout is independent of display', () => {
  it.each(['radio', 'multiple'] as const)('lays %s out vertically by default', async (display) => {
    render(
      <ChoiceBlockRenderer step={choiceStep({ display })} value={null} onChange={vi.fn()} />
    );
    const container = await layoutContainer();
    expect(container.className).not.toContain('flex-row');
  });

  it.each(['radio', 'multiple'] as const)('lays %s out horizontally when asked', async (display) => {
    render(
      <ChoiceBlockRenderer
        step={choiceStep({ display, layout: 'horizontal' })}
        value={null}
        onChange={vi.fn()}
      />
    );
    const container = await layoutContainer();
    expect(container.className).toContain('flex-row');
    expect(container.className).toContain('flex-wrap');
  });

  it('renders both options whichever direction is chosen', async () => {
    render(
      <ChoiceBlockRenderer
        step={choiceStep({ display: 'radio', layout: 'horizontal' })}
        value={null}
        onChange={vi.fn()}
      />
    );
    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });
});

describe('ChoiceBlockRenderer — cardinality comes from display', () => {
  it('renders radios for a single-select', async () => {
    render(<ChoiceBlockRenderer step={choiceStep({ display: 'radio' })} value={null} onChange={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByRole('radio')).toHaveLength(2));
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('renders checkboxes for a multiple-select', async () => {
    render(<ChoiceBlockRenderer step={choiceStep({ display: 'multiple' })} value={[]} onChange={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(2));
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it('reads a pre-STB-7 allowMultiple row as multi-select, not a radio', async () => {
    // The stored answer for such a row is a string[]; rendering radios would
    // orphan it. Read compatibility only -- nothing writes allowMultiple now.
    render(
      <ChoiceBlockRenderer
        step={choiceStep({ display: 'radio', allowMultiple: true })}
        value={[]}
        onChange={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(2));
  });
});

describe('ChoiceBlockRenderer — storage shape', () => {
  it('emits a bare string for single-select', async () => {
    const onChange = vi.fn();
    render(<ChoiceBlockRenderer step={choiceStep({ display: 'radio' })} value={null} onChange={onChange} />);
    await waitFor(() => expect(screen.getAllByRole('radio')).toHaveLength(2));
    screen.getAllByRole('radio')[0].click();
    expect(onChange).toHaveBeenLastCalledWith('1');
  });

  it('emits an array for multi-select', async () => {
    const onChange = vi.fn();
    render(<ChoiceBlockRenderer step={choiceStep({ display: 'multiple' })} value={[]} onChange={onChange} />);
    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(2));
    screen.getAllByRole('checkbox')[0].click();
    expect(onChange).toHaveBeenLastCalledWith(['1']);
  });
});
