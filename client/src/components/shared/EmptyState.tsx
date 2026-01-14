import { LucideIcon } from "lucide-react";
import React, { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string | ReactNode;
  action?: ReactNode;
  fullPage?: boolean;
  iconColor?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  fullPage = false,
  iconColor = "text-muted-foreground"
}: EmptyStateProps) {
  const content = (
    <Card className="w-full max-w-md mx-4">
      <CardContent className="pt-6 text-center">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
          <Icon className={`${iconColor} h-8 w-8`} />
        </div>
        <h3 className="text-lg font-medium text-foreground mb-2">{title}</h3>
        <p className="text-muted-foreground mb-4">{description}</p>
        {action && <div className="mt-4">{action}</div>}
      </CardContent>
    </Card>
  );

  if (fullPage) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        {content}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-12">
      {content}
    </div>
  );
}
