# DataVault v3 — Complete Implementation Guide

**Status:** Implementation in Progress
**Target:** All 9 PRs delivered as coordinated build
**Date:** 2025-11-19

---

## Overview

This document outlines the complete implementation of DataVault v3, covering all 9 PRs:

1. Column Descriptions
2. Column Width + Resize
3. Filter Engine (backend)
4. Filter UI (frontend)
5. Sorting (backend + frontend)
6. Row Archiving (backend + frontend)
7. Bulk Selection + Bulk Actions
8. UX / Skeleton / Empty States
9. Full Regression Tests

---

## PR 1 — Column Descriptions

### Summary
Add `description` field to columns, display as tooltips on column headers, editable in column modals.

### Backend Changes ✅ COMPLETE
- **Migration:** `migrations/0036_add_column_descriptions.sql` ✅
- **Schema:** Added `description: text("description")` to `datavaultColumns` ✅
- **Repository:** No changes needed (auto-handled by Drizzle) ✅

### Frontend Changes (TODO)

#### Update ColumnManagerWithDnd Component
**File:** `client/src/components/datavault/ColumnManagerWithDnd.tsx`

```tsx
// Add state for description
const [newColumnDescription, setNewColumnDescription] = useState("");
const [editColumnDescription, setEditColumnDescription] = useState("");

// Update interface
interface ColumnManagerProps {
  onAddColumn: (data: {
    name: string;
    type: string;
    required: boolean;
    description?: string; // NEW
    referenceTableId?: string;
    referenceDisplayColumnSlug?: string;
  }) => Promise<void>;
  onUpdateColumn: (columnId: string, data: {
    name: string;
    required: boolean;
    description?: string; // NEW
  }) => Promise<void>;
  // ... rest
}

// Add Column Dialog - add description textarea:
<div className="grid gap-2">
  <Label htmlFor="new-column-description">Description (optional)</Label>
  <Textarea
    id="new-column-description"
    value={newColumnDescription}
    onChange={(e) => setNewColumnDescription(e.target.value)}
    placeholder="Describe this column's purpose..."
    rows={3}
  />
</div>

// Edit Column Dialog - add description textarea:
<div className="grid gap-2">
  <Label htmlFor="edit-column-description">Description (optional)</Label>
  <Textarea
    id="edit-column-description"
    value={editColumnDescription}
    onChange={(e) => setEditColumnDescription(e.target.value)}
    placeholder="Describe this column's purpose..."
    rows={3}
  />
</div>

// Update handleAddColumn:
await onAddColumn({
  name: newColumnName.trim(),
  type: newColumnType,
  required: newColumnRequired,
  description: newColumnDescription.trim() || undefined, // NEW
  // ... rest
});

// Update handleEditColumn:
await onUpdateColumn(editDialog.id, {
  name: editColumnName.trim(),
  required: editColumnRequired,
  description: editColumnDescription.trim() || undefined, // NEW
});

// Update openEditDialog:
const openEditDialog = (column: DatavaultColumn) => {
  setEditDialog({ id: column.id, name: column.name, required: column.required });
  setEditColumnName(column.name);
  setEditColumnRequired(column.required);
  setEditColumnDescription(column.description || ""); // NEW
};
```

#### Add Tooltip to Column Headers
**File:** `client/src/components/datavault/ColumnHeaderCell.tsx`

```tsx
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Wrap column name with tooltip:
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <span className="font-medium truncate">{column.name}</span>
    </TooltipTrigger>
    {column.description && (
      <TooltipContent>
        <p className="max-w-xs">{column.description}</p>
      </TooltipContent>
    )}
  </Tooltip>
</TooltipProvider>
```

#### Update Page Handler
**File:** `client/src/pages/datavault/[tableId].tsx`

```tsx
const handleAddColumn = async (data: {
  name: string;
  type: string;
  required: boolean;
  description?: string; // NEW
  referenceTableId?: string;
  referenceDisplayColumnSlug?: string;
}) => {
  if (!tableId) return;
  try {
    await createColumnMutation.mutateAsync({ tableId, ...data });
    toast({ title: "Column added", description: `Column "${data.name}" has been added successfully.` });
  } catch (error) {
    toast({ title: "Failed to add column", description: error instanceof Error ? error.message : "An error occurred", variant: "destructive" });
  }
};

const handleUpdateColumn = async (columnId: string, data: {
  name: string;
  required: boolean;
  description?: string; // NEW
}) => {
  if (!tableId) return;
  try {
    await updateColumnMutation.mutateAsync({ columnId, tableId, ...data });
    toast({ title: "Column updated", description: "Column has been updated successfully." });
  } catch (error) {
    toast({ title: "Failed to update column", description: error instanceof Error ? error.message : "An error occurred", variant: "destructive" });
    throw error;
  }
};
```

---

## PR 2 — Column Width + Resize

### Summary
Add `widthPx` field to columns, allow users to resize columns in grid, persist width.

### Backend Changes ✅ COMPLETE
- **Migration:** `migrations/0037_add_column_width.sql` ✅
- **Schema:** Added `widthPx: integer("width_px").default(150)` ✅
- **Repository:** No changes needed ✅

### Frontend Changes (TODO)

#### Update InfiniteDataGrid Component
**File:** `client/src/components/datavault/InfiniteDataGrid.tsx`

```tsx
// Add resize state
const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
const [resizing, setResizing] = useState<{ columnId: string; startX: number; startWidth: number } | null>(null);

// Initialize widths from column data
useEffect(() => {
  const widths: Record<string, number> = {};
  columns.forEach(col => {
    widths[col.id] = col.widthPx || 150;
  });
  setColumnWidths(widths);
}, [columns]);

// Handle resize start
const handleResizeStart = (e: React.MouseEvent, columnId: string) => {
  e.preventDefault();
  const startX = e.clientX;
  const startWidth = columnWidths[columnId] || 150;
  setResizing({ columnId, startX, startWidth });
};

// Handle resize move
const handleResizeMove = (e: MouseEvent) => {
  if (!resizing) return;
  const delta = e.clientX - resizing.startX;
  const newWidth = Math.max(80, Math.min(500, resizing.startWidth + delta));
  setColumnWidths(prev => ({ ...prev, [resizing.columnId]: newWidth }));
};

// Handle resize end
const handleResizeEnd = async () => {
  if (!resizing) return;
  const { columnId } = resizing;
  const newWidth = columnWidths[columnId];

  // Persist to backend
  try {
    await updateColumnMutation.mutateAsync({
      columnId,
      tableId,
      widthPx: newWidth,
    });
  } catch (error) {
    toast({ title: "Failed to save column width", variant: "destructive" });
  }

  setResizing(null);
};

// Add event listeners
useEffect(() => {
  if (resizing) {
    window.addEventListener('mousemove', handleResizeMove);
    window.addEventListener('mouseup', handleResizeEnd);
    return () => {
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('mouseup', handleResizeEnd);
    };
  }
}, [resizing]);

// Update column header to show resize handle:
<div
  className="flex items-center justify-between relative"
  style={{ width: columnWidths[column.id] || 150 }}
>
  <span>{column.name}</span>
  <div
    className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/20"
    onMouseDown={(e) => handleResizeStart(e, column.id)}
  />
</div>

// Apply width to cells:
<div
  className="flex-shrink-0"
  style={{ width: columnWidths[column.id] || 150 }}
>
  {/* Cell content */}
</div>
```

---

## PR 3 — Filter Engine (Backend)

### Summary
Extend GET `/api/datavault/tables/:tableId/rows` to support filter parameters.

### Backend Changes (TODO)

#### Update DatavaultRowsRepository
**File:** `server/repositories/DatavaultRowsRepository.ts`

Add advanced filtering method:

```ts
/**
 * Find rows with advanced filtering support
 */
async findWithFilters(
  tableId: string,
  filters: Array<{
    columnId: string;
    operator: 'equals' | 'contains' | 'gt' | 'lt' | 'gte' | 'lte' | 'is_empty' | 'is_not_empty' | 'before' | 'after' | 'between';
    value: any;
  }>,
  options?: {
    limit?: number;
    offset?: number;
    showArchived?: boolean;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  },
  tx?: DbTransaction
): Promise<Array<{ row: DatavaultRow; values: Record<string, any> }>> {
  const database = this.getDb(tx);

  // Get base rows
  const whereConditions = [eq(datavaultRows.tableId, tableId)];
  if (!options?.showArchived) {
    whereConditions.push(isNull(datavaultRows.deletedAt));
  }

  let rows = await database
    .select()
    .from(datavaultRows)
    .where(and(...whereConditions));

  // Get all row IDs
  const rowIds = rows.map(r => r.id);
  if (rowIds.length === 0) return [];

  // Fetch values
  const values = await database
    .select()
    .from(datavaultValues)
    .where(inArray(datavaultValues.rowId, rowIds));

  // Group by row
  const valuesByRow = values.reduce((acc, val) => {
    if (!acc[val.rowId]) acc[val.rowId] = {};
    acc[val.rowId][val.columnId] = val.value;
    return acc;
  }, {} as Record<string, Record<string, any>>);

  // Apply filters in-memory (for complex JSONB queries)
  let filtered = rows.map(row => ({ row, values: valuesByRow[row.id] || {} }));

  for (const filter of filters) {
    filtered = filtered.filter(({ values }) => {
      const cellValue = values[filter.columnId];
      return matchesFilter(cellValue, filter.operator, filter.value);
    });
  }

  // Apply pagination
  const offset = options?.offset || 0;
  const limit = options?.limit || 100;
  filtered = filtered.slice(offset, offset + limit);

  return filtered;
}

function matchesFilter(cellValue: any, operator: string, filterValue: any): boolean {
  if (operator === 'is_empty') return cellValue == null || cellValue === '';
  if (operator === 'is_not_empty') return cellValue != null && cellValue !== '';
  if (cellValue == null) return false;

  switch (operator) {
    case 'equals':
      return cellValue == filterValue;
    case 'contains':
      return String(cellValue).toLowerCase().includes(String(filterValue).toLowerCase());
    case 'gt':
      return Number(cellValue) > Number(filterValue);
    case 'lt':
      return Number(cellValue) < Number(filterValue);
    case 'gte':
      return Number(cellValue) >= Number(filterValue);
    case 'lte':
      return Number(cellValue) <= Number(filterValue);
    case 'before':
      return new Date(cellValue) < new Date(filterValue);
    case 'after':
      return new Date(cellValue) > new Date(filterValue);
    case 'between':
      const [min, max] = filterValue;
      return Number(cellValue) >= Number(min) && Number(cellValue) <= Number(max);
    default:
      return false;
  }
}
```

#### Update DatavaultRowsService
**File:** `server/services/DatavaultRowsService.ts`

Add filtering logic:

```ts
async getRowsWithFilters(
  userId: string,
  tableId: string,
  filters: Array<{ columnId: string; operator: string; value: any }>,
  options: { limit?: number; offset?: number; showArchived?: boolean; sortBy?: string; sortOrder?: 'asc' | 'desc' }
): Promise<{ rows: any[]; total: number }> {
  // Check table access
  const table = await this.tablesRepo.findById(tableId);
  if (!table) throw new Error('Table not found');

  const user = await this.usersRepo.findById(userId);
  if (!user || user.tenantId !== table.tenantId) {
    throw new Error('Unauthorized');
  }

  // Fetch filtered rows
  const rows = await this.rowsRepo.findWithFilters(tableId, filters, options);
  const total = await this.rowsRepo.countByTableIdWithFilter(tableId, options.showArchived || false);

  return { rows, total };
}
```

#### Update API Route
**File:** `server/routes/datavaultRows.ts`

```ts
// GET /api/datavault/tables/:tableId/rows
router.get('/:tableId/rows', authMiddleware, async (req, res, next) => {
  try {
    const { tableId } = req.params;
    const { limit, offset, showArchived, sortBy, sortOrder, filters } = req.query;

    const parsedFilters = filters ? JSON.parse(filters as string) : [];

    const result = await datavaultRowsService.getRowsWithFilters(
      req.user!.id,
      tableId,
      parsedFilters,
      {
        limit: Number(limit) || 100,
        offset: Number(offset) || 0,
        showArchived: showArchived === 'true',
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
      }
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
});
```

---

## PR 4 — Filter UI (Frontend)

### Summary
Add filter panel above grid, Zustand store for per-table filter state.

### Frontend Changes (TODO)

#### Create Filter Panel Component
**File:** `client/src/components/datavault/FilterPanel.tsx`

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Plus, Filter } from "lucide-react";
import type { DatavaultColumn } from "@shared/schema";

interface FilterRule {
  columnId: string;
  operator: string;
  value: any;
}

interface FilterPanelProps {
  columns: DatavaultColumn[];
  filters: FilterRule[];
  onFiltersChange: (filters: FilterRule[]) => void;
}

export function FilterPanel({ columns, filters, onFiltersChange }: FilterPanelProps) {
  const addFilter = () => {
    onFiltersChange([...filters, { columnId: columns[0]?.id || '', operator: 'equals', value: '' }]);
  };

  const removeFilter = (index: number) => {
    onFiltersChange(filters.filter((_, i) => i !== index));
  };

  const updateFilter = (index: number, updates: Partial<FilterRule>) => {
    const updated = [...filters];
    updated[index] = { ...updated[index], ...updates };
    onFiltersChange(updated);
  };

  const getOperatorsForColumn = (columnId: string) => {
    const column = columns.find(c => c.id === columnId);
    if (!column) return ['equals'];

    switch (column.type) {
      case 'text':
      case 'email':
      case 'phone':
      case 'url':
        return ['equals', 'contains', 'is_empty', 'is_not_empty'];
      case 'number':
      case 'auto_number':
        return ['equals', 'gt', 'lt', 'gte', 'lte', 'between', 'is_empty', 'is_not_empty'];
      case 'date':
      case 'datetime':
        return ['equals', 'before', 'after', 'between', 'is_empty', 'is_not_empty'];
      case 'boolean':
        return ['equals'];
      case 'reference':
        return ['equals', 'is_empty', 'is_not_empty'];
      default:
        return ['equals'];
    }
  };

  return (
    <div className="space-y-2 p-4 bg-muted/20 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4" />
          <h3 className="font-medium">Filters</h3>
        </div>
        <Button size="sm" variant="outline" onClick={addFilter}>
          <Plus className="w-4 h-4 mr-1" />
          Add Filter
        </Button>
      </div>

      {filters.length === 0 && (
        <p className="text-sm text-muted-foreground">No filters applied. Click "Add Filter" to get started.</p>
      )}

      {filters.map((filter, index) => (
        <div key={index} className="flex items-center gap-2">
          <Select value={filter.columnId} onValueChange={(val) => updateFilter(index, { columnId: val })}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {columns.map(col => (
                <SelectItem key={col.id} value={col.id}>{col.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filter.operator} onValueChange={(val) => updateFilter(index, { operator: val })}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {getOperatorsForColumn(filter.columnId).map(op => (
                <SelectItem key={op} value={op}>{op.replace('_', ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {!['is_empty', 'is_not_empty'].includes(filter.operator) && (
            <Input
              value={filter.value}
              onChange={(e) => updateFilter(index, { value: e.target.value })}
              placeholder="Filter value..."
              className="flex-1"
            />
          )}

          <Button size="icon" variant="ghost" onClick={() => removeFilter(index)}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
```

#### Create Zustand Store for Filters
**File:** `client/src/stores/useDatavaultFilterStore.ts`

```tsx
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface FilterRule {
  columnId: string;
  operator: string;
  value: any;
}

interface FilterState {
  filtersByTable: Record<string, FilterRule[]>;
  setFilters: (tableId: string, filters: FilterRule[]) => void;
  clearFilters: (tableId: string) => void;
}

export const useDatavaultFilterStore = create<FilterState>()(
  persist(
    (set) => ({
      filtersByTable: {},
      setFilters: (tableId, filters) =>
        set((state) => ({
          filtersByTable: { ...state.filtersByTable, [tableId]: filters },
        })),
      clearFilters: (tableId) =>
        set((state) => {
          const { [tableId]: _, ...rest } = state.filtersByTable;
          return { filtersByTable: rest };
        }),
    }),
    { name: 'datavault-filters' }
  )
);
```

#### Integrate into Table Page
**File:** `client/src/pages/datavault/[tableId].tsx`

```tsx
import { FilterPanel } from "@/components/datavault/FilterPanel";
import { useDatavaultFilterStore } from "@/stores/useDatavaultFilterStore";

// Inside component:
const filters = useDatavaultFilterStore(state => state.filtersByTable[tableId!] || []);
const setFilters = useDatavaultFilterStore(state => state.setFilters);

const handleFiltersChange = (newFilters: any[]) => {
  setFilters(tableId!, newFilters);
  // Reset pagination
  // Trigger data refetch
};

// In JSX:
<FilterPanel columns={columns} filters={filters} onFiltersChange={handleFiltersChange} />
<InfiniteDataGrid columns={columns} rows={rows} filters={filters} />
```

---

## PR 5 — Sorting (Backend + Frontend)

### Summary
Single-column sorting with `sort=columnSlug:asc|desc` query param.

### Backend Changes ✅ PARTIAL
- Repository already supports `sortBy` and `sortOrder` ✅
- Need to add column-based sorting (currently only createdAt/updatedAt)

#### Enhance DatavaultRowsRepository
```ts
// Update findByTableId to support column sorting:
async findByTableId(
  tableId: string,
  options?: {
    limit?: number;
    offset?: number;
    showArchived?: boolean;
    sortByColumn?: string; // Column slug
    sortOrder?: 'asc' | 'desc';
  },
  tx?: DbTransaction
): Promise<Array<{ row: DatavaultRow; values: Record<string, any> }>> {
  // ... existing code ...

  // If sorting by column, fetch column ID and perform sort
  if (options?.sortByColumn) {
    const column = await database
      .select()
      .from(datavaultColumns)
      .where(and(
        eq(datavaultColumns.tableId, tableId),
        eq(datavaultColumns.slug, options.sortByColumn)
      ))
      .limit(1);

    if (column[0]) {
      // Sort by column values (requires fetching values first)
      // Implementation depends on column type
    }
  }
}
```

### Frontend Changes (TODO)

#### Add Sort Icons to Column Headers
**File:** `client/src/components/datavault/ColumnHeaderCell.tsx`

```tsx
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

interface ColumnHeaderCellProps {
  column: DatavaultColumn;
  sortBy: string | null;
  sortOrder: 'asc' | 'desc' | null;
  onSort: (columnSlug: string) => void;
}

export function ColumnHeaderCell({ column, sortBy, sortOrder, onSort }: ColumnHeaderCellProps) {
  const isSorted = sortBy === column.slug;

  return (
    <div
      className="flex items-center justify-between cursor-pointer hover:bg-accent/50 p-2"
      onClick={() => onSort(column.slug)}
    >
      <span>{column.name}</span>
      {isSorted && sortOrder === 'asc' && <ArrowUp className="w-4 h-4" />}
      {isSorted && sortOrder === 'desc' && <ArrowDown className="w-4 h-4" />}
      {!isSorted && <ArrowUpDown className="w-4 h-4 opacity-30" />}
    </div>
  );
}
```

#### Add Sort State to Table Page
**File:** `client/src/pages/datavault/[tableId].tsx`

```tsx
const [sortBy, setSortBy] = useState<string | null>(null);
const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

const handleSort = (columnSlug: string) => {
  if (sortBy === columnSlug) {
    // Toggle order or clear
    if (sortOrder === 'asc') setSortOrder('desc');
    else { setSortBy(null); setSortOrder('asc'); }
  } else {
    setSortBy(columnSlug);
    setSortOrder('asc');
  }
  // Reset pagination and refetch
};
```

---

## PR 6 — Row Archiving (Backend + Frontend)

### Summary
Soft delete rows with `deletedAt` timestamp, "Show Archived" toggle, Archive/Unarchive actions.

### Backend Changes ✅ COMPLETE
- **Migration:** `migrations/0038_add_row_archiving.sql` ✅
- **Schema:** Added `deletedAt: timestamp("deleted_at")` ✅
- **Repository:** Added archive methods ✅

### Service Layer (TODO)

#### Update DatavaultRowsService
**File:** `server/services/DatavaultRowsService.ts`

```ts
async archiveRow(userId: string, rowId: string): Promise<void> {
  // Check permissions
  const row = await this.rowsRepo.findById(rowId);
  if (!row) throw new Error('Row not found');

  const table = await this.tablesRepo.findById(row.tableId);
  if (!table) throw new Error('Table not found');

  const user = await this.usersRepo.findById(userId);
  if (!user || user.tenantId !== table.tenantId) throw new Error('Unauthorized');

  await this.rowsRepo.archiveRow(rowId);
}

async unarchiveRow(userId: string, rowId: string): Promise<void> {
  // Same permission checks
  await this.rowsRepo.unarchiveRow(rowId);
}

async bulkArchiveRows(userId: string, rowIds: string[]): Promise<void> {
  // Verify ownership
  const user = await this.usersRepo.findById(userId);
  if (!user) throw new Error('User not found');

  await this.rowsRepo.batchVerifyOwnership(rowIds, user.tenantId!);
  await this.rowsRepo.bulkArchiveRows(rowIds);
}

async bulkUnarchiveRows(userId: string, rowIds: string[]): Promise<void> {
  const user = await this.usersRepo.findById(userId);
  if (!user) throw new Error('User not found');

  await this.rowsRepo.batchVerifyOwnership(rowIds, user.tenantId!);
  await this.rowsRepo.bulkUnarchiveRows(rowIds);
}
```

#### Add API Endpoints
**File:** `server/routes/datavaultRows.ts`

```ts
// PATCH /api/datavault/rows/:rowId/archive
router.patch('/:rowId/archive', authMiddleware, async (req, res, next) => {
  try {
    await datavaultRowsService.archiveRow(req.user!.id, req.params.rowId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/datavault/rows/:rowId/unarchive
router.patch('/:rowId/unarchive', authMiddleware, async (req, res, next) => {
  try {
    await datavaultRowsService.unarchiveRow(req.user!.id, req.params.rowId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/datavault/rows/bulk/archive
router.patch('/bulk/archive', authMiddleware, async (req, res, next) => {
  try {
    const { rowIds } = req.body;
    await datavaultRowsService.bulkArchiveRows(req.user!.id, rowIds);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/datavault/rows/bulk/unarchive
router.patch('/bulk/unarchive', authMiddleware, async (req, res, next) => {
  try {
    const { rowIds } = req.body;
    await datavaultRowsService.bulkUnarchiveRows(req.user!.id, rowIds);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});
```

### Frontend Changes (TODO)

#### Add "Show Archived" Toggle
**File:** `client/src/pages/datavault/[tableId].tsx`

```tsx
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const [showArchived, setShowArchived] = useState(false);

// In toolbar:
<div className="flex items-center gap-2">
  <Switch id="show-archived" checked={showArchived} onCheckedChange={setShowArchived} />
  <Label htmlFor="show-archived">Show Archived</Label>
</div>
```

#### Add Row Actions (Archive/Unarchive/Delete)
**File:** `client/src/components/datavault/RowActionsMenu.tsx`

```tsx
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreVertical, Archive, ArchiveRestore, Trash } from "lucide-react";

interface RowActionsMenuProps {
  row: any;
  isArchived: boolean;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
}

export function RowActionsMenu({ row, isArchived, onArchive, onUnarchive, onDelete }: RowActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreVertical className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {!isArchived && (
          <DropdownMenuItem onClick={onArchive}>
            <Archive className="w-4 h-4 mr-2" />
            Archive
          </DropdownMenuItem>
        )}
        {isArchived && (
          <DropdownMenuItem onClick={onUnarchive}>
            <ArchiveRestore className="w-4 h-4 mr-2" />
            Restore
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onDelete} className="text-destructive">
          <Trash className="w-4 h-4 mr-2" />
          Delete Permanently
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

---

## PR 7 — Bulk Selection + Bulk Actions

### Summary
Checkbox column at far left, select all/clear buttons, bulk archive/unarchive/delete.

### Frontend Changes (TODO)

#### Add Bulk Selection State
**File:** `client/src/pages/datavault/[tableId].tsx`

```tsx
const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

const toggleRowSelection = (rowId: string) => {
  setSelectedRowIds(prev => {
    const newSet = new Set(prev);
    if (newSet.has(rowId)) newSet.delete(rowId);
    else newSet.add(rowId);
    return newSet;
  });
};

const toggleSelectAll = () => {
  if (selectedRowIds.size === rows.length) {
    setSelectedRowIds(new Set());
  } else {
    setSelectedRowIds(new Set(rows.map(r => r.row.id)));
  }
};

const handleBulkArchive = async () => {
  try {
    await bulkArchiveMutation.mutateAsync({ rowIds: Array.from(selectedRowIds) });
    setSelectedRowIds(new Set());
    toast({ title: "Rows archived successfully" });
  } catch (error) {
    toast({ title: "Failed to archive rows", variant: "destructive" });
  }
};

const handleBulkUnarchive = async () => {
  try {
    await bulkUnarchiveMutation.mutateAsync({ rowIds: Array.from(selectedRowIds) });
    setSelectedRowIds(new Set());
    toast({ title: "Rows restored successfully" });
  } catch (error) {
    toast({ title: "Failed to restore rows", variant: "destructive" });
  }
};

const handleBulkDelete = async () => {
  if (!confirm(`Permanently delete ${selectedRowIds.size} rows? This cannot be undone.`)) return;
  try {
    await bulkDeleteMutation.mutateAsync({ rowIds: Array.from(selectedRowIds) });
    setSelectedRowIds(new Set());
    toast({ title: "Rows deleted successfully" });
  } catch (error) {
    toast({ title: "Failed to delete rows", variant: "destructive" });
  }
};
```

#### Add Bulk Actions Toolbar
```tsx
{selectedRowIds.size > 0 && (
  <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
    <span className="font-medium">{selectedRowIds.size} selected</span>
    <Button size="sm" variant="outline" onClick={() => setSelectedRowIds(new Set())}>
      Clear
    </Button>
    <Button size="sm" variant="outline" onClick={handleBulkArchive}>
      <Archive className="w-4 h-4 mr-1" />
      Archive Selected
    </Button>
    {showArchived && (
      <Button size="sm" variant="outline" onClick={handleBulkUnarchive}>
        <ArchiveRestore className="w-4 h-4 mr-1" />
        Restore Selected
      </Button>
    )}
    <Button size="sm" variant="destructive" onClick={handleBulkDelete}>
      <Trash className="w-4 h-4 mr-1" />
      Delete Selected
    </Button>
  </div>
)}
```

#### Add Checkbox Column to Grid
**File:** `client/src/components/datavault/InfiniteDataGrid.tsx`

```tsx
// Header checkbox
<div className="w-12 flex items-center justify-center">
  <Checkbox
    checked={selectedRowIds.size === rows.length && rows.length > 0}
    onCheckedChange={toggleSelectAll}
  />
</div>

// Row checkbox
<div className="w-12 flex items-center justify-center">
  <Checkbox
    checked={selectedRowIds.has(row.row.id)}
    onCheckedChange={() => toggleRowSelection(row.row.id)}
  />
</div>
```

---

## PR 8 — UX / Skeleton / Empty States

### Summary
Skeleton loaders for grid, empty states for no rows/filtered results, better error toasts, improved scrolling.

### Frontend Changes (TODO)

#### Create Skeleton Component
**File:** `client/src/components/datavault/DataGridSkeleton.tsx`

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export function DataGridSkeleton({ columnCount = 5, rowCount = 10 }: { columnCount?: number; rowCount?: number }) {
  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex gap-2 p-2 bg-muted/50 rounded">
        {Array.from({ length: columnCount }).map((_, i) => (
          <Skeleton key={i} className="h-8 flex-1" />
        ))}
      </div>

      {/* Rows */}
      {Array.from({ length: rowCount }).map((_, i) => (
        <div key={i} className="flex gap-2 p-2">
          {Array.from({ length: columnCount }).map((_, j) => (
            <Skeleton key={j} className="h-10 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
```

#### Create Empty State Component
**File:** `client/src/components/datavault/DataGridEmptyState.tsx`

```tsx
import { Database, Filter, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  type: 'no_rows' | 'filtered_empty' | 'no_archived';
  onClearFilters?: () => void;
  onAddRow?: () => void;
}

export function DataGridEmptyState({ type, onClearFilters, onAddRow }: EmptyStateProps) {
  if (type === 'no_rows') {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Database className="w-16 h-16 text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium mb-2">No rows yet</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Get started by adding your first row to this table.
        </p>
        {onAddRow && (
          <Button onClick={onAddRow}>
            <Plus className="w-4 h-4 mr-2" />
            Add First Row
          </Button>
        )}
      </div>
    );
  }

  if (type === 'filtered_empty') {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Filter className="w-16 h-16 text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium mb-2">No results found</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Try adjusting your filters to see more results.
        </p>
        {onClearFilters && (
          <Button variant="outline" onClick={onClearFilters}>
            Clear Filters
          </Button>
        )}
      </div>
    );
  }

  if (type === 'no_archived') {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Archive className="w-16 h-16 text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium mb-2">No archived rows</h3>
        <p className="text-sm text-muted-foreground">
          Archived rows will appear here.
        </p>
      </div>
    );
  }

  return null;
}
```

#### Integrate into Table Page
```tsx
{isLoading && <DataGridSkeleton />}
{!isLoading && rows.length === 0 && filters.length === 0 && (
  <DataGridEmptyState type="no_rows" onAddRow={() => setRowEditorOpen(true)} />
)}
{!isLoading && rows.length === 0 && filters.length > 0 && (
  <DataGridEmptyState type="filtered_empty" onClearFilters={() => setFilters([])} />
)}
{!isLoading && showArchived && rows.length === 0 && (
  <DataGridEmptyState type="no_archived" />
)}
```

---

## PR 9 — Full Regression Tests

### Summary
Comprehensive test suite covering all v3 features.

### Test Files (TODO)

#### Unit Tests for Repository
**File:** `tests/unit/DatavaultRowsRepository.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { DatavaultRowsRepository } from '@/server/repositories/DatavaultRowsRepository';

describe('DatavaultRowsRepository', () => {
  let repo: DatavaultRowsRepository;

  beforeEach(() => {
    repo = new DatavaultRowsRepository();
  });

  describe('findByTableId with filters', () => {
    it('should exclude archived rows by default', async () => {
      // Test implementation
    });

    it('should include archived rows when showArchived=true', async () => {
      // Test implementation
    });

    it('should sort by column', async () => {
      // Test implementation
    });
  });

  describe('archiving', () => {
    it('should archive a row', async () => {
      // Test implementation
    });

    it('should unarchive a row', async () => {
      // Test implementation
    });

    it('should bulk archive multiple rows', async () => {
      // Test implementation
    });
  });

  describe('filtering', () => {
    it('should filter by text contains', async () => {
      // Test implementation
    });

    it('should filter by number greater than', async () => {
      // Test implementation
    });

    it('should filter by date range', async () => {
      // Test implementation
    });
  });
});
```

#### Integration Tests for API
**File:** `tests/integration/datavaultRows.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '@/server/app';

describe('DataVault Rows API', () => {
  describe('GET /api/datavault/tables/:tableId/rows', () => {
    it('should return filtered rows', async () => {
      const response = await request(app)
        .get('/api/datavault/tables/test-table-id/rows?filters=[{"columnId":"col1","operator":"equals","value":"test"}]')
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(200);
      expect(response.body.rows).toBeDefined();
    });

    it('should exclude archived rows by default', async () => {
      // Test implementation
    });
  });

  describe('PATCH /api/datavault/rows/:rowId/archive', () => {
    it('should archive a row', async () => {
      // Test implementation
    });
  });

  describe('PATCH /api/datavault/rows/bulk/archive', () => {
    it('should bulk archive rows', async () => {
      // Test implementation
    });
  });
});
```

#### E2E Tests with Playwright
**File:** `tests/e2e/datavault-filtering.spec.ts`

```ts
import { test, expect } from '@playwright/test';

test.describe('DataVault Filtering', () => {
  test('should add and apply a filter', async ({ page }) => {
    await page.goto('/datavault/tables/test-table-id');

    // Add filter
    await page.click('button:has-text("Add Filter")');
    await page.selectOption('select[name="columnId"]', 'name');
    await page.selectOption('select[name="operator"]', 'contains');
    await page.fill('input[name="value"]', 'test');

    // Verify filtered results
    await expect(page.locator('.data-grid-row')).toHaveCount(1);
  });

  test('should clear filters', async ({ page }) => {
    // Test implementation
  });
});
```

**File:** `tests/e2e/datavault-bulk-actions.spec.ts`

```ts
import { test, expect } from '@playwright/test';

test.describe('DataVault Bulk Actions', () => {
  test('should select multiple rows and bulk archive', async ({ page }) => {
    await page.goto('/datavault/tables/test-table-id');

    // Select rows
    await page.click('.row-checkbox:nth-child(1)');
    await page.click('.row-checkbox:nth-child(2)');

    // Bulk archive
    await page.click('button:has-text("Archive Selected")');

    // Verify archived
    await expect(page.locator('.data-grid-row')).toHaveCount(0);

    // Show archived
    await page.click('input#show-archived');
    await expect(page.locator('.data-grid-row')).toHaveCount(2);
  });
});
```

---

## Implementation Checklist

### Backend
- [x] Migration 0036 - Column descriptions
- [x] Migration 0037 - Column width
- [x] Migration 0038 - Row archiving
- [x] Schema updates (description, widthPx, deletedAt)
- [x] Repository: sorting and archiving methods
- [ ] Repository: advanced filtering method
- [ ] Service: archive/unarchive methods
- [ ] Service: bulk operations
- [ ] API: filter query params
- [ ] API: archive endpoints
- [ ] API: bulk endpoints

### Frontend
- [ ] ColumnManagerWithDnd: description field
- [ ] ColumnHeaderCell: description tooltip
- [ ] InfiniteDataGrid: column resizing
- [ ] FilterPanel component
- [ ] Zustand filter store
- [ ] Sort UI integration
- [ ] Show archived toggle
- [ ] Row actions menu
- [ ] Bulk selection state
- [ ] Bulk actions toolbar
- [ ] DataGridSkeleton component
- [ ] DataGridEmptyState component
- [ ] Integration of all UX components

### Tests
- [ ] Unit: Repository filtering tests
- [ ] Unit: Repository archiving tests
- [ ] Integration: API filter tests
- [ ] Integration: API bulk operations tests
- [ ] E2E: Filtering workflow
- [ ] E2E: Sorting workflow
- [ ] E2E: Archiving workflow
- [ ] E2E: Bulk actions workflow

---

## Next Steps

1. Apply migrations: `npx tsx scripts/applyMigrations.ts`
2. Implement all TODO sections marked above
3. Run tests: `npm test`
4. Manual QA testing in browser
5. Performance testing with large datasets (1000+ rows)
6. Deploy to staging
7. Production deployment

---

**Document Status:** Implementation Guide
**Last Updated:** 2025-11-19
**Maintainer:** Development Team
