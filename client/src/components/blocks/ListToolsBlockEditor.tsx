/**
 * Comprehensive List Tools Block Editor
 * Applies multiple operations in sequence: filter → sort → offset/limit → select → dedupe
 */

import { useState, useEffect } from "react";

import { useSteps } from "@/lib/vault-hooks";

import type {
  ListToolsConfig
} from "@shared/types/blocks";

import { ListToolsDerivedOutputs } from "./list-tools/ListToolsDerivedOutputs";
import { ListToolsFilters } from "./list-tools/ListToolsFilters";
import { ListToolsRange } from "./list-tools/ListToolsRange";
import { ListToolsSort } from "./list-tools/ListToolsSort";
import { ListToolsSourceParams } from "./list-tools/ListToolsSourceParams";
import { ListToolsSummary } from "./list-tools/ListToolsSummary";
import { ListToolsTransform } from "./list-tools/ListToolsTransform";


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

  // Get all workflow variables for value source
  const allVariables = (steps ?? [])
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

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
      {/* Transform Summary */}
      <ListToolsSummary config={localConfig} />

      {/* Source & Output */}
      <ListToolsSourceParams
        config={localConfig}
        onChange={handleChange}
        expanded={expandedSections.has('source')}
        onToggle={() => toggleSection('source')}
        steps={steps}
      />

      {/* Filters */}
      <ListToolsFilters
        config={localConfig}
        onChange={handleChange}
        expanded={expandedSections.has('filters')}
        onToggle={() => toggleSection('filters')}
        availableVariables={allVariables}
      />

      {/* Sort */}
      <ListToolsSort
        config={localConfig}
        onChange={handleChange}
        expanded={expandedSections.has('sort')}
        onToggle={() => toggleSection('sort')}
      />

      {/* Range (Offset/Limit) */}
      <ListToolsRange
        config={localConfig}
        onChange={handleChange}
        expanded={expandedSections.has('range')}
        onToggle={() => toggleSection('range')}
      />

      {/* Transform (Select/Dedupe) */}
      {mode === 'advanced' && (
        <ListToolsTransform
          config={localConfig}
          onChange={handleChange}
          expanded={expandedSections.has('transform')}
          onToggle={() => toggleSection('transform')}
        />
      )}

      {/* Derived Outputs */}
      {mode === 'advanced' && (
        <ListToolsDerivedOutputs
          config={localConfig}
          onChange={handleChange}
          expanded={expandedSections.has('outputs')}
          onToggle={() => toggleSection('outputs')}
        />
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
