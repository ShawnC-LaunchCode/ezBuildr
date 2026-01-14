/**
 * Comprehensive List Tools Block Editor
 * Applies multiple operations in sequence: filter → sort → offset/limit → select → dedupe
 */

import { Filter, ArrowUpDown, Scissors, Columns, Hash, Target, ChevronDown, ChevronRight } from "lucide-react";
import React, { useState, useEffect } from "react";

import { FilterBuilderUI, SortBuilderUI, RangeControlsUI, AdvancedTransformUI } from "@/components/builder/transforms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSteps } from "@/lib/vault-hooks";

import type {
  ListToolsConfig,
  ListToolsFilterGroup,
  ListToolsSortKey,
  ListToolsDedupe
} from "@shared/types/blocks";

interface ListToolsBlockEditorProps {
  workflowId: string;
  config: Partial<ListToolsConfig>;
  onChange: (config: Partial<ListToolsConfig>) => void;
  mode: 'easy' | 'advanced';
}

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
    .filter((step): step is typeof step & { alias: string } => !!step.alias && step.alias.length > 0)
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

  // Validation
  const isValid = !!(localConfig.sourceListVar && localConfig.outputListVar);

  const filterCount = localConfig.filters?.rules?.length || 0;
  const sortCount = localConfig.sort?.length || 0;

  // Summary stats
  const hasFilters = filterCount > 0;
  const hasSorts = sortCount > 0;
  const hasRange = !!(localConfig.offset || localConfig.limit);
  const hasDedupe = !!localConfig.dedupe;
  const hasSelect = (localConfig.select?.length || 0) > 0;
  const hasTransforms = hasFilters || hasSorts || hasRange || hasDedupe || hasSelect;

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
      {/* Transform Summary */}
      {localConfig.sourceListVar && localConfig.outputListVar && hasTransforms && (
        <div className="p-3 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-md">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <p className="text-xs font-medium text-gray-900 mb-1">Transform Pipeline</p>
              <div className="flex flex-wrap gap-1">
                {hasFilters && (
                  <Badge variant="outline" className="text-[10px] bg-blue-100 border-blue-300 text-blue-700">
                    {filterCount} filter{filterCount > 1 ? 's' : ''}
                  </Badge>
                )}
                {hasSorts && (
                  <Badge variant="outline" className="text-[10px] bg-purple-100 border-purple-300 text-purple-700">
                    Sort by {sortCount} key{sortCount > 1 ? 's' : ''}
                  </Badge>
                )}
                {hasRange && (
                  <Badge variant="outline" className="text-[10px] bg-orange-100 border-orange-300 text-orange-700">
                    {localConfig.offset ? `Skip ${localConfig.offset}` : ''}{localConfig.offset && localConfig.limit ? ', ' : ''}{localConfig.limit ? `Take ${localConfig.limit}` : ''}
                  </Badge>
                )}
                {hasSelect && (
                  <Badge variant="outline" className="text-[10px] bg-indigo-100 border-indigo-300 text-indigo-700">
                    {localConfig.select!.length} column{localConfig.select!.length > 1 ? 's' : ''}
                  </Badge>
                )}
                {hasDedupe && (
                  <Badge variant="outline" className="text-[10px] bg-pink-100 border-pink-300 text-pink-700">
                    Dedupe by {localConfig.dedupe!.fieldPath}
                  </Badge>
                )}
              </div>
            </div>
            <Badge className="bg-green-600 text-white text-[10px] px-2">Active</Badge>
          </div>
        </div>
      )}

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
          <CardContent className="pt-0">
            <FilterBuilderUI
              filters={localConfig.filters}
              onChange={(filters) => handleChange({ filters })}
              availableVariables={allVariables}
            />
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
          <CardContent className="pt-0">
            <SortBuilderUI
              sort={localConfig.sort}
              onChange={(sort) => handleChange({ sort })}
            />
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
          <CardContent className="pt-0">
            <RangeControlsUI
              offset={localConfig.offset}
              limit={localConfig.limit}
              onChange={(updates) => handleChange(updates)}
            />
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
            <CardContent className="pt-0">
              <AdvancedTransformUI
                select={localConfig.select}
                dedupe={localConfig.dedupe}
                onChange={(updates) => handleChange(updates)}
              />
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
