/**
 * @vitest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useLocation } from 'wouter'; // Import directly to manipulate mock

import type { DatavaultDatabase } from '@/lib/types/datavault';
import DatabaseSettingsPage from '@/pages/datavault/DatabaseSettingsPage';

/**
 * DataVault Phase 2 PR 13: Database Settings Page Tests
 */

// Mock wouter hooks
vi.mock('wouter', () => ({
  useParams: vi.fn(() => ({ databaseId: 'db-1' })),
  useLocation: vi.fn(() => ['/datavault/databases/db-1/settings', vi.fn()]),
  Link: ({ children, to, className }: any) => <a href={to} className={className}>{children}</a>,
}));

// Mock datavault hooks
const mockDatabase: DatavaultDatabase = {
  id: 'db-1',
  tenantId: 'tenant-1',
  name: 'Test Database',
  description: 'Test database description',
  scopeType: 'account',
  scopeId: null,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z',
  tableCount: 5,
};

// Define mock functions for hooks
const mockUseDatavaultDatabase = vi.fn();
const mockUseUpdateDatavaultDatabase = vi.fn();

vi.mock('@/lib/datavault-hooks', () => ({
  useDatavaultDatabase: (...args: any[]) => mockUseDatavaultDatabase(...args),
  useUpdateDatavaultDatabase: (...args: any[]) => mockUseUpdateDatavaultDatabase(...args),
  useDatavaultApiTokens: vi.fn(() => ({ data: [], isLoading: false })),
  useCreateApiToken: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useDeleteApiToken: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

// Mock layout components
vi.mock('@/components/layout/Header', () => ({
  default: ({ title }: { title: string }) => <div data-testid="header">{title}</div>,
}));

vi.mock('@/components/layout/Sidebar', () => ({
  default: () => <div data-testid="sidebar">Sidebar</div>,
}));

describe('DatabaseSettingsPage', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    vi.clearAllMocks();

    // Reset default mock implementations
    mockUseDatavaultDatabase.mockReturnValue({
      data: mockDatabase,
      isLoading: false,
    });

    mockUseUpdateDatavaultDatabase.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });

    // Reset wouter mock
    (useLocation as any).mockReturnValue(['/datavault/databases/db-1/settings', vi.fn()]);
  });

  const renderPage = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <DatabaseSettingsPage />
      </QueryClientProvider>
    );
  };

  it('should render database settings page with breadcrumbs', () => {
    renderPage();

    expect(screen.getAllByText('Database Settings')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Test Database').length).toBeGreaterThan(0);
  });

  it('should show loading state', () => {
    mockUseDatavaultDatabase.mockReturnValue({
      data: null,
      isLoading: true,
    });

    renderPage();

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should show not found state when database does not exist', () => {
    mockUseDatavaultDatabase.mockReturnValue({
      data: null,
      isLoading: false,
    });

    renderPage();

    expect(screen.getByText('Database not found')).toBeInTheDocument();
    expect(screen.getByText('Back to Databases')).toBeInTheDocument();
  });

  it('should render DatabaseSettings component with database data', () => {
    renderPage();

    // Check that the DatabaseSettings component is rendered
    // by checking for elements that should be in it
    expect(screen.getByText('General Settings')).toBeInTheDocument();
    expect(screen.getByText('Scope Settings')).toBeInTheDocument();
    expect(screen.getByText('Metadata')).toBeInTheDocument();
  });

  it('should navigate back when back button is clicked', () => {
    const mockSetLocation = vi.fn();
    (useLocation as any).mockReturnValue(['/datavault/databases/db-1/settings', mockSetLocation]);

    renderPage();

    const backButton = screen.getByText('Back');
    fireEvent.click(backButton);

    expect(mockSetLocation).toHaveBeenCalledWith('/datavault/databases/db-1');
  });

  it('should display database name in header', () => {
    renderPage();

    // Check for database name in the header section
    const nameElements = screen.getAllByText('Test Database');
    expect(nameElements.length).toBeGreaterThan(0);
  });

  it('should render sidebar', () => {
    renderPage();

    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  });
});
