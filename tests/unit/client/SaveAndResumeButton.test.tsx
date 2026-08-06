// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SaveAndResumeButton } from '../../../client/src/components/runner/SaveAndResumeButton';
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

describe('SaveAndResumeButton', () => {
  it('flushes the draft and sends a configurable expiring link to the respondent email', async () => {
    vi.mocked(fetchAPI).mockResolvedValue({ data: { expiresAt: '2026-08-07T12:00:00.000Z' } });
    const user = userEvent.setup();
    const saveNow = vi.fn().mockResolvedValue(undefined);

    render(<SaveAndResumeButton runId="11111111-1111-4111-8111-111111111111" saveNow={saveNow} />);

    await user.click(screen.getByRole('button', { name: 'Save and finish later' }));
    await user.type(await screen.findByLabelText('Email address'), 'Client@Example.com');
    await user.selectOptions(screen.getByLabelText('Link expires in'), '60');
    await user.click(screen.getByRole('button', { name: 'Send resume link' }));

    expect(saveNow).toHaveBeenCalledTimes(1);
    expect(fetchAPI).toHaveBeenCalledWith(
      '/api/runs/11111111-1111-4111-8111-111111111111/resume-links',
      {
        method: 'POST',
        body: JSON.stringify({ email: 'client@example.com', expiryMinutes: 60 }),
      },
    );
    expect(await screen.findByRole('status')).toHaveTextContent('expires');
    expect(screen.queryByText(/token=/)).not.toBeInTheDocument();
  });

  it('does not request a resume email when saving fails', async () => {
    const user = userEvent.setup();
    const saveNow = vi.fn().mockRejectedValue(new Error('offline'));

    render(<SaveAndResumeButton runId="11111111-1111-4111-8111-111111111111" saveNow={saveNow} />);

    await user.click(screen.getByRole('button', { name: 'Save and finish later' }));

    expect(saveNow).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fetchAPI).not.toHaveBeenCalled();
  });
});
