/**
 * Unit Tests for ColumnTypeIcon Component
 * Tests icon rendering, color coding, and type label utilities
 */

/**
 * @vitest-environment jsdom
 */


import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, it, expect } from 'vitest';

import { ColumnTypeIcon, getColumnTypeColor, getColumnTypeLabel } from '@/components/datavault/ColumnTypeIcon';

describe('ColumnTypeIcon Component', () => {
  describe('Icon Rendering', () => {
    it('renders text icon for text type', () => {
      render(<ColumnTypeIcon type="text" />);
      const icon = screen.getByLabelText('text column type');
      expect(icon).toBeInTheDocument();
    });

    it('renders hash icon for number type', () => {
      render(<ColumnTypeIcon type="number" />);
      const icon = screen.getByLabelText('number column type');
      expect(icon).toBeInTheDocument();
    });

    it('renders hash icon for auto_number type', () => {
      render(<ColumnTypeIcon type="auto_number" />);
      const icon = screen.getByLabelText('auto_number column type');
      expect(icon).toBeInTheDocument();
    });

    it('renders toggle icon for boolean type', () => {
      render(<ColumnTypeIcon type="boolean" />);
      const icon = screen.getByLabelText('boolean column type');
      expect(icon).toBeInTheDocument();
    });

    it('renders calendar icon for date type', () => {
      render(<ColumnTypeIcon type="date" />);
      const icon = screen.getByLabelText('date column type');
      expect(icon).toBeInTheDocument();
    });

    it('renders clock icon for datetime type', () => {
      render(<ColumnTypeIcon type="datetime" />);
      const icon = screen.getByLabelText('datetime column type');
      expect(icon).toBeInTheDocument();
    });

    it('renders mail icon for email type', () => {
      render(<ColumnTypeIcon type="email" />);
      const icon = screen.getByLabelText('email column type');
      expect(icon).toBeInTheDocument();
    });

    it('renders phone icon for phone type', () => {
      render(<ColumnTypeIcon type="phone" />);
      const icon = screen.getByLabelText('phone column type');
      expect(icon).toBeInTheDocument();
    });

    it('renders link icon for url type', () => {
      render(<ColumnTypeIcon type="url" />);
      const icon = screen.getByLabelText('url column type');
      expect(icon).toBeInTheDocument();
    });

    it('renders JSON icon for json type', () => {
      render(<ColumnTypeIcon type="json" />);
      const icon = screen.getByLabelText('json column type');
      expect(icon).toBeInTheDocument();
    });

    it('renders file icon for file_upload type', () => {
      render(<ColumnTypeIcon type="file_upload" />);
      const icon = screen.getByLabelText('file_upload column type');
      expect(icon).toBeInTheDocument();
    });

    it('renders default text icon for unknown type', () => {
      render(<ColumnTypeIcon type="unknown_type" />);
      const icon = screen.getByLabelText('unknown_type column type');
      expect(icon).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(<ColumnTypeIcon type="text" className="custom-class" />);
      const icon = container.querySelector('.custom-class');
      expect(icon).toBeInTheDocument();
    });
  });

  describe('getColumnTypeColor Utility', () => {
    it('returns blue color for text types', () => {
      expect(getColumnTypeColor('text')).toBe('text-blue-600 dark:text-blue-400');
      expect(getColumnTypeColor('long_text')).toBe('text-blue-600 dark:text-blue-400');
    });

    it('returns green color for number types', () => {
      expect(getColumnTypeColor('number')).toBe('text-green-600 dark:text-green-400');
      expect(getColumnTypeColor('auto_number')).toBe('text-green-600 dark:text-green-400');
    });

    it('returns purple color for boolean types', () => {
      expect(getColumnTypeColor('boolean')).toBe('text-purple-600 dark:text-purple-400');
      expect(getColumnTypeColor('yes_no')).toBe('text-purple-600 dark:text-purple-400');
    });

    it('returns orange color for date types', () => {
      expect(getColumnTypeColor('date')).toBe('text-orange-600 dark:text-orange-400');
      expect(getColumnTypeColor('datetime')).toBe('text-orange-600 dark:text-orange-400');
    });

    it('returns pink color for email type', () => {
      expect(getColumnTypeColor('email')).toBe('text-pink-600 dark:text-pink-400');
    });

    it('returns cyan color for phone type', () => {
      expect(getColumnTypeColor('phone')).toBe('text-cyan-600 dark:text-cyan-400');
    });

    it('returns indigo color for url type', () => {
      expect(getColumnTypeColor('url')).toBe('text-indigo-600 dark:text-indigo-400');
    });

    it('returns yellow color for json type', () => {
      expect(getColumnTypeColor('json')).toBe('text-yellow-600 dark:text-yellow-400');
    });

    it('returns gray color for file_upload type', () => {
      expect(getColumnTypeColor('file_upload')).toBe('text-gray-600 dark:text-gray-400');
    });

    it('returns muted color for unknown type', () => {
      expect(getColumnTypeColor('unknown')).toBe('text-muted-foreground');
    });
  });

  describe('getColumnTypeLabel Utility', () => {
    it('returns proper labels for all column types', () => {
      expect(getColumnTypeLabel('text')).toBe('Text');
      expect(getColumnTypeLabel('long_text')).toBe('Long Text');
      expect(getColumnTypeLabel('number')).toBe('Number');
      expect(getColumnTypeLabel('auto_number')).toBe('Auto Number');
      expect(getColumnTypeLabel('boolean')).toBe('Boolean');
      expect(getColumnTypeLabel('yes_no')).toBe('Yes/No');
      expect(getColumnTypeLabel('date')).toBe('Date');
      expect(getColumnTypeLabel('datetime')).toBe('Date & Time');
      expect(getColumnTypeLabel('email')).toBe('Email');
      expect(getColumnTypeLabel('phone')).toBe('Phone');
      expect(getColumnTypeLabel('url')).toBe('URL');
      expect(getColumnTypeLabel('json')).toBe('JSON');
      expect(getColumnTypeLabel('file_upload')).toBe('File');
    });

    it('returns the type itself for unknown types', () => {
      expect(getColumnTypeLabel('unknown_type')).toBe('unknown_type');
    });
  });

  describe('Accessibility', () => {
    it('includes aria-label with column type', () => {
      render(<ColumnTypeIcon type="email" />);
      const icon = screen.getByLabelText('email column type');
      expect(icon).toHaveAttribute('aria-label', 'email column type');
    });

    it('has proper icon size class', () => {
      const { container } = render(<ColumnTypeIcon type="text" />);
      const icon = container.querySelector('.w-4.h-4');
      expect(icon).toBeInTheDocument();
    });
  });
});
