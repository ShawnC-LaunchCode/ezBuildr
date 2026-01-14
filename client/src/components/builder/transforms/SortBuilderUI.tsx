/**
 * SortBuilderUI - Visual multi-key sorting builder for List Tools blocks
 * Supports arrow buttons for reordering (drag-drop deferred to v2)
 */

import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import type { ListToolsSortKey } from "@shared/types/blocks";

interface SortBuilderUIProps {
  sort: ListToolsSortKey[] | undefined;
  onChange: (sort: ListToolsSortKey[] | undefined) => void;
  className?: string;
}

export function SortBuilderUI({ sort, onChange, className }: SortBuilderUIProps) {
  const sortKeys = sort || [];

  const handleAddSort = () => {
    const newSort: ListToolsSortKey = {
      fieldPath: '',
      direction: 'asc'
    };

    onChange([...sortKeys, newSort]);
  };

  const handleUpdateSort = (index: number, updates: Partial<ListToolsSortKey>) => {
    const newSort = [...sortKeys];
    newSort[index] = { ...newSort[index], ...updates };
    onChange(newSort);
  };

  const handleRemoveSort = (index: number) => {
    const newSort = sortKeys.filter((_, i) => i !== index);
    onChange(newSort.length > 0 ? newSort : undefined);
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) {return;}
    const newSort = [...sortKeys];
    [newSort[index - 1], newSort[index]] = [newSort[index], newSort[index - 1]];
    onChange(newSort);
  };

  const handleMoveDown = (index: number) => {
    if (index === sortKeys.length - 1) {return;}
    const newSort = [...sortKeys];
    [newSort[index], newSort[index + 1]] = [newSort[index + 1], newSort[index]];
    onChange(newSort);
  };

  return (
    <div className={className}>
      <div className="space-y-2">
        {sortKeys.map((sortKey, index) => (
          <SortKeyRow
            key={index}
            sortKey={sortKey}
            index={index}
            total={sortKeys.length}
            onUpdate={(updates) => handleUpdateSort(index, updates)}
            onRemove={() => handleRemoveSort(index)}
            onMoveUp={() => handleMoveUp(index)}
            onMoveDown={() => handleMoveDown(index)}
          />
        ))}

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full h-8 text-xs"
          onClick={handleAddSort}
        >
          <Plus className="w-3 h-3 mr-1" />
          Add Sort Key
        </Button>

        {sortKeys.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Multi-key sorting: Applied in order. First key has priority.
          </p>
        )}
      </div>
    </div>
  );
}

interface SortKeyRowProps {
  sortKey: ListToolsSortKey;
  index: number;
  total: number;
  onUpdate: (updates: Partial<ListToolsSortKey>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function SortKeyRow({
  sortKey,
  index,
  total,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown
}: SortKeyRowProps) {
  return (
    <div className="bg-background border rounded-lg p-3 flex items-center gap-2">
      {/* Priority indicator */}
      <div className="flex flex-col items-center gap-0.5 min-w-[32px]">
        <span className="text-xs font-medium text-muted-foreground">
          {index + 1}.
        </span>
        <div className="flex flex-col gap-0.5">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-4 w-4 p-0"
            onClick={onMoveUp}
            disabled={index === 0}
          >
            <ArrowUp className="w-3 h-3" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-4 w-4 p-0"
            onClick={onMoveDown}
            disabled={index === total - 1}
          >
            <ArrowDown className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Field Path */}
      <div className="flex-1">
        <Input
          className="h-8 text-xs font-mono"
          placeholder="Field path..."
          value={sortKey.fieldPath}
          onChange={(e) => onUpdate({ fieldPath: e.target.value })}
        />
      </div>

      {/* Direction */}
      <Select
        value={sortKey.direction}
        onValueChange={(value: 'asc' | 'desc') => onUpdate({ direction: value })}
      >
        <SelectTrigger className="w-28 h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="asc">Ascending</SelectItem>
          <SelectItem value="desc">Descending</SelectItem>
        </SelectContent>
      </Select>

      {/* Remove button */}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 px-2"
        onClick={onRemove}
      >
        <Trash2 className="w-3 h-3" />
      </Button>
    </div>
  );
}
