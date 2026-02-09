import { cn } from "@/lib/utils";

interface SkeletonTableProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export function SkeletonTable({
  rows = 5,
  columns = 4,
  className
}: SkeletonTableProps) {
  return (
    <div className={cn("w-full", className)}>
      <div className="animate-pulse">
        {/* Table Header */}
        <div className="flex gap-4 p-4 border-b border-border">
          {Array.from({ length: columns }).map((_, i) => (
            <div key={`header-${i}`} className="flex-1">
              <div className="h-4 bg-muted rounded w-3/4"></div>
            </div>
          ))}
        </div>

        {/* Table Rows */}
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={`row-${rowIndex}`} className="flex gap-4 p-4 border-b border-border">
            {Array.from({ length: columns }).map((_, colIndex) => (
              <div key={`cell-${rowIndex}-${colIndex}`} className="flex-1">
                <div className="h-4 bg-muted rounded w-full"></div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
