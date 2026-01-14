import { type LucideIcon } from "lucide-react";
import React from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  iconColor?: string;
  change?: string;
  changeLabel?: string;
  isLoading?: boolean;
}

export default function StatsCard({ 
  title, 
  value, 
  icon, 
  iconColor = "text-primary", 
  change, 
  changeLabel,
  isLoading = false 
}: StatsCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-16" />
            </div>
            <Skeleton className="h-12 w-12 rounded-lg" />
          </div>
          <div className="flex items-center mt-4">
            <Skeleton className="h-4 w-20" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid={`stats-card-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground" data-testid="text-stats-title">
              {title}
            </p>
            <p className="text-3xl font-bold text-foreground" data-testid="text-stats-value">
              {value}
            </p>
          </div>
          <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center" data-testid="icon-stats">
            {React.createElement(icon, { className: `h-6 w-6 ${iconColor}` })}
          </div>
        </div>
        {change && changeLabel && (
          <div className="flex items-center mt-4 text-sm">
            <span className="text-success font-medium" data-testid="text-stats-change">
              {change}
            </span>
            <span className="text-muted-foreground ml-1" data-testid="text-stats-change-label">
              {changeLabel}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
