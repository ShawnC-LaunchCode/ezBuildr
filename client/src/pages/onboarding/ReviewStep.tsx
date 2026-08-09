import { AlertTriangle, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

import { ONBOARDING_STEP_TYPE_OPTIONS } from "./stepTypeOptions";

import type { OnboardingVariable } from "./onboardingTypes";

export interface GenerationError {
  message: string;
  retryable: boolean;
}

export interface ReviewStepProps {
  variables: OnboardingVariable[];
  projects: Array<{ id: string; title: string }>;
  projectId: string;
  onProjectChange: (projectId: string) => void;
  onApprove: (payload: { projectId: string; variables: OnboardingVariable[] }) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  error: GenerationError | null;
  onRetry: () => void;
}

/**
 * Step 3 of the onboarding wizard: review and edit each extracted
 * variable's question type and alias before anything is generated or
 * persisted (AC2). Nothing here calls the network — `onApprove` hands the
 * edited rows up to the wizard, which owns the generate/persist pipeline.
 */
export function ReviewStep({
  variables: initialVariables,
  projects,
  projectId,
  onProjectChange,
  onApprove,
  onCancel,
  isSubmitting,
  error,
  onRetry,
}: ReviewStepProps): JSX.Element {
  const [variables, setVariables] = useState<OnboardingVariable[]>(initialVariables);

  const updateVariable = (index: number, patch: Partial<OnboardingVariable>): void => {
    setVariables((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  };

  const canApprove = projectId !== "" && variables.length > 0 && !isSubmitting;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Review &amp; approve</h2>
        <p className="text-sm text-muted-foreground">
          Edit the question type or alias for anything the extraction got wrong. Nothing is created
          until you approve.
        </p>
      </div>

      <div className="max-w-xs space-y-1.5">
        <Label htmlFor="onboarding-project">Project</Label>
        <Select value={projectId} onValueChange={onProjectChange}>
          <SelectTrigger id="onboarding-project">
            <SelectValue placeholder="Choose a project" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Extracted field</TableHead>
              <TableHead>Question type</TableHead>
              <TableHead>Alias</TableHead>
              <TableHead className="text-right">Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {variables.map((variable, index) => (
              <TableRow key={`${variable.name}-${index}`}>
                <TableCell className="font-medium">{variable.label}</TableCell>
                <TableCell>
                  <Label htmlFor={`onboarding-type-${index}`} className="sr-only">
                    Question type for {variable.label}
                  </Label>
                  <Select
                    value={variable.type}
                    onValueChange={(value) => updateVariable(index, { type: value })}
                  >
                    <SelectTrigger id={`onboarding-type-${index}`} className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ONBOARDING_STEP_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Label htmlFor={`onboarding-alias-${index}`} className="sr-only">
                    Alias for {variable.label}
                  </Label>
                  <Input
                    id={`onboarding-alias-${index}`}
                    value={variable.alias}
                    onChange={(e) => updateVariable(index, { alias: e.target.value })}
                    maxLength={200}
                    className="w-44"
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant={variable.source === "explicit_tag" ? "default" : "secondary"}>
                    {variable.source === "explicit_tag" ? "Tagged" : "AI-inferred"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {error !== null && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Workflow generation failed</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{error.message}</p>
            {error.retryable && (
              <Button size="sm" variant="outline" onClick={onRetry} disabled={isSubmitting}>
                <RotateCcw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                Try again
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-2 border-t pt-4">
        <Button
          onClick={() => onApprove({ projectId, variables })}
          disabled={!canApprove}
        >
          {isSubmitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          Approve &amp; generate workflow
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
