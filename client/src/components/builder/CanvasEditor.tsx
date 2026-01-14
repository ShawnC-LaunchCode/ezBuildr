/**
 * Canvas Editor - Section/Step editor in center pane
 */

import { Workflow } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { UI_LABELS } from "@/lib/labels";
import { useSections, useSteps, useUpdateSection, useUpdateStep, useCreateStep } from "@/lib/vault-hooks";
import { useWorkflowBuilder } from "@/store/workflow-builder";

export function CanvasEditor({ workflowId }: { workflowId: string }) {
  const { selection, mode } = useWorkflowBuilder();
  const { data: sections } = useSections(workflowId);

  if (!selection) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-md">
          <Workflow className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Selection</h3>
          <p className="text-muted-foreground text-sm">
            Select a section or step from the sidebar to edit its properties
          </p>
        </div>
      </div>
    );
  }

  if (selection.type === "section") {
    const section = sections?.find((s) => s.id === selection.id);
    if (!section) {return null;}
    return <SectionCanvas section={section} workflowId={workflowId} />;
  }

  if (selection.type === "step") {
    // Find the step across all sections
    for (const section of sections || []) {
      const { data: steps } = useSteps(section.id);
      const step = steps?.find((s) => s.id === selection.id);
      if (step) {
        return <StepCanvas step={step} sectionId={section.id} />;
      }
    }
  }

  return null;
}

function SectionCanvas({ section, workflowId }: { section: any; workflowId: string }) {
  const updateMutation = useUpdateSection();

  const handleUpdate = (field: string, value: any) => {
    updateMutation.mutate({ id: section.id, workflowId, [field]: value });
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{UI_LABELS.PAGE_SETTINGS}</CardTitle>
          <CardDescription>Configure this page's properties</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="section-title">Title *</Label>
            <Input
              id="section-title"
              value={section.title}
              onChange={(e) => handleUpdate("title", e.target.value)}
              onBlur={() => { }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="section-description">Description</Label>
            <Textarea
              id="section-description"
              value={section.description || ""}
              onChange={(e) => handleUpdate("description", e.target.value)}
              rows={4}
              placeholder="Optional description for this page..."
            />
          </div>
        </CardContent>
      </Card>

      <StepEmptyState sectionId={section.id} />
    </div>
  );
}

function StepEmptyState({ sectionId }: { sectionId: string }) {
  const { data: steps } = useSteps(sectionId);
  const createStepMutation = useCreateStep();

  // Only show if no steps
  if (!steps || steps.length > 0) {return null;}

  const handleQuickAdd = async (type: string, title: string) => {
    await createStepMutation.mutateAsync({
      sectionId,
      type: type as any,
      title,
      description: null,
      required: false,
      alias: null,
      options: type === 'yes_no' ? null : null,
      order: 0,
      config: {},
    });
  };

  return (
    <Card className="border-dashed bg-muted/30">
      <CardContent className="py-12 flex flex-col items-center text-center">
        <div className="p-3 bg-background rounded-full mb-4 shadow-sm">
          <Workflow className="w-6 h-6 text-muted-foreground" />
        </div>
        <h3 className="font-semibold text-lg mb-1">Add your first question</h3>
        <p className="text-muted-foreground text-sm mb-6 max-w-sm">
          This page is empty. Choose a question type to get started.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <Button variant="outline" onClick={() => handleQuickAdd("short_text", "Client Name")}>
            Short Text
          </Button>
          <Button variant="outline" onClick={() => handleQuickAdd("yes_no", "Confirmation")}>
            Yes / No
          </Button>
          <Button variant="outline" onClick={() => handleQuickAdd("single_choice", "Select Option")}>
            Choice
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StepCanvas({ step, sectionId }: { step: any; sectionId: string }) {
  const { mode } = useWorkflowBuilder();
  const updateMutation = useUpdateStep();

  const handleUpdate = (field: string, value: any) => {
    updateMutation.mutate({ id: step.id, sectionId, [field]: value });
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Step Settings</CardTitle>
          <CardDescription>Configure this step's properties and behavior</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="step-title">Label *</Label>
            <Input
              id="step-title"
              value={step.title}
              onChange={(e) => handleUpdate("title", e.target.value)}
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="step-description">Description</Label>
            <Textarea
              id="step-description"
              value={step.description || ""}
              onChange={(e) => handleUpdate("description", e.target.value)}
              rows={3}
              placeholder="Help text shown to participants..."
            />
          </div>

          {/* Variable Alias */}
          <div className="space-y-2">
            <Label htmlFor="step-alias">Variable (alias)</Label>
            <Input
              id="step-alias"
              value={step.alias || ""}
              onChange={(e) => handleUpdate("alias", e.target.value || null)}
              placeholder="e.g., firstName, age, department"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Optional: A human-friendly name to reference this step's answer in logic and blocks
            </p>
          </div>

          {/* Type */}
          <div className="space-y-2">
            <Label htmlFor="step-type">Input Type</Label>
            <Select value={step.type} onValueChange={(v) => handleUpdate("type", v)}>
              <SelectTrigger id="step-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="short_text">Short Text</SelectItem>
                <SelectItem value="long_text">Long Text</SelectItem>
                <SelectItem value="radio">Radio (Single Choice)</SelectItem>
                <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                <SelectItem value="yes_no">Yes/No</SelectItem>
                <SelectItem value="date_time">Date/Time</SelectItem>
                <SelectItem value="file_upload">File Upload</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Required */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="step-required">Required</Label>
              <p className="text-sm text-muted-foreground">
                Participants must provide an answer
              </p>
            </div>
            <Switch
              id="step-required"
              checked={step.required}
              onCheckedChange={(v) => handleUpdate("required", v)}
            />
          </div>

          {/* Options for choice types */}
          {(step.type === "radio" || step.type === "multiple_choice") && (
            <div className="space-y-2">
              <Label>Options</Label>
              <OptionsEditor
                options={step.options?.options || []}
                onChange={(opts) => handleUpdate("options", { options: opts })}
              />
            </div>
          )}

          {/* Advanced Mode Fields */}
          {mode === "advanced" && (
            <div className="pt-4 border-t space-y-4">
              <h4 className="font-medium text-sm">Advanced</h4>
              <div className="space-y-2">
                <Label htmlFor="step-key" className="text-xs">
                  Variable Key (for formulas/logic)
                </Label>
                <Input
                  id="step-key"
                  value={step.id}
                  disabled
                  className="text-xs font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Use this ID in block configs to reference this step's value
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OptionsEditor({ options, onChange }: { options: string[]; onChange: (opts: string[]) => void }) {
  const handleAdd = () => {
    onChange([...options, `Option ${options.length + 1}`]);
  };

  const handleChange = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    onChange(newOptions);
  };

  const handleRemove = (index: number) => {
    onChange(options.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      {options.map((option, index) => (
        <div key={index} className="flex gap-2">
          <Input
            value={option}
            onChange={(e) => handleChange(index, e.target.value)}
            placeholder={`Option ${index + 1}`}
          />
          <Button variant="outline" size="icon" onClick={() => handleRemove(index)}>
            ×
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={handleAdd} className="w-full">
        Add Option
      </Button>
    </div>
  );
}
