import { cn } from "@/lib/utils";

import type { LucideIcon } from "lucide-react";

interface ChartEmptyStateProps {
  icon: LucideIcon;
  message: string;
  height?: string;
  className?: string;
}

/**
 * ChartEmptyState - Shared component for consistent empty states in analytics charts
 *
 * @example
 * <ChartEmptyState
 *   icon={BarChart3}
 *   message="No analytics data available"
 *   height="h-96"
 * />
 */
export function ChartEmptyState({ icon: Icon, message, height = "h-64", className }: ChartEmptyStateProps) {
  return (
    <div className={cn("flex items-center justify-center text-muted-foreground", height, className)}>
      <div className="text-center">
        <Icon className="h-16 w-16 mb-4 opacity-50 mx-auto" aria-hidden="true" />
        <p>{message}</p>
      </div>
    </div>
  );
}
