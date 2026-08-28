// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { QuestionAddMenu } from '../../../client/src/components/builder/pages/QuestionAddMenu';
import { useWorkflowMode, useCreateStep } from '../../../client/src/lib/vault-hooks';

vi.mock('@/lib/vault-hooks', () => ({
  useCreateStep: vi.fn(),
  useWorkflowMode: vi.fn(),
}));

vi.mock('@/store/workflow-builder', () => ({
  useWorkflowBuilder: () => ({ selectStep: vi.fn() }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function mockMode(mode: 'easy' | 'advanced'): void {
  vi.mocked(useWorkflowMode).mockReturnValue({
    data: { mode },
  } as unknown as ReturnType<typeof useWorkflowMode>);
}

describe('QuestionAddMenu', () => {
  it('organizes question categories in two independent stacks (easy mode)', async () => {
    mockMode('easy');
    vi.mocked(useCreateStep).mockReturnValue({
      mutateAsync: vi.fn(),
    } as unknown as ReturnType<typeof useCreateStep>);

    const user = userEvent.setup();
    render(
      <QuestionAddMenu
        pageId="page-1"
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
    // "structure" (List) sits between Boolean and Validated in CATEGORY_ORDER —
    // see the comment on CATEGORY_ORDER in blockRegistry.tsx for why this
    // split keeps both columns balanced.
    expect(categoryLabelsByColumn).toEqual([
      ['Text Inputs', 'Structure', 'Date/Time', 'Numeric Inputs'],
      ['Boolean Inputs', 'Validated Inputs', 'Choice Inputs', 'Display'],
    ]);
  });

  it('shows List in the palette in both easy and advanced mode', async () => {
    vi.mocked(useCreateStep).mockReturnValue({
      mutateAsync: vi.fn(),
    } as unknown as ReturnType<typeof useCreateStep>);

    mockMode('easy');
    const user = userEvent.setup();
    const { unmount } = render(
      <QuestionAddMenu
        pageId="page-1"
        nextOrder={1}
        workflowId="workflow-1"
      />
    );
    await user.click(screen.getByRole('button', { name: 'Add Question' }));
    expect(screen.getByText('List')).toBeInTheDocument();
    unmount();

    mockMode('advanced');
    render(
      <QuestionAddMenu
        pageId="page-1"
        nextOrder={1}
        workflowId="workflow-1"
      />
    );
    await user.click(screen.getByRole('button', { name: 'Add Question' }));
    expect(screen.getByText('List')).toBeInTheDocument();
  });

  it('creates a list step with a default ListConfig containing exactly one question field', async () => {
    mockMode('easy');
    const mutateAsync = vi.fn().mockResolvedValue({ id: 'new-step-id' });
    vi.mocked(useCreateStep).mockReturnValue({
      mutateAsync,
    } as unknown as ReturnType<typeof useCreateStep>);

    const user = userEvent.setup();
    render(
      <QuestionAddMenu
        pageId="page-1"
        nextOrder={1}
        workflowId="workflow-1"
      />
    );

    await user.click(screen.getByRole('button', { name: 'Add Question' }));
    await user.click(screen.getByText('List'));

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    const [call] = mutateAsync.mock.calls[0] as [
      { type: string; config: { fields: unknown[] } },
    ];
    expect(call.type).toBe('list');
    expect(call.config.fields).toHaveLength(1);
    expect(call.config.fields[0]).toMatchObject({ type: 'text', config: { variant: 'short' } });
  });

  it.each([
    ['Short Text', 'short'],
    ['Long Text', 'long'],
  ] as const)('creates the Easy %s preset as canonical text', async (label, variant) => {
    mockMode('easy');
    const mutateAsync = vi.fn().mockResolvedValue({ id: `text-${variant}` });
    vi.mocked(useCreateStep).mockReturnValue({ mutateAsync } as unknown as ReturnType<typeof useCreateStep>);

    const user = userEvent.setup();
    render(<QuestionAddMenu pageId="page-1" nextOrder={3} workflowId="workflow-1" />);
    await user.click(screen.getByRole('button', { name: 'Add Question' }));
    await user.click(screen.getByText(label));

    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      type: 'text',
      title: `New ${label}`,
      config: { variant },
    }));
  });

  it('renders distinct presentation marks for the two canonical text presets', async () => {
    mockMode('easy');
    vi.mocked(useCreateStep).mockReturnValue({ mutateAsync: vi.fn() } as unknown as ReturnType<typeof useCreateStep>);

    const user = userEvent.setup();
    render(<QuestionAddMenu pageId="page-1" nextOrder={1} workflowId="workflow-1" />);
    await user.click(screen.getByRole('button', { name: 'Add Question' }));

    const shortIcon = within(screen.getByRole('menuitem', { name: /Short Text/ })).getByTitle('Short Text');
    const longIcon = within(screen.getByRole('menuitem', { name: /Long Text/ })).getByTitle('Long Text');
    expect(shortIcon).toHaveTextContent('T');
    expect(longIcon).toHaveTextContent('¶');
    expect(shortIcon.textContent).not.toBe(longIcon.textContent);
  });

  it('shows the canonical Text action in Advanced without friendly duplicate actions', async () => {
    mockMode('advanced');
    vi.mocked(useCreateStep).mockReturnValue({ mutateAsync: vi.fn() } as unknown as ReturnType<typeof useCreateStep>);

    const user = userEvent.setup();
    render(<QuestionAddMenu pageId="page-1" nextOrder={1} workflowId="workflow-1" />);
    await user.click(screen.getByRole('button', { name: 'Add Question' }));

    expect(screen.getByText('Text')).toBeInTheDocument();
    expect(screen.queryByText('Short Text')).not.toBeInTheDocument();
    expect(screen.queryByText('Long Text')).not.toBeInTheDocument();
  });
});
