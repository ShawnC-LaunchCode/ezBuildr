/**
 * CellRenderer Component Tests (PR 7)
 * Tests for cell rendering based on column types
 */

// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';

import { CellRenderer } from '@/components/datavault/CellRenderer';

describe('CellRenderer', () => {
  const mockRow: any = {
    row: { id: 'row-1', tableId: 'table-1', createdAt: new Date().toISOString() },
    values: {},
  };

  const mockColumn: any = {
    id: 'col-1',
    name: 'Test Column',
    type: 'text',
    orderIndex: 0,
    required: false,
    isPrimaryKey: false,
  };

  const mockOnCommit = vi.fn();
  const mockOnCancel = vi.fn();

  it('renders text value in display mode', () => {
    const row = { ...mockRow, values: { 'col-1': 'Hello World' } };

    render(
      <CellRenderer
        row={row}
        column={mockColumn}
        editing={false}
        onCommit={mockOnCommit}
      />
    );

    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });

  it('renders number value correctly', () => {
    const row = { ...mockRow, values: { 'col-1': 42 } };
    const column = { ...mockColumn, type: 'number' };

    render(
      <CellRenderer
        row={row}
        column={column}
        editing={false}
        onCommit={mockOnCommit}
      />
    );

    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders boolean value as Yes/No', () => {
    const row = { ...mockRow, values: { 'col-1': true } };
    const column = { ...mockColumn, type: 'boolean' };

    render(
      <CellRenderer
        row={row}
        column={column}
        editing={false}
        onCommit={mockOnCommit}
      />
    );

    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('renders date value formatted', () => {
    // Use UTC to avoid timezone issues
    const date = new Date('2024-01-15T00:00:00.000Z');
    const row = { ...mockRow, values: { 'col-1': date.toISOString() } };
    const column = { ...mockColumn, type: 'date' };

    render(
      <CellRenderer
        row={row}
        column={column}
        editing={false}
        onCommit={mockOnCommit}
      />
    );

    // Should show formatted date (accept various date formats)
    const dateElement = screen.getByText(/1\/1[45]\/2024|15\/1\/2024/);
    expect(dateElement).toBeInTheDocument();
  });

  it('shows text input in edit mode for text columns', () => {
    const row = { ...mockRow, values: { 'col-1': 'Hello' } };

    render(
      <CellRenderer
        row={row}
        column={mockColumn}
        editing={true}
        onCommit={mockOnCommit}
      />
    );

    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue('Hello');
  });

  it('shows number input in edit mode for number columns', () => {
    const row = { ...mockRow, values: { 'col-1': 42 } };
    const column = { ...mockColumn, type: 'number' };

    render(
      <CellRenderer
        row={row}
        column={column}
        editing={true}
        onCommit={mockOnCommit}
      />
    );

    const input = screen.getByRole('spinbutton');
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue(42);
  });

  it('shows checkbox in edit mode for boolean columns', () => {
    const row = { ...mockRow, values: { 'col-1': true } };
    const column = { ...mockColumn, type: 'boolean' };

    render(
      <CellRenderer
        row={row}
        column={column}
        editing={true}
        onCommit={mockOnCommit}
      />
    );

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).toBeChecked();
  });

  it('calls onCommit when Enter is pressed', async () => {
    const row = { ...mockRow, values: { 'col-1': 'Hello' } };
    const user = userEvent.setup();

    render(
      <CellRenderer
        row={row}
        column={mockColumn}
        editing={true}
        onCommit={mockOnCommit}
      />
    );

    const input = screen.getByRole('textbox');
    await user.type(input, '{Enter}');

    expect(mockOnCommit).toHaveBeenCalled();
  });

  it('calls onCancel when Escape is pressed', async () => {
    const row = { ...mockRow, values: { 'col-1': 'Hello' } };
    const user = userEvent.setup();

    render(
      <CellRenderer
        row={row}
        column={mockColumn}
        editing={true}
        onCommit={mockOnCommit}
        onCancel={mockOnCancel}
      />
    );

    const input = screen.getByRole('textbox');
    await user.type(input, '{Escape}');

    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('handles empty values', () => {
    const row = { ...mockRow, values: {} };

    const { container } = render(
      <CellRenderer
        row={row}
        column={mockColumn}
        editing={false}
        onCommit={mockOnCommit}
      />
    );

    // Should render empty span with empty title
    const span = container.querySelector('span[title=""]');
    expect(span).toBeInTheDocument();
    expect(span).toHaveTextContent('');
  });

  it('handles null values', () => {
    const row = { ...mockRow, values: { 'col-1': null } };

    const { container } = render(
      <CellRenderer
        row={row}
        column={mockColumn}
        editing={false}
        onCommit={mockOnCommit}
      />
    );

    // Should render empty span with empty title
    const span = container.querySelector('span[title=""]');
    expect(span).toBeInTheDocument();
    expect(span).toHaveTextContent('');
  });

  it('shows "Unsupported type" for unknown column types', () => {
    const row = { ...mockRow, values: { 'col-1': 'value' } };
    const column = { ...mockColumn, type: 'unknown_type' };

    render(
      <CellRenderer
        row={row}
        column={column}
        editing={true}
        onCommit={mockOnCommit}
      />
    );

    expect(screen.getByText(/unsupported type/i)).toBeInTheDocument();
  });
});
