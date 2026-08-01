// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SaveAndResumeButton } from '../../../client/src/components/runner/SaveAndResumeButton';

vi.mock('../../../client/src/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

afterEach(() => {
  cleanup();
});

describe('SaveAndResumeButton', () => {
  it('flushes the draft before revealing the private resume link', async () => {
    const user = userEvent.setup();
    const saveNow = vi.fn().mockResolvedValue(undefined);

    render(
      <SaveAndResumeButton
        runId="11111111-1111-4111-8111-111111111111"
        runToken="22222222-2222-4222-8222-222222222222"
        saveNow={saveNow}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Save and finish later' }));

    expect(saveNow).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('dialog')).toHaveTextContent('Your progress is saved');
    expect(screen.getByLabelText('Private resume link')).toHaveValue(
      'http://localhost:3000/run/11111111-1111-4111-8111-111111111111#token=22222222-2222-4222-8222-222222222222'
    );
  });

  it('does not reveal a resume link when saving fails', async () => {
    const user = userEvent.setup();
    const saveNow = vi.fn().mockRejectedValue(new Error('offline'));

    render(
      <SaveAndResumeButton
        runId="11111111-1111-4111-8111-111111111111"
        runToken="22222222-2222-4222-8222-222222222222"
        saveNow={saveNow}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Save and finish later' }));

    expect(saveNow).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
