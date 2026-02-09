import { cn } from "@/lib/utils";

interface SkeletonListProps {
  count?: number;
  itemHeight?: string;
  showAvatar?: boolean;
  className?: string;
}

export function SkeletonList({
  count = 3,
  itemHeight = "h-20",
  showAvatar = false,
  className
}: SkeletonListProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn("flex items-center justify-between p-3 border border-border rounded-lg animate-pulse", itemHeight)}
        >
          <div className="flex items-center space-x-3 flex-1">
            {showAvatar && (
              <div className="w-8 h-8 bg-muted rounded-lg flex-shrink-0"></div>
            )}
            <div className="flex-1 min-w-0">
              <div className="h-4 bg-muted rounded w-32 mb-2"></div>
              <div className="h-3 bg-muted rounded w-24"></div>
            </div>
          </div>
          <div className="w-16 h-5 bg-muted rounded"></div>
        </div>
      ))}
    </div>
  );
}
