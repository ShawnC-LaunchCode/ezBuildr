/**
 * @vitest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import AdminAiSettings from '@/pages/AdminAiSettings';

/**
 * The default system prompt regenerates its operation catalog from the schema on
 * every boot, so it can never go stale. A SAVED override is frozen text: every op
 * added after it was written is invisible to the model, which then simply cannot
 * produce that capability and gives no hint why. Sections were exactly this gap.
 * These cover the surface that makes the loss visible.
 */
const DEFAULT_PROMPT = 'Default prompt naming page.setSection and section.create.';

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    user: { role: 'admin' },
  }),
}));

vi.mock('@/components/layout/Header', () => ({
  default: () => <div />,
}));

vi.mock('@/components/layout/Sidebar', () => ({
  default: () => <div />,
}));

vi.mock('@/components/admin/AIPerformanceMonitor', () => ({
  AIPerformanceMonitor: () => <div />,
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
}));

function renderPage(payload: {
  settings?: { systemPrompt: string };
  defaultPrompt?: string;
  missingOps?: string[];
}): void {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, queryFn: () => Promise.resolve(payload) },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <AdminAiSettings />
    </QueryClientProvider>,
  );
}

describe('AdminAiSettings capability drift', () => {
  it('names every operation the saved prompt is missing', async () => {
    renderPage({
      settings: { systemPrompt: 'A stale prompt that predates Sections.' },
      defaultPrompt: DEFAULT_PROMPT,
      missingOps: ['page.setSection', 'section.create', 'section.delete'],
    });

    await waitFor(() => {
      expect(
        screen.getByText(/missing 3 of the assistant's capabilities/i),
      ).toBeInTheDocument();
    });

    // The operation names themselves, so an admin can paste them back in
    // rather than being told only that "something" is missing.
    expect(screen.getByText('page.setSection')).toBeInTheDocument();
    expect(screen.getByText('section.create')).toBeInTheDocument();
    expect(screen.getByText('section.delete')).toBeInTheDocument();
  });

  it('stays silent when the saved prompt covers everything', async () => {
    renderPage({
      settings: { systemPrompt: 'A current prompt.' },
      defaultPrompt: DEFAULT_PROMPT,
      missingOps: [],
    });

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue('A current prompt.');
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers a default to reset to even while an override is saved', async () => {
    // The API used to omit `defaultPrompt` whenever settings existed, leaving
    // "Reset to Default" with nothing to restore — it silently did nothing in
    // exactly the case an admin would reach for it.
    renderPage({
      settings: { systemPrompt: 'A stale prompt.' },
      defaultPrompt: DEFAULT_PROMPT,
      missingOps: ['section.create'],
    });

    // Wait for the query to settle first: the button is disabled while the
    // settings are loading, and fireEvent on a disabled button is a no-op.
    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue('A stale prompt.');
    });
    const resetButton = screen.getByRole('button', { name: /reset to default/i });
    expect(resetButton).toBeEnabled();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    try {
      fireEvent.click(resetButton);
      await waitFor(() => {
        expect(screen.getByRole('textbox')).toHaveValue(DEFAULT_PROMPT);
      });
    } finally {
      confirmSpy.mockRestore();
    }
  });
});
