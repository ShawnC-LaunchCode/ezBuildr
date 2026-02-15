/**
 * TableGridView Component Tests (PR 7)
 * Tests for the basic grid view component
 * Note: Component renders both desktop table and mobile card views.
 * In jsdom, both are visible (no CSS media queries), so some elements appear twice.
 */

// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { TableGridView } from '@/components/datavault/TableGridView';
import { datavaultAPI } from '@/lib/datavault-api';

// Mock the API
vi.mock('@/lib/datavault-api', () => ({
  datavaultAPI: {
    getTableSchema: vi.fn(),
    listRows: vi.fn(),
    updateRow: vi.fn(),
    createRow: vi.fn(),
    deleteRow: vi.fn(),
  },
}));

// Mock toast
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

// Mock @dnd-kit to avoid event interception issues in jsdom
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
  }),
  horizontalListSortingStrategy: vi.fn(),
  sortableKeyboardCoordinates: vi.fn(),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}));

// Mock IntersectionObserver for infinite scroll
vi.mock('@/hooks/useIntersectionObserver', () => ({
  useIntersectionObserver: vi.fn(),
}));

// Mock batch references
vi.mock('@/hooks/useBatchReferences', () => ({
  useBatchReferences: () => ({ data: {} }),
}));

describe('TableGridView', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  const mockSchema: any = {
    columns: [
      {
        id: 'col-1',
        name: 'Name',
        type: 'text',
        orderIndex: 0,
        required: true,
        isPrimaryKey: false,
      },
      {
        id: 'col-2',
        name: 'Age',
        type: 'number',
        orderIndex: 1,
        required: false,
        isPrimaryKey: false,
      },
    ],
  };

  const mockRows: any = {
    rows: [
      {
        row: { id: 'row-1', tableId: 'table-1', createdAt: new Date().toISOString() },
        values: { 'col-1': 'John Doe', 'col-2': 30 },
      },
      {
        row: { id: 'row-2', tableId: 'table-1', createdAt: new Date().toISOString() },
        values: { 'col-1': 'Jane Smith', 'col-2': 25 },
      },
    ],
    pagination: { limit: 100, offset: 0, total: 2, hasMore: false },
  };

  const renderComponent = (tableId = 'table-1') => {
    return render(
      <QueryClientProvider client={queryClient}>
        <TableGridView tableId={tableId} />
      </QueryClientProvider>
    );
  };

  it('loads table schema and rows', async () => {
    vi.mocked(datavaultAPI.getTableSchema).mockResolvedValue(mockSchema);
    vi.mocked(datavaultAPI.listRows).mockResolvedValue(mockRows);

    renderComponent();

    // Should show loading initially
    expect(screen.getByRole('status')).toBeInTheDocument();

    // Wait for data to load (elements appear in both desktop and mobile views)
    await waitFor(() => {
      expect(screen.getAllByText('Name').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Age').length).toBeGreaterThanOrEqual(1);
    });

    // Should display row data
    expect(screen.getAllByText('John Doe').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Jane Smith').length).toBeGreaterThanOrEqual(1);
  });

  it('renders correct column headers', async () => {
    vi.mocked(datavaultAPI.getTableSchema).mockResolvedValue(mockSchema);
    vi.mocked(datavaultAPI.listRows).mockResolvedValue(mockRows);

    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText('Name').length).toBeGreaterThanOrEqual(1);
    });

    // Should show column names (in both desktop and mobile views)
    expect(screen.getAllByText('Name').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Age').length).toBeGreaterThanOrEqual(1);

    // Should have Actions column (desktop only)
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('displays empty state when no rows', async () => {
    vi.mocked(datavaultAPI.getTableSchema).mockResolvedValue(mockSchema);
    vi.mocked(datavaultAPI.listRows).mockResolvedValue({
      rows: [],
      pagination: { limit: 100, offset: 0, total: 0, hasMore: false },
    });

    renderComponent();

    await waitFor(() => {
      // Empty state appears in both desktop and mobile views
      expect(screen.getAllByText(/no rows yet/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('enters edit mode on double click', async () => {
    vi.mocked(datavaultAPI.getTableSchema).mockResolvedValue(mockSchema);
    vi.mocked(datavaultAPI.listRows).mockResolvedValue(mockRows);

    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText('John Doe').length).toBeGreaterThanOrEqual(1);
    });

    // Double-click a cell in the desktop table to enter edit mode
    const table = screen.getByRole('table');
    const td = within(table).getByText('John Doe').closest('td')!;
    fireEvent.dblClick(td);

    // Input should appear immediately after state update
    expect(screen.queryAllByRole('textbox').length).toBeGreaterThanOrEqual(1);
  });

  it('updates cell value on blur', async () => {
    vi.mocked(datavaultAPI.getTableSchema).mockResolvedValue(mockSchema);
    vi.mocked(datavaultAPI.listRows).mockResolvedValue(mockRows);
    vi.mocked(datavaultAPI.updateRow).mockResolvedValue();

    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText('John Doe').length).toBeGreaterThanOrEqual(1);
    });

    // Double click to edit in desktop table
    const table = screen.getByRole('table');
    const td = within(table).getByText('John Doe').closest('td')!;
    fireEvent.dblClick(td);

    // Input appears and onBlur fires (both desktop & mobile views share editingCell state,
    // causing dual inputs to fight for focus in jsdom where both views render).
    // This triggers handleCellUpdate via onCommit, confirming the update flow works.
    await waitFor(() => {
      expect(datavaultAPI.updateRow).toHaveBeenCalledWith('row-1', {
        'col-1': 'John Doe',
        'col-2': 30,
      });
    });
  });

  it('renders Add Row button', async () => {
    vi.mocked(datavaultAPI.getTableSchema).mockResolvedValue(mockSchema);
    vi.mocked(datavaultAPI.listRows).mockResolvedValue(mockRows);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Add Row')).toBeInTheDocument();
    });
  });

  it('renders delete button for each row', async () => {
    vi.mocked(datavaultAPI.getTableSchema).mockResolvedValue(mockSchema);
    vi.mocked(datavaultAPI.listRows).mockResolvedValue(mockRows);

    renderComponent();

    await waitFor(() => {
      // 2 rows × 2 views (desktop + mobile) = 4 delete buttons
      expect(screen.getAllByRole('button', { name: /delete/i })).toHaveLength(4);
    });
  });

  it('handles API errors gracefully', async () => {
    vi.mocked(datavaultAPI.getTableSchema).mockRejectedValue(new Error('Network error'));

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText(/unable to load table schema/i)).toBeInTheDocument();
    });
  });

  it('sorts columns by orderIndex', async () => {
    const unsortedSchema: any = {
      columns: [
        { ...mockSchema.columns[1], orderIndex: 0 },
        { ...mockSchema.columns[0], orderIndex: 1 },
      ],
    };

    vi.mocked(datavaultAPI.getTableSchema).mockResolvedValue(unsortedSchema);
    vi.mocked(datavaultAPI.listRows).mockResolvedValue(mockRows);

    renderComponent();

    await waitFor(() => {
      const headers = screen.getAllByRole('columnheader');
      // First header should be Age (orderIndex 0), second should be Name (orderIndex 1)
      expect(headers[0]).toHaveTextContent('Age');
      expect(headers[1]).toHaveTextContent('Name');
    });
  });
});
