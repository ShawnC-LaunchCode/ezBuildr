import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SkeletonCardProps {
  count?: number;
  height?: string;
  className?: string;
}

export function SkeletonCard({
  count = 1,
  height = "h-48",
  className
}: SkeletonCardProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className={cn(height, className)}>
          <CardContent className="p-6">
            <div className="animate-pulse">
              <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-muted rounded w-1/2 mb-4"></div>
              <div className="h-20 bg-muted rounded mb-4"></div>
              <div className="h-3 bg-muted rounded w-1/4"></div>
            </div>
          </CardContent>
        </Card>
      ))}
    </>
  );
}
