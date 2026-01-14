/**
 * Unit Tests for EditableCell Component
 * Tests inline editing, auto-save, error handling, and accessibility
 */

/**
 * @vitest-environment jsdom
 */


import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { EditableCell } from '@/components/datavault/EditableCell';

import type { DatavaultColumn } from '@shared/schema';

describe('EditableCell Component', () => {
  const mockColumn: DatavaultColumn = {
    id: 'col-1',
    tableId: 'table-1',
    name: 'Full Name',
    type: 'text',
    required: false,
    orderIndex: 0,
    isPrimaryKey: false,
    isUnique: false,
    slug: 'full_name',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any;

  const mockOnSave = vi.fn();

  beforeEach(() => {
    mockOnSave.mockClear();
  });

  describe('Display Mode', () => {
    it('renders value in display mode initially', () => {
      render(<EditableCell column={mockColumn} value="John Doe" onSave={mockOnSave} />);
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    it('shows double-click hint on hover', () => {
      render(<EditableCell column={mockColumn} value="John Doe" onSave={mockOnSave} />);
      const cell = screen.getByRole('gridcell');
      expect(cell).toHaveAttribute('title', 'Double-click to edit');
    });

    it('does not show hint for read-only cells', () => {
      render(<EditableCell column={mockColumn} value="John Doe" onSave={mockOnSave} readOnly />);
      const cell = screen.getByRole('gridcell');
      expect(cell).toHaveAttribute('title', '');
    });

    it('includes proper ARIA label with column name and value', () => {
      render(<EditableCell column={mockColumn} value="John Doe" onSave={mockOnSave} />);
      const cell = screen.getByRole('gridcell');
      expect(cell).toHaveAttribute('aria-label', 'Full Name: John Doe');
    });

    it('indicates read-only status in ARIA label', () => {
      render(<EditableCell column={mockColumn} value="John Doe" onSave={mockOnSave} readOnly />);
      const cell = screen.getByRole('gridcell');
      expect(cell).toHaveAttribute('aria-label', 'Full Name: John Doe (read-only)');
    });

    it('is focusable when editable', () => {
      render(<EditableCell column={mockColumn} value="John Doe" onSave={mockOnSave} />);
      const cell = screen.getByRole('gridcell');
      expect(cell).toHaveAttribute('tabIndex', '0');
    });

    it('is not focusable when read-only', () => {
      render(<EditableCell column={mockColumn} value="John Doe" onSave={mockOnSave} readOnly />);
      const cell = screen.getByRole('gridcell');
      expect(cell).toHaveAttribute('tabIndex', '-1');
    });
  });

  describe('Edit Mode Activation', () => {
    it('enters edit mode on double-click', async () => {
      render(<EditableCell column={mockColumn} value="John Doe" onSave={mockOnSave} />);
      const cell = screen.getByRole('gridcell');

      fireEvent.doubleClick(cell);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });
    });

    it('enters edit mode on Enter key press', async () => {
      render(<EditableCell column={mockColumn} value="John Doe" onSave={mockOnSave} />);
      const cell = screen.getByRole('gridcell');

      fireEvent.keyDown(cell, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });
    });

    it('enters edit mode on Space key press', async () => {
      render(<EditableCell column={mockColumn} value="John Doe" onSave={mockOnSave} />);
      const cell = screen.getByRole('gridcell');

      fireEvent.keyDown(cell, { key: ' ' });

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });
    });

    it('does not enter edit mode when read-only', () => {
      render(<EditableCell column={mockColumn} value="John Doe" onSave={mockOnSave} readOnly />);
      const cell = screen.getByRole('gridcell');

      fireEvent.doubleClick(cell);

      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('focuses and selects input text on edit mode entry', async () => {
      render(<EditableCell column={mockColumn} value="John Doe" onSave={mockOnSave} />);
      const cell = screen.getByRole('gridcell');

      fireEvent.doubleClick(cell);

      await waitFor(() => {
        const input = screen.getByRole('textbox');
        expect(input).toHaveFocus();
      });
    });
  });

  describe('Saving Changes', () => {
    it('saves on blur', async () => {
      mockOnSave.mockResolvedValue(undefined);
      render(<EditableCell column={mockColumn} value="John Doe" onSave={mockOnSave} />);

      fireEvent.doubleClick(screen.getByRole('gridcell'));

      const input = await screen.findByRole('textbox');
      await userEvent.clear(input);
      await userEvent.type(input, 'Jane Smith');

      fireEvent.blur(input);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith('Jane Smith');
      });
    });

    it('saves on Enter key press', async () => {
      mockOnSave.mockResolvedValue(undefined);
      render(<EditableCell column={mockColumn} value="John Doe" onSave={mockOnSave} />);

      fireEvent.doubleClick(screen.getByRole('gridcell'));

      const input = await screen.findByRole('textbox');
      await userEvent.clear(input);
      await userEvent.type(input, 'Jane Smith');
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith('Jane Smith');
      });
    });

    it('does not save if value unchanged', async () => {
      render(<EditableCell column={mockColumn} value="John Doe" onSave={mockOnSave} />);

      fireEvent.doubleClick(screen.getByRole('gridcell'));
      const input = await screen.findByRole('textbox');

      fireEvent.blur(input);

      await waitFor(() => {
        expect(mockOnSave).not.toHaveBeenCalled();
      });
    });

    it('cancels edit on Escape key press', async () => {
      render(<EditableCell column={mockColumn} value="John Doe" onSave={mockOnSave} />);

      fireEvent.doubleClick(screen.getByRole('gridcell'));

      const input = await screen.findByRole('textbox');
      await userEvent.clear(input);
      await userEvent.type(input, 'Jane Smith');
      fireEvent.keyDown(input, { key: 'Escape' });

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(mockOnSave).not.toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling', () => {
    it('reverts value on save error', async () => {
      mockOnSave.mockRejectedValue(new Error('Network error'));
      render(<EditableCell column={mockColumn} value="John Doe" onSave={mockOnSave} />);

      fireEvent.doubleClick(screen.getByRole('gridcell'));

      const input = await screen.findByRole('textbox');
      await userEvent.clear(input);
      await userEvent.type(input, 'Jane Smith');
      fireEvent.blur(input);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });
    });

    it('displays error indicator on save failure', async () => {
      mockOnSave.mockRejectedValue(new Error('Network error'));
      render(<EditableCell column={mockColumn} value="John Doe" onSave={mockOnSave} />);

      fireEvent.doubleClick(screen.getByRole('gridcell'));

      const input = await screen.findByRole('textbox');
      await userEvent.clear(input);
      await userEvent.type(input, 'Jane Smith');
      fireEvent.blur(input);

      await waitFor(() => {
        expect(screen.getByText('Error')).toBeInTheDocument();
      });
    });
  });

  describe('Boolean Type (Checkbox)', () => {
    const booleanColumn: DatavaultColumn = {
      ...mockColumn,
      type: 'boolean',
      name: 'Is Active',
    };

    it('renders checkbox for boolean type', () => {
      render(<EditableCell column={booleanColumn} value={true} onSave={mockOnSave} />);
      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });

    it('saves immediately on checkbox change', async () => {
      mockOnSave.mockResolvedValue(undefined);
      render(<EditableCell column={booleanColumn} value={false} onSave={mockOnSave} />);

      const checkbox = screen.getByRole('checkbox');
      await userEvent.click(checkbox);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith(true);
      });
    });

    it('disables checkbox when read-only', () => {
      render(<EditableCell column={booleanColumn} value={true} onSave={mockOnSave} readOnly />);
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeDisabled();
    });

    it('shows loading spinner when saving checkbox', async () => {
      let resolveSave: (value: void) => void;
      const savePromise = new Promise<void>((resolve) => {
        resolveSave = resolve;
      });
      mockOnSave.mockReturnValue(savePromise);

      render(<EditableCell column={booleanColumn} value={false} onSave={mockOnSave} />);

      const checkbox = screen.getByRole('checkbox');
      await userEvent.click(checkbox);

      await waitFor(() => {
        expect(screen.getByRole('gridcell').querySelector('.animate-spin')).toBeInTheDocument();
      });

      resolveSave!();
    });
  });

  describe('Different Input Types', () => {
    it('renders number input for number type', async () => {
      const numberColumn: DatavaultColumn = { ...mockColumn, type: 'number', name: 'Age' };
      render(<EditableCell column={numberColumn} value={25} onSave={mockOnSave} />);

      fireEvent.doubleClick(screen.getByRole('gridcell'));

      const input = await screen.findByRole('spinbutton');
      expect(input).toHaveAttribute('type', 'number');
    });

    it('renders email input for email type', async () => {
      const emailColumn: DatavaultColumn = { ...mockColumn, type: 'email', name: 'Email' };
      render(<EditableCell column={emailColumn} value="test@example.com" onSave={mockOnSave} />);

      fireEvent.doubleClick(screen.getByRole('gridcell'));

      const input = await screen.findByRole('textbox');
      expect(input).toHaveAttribute('type', 'email');
    });

    it('renders url input for url type', async () => {
      const urlColumn: DatavaultColumn = { ...mockColumn, type: 'url', name: 'Website' };
      render(<EditableCell column={urlColumn} value="https://example.com" onSave={mockOnSave} />);

      fireEvent.doubleClick(screen.getByRole('gridcell'));

      const input = await screen.findByRole('textbox');
      expect(input).toHaveAttribute('type', 'url');
    });

    it('includes placeholder text in edit mode', async () => {
      render(<EditableCell column={mockColumn} value="" onSave={mockOnSave} />);

      fireEvent.doubleClick(screen.getByRole('gridcell'));

      const input = await screen.findByRole('textbox');
      expect(input).toHaveAttribute('placeholder', 'Enter full name');
    });
  });

  describe('Value Formatting', () => {
    it('formats date values for display', () => {
      const dateColumn: DatavaultColumn = { ...mockColumn, type: 'date', name: 'Birth Date' };
      const dateValue = '2000-01-15';
      render(<EditableCell column={dateColumn} value={dateValue} onSave={mockOnSave} />);

      const cell = screen.getByRole('gridcell');
      expect(cell.textContent).toContain('1/15/2000');
    });

    it('formats boolean values as Yes/No', () => {
      const booleanColumn: DatavaultColumn = { ...mockColumn, type: 'yes_no' as any, name: 'Verified' };
      render(<EditableCell column={booleanColumn} value={true} onSave={mockOnSave} />);

      const cell = screen.getByRole('gridcell');
      expect(cell).toHaveAttribute('aria-label', 'Verified: Yes');
    });

    it('handles null values gracefully', () => {
      render(<EditableCell column={mockColumn} value={null} onSave={mockOnSave} />);
      expect(screen.getByRole('gridcell')).toBeInTheDocument();
    });
  });
});
