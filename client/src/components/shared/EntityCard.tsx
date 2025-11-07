/**
 * Generic EntityCard Component
 * Reusable card component for displaying projects, workflows, and other entities
 */

import { Link } from "wouter";
import { MoreVertical } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

export interface EntityAction {
  label: string | ReactNode;
  icon?: LucideIcon;
  onClick?: (entity: any) => void;
  href?: string;
  variant?: "default" | "destructive";
  separator?: boolean; // Add separator before this item
}

export interface EntityCardProps {
  entity: {
    id: string;
    title: string;
    description?: string | null;
    updatedAt: string;
    [key: string]: any;
  };
  icon: LucideIcon;
  iconClassName?: string;
  link?: {
    href: string;
    label?: string;
  };
  actions?: EntityAction[];
  renderBadge?: (entity: any) => ReactNode;
  onClick?: (entity: any) => void;
  className?: string;
}

export function EntityCard({
  entity,
  icon: Icon,
  iconClassName = "bg-primary/10 text-primary",
  link,
  actions = [],
  renderBadge,
  onClick,
  className = "",
}: EntityCardProps) {
  const hasActions = actions.length > 0;

  return (
    <Card
      className={`group hover:shadow-lg transition-shadow ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick ? () => onClick(entity) : undefined}
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1">
            <div className={`p-2 rounded-lg ${iconClassName}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              {link ? (
                <Link href={link.href}>
                  <CardTitle className="text-lg hover:text-primary cursor-pointer truncate">
                    {entity.title}
                  </CardTitle>
                </Link>
              ) : (
                <CardTitle className="text-lg truncate">
                  {entity.title}
                </CardTitle>
              )}
              {entity.description !== undefined && (
                <CardDescription className="mt-1 line-clamp-2">
                  {entity.description || "No description"}
                </CardDescription>
              )}
            </div>
          </div>

          {hasActions && (
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
                {actions.map((action, idx) => {
                  const isDestructive = action.variant === "destructive";
                  const ActionIcon = action.icon;

                  return (
                    <div key={idx}>
                      {action.separator && idx > 0 && <DropdownMenuSeparator />}

                      {action.href ? (
                        <DropdownMenuItem asChild>
                          <Link href={action.href}>
                            {ActionIcon && <ActionIcon className="w-4 h-4 mr-2" />}
                            {action.label}
                          </Link>
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          className={isDestructive ? "text-destructive" : ""}
                          onClick={(e) => {
                            e.stopPropagation();
                            action.onClick?.(entity);
                          }}
                        >
                          {ActionIcon && <ActionIcon className="w-4 h-4 mr-2" />}
                          {action.label}
                        </DropdownMenuItem>
                      )}
                    </div>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {renderBadge && renderBadge(entity)}
          </div>
          <span className="text-xs text-muted-foreground">
            {new Date(entity.updatedAt).toLocaleDateString()}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
