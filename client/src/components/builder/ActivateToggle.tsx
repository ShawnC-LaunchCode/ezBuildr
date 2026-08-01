/**
 * ActivateToggle - Toggle workflow between Draft and Active states
 * PR2: Workflow activation control
 */

import { Check, X } from "lucide-react";
import { useState } from "react";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { fetchAPI } from "@/lib/vault-api";
import { cn } from "@/lib/utils";

type WorkflowStatus = "draft" | "active" | "archived";

interface ActivateToggleProps {
  workflowId: string;
  currentStatus: WorkflowStatus;
  onStatusChange?: (newStatus: WorkflowStatus) => void;
  disabled?: boolean;
}

export function ActivateToggle({
  workflowId,
  currentStatus,
  onStatusChange,
  disabled = false,
}: ActivateToggleProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();

  const isActive = currentStatus === "active";

  const handleToggle = async () => {
    if (disabled) { return; }

    const newStatus: WorkflowStatus = isActive ? "draft" : "active";

    setIsUpdating(true);

    try {
      // Route through fetchAPI so an expired access token is transparently
      // refreshed and the request retried (a raw fetch here surfaced a
      // confusing generic 401 error after the token aged out mid-session).
      await fetchAPI(`/api/workflows/${workflowId}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus }),
      });

      onStatusChange?.(newStatus);

      toast({
        title: isActive ? "Workflow deactivated" : "Workflow activated",
        description: isActive
          ? "Workflow is now in Draft mode."
          : "Workflow is now Active and accessible.",
      });
    } catch (error) {
      console.error("Error updating workflow status:", error);
      // Surface the server's actual reason (e.g. "Cannot activate workflow:
      // <validation errors>") instead of a generic message.
      const description =
        error instanceof Error && error.message
          ? error.message
          : "Failed to update workflow status. Please try again.";
      toast({
        title: "Error",
        description,
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <Switch
          id="activate-toggle"
          checked={isActive}
          onCheckedChange={() => { void handleToggle(); }}
          disabled={disabled || isUpdating}
          className={cn(
            "data-[state=checked]:bg-green-600",
            isUpdating && "opacity-50 cursor-not-allowed"
          )}
        />
        <Label
          htmlFor="activate-toggle"
          className={cn(
            "text-sm font-medium cursor-pointer select-none",
            isActive ? "text-green-600" : "text-muted-foreground",
            (disabled || isUpdating) && "cursor-not-allowed opacity-50"
          )}
        >
          {isActive ? (
            <span className="flex items-center gap-1">
              <Check className="w-3 h-3" />
              Active
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <X className="w-3 h-3" />
              Draft
            </span>
          )}
        </Label>
      </div>
    </div>
  );
}
