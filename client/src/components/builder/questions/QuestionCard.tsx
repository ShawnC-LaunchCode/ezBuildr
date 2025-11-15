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
  Type,
  AlignLeft,
  Circle,
  CheckSquare,
  ToggleLeft,
  Calendar,
  Upload,
  Zap,
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
import { JSQuestionEditor, type JSQuestionConfig } from "./JSQuestionEditor";
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
  { value: "js_question", label: "JS Question" },
];

// Get icon for each question type
function getQuestionTypeIcon(type: StepType) {
  switch (type) {
    case "short_text":
      return <Type className="h-4 w-4 text-muted-foreground" />;
    case "long_text":
      return <AlignLeft className="h-4 w-4 text-muted-foreground" />;
    case "radio":
      return <Circle className="h-4 w-4 text-muted-foreground" />;
    case "multiple_choice":
      return <CheckSquare className="h-4 w-4 text-muted-foreground" />;
    case "yes_no":
      return <ToggleLeft className="h-4 w-4 text-muted-foreground" />;
    case "date_time":
      return <Calendar className="h-4 w-4 text-muted-foreground" />;
    case "file_upload":
      return <Upload className="h-4 w-4 text-muted-foreground" />;
    case "js_question":
      return <Zap className="h-4 w-4 text-yellow-500" />;
    default:
      return <FileText className="h-4 w-4 text-muted-foreground" />;
  }
}

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
  const [localRequired, setLocalRequired] = useState(step.required || false);
  const [localType, setLocalType] = useState<StepType>(step.type);
  const [localOptions, setLocalOptions] = useState<string[]>(
    step.type === "radio" || step.type === "multiple_choice"
      ? step.options?.options || []
      : []
  );
  const [localJsConfig, setLocalJsConfig] = useState<JSQuestionConfig>(
    step.type === "js_question" && step.options
      ? (step.options as JSQuestionConfig)
      : {
          display: "hidden",
          code: "return input;",
          inputKeys: [],
          outputKey: "computed_value",
          timeoutMs: 1000,
          helpText: "",
        }
  );

  // Auto-focus on mount if requested
  useEffect(() => {
    if (autoFocus && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [autoFocus]);

  // Sync local state when step prop changes
  useEffect(() => {
    setLocalRequired(step.required || false);
    setLocalType(step.type);
    if (step.type === "radio" || step.type === "multiple_choice") {
      setLocalOptions(step.options?.options || []);
    }
  }, [step]);

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

  // Immediate update handlers with optimistic rendering
  const handleTitleChange = (value: string) => {
    updateStepMutation.mutate({ id: step.id, sectionId, title: value });
  };

  const handleDescriptionChange = (value: string) => {
    updateStepMutation.mutate({ id: step.id, sectionId, description: value });
  };

  const handleAliasChange = (value: string) => {
    updateStepMutation.mutate(
      { id: step.id, sectionId, alias: value.trim() || null },
      {
        onError: (error: any) => {
          toast({
            title: "Error",
            description: error?.message || "Failed to update variable name",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleRequiredChange = (required: boolean) => {
    setLocalRequired(required);
    updateStepMutation.mutate({ id: step.id, sectionId, required });
  };

  const handleTypeChange = (type: StepType) => {
    setLocalType(type);

    // Initialize type-specific options
    const updates: any = { id: step.id, sectionId, type };
    if (type === "radio" || type === "multiple_choice") {
      const defaultOptions = ["Option 1", "Option 2", "Option 3"];
      updates.options = { options: defaultOptions };
      setLocalOptions(defaultOptions);
    } else if (type === "js_question") {
      const defaultConfig: JSQuestionConfig = {
        display: "hidden",
        code: "return input;",
        inputKeys: [],
        outputKey: "computed_value",
        timeoutMs: 1000,
        helpText: "",
      };
      updates.options = defaultConfig;
      setLocalJsConfig(defaultConfig);
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

  const handleJsConfigChange = (config: JSQuestionConfig) => {
    setLocalJsConfig(config);
    updateStepMutation.mutate({
      id: step.id,
      sectionId,
      options: config,
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

            {/* Icon and Collapse Button (stacked vertically) */}
            <div className="flex flex-col items-center gap-1">
              <div className="mt-2">
                {getQuestionTypeIcon(localType)}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={onToggleExpand}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </Button>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 space-y-3">
              {/* Header Row - Title and Delete */}
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <Input
                    ref={titleInputRef}
                    value={step.title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.currentTarget.blur();
                        onEnterNext?.();
                      }
                    }}
                    placeholder="Question text"
                    className="font-medium text-sm border-transparent hover:border-input focus:border-input"
                  />
                </div>
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
                      value={step.description || ""}
                      onChange={(e) => handleDescriptionChange(e.target.value)}
                      placeholder="Add a description for this question..."
                      rows={2}
                      className="text-sm resize-none"
                    />
                  </div>

                  {/* Type Selector - Toggle for text types (short/long) */}
                  {(localType === "short_text" || localType === "long_text") && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Question Type</Label>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant={localType === "short_text" ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleTypeChange("short_text")}
                          className="flex-1"
                        >
                          <Type className="h-3 w-3 mr-1" />
                          Short Text
                        </Button>
                        <Button
                          type="button"
                          variant={localType === "long_text" ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleTypeChange("long_text")}
                          className="flex-1"
                        >
                          <AlignLeft className="h-3 w-3 mr-1" />
                          Long Text
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Type Selector - Toggle for choice types (radio/multiple) */}
                  {(localType === "radio" || localType === "multiple_choice") && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Question Type</Label>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant={localType === "radio" ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleTypeChange("radio")}
                          className="flex-1"
                        >
                          <Circle className="h-3 w-3 mr-1" />
                          Radio
                        </Button>
                        <Button
                          type="button"
                          variant={localType === "multiple_choice" ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleTypeChange("multiple_choice")}
                          className="flex-1"
                        >
                          <CheckSquare className="h-3 w-3 mr-1" />
                          Multiple Choice
                        </Button>
                      </div>
                    </div>
                  )}

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
                      value={step.alias || ""}
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

                  {/* JS Question Editor (for js_question) */}
                  {localType === "js_question" && (
                    <JSQuestionEditor
                      config={localJsConfig}
                      onChange={handleJsConfigChange}
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
