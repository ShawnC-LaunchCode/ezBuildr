// @vitest-environment jsdom
/**
 * GH-158 — the participant runner renders resolved branding, and white-label
 * removes the ezBuildr attribution from every participant surface.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClientRunnerLayout } from '../../../client/src/components/runner/ClientRunnerLayout';
import {
  DEFAULT_RESOLVED_BRANDING,
  type ResolvedBranding,
} from '../../../shared/types/branding';

const branded: ResolvedBranding = {
  logoUrl: 'https://cdn.example/acme-logo.png',
  faviconUrl: 'https://cdn.example/acme.ico',
  organizationName: 'Acme Legal',
  primaryColor: '#B22222',
  accentColor: '#DDEEFF',
  whiteLabel: false,
};

afterEach(cleanup);

describe('default branding (AC5)', () => {
  it('shows the ezBuildr mark and attribution footer', () => {
    render(<ClientRunnerLayout title="Intake">content</ClientRunnerLayout>);

    expect(screen.getByText('ezBuildr')).toBeTruthy();
    expect(screen.getByText('Securely powered by ezBuildr')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });
});

describe('custom branding (AC2)', () => {
  it('renders the customer logo instead of the ezBuildr name', () => {
    render(
      <ClientRunnerLayout title="Intake" branding={branded}>
        content
      </ClientRunnerLayout>
    );

    expect(screen.getByAltText('Acme Legal').getAttribute('src')).toBe('https://cdn.example/acme-logo.png');
    expect(screen.queryByText('ezBuildr')).toBeNull();
  });

  it('shows the organization name when there is no logo', () => {
    render(
      <ClientRunnerLayout title="Intake" branding={{ ...branded, logoUrl: null }}>
        content
      </ClientRunnerLayout>
    );

    expect(screen.getByText('Acme Legal')).toBeTruthy();
    expect(screen.queryByText('ezBuildr')).toBeNull();
  });

  it('falls back to the organization name when the logo fails to load', () => {
    render(
      <ClientRunnerLayout title="Intake" branding={branded}>
        content
      </ClientRunnerLayout>
    );

    fireEvent.error(screen.getByAltText('Acme Legal'));

    expect(screen.getByText('Acme Legal')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('applies the brand color to the CSS custom properties the design system reads', () => {
    const { container } = render(
      <ClientRunnerLayout title="Intake" branding={branded}>
        content
      </ClientRunnerLayout>
    );

    const root = container.firstElementChild as HTMLElement;
    expect(root.style.getPropertyValue('--primary')).toBe('#B22222');
    expect(root.style.getPropertyValue('--ring')).toBe('#B22222');
    // Scoped to the runner root, never :root, so a preview cannot repaint the
    // surrounding builder chrome.
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('');
  });
});

describe('white label (AC5)', () => {
  it('removes every ezBuildr reference from the participant screen', () => {
    const { container } = render(
      <ClientRunnerLayout title="Intake" branding={{ ...branded, whiteLabel: true }}>
        content
      </ClientRunnerLayout>
    );

    expect(container.textContent).not.toContain('ezBuildr');
  });

  it('keeps the attribution when white label is off', () => {
    const { container } = render(
      <ClientRunnerLayout title="Intake" branding={branded}>
        content
      </ClientRunnerLayout>
    );

    expect(container.textContent).toContain('Securely powered by ezBuildr');
  });

  it('removes the attribution even with no other branding set', () => {
    const { container } = render(
      <ClientRunnerLayout title="Intake" branding={{ ...DEFAULT_RESOLVED_BRANDING, whiteLabel: true }}>
        content
      </ClientRunnerLayout>
    );

    expect(container.textContent).not.toContain('Securely powered by ezBuildr');
  });
});

describe('favicon (AC3)', () => {
  beforeEach(() => {
    document.head.innerHTML = '<link rel="icon" href="/favicon.ico" />';
  });

  function currentFavicon(): string | null {
    return document.querySelector('link[rel~="icon"]')?.getAttribute('href') ?? null;
  }

  it('swaps the favicon for a branded run and restores it on unmount', () => {
    const { unmount } = render(
      <ClientRunnerLayout title="Intake" branding={branded}>
        content
      </ClientRunnerLayout>
    );

    expect(currentFavicon()).toBe('https://cdn.example/acme.ico');

    unmount();

    expect(currentFavicon()).toBe('/favicon.ico');
  });

  it('leaves the favicon alone when the branding has none', () => {
    render(
      <ClientRunnerLayout title="Intake" branding={{ ...branded, faviconUrl: null }}>
        content
      </ClientRunnerLayout>
    );

    expect(currentFavicon()).toBe('/favicon.ico');
  });
});
