/**
 * StatusPill - Status indicator for test runner
 * PR1: Basic implementation
 * PR5: Enhanced with all status states
 */

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { TestStatus } from "./types";

interface StatusPillProps {
  status: TestStatus;
}

const statusConfig: Record<TestStatus, { label: string; variant: string; className: string }> = {
  idle: {
    label: "Ready",
    variant: "secondary",
    className: "bg-gray-100 text-gray-700 hover:bg-gray-100"
  },
  validating: {
    label: "Validating...",
    variant: "default",
    className: "bg-blue-100 text-blue-700 hover:bg-blue-100"
  },
  rendering: {
    label: "Rendering...",
    variant: "default",
    className: "bg-purple-100 text-purple-700 hover:bg-purple-100"
  },
  success: {
    label: "Success",
    variant: "default",
    className: "bg-green-100 text-green-700 hover:bg-green-100"
  },
  error: {
    label: "Error",
    variant: "destructive",
    className: "bg-red-100 text-red-700 hover:bg-red-100"
  }
};

export function StatusPill({ status }: StatusPillProps) {
  const config = statusConfig[status];

  return (
    <Badge
      variant={config.variant as any}
      className={cn(config.className, "font-medium")}
    >
      {config.label}
    </Badge>
  );
}
