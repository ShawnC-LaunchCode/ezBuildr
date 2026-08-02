/**
 * @vitest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DatabaseSettings } from '@/components/datavault/DatabaseSettings';
import type { DatavaultDatabase } from '@/lib/datavault-api';

const mockApiTokens = vi.fn(({ databaseId }: { databaseId: string }) => (
  <section data-testid="database-api-tokens">API tokens for {databaseId}</section>
));

vi.mock('@/components/datavault/DatabaseApiTokens', () => ({
  DatabaseApiTokens: (props: { databaseId: string }) => mockApiTokens(props),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/lib/datavault-hooks', () => ({
  useUpdateDatavaultDatabase: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
}));

const database: DatavaultDatabase = {
  id: 'database-1',
  tenantId: 'tenant-1',
  name: 'Customer records',
  description: 'Customer database',
  scopeType: 'account',
  scopeId: null,
  createdAt: '2026-08-01T12:00:00.000Z',
  updatedAt: '2026-08-01T12:00:00.000Z',
  tableCount: 2,
};

describe('DatabaseSettings API token feature flag', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_ENABLE_DATAVAULT_API_TOKENS', '');
    mockApiTokens.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('hides the complete token-management surface by default', () => {
    render(<DatabaseSettings database={database} />);

    expect(screen.queryByTestId('database-api-tokens')).not.toBeInTheDocument();
    expect(mockApiTokens).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
  });

  it('renders the unchanged token-management surface when enabled', () => {
    vi.stubEnv('VITE_ENABLE_DATAVAULT_API_TOKENS', 'true');

    render(<DatabaseSettings database={database} />);

    expect(screen.getByTestId('database-api-tokens')).toHaveTextContent(
      'API tokens for database-1',
    );
    expect(mockApiTokens).toHaveBeenCalledWith({ databaseId: database.id });
  });
});
