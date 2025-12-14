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
  EyeOff,
  HelpCircle,
  ExternalLink,
  X,
  Database,
  Link as LinkIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AutoExpandTextarea } from "@/components/ui/auto-expand-textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LogicBuilder, LogicIndicator, LogicStatusText } from "@/components/logic";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { ConditionExpression } from "@shared/types/conditions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  useUpdateStep,
  useDeleteStep,
  useWorkflow,
  useWorkflowMode
} from "@/lib/vault-hooks";
import { useToast } from "@/hooks/use-toast";
import { useCollaboration, useBlockCollaborators } from "@/components/collab/CollaborationContext";
import { useIntake } from "../IntakeContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { OptionsEditor, type OptionItemData } from "./OptionsEditor";
import { JSQuestionEditor, type JSQuestionConfig } from "./JSQuestionEditor";
import type { ApiStep, StepType } from "@/lib/vault-api";

interface QuestionCardProps {
  step: ApiStep;
  sectionId: string;
  workflowId: string;
  isExpanded?: boolean;
  autoFocus?: boolean;
  onToggleExpand?: () => void;
  onEnterNext?: () => void;
}

const STEP_TYPE_OPTIONS: Array<{ value: StepType; label: string; advancedOnly?: boolean }> = [
  { value: "short_text", label: "Short Text" },
  { value: "long_text", label: "Long Text" },
  { value: "radio", label: "Radio (Single Choice)" },
  { value: "multiple_choice", label: "Multiple Choice" },
  { value: "yes_no", label: "Yes/No" },
  { value: "date_time", label: "Date/Time" },
  { value: "file_upload", label: "File Upload" },
  { value: "js_question", label: "JS Question (Advanced)", advancedOnly: true },
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
  workflowId,
  isExpanded = false,
  autoFocus = false,
  onToggleExpand,
  onEnterNext,
}: QuestionCardProps) {
  const updateStepMutation = useUpdateStep();
  const deleteStepMutation = useDeleteStep();
  const { toast } = useToast();
  const { data: modeData } = useWorkflowMode(workflowId);
  const mode = modeData?.mode || 'easy';
  const isEasyMode = mode === 'easy';
  const { data: workflow } = useWorkflow(workflowId);
  const isIntake = workflow?.intakeConfig?.isIntake;
  const { upstreamWorkflow, upstreamVariables, upstreamWorkflowId } = useIntake();

  // Intake Derived Values
  const isLinkedToIntake = !!step.defaultValue && typeof step.defaultValue === 'object' && step.defaultValue.source === 'intake';
  const linkedVariable = isLinkedToIntake ? upstreamVariables.find(v => v.alias === step.defaultValue.variable) : null;

  // Collaboration Hooks
  const { updateActiveBlock, user: currentUser } = useCollaboration();
  const { lockedBy, isLocked } = useBlockCollaborators(step.id);
  const isLockedByOther = isLocked && lockedBy?.userId !== currentUser?.id;

  const handleFocus = () => {
    if (!isLockedByOther) {
      updateActiveBlock(step.id);
    }
  };

  const handleBlur = (e: React.FocusEvent) => {
    // Check if new focus is still within this card
    if (e.relatedTarget && (e.relatedTarget as HTMLElement).closest(`[data-step-id="${step.id}"]`)) {
      return;
    }
    // Only clear if we were the one locking it
    if (!isLockedByOther) {
      updateActiveBlock(null);
    }
  };

  const titleInputRef = useRef<HTMLInputElement>(null);
  const [localRequired, setLocalRequired] = useState(step.required || false);
  const [localType, setLocalType] = useState<StepType>(step.type);
  const [isVisibilityOpen, setIsVisibilityOpen] = useState(false);
  const [localOptions, setLocalOptions] = useState<OptionItemData[]>(() => {
    if (step.type === "radio" || step.type === "multiple_choice") {
      const opts = step.options?.options || [];
      // Normalize to OptionItemData
      return opts.map((opt: any, idx: number) => {
        if (typeof opt === 'string') {
          return {
            id: `opt-${Date.now()}-${idx}`,
            label: opt,
            alias: opt.toLowerCase().replace(/\s+/g, '_')
          };
        }
        return opt;
      });
    }
    return [];
  });
  const [isGuidanceDismissed, setIsGuidanceDismissed] = useState(false);

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
      titleInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      titleInputRef.current.focus();
      // Don't select all text for new questions, just focus
      // titleInputRef.current.select(); 
    }
  }, [autoFocus]);

  // Sync local state when step prop changes
  useEffect(() => {
    setLocalRequired(step.required || false);
    setLocalType(step.type);
    if (step.type === "radio" || step.type === "multiple_choice") {
      const opts = step.options?.options || [];
      setLocalOptions(opts.map((opt: any, idx: number) => {
        if (typeof opt === 'string') {
          return {
            id: `opt-${Date.now()}-${idx}`,
            label: opt,
            alias: opt.toLowerCase().replace(/\s+/g, '_')
          };
        }
        return opt;
      }));
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

  const handleDefaultValueChange = (value: string) => {
    let parsedValue: string | boolean | number | null = value;

    if (step.type === 'yes_no') {
      parsedValue = value === 'yes' ? true : value === 'no' ? false : null;
    } else if (value === '') {
      parsedValue = null;
    }

    updateStepMutation.mutate({
      id: step.id,
      sectionId,
      defaultValue: parsedValue
    });
  };

  const handleIntakeLinkChange = (variableAlias: string) => {
    updateStepMutation.mutate({
      id: step.id,
      sectionId,
      defaultValue: variableAlias === 'none' ? null : { source: 'intake', variable: variableAlias }
    });
  };

  const handleTypeChange = (type: StepType) => {
    setLocalType(type);

    // Initialize type-specific options
    const updates: any = { id: step.id, sectionId, type };
    if (type === "radio" || type === "multiple_choice") {
      const defaultOptions: OptionItemData[] = [
        { id: 'opt-1', label: 'Option 1', alias: 'option_1' },
        { id: 'opt-2', label: 'Option 2', alias: 'option_2' },
        { id: 'opt-3', label: 'Option 3', alias: 'option_3' },
      ];
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

  const handleOptionsChange = (options: OptionItemData[]) => {
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

  const handleVisibilityChange = (expression: ConditionExpression) => {
    updateStepMutation.mutate(
      {
        id: step.id,
        sectionId,
        visibleIf: expression,
      },
      {
        onSuccess: () => {
          toast({
            title: "Visibility updated",
            description: "Question visibility conditions have been saved.",
          });
        },
        onError: (error) => {
          toast({
            title: "Error",
            description:
              error instanceof Error
                ? error.message
                : "Failed to save visibility conditions",
            variant: "destructive",
          });
        },
      }
    );
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
    <div ref={setNodeRef} style={style} data-step-id={step.id} onFocus={handleFocus} onBlur={handleBlur}>
      <Card className={cn("shadow-sm transition-all duration-300", isDragging && "opacity-50", isLockedByOther && "ring-2 ring-indigo-400/50 border-indigo-200")}>
        <CardContent className="p-3 relative">
          {/* Lock Overlay */}
          {isLockedByOther && (
            <>
              <div className="absolute top-2 right-12 z-20 flex items-center gap-2 bg-background/95 backdrop-blur px-2 py-1 rounded-full shadow-sm border border-indigo-100 animate-in fade-in zoom-in-95 duration-200">
                <span className="text-[10px] font-medium text-indigo-700">Edited by {lockedBy?.displayName}</span>
                <Avatar className="w-5 h-5 ring-1 ring-white">
                  <AvatarFallback style={{ backgroundColor: lockedBy?.color }} className="text-[9px] text-white">
                    {lockedBy?.displayName.charAt(0)}
                  </AvatarFallback>
                </Avatar>
              </div>
              {/* Interaction Blocker */}
              <div className="absolute inset-0 z-10 bg-white/20" />
            </>
          )}

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
              <div className="mt-2 relative">
                {getQuestionTypeIcon(localType)}
                {/* Show logic indicator when collapsed */}
                {!isExpanded && step.visibleIf && (
                  <div className="absolute -top-1 -right-1">
                    <LogicIndicator
                      visibleIf={step.visibleIf}
                      variant="icon"
                      size="sm"
                      elementType="question"
                    />
                  </div>
                )}
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
                  <div className="relative flex-1">
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
                      className={cn(
                        "font-medium text-sm transition-all duration-300",
                        step.title
                          ? "border-transparent hover:border-input focus:border-input"
                          : mode === 'easy' && !isGuidanceDismissed
                            ? "border-amber-300 bg-amber-50/30 focus-visible:ring-amber-400 placeholder:text-amber-500/50"
                            : "border-transparent hover:border-input focus:border-input"
                      )}
                      autoFocus={autoFocus && isExpanded}
                    />
                    {mode === 'easy' && !step.title && !isGuidanceDismissed && (
                      <div className="absolute top-full left-0 mt-1 z-10 flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-md shadow-sm animate-in slide-in-from-top-2">
                        <span className="text-[10px] text-amber-700 font-medium">Example: "What is your full name?"</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4 text-amber-600 hover:text-amber-800 hover:bg-amber-100"
                          onClick={(e) => { e.stopPropagation(); setIsGuidanceDismissed(true); }}
                        >
                          <span className="sr-only">Dismiss</span>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Intake Badge (Collapsed View) */}
              {!isExpanded && isLinkedToIntake && (
                <div className="flex items-center gap-1.5 text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full w-fit border border-emerald-100">
                  <Database className="w-3 h-3" />
                  <span>Linked to <strong>{upstreamWorkflow?.title}</strong> ({linkedVariable?.label || linkedVariable?.alias})</span>
                </div>
              )}

              {/* Expanded Content */}
              {isExpanded && (
                <div className="space-y-3 pt-1 border-t">
                  {/* Description - Moved specific to Easy Mode/Advanced flow logic below */}

                  {/* Type Selector - visible in Easy Mode now too, but maybe simplified? */}
                  {/* Per requirements: Question text -> Answer type -> Alias -> Required */}

                  {/* Alias / Save Answer As - Moved up for Easy Mode priority */}
                  <div className={cn(
                    "space-y-1.5 p-2 rounded-md transition-colors",
                    mode === 'easy' && !step.alias && "bg-amber-50/50 border border-amber-200/50"
                  )}>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium text-foreground">
                        {mode === 'easy' ? "Save answer as" : "Variable (alias)"}
                      </Label>
                      {mode === 'advanced' && (
                        <span className="text-xs text-muted-foreground">
                          Internal key: <code className="font-mono text-[10px]">{step.id.slice(0, 8)}...</code>
                        </span>
                      )}
                    </div>
                    <Input
                      value={step.alias || ""}
                      onChange={(e) => handleAliasChange(e.target.value)}
                      placeholder={mode === 'easy' ? "e.g. clientName or client.name" : "e.g., user_email, phone_number"}
                      className={cn(
                        "h-9 text-sm font-mono",
                        mode === 'easy' && !step.alias && "border-amber-300 focus-visible:ring-amber-400"
                      )}
                    />
                    {mode === 'easy' && (
                      <div className="animate-in fade-in slide-in-from-top-1 space-y-1">
                        {!step.alias ? (
                          <p className="text-[10px] text-amber-600 flex items-center gap-1">
                            <HelpCircle className="h-3 w-3" />
                            Used later to fill documents and make decisions.
                          </p>
                        ) : (
                          !/^[a-zA-Z0-9_.]+$/.test(step.alias) && (
                            <p className="text-[10px] text-amber-600 flex items-center gap-1">
                              ⚠️ Simple names are safest (a-z, 0-9, dots).
                            </p>
                          )
                        )}
                      </div>
                    )}
                  </div>

                  {/* Answer Settings */}
                  <div className="space-y-1.5 pt-2">

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

                    {/* Description / Help Text */}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        Description / Help Text (optional)
                      </Label>
                      <AutoExpandTextarea
                        value={step.description || ""}
                        onChange={(e) => handleDescriptionChange(e.target.value)}
                        placeholder="Add instructions for the user..."
                        minRows={1}
                        maxRows={4}
                        className="text-sm"
                      />
                    </div>

                    {/* Options Editor (for radio/multiple_choice) */}
                    {(localType === "radio" || localType === "multiple_choice") && (
                      <OptionsEditor
                        options={localOptions}
                        onChange={handleOptionsChange}
                      />
                    )}

                    {/* Default Value Section */}
                    {(mode === 'advanced' || upstreamWorkflowId) && (
                      <div className="space-y-1.5 pt-2 border-t border-dashed">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Label className="text-xs text-muted-foreground">
                              Default Value {mode === 'easy' && !upstreamWorkflowId && '(Advanced)'}
                            </Label>
                            {isLinkedToIntake && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1 gap-1 text-emerald-600 border-emerald-200 bg-emerald-50">
                                <LinkIcon className="w-2.5 h-2.5" />
                                Linked
                              </Badge>
                            )}
                          </div>
                        </div>

                        {upstreamWorkflowId ? (
                          <div className="space-y-2">
                            {/* Toggle: Static vs Intake */}
                            <Tabs
                              value={isLinkedToIntake ? "intake" : "static"}
                              onValueChange={(val) => {
                                if (val === 'static') handleDefaultValueChange(""); // Clear to static
                                // If switching to intake, user must select variable
                              }}
                              className="w-full"
                            >
                              <TabsList className="grid w-full grid-cols-2 h-7">
                                <TabsTrigger value="static" className="text-xs h-6">Static Value</TabsTrigger>
                                <TabsTrigger value="intake" className="text-xs h-6 flex items-center gap-1">
                                  <Database className="w-3 h-3" /> From Intake
                                </TabsTrigger>
                              </TabsList>

                              <TabsContent value="static" className="mt-2 space-y-1.5">
                                {step.type === "yes_no" ? (
                                  <Select
                                    value={
                                      step.defaultValue === null || step.defaultValue === undefined || typeof step.defaultValue === 'object'
                                        ? "none"
                                        : step.defaultValue === true
                                          ? "yes"
                                          : "no"
                                    }
                                    onValueChange={(value) => {
                                      if (value === "none") {
                                        handleDefaultValueChange("");
                                      } else {
                                        handleDefaultValueChange(value);
                                      }
                                    }}
                                  >
                                    <SelectTrigger className="h-9">
                                      <SelectValue placeholder="No default" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">No default</SelectItem>
                                      <SelectItem value="yes">Yes</SelectItem>
                                      <SelectItem value="no">No</SelectItem>
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <Input
                                    value={
                                      step.defaultValue === null || step.defaultValue === undefined || typeof step.defaultValue === 'object'
                                        ? ""
                                        : String(step.defaultValue)
                                    }
                                    onChange={(e) => handleDefaultValueChange(e.target.value)}
                                    placeholder="Enter default value..."
                                    className="h-9 text-sm"
                                  />
                                )}
                              </TabsContent>

                              <TabsContent value="intake" className="mt-2 text-primary-foreground">
                                <div className="space-y-1">
                                  <Select
                                    value={isLinkedToIntake && step.defaultValue?.variable ? step.defaultValue.variable : "none"}
                                    onValueChange={handleIntakeLinkChange}
                                  >
                                    <SelectTrigger className="h-9 w-full bg-emerald-50/50 border-emerald-200 text-emerald-900 focus:ring-emerald-500">
                                      <SelectValue placeholder="Select intake variable..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">-- Select Variable --</SelectItem>
                                      {upstreamVariables.map(v => (
                                        <SelectItem key={v.key} value={v.alias || v.key}>
                                          <div className="flex flex-col text-left">
                                            <span className="font-medium text-sm">{v.label}</span>
                                            <span className="text-[10px] text-muted-foreground font-mono">{v.alias || v.key}</span>
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  {isLinkedToIntake && (
                                    <p className="text-[10px] text-emerald-600 pl-1">
                                      This field will pre-fill from <strong>{upstreamWorkflow?.title}</strong> data.
                                    </p>
                                  )}
                                </div>
                              </TabsContent>
                            </Tabs>
                          </div>
                        ) : (
                          // Standard Static Default Value (No Upstream)
                          step.type === "yes_no" ? (
                            <Select
                              value={
                                step.defaultValue === null || step.defaultValue === undefined
                                  ? "none"
                                  : step.defaultValue === true
                                    ? "yes"
                                    : "no"
                              }
                              onValueChange={(value) => {
                                if (value === "none") {
                                  handleDefaultValueChange("");
                                } else {
                                  handleDefaultValueChange(value);
                                }
                              }}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="No default" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No default</SelectItem>
                                <SelectItem value="yes">Yes</SelectItem>
                                <SelectItem value="no">No</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              value={
                                step.defaultValue === null || step.defaultValue === undefined
                                  ? ""
                                  : typeof step.defaultValue === "object"
                                    ? JSON.stringify(step.defaultValue)
                                    : String(step.defaultValue)
                              }
                              onChange={(e) => handleDefaultValueChange(e.target.value)}
                              placeholder="Enter default value..."
                              className="h-9 text-sm"
                            />
                          )
                        )}
                      </div>
                    )}

                    {/* JS Question Editor (for js_question) */}
                    {localType === "js_question" && (
                      <JSQuestionEditor
                        config={localJsConfig}
                        onChange={handleJsConfigChange}
                      />
                    )}

                    {/* Visibility Logic Section - Advanced Mode Only */}
                    {mode === 'advanced' && (
                      <Collapsible
                        open={isVisibilityOpen}
                        onOpenChange={setIsVisibilityOpen}
                        className="border rounded-md"
                      >
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="ghost"
                            className="w-full justify-between px-3 py-2 h-auto"
                          >
                            <div className="flex items-center gap-2">
                              <EyeOff className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-medium">Visibility</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <LogicStatusText visibleIf={step.visibleIf} />
                              {isVisibilityOpen ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </div>
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="px-3 pb-3">
                          <LogicBuilder
                            workflowId={workflowId}
                            elementId={step.id}
                            elementType="step"
                            value={(step.visibleIf as ConditionExpression) || null}
                            onChange={handleVisibilityChange}
                            isSaving={updateStepMutation.isPending}
                          />
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Delete Button - Positioned Absolute for Tab Order (After inputs) */}
          <div className="absolute top-3 right-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:bg-destructive/10"
              onClick={handleDelete}
              tabIndex={0}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
