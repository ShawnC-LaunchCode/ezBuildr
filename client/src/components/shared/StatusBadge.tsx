import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Circle, CheckCircle2, XCircle, AlertCircle, Archive } from "lucide-react";
import { LucideIcon } from "lucide-react";

export type SurveyStatus = "draft" | "open" | "closed" | "active" | "archived";

interface StatusBadgeProps {
  status: SurveyStatus | string;
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
  open: {
    label: "Open",
    variant: "default",
    icon: CheckCircle2,
    className: "bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400",
  },
  closed: {
    label: "Closed",
    variant: "destructive",
    icon: XCircle,
    className: "bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400",
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
      {showIcon && <Icon className="mr-1 h-3 w-3" />}
      {finalLabel}
    </Badge>
  );
}
