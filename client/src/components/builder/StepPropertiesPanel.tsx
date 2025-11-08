/**
 * Step Properties Panel
 * Displays and allows editing of step properties when a step is selected
 */

import { useState, useEffect } from "react";
import { Plus, X, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { useStep, useUpdateStep } from "@/lib/vault-hooks";
import { useToast } from "@/hooks/use-toast";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface StepPropertiesPanelProps {
  stepId: string;
  sectionId?: string;
}

type DateTimeType = "date" | "time" | "datetime";
type TextType = "short" | "long";

export function StepPropertiesPanel({ stepId, sectionId: propSectionId }: StepPropertiesPanelProps) {
  const { data: step } = useStep(stepId);
  const updateStepMutation = useUpdateStep();
  const { toast } = useToast();

  // Get sectionId from prop or from the step data
  const sectionId = propSectionId || step?.sectionId || "";

  const [localDescription, setLocalDescription] = useState("");
  const [localRequired, setLocalRequired] = useState(false);
  const [localOptions, setLocalOptions] = useState<string[]>([]);
  const [dateTimeType, setDateTimeType] = useState<DateTimeType>("datetime");
  const [textType, setTextType] = useState<TextType>("short");

  // Initialize local state from step data
  useEffect(() => {
    if (step) {
      setLocalDescription(step.description || "");
      setLocalRequired(step.required || false);

      // Initialize options for radio/multiple_choice
      if ((step.type === "radio" || step.type === "multiple_choice") && step.options?.options) {
        setLocalOptions(step.options.options);
      }

      // Initialize date/time type
      if (step.type === "date_time" && step.options?.dateTimeType) {
        setDateTimeType(step.options.dateTimeType);
      }

      // Initialize text type from step type
      if (step.type === "short_text") {
        setTextType("short");
      } else if (step.type === "long_text") {
        setTextType("long");
      }
    }
  }, [step]);

  if (!step) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const handleDescriptionChange = (description: string) => {
    setLocalDescription(description);
    updateStepMutation.mutate({ id: stepId, sectionId, description });
  };

  const handleRequiredChange = (required: boolean) => {
    setLocalRequired(required);
    updateStepMutation.mutate({ id: stepId, sectionId, required });
  };

  const handleOptionsChange = (options: string[]) => {
    setLocalOptions(options);
    updateStepMutation.mutate({
      id: stepId,
      sectionId,
      options: { options },
    });
  };

  const handleAddOption = () => {
    const newOptions = [...localOptions, `Option ${localOptions.length + 1}`];
    handleOptionsChange(newOptions);
  };

  const handleRemoveOption = (index: number) => {
    const newOptions = localOptions.filter((_, i) => i !== index);
    handleOptionsChange(newOptions);
  };

  const handleOptionTextChange = (index: number, text: string) => {
    const newOptions = [...localOptions];
    newOptions[index] = text;
    setLocalOptions(newOptions);
  };

  const handleOptionTextBlur = () => {
    handleOptionsChange(localOptions);
  };

  const handleReorderOptions = (oldIndex: number, newIndex: number) => {
    const newOptions = arrayMove(localOptions, oldIndex, newIndex);
    handleOptionsChange(newOptions);
  };

  const handleDateTimeTypeChange = (type: DateTimeType) => {
    setDateTimeType(type);
    updateStepMutation.mutate({
      id: stepId,
      sectionId,
      options: { dateTimeType: type },
    });
  };

  const handleTextTypeChange = (type: TextType) => {
    setTextType(type);
    // Update the step type itself
    const newType = type === "short" ? "short_text" : "long_text";
    updateStepMutation.mutate({
      id: stepId,
      sectionId,
      type: newType,
    });
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = localOptions.findIndex((_, i) => i.toString() === active.id);
      const newIndex = localOptions.findIndex((_, i) => i.toString() === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        handleReorderOptions(oldIndex, newIndex);
      }
    }
  };

  return (
    <div className="p-4 space-y-6">
      <div>
        <h3 className="font-semibold mb-1">{step.title}</h3>
        <p className="text-xs text-muted-foreground">
          {step.type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
        </p>
      </div>

      <Separator />

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={localDescription}
          onChange={(e) => handleDescriptionChange(e.target.value)}
          placeholder="Add a description for this question..."
          rows={3}
        />
      </div>

      {/* Required toggle */}
      <div className="flex items-center justify-between">
        <Label htmlFor="required">Required</Label>
        <Switch
          id="required"
          checked={localRequired}
          onCheckedChange={handleRequiredChange}
        />
      </div>

      {/* Text Type Toggle (for short_text and long_text) */}
      {(step.type === "short_text" || step.type === "long_text") && (
        <>
          <Separator />
          <div className="space-y-3">
            <Label>Input Type</Label>
            <RadioGroup value={textType} onValueChange={(v) => handleTextTypeChange(v as TextType)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="short" id="text-short" />
                <Label htmlFor="text-short" className="font-normal cursor-pointer">
                  Short Text (Single line)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="long" id="text-long" />
                <Label htmlFor="text-long" className="font-normal cursor-pointer">
                  Long Text (Multi-line)
                </Label>
              </div>
            </RadioGroup>
          </div>
        </>
      )}

      {/* Date/Time Type Selector */}
      {step.type === "date_time" && (
        <>
          <Separator />
          <div className="space-y-3">
            <Label>Date/Time Type</Label>
            <RadioGroup value={dateTimeType} onValueChange={(v) => handleDateTimeTypeChange(v as DateTimeType)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="date" id="dt-date" />
                <Label htmlFor="dt-date" className="font-normal cursor-pointer">
                  Date Only
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="time" id="dt-time" />
                <Label htmlFor="dt-time" className="font-normal cursor-pointer">
                  Time Only
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="datetime" id="dt-datetime" />
                <Label htmlFor="dt-datetime" className="font-normal cursor-pointer">
                  Date and Time
                </Label>
              </div>
            </RadioGroup>
          </div>
        </>
      )}

      {/* Options Editor (for radio and multiple_choice) */}
      {(step.type === "radio" || step.type === "multiple_choice") && (
        <>
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Options</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddOption}
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Option
              </Button>
            </div>

            {localOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No options yet. Click "Add Option" to create one.</p>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={localOptions.map((_, i) => i.toString())}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {localOptions.map((option, index) => (
                      <OptionItem
                        key={index}
                        id={index.toString()}
                        option={option}
                        index={index}
                        onChange={(text) => handleOptionTextChange(index, text)}
                        onBlur={handleOptionTextBlur}
                        onRemove={() => handleRemoveOption(index)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </>
      )}
    </div>
  );
}

interface OptionItemProps {
  id: string;
  option: string;
  index: number;
  onChange: (text: string) => void;
  onBlur: () => void;
  onRemove: () => void;
}

function OptionItem({ id, option, index, onChange, onBlur, onRemove }: OptionItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 p-2 rounded-md border bg-background ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <button
        className="cursor-grab active:cursor-grabbing p-1"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>

      <span className="text-sm text-muted-foreground w-6">{index + 1}.</span>

      <Input
        value={option}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className="flex-1"
        placeholder={`Option ${index + 1}`}
      />

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onRemove}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
