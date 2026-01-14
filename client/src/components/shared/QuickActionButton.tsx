import { ChevronRight, type LucideIcon } from "lucide-react";
import { Link } from "wouter";

import { Button } from "@/components/ui/button";

interface QuickActionButtonProps {
  href?: string;
  onClick?: () => void;
  icon: LucideIcon;
  iconColor?: string;
  iconBgColor?: string;
  label: string;
  testId?: string;
}

/**
 * QuickActionButton - Reusable button component for dashboard quick actions
 *
 * @example
 * <QuickActionButton
 *   href="/surveys/new"
 *   icon={Plus}
 *   iconColor="text-primary"
 *   iconBgColor="bg-primary/10"
 *   label="Create New Survey"
 *   testId="button-quick-create-survey"
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
  icon: Icon,
  iconColor = "text-primary",
  iconBgColor = "bg-primary/10",
  label,
  testId
}: QuickActionButtonProps) {
  const handleClick = () => {
    if (onClick) {
      onClick();
    }
  };

  const buttonContent = (
    <Button
      variant="ghost"
      className="w-full justify-between"
      data-testid={testId}
      onClick={handleClick}
    >
      <div className="flex items-center space-x-3">
        <div className={`w-8 h-8 ${iconBgColor} rounded-lg flex items-center justify-center`}>
          <Icon className={`h-4 w-4 ${iconColor}`} />
        </div>
        <span className="font-medium">{label}</span>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Button>
  );

  if (href) {
    return <Link href={href}>{buttonContent}</Link>;
  }

  return buttonContent;
}
