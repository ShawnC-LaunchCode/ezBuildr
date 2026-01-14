/**
 * LogicIndicator - Compact badge showing visibility logic status
 *
 * Displays a visual indicator when an element has conditional visibility rules.
 * Can be used in compact (icon-only) or expanded (with count) modes.
 */

import { EyeOff, Eye } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { ConditionExpression } from "@shared/types/conditions";
import { countConditions } from "@shared/types/conditions";

interface LogicIndicatorProps {
  /** The condition expression (null means always visible) */
  visibleIf: ConditionExpression | null | undefined;
  /** Display variant */
  variant?: "badge" | "icon" | "compact";
  /** Size of the indicator */
  size?: "sm" | "md";
  /** Additional class names */
  className?: string;
  /** Element type for tooltip text */
  elementType?: "section" | "question" | "page";
}

export function LogicIndicator({
  visibleIf,
  variant = "badge",
  size = "sm",
  className,
  elementType = "question",
}: LogicIndicatorProps) {
  // Don't show anything if no conditions are set
  if (!visibleIf) {
    return null;
  }

  const conditionCount = countConditions(visibleIf);

  // Don't show if somehow we have an expression with 0 conditions
  if (conditionCount === 0) {
    return null;
  }

  const tooltipText = `This ${elementType} has ${conditionCount} visibility condition${conditionCount !== 1 ? "s" : ""}`;

  const iconSize = size === "sm" ? "h-3 w-3" : "h-4 w-4";

  if (variant === "icon") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn("inline-flex items-center text-amber-500", className)}>
              <EyeOff className={iconSize} />
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{tooltipText}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (variant === "compact") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn(
              "inline-flex items-center gap-0.5 text-amber-500",
              size === "sm" ? "text-xs" : "text-sm",
              className
            )}>
              <EyeOff className={iconSize} />
              <span className="font-medium">{conditionCount}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{tooltipText}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Default badge variant
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="secondary"
            className={cn(
              "gap-1 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-amber-500/20",
              size === "sm" ? "text-xs px-1.5 py-0" : "text-sm px-2 py-0.5",
              className
            )}
          >
            <EyeOff className={iconSize} />
            <span>{conditionCount}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Simple text indicator for inline use
 */
export function LogicStatusText({
  visibleIf,
  className,
}: {
  visibleIf: ConditionExpression | null | undefined;
  className?: string;
}) {
  if (!visibleIf) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>
        Always visible
      </span>
    );
  }

  const conditionCount = countConditions(visibleIf);

  return (
    <span className={cn("text-xs text-amber-600 font-medium", className)}>
      Conditional ({conditionCount} rule{conditionCount !== 1 ? "s" : ""})
    </span>
  );
}
