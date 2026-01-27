/**
 * SortableColumnHeader Component Tests (PR 8)
 * Tests for draggable column headers with type icons
 */
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';

import { SortableColumnHeader } from '@/components/datavault/SortableColumnHeader';
// Mock useSortable hook
vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
  SortableContext: ({ children }: any) => children,
  horizontalListSortingStrategy: {},
}));
// Mock CSS utilities
vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: (transform: any) => transform ? 'translate3d(0, 0, 0)' : undefined,
    },
  },
}));
describe('SortableColumnHeader', () => {
  const mockColumn: any = {
    id: 'col-1',
    name: 'Test Column',
    type: 'text',
    orderIndex: 0,
    required: false,
    isPrimaryKey: false,
    tableId: 'table-1',
    tenantId: 'tenant-1',
    slug: 'test_column',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  it('renders column name', () => {
    render(
      <table>
        <thead>
          <tr>
            <SortableColumnHeader column={mockColumn} />
          </tr>
        </thead>
      </table>
    );
    expect(screen.getByText('Test Column')).toBeInTheDocument();
  });
  it('shows drag handle', () => {
    render(
      <table>
        <thead>
          <tr>
            <SortableColumnHeader column={mockColumn} />
          </tr>
        </thead>
      </table>
    );
    // Check for grip icon (drag handle)
    const dragHandle = screen.getByTitle('Drag to reorder column');
    expect(dragHandle).toBeInTheDocument();
  });
  it('shows type icon for text columns', () => {
    render(
      <table>
        <thead>
          <tr>
            <SortableColumnHeader column={mockColumn} />
          </tr>
        </thead>
      </table>
    );
    // ColumnTypeIcon should be rendered
    const icon = screen.getByLabelText('text column type');
    expect(icon).toBeInTheDocument();
  });
  it('shows type icon for number columns', () => {
    const numberColumn = { ...mockColumn, type: 'number' };
    render(
      <table>
        <thead>
          <tr>
            <SortableColumnHeader column={numberColumn} />
          </tr>
        </thead>
      </table>
    );
    const icon = screen.getByLabelText('number column type');
    expect(icon).toBeInTheDocument();
  });
  it('shows type icon for boolean columns', () => {
    const booleanColumn = { ...mockColumn, type: 'boolean' };
    render(
      <table>
        <thead>
          <tr>
            <SortableColumnHeader column={booleanColumn} />
          </tr>
        </thead>
      </table>
    );
    const icon = screen.getByLabelText('boolean column type');
    expect(icon).toBeInTheDocument();
  });
  it('shows type icon for date columns', () => {
    const dateColumn = { ...mockColumn, type: 'date' };
    render(
      <table>
        <thead>
          <tr>
            <SortableColumnHeader column={dateColumn} />
          </tr>
        </thead>
      </table>
    );
    const icon = screen.getByLabelText('date column type');
    expect(icon).toBeInTheDocument();
  });
  it('shows primary key badge when column is PK', () => {
    const pkColumn = { ...mockColumn, isPrimaryKey: true };
    render(
      <table>
        <thead>
          <tr>
            <SortableColumnHeader column={pkColumn} />
          </tr>
        </thead>
      </table>
    );
    expect(screen.getByText('PK')).toBeInTheDocument();
  });
  it('shows required indicator when column is required', () => {
    const requiredColumn = { ...mockColumn, required: true };
    render(
      <table>
        <thead>
          <tr>
            <SortableColumnHeader column={requiredColumn} />
          </tr>
        </thead>
      </table>
    );
    expect(screen.getByText('*')).toBeInTheDocument();
  });
  it('shows both PK badge and required indicator', () => {
    const column = { ...mockColumn, isPrimaryKey: true, required: true };
    render(
      <table>
        <thead>
          <tr>
            <SortableColumnHeader column={column} />
          </tr>
        </thead>
      </table>
    );
    expect(screen.getByText('PK')).toBeInTheDocument();
    expect(screen.getByText('*')).toBeInTheDocument();
  });
  it('applies correct CSS classes', () => {
    const { container } = render(
      <table>
        <thead>
          <tr>
            <SortableColumnHeader column={mockColumn} />
          </tr>
        </thead>
      </table>
    );
    const th = container.querySelector('th');
    expect(th).toHaveClass('bg-muted/50', 'border-l', 'text-left');
  });
});