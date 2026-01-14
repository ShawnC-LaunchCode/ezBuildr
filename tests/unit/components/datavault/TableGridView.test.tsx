/**
 * TableGridView Component Tests (PR 7)
 * Tests for the basic grid view component
 */

// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
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

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Age')).toBeInTheDocument();
    });

    // Should display row data
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });

  it('renders correct column headers', async () => {
    vi.mocked(datavaultAPI.getTableSchema).mockResolvedValue(mockSchema);
    vi.mocked(datavaultAPI.listRows).mockResolvedValue(mockRows);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Name')).toBeInTheDocument();
    });

    // Should show column names
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Age')).toBeInTheDocument();

    // Should have Actions column
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
      expect(screen.getByText(/no rows yet/i)).toBeInTheDocument();
    });
  });

  it('enters edit mode on double click', async () => {
    vi.mocked(datavaultAPI.getTableSchema).mockResolvedValue(mockSchema);
    vi.mocked(datavaultAPI.listRows).mockResolvedValue(mockRows);

    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Double click on a cell
    const cell = screen.getByText('John Doe').closest('td');
    if (cell) {
      await user.dblClick(cell);
    }

    // Should show input field
    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });
  });

  it('updates cell value on blur', async () => {
    vi.mocked(datavaultAPI.getTableSchema).mockResolvedValue(mockSchema);
    vi.mocked(datavaultAPI.listRows).mockResolvedValue(mockRows);
    vi.mocked(datavaultAPI.updateRow).mockResolvedValue();

    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Double click to edit
    const cell = screen.getByText('John Doe').closest('td');
    if (cell) {
      await user.dblClick(cell);
    }

    // Type new value
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'John Smith');

    // Blur to save
    await user.tab();

    await waitFor(() => {
      expect(datavaultAPI.updateRow).toHaveBeenCalledWith('row-1', {
        'col-1': 'John Smith',
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
      expect(screen.getAllByRole('button', { name: /delete/i })).toHaveLength(2);
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
