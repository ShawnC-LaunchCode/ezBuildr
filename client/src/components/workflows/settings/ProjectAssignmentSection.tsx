/**
 * ProjectAssignmentSection - Display and change workflow project assignment
 * PR2: Static UI implementation
 * PR3: Modal integration and real data support
 * PR4: Loading states and edge case handling
 */

import { useState } from "react";
import { FolderOpen } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
} from "@/components/ui/select";
import { ConfirmMoveWorkflowModal } from "./ConfirmMoveWorkflowModal";

interface ProjectAssignmentSectionProps {
  workflowId: string;
  workflowName: string;
  currentProjectId: string | null;
  currentProjectName?: string;
  projects: Array<{
    id: string;
    name: string;
  }>;
  onMove: (projectId: string | null) => Promise<void>;
  disabled?: boolean;
  isMoving?: boolean;
  isLoading?: boolean;
}

export function ProjectAssignmentSection({
  workflowId,
  workflowName,
  currentProjectId,
  currentProjectName,
  projects,
  onMove,
  disabled = false,
  isMoving = false,
  isLoading = false,
}: ProjectAssignmentSectionProps) {
  const [showModal, setShowModal] = useState(false);
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);

  const handleChange = (value: string) => {
    // Convert "main-folder" to null for unfiled workflows
    const projectId = value === "main-folder" ? null : value;

    // Don't show modal if not actually changing
    if (projectId === currentProjectId) {
      return;
    }

    // Store the pending project and show confirmation modal
    setPendingProjectId(projectId);
    setShowModal(true);
  };

  const handleConfirm = async () => {
    if (pendingProjectId !== null || currentProjectId !== null) {
      await onMove(pendingProjectId);
      setShowModal(false);
      setPendingProjectId(null);
    }
  };

  const handleCancel = () => {
    setShowModal(false);
    setPendingProjectId(null);
  };

  // Determine the current location display
  const currentLocation = currentProjectId === null
    ? "Main Folder (no project)"
    : currentProjectName || "Default Workflow Folder";

  // Determine the select value (use "main-folder" as a sentinel for null)
  const selectValue = currentProjectId === null ? "main-folder" : currentProjectId;

  // Determine target name for modal
  const targetName = pendingProjectId === null
    ? "Main Folder"
    : projects.find(p => p.id === pendingProjectId)?.name || "Default Workflow Folder";

  // PR4: Loading state UI
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5" />
            <CardTitle>Project Assignment</CardTitle>
          </div>
          <CardDescription>
            Organize this workflow by assigning it to a project
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Current Location</Label>
            <Skeleton className="h-5 w-48" />
          </div>
          <div className="space-y-2">
            <Label>Move to Project</Label>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5" />
            <CardTitle>Project Assignment</CardTitle>
          </div>
          <CardDescription>
            Organize this workflow by assigning it to a project
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-assignment">Current Location</Label>
            <div className="text-sm font-medium text-muted-foreground mb-2">
              {currentLocation}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-assignment">Move to Project</Label>
            <Select
              value={selectValue}
              onValueChange={handleChange}
              disabled={disabled || isMoving}
            >
              <SelectTrigger id="project-assignment">
                <SelectValue placeholder="Select a project..." />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Unfiled</SelectLabel>
                  <SelectItem value="main-folder">
                    Main Folder (no project)
                  </SelectItem>
                </SelectGroup>

                {projects.length > 0 && (
                  <>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>Projects</SelectLabel>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </>
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {projects.length === 0
                ? "No projects available. Create a project to organize your workflows."
                : "Select a project to organize your workflow, or choose Main Folder to keep it unfiled"}
            </p>
          </div>
        </CardContent>
      </Card>

      <ConfirmMoveWorkflowModal
        open={showModal}
        onOpenChange={handleCancel}
        workflowName={workflowName}
        targetName={targetName}
        onConfirm={handleConfirm}
        isLoading={isMoving}
      />
    </>
  );
}
