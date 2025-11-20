/**
 * DataGrid Skeleton Component
 * Loading state for the data grid
 */

import { Skeleton } from "@/components/ui/skeleton";

interface DataGridSkeletonProps {
  rows?: number;
  columns?: number;
}

export function DataGridSkeleton({ rows = 10, columns = 5 }: DataGridSkeletonProps) {
  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header Row */}
      <div className="bg-muted border-b">
        <div className="flex items-center gap-4 p-4">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={`header-${i}`} className="h-6 flex-1" />
          ))}
        </div>
      </div>

      {/* Data Rows */}
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div key={`row-${rowIdx}`} className="flex items-center gap-4 p-4">
            {Array.from({ length: columns }).map((_, colIdx) => (
              <Skeleton
                key={`cell-${rowIdx}-${colIdx}`}
                className="h-5 flex-1"
                style={{
                  opacity: 1 - (rowIdx * 0.05), // Fade out effect
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
