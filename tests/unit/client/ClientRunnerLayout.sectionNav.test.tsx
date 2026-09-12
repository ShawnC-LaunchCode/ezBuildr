// @vitest-environment jsdom
/**
 * SECT-8B — the runner's two-column shell.
 *
 * Covers the persistent rail at `md` and above (AC1), the unchanged content
 * measure (AC2), the sub-`md` collapse into a sheet (AC3) and the rail sitting
 * inside the branded surface (AC7).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ClientRunnerLayout } from '../../../client/src/components/runner/ClientRunnerLayout';
import type { RunnerNavData } from '../../../client/src/components/runner/RunnerSectionNav';
import { type ResolvedBranding } from '../../../shared/types/branding';

const nav: RunnerNavData = {
  sections: [{ id: 'sec-assets', title: 'Assets' }],
  visiblePages: [
    { id: 'p-real-property', title: 'Real Property', sectionId: 'sec-assets' },
    { id: 'p-bank', title: 'Bank Accounts', sectionId: 'sec-assets' },
  ],
  visitedPageIds: ['p-real-property'],
  currentPageId: 'p-real-property',
};

const branded: ResolvedBranding = {
  logoUrl: null,
  faviconUrl: null,
  organizationName: 'Acme Legal',
  primaryColor: '#B22222',
  accentColor: '#DDEEFF',
  whiteLabel: false,
};

afterEach(cleanup);

describe('two-column shell (AC1, AC2)', () => {
  it('renders the rail in an aside that only appears from md upward', () => {
    const { container } = render(
      <ClientRunnerLayout title="Intake" nav={nav}>
        content
      </ClientRunnerLayout>
    );

    const aside = container.querySelector('aside');
    expect(aside).not.toBeNull();
    expect(aside?.className).toContain('hidden');
    expect(aside?.className).toContain('md:block');
    expect(aside?.querySelector('nav[aria-label="Interview contents"]')).not.toBeNull();
  });

  it('keeps the content column on the max-w-2xl measure', () => {
    const { container } = render(
      <ClientRunnerLayout title="Intake" nav={nav}>
        content
      </ClientRunnerLayout>
    );

    const main = container.querySelector('main');
    expect(main?.className).toContain('max-w-2xl');
    expect(main?.className).toContain('p-4');
    expect(main?.className).toContain('md:p-8');
  });

  it('omits the rail entirely when there is nothing to navigate', () => {
    const { container } = render(
      <ClientRunnerLayout title="Intake" nav={{ ...nav, visiblePages: [] }}>
        content
      </ClientRunnerLayout>
    );

    expect(container.querySelector('aside')).toBeNull();
    expect(screen.queryByLabelText('Open interview contents')).toBeNull();
  });

  it('omits the rail on screens that pass no nav at all', () => {
    const { container } = render(<ClientRunnerLayout title="Intake">content</ClientRunnerLayout>);

    expect(container.querySelector('aside')).toBeNull();
    expect(container.querySelector('nav')).toBeNull();
  });
});

describe('mobile collapse (AC3)', () => {
  it('hides the trigger from md upward and opens the rail in a sheet', () => {
    render(
      <ClientRunnerLayout title="Intake" nav={nav}>
        content
      </ClientRunnerLayout>
    );

    const trigger = screen.getByLabelText('Open interview contents');
    expect(trigger.className).toContain('md:hidden');
    // Assert the trigger's own state, not the panel's DOM: with the browser
    // pane hidden, CSS animations never run and a Radix sheet can sit at
    // data-state="closed" while genuinely open.
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    // The rail's page titles exist exactly once while the sheet is closed.
    expect(screen.getAllByText('Real Property')).toHaveLength(1);

    fireEvent.click(trigger);

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('nav[aria-label="Interview contents"]')).not.toBeNull();
  });
});

describe('branding (AC7)', () => {
  it('renders the rail inside the element carrying the brand custom properties', () => {
    const { container } = render(
      <ClientRunnerLayout title="Intake" nav={nav} branding={branded}>
        content
      </ClientRunnerLayout>
    );

    const root = container.firstElementChild as HTMLElement;
    expect(root.style.getPropertyValue('--primary')).toBe('#B22222');
    expect(root.contains(screen.getByRole('navigation', { name: 'Interview contents' }))).toBe(true);
  });

  it('keeps the rail while white label removes every ezBuildr reference', () => {
    const { container } = render(
      <ClientRunnerLayout title="Intake" nav={nav} branding={{ ...branded, whiteLabel: true }}>
        content
      </ClientRunnerLayout>
    );

    expect(container.textContent).not.toContain('ezBuildr');
    expect(screen.getByRole('navigation', { name: 'Interview contents' })).toBeTruthy();
    expect(screen.getByText('Real Property')).toBeTruthy();
  });
});
