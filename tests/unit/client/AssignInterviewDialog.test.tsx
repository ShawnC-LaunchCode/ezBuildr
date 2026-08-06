// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AssignInterviewDialog } from '../../../client/src/components/builder/AssignInterviewDialog';
import { fetchAPI } from '../../../client/src/lib/vault-api';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = 'user-2';

vi.mock('@tanstack/react-query', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: vi.fn(({ queryKey }: { queryKey: string[] }) => ({
      data: queryKey[0] === 'workflow-runs'
        ? [{ id: RUN_ID, completed: false, clientEmail: 'old@example.com' }]
        : [{ id: USER_ID, email: 'staff@example.com', fullName: 'Staff Member' }],
    })),
  };
});

vi.mock('../../../client/src/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('../../../client/src/lib/vault-api', () => ({
  fetchAPI: vi.fn(),
  runAPI: { list: vi.fn() },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AssignInterviewDialog', () => {
  it('creates a run and emails a client handoff link', async () => {
    vi.mocked(fetchAPI)
      .mockResolvedValueOnce({ data: { runId: RUN_ID } })
      .mockResolvedValueOnce({ success: true });
    const user = userEvent.setup();

    render(<AssignInterviewDialog open onOpenChange={vi.fn()} workflowId="workflow-1" tenantId="tenant-1" />);

    await user.type(screen.getByLabelText('Client email'), 'Client@Example.com');
    await user.click(screen.getByRole('button', { name: 'Create assignment' }));

    expect(fetchAPI).toHaveBeenNthCalledWith(1, '/api/workflows/workflow-1/runs', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    expect(fetchAPI).toHaveBeenNthCalledWith(2, `/api/runs/${RUN_ID}/handoff`, {
      method: 'POST',
      body: JSON.stringify({ clientEmail: 'client@example.com', expiryMinutes: 1_440 }),
    });
    expect(await screen.findByRole('status')).toHaveTextContent('emailed');
  });

  it('reassigns an in-progress run to a tenant user', async () => {
    vi.mocked(fetchAPI).mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(<AssignInterviewDialog open onOpenChange={vi.fn()} workflowId="workflow-1" tenantId="tenant-1" />);

    await user.selectOptions(screen.getByLabelText('Interview'), RUN_ID);
    await user.selectOptions(screen.getByLabelText('Recipient type'), 'user');
    await user.selectOptions(screen.getByLabelText('Team member'), USER_ID);
    await user.click(screen.getByRole('button', { name: 'Send handoff' }));

    expect(fetchAPI).toHaveBeenCalledTimes(1);
    expect(fetchAPI).toHaveBeenCalledWith(`/api/runs/${RUN_ID}/handoff`, {
      method: 'POST',
      body: JSON.stringify({ assigneeUserId: USER_ID, expiryMinutes: 1_440 }),
    });
  });

  it('revokes the new assignment credential and run token together', async () => {
    vi.mocked(fetchAPI)
      .mockResolvedValueOnce({ data: { runId: RUN_ID } })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true });
    const user = userEvent.setup();

    render(<AssignInterviewDialog open onOpenChange={vi.fn()} workflowId="workflow-1" tenantId="tenant-1" />);
    await user.type(screen.getByLabelText('Client email'), 'client@example.com');
    await user.click(screen.getByRole('button', { name: 'Create assignment' }));
    await user.click(await screen.findByRole('button', { name: 'Revoke assignment access' }));

    expect(fetchAPI).toHaveBeenLastCalledWith(`/api/runs/${RUN_ID}/revoke-token`, { method: 'POST' });
    expect(await screen.findByRole('status')).toHaveTextContent('revoked');
  });
});
