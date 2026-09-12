/**
 * ActivateToggle - Compact Draft/Active status control for the builder toolbar.
 *
 * Replaces the former Switch + text label (~110px, and a `text-green-600`
 * label that measured 3.35:1 against the card — below the 4.5:1 AA floor for
 * 14px text). This is a single ~76px pill that keeps full `role="switch"`
 * semantics while carrying its meaning in the *word*, with the colour only
 * reinforcing it (WCAG 1.4.1), so the palette can stay dark enough to pass:
 * emerald-900 on emerald-50 is 9.1:1 light, 14:1 dark.
 */

import { useState } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
    if (disabled || isUpdating) { return; }

    const newStatus: WorkflowStatus = isActive ? "draft" : "active";

    setIsUpdating(true);

    try {
      // Route through fetchAPI so an expired access token is transparently
      // refreshed and the request retried (a raw fetch here surfaced a
      // confusing generic 401 error after the token aged out mid-session).
      const updated = await fetchAPI<{ publicUrl?: string }>(`/api/workflows/${workflowId}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus }),
      });

      onStatusChange?.(newStatus);

      // Activating turns on public access and mints the participant link, so
      // copy it here for the same reason the Review tab does — this toggle is
      // the other way a workflow gets published. Clipboard writes fail in
      // insecure contexts and when permission is denied, so the URL is shown
      // in the toast either way.
      const publicUrl = isActive ? undefined : updated.publicUrl;
      let copied = false;
      if (publicUrl) {
        try {
          await navigator.clipboard.writeText(publicUrl);
          copied = true;
        } catch {
          copied = false;
        }
      }

      toast({
        title: isActive
          ? "Workflow deactivated"
          : copied ? "Activated — link copied" : "Workflow activated",
        description: isActive
          ? "Workflow is now in Draft mode."
          : publicUrl
            ? (
              <span className="block">
                Share this participant link:{" "}
                <span className="font-mono break-all">{publicUrl}</span>
              </span>
            )
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
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          id="activate-toggle"
          role="switch"
          aria-checked={isActive}
          aria-label={
            isActive
              ? "Workflow is Active. Return it to Draft."
              : "Workflow is a Draft. Activate it."
          }
          disabled={disabled || isUpdating}
          onClick={() => { void handleToggle(); }}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5",
            "text-xs font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "disabled:cursor-not-allowed disabled:opacity-60",
            isActive
              ? "border-emerald-600 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 dark:border-emerald-500 dark:bg-emerald-950/60 dark:text-emerald-100 dark:hover:bg-emerald-900/60"
              : "border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "size-1.5 rounded-full transition-colors",
              isUpdating && "animate-pulse",
              isActive ? "bg-emerald-600 dark:bg-emerald-400" : "bg-muted-foreground/70",
            )}
          />
          {isActive ? "Active" : "Draft"}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {isActive
          ? "Active — participants can run this. Click to return to Draft."
          : "Draft — not yet runnable. Click to activate."}
      </TooltipContent>
    </Tooltip>
  );
}
