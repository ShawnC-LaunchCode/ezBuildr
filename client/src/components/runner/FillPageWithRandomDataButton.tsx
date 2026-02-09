/**
 * FillPageWithRandomDataButton - Fill current page with AI-generated random data
 * Only visible in preview mode, generates values for current section's visible steps
 */

import { Sparkles } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { aiAPI, runAPI, type AIStepData, type ApiStep } from "@/lib/vault-api";

interface FillPageWithRandomDataButtonProps {
  runId: string;
  currentSectionSteps: ApiStep[];
  onValuesFilled?: (values: Record<string, unknown>) => void;
  className?: string;
}

export function FillPageWithRandomDataButton({
  runId,
  currentSectionSteps,
  onValuesFilled,
  className,
}: FillPageWithRandomDataButtonProps) {
  const { toast } = useToast();
  const [isFilling, setIsFilling] = useState(false);

  const handleFillPage = async () => {
    if (!currentSectionSteps || currentSectionSteps.length === 0) {
      toast({
        title: "No Steps",
        description: "Current section has no steps to fill",
        variant: "destructive",
      });
      return;
    }

    setIsFilling(true);

    try {
      // Filter out virtual/computed steps (they're populated by transform blocks)
      const fillableSteps = currentSectionSteps.filter((step) => {
        // Skip virtual/computed steps
        if (step.type === 'computed') {
          return false;
        }

        // TODO: Respect visibility logic if available
        // For now, include all non-computed steps
        return true;
      });

      if (fillableSteps.length === 0) {
        toast({
          title: "No Fillable Steps",
          description: "Current section has no steps that can be filled",
          variant: "destructive",
        });
        setIsFilling(false);
        return;
      }

      // Build AIStepData array
      const stepData: AIStepData[] = fillableSteps.map((step) => ({
        key: step.alias || step.id,
        type: step.type,
        label: step.title,
        options: Array.isArray((step.config as any)?.options) ? ((step.config as any)?.options as string[]) : undefined,
        description: step.description || undefined,
      }));

      // Call AI to generate values
      const generatedValues = await aiAPI.suggestValues(stepData, 'partial');

      // Save values to run
      const savePromises = Object.entries(generatedValues).map(([key, value]) => {
        // Find the step by alias or id
        const step = fillableSteps.find((s) => s.alias === key || s.id === key);
        if (!step) {
          return null;
        }

        return runAPI.upsertValue(runId, step.id, value);
      }).filter(Boolean);

      await Promise.all(savePromises);

      // Notify parent component to update form values
      if (onValuesFilled) {
        onValuesFilled(generatedValues);
      }

      toast({
        title: "Page Filled",
        description: `Generated values for ${Object.keys(generatedValues).length} fields`,
      });
    } catch (error) {
      console.error("Failed to fill page:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      // Check if AI service is not configured
      if (errorMessage.includes("not configured") || errorMessage.includes("503")) {
        toast({
          title: "AI Service Not Available",
          description: "Please configure AI_API_KEY in environment variables",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: errorMessage || "Failed to generate random data",
          variant: "destructive",
        });
      }
    } finally {
      setIsFilling(false);
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            onClick={handleFillPage}
            disabled={isFilling}
            className={className}
          >
            <Sparkles className="w-3 h-3 mr-2" />
            {isFilling ? "Filling..." : "Fill This Page"}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Generate random data for visible fields on this page</p>
          <p className="text-xs text-muted-foreground">Requires AI_API_KEY configured</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
