/**
 * Search and sort behaviour behind the projects/workflows list view.
 */

import { describe, it, expect } from 'vitest';

import type { AssetRow } from '../../../client/src/components/shared/AssetTable';
import { matchesAssetSearch, sortAssetRows } from '../../../client/src/hooks/useAssetBrowser';

function row(overrides: Partial<AssetRow> & { id: string; title: string }): AssetRow {
  return {
    kind: 'workflow',
    href: `/workflows/${overrides.id}`,
    ownerLabel: 'You',
    actions: [],
    ...overrides,
  };
}

describe('matchesAssetSearch', () => {
  const asset = { title: 'Acme Onboarding', description: 'Client intake and engagement letters' };

  it('matches everything when the term is blank or whitespace', () => {
    expect(matchesAssetSearch(asset, '')).toBe(true);
    expect(matchesAssetSearch(asset, '   ')).toBe(true);
  });

  it('matches the title regardless of case', () => {
    expect(matchesAssetSearch(asset, 'ACME')).toBe(true);
    expect(matchesAssetSearch(asset, 'onboard')).toBe(true);
  });

  it('matches the description too, not just the title', () => {
    expect(matchesAssetSearch(asset, 'engagement')).toBe(true);
  });

  it('ignores surrounding whitespace in the term', () => {
    expect(matchesAssetSearch(asset, '  acme  ')).toBe(true);
  });

  it('does not match an unrelated term', () => {
    expect(matchesAssetSearch(asset, 'trademark')).toBe(false);
  });

  it('tolerates a missing description', () => {
    expect(matchesAssetSearch({ title: 'Bare', description: null }, 'bare')).toBe(true);
    expect(matchesAssetSearch({ title: 'Bare', description: null }, 'nope')).toBe(false);
  });
});

describe('sortAssetRows', () => {
  it('sorts by title in both directions', () => {
    const rows = [row({ id: '1', title: 'Charlie' }), row({ id: '2', title: 'alpha' }), row({ id: '3', title: 'Bravo' })];

    expect(sortAssetRows(rows, { key: 'title', direction: 'asc' }).map((r) => r.title))
      .toEqual(['alpha', 'Bravo', 'Charlie']);
    expect(sortAssetRows(rows, { key: 'title', direction: 'desc' }).map((r) => r.title))
      .toEqual(['Charlie', 'Bravo', 'alpha']);
  });

  it('does not mutate the array it is given', () => {
    const rows = [row({ id: '1', title: 'B' }), row({ id: '2', title: 'A' })];
    sortAssetRows(rows, { key: 'title', direction: 'asc' });
    expect(rows.map((r) => r.title)).toEqual(['B', 'A']);
  });

  it('sorts projects by workflow count and sinks countless workflow rows below them', () => {
    const rows = [
      row({ id: 'w', title: 'A workflow', kind: 'workflow' }),
      row({ id: 'p0', title: 'Empty project', kind: 'project', workflowCount: 0 }),
      row({ id: 'p3', title: 'Busy project', kind: 'project', workflowCount: 3 }),
    ];

    // Descending puts the busiest project first and the workflow last...
    expect(sortAssetRows(rows, { key: 'workflowCount', direction: 'desc' }).map((r) => r.id))
      .toEqual(['p3', 'p0', 'w']);
    // ...and ascending must not confuse "no count" with "zero".
    expect(sortAssetRows(rows, { key: 'workflowCount', direction: 'asc' }).map((r) => r.id))
      .toEqual(['w', 'p0', 'p3']);
  });

  it('sorts by updated date, newest first when descending', () => {
    const rows = [
      row({ id: 'old', title: 'Old', updatedAt: '2026-01-01T00:00:00.000Z' }),
      row({ id: 'new', title: 'New', updatedAt: '2026-08-01T00:00:00.000Z' }),
      row({ id: 'mid', title: 'Mid', updatedAt: '2026-04-01T00:00:00.000Z' }),
    ];

    expect(sortAssetRows(rows, { key: 'updatedAt', direction: 'desc' }).map((r) => r.id))
      .toEqual(['new', 'mid', 'old']);
  });

  it('treats a missing or unparseable date as the oldest rather than throwing', () => {
    const rows = [
      row({ id: 'dated', title: 'Dated', updatedAt: '2026-08-01T00:00:00.000Z' }),
      row({ id: 'none', title: 'None', updatedAt: null }),
      row({ id: 'junk', title: 'Junk', updatedAt: 'not-a-date' }),
    ];

    expect(sortAssetRows(rows, { key: 'updatedAt', direction: 'desc' })[0].id).toBe('dated');
  });

  it('breaks ties on a coarse column by title, so the order is stable', () => {
    // Every row shares a status; without the tiebreak the result would depend on
    // input order and the table would reshuffle on each render.
    const rows = [
      row({ id: '1', title: 'Zulu', status: 'active' }),
      row({ id: '2', title: 'Alpha', status: 'active' }),
      row({ id: '3', title: 'Mike', status: 'active' }),
    ];

    const first = sortAssetRows(rows, { key: 'status', direction: 'asc' }).map((r) => r.title);
    const second = sortAssetRows([...rows].reverse(), { key: 'status', direction: 'asc' }).map((r) => r.title);

    expect(first).toEqual(['Alpha', 'Mike', 'Zulu']);
    expect(second).toEqual(first);
  });

  it('groups by kind when sorting on type', () => {
    const rows = [
      row({ id: 'w1', title: 'W1', kind: 'workflow' }),
      row({ id: 'p1', title: 'P1', kind: 'project' }),
      row({ id: 'w2', title: 'W2', kind: 'workflow' }),
    ];

    expect(sortAssetRows(rows, { key: 'kind', direction: 'asc' }).map((r) => r.kind))
      .toEqual(['project', 'workflow', 'workflow']);
  });
});
