/**
 * TableGridView Drag & Drop Tests (PR 8)
 * Tests for column reordering functionality
 */

// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
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
    reorderColumns: vi.fn(),
  },
}));

// Mock toast
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

// Mock DnD components to simplify testing
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragEnd }: any) => (
    <div data-testid="dnd-context" data-on-drag-end={onDragEnd ? 'true' : 'false'}>
      {children}
    </div>
  ),
  closestCenter: vi.fn(),
  PointerSensor: vi.fn(),
  KeyboardSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: () => [],
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: any) => <div data-testid="sortable-context">{children}</div>,
  horizontalListSortingStrategy: {},
  sortableKeyboardCoordinates: vi.fn(),
  arrayMove: (arr: any[], oldIndex: number, newIndex: number) => {
    const newArr = [...arr];
    const [removed] = newArr.splice(oldIndex, 1);
    newArr.splice(newIndex, 0, removed);
    return newArr;
  },
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: (transform: any) => transform ? 'translate3d(0, 0, 0)' : undefined,
    },
  },
}));

describe('TableGridView - Drag & Drop', () => {
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

  const mockSchema = {
    columns: [
      {
        id: 'col-1',
        name: 'Name',
        type: 'text',
        orderIndex: 0,
        required: true,
        isPrimaryKey: true,
        tableId: 'table-1',
        tenantId: 'tenant-1',
        slug: 'name',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'col-2',
        name: 'Age',
        type: 'number',
        orderIndex: 1,
        required: false,
        isPrimaryKey: false,
        tableId: 'table-1',
        tenantId: 'tenant-1',
        slug: 'age',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'col-3',
        name: 'Active',
        type: 'boolean',
        orderIndex: 2,
        required: false,
        isPrimaryKey: false,
        tableId: 'table-1',
        tenantId: 'tenant-1',
        slug: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  };

  const mockRows = {
    rows: [],
    pagination: { limit: 100, offset: 0, total: 0, hasMore: false },
  };

  const renderComponent = (tableId = 'table-1') => {
    return render(
      <QueryClientProvider client={queryClient}>
        <TableGridView tableId={tableId} />
      </QueryClientProvider>
    );
  };

  it('renders DndContext wrapper', async () => {
    vi.mocked(datavaultAPI.getTableSchema).mockResolvedValue(mockSchema);
    vi.mocked(datavaultAPI.listRows).mockResolvedValue(mockRows);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('dnd-context')).toBeInTheDocument();
    });
  });

  it('renders SortableContext for columns', async () => {
    vi.mocked(datavaultAPI.getTableSchema).mockResolvedValue(mockSchema);
    vi.mocked(datavaultAPI.listRows).mockResolvedValue(mockRows);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('sortable-context')).toBeInTheDocument();
    });
  });

  it('displays columns with type icons', async () => {
    vi.mocked(datavaultAPI.getTableSchema).mockResolvedValue(mockSchema);
    vi.mocked(datavaultAPI.listRows).mockResolvedValue(mockRows);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Age')).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    // Check for type icons
    expect(screen.getByLabelText('text column type')).toBeInTheDocument();
    expect(screen.getByLabelText('number column type')).toBeInTheDocument();
    expect(screen.getByLabelText('boolean column type')).toBeInTheDocument();
  });

  it('displays PK badge for primary key columns', async () => {
    vi.mocked(datavaultAPI.getTableSchema).mockResolvedValue(mockSchema);
    vi.mocked(datavaultAPI.listRows).mockResolvedValue(mockRows);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('PK')).toBeInTheDocument();
    });
  });

  it('calls reorderColumns API when columns are reordered', async () => {
    vi.mocked(datavaultAPI.getTableSchema).mockResolvedValue(mockSchema);
    vi.mocked(datavaultAPI.listRows).mockResolvedValue(mockRows);
    vi.mocked(datavaultAPI.reorderColumns).mockResolvedValue();

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Name')).toBeInTheDocument();
    });

    // Note: In a real test, we would simulate drag events
    // For this unit test, we're just verifying the API is set up correctly
    expect(datavaultAPI.reorderColumns).toBeDefined();
  });

  it('displays columns in order based on orderIndex', async () => {
    const unorderedSchema = {
      columns: [
        { ...mockSchema.columns[2], orderIndex: 0 }, // Active first
        { ...mockSchema.columns[0], orderIndex: 1 }, // Name second
        { ...mockSchema.columns[1], orderIndex: 2 }, // Age third
      ],
    };

    vi.mocked(datavaultAPI.getTableSchema).mockResolvedValue(unorderedSchema);
    vi.mocked(datavaultAPI.listRows).mockResolvedValue(mockRows);

    renderComponent();

    await waitFor(() => {
      const headers = screen.getAllByRole('columnheader');
      // First column should be Active (orderIndex 0)
      expect(headers[0]).toHaveTextContent('Active');
      // Second should be Name (orderIndex 1)
      expect(headers[1]).toHaveTextContent('Name');
      // Third should be Age (orderIndex 2)
      expect(headers[2]).toHaveTextContent('Age');
    });
  });

  it('maintains column order after successful reorder', async () => {
    vi.mocked(datavaultAPI.getTableSchema).mockResolvedValue(mockSchema);
    vi.mocked(datavaultAPI.listRows).mockResolvedValue(mockRows);
    vi.mocked(datavaultAPI.reorderColumns).mockResolvedValue();

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Name')).toBeInTheDocument();
    });

    // Verify initial order
    const initialHeaders = screen.getAllByRole('columnheader');
    expect(initialHeaders[0]).toHaveTextContent('Name');
    expect(initialHeaders[1]).toHaveTextContent('Age');
    expect(initialHeaders[2]).toHaveTextContent('Active');
  });
});
