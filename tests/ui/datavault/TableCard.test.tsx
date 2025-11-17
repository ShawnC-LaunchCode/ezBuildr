import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TableCard } from '@/components/datavault/TableCard';
import type { ApiDatavaultTableWithStats } from '@/lib/datavault-api';

/**
 * DataVault Phase 1 PR 10: TableCard Component Tests
 */
describe('TableCard Component', () => {
  const mockTable: ApiDatavaultTableWithStats = {
    id: 'table-1',
    tenantId: 'tenant-1',
    ownerUserId: 'user-1',
    name: 'Test Table',
    slug: 'test-table',
    description: 'Test table description',
    columnCount: 5,
    rowCount: 42,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
  };

  it('should render table name and description', () => {
    render(<TableCard table={mockTable} onClick={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText('Test Table')).toBeInTheDocument();
    expect(screen.getByText('Test table description')).toBeInTheDocument();
  });

  it('should render table slug', () => {
    render(<TableCard table={mockTable} onClick={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText('/test-table')).toBeInTheDocument();
  });

  it('should render column and row counts', () => {
    render(<TableCard table={mockTable} onClick={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText('5')).toBeInTheDocument(); // column count
    expect(screen.getByText('42')).toBeInTheDocument(); // row count
  });

  it('should call onClick when card is clicked', () => {
    const handleClick = vi.fn();
    render(<TableCard table={mockTable} onClick={handleClick} onDelete={vi.fn()} />);

    const card = screen.getByText('Test Table').closest('.cursor-pointer');
    if (card) fireEvent.click(card);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should call onDelete when delete button is clicked', () => {
    const handleDelete = vi.fn();
    render(<TableCard table={mockTable} onClick={vi.fn()} onDelete={handleDelete} />);

    const deleteButton = screen.getByRole('button', { name: /delete/i });
    fireEvent.click(deleteButton);

    expect(handleDelete).toHaveBeenCalledTimes(1);
  });

  it('should show placeholder when description is missing', () => {
    const tableNoDesc = { ...mockTable, description: null };
    render(<TableCard table={tableNoDesc} onClick={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText('No description')).toBeInTheDocument();
  });

  it('should format dates correctly', () => {
    render(<TableCard table={mockTable} onClick={vi.fn()} onDelete={vi.fn()} />);

    // Check that a date is displayed (exact format may vary by locale)
    const dateElement = screen.getByText(/1\/1\/2024|Jan/i);
    expect(dateElement).toBeInTheDocument();
  });
});
