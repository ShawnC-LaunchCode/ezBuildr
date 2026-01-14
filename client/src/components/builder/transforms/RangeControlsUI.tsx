/**
 * RangeControlsUI - Offset and Limit controls for list pagination
 * Extracted from ListToolsBlockEditor for reusability
 */

import React from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RangeControlsUIProps {
  offset: number | undefined;
  limit: number | undefined;
  onChange: (updates: { offset?: number; limit?: number }) => void;
  className?: string;
}

export function RangeControlsUI({ offset, limit, onChange, className }: RangeControlsUIProps) {
  return (
    <div className={className}>
      <div className="grid grid-cols-2 gap-3">
        {/* Offset */}
        <div className="space-y-1">
          <Label className="text-xs">Offset (skip first N)</Label>
          <Input
            type="number"
            min="0"
            className="h-8 text-xs bg-background"
            placeholder="0"
            value={offset ?? ''}
            onChange={(e) => {
              const value = e.target.value ? parseInt(e.target.value) : undefined;
              onChange({ offset: value, limit });
            }}
          />
        </div>

        {/* Limit */}
        <div className="space-y-1">
          <Label className="text-xs">Limit (max rows)</Label>
          <Input
            type="number"
            min="1"
            className="h-8 text-xs bg-background"
            placeholder="No limit"
            value={limit ?? ''}
            onChange={(e) => {
              const value = e.target.value ? parseInt(e.target.value) : undefined;
              onChange({ offset, limit: value });
            }}
          />
        </div>
      </div>
    </div>
  );
}
