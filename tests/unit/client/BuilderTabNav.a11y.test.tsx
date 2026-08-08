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
  'sections',
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
    render(<BuilderTabNav activeTab="sections" onTabChange={vi.fn()} />);

    const tablist = screen.getByRole('tablist', { name: 'Workflow Builder Navigation' });
    expect(tablist).toBeInTheDocument();
    expect(tablist).toHaveAttribute('aria-orientation', 'horizontal');

    const sectionsTab = screen.getByRole('tab', { name: 'Sections' });
    expect(sectionsTab).toHaveAttribute('aria-selected', 'true');
    expect(sectionsTab).toHaveAttribute('aria-controls', 'builder-tabpanel-sections');
    expect(sectionsTab).toHaveAttribute('tabIndex', '0');

    const templatesTab = screen.getByRole('tab', { name: 'Templates' });
    expect(templatesTab).toHaveAttribute('aria-selected', 'false');
    expect(templatesTab).toHaveAttribute('aria-controls', 'builder-tabpanel-templates');
    expect(templatesTab).toHaveAttribute('tabIndex', '-1');
  });

  it('supports roving tabindex and arrow-key navigation', async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    render(<BuilderTabNav activeTab="sections" onTabChange={onTabChange} />);

    const sectionsTab = screen.getByRole('tab', { name: 'Sections' });
    sectionsTab.focus();

    // ArrowRight navigates to Map (inserted between Sections and Templates, MAP-4)
    await user.keyboard('{ArrowRight}');
    expect(onTabChange).toHaveBeenCalledWith('map');

    // ArrowLeft from Map (which is now focused) navigates back to Sections
    await user.keyboard('{ArrowLeft}');
    expect(onTabChange).toHaveBeenCalledWith('sections');

    // End navigates to the last tab (Settings)
    await user.keyboard('{End}');
    expect(onTabChange).toHaveBeenCalledWith('settings');

    // Home navigates to the first tab (Sections)
    await user.keyboard('{Home}');
    expect(onTabChange).toHaveBeenCalledWith('sections');
  });

  it('leaves vertical arrow keys available for page scrolling', () => {
    const onTabChange = vi.fn();
    render(<BuilderTabNav activeTab="sections" onTabChange={onTabChange} />);

    const sectionsTab = screen.getByRole('tab', { name: 'Sections' });
    const arrowDown = createEvent.keyDown(sectionsTab, { key: 'ArrowDown' });
    const arrowUp = createEvent.keyDown(sectionsTab, { key: 'ArrowUp' });

    fireEvent(sectionsTab, arrowDown);
    fireEvent(sectionsTab, arrowUp);

    expect(arrowDown.defaultPrevented).toBe(false);
    expect(arrowUp.defaultPrevented).toBe(false);
    expect(onTabChange).not.toHaveBeenCalled();
  });

  it('removes inactive tabpanels from the flex layout', () => {
    render(
      <main>
        <BuilderTabPanel activeTab="sections" tab="sections">
          <p>Sections panel content</p>
        </BuilderTabPanel>
        <BuilderTabPanel activeTab="sections" tab="templates" />
      </main>
    );

    const activePanel = document.getElementById('builder-tabpanel-sections');
    expect(activePanel).not.toHaveAttribute('hidden');
    expect(activePanel).toHaveClass('flex', 'flex-1');

    const inactivePanel = document.getElementById('builder-tabpanel-templates');
    expect(inactivePanel).toHaveAttribute('hidden');
    expect(inactivePanel).toHaveClass('hidden');
    expect(inactivePanel).not.toHaveClass('flex', 'flex-1');
  });

  it('has no serious or critical axe violations with associated tabpanels', async () => {
    const { container } = render(
      <main>
        <BuilderTabNav activeTab="sections" onTabChange={vi.fn()} />
        {tabIds.map((tabId) => (
          <BuilderTabPanel key={tabId} activeTab="sections" tab={tabId}>
            {tabId === 'sections' ? <p>Sections panel content</p> : null}
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
  });
});
