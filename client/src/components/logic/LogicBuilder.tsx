/**
 * LogicBuilder - Main component for building visibility conditions
 *
 * This is the top-level component that provides:
 * - Toggle to enable/disable conditional visibility
 * - The condition group editor
 * - Human-readable preview of the logic
 * - Save/cancel actions
 */

import { Eye, EyeOff, AlertCircle, Info } from "lucide-react";
import React, { useState, useEffect, useMemo } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useWorkflowVariables } from "@/lib/vault-hooks";

import { describeConditionExpression } from "@shared/conditionEvaluator";
import {
  createInitialExpression,
  hasValidConditions,
  countConditions,
} from "@shared/types/conditions";
import type {
  ConditionExpression,
  ConditionGroup as ConditionGroupType,
  VariableInfo,
} from "@shared/types/conditions";

import { ConditionGroup } from "./ConditionGroup";

interface LogicBuilderProps {
  /** The workflow ID to fetch variables from */
  workflowId: string;
  /** The element ID (step or section) being edited - used to filter out self-references */
  elementId: string;
  /** Type of element being edited */
  elementType: "step" | "section";
  /** Current condition expression (null means always visible) */
  value: ConditionExpression;
  /** Callback when the expression changes */
  onChange: (expression: ConditionExpression) => void;
  /** Whether changes are being saved */
  isSaving?: boolean;
}

export function LogicBuilder({
  workflowId,
  elementId,
  elementType,
  value,
  onChange,
  isSaving = false,
}: LogicBuilderProps) {
  // Fetch workflow variables
  const { data: rawVariables, isLoading } = useWorkflowVariables(workflowId);

  // Local state for the expression being edited
  const [localExpression, setLocalExpression] = useState<ConditionGroupType | null>(
    value ? { ...value } : null
  );
  const [hasConditions, setHasConditions] = useState<boolean>(value !== null);

  // Update local state when value prop changes
  useEffect(() => {
    setLocalExpression(value ? { ...value } : null);
    setHasConditions(value !== null);
  }, [value]);

  // Convert raw variables to VariableInfo format
  const variables: VariableInfo[] = useMemo(() => {
    if (!rawVariables) {return [];}

    return rawVariables
      .filter((v) => v.key !== elementId) // Filter out self-references
      .map((v) => ({
        id: v.key,
        alias: v.alias ?? null,
        label: v.label,
        title: v.label,
        type: v.type as VariableInfo["type"],
        sectionId: v.sectionId,
        sectionTitle: v.sectionTitle,
        // TODO: Fetch choices for choice-based steps
        choices: undefined,
      }));
  }, [rawVariables, elementId]);

  // Generate human-readable description
  const description = useMemo(() => {
    if (!hasConditions || !localExpression) {
      return "Always visible";
    }

    // Build variable labels map
    const variableLabels: Record<string, string> = {};
    variables.forEach((v) => {
      variableLabels[v.id] = v.alias || v.title;
      if (v.alias) {
        variableLabels[v.alias] = v.alias;
      }
    });

    return describeConditionExpression(localExpression, variableLabels);
  }, [hasConditions, localExpression, variables]);

  // Toggle conditional visibility on/off
  const handleToggleConditions = (enabled: boolean) => {
    setHasConditions(enabled);
    if (enabled && !localExpression) {
      const initial = createInitialExpression();
      setLocalExpression(initial);
    }
    // If disabling, we'll keep the local expression in case user re-enables
  };

  // Handle expression change
  const handleExpressionChange = (updated: ConditionGroupType) => {
    setLocalExpression(updated);
  };

  // Apply changes
  const handleApply = () => {
    if (!hasConditions) {
      onChange(null);
    } else if (localExpression && hasValidConditions(localExpression)) {
      onChange(localExpression);
    } else {
      // No valid conditions - treat as always visible
      onChange(null);
    }
  };

  // Reset to original value
  const handleReset = () => {
    setLocalExpression(value ? { ...value } : null);
    setHasConditions(value !== null);
  };

  // Check if there are unsaved changes
  const hasChanges = useMemo(() => {
    if (hasConditions !== (value !== null)) {return true;}
    if (!hasConditions) {return false;}
    // Deep compare would be better, but for now just check if both exist
    return JSON.stringify(localExpression) !== JSON.stringify(value);
  }, [hasConditions, localExpression, value]);

  // Count conditions for display
  const conditionCount = localExpression ? countConditions(localExpression) : 0;

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-muted rounded w-1/3" />
          <div className="h-20 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (variables.length === 0) {
    return (
      <div className="p-4">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Add some questions to your workflow first to create visibility conditions.
            Conditions can reference values from other questions.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-full ${hasConditions ? "bg-primary/10" : "bg-muted"}`}>
            {hasConditions ? (
              <EyeOff className="h-4 w-4 text-primary" />
            ) : (
              <Eye className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div>
            <Label className="text-sm font-medium">
              Conditional Visibility
            </Label>
            <p className="text-xs text-muted-foreground">
              {hasConditions
                ? `Show this ${elementType} only when conditions are met`
                : `This ${elementType} is always visible`}
            </p>
          </div>
        </div>
        <Switch
          checked={hasConditions}
          onCheckedChange={handleToggleConditions}
        />
      </div>

      {/* Condition Editor */}
      {hasConditions && localExpression && (
        <>
          <Separator />

          <div className="space-y-4">
            {/* Condition Group */}
            <ConditionGroup
              group={localExpression}
              variables={variables}
              onChange={handleExpressionChange}
              isRoot
            />

            {/* Preview */}
            <div className="rounded-md bg-muted/50 p-3 border">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Preview</p>
                  <p className="text-sm">
                    Show this {elementType} if: <span className="font-medium">{description}</span>
                  </p>
                  {conditionCount > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {conditionCount} condition{conditionCount !== 1 ? "s" : ""}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Actions */}
      {hasChanges && (
        <>
          <Separator />
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={isSaving}
            >
              Reset
            </Button>
            <Button
              size="sm"
              onClick={handleApply}
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Apply Changes"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// Export all logic components
export { ConditionRow } from "./ConditionRow";
export { ConditionGroup } from "./ConditionGroup";
