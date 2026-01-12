/**
 * FilterBuilderUI - Visual filter builder for List Tools blocks
 * Supports AND-only combinators in v1 (OR combinator deferred to v2)
 */

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import type { ListToolsFilterGroup, ListToolsFilterRule, ReadTableOperator } from "@shared/types/blocks";

interface FilterBuilderUIProps {
  filters: ListToolsFilterGroup | undefined;
  onChange: (filters: ListToolsFilterGroup | undefined) => void;
  availableVariables?: string[];
  className?: string;
}

const OPERATORS: { value: ReadTableOperator; label: string; requiresValue: boolean }[] = [
  // Strict comparison operators
  { value: "equals", label: "Equals (strict)", requiresValue: true },
  { value: "not_equals", label: "Not Equals (strict)", requiresValue: true },

  // Case-sensitive string operators
  { value: "contains", label: "Contains", requiresValue: true },
  { value: "not_contains", label: "Not Contains", requiresValue: true },
  { value: "starts_with", label: "Starts With", requiresValue: true },
  { value: "ends_with", label: "Ends With", requiresValue: true },

  // Case-insensitive variants
  { value: "equals_ci", label: "Equals (case-insensitive)", requiresValue: true },
  { value: "contains_ci", label: "Contains (case-insensitive)", requiresValue: true },
  { value: "not_contains_ci", label: "Not Contains (case-insensitive)", requiresValue: true },
  { value: "starts_with_ci", label: "Starts With (case-insensitive)", requiresValue: true },
  { value: "ends_with_ci", label: "Ends With (case-insensitive)", requiresValue: true },

  // Numeric comparison operators
  { value: "greater_than", label: "Greater Than", requiresValue: true },
  { value: "gte", label: "Greater Than or Equal", requiresValue: true },
  { value: "less_than", label: "Less Than", requiresValue: true },
  { value: "lte", label: "Less Than or Equal", requiresValue: true },

  // Emptiness and existence operators
  { value: "is_empty", label: "Is Empty", requiresValue: false },
  { value: "is_not_empty", label: "Is Not Empty", requiresValue: false },
  { value: "exists", label: "Field Exists", requiresValue: false },

  // List membership operators
  { value: "in_list", label: "In List (strict)", requiresValue: true },
  { value: "not_in_list", label: "Not In List (strict)", requiresValue: true },
];

export function FilterBuilderUI({
  filters,
  onChange,
  availableVariables = [],
  className
}: FilterBuilderUIProps) {
  const rules = filters?.rules || [];

  const handleAddRule = () => {
    const newRule: ListToolsFilterRule = {
      fieldPath: '',
      op: 'equals',
      valueSource: 'const',
      value: ''
    };

    const newFilters: ListToolsFilterGroup = {
      combinator: 'and', // v1: AND-only
      rules: [...rules, newRule]
    };

    onChange(newFilters);
  };

  const handleUpdateRule = (index: number, updates: Partial<ListToolsFilterRule>) => {
    const newRules = [...rules];
    newRules[index] = { ...newRules[index], ...updates };

    onChange({
      combinator: filters?.combinator || 'and',
      rules: newRules
    });
  };

  const handleRemoveRule = (index: number) => {
    const newRules = rules.filter((_, i) => i !== index);

    if (newRules.length === 0) {
      onChange(undefined); // No filters
    } else {
      onChange({
        combinator: filters?.combinator || 'and',
        rules: newRules
      });
    }
  };

  return (
    <div className={className}>
      <div className="space-y-2">
        {rules.map((rule, index) => (
          <React.Fragment key={index}>
            {/* AND label between rules */}
            {index > 0 && (
              <div className="flex items-center justify-center py-1">
                <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
                  AND
                </span>
              </div>
            )}

            <FilterRule
              rule={rule}
              index={index}
              availableVariables={availableVariables}
              onUpdate={(updates) => handleUpdateRule(index, updates)}
              onRemove={() => handleRemoveRule(index)}
            />
          </React.Fragment>
        ))}

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full h-8 text-xs"
          onClick={handleAddRule}
        >
          <Plus className="w-3 h-3 mr-1" />
          Add Filter
        </Button>
      </div>
    </div>
  );
}

interface FilterRuleProps {
  rule: ListToolsFilterRule;
  index: number;
  availableVariables: string[];
  onUpdate: (updates: Partial<ListToolsFilterRule>) => void;
  onRemove: () => void;
}

function FilterRule({ rule, index, availableVariables, onUpdate, onRemove }: FilterRuleProps) {
  const operator = OPERATORS.find(op => op.value === rule.op);
  const requiresValue = operator?.requiresValue ?? true;

  return (
    <div className="bg-background border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Filter {index + 1}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2"
          onClick={onRemove}
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* Field Path */}
        <div className="space-y-1">
          <Label className="text-[11px]">Field Path</Label>
          <Input
            className="h-8 text-xs font-mono"
            placeholder="e.g., name, address.city"
            value={rule.fieldPath}
            onChange={(e) => onUpdate({ fieldPath: e.target.value })}
          />
        </div>

        {/* Operator */}
        <div className="space-y-1">
          <Label className="text-[11px]">Operator</Label>
          <Select
            value={rule.op}
            onValueChange={(value: ReadTableOperator) => onUpdate({ op: value })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPERATORS.map(op => (
                <SelectItem key={op.value} value={op.value} className="text-xs">
                  {op.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Value Section (only if operator requires a value) */}
      {requiresValue && (
        <>
          <div className="flex items-center gap-2">
            <Label className="text-[11px]">Value Source:</Label>
            <Select
              value={rule.valueSource}
              onValueChange={(value: 'const' | 'var') => onUpdate({ valueSource: value })}
            >
              <SelectTrigger className="h-7 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="const">Constant</SelectItem>
                <SelectItem value="var">Variable</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px]">
              {rule.valueSource === 'const' ? 'Value' : 'Variable Name'}
            </Label>
            {rule.valueSource === 'const' ? (
              <Input
                className="h-8 text-xs"
                placeholder="Enter value..."
                value={rule.value || ''}
                onChange={(e) => onUpdate({ value: e.target.value })}
              />
            ) : (
              <Select
                value={rule.value || ''}
                onValueChange={(value) => onUpdate({ value })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select variable..." />
                </SelectTrigger>
                <SelectContent>
                  {availableVariables.length === 0 ? (
                    <div className="p-2 text-xs text-muted-foreground text-center">
                      No variables available
                    </div>
                  ) : (
                    availableVariables.map(v => (
                      <SelectItem key={v} value={v}>{v}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
          </div>
        </>
      )}
    </div>
  );
}
