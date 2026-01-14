import { LucideIcon } from "lucide-react";
import React, { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";

type ColorVariant = "primary" | "secondary" | "success" | "warning" | "destructive" | "accent";

interface StatCardProps {
  label: string;
  value: string | number | ReactNode;
  icon: LucideIcon;
  colorVariant?: ColorVariant;
  testId?: string;
}

const colorClasses: Record<ColorVariant, { bg: string; text: string }> = {
  primary: { bg: "bg-primary/10", text: "text-primary" },
  secondary: { bg: "bg-secondary/10", text: "text-secondary" },
  success: { bg: "bg-success/10", text: "text-success" },
  warning: { bg: "bg-warning/10", text: "text-warning" },
  destructive: { bg: "bg-destructive/10", text: "text-destructive" },
  accent: { bg: "bg-accent/10", text: "text-accent" },
};

export function StatCard({
  label,
  value,
  icon: Icon,
  colorVariant = "primary",
  testId
}: StatCardProps) {
  const colors = colorClasses[colorVariant];

  return (
    <Card data-testid={testId}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="text-2xl md:text-3xl font-bold text-foreground">
              {value}
            </p>
          </div>
          <div className={`w-12 h-12 ${colors.bg} rounded-lg flex items-center justify-center`}>
            <Icon className={`${colors.text} w-6 h-6`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
