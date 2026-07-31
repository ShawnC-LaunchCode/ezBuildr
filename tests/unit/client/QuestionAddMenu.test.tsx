// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { QuestionAddMenu } from '../../../client/src/components/builder/pages/QuestionAddMenu';

vi.mock('@/lib/vault-hooks', () => ({
  useCreateStep: () => ({ mutateAsync: vi.fn() }),
  useWorkflowMode: () => ({ data: { mode: 'easy' } }),
}));

vi.mock('@/store/workflow-builder', () => ({
  useWorkflowBuilder: () => ({ selectStep: vi.fn() }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

afterEach(() => {
  cleanup();
});

describe('QuestionAddMenu', () => {
  it('organizes question categories in a two-column grid', async () => {
    const user = userEvent.setup();
    render(
      <QuestionAddMenu
        sectionId="section-1"
        nextOrder={1}
        workflowId="workflow-1"
      />
    );

    await user.click(screen.getByRole('button', { name: 'Add Question' }));

    const categoryGrid = document.querySelector('.grid.grid-cols-2');
    expect(categoryGrid).not.toBeNull();

    const categoryLabels = Array.from(categoryGrid?.children ?? []).map(
      (category) => category.firstElementChild?.textContent
    );
    expect(categoryLabels).toEqual([
      'Text Inputs',
      'Boolean Inputs',
      'Validated Inputs',
      'Date/Time',
      'Choice Inputs',
      'Numeric Inputs',
      'Display',
    ]);

    expect(categoryGrid).toHaveClass('grid', 'grid-cols-2');
    expect(categoryGrid?.children).toHaveLength(7);
  });
});
