import { Circle, CheckCircle2, AlertCircle, Archive, LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";


interface StatusBadgeProps {
  status: string;
  showIcon?: boolean;
  customLabels?: Record<string, string>;
  variant?: "default" | "secondary" | "destructive" | "outline";
  className?: string;
}

interface StatusConfig {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  icon: LucideIcon;
  className: string;
}

const statusConfigs: Record<string, StatusConfig> = {
  draft: {
    label: "Draft",
    variant: "secondary",
    icon: Circle,
    className: "bg-gray-100 text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300",
  },
  active: {
    label: "Active",
    variant: "default",
    icon: CheckCircle2,
    className: "bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400",
  },
  archived: {
    label: "Archived",
    variant: "outline",
    icon: Archive,
    className: "bg-gray-100 text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300",
  },
};

export function StatusBadge({
  status,
  showIcon = true,
  customLabels,
  variant: overrideVariant,
  className
}: StatusBadgeProps) {
  // Use custom label if provided
  const finalLabel = customLabels?.[status] ?? statusConfigs[status]?.label ?? status;

  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  const config = statusConfigs[status] || {
    label: finalLabel,
    variant: overrideVariant ?? "secondary" as const,
    icon: AlertCircle,
    className: "bg-gray-100 text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300",
  };

  const Icon = config.icon;
  const variantToUse = overrideVariant ?? config.variant;

  return (
    <Badge
      variant={variantToUse}
      className={cn(config.className, className)}
    >
      {showIcon && <Icon className="mr-1 h-3 w-3" aria-hidden="true" />}
      {finalLabel}
    </Badge>
  );
}
