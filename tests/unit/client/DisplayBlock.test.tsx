// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DisplayBlockRenderer } from '../../../client/src/components/runner/blocks/DisplayBlock';
import type { Step } from '../../../client/src/types';
import type { DisplayConfig } from '../../../shared/types/stepConfigs';

function displayStep(config: DisplayConfig): Step {
  return {
    id: 'display-1',
    workflowId: 'workflow-1',
    pageId: 'page-1',
    type: 'display',
    title: 'Display Block',
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

describe('DisplayBlockRenderer — canonical config rendering', () => {
  it('renders markdown text correctly', () => {
    render(
      <DisplayBlockRenderer
        step={displayStep({ markdown: '**Bold Text** and *Italic Text*' })}
        context={{}}
        aliasMap={{}}
      />
    );

    // Markdown must render as real elements, not escaped text.
    expect(screen.getByText('Bold Text').tagName).toBe('STRONG');
    expect(screen.getByText('Italic Text').tagName).toBe('EM');
    expect(screen.getByText('and')).toBeInTheDocument();
  });
});
