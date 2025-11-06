/**
 * WorkflowCard Component
 * Displays a workflow document card with status
 */

import { Link } from "wouter";
import { FileText, MoreVertical, Archive, Trash2, Play, Move } from "lucide-react";
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
import type { ApiWorkflow } from "@/lib/vault-api";

interface WorkflowCardProps {
  workflow: ApiWorkflow;
  onMove?: (workflow: ApiWorkflow) => void;
  onArchive?: (id: string) => void;
  onActivate?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function WorkflowCard({ workflow, onMove, onArchive, onActivate, onDelete }: WorkflowCardProps) {
  const statusVariant = workflow.status === "active" ? "default" : workflow.status === "draft" ? "secondary" : "outline";

  return (
    <Card className="group hover:shadow-lg transition-shadow cursor-pointer">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1">
            <div className="p-2 bg-secondary/50 rounded-lg">
              <FileText className="w-5 h-5 text-secondary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <Link href={`/workflows/${workflow.id}/builder`}>
                <CardTitle className="text-lg hover:text-primary cursor-pointer truncate">
                  {workflow.title}
                </CardTitle>
              </Link>
              <CardDescription className="mt-1 line-clamp-2">
                {workflow.description || "No description"}
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
              <DropdownMenuItem asChild>
                <Link href={`/workflows/${workflow.id}/builder`}>
                  Edit Builder
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {onMove && (
                <>
                  <DropdownMenuItem onClick={(e) => {
                    e.stopPropagation();
                    onMove(workflow);
                  }}>
                    <Move className="w-4 h-4 mr-2" />
                    Move to Project
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {workflow.status === "draft" || workflow.status === "archived" ? (
                <DropdownMenuItem onClick={(e) => {
                  e.stopPropagation();
                  onActivate?.(workflow.id);
                }}>
                  <Play className="w-4 h-4 mr-2" />
                  Activate
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={(e) => {
                  e.stopPropagation();
                  onArchive?.(workflow.id);
                }}>
                  <Archive className="w-4 h-4 mr-2" />
                  Archive
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete?.(workflow.id);
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
          <Badge variant={statusVariant}>
            {workflow.status}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {new Date(workflow.updatedAt).toLocaleDateString()}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
