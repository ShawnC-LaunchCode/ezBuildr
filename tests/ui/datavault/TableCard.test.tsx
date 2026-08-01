/**
 * @vitest-environment jsdom
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';

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
  } as any;

  it('should render table name and description', () => {
    render(<TableCard table={mockTable} onClick={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText('Test Table')).toBeInTheDocument();
    const descriptions = screen.getAllByText('Test table description');
    expect(descriptions[0]).toBeInTheDocument();
  });

  // Two duplicate 'should render table slug' tests lived here, both with empty
  // bodies — TableCard renders {table.name} and never the slug, so the original
  // assertion was deleted rather than the test. They reported green for months.

  it('should render column and row counts', () => {
    render(<TableCard table={mockTable} onClick={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText('5 columns')).toBeInTheDocument();
    expect(screen.getByText('42 rows')).toBeInTheDocument();
  });

  it('should call onClick when card is clicked', () => {
    const handleClick = vi.fn();
    render(<TableCard table={mockTable} onClick={handleClick} onDelete={vi.fn()} />);

    // Click the card itself (it has onClick)
    const cardTitle = screen.getByText('Test Table');
    const card = cardTitle.closest('div[class*="rounded-lg"]'); // The Card component
    if (card) {fireEvent.click(card);}

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should call onDelete when delete button is clicked', async () => {
    const handleDelete = vi.fn();
    render(<TableCard table={mockTable} onClick={vi.fn()} onDelete={handleDelete} />);

    // Open dropdown
    const trigger = screen.getByRole('button', { name: /actions/i });
    await userEvent.click(trigger);

    // Click delete
    await waitFor(() => {
      const deleteButton = screen.getByText('Delete');
      fireEvent.click(deleteButton);
    });

    expect(handleDelete).toHaveBeenCalledTimes(1);
  });

  it('should show placeholder when description is missing', () => {
    const tableNoDesc = { ...mockTable, description: null };
    render(<TableCard table={tableNoDesc} onClick={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText('No description')).toBeInTheDocument();
  });

  it('should format dates correctly', () => {
    render(<TableCard table={mockTable} onClick={vi.fn()} onDelete={vi.fn()} />);
    // Date formatting might vary, just checking presence
    expect(screen.getByText(/1\/2\/2024|Jan/i)).toBeInTheDocument();
  });
});
