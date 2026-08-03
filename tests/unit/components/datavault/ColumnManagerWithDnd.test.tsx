// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ColumnManagerWithDnd } from '@/components/datavault/ColumnManagerWithDnd';

import type { DatavaultColumn } from '@shared/schema';

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/hooks/useDatavaultTables', () => ({
  useTables: () => ({ data: [] }),
  useTableSchema: () => ({ data: undefined }),
}));

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: ReactNode }) => <>{children}</>,
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: ReactNode }) => <>{children}</>,
  arrayMove: vi.fn(),
  sortableKeyboardCoordinates: vi.fn(),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
  verticalListSortingStrategy: vi.fn(),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}));

describe('ColumnManagerWithDnd auto-number settings', () => {
  it('loads prefix and padding and sends edited values through the update API callback', async () => {
    const onUpdateColumn = vi.fn().mockResolvedValue(undefined);
    const column = {
      id: 'column-1',
      tableId: 'table-1',
      name: 'Invoice Number',
      slug: 'invoice_number',
      type: 'auto_number',
      description: null,
      widthPx: 150,
      required: true,
      isPrimaryKey: false,
      isUnique: false,
      orderIndex: 0,
      autoNumberStart: 1,
      autonumberPrefix: 'INV-',
      autonumberPadding: 4,
      autonumberResetPolicy: 'never',
      referenceTableId: null,
      referenceDisplayColumnSlug: null,
      options: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } satisfies DatavaultColumn;

    render(
      <ColumnManagerWithDnd
        columns={[column]}
        tableId="table-1"
        onAddColumn={vi.fn()}
        onUpdateColumn={onUpdateColumn}
        onDeleteColumn={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Add Column' })).toBeEnabled();
    fireEvent.click(screen.getByTitle('Edit column'));

    const prefixInput = screen.getByLabelText('Prefix (optional)');
    const paddingInput = screen.getByLabelText('Padding');
    expect(prefixInput).toHaveValue('INV-');
    expect(paddingInput).toHaveValue(4);

    fireEvent.change(prefixInput, { target: { value: 'PO-' } });
    fireEvent.change(paddingInput, { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(onUpdateColumn).toHaveBeenCalledWith('column-1', expect.objectContaining({
        autonumberPrefix: 'PO-',
        autonumberPadding: 6,
      }));
    });
  });
});
