import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string | ReactNode;
  action?: ReactNode;
  fullPage?: boolean;
  iconColor?: string;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  fullPage = false,
  iconColor = "text-muted-foreground",
  className
}: EmptyStateProps) {
  const content = (
    <Card className="w-full max-w-md mx-4">
      <CardContent className="pt-6 text-center">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
          <Icon className={cn("h-8 w-8", iconColor)} aria-hidden="true" />
        </div>
        <h3 className="text-lg font-medium text-foreground mb-2">{title}</h3>
        <p className="text-muted-foreground mb-4">{description}</p>
        {action && <div className="mt-4">{action}</div>}
      </CardContent>
    </Card>
  );

  if (fullPage) {
    return (
      <div className={cn("min-h-screen bg-background flex items-center justify-center", className)}>
        {content}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center justify-center py-12", className)}>
      {content}
    </div>
  );
}
