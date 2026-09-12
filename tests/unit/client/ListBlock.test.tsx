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

// LIST-9: a config with a required field, used by the badge/error tests below.
const configWithRequiredField: ListConfig = {
  fields: [
    { kind: 'question', id: 'f-name', alias: 'name', type: 'short_text', title: 'Name', order: 0 },
    { kind: 'question', id: 'f-dob', alias: 'dob', type: 'short_text', title: 'DOB', order: 1, required: true },
  ],
  labelTemplate: '{name}',
};

const stepWithRequiredField: ApiStep = {
  id: 'step-children',
  workflowId: 'wf-1',
  pageId: 'page-1',
  type: 'list',
  title: 'Children',
  description: null,
  required: false,
  alias: 'children',
  order: 0,
  isVirtual: false,
  config: configWithRequiredField as unknown as Record<string, unknown>,
  createdAt: '2026-08-01T00:00:00.000Z',
};

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
  pageId: 'page-1',
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
function Harness({ initialValue, activeStep }: { initialValue: ListValue; activeStep: ApiStep }) {
  const [value, setValue] = useState<ListValue>(initialValue);
  const { drill } = useListDrill();

  if (drill) {
    return <ListDrillEditor step={activeStep} value={value} onChange={setValue} drill={drill} />;
  }
  return <ListBlockRenderer step={activeStep} value={value} onChange={setValue} />;
}

function renderList(initialValue: ListValue = { items: [] }, activeStep: ApiStep = step) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ListDrillProvider>
        <Harness initialValue={initialValue} activeStep={activeStep} />
      </ListDrillProvider>
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
});

describe('List block: malformed config (LIST2-3 AC6)', () => {
  it('renders an empty list instead of throwing when step.config is null', () => {
    const malformedStep: ApiStep = { ...step, config: null };
    renderList({ items: [] }, malformedStep);
    expect(screen.getByText('No items yet.')).toBeInTheDocument();
  });

  it('renders an empty list instead of throwing when step.config has no "fields" array', () => {
    const malformedStep: ApiStep = { ...step, config: {} };
    renderList({ items: [] }, malformedStep);
    expect(screen.getByText('No items yet.')).toBeInTheDocument();
  });
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
    const addressesPage = addressesLabel.parentElement as HTMLElement;
    await user.click(within(addressesPage).getByText('Item 1'));

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

/**
 * LIST-9 — incomplete-item badges (AC3), drilling out of an invalid item
 * always succeeding (AC4), and badges/inline errors clearing live once the
 * field is fixed (AC7). Next-enforcement and the label-based error summary
 * (AC5/AC6) are covered separately in useRunNavigation.listErrors.test.tsx,
 * where the page-level "Next" flow actually lives.
 */
describe('List block: incomplete-item badges (AC3, AC4, AC7)', () => {
  it('badges a collapsed row whose required field is empty', () => {
    renderList({ items: [{ itemId: 'a', values: { name: 'Ava' } }] }, stepWithRequiredField);
    expect(screen.getByText('Incomplete or invalid')).toBeInTheDocument();
  });

  it('does not badge a complete item', () => {
    renderList({ items: [{ itemId: 'a', values: { name: 'Ava', dob: '2020-01-01' } }] }, stepWithRequiredField);
    expect(screen.queryByText('Incomplete or invalid')).not.toBeInTheDocument();
  });

  it('shows the inline field error while drilled into the invalid item, and drilling out always succeeds (AC4)', async () => {
    const user = userEvent.setup();
    renderList({ items: [{ itemId: 'a', values: { name: 'Ava' } }] }, stepWithRequiredField);

    await user.click(screen.getByText('Ava'));
    expect(screen.getByText('DOB is required')).toBeInTheDocument();

    // AC4: drill-out is never blocked by validity, even while the item is invalid.
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => {
      expect(screen.getByText('Add item')).toBeInTheDocument();
    });
  });

  it('clears the badge and the inline error live once the field is fixed, with no re-submit needed (AC7)', async () => {
    const user = userEvent.setup();
    renderList({ items: [{ itemId: 'a', values: { name: 'Ava' } }] }, stepWithRequiredField);

    expect(screen.getByText('Incomplete or invalid')).toBeInTheDocument();

    await user.click(screen.getByText('Ava'));
    expect(screen.getByText('DOB is required')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: /dob/i }), '2020-01-01');
    await waitFor(() => {
      expect(screen.queryByText('DOB is required')).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => {
      expect(screen.queryByText('Incomplete or invalid')).not.toBeInTheDocument();
    });
  });

  it('badges the ancestor row when the incomplete field is nested one level down', async () => {
    const user = userEvent.setup();
    // The base `config` fixture's nested "street" field has no `required`
    // flag, so use a variant with one for this test only.
    const nestedRequiredConfig: ListConfig = {
      ...config,
      fields: [
        config.fields[0],
        {
          kind: 'list',
          id: 'f-addresses',
          alias: 'addresses',
          title: 'Addresses',
          order: 1,
          list: { fields: [{ kind: 'question', id: 'f-street', alias: 'street', type: 'short_text', title: 'Street', order: 0, required: true }] },
        },
      ],
    };
    const stepWithNestedRequired: ApiStep = { ...step, config: nestedRequiredConfig as unknown as Record<string, unknown> };

    renderList(
      { items: [{ itemId: 'a', values: { name: 'Ava', addresses: { items: [{ itemId: 'addr-1', values: {} }] } } }] },
      stepWithNestedRequired
    );

    // Ancestor bubbling (AC3): the TOP-level "Ava" row badges even though the
    // error is 2 levels down (children[0].addresses[0].street).
    expect(screen.getByText('Incomplete or invalid')).toBeInTheDocument();

    await user.click(screen.getByText('Ava'));
    // The nested "addresses" item row (1 level down from here) badges too.
    expect(screen.getByText('Incomplete or invalid')).toBeInTheDocument();
  });
});

/**
 * LIST2-12 — drilling into a list item (and back out) must move focus, not
 * leave a screen-reader user in silence. Uses the same swap-on-`drill`
 * `Harness` as the rest of this file, which is what actually proves AC2's
 * full-exit case: real WorkflowRunner behavior unmounts `ListDrillEditor` and
 * remounts `ListBlockRenderer` at the same JSX slot rather than updating one
 * component in place, so only a harness with both wired up (like this one)
 * can catch a focus target that silently reverts to document.body.
 */
describe('List block: drill focus management (LIST2-12)', () => {
  it('AC1: opening an existing item moves focus to a heading named for the breadcrumb', async () => {
    const user = userEvent.setup();
    renderList({ items: [{ itemId: 'a', values: { name: 'Ava', addresses: { items: [] } } }] });

    await user.click(screen.getByText('Ava'));

    const heading = await screen.findByRole('heading', { name: 'Children › Ava' });
    expect(heading).toHaveFocus();
  });

  it('AC2: leaving a nested level ("← parent") moves focus to the now-shallower heading, not document.body', async () => {
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
    const addressesPage = addressesLabel.parentElement as HTMLElement;
    await user.click(within(addressesPage).getByText('Item 1'));

    await screen.findByRole('heading', { name: 'Children › Ava › Item 1' });

    // At this depth "← parent" is labeled for the parent item ("Ava").
    await user.click(screen.getByRole('button', { name: 'Ava' }));

    const heading = await screen.findByRole('heading', { name: 'Children › Ava' });
    expect(heading).toHaveFocus();
    expect(document.body).not.toHaveFocus();
  });

  it('AC2: leaving the last level ("Done") returns focus to the item\'s own row, not document.body', async () => {
    const user = userEvent.setup();
    renderList({ items: [{ itemId: 'a', values: { name: 'Ava', addresses: { items: [] } } }] });

    await user.click(screen.getByText('Ava'));
    await screen.findByRole('heading', { name: 'Children › Ava' });

    await user.click(screen.getByRole('button', { name: 'Done' }));

    // The row's accessible name also includes its "0 addresses" nested-count
    // summary (a sibling span inside the same button), hence the prefix match.
    const row = await screen.findByRole('button', { name: /^Ava/ });
    expect(row).toHaveFocus();
    expect(document.body).not.toHaveFocus();
  });

  it('AC2: hardware/browser back at the last level also returns focus to the item\'s own row', async () => {
    const user = userEvent.setup();
    renderList({ items: [{ itemId: 'a', values: { name: 'Ava', addresses: { items: [] } } }] });

    await user.click(screen.getByText('Ava'));
    await screen.findByRole('heading', { name: 'Children › Ava' });

    window.history.back();

    const row = await screen.findByRole('button', { name: /^Ava/ });
    expect(row).toHaveFocus();
  });

  it('AC4 (regression): "+ Add" still focuses the first field, not the heading', async () => {
    const user = userEvent.setup();
    renderList({ items: [] });

    await user.click(screen.getByText('Add child'));

    const nameField = await screen.findByRole('textbox', { name: /name/i });
    expect(nameField).toHaveFocus();
    expect(screen.getByRole('heading', { name: /children/i })).not.toHaveFocus();
  });
});
