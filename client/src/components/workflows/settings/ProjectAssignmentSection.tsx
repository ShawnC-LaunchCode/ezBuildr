/**
 * ProjectAssignmentSection - Display and change workflow project assignment
 * PR2: Static UI implementation
 */

import { FolderOpen } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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

interface ProjectAssignmentSectionProps {
  workflowId: string;
  currentProjectId: string | null;
  currentProjectName?: string;
  projects: Array<{
    id: string;
    name: string;
  }>;
  onChange?: (projectId: string | null) => void;
  disabled?: boolean;
}

export function ProjectAssignmentSection({
  workflowId,
  currentProjectId,
  currentProjectName,
  projects,
  onChange,
  disabled = false,
}: ProjectAssignmentSectionProps) {
  const handleChange = (value: string) => {
    if (onChange) {
      // Convert "main-folder" to null for unfiled workflows
      onChange(value === "main-folder" ? null : value);
    }
  };

  // Determine the current location display
  const currentLocation = currentProjectId === null
    ? "Main Folder (no project)"
    : currentProjectName || "Unknown Project";

  // Determine the select value (use "main-folder" as a sentinel for null)
  const selectValue = currentProjectId === null ? "main-folder" : currentProjectId;

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
            disabled={disabled}
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
            Select a project to organize your workflow, or choose Main Folder to keep it unfiled
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
