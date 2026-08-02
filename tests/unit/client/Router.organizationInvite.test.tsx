// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    isLoading: false,
  }),
}));

vi.mock('@/pages/AcceptInvite', () => ({
  default: () => <div>Invitation authentication gate</div>,
}));

import Router from '../../../client/src/Router';

afterEach(cleanup);

describe('Router organization invitations', () => {
  it('keeps an invitation route reachable while signed out', async () => {
    window.history.pushState({}, '', '/invites/invite-token/accept');

    render(<Router />);

    expect(await screen.findByText('Invitation authentication gate')).toBeInTheDocument();
  });
});
