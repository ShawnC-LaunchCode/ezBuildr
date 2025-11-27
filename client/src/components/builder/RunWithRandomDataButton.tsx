/**
 * RunWithRandomDataButton - Create a run with AI-generated random test data
 * Uses AI service to generate plausible values for the entire workflow
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { runAPI } from "@/lib/vault-api";
import { usePreviewStore } from "@/store/preview";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface RunWithRandomDataButtonProps {
  workflowId: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export function RunWithRandomDataButton({
  workflowId,
  variant = "secondary",
  size = "default",
  className,
}: RunWithRandomDataButtonProps) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const setPreviewToken = usePreviewStore((s) => s.setToken);
  const [isCreating, setIsCreating] = useState(false);

  const handleClick = async () => {
    setIsCreating(true);

    try {
      // Create run with randomize flag
      const result = await runAPI.create(workflowId, { randomize: true });
      const { runId, runToken } = result.data;

      // Store run token for preview using preview store
      setPreviewToken(runId, runToken);

      toast({
        title: "Random Data Generated",
        description: "Preview started with AI-generated test data",
      });

      // Navigate to preview
      setLocation(`/preview/${runId}`);
    } catch (error: any) {
      console.error("Failed to create random run:", error);

      // Check if AI service is not configured
      if (error.message?.includes("not configured") || error.message?.includes("503")) {
        toast({
          title: "AI Service Not Available",
          description: "Please configure AI_API_KEY in environment variables",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to generate random data",
          variant: "destructive",
        });
      }
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={variant}
            size={size}
            onClick={handleClick}
            disabled={isCreating}
            className={className}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            {isCreating ? "Generating..." : "Run with Random Data"}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Generate AI-powered test data and start preview</p>
          <p className="text-xs text-muted-foreground">Requires AI_API_KEY configured</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
