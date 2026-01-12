/**
 * AdvancedTransformUI - Advanced transform options (Select, Dedupe)
 * Extracted from ListToolsBlockEditor for reusability
 */

import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ListToolsDedupe } from "@shared/types/blocks";

interface AdvancedTransformUIProps {
  select: string[] | undefined;
  dedupe: ListToolsDedupe | undefined;
  onChange: (updates: { select?: string[]; dedupe?: ListToolsDedupe }) => void;
  className?: string;
}

export function AdvancedTransformUI({ select, dedupe, onChange, className }: AdvancedTransformUIProps) {
  return (
    <div className={className}>
      <div className="space-y-3">
        {/* Select Columns */}
        <div className="space-y-2">
          <Label className="text-xs">Select Columns (leave empty for all)</Label>
          <Input
            className="h-8 text-xs font-mono bg-background"
            placeholder="e.g., name, email, address.city"
            value={select?.join(', ') || ''}
            onChange={(e) => {
              const value = e.target.value.trim();
              onChange({
                select: value ? value.split(',').map(s => s.trim()).filter(Boolean) : undefined,
                dedupe
              });
            }}
          />
          <p className="text-[11px] text-muted-foreground">
            Comma-separated field paths. Supports dot notation.
          </p>
        </div>

        {/* Deduplicate */}
        <div className="space-y-2">
          <Label className="text-xs">Deduplicate by Field</Label>
          <Input
            className="h-8 text-xs font-mono bg-background"
            placeholder="e.g., email"
            value={dedupe?.fieldPath || ''}
            onChange={(e) => {
              const value = e.target.value.trim();
              onChange({
                select,
                dedupe: value ? { fieldPath: value } : undefined
              });
            }}
          />
          <p className="text-[11px] text-muted-foreground">
            Keep only first occurrence of each unique value
          </p>
        </div>
      </div>
    </div>
  );
}
