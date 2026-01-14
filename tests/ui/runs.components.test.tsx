/**
 * @vitest-environment jsdom
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';

import { RunFilters } from '@/components/runs/RunFilters';
import { RunsTable } from '@/components/runs/RunsTable';
import { TracePanel } from '@/components/runs/TracePanel';
import type { DocumentRun, TraceEntry, ListRunsParams } from '@/lib/vault-api';

/**
 * Stage 8: UI Component Tests
 * Tests for runs table, filters, and trace panel
 */
describe('Stage 8: Runs UI Components', () => {
  describe('RunsTable', () => {
    // ... (keep existing mockRuns)
    const mockRuns: DocumentRun[] = [
      {
        id: 'run-1',
        workflowVersionId: 'version-1',
        status: 'success',
        durationMs: 1500,
        createdBy: 'user-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        inputJson: { name: 'Alice' },
        outputRefs: { document: { fileRef: 'output.docx' } },
        workflowVersion: {
          id: 'version-1',
          name: 'v1.0',
          workflow: {
            id: 'workflow-1',
            name: 'Test Workflow',
            projectId: 'project-1',
          },
        },
        createdByUser: {
          id: 'user-1',
          email: 'test@example.com',
        },
      },
      {
        id: 'run-2',
        workflowVersionId: 'version-1',
        status: 'error',
        durationMs: 500,
        createdBy: 'user-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        inputJson: { name: 'Bob' },
        error: 'Test error message',
        workflowVersion: {
          id: 'version-1',
          name: 'v1.1',
          workflow: {
            id: 'workflow-1',
            name: 'Error Workflow',
            projectId: 'project-1',
          },
        },
        createdByUser: {
          id: 'user-1',
          email: 'test@example.com',
        },
      },
    ];

    it('should render runs table with correct columns', () => {
      render(<RunsTable runs={mockRuns} />);

      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Workflow')).toBeInTheDocument();
      expect(screen.getByText('Version')).toBeInTheDocument();
      expect(screen.getByText('Started')).toBeInTheDocument();
      expect(screen.getByText('Duration')).toBeInTheDocument();
      expect(screen.getByText('Created By')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();
    });

    it('should render run data correctly', () => {
      render(<RunsTable runs={mockRuns} />);

      expect(screen.getByText('Test Workflow')).toBeInTheDocument();
      expect(screen.getByText('v1.0')).toBeInTheDocument();
      expect(screen.getAllByText('test@example.com')[0]).toBeInTheDocument();
    });

    it('should show success badge for successful runs', () => {
      render(<RunsTable runs={mockRuns} />);

      const successBadge = screen.getByText('Success');
      expect(successBadge).toBeInTheDocument();
      expect(successBadge).toHaveClass('bg-green-500');
    });

    it('should show error badge for failed runs', () => {
      render(<RunsTable runs={mockRuns} />);

      const errorBadge = screen.getByText('Error');
      expect(errorBadge).toBeInTheDocument();
    });

    it('should format duration correctly', () => {
      render(<RunsTable runs={mockRuns} />);

      expect(screen.getByText('1.5s')).toBeInTheDocument();
      expect(screen.getByText('500ms')).toBeInTheDocument();
    });

    it('should show download options for successful runs', async () => {
      const user = userEvent.setup();
      render(<RunsTable runs={mockRuns} />);

      const successRunActions = screen.getAllByRole('button')[0];
      await user.click(successRunActions);

      await waitFor(() => {
        expect(screen.getByText('Download DOCX')).toBeInTheDocument();
        expect(screen.getByText('Download PDF')).toBeInTheDocument();
      });
    });
  });

  describe('RunFilters', () => {
    const mockOnChange = vi.fn();
    const initialFilters: ListRunsParams = {
      limit: 20,
    };

    it('should render all filter controls', () => {
      render(<RunFilters filters={initialFilters} onChange={mockOnChange} />);

      expect(screen.getByLabelText('Status')).toBeInTheDocument();
      expect(screen.getByLabelText('From')).toBeInTheDocument();
      expect(screen.getByLabelText('To')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Search by run ID/)).toBeInTheDocument();
    });

    it('should call onChange when status filter changes', async () => {
      render(<RunFilters filters={initialFilters} onChange={mockOnChange} />);

      const statusSelect = screen.getByLabelText('Status');
      fireEvent.click(statusSelect);

      await waitFor(() => {
        const successOption = screen.getByRole('option', { name: 'Success' });
        fireEvent.click(successOption);
      });

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          cursor: undefined, // Reset pagination
        })
      );
    });

    it('should call onChange when search is submitted', () => {
      render(<RunFilters filters={initialFilters} onChange={mockOnChange} />);

      const searchInput = screen.getByPlaceholderText(/Search by run ID/);
      fireEvent.change(searchInput, { target: { value: 'Alice' } });

      const searchButton = screen.getByRole('button', { name: /Search/i });
      fireEvent.click(searchButton);

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          q: 'Alice',
          cursor: undefined,
        })
      );
    });

    it('should show clear filters button when filters are active', () => {
      const activeFilters: ListRunsParams = {
        limit: 20,
        status: 'success',
        q: 'test',
      };

      render(<RunFilters filters={activeFilters} onChange={mockOnChange} />);

      expect(screen.getByText('Clear Filters')).toBeInTheDocument();
    });

    it('should clear all filters when clear button is clicked', () => {
      const activeFilters: ListRunsParams = {
        limit: 20,
        status: 'success',
        from: new Date().toISOString(),
        q: 'test',
      };

      render(<RunFilters filters={activeFilters} onChange={mockOnChange} />);

      const clearButton = screen.getByText('Clear Filters');
      fireEvent.click(clearButton);

      expect(mockOnChange).toHaveBeenCalledWith({ limit: 20 });
    });
  });

  describe('TracePanel', () => {
    const mockTrace: TraceEntry[] = [
      {
        nodeId: 'node-1',
        type: 'input',
        status: 'executed',
        timestamp: new Date().toISOString(),
        outputsDelta: { name: 'Alice' },
      },
      {
        nodeId: 'node-2',
        type: 'transform',
        status: 'executed',
        condition: 'age > 18',
        conditionResult: true,
        timestamp: new Date().toISOString(),
        outputsDelta: { isAdult: true },
      },
      {
        nodeId: 'node-3',
        type: 'optional',
        status: 'skipped',
        condition: 'premium === true',
        conditionResult: false,
        timestamp: new Date().toISOString(),
      },
      {
        nodeId: 'node-4',
        type: 'output',
        status: 'executed',
        error: 'Failed to generate document',
        timestamp: new Date().toISOString(),
      },
    ];

    it('should render all trace entries', () => {
      render(<TracePanel trace={mockTrace} />);

      expect(screen.getByText('node-1')).toBeInTheDocument();
      expect(screen.getByText('node-2')).toBeInTheDocument();
      expect(screen.getByText('node-3')).toBeInTheDocument();
      expect(screen.getByText('node-4')).toBeInTheDocument();
    });

    it('should show executed badge for executed nodes', () => {
      render(<TracePanel trace={mockTrace} />);

      const executedBadges = screen.getAllByText('Executed');
      expect(executedBadges.length).toBeGreaterThan(0);
    });

    it('should show skipped badge for skipped nodes', () => {
      render(<TracePanel trace={mockTrace} />);

      expect(screen.getByText('Skipped')).toBeInTheDocument();
    });

    it('should display conditions and their results', () => {
      render(<TracePanel trace={mockTrace} />);

      expect(screen.getByText('age > 18')).toBeInTheDocument();
      expect(screen.getByText('premium === true')).toBeInTheDocument();

      expect(screen.getByText('Condition: true')).toBeInTheDocument();
      expect(screen.getByText('Condition: false')).toBeInTheDocument();
    });

    it('should display error messages', () => {
      render(<TracePanel trace={mockTrace} />);

      expect(screen.getByText('Failed to generate document')).toBeInTheDocument();
    });

    it('should toggle show skipped nodes', () => {
      render(<TracePanel trace={mockTrace} />);

      const showSkippedSwitch = screen.getByLabelText('Show skipped nodes');
      expect(showSkippedSwitch).toBeChecked();

      // Initially shows 4 nodes
      expect(screen.getByText('4 of 4 nodes')).toBeInTheDocument();

      // Toggle off
      fireEvent.click(showSkippedSwitch);

      // Should now show only 3 executed nodes
      expect(screen.getByText('3 of 4 nodes')).toBeInTheDocument();
    });

    it('should expand outputs delta when clicked', () => {
      render(<TracePanel trace={mockTrace} />);

      const showOutputsButton = screen.getAllByText(/Show.*Outputs/)[0];
      fireEvent.click(showOutputsButton);

      // Should show JSON viewer with outputs
      expect(screen.getByText(/name/)).toBeInTheDocument();
      expect(screen.getByText(/Alice/)).toBeInTheDocument();
    });

    it('should copy trace as JSON', async () => {
      // Mock clipboard API
      const mockWriteText = vi.fn();
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: mockWriteText,
        },
        writable: true,
      });

      render(<TracePanel trace={mockTrace} />);

      const copyButton = screen.getByText('Copy Trace JSON');
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(mockWriteText).toHaveBeenCalledWith(
          JSON.stringify(mockTrace, null, 2)
        );
      });
    });
  });
});
