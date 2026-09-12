/**
 * Search / sort / view-mode state for the project and workflow browsing
 * surfaces (`/workflows`, `/projects/:id`).
 *
 * The view mode is a per-viewer convenience, so it lives in localStorage rather
 * than on the server — every read and write is guarded because a browser set to
 * block site data throws on access rather than returning null.
 */

import { useCallback, useMemo, useState } from "react";

import type { AssetRow, AssetSortKey } from "@/components/shared/AssetTable";

export type AssetViewMode = "grid" | "list";
export type SortDirection = "asc" | "desc";

export interface AssetSort {
  key: AssetSortKey;
  direction: SortDirection;
}

const VIEW_MODES: readonly AssetViewMode[] = ["grid", "list"];

function readStoredViewMode(storageKey: string, fallback: AssetViewMode): AssetViewMode {
  try {
    const stored = window.localStorage.getItem(storageKey);
    return VIEW_MODES.includes(stored as AssetViewMode) ? (stored as AssetViewMode) : fallback;
  } catch {
    return fallback;
  }
}

export function useAssetViewMode(
  storageKey: string,
  fallback: AssetViewMode = "grid"
): [AssetViewMode, (mode: AssetViewMode) => void] {
  const [viewMode, setViewModeState] = useState<AssetViewMode>(() => readStoredViewMode(storageKey, fallback));

  const setViewMode = useCallback((mode: AssetViewMode) => {
    setViewModeState(mode);
    try {
      window.localStorage.setItem(storageKey, mode);
    } catch {
      // A viewer who blocks site data still gets the toggle, just not the memory.
    }
  }, [storageKey]);

  return [viewMode, setViewMode];
}

/** Case-insensitive substring match over title and description. */
export function matchesAssetSearch(
  asset: { title?: string | null; description?: string | null },
  search: string
): boolean {
  const needle = search.trim().toLowerCase();
  if (needle === "") {
    return true;
  }
  return `${asset.title ?? ""} ${asset.description ?? ""}`.toLowerCase().includes(needle);
}

function sortValue(row: AssetRow, key: AssetSortKey): string | number {
  switch (key) {
    case "title":
      return row.title.toLowerCase();
    case "kind":
      return row.kind;
    case "status":
      return (row.status ?? "").toLowerCase();
    case "workflowCount":
      // Workflow rows have no count of their own; park them below every project
      // rather than letting them tie at zero with genuinely empty projects.
      return row.workflowCount ?? -1;
    case "owner":
      return row.ownerLabel.toLowerCase();
    case "updatedAt":
    case "createdAt": {
      const raw = key === "updatedAt" ? row.updatedAt : row.createdAt;
      const parsed = raw ? Date.parse(raw) : Number.NaN;
      return Number.isNaN(parsed) ? 0 : parsed;
    }
  }
}

/**
 * Sort rows by one column. Ties fall back to title so the order is total —
 * without it, sorting by a coarse column (status, type) reshuffles equal rows
 * on every render and the table looks unstable.
 */
export function sortAssetRows(rows: AssetRow[], sort: AssetSort): AssetRow[] {
  const factor = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = sortValue(a, sort.key);
    const right = sortValue(b, sort.key);
    if (left < right) { return -1 * factor; }
    if (left > right) { return 1 * factor; }
    return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
  });
}

export interface UseAssetSortResult {
  sort: AssetSort;
  /** Click a header: same column flips direction, a new column starts at its natural direction. */
  toggleSort: (key: AssetSortKey) => void;
  sortRows: (rows: AssetRow[]) => AssetRow[];
}

/** Recency and counts read most usefully high-to-low; names read A→Z. */
function naturalDirection(key: AssetSortKey): SortDirection {
  return key === "updatedAt" || key === "createdAt" || key === "workflowCount" ? "desc" : "asc";
}

export function useAssetSort(initial: AssetSort = { key: "updatedAt", direction: "desc" }): UseAssetSortResult {
  const [sort, setSort] = useState<AssetSort>(initial);

  const toggleSort = useCallback((key: AssetSortKey) => {
    setSort((current) => current.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: naturalDirection(key) });
  }, []);

  const sortRows = useCallback((rows: AssetRow[]) => sortAssetRows(rows, sort), [sort]);

  return { sort, toggleSort, sortRows };
}

export interface UseAssetBrowserResult extends UseAssetSortResult {
  search: string;
  setSearch: (value: string) => void;
  viewMode: AssetViewMode;
  setViewMode: (mode: AssetViewMode) => void;
  /** Filter helper bound to the current search term. */
  matches: (asset: { title?: string | null; description?: string | null }) => boolean;
}

export function useAssetBrowser(
  storageKey: string,
  initialSort?: AssetSort
): UseAssetBrowserResult {
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useAssetViewMode(storageKey);
  const { sort, toggleSort, sortRows } = useAssetSort(initialSort);

  const matches = useMemo(
    () => (asset: { title?: string | null; description?: string | null }) => matchesAssetSearch(asset, search),
    [search]
  );

  return { search, setSearch, viewMode, setViewMode, sort, toggleSort, sortRows, matches };
}
