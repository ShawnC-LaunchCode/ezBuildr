// @vitest-environment jsdom
/**
 * SECT-8B / SECT-9 — the runner's Section rail.
 *
 * Covers grouped rendering (AC1), the three D-6 states (AC4), per-Section
 * reached/visible counts (AC5), the zero-Section shape (AC6) and the
 * accessibility contract (AC8) — plus SECT-9's interaction contract (AC2):
 * reached rows are real, enabled buttons, unreached rows are genuinely
 * disabled ones, and a Section header lands on its first reached page.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  RunnerSectionNav,
  buildRunnerNavGroups,
  type RunnerNavData,
} from '../../../client/src/components/runner/RunnerSectionNav';

const SECTIONS = [
  { id: 'sec-assets', title: 'Assets' },
  { id: 'sec-debts', title: 'Debts' },
  { id: 'sec-children', title: 'Children' },
  // Present in the definition but contributing no visible page to this run.
  { id: 'sec-support', title: 'Spousal Support' },
];

const PAGES = [
  { id: 'p-real-property', title: 'Real Property', sectionId: 'sec-assets' },
  { id: 'p-bank', title: 'Bank Accounts', sectionId: 'sec-assets' },
  { id: 'p-cards', title: 'Credit Cards', sectionId: 'sec-debts' },
  { id: 'p-loans', title: 'Loans', sectionId: 'sec-debts' },
  { id: 'p-interlude', title: 'Interlude', sectionId: null },
  { id: 'p-school', title: 'School', sectionId: 'sec-children' },
];

const DATA: RunnerNavData = {
  sections: SECTIONS,
  visiblePages: PAGES,
  visitedPageIds: ['p-real-property', 'p-bank', 'p-cards'],
  currentPageId: 'p-cards',
};

function buttonFor(title: string): HTMLButtonElement {
  const button = screen.getByText(title).closest('button');
  if (!button) {
    throw new Error(`No nav control rendered for "${title}"`);
  }
  return button;
}

function rowFor(title: string): HTMLElement {
  const row = screen.getByText(title).closest('li');
  if (!row) {
    throw new Error(`No nav row rendered for "${title}"`);
  }
  return row;
}

afterEach(cleanup);

describe('grouped rendering (AC1)', () => {
  it('lists Sections, their pages and ungrouped pages in order position', () => {
    render(<RunnerSectionNav data={DATA} />);

    const titles = screen.getAllByRole('listitem').map((row) => row.textContent);
    expect(titles).toEqual([
      'Real Propertyreached',
      'Bank Accountsreached',
      'Credit Cardscurrent page',
      'Loansnot yet reached',
      'Interludenot yet reached',
      'Schoolnot yet reached',
    ]);
  });

  it('renders an ungrouped page at the top level rather than inside a Section (D-3)', () => {
    render(<RunnerSectionNav data={DATA} />);

    const groups = buildRunnerNavGroups(DATA);
    expect(groups.map((group) => group.section?.title ?? null)).toEqual([
      'Assets',
      'Debts',
      null,
      'Children',
    ]);
    expect(groups[2].items.map((item) => item.page.title)).toEqual(['Interlude']);
  });

  it('omits a Section with zero visible pages rather than rendering an empty label (AC4)', () => {
    render(<RunnerSectionNav data={DATA} />);

    expect(screen.queryByText('Spousal Support')).toBeNull();
  });
});

describe('the three states (AC4 / D-6)', () => {
  it('marks the current page and exposes unreached pages as disabled, not merely dimmed (AC8)', () => {
    render(<RunnerSectionNav data={DATA} />);

    expect(rowFor('Credit Cards').getAttribute('aria-current')).toBe('step');
    expect(rowFor('Credit Cards').getAttribute('aria-disabled')).toBeNull();

    expect(rowFor('Bank Accounts').getAttribute('aria-current')).toBeNull();
    expect(rowFor('Bank Accounts').getAttribute('aria-disabled')).toBeNull();

    expect(rowFor('Loans').getAttribute('aria-disabled')).toBe('true');
    expect(rowFor('Loans').getAttribute('aria-current')).toBeNull();
  });

  it('never renders a page the visibility engine excluded from this run', () => {
    render(
      <RunnerSectionNav
        data={{ ...DATA, visiblePages: PAGES.filter((page) => page.id !== 'p-loans') }}
      />
    );

    expect(screen.queryByText('Loans')).toBeNull();
    // The same fixture renders it once it is visible again, so the absence
    // above is a real exclusion rather than a fixture that never had it.
    cleanup();
    render(<RunnerSectionNav data={DATA} />);
    expect(screen.getByText('Loans')).toBeTruthy();
  });

  it('treats the page being rendered as reached even before the server array catches up', () => {
    render(<RunnerSectionNav data={{ ...DATA, visitedPageIds: [] }} />);

    expect(rowFor('Credit Cards').getAttribute('aria-disabled')).toBeNull();
    expect(rowFor('Credit Cards').getAttribute('aria-current')).toBe('step');
  });

  it('is a labelled nav landmark (AC8)', () => {
    render(<RunnerSectionNav data={DATA} />);

    expect(screen.getByRole('navigation', { name: 'Interview contents' })).toBeTruthy();
  });

  it('renders nothing at all when this run has no visible pages', () => {
    const { container } = render(<RunnerSectionNav data={{ ...DATA, visiblePages: [] }} />);

    expect(container.innerHTML).toBe('');
  });
});

describe('per-Section progress (AC5)', () => {
  it('counts reached over visible pages only, and never says "completed"', () => {
    const { container } = render(<RunnerSectionNav data={DATA} />);

    // Assets: both reached. Debts: the current page counts, Loans does not.
    // Children: nothing reached. Header total: 3 of 6 visible pages.
    expect(screen.getByText('2/2')).toBeTruthy();
    expect(screen.getByText('1/2')).toBeTruthy();
    expect(screen.getByText('0/1')).toBeTruthy();
    expect(screen.getByText('3/6')).toBeTruthy();
    expect(container.textContent?.toLowerCase()).not.toContain('complet');
  });

  it('excludes pages logic removed from the denominator', () => {
    render(
      <RunnerSectionNav
        data={{ ...DATA, visiblePages: PAGES.filter((page) => page.id !== 'p-loans') }}
      />
    );

    const debts = screen.getByText('Debts').closest('div');
    expect(within(debts as HTMLElement).getByText('1/1')).toBeTruthy();
  });
});

describe('zero Sections (AC6)', () => {
  const flat: RunnerNavData = {
    sections: [],
    visiblePages: PAGES.map((page) => ({ ...page, sectionId: null })),
    visitedPageIds: ['p-real-property'],
    currentPageId: 'p-real-property',
  };

  it('renders every page at the top level under a single Contents header', () => {
    render(<RunnerSectionNav data={flat} />);

    expect(screen.getByText('Contents')).toBeTruthy();
    expect(screen.getByText('1/6')).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
    for (const section of SECTIONS) {
      expect(screen.queryByText(section.title)).toBeNull();
    }
    expect(buildRunnerNavGroups(flat)).toHaveLength(1);
  });
});

describe('buildRunnerNavGroups', () => {
  it('keeps a Section to the contiguous span it owns (D-2)', () => {
    const groups = buildRunnerNavGroups({
      sections: [{ id: 'sec-a', title: 'A' }],
      visiblePages: [
        { id: '1', title: 'One', sectionId: 'sec-a' },
        { id: '2', title: 'Two', sectionId: null },
        { id: '3', title: 'Three', sectionId: 'sec-a' },
      ],
      visitedPageIds: [],
      currentPageId: null,
    });

    expect(groups.map((group) => group.section?.id ?? null)).toEqual(['sec-a', null, 'sec-a']);
    expect(new Set(groups.map((group) => group.key)).size).toBe(3);
  });

  it('degrades an unknown section id to the top level instead of a blank label', () => {
    const groups = buildRunnerNavGroups({
      sections: [],
      visiblePages: [{ id: '1', title: 'Orphan', sectionId: 'sec-missing' }],
      visitedPageIds: [],
      currentPageId: null,
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].section).toBeNull();
  });
});

describe('navigating by click (SECT-9 AC2)', () => {
  it('makes a reached page a real enabled button that asks for the jump', () => {
    const onNavigate = vi.fn();
    render(<RunnerSectionNav data={DATA} onNavigate={onNavigate} />);

    const bank = buttonFor('Bank Accounts');
    expect(bank.disabled).toBe(false);
    fireEvent.click(bank);

    expect(onNavigate).toHaveBeenCalledWith('p-bank');
  });

  it('renders an unreached page as a disabled button, not a dimmed clickable row', () => {
    const onNavigate = vi.fn();
    render(<RunnerSectionNav data={DATA} onNavigate={onNavigate} />);

    const loans = buttonFor('Loans');
    expect(loans.disabled).toBe(true);
    fireEvent.click(loans);

    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('lands a Section click on its first reached page', () => {
    const onNavigate = vi.fn();
    // Debts holds Credit Cards (current) then Loans (unreached).
    render(<RunnerSectionNav data={DATA} onNavigate={onNavigate} />);

    fireEvent.click(buttonFor('Debts'));

    expect(onNavigate).toHaveBeenCalledWith('p-cards');
  });

  it('lands a fully reached Section on its first page', () => {
    const onNavigate = vi.fn();
    render(<RunnerSectionNav data={DATA} onNavigate={onNavigate} />);

    fireEvent.click(buttonFor('Assets'));

    expect(onNavigate).toHaveBeenCalledWith('p-real-property');
  });

  it('disables a Section header the respondent has not reached at all', () => {
    const onNavigate = vi.fn();
    render(<RunnerSectionNav data={DATA} onNavigate={onNavigate} />);

    const children = buttonFor('Children');
    expect(children.disabled).toBe(true);
    fireEvent.click(children);

    expect(onNavigate).not.toHaveBeenCalled();
    expect(buildRunnerNavGroups(DATA).map((group) => group.jumpTargetPageId)).toEqual([
      'p-real-property',
      'p-cards',
      null,
      null,
    ]);
  });

  it('puts reached rows in the tab order and keeps unreached ones out of it', () => {
    render(<RunnerSectionNav data={DATA} onNavigate={vi.fn()} />);

    const reached = buttonFor('Bank Accounts');
    reached.focus();
    expect(document.activeElement).toBe(reached);

    // A disabled button cannot take focus, which is the difference between
    // "greyed" and "genuinely not a control" — `aria-disabled` alone would
    // still hand a keyboard user a dead stop.
    const unreached = buttonFor('Loans');
    unreached.focus();
    expect(document.activeElement).not.toBe(unreached);
  });

  it('stays inert with no handler rather than offering controls that do nothing', () => {
    render(<RunnerSectionNav data={DATA} />);

    const buttons = screen.getAllByRole('button', { hidden: true });
    // Three Section headers plus six page rows: an empty list here would make
    // the assertion below vacuous.
    expect(buttons).toHaveLength(9);
    for (const button of buttons) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
  });
});
