// @vitest-environment jsdom
/**
 * LIST-8 — the runner's List block, end to end through the same
 * collapsed-view / drill-in switch WorkflowRunner.tsx uses. Covers:
 * AC2 (add drills straight into the new item, first field focused),
 * AC3 (item rows show the labelTemplate label, falling back to a
 * placeholder), AC5 (delete asks for confirmation naming what nested data
 * is lost), and the structural half of AC7 (breadcrumb, "← parent", "Done").
 * AC9 (browser back) is covered in ListDrillContext.test.tsx.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { ListBlockRenderer } from '../../../client/src/components/runner/blocks/ListBlock';
import { ListDrillEditor } from '../../../client/src/components/runner/list/ListDrillEditor';
import { ListDrillProvider, useListDrill } from '../../../client/src/components/runner/list/ListDrillContext';

import type { ApiStep } from '../../../client/src/lib/vault-api';
import type { ListConfig, ListValue } from '../../../shared/types/stepConfigs';

const config: ListConfig = {
  fields: [
    { kind: 'question', id: 'f-name', alias: 'name', type: 'short_text', title: 'Name', order: 0, required: true },
    {
      kind: 'list',
      id: 'f-addresses',
      alias: 'addresses',
      title: 'Addresses',
      order: 1,
      list: {
        fields: [{ kind: 'question', id: 'f-street', alias: 'street', type: 'short_text', title: 'Street', order: 0 }],
      },
    },
  ],
  labelTemplate: '{name}',
  addButtonText: 'Add child',
};

const step: ApiStep = {
  id: 'step-children',
  workflowId: 'wf-1',
  sectionId: 'sec-1',
  type: 'list',
  title: 'Children',
  description: null,
  required: false,
  alias: 'children',
  order: 0,
  isVirtual: false,
  config: config as unknown as Record<string, unknown>,
  createdAt: '2026-08-01T00:00:00.000Z',
};

/** Mirrors WorkflowRunner.tsx's QuestionCardContent: swap collapsed list <-> drill editor based on drill context. */
function Harness({ initialValue }: { initialValue: ListValue }) {
  const [value, setValue] = useState<ListValue>(initialValue);
  const { drill } = useListDrill();

  if (drill) {
    return <ListDrillEditor step={step} value={value} onChange={setValue} drill={drill} />;
  }
  return <ListBlockRenderer step={step} value={value} onChange={setValue} />;
}

function renderList(initialValue: ListValue = { items: [] }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ListDrillProvider>
        <Harness initialValue={initialValue} />
      </ListDrillProvider>
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
});

describe('List block: collapsed view (AC3)', () => {
  it('shows the resolved labelTemplate for each item', () => {
    renderList({ items: [{ itemId: 'a', values: { name: 'Ava Chen' } }] });
    expect(screen.getByText('Ava Chen')).toBeInTheDocument();
  });

  it('falls back to a placeholder when the template resolves empty', () => {
    renderList({ items: [{ itemId: 'a', values: {} }] });
    expect(screen.getByText('Item 1')).toBeInTheDocument();
  });

  it('shows the empty state when there are no items yet', () => {
    renderList({ items: [] });
    expect(screen.getByText('No items yet.')).toBeInTheDocument();
  });
});

describe('List block: add drills in (AC2)', () => {
  it('creates a new item and immediately shows the drilled editor with the first field focused', async () => {
    const user = userEvent.setup();
    renderList({ items: [] });

    await user.click(screen.getByText('Add child'));

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /name/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('textbox', { name: /name/i })).toHaveFocus();
  });

  it('breadcrumbs the new (unnamed) item as "Item 1", not "Item 0" — regression: onChange and onOpenItem fire in the same tick, one render before the parent\'s own item list reflects the addition', async () => {
    const user = userEvent.setup();
    renderList({ items: [] });

    await user.click(screen.getByText('Add child'));

    expect(await screen.findByText('Children › Item 1')).toBeInTheDocument();
  });
});

describe('List block: delete confirmation (AC5)', () => {
  it('names the nested data that will be lost', async () => {
    const user = userEvent.setup();
    renderList({
      items: [
        {
          itemId: 'a',
          values: {
            name: 'Ava',
            addresses: {
              items: [
                { itemId: 'addr-1', values: { street: '1 Oak St' } },
                { itemId: 'addr-2', values: { street: '2 Elm St' } },
              ],
            },
          },
        },
      ],
    });

    await user.click(screen.getByRole('button', { name: /delete ava/i }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/2 addresses/i)).toBeInTheDocument();
  });

  it('shows a plain confirmation when there is nothing nested to lose', async () => {
    const user = userEvent.setup();
    renderList({ items: [{ itemId: 'a', values: { name: 'Ava', addresses: { items: [] } } }] });

    await user.click(screen.getByRole('button', { name: /delete ava/i }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/can't be undone/i)).toBeInTheDocument();
  });
});

describe('List block: drill-in editor structure (AC7)', () => {
  it('shows a breadcrumb and both a "← parent" back control and a "Done" control', async () => {
    const user = userEvent.setup();
    renderList({ items: [{ itemId: 'a', values: { name: 'Ava', addresses: { items: [] } } }] });

    await user.click(screen.getByText('Ava'));

    expect(screen.getByText('Children › Ava')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Children' })).toBeInTheDocument();
    const doneButton = screen.getByRole('button', { name: 'Done' });
    expect(doneButton).toBeInTheDocument();

    await user.click(doneButton);

    await waitFor(() => {
      expect(screen.getByText('Add child')).toBeInTheDocument();
    });
  });

  it('recurses into a nested list field and grows the breadcrumb', async () => {
    const user = userEvent.setup();
    renderList({
      items: [
        {
          itemId: 'a',
          values: { name: 'Ava', addresses: { items: [{ itemId: 'addr-1', values: { street: '1 Oak St' } }] } },
        },
      ],
    });

    await user.click(screen.getByText('Ava'));
    const addressesLabel = screen.getByText('Addresses');
    const addressesSection = addressesLabel.parentElement as HTMLElement;
    await user.click(within(addressesSection).getByText('Item 1'));

    expect(screen.getByText('Children › Ava › Item 1')).toBeInTheDocument();
  });

  it('breadcrumbs a freshly-added NESTED item as "Item 1" too (same race, one level deeper)', async () => {
    const user = userEvent.setup();
    renderList({
      items: [{ itemId: 'a', values: { name: 'Ava', addresses: { items: [] } } }],
    });

    await user.click(screen.getByText('Ava'));
    await user.click(screen.getByText('Add item'));

    expect(await screen.findByText('Children › Ava › Item 1')).toBeInTheDocument();
  });
});
