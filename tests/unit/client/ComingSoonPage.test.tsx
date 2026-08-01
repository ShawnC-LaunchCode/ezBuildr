// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import ComingSoonPage from '../../../client/src/pages/auth/ComingSoonPage';

afterEach(cleanup);

describe('ComingSoonPage', () => {
  it('invites visitors to contact support while preserving sign in', () => {
    render(<ComingSoonPage />);

    expect(screen.getByRole('heading', {
      name: /we can't wait to build.*what's next with you/i,
    })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /contact support@ezbuildr.com/i }))
      .toHaveAttribute('href', 'mailto:support@ezBuildr.com?subject=Interested%20in%20ezBuildr');
    expect(screen.getByRole('link', { name: /existing user\? sign in/i }))
      .toHaveAttribute('href', '/auth/login');
  });
});
