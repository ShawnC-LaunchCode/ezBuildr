/**
 * DataVault Filter Store
 * Manages filter state for table views
 */

import { create } from "zustand";

/**
 * Stable empty array reference to avoid infinite re-renders in React.
 * When using Zustand selectors, returning a new [] each time causes
 * useSyncExternalStore to detect a "change" and re-render infinitely.
 * Always use this constant for fallback empty arrays.
 */
export const EMPTY_FILTERS: FilterCondition[] = [];

export type FilterOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "greater_than"
  | "less_than"
  | "greater_than_or_equal"
  | "less_than_or_equal"
  | "is_empty"
  | "is_not_empty"
  | "in"
  | "not_in";

export interface FilterCondition {
  id: string; // Unique ID for React keys
  columnId: string;
  operator: FilterOperator;
  value: string | number | boolean | null;
}

interface FilterState {
  // Filters by table ID
  filtersByTable: Record<string, FilterCondition[]>;

  // Actions
  setFilters: (tableId: string, filters: FilterCondition[]) => void;
  addFilter: (tableId: string, filter: FilterCondition) => void;
  updateFilter: (tableId: string, filterId: string, updates: Partial<FilterCondition>) => void;
  removeFilter: (tableId: string, filterId: string) => void;
  clearFilters: (tableId: string) => void;
  // NOTE: getFilters was removed - use selector pattern instead:
  // const filters = useDatavaultFilterStore((s) => s.filtersByTable[tableId] ?? EMPTY_FILTERS);
}

export const useDatavaultFilterStore = create<FilterState>((set, get) => ({
  filtersByTable: {},

  setFilters: (tableId, filters) =>
    set((state) => ({
      filtersByTable: {
        ...state.filtersByTable,
        [tableId]: filters,
      },
    })),

  addFilter: (tableId, filter) =>
    set((state) => {
      const existing = state.filtersByTable[tableId] || [];
      return {
        filtersByTable: {
          ...state.filtersByTable,
          [tableId]: [...existing, filter],
        },
      };
    }),

  updateFilter: (tableId, filterId, updates) =>
    set((state) => {
      const existing = state.filtersByTable[tableId] || [];
      return {
        filtersByTable: {
          ...state.filtersByTable,
          [tableId]: existing.map((f) =>
            f.id === filterId ? { ...f, ...updates } : f
          ),
        },
      };
    }),

  removeFilter: (tableId, filterId) =>
    set((state) => {
      const existing = state.filtersByTable[tableId] || [];
      return {
        filtersByTable: {
          ...state.filtersByTable,
          [tableId]: existing.filter((f) => f.id !== filterId),
        },
      };
    }),

  clearFilters: (tableId) =>
    set((state) => ({
      filtersByTable: {
        ...state.filtersByTable,
        [tableId]: [],
      },
    })),
}));
