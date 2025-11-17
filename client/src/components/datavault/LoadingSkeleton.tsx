/**
 * LoadingSkeleton Component
 * Skeleton loading placeholders for DataVault tables
 */

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function TableCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <Skeleton className="h-6 w-3/4 mb-2" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-4 w-full mb-2" />
        <div className="flex gap-4 mt-4">
          <div className="flex-1">
            <Skeleton className="h-3 w-16 mb-1" />
            <Skeleton className="h-6 w-8" />
          </div>
          <div className="flex-1">
            <Skeleton className="h-3 w-16 mb-1" />
            <Skeleton className="h-6 w-8" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function TablesListSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <TableCardSkeleton key={i} />
      ))}
    </div>
  );
}
