/**
 * ProjectCard Component
 * Displays a project folder card with workflow count
 */

import { Link } from "wouter";
import { Folder, MoreVertical, Archive, Trash2, Edit } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ApiProject } from "@/lib/vault-api";

interface ProjectCardProps {
  project: ApiProject & { workflowCount?: number };
  onEdit?: (project: ApiProject) => void;
  onArchive?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function ProjectCard({ project, onEdit, onArchive, onDelete }: ProjectCardProps) {
  return (
    <Card className="group hover:shadow-lg transition-shadow cursor-pointer">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Folder className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <Link href={`/projects/${project.id}`}>
                <CardTitle className="text-lg hover:text-primary cursor-pointer truncate">
                  {project.title}
                </CardTitle>
              </Link>
              <CardDescription className="mt-1 line-clamp-2">
                {project.description || "No description"}
              </CardDescription>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => {
                e.stopPropagation();
                onEdit?.(project);
              }}>
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={(e) => {
                e.stopPropagation();
                onArchive?.(project.id);
              }}>
                <Archive className="w-4 h-4 mr-2" />
                {project.status === "archived" ? "Unarchive" : "Archive"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete?.(project.id);
                }}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant={project.status === "active" ? "default" : "outline"}>
              {project.workflowCount ?? 0} workflow{(project.workflowCount ?? 0) !== 1 ? 's' : ''}
            </Badge>
          </div>
          <span className="text-xs text-muted-foreground">
            {new Date(project.updatedAt).toLocaleDateString()}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
