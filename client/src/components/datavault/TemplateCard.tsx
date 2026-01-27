/**
 * TemplateCard Component
 * Displays a table template placeholder with "Coming Soon" badge
 */
import React from 'react';

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
interface TemplateCardProps {
  name: string;
  description: string;
  icon: string;
  previewColumns?: string[];
}
export function TemplateCard({ name, description, icon, previewColumns = [] }: TemplateCardProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Card className={cn("relative cursor-not-allowed opacity-75 hover:opacity-90 transition-opacity")}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <i className={`${icon} text-xl text-primary`}></i>
                  </div>
                  <div>
                    <CardTitle className="text-lg">{name}</CardTitle>
                    <Badge variant="secondary" className="mt-1 text-xs">
                      Coming Soon
                    </Badge>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription className="mb-3">{description}</CardDescription>
              {previewColumns.length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <p className="text-xs text-muted-foreground mb-2">Suggested columns:</p>
                  <div className="flex flex-wrap gap-1">
                    {previewColumns.slice(0, 5).map((col) => (
                      <Badge key={col} variant="outline" className="text-xs">
                        {col}
                      </Badge>
                    ))}
                    {previewColumns.length > 5 && (
                      <Badge variant="outline" className="text-xs">
                        +{previewColumns.length - 5} more
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TooltipTrigger>
        <TooltipContent>
          <p>Table templates are coming in a future release</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}