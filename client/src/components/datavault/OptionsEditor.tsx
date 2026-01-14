/**
 * OptionsEditor Component
 * Manage options for select/multiselect columns
 */

import { Plus, Trash2, GripVertical } from "lucide-react";
import React, { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SelectOption } from "@/lib/types/datavault";

interface OptionsEditorProps {
  options: SelectOption[];
  onChange: (options: SelectOption[]) => void;
}

const TAILWIND_COLORS = [
  { name: "Red", value: "red" },
  { name: "Orange", value: "orange" },
  { name: "Amber", value: "amber" },
  { name: "Yellow", value: "yellow" },
  { name: "Lime", value: "lime" },
  { name: "Green", value: "green" },
  { name: "Emerald", value: "emerald" },
  { name: "Teal", value: "teal" },
  { name: "Cyan", value: "cyan" },
  { name: "Sky", value: "sky" },
  { name: "Blue", value: "blue" },
  { name: "Indigo", value: "indigo" },
  { name: "Violet", value: "violet" },
  { name: "Purple", value: "purple" },
  { name: "Fuchsia", value: "fuchsia" },
  { name: "Pink", value: "pink" },
  { name: "Rose", value: "rose" },
  { name: "Gray", value: "gray" },
];

export function OptionsEditor({ options, onChange }: OptionsEditorProps) {
  const [newLabel, setNewLabel] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newColor, setNewColor] = useState("blue");

  const addOption = () => {
    if (!newLabel.trim() || !newValue.trim()) {return;}

    const newOption: SelectOption = {
      label: newLabel.trim(),
      value: newValue.trim(),
      color: newColor,
    };

    onChange([...options, newOption]);
    setNewLabel("");
    setNewValue("");
    setNewColor("blue");
  };

  const removeOption = (index: number) => {
    onChange(options.filter((_, i) => i !== index));
  };

  const updateOption = (index: number, updates: Partial<SelectOption>) => {
    const updated = options.map((opt, i) => (i === index ? { ...opt, ...updates } : opt));
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <Label>Options</Label>

      {/* Existing options */}
      {options.length > 0 && (
        <div className="space-y-2">
          {options.map((option, index) => (
            <div key={index} className="flex items-center gap-2 p-2 border rounded-md bg-accent/20">
              <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab flex-shrink-0" />
              <div className="flex-1 grid grid-cols-3 gap-2 min-w-0">
                <Input
                  placeholder="Label"
                  value={option.label}
                  onChange={(e) => updateOption(index, { label: e.target.value })}
                  className="text-sm"
                />
                <Input
                  placeholder="Value"
                  value={option.value}
                  onChange={(e) => updateOption(index, { value: e.target.value })}
                  className="text-sm"
                />
                <Select
                  value={option.color || "blue"}
                  onValueChange={(color) => updateOption(index, { color })}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TAILWIND_COLORS.map((color) => (
                      <SelectItem key={color.value} value={color.value}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{
                              backgroundColor: `var(--${color.value}-500, #3b82f6)`,
                            }}
                          />
                          {color.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeOption(index)}
                className="flex-shrink-0"
              >
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add new option */}
      <div className="flex items-end gap-2">
        <div className="flex-1 grid grid-cols-3 gap-2">
          <div>
            <Label htmlFor="new-option-label" className="text-xs">
              Label
            </Label>
            <Input
              id="new-option-label"
              placeholder="e.g., Active"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addOption();
                }
              }}
              className="text-sm"
            />
          </div>
          <div>
            <Label htmlFor="new-option-value" className="text-xs">
              Value
            </Label>
            <Input
              id="new-option-value"
              placeholder="e.g., active"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addOption();
                }
              }}
              className="text-sm"
            />
          </div>
          <div>
            <Label htmlFor="new-option-color" className="text-xs">
              Color
            </Label>
            <Select value={newColor} onValueChange={setNewColor}>
              <SelectTrigger id="new-option-color" className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TAILWIND_COLORS.map((color) => (
                  <SelectItem key={color.value} value={color.value}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{
                          backgroundColor: `var(--${color.value}-500, #3b82f6)`,
                        }}
                      />
                      {color.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button
          size="sm"
          onClick={addOption}
          disabled={!newLabel.trim() || !newValue.trim()}
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {options.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Add at least one option to use this column type.
        </p>
      )}
    </div>
  );
}
