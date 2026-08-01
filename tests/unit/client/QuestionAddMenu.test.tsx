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
  it('organizes question categories in two independent stacks', async () => {
    const user = userEvent.setup();
    render(
      <QuestionAddMenu
        sectionId="section-1"
        nextOrder={1}
        workflowId="workflow-1"
      />
    );

    await user.click(screen.getByRole('button', { name: 'Add Question' }));

    const categoryColumns = screen.getAllByTestId('question-category-column');
    expect(categoryColumns).toHaveLength(2);
    expect(categoryColumns[0]).toHaveClass('flex', 'flex-col');
    expect(categoryColumns[1]).toHaveClass('flex', 'flex-col');

    const categoryLabelsByColumn = categoryColumns.map((column) =>
      Array.from(column.children).map(
        (category) => category.firstElementChild?.textContent
      )
    );
    expect(categoryLabelsByColumn).toEqual([
      ['Text Inputs', 'Validated Inputs', 'Choice Inputs', 'Display'],
      ['Boolean Inputs', 'Date/Time', 'Numeric Inputs'],
    ]);
  });
});
