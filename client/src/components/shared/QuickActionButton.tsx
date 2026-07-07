import { ChevronRight, type LucideIcon } from "lucide-react";
import { Link } from "wouter";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface QuickActionButtonProps {
  href?: string;
  onClick?: () => void;
  icon: LucideIcon;
  iconColor?: string;
  iconBgColor?: string;
  label: string;
  testId?: string;
  className?: string;
}

/**
 * QuickActionButton - Reusable button component for dashboard quick actions
 *
 * @example
 * <QuickActionButton
 *   href="/workflows/new"
 *   icon={Plus}
 *   iconColor="text-primary"
 *   iconBgColor="bg-primary/10"
 *   label="Create New Workflow"
 *   testId="button-quick-create-workflow"
 * />
 *
 * @example
 * <QuickActionButton
 *   onClick={handleExport}
 *   icon={Download}
 *   iconColor="text-warning"
 *   iconBgColor="bg-warning/10"
 *   label="Export Data"
 * />
 */
export function QuickActionButton({
  href,
  onClick,
  // eslint-disable-next-line @typescript-eslint/naming-convention
  icon: Icon,
  iconColor = "text-primary",
  iconBgColor = "bg-primary/10",
  label,
  testId,
  className
}: QuickActionButtonProps) {
  const handleClick = () => {
    if (onClick) {
      onClick();
    }
  };

  const buttonContent = (
    <Button
      variant="ghost"
      className={cn("w-full justify-between h-auto py-3", className)}
      data-testid={testId}
      onClick={handleClick}
    >
      <div className="flex items-center space-x-3">
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", iconBgColor)}>
          <Icon className={cn("h-4 w-4", iconColor)} aria-hidden="true" />
        </div>
        <span className="font-medium">{label}</span>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
    </Button>
  );

  if (href) {
    return <Link href={href}>{buttonContent}</Link>;
  }

  return buttonContent;
}
