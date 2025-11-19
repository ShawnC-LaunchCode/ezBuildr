/**
 * Database Card Component
 * Displays a database with stats and actions
 * DataVault Phase 2: Databases feature
 */

import { useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Table, Trash2, Edit, FolderOpen } from "lucide-react";
import type { DatavaultDatabase } from "@/lib/datavault-api";

interface DatabaseCardProps {
  database: DatavaultDatabase;
  onClick: () => void;
  onDelete: () => void;
}

export function DatabaseCard({ database, onClick, onDelete }: DatabaseCardProps) {
  const [showActions, setShowActions] = useState(false);

  const scopeColors = {
    account: "bg-blue-100 text-blue-800",
    project: "bg-purple-100 text-purple-800",
    workflow: "bg-green-100 text-green-800",
  };

  const scopeIcons = {
    account: "fas fa-building",
    project: "fas fa-folder",
    workflow: "fas fa-sitemap",
  };

  return (
    <Card
      className="cursor-pointer hover:shadow-lg transition-shadow"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      onClick={(e) => {
        // Don't trigger onClick if clicking on dropdown
        if (!(e.target as HTMLElement).closest('[data-dropdown-menu]')) {
          onClick();
        }
      }}
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-primary" />
              {database.name}
            </CardTitle>
            {database.description && (
              <CardDescription className="mt-1 line-clamp-2">
                {database.description}
              </CardDescription>
            )}
          </div>

          {showActions && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild data-dropdown-menu>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-4 w-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" data-dropdown-menu>
                <DropdownMenuItem onClick={(e) => {
                  e.stopPropagation();
                  onClick();
                }}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Table className="w-4 h-4" />
            <span>
              {database.tableCount || 0} {database.tableCount === 1 ? 'table' : 'tables'}
            </span>
          </div>

          <Badge variant="secondary" className={scopeColors[database.scopeType]}>
            <i className={`${scopeIcons[database.scopeType]} mr-1`}></i>
            {database.scopeType}
          </Badge>
        </div>
      </CardContent>

      <CardFooter className="text-xs text-muted-foreground">
        <div>
          Created {new Date(database.createdAt).toLocaleDateString()}
        </div>
      </CardFooter>
    </Card>
  );
}
