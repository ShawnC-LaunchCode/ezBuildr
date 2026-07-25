// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AssignInterviewDialog } from '../../../client/src/components/builder/AssignInterviewDialog';
import { fetchAPI } from '../../../client/src/lib/vault-api';

vi.mock('../../../client/src/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('../../../client/src/lib/vault-api', () => ({
  fetchAPI: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AssignInterviewDialog', () => {
  it('creates a portal assignment and reveals a private participant link', async () => {
    vi.mocked(fetchAPI).mockResolvedValue({
      data: {
        runId: '11111111-1111-4111-8111-111111111111',
        runToken: '22222222-2222-4222-8222-222222222222',
      },
    });
    const user = userEvent.setup();

    render(
      <AssignInterviewDialog
        open
        onOpenChange={vi.fn()}
        workflowId="33333333-3333-4333-8333-333333333333"
      />
    );

    await user.type(screen.getByLabelText('Participant email'), 'Client@Example.com');
    await user.click(screen.getByRole('button', { name: 'Create assignment' }));

    expect(fetchAPI).toHaveBeenCalledWith(
      '/api/workflows/33333333-3333-4333-8333-333333333333/runs',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ clientEmail: 'client@example.com' }),
      })
    );
    expect(await screen.findByLabelText('Private assignment link')).toHaveValue(
      'http://localhost:3000/run/11111111-1111-4111-8111-111111111111#token=22222222-2222-4222-8222-222222222222'
    );
  });
});
