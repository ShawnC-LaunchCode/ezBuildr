/**
 * ReferenceCell Component
 * Displays a reference to another table's row
 * Now uses batch data to avoid N+1 query problem
 */

import { Link2, Loader2 } from 'lucide-react';

import { useReferenceRow } from '@/hooks/useReferenceRow';
import type { DatavaultColumn } from '@/lib/types/datavault';

interface ReferenceCellProps {
  value: any;
  column: DatavaultColumn;
  batchData?: Record<string, { displayValue: string; row: any }>;
}

export function ReferenceCell({ value, column, batchData }: ReferenceCellProps) {
  const tableId = column.reference?.tableId;
  const rowId = value;
  const displayColumnSlug = column.reference?.displayColumnSlug;

  // Use batch data if available (preferred - fixes N+1 query problem)
  // Fall back to individual query for backward compatibility
  const shouldUseBatch = batchData !== undefined;

  const { data: refRow, isLoading, isError } = useReferenceRow(
    tableId,
    rowId,
    displayColumnSlug,
    { enabled: !shouldUseBatch } // Only fetch if batch data not available
  );

  // Handle empty/null value
  if (!rowId) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }

  // Use batch data if available
  if (shouldUseBatch) {
    const batchItem = batchData[rowId];

    if (!batchItem) {
      return (
        <span className="inline-flex items-center gap-1.5 text-destructive text-sm">
          <Link2 className="w-3 h-3" />
          <span>Not found</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 text-sm">
        <Link2 className="w-3 h-3 text-violet-500 opacity-70" />
        <span className="truncate">{batchItem.displayValue}</span>
      </span>
    );
  }

  // Fallback to individual query (backward compatibility)
  if (isLoading) {
    return (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground text-sm">
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>Loading...</span>
      </span>
    );
  }

  if (isError || !refRow) {
    return (
      <span className="inline-flex items-center gap-1.5 text-destructive text-sm">
        <Link2 className="w-3 h-3" />
        <span>Not found</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <Link2 className="w-3 h-3 text-violet-500 opacity-70" />
      <span className="truncate">{refRow.displayValue}</span>
    </span>
  );
}
