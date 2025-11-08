/**
 * Question Card Component
 * Expandable card for editing question (step) properties inline
 * Shows label, type, required, variable alias, internal key, and options editor
 */

import { useState, useEffect, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  FileText,
  ChevronDown,
  ChevronRight,
  Trash2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useUpdateStep, useDeleteStep } from "@/lib/vault-hooks";
import { useToast } from "@/hooks/use-toast";
import { OptionsEditor } from "./OptionsEditor";
import type { ApiStep, StepType } from "@/lib/vault-api";

interface QuestionCardProps {
  step: ApiStep;
  sectionId: string;
  isExpanded?: boolean;
  autoFocus?: boolean;
  onToggleExpand?: () => void;
  onEnterNext?: () => void;
}

const STEP_TYPE_OPTIONS: Array<{ value: StepType; label: string }> = [
  { value: "short_text", label: "Short Text" },
  { value: "long_text", label: "Long Text" },
  { value: "radio", label: "Radio (Single Choice)" },
  { value: "multiple_choice", label: "Multiple Choice" },
  { value: "yes_no", label: "Yes/No" },
  { value: "date_time", label: "Date/Time" },
  { value: "file_upload", label: "File Upload" },
];

export function QuestionCard({
  step,
  sectionId,
  isExpanded = false,
  autoFocus = false,
  onToggleExpand,
  onEnterNext,
}: QuestionCardProps) {
  const updateStepMutation = useUpdateStep();
  const deleteStepMutation = useDeleteStep();
  const { toast } = useToast();

  const titleInputRef = useRef<HTMLInputElement>(null);
  const [localTitle, setLocalTitle] = useState(step.title);
  const [localDescription, setLocalDescription] = useState(step.description || "");
  const [localRequired, setLocalRequired] = useState(step.required || false);
  const [localAlias, setLocalAlias] = useState(step.alias || "");
  const [localType, setLocalType] = useState<StepType>(step.type);
  const [localOptions, setLocalOptions] = useState<string[]>(
    step.type === "radio" || step.type === "multiple_choice"
      ? step.options?.options || []
      : []
  );

  // Debounce refs
  const titleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const descriptionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const aliasTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-focus on mount if requested
  useEffect(() => {
    if (autoFocus && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [autoFocus]);

  // Sync local state when step prop changes
  useEffect(() => {
    setLocalTitle(step.title);
    setLocalDescription(step.description || "");
    setLocalRequired(step.required || false);
    setLocalAlias(step.alias || "");
    setLocalType(step.type);
    if (step.type === "radio" || step.type === "multiple_choice") {
      setLocalOptions(step.options?.options || []);
    }
  }, [step]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (titleTimeoutRef.current) clearTimeout(titleTimeoutRef.current);
      if (descriptionTimeoutRef.current) clearTimeout(descriptionTimeoutRef.current);
      if (aliasTimeoutRef.current) clearTimeout(aliasTimeoutRef.current);
    };
  }, []);

  // Make sortable
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Debounced handlers
  const handleTitleChange = (value: string) => {
    setLocalTitle(value);
    if (titleTimeoutRef.current) clearTimeout(titleTimeoutRef.current);
    titleTimeoutRef.current = setTimeout(() => {
      updateStepMutation.mutate({ id: step.id, sectionId, title: value });
    }, 500);
  };

  const handleDescriptionChange = (value: string) => {
    setLocalDescription(value);
    if (descriptionTimeoutRef.current) clearTimeout(descriptionTimeoutRef.current);
    descriptionTimeoutRef.current = setTimeout(() => {
      updateStepMutation.mutate({ id: step.id, sectionId, description: value });
    }, 500);
  };

  const handleAliasChange = (value: string) => {
    setLocalAlias(value);
    if (aliasTimeoutRef.current) clearTimeout(aliasTimeoutRef.current);
    aliasTimeoutRef.current = setTimeout(() => {
      updateStepMutation.mutate(
        { id: step.id, sectionId, alias: value.trim() || null },
        {
          onError: (error: any) => {
            toast({
              title: "Error",
              description: error?.message || "Failed to update variable name",
              variant: "destructive",
            });
            setLocalAlias(step.alias || "");
          },
        }
      );
    }, 500);
  };

  const handleRequiredChange = (required: boolean) => {
    setLocalRequired(required);
    updateStepMutation.mutate({ id: step.id, sectionId, required });
  };

  const handleTypeChange = (type: StepType) => {
    setLocalType(type);

    // Initialize options for radio/multiple_choice
    const updates: any = { id: step.id, sectionId, type };
    if (type === "radio" || type === "multiple_choice") {
      const defaultOptions = ["Option 1", "Option 2", "Option 3"];
      updates.options = { options: defaultOptions };
      setLocalOptions(defaultOptions);
    } else {
      updates.options = null;
      setLocalOptions([]);
    }

    updateStepMutation.mutate(updates);
  };

  const handleOptionsChange = (options: string[]) => {
    setLocalOptions(options);
    updateStepMutation.mutate({
      id: step.id,
      sectionId,
      options: { options },
    });
  };

  const handleDelete = async () => {
    if (!confirm(`Delete question "${step.title}"?`)) return;

    try {
      await deleteStepMutation.mutateAsync({ id: step.id, sectionId });
      toast({
        title: "Question deleted",
        description: "Question removed from page",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete question",
        variant: "destructive",
      });
    }
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card className={cn("shadow-sm", isDragging && "opacity-50")}>
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            {/* Drag Handle */}
            <button
              className="cursor-grab active:cursor-grabbing p-1 hover:bg-accent rounded mt-1"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </button>

            {/* Icon */}
            <div className="mt-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 space-y-3">
              {/* Header Row - Title and Expand Toggle */}
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <Input
                    ref={titleInputRef}
                    value={localTitle}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.currentTarget.blur();
                        // Navigate to next item after debounce completes
                        setTimeout(() => onEnterNext?.(), 600);
                      }
                    }}
                    placeholder="Question text"
                    className="font-medium text-sm border-transparent hover:border-input focus:border-input"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={onToggleExpand}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={handleDelete}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="space-y-3 pt-1 border-t">
                  {/* Description */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Description (optional)
                    </Label>
                    <Textarea
                      value={localDescription}
                      onChange={(e) => handleDescriptionChange(e.target.value)}
                      placeholder="Add a description for this question..."
                      rows={2}
                      className="text-sm resize-none"
                    />
                  </div>

                  {/* Type Selector */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Question Type</Label>
                    <Select value={localType} onValueChange={handleTypeChange}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STEP_TYPE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Required Toggle */}
                  <div className="flex items-center justify-between py-1">
                    <Label htmlFor={`required-${step.id}`} className="text-sm cursor-pointer">
                      Required
                    </Label>
                    <Switch
                      id={`required-${step.id}`}
                      checked={localRequired}
                      onCheckedChange={handleRequiredChange}
                    />
                  </div>

                  {/* Variable Alias */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Variable (alias)
                    </Label>
                    <Input
                      value={localAlias}
                      onChange={(e) => handleAliasChange(e.target.value)}
                      placeholder="e.g., user_email, phone_number"
                      className="h-9 text-sm font-mono"
                    />
                    <p className="text-xs text-muted-foreground pl-1">
                      Internal key: <code className="font-mono">{step.id}</code>
                    </p>
                  </div>

                  {/* Options Editor (for radio/multiple_choice) */}
                  {(localType === "radio" || localType === "multiple_choice") && (
                    <OptionsEditor
                      options={localOptions}
                      onChange={handleOptionsChange}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
