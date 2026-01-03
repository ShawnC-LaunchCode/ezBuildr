/**
 * Comprehensive List Tools Block Editor
 * Applies multiple operations in sequence: filter → sort → offset/limit → select → dedupe
 */

import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSteps } from "@/lib/vault-hooks";
import { Filter, ArrowUpDown, Scissors, Columns, Hash, Target, Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ListToolsConfig,
  ListToolsFilterGroup,
  ListToolsFilterRule,
  ListToolsSortKey,
  ListToolsDedupe,
  ReadTableOperator
} from "@shared/types/blocks";

interface ListToolsBlockEditorProps {
  workflowId: string;
  config: Partial<ListToolsConfig>;
  onChange: (config: Partial<ListToolsConfig>) => void;
  mode: 'easy' | 'advanced';
}

const OPERATORS: { value: ReadTableOperator; label: string }[] = [
  { value: "equals", label: "Equals" },
  { value: "not_equals", label: "Not Equals" },
  { value: "contains", label: "Contains" },
  { value: "not_contains", label: "Not Contains" },
  { value: "starts_with", label: "Starts With" },
  { value: "ends_with", label: "Ends With" },
  { value: "greater_than", label: "Greater Than" },
  { value: "gte", label: "Greater Than or Equal" },
  { value: "less_than", label: "Less Than" },
  { value: "lte", label: "Less Than or Equal" },
  { value: "is_empty", label: "Is Empty" },
  { value: "is_not_empty", label: "Is Not Empty" },
  { value: "in_list", label: "In List" },
  { value: "not_in_list", label: "Not In List" },
  { value: "exists", label: "Field Exists" },
];

export function ListToolsBlockEditor({ workflowId, config, onChange, mode }: ListToolsBlockEditorProps) {
  const { data: steps } = useSteps(workflowId);
  const [localConfig, setLocalConfig] = useState<Partial<ListToolsConfig>>(config);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['source']));

  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  // Get list variables from workflow
  const listVariables = (steps || []).filter(step =>
    step.type === 'computed' && step.alias && step.alias.length > 0
  );

  // Get all workflow variables for value source
  const allVariables = (steps || [])
    .filter(step => step.alias && step.alias.length > 0)
    .map(step => step.alias);

  const handleChange = (updates: Partial<ListToolsConfig>) => {
    const newConfig = { ...localConfig, ...updates };
    setLocalConfig(newConfig);
    onChange(newConfig);
  };

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  // Filter management
  const addFilter = () => {
    const currentFilters = localConfig.filters || { combinator: 'and', rules: [] };
    const newRule: ListToolsFilterRule = {
      fieldPath: '',
      op: 'equals',
      valueSource: 'const',
      value: ''
    };
    handleChange({
      filters: {
        ...currentFilters,
        rules: [...(currentFilters.rules || []), newRule]
      }
    });
  };

  const updateFilter = (index: number, updates: Partial<ListToolsFilterRule>) => {
    const currentFilters = localConfig.filters || { combinator: 'and', rules: [] };
    const newRules = [...(currentFilters.rules || [])];
    newRules[index] = { ...newRules[index], ...updates };
    handleChange({
      filters: {
        ...currentFilters,
        rules: newRules
      }
    });
  };

  const removeFilter = (index: number) => {
    const currentFilters = localConfig.filters || { combinator: 'and', rules: [] };
    const newRules = (currentFilters.rules || []).filter((_, i) => i !== index);
    handleChange({
      filters: {
        ...currentFilters,
        rules: newRules
      }
    });
  };

  // Sort management
  const addSort = () => {
    const currentSort = localConfig.sort || [];
    handleChange({
      sort: [...currentSort, { fieldPath: '', direction: 'asc' }]
    });
  };

  const updateSort = (index: number, updates: Partial<ListToolsSortKey>) => {
    const currentSort = localConfig.sort || [];
    const newSort = [...currentSort];
    newSort[index] = { ...newSort[index], ...updates };
    handleChange({ sort: newSort });
  };

  const removeSort = (index: number) => {
    const currentSort = localConfig.sort || [];
    handleChange({ sort: currentSort.filter((_, i) => i !== index) });
  };

  // Validation
  const isValid = !!(localConfig.sourceListVar && localConfig.outputListVar);

  const filterCount = localConfig.filters?.rules?.length || 0;
  const sortCount = localConfig.sort?.length || 0;

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
      {/* Source & Output */}
      <Card className="border-green-200 bg-green-50/30">
        <CardHeader className="pb-3 cursor-pointer" onClick={() => toggleSection('source')}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {expandedSections.has('source') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <Target className="w-4 h-4 text-green-600" />
              Source & Output
            </CardTitle>
            {localConfig.sourceListVar && localConfig.outputListVar && (
              <Badge variant="outline" className="text-xs bg-green-100 border-green-300">
                {localConfig.sourceListVar} → {localConfig.outputListVar}
              </Badge>
            )}
          </div>
        </CardHeader>
        {expandedSections.has('source') && (
          <CardContent className="space-y-3 pt-0">
            <div className="space-y-2">
              <Label className="text-xs">Source List Variable</Label>
              <Select
                value={localConfig.sourceListVar || ""}
                onValueChange={(value) => handleChange({ sourceListVar: value })}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Select source list..." />
                </SelectTrigger>
                <SelectContent>
                  {listVariables.length === 0 && (
                    <div className="p-2 text-xs text-muted-foreground">
                      No list variables found. Create a Read Table or Query block first.
                    </div>
                  )}
                  {listVariables.map((variable) => (
                    <SelectItem key={variable.id} value={variable.alias || ""}>
                      {variable.alias} ({variable.title})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Output List Variable</Label>
              <Input
                className="font-mono text-sm bg-background"
                placeholder="e.g., filtered_users"
                value={localConfig.outputListVar || ""}
                onChange={(e) => handleChange({ outputListVar: e.target.value })}
              />
              <p className="text-[11px] text-muted-foreground">
                Name for the transformed list output
              </p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Filters */}
      <Card className="border-blue-200 bg-blue-50/30">
        <CardHeader className="pb-3 cursor-pointer" onClick={() => toggleSection('filters')}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {expandedSections.has('filters') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <Filter className="w-4 h-4 text-blue-600" />
              Filters {filterCount > 0 && <Badge variant="secondary" className="ml-1 text-xs">{filterCount}</Badge>}
            </CardTitle>
          </div>
        </CardHeader>
        {expandedSections.has('filters') && (
          <CardContent className="space-y-3 pt-0">
            {filterCount > 0 && mode === 'advanced' && (
              <div className="flex items-center gap-2 pb-2 border-b">
                <Label className="text-xs">Combine with:</Label>
                <Select
                  value={localConfig.filters?.combinator || 'and'}
                  onValueChange={(value: 'and' | 'or') => handleChange({
                    filters: { ...localConfig.filters!, combinator: value }
                  })}
                >
                  <SelectTrigger className="w-24 h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="and">AND</SelectItem>
                    <SelectItem value="or">OR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              {(localConfig.filters?.rules || []).map((rule, index) => (
                <div key={index} className="bg-background border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Filter {index + 1}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2"
                      onClick={() => removeFilter(index)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px]">Field Path</Label>
                      <Input
                        className="h-8 text-xs font-mono"
                        placeholder="e.g., name, address.zip"
                        value={rule.fieldPath}
                        onChange={(e) => updateFilter(index, { fieldPath: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Operator</Label>
                      <Select
                        value={rule.op}
                        onValueChange={(value: ReadTableOperator) => updateFilter(index, { op: value })}
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

                  {!['is_empty', 'is_not_empty', 'exists'].includes(rule.op) && (
                    <>
                      <div className="flex items-center gap-2">
                        <Label className="text-[11px]">Value Source:</Label>
                        <Select
                          value={rule.valueSource}
                          onValueChange={(value: 'const' | 'var') => updateFilter(index, { valueSource: value })}
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
                            onChange={(e) => updateFilter(index, { value: e.target.value })}
                          />
                        ) : (
                          <Select
                            value={rule.value || ''}
                            onValueChange={(value) => updateFilter(index, { value })}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Select variable..." />
                            </SelectTrigger>
                            <SelectContent>
                              {allVariables.map(v => (
                                <SelectItem key={v} value={v}>{v}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}

              <Button
                size="sm"
                variant="outline"
                className="w-full h-8 text-xs"
                onClick={addFilter}
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Filter
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Sort */}
      <Card className="border-purple-200 bg-purple-50/30">
        <CardHeader className="pb-3 cursor-pointer" onClick={() => toggleSection('sort')}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {expandedSections.has('sort') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <ArrowUpDown className="w-4 h-4 text-purple-600" />
              Sort {sortCount > 0 && <Badge variant="secondary" className="ml-1 text-xs">{sortCount} keys</Badge>}
            </CardTitle>
          </div>
        </CardHeader>
        {expandedSections.has('sort') && (
          <CardContent className="space-y-3 pt-0">
            <div className="space-y-2">
              {(localConfig.sort || []).map((sortKey, index) => (
                <div key={index} className="bg-background border rounded-lg p-3 flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground w-8">{index + 1}.</span>
                  <Input
                    className="flex-1 h-8 text-xs font-mono"
                    placeholder="Field path..."
                    value={sortKey.fieldPath}
                    onChange={(e) => updateSort(index, { fieldPath: e.target.value })}
                  />
                  <Select
                    value={sortKey.direction}
                    onValueChange={(value: 'asc' | 'desc') => updateSort(index, { direction: value })}
                  >
                    <SelectTrigger className="w-28 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc">Ascending</SelectItem>
                      <SelectItem value="desc">Descending</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2"
                    onClick={() => removeSort(index)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}

              <Button
                size="sm"
                variant="outline"
                className="w-full h-8 text-xs"
                onClick={addSort}
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Sort Key
              </Button>

              {mode === 'advanced' && sortCount > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Multi-key sorting: Applied in order. First key has priority.
                </p>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Range (Offset/Limit) */}
      <Card className="border-orange-200 bg-orange-50/30">
        <CardHeader className="pb-3 cursor-pointer" onClick={() => toggleSection('range')}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {expandedSections.has('range') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <Scissors className="w-4 h-4 text-orange-600" />
              Range
            </CardTitle>
            {(localConfig.offset || localConfig.limit) && (
              <Badge variant="outline" className="text-xs bg-orange-100 border-orange-300">
                {localConfig.offset ? `Skip ${localConfig.offset}` : ''}{localConfig.offset && localConfig.limit ? ', ' : ''}{localConfig.limit ? `Take ${localConfig.limit}` : ''}
              </Badge>
            )}
          </div>
        </CardHeader>
        {expandedSections.has('range') && (
          <CardContent className="space-y-3 pt-0">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Offset (skip first N)</Label>
                <Input
                  type="number"
                  min="0"
                  className="h-8 text-xs bg-background"
                  placeholder="0"
                  value={localConfig.offset ?? ''}
                  onChange={(e) => handleChange({ offset: e.target.value ? parseInt(e.target.value) : undefined })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Limit (max rows)</Label>
                <Input
                  type="number"
                  min="1"
                  className="h-8 text-xs bg-background"
                  placeholder="No limit"
                  value={localConfig.limit ?? ''}
                  onChange={(e) => handleChange({ limit: e.target.value ? parseInt(e.target.value) : undefined })}
                />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Transform (Select/Dedupe) */}
      {mode === 'advanced' && (
        <Card className="border-indigo-200 bg-indigo-50/30">
          <CardHeader className="pb-3 cursor-pointer" onClick={() => toggleSection('transform')}>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                {expandedSections.has('transform') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                <Columns className="w-4 h-4 text-indigo-600" />
                Transform
              </CardTitle>
            </div>
          </CardHeader>
          {expandedSections.has('transform') && (
            <CardContent className="space-y-3 pt-0">
              <div className="space-y-2">
                <Label className="text-xs">Select Columns (leave empty for all)</Label>
                <Input
                  className="h-8 text-xs font-mono bg-background"
                  placeholder="e.g., name, email, address.city"
                  value={localConfig.select?.join(', ') || ''}
                  onChange={(e) => {
                    const value = e.target.value.trim();
                    handleChange({
                      select: value ? value.split(',').map(s => s.trim()).filter(Boolean) : undefined
                    });
                  }}
                />
                <p className="text-[11px] text-muted-foreground">
                  Comma-separated field paths. Supports dot notation.
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Deduplicate by Field</Label>
                <Input
                  className="h-8 text-xs font-mono bg-background"
                  placeholder="e.g., email"
                  value={localConfig.dedupe?.fieldPath || ''}
                  onChange={(e) => {
                    const value = e.target.value.trim();
                    handleChange({
                      dedupe: value ? { fieldPath: value } : undefined
                    });
                  }}
                />
                <p className="text-[11px] text-muted-foreground">
                  Keep only first occurrence of each unique value
                </p>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Derived Outputs */}
      {mode === 'advanced' && (
        <Card className="border-pink-200 bg-pink-50/30">
          <CardHeader className="pb-3 cursor-pointer" onClick={() => toggleSection('outputs')}>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                {expandedSections.has('outputs') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                <Hash className="w-4 h-4 text-pink-600" />
                Derived Outputs
              </CardTitle>
            </div>
          </CardHeader>
          {expandedSections.has('outputs') && (
            <CardContent className="space-y-3 pt-0">
              <div className="space-y-2">
                <Label className="text-xs">Count Variable (optional)</Label>
                <Input
                  className="h-8 text-xs font-mono bg-background"
                  placeholder="e.g., user_count"
                  value={localConfig.outputs?.countVar || ''}
                  onChange={(e) => handleChange({
                    outputs: {
                      ...localConfig.outputs,
                      countVar: e.target.value || undefined
                    }
                  })}
                />
                <p className="text-[11px] text-muted-foreground">
                  Store the number of rows as a separate variable
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">First Row Variable (optional)</Label>
                <Input
                  className="h-8 text-xs font-mono bg-background"
                  placeholder="e.g., top_user"
                  value={localConfig.outputs?.firstVar || ''}
                  onChange={(e) => handleChange({
                    outputs: {
                      ...localConfig.outputs,
                      firstVar: e.target.value || undefined
                    }
                  })}
                />
                <p className="text-[11px] text-muted-foreground">
                  Store the first row as a separate variable
                </p>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Validation Message */}
      {!isValid && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md text-xs text-yellow-900">
          <p className="font-medium mb-1">Required Fields</p>
          <p>Please provide both a source list variable and output list variable name.</p>
        </div>
      )}

      {mode === 'easy' && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-900">
          <p className="font-medium mb-1">Easy Mode Note</p>
          <p>
            List Tools apply filtering, sorting, and transformations to lists. Switch to Advanced Mode for more options (multi-sort, dedupe, column selection).
          </p>
        </div>
      )}
    </div>
  );
}
