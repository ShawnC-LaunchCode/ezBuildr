// @vitest-environment jsdom
import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BuilderTabNav,
  type BuilderTab,
} from '../../../client/src/components/builder/layout/BuilderTabNav';
import { BuilderTabPanel } from '../../../client/src/components/builder/layout/BuilderTabPanel';

const tabIds: BuilderTab[] = [
  'pages',
  'map',
  'templates',
  'data-sources',
  'review',
  'snapshots',
  'settings',
];

afterEach(() => {
  cleanup();
});

describe('BuilderTabNav accessibility and keyboard navigation', () => {
  it('renders tablist with correct accessible roles and attributes', () => {
    render(<BuilderTabNav activeTab="pages" onTabChange={vi.fn()} />);

    const tablist = screen.getByRole('tablist', { name: 'Workflow Builder Navigation' });
    expect(tablist).toBeInTheDocument();
    expect(tablist).toHaveAttribute('aria-orientation', 'horizontal');

    const pagesTab = screen.getByRole('tab', { name: 'Pages' });
    expect(pagesTab).toHaveAttribute('aria-selected', 'true');
    expect(pagesTab).toHaveAttribute('aria-controls', 'builder-tabpanel-pages');
    expect(pagesTab).toHaveAttribute('tabIndex', '0');

    const templatesTab = screen.getByRole('tab', { name: 'Templates' });
    expect(templatesTab).toHaveAttribute('aria-selected', 'false');
    expect(templatesTab).toHaveAttribute('aria-controls', 'builder-tabpanel-templates');
    expect(templatesTab).toHaveAttribute('tabIndex', '-1');
  });

  it('supports roving tabindex and arrow-key navigation', async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    render(<BuilderTabNav activeTab="pages" onTabChange={onTabChange} />);

    const pagesTab = screen.getByRole('tab', { name: 'Pages' });
    pagesTab.focus();

    // ArrowRight navigates to Map (inserted between Pages and Templates, MAP-4)
    await user.keyboard('{ArrowRight}');
    expect(onTabChange).toHaveBeenCalledWith('map');

    // ArrowLeft from Map (which is now focused) navigates back to Pages
    await user.keyboard('{ArrowLeft}');
    expect(onTabChange).toHaveBeenCalledWith('pages');

    // End navigates to the last tab (Settings)
    await user.keyboard('{End}');
    expect(onTabChange).toHaveBeenCalledWith('settings');

    // Home navigates to the first tab (Pages)
    await user.keyboard('{Home}');
    expect(onTabChange).toHaveBeenCalledWith('pages');
  });

  it('leaves vertical arrow keys available for page scrolling', () => {
    const onTabChange = vi.fn();
    render(<BuilderTabNav activeTab="pages" onTabChange={onTabChange} />);

    const pagesTab = screen.getByRole('tab', { name: 'Pages' });
    const arrowDown = createEvent.keyDown(pagesTab, { key: 'ArrowDown' });
    const arrowUp = createEvent.keyDown(pagesTab, { key: 'ArrowUp' });

    fireEvent(pagesTab, arrowDown);
    fireEvent(pagesTab, arrowUp);

    expect(arrowDown.defaultPrevented).toBe(false);
    expect(arrowUp.defaultPrevented).toBe(false);
    expect(onTabChange).not.toHaveBeenCalled();
  });

  it('removes inactive tabpanels from the flex layout', () => {
    render(
      <main>
        <BuilderTabPanel activeTab="pages" tab="pages">
          <p>Pages panel content</p>
        </BuilderTabPanel>
        <BuilderTabPanel activeTab="pages" tab="templates" />
      </main>
    );

    const activePanel = document.getElementById('builder-tabpanel-pages');
    expect(activePanel).not.toHaveAttribute('hidden');
    expect(activePanel).toHaveClass('flex', 'flex-1');

    const inactivePanel = document.getElementById('builder-tabpanel-templates');
    expect(inactivePanel).toHaveAttribute('hidden');
    expect(inactivePanel).toHaveClass('hidden');
    expect(inactivePanel).not.toHaveClass('flex', 'flex-1');
  });

  // axe-core walks the whole rendered tree and is genuinely slow — it is the
  // one thing in unit-fast that legitimately exceeds vitest's 5s default. That
  // default was survivable only while every project ran on a single worker with
  // the box to itself; under parallel workers on a shared CI runner this test
  // timed out at 5000ms with nothing wrong. Timeout raised HERE rather than on
  // the unit-fast project, so a genuine hang in an ordinary unit test still
  // fails fast.
  it('has no serious or critical axe violations with associated tabpanels', async () => {
    const { container } = render(
      <main>
        <BuilderTabNav activeTab="pages" onTabChange={vi.fn()} />
        {tabIds.map((tabId) => (
          <BuilderTabPanel key={tabId} activeTab="pages" tab={tabId}>
            {tabId === 'pages' ? <p>Pages panel content</p> : null}
          </BuilderTabPanel>
        ))}
      </main>
    );

    for (const tab of screen.getAllByRole('tab')) {
      const panelId = tab.getAttribute('aria-controls');
      expect(panelId).not.toBeNull();
      expect(document.getElementById(panelId ?? '')).toHaveAttribute('role', 'tabpanel');
    }

    const results = await axe(container, {
      rules: {
        'color-contrast': { enabled: false },
      },
    });

    const severeViolations = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical'
    );
    expect(severeViolations).toEqual([]);
  }, 30_000);
});
