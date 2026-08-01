// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ResizableBuilderLayout } from '../../../client/src/components/builder/layout/ResizableBuilderLayout';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('ResizableBuilderLayout', () => {
  it('lets authors collapse and restore the navigation panel', async () => {
    const user = userEvent.setup();
    render(
      <ResizableBuilderLayout
        workflowId="workflow-1"
        leftPanel={<div>Navigation</div>}
        centerPanel={<div>Canvas</div>}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Hide navigation panel' }));
    expect(screen.getByRole('button', { name: 'Show navigation panel' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show navigation panel' }));
    expect(screen.getByRole('button', { name: 'Hide navigation panel' })).toBeInTheDocument();
  });

  it('labels the AI panel toggle for keyboard and assistive technology users', () => {
    render(
      <ResizableBuilderLayout
        leftPanel={<div>Navigation</div>}
        centerPanel={<div>Canvas</div>}
        rightPanel={<div>AI assistant</div>}
      />
    );

    expect(screen.getByRole('button', { name: 'Show AI assistant' })).toBeInTheDocument();
  });
});
