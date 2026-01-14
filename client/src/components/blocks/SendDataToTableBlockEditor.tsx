/**
 * Send Data to Table Block Editor
 * Simplified UX for writing workflow data to DataVault tables
 */

import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2, AlertCircle, Database, ArrowRight } from "lucide-react";
import React, { useState, useEffect, useMemo, useRef } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTables } from "@/hooks/useDatavaultTables";
import { useTableColumns } from "@/hooks/useTableColumns";
import { cn } from "@/lib/utils";
import { dataSourceAPI } from "@/lib/vault-api";
import { useWorkflowDataSources, useWorkflowVariables } from "@/lib/vault-hooks";

import type { WriteBlockConfig, ColumnMapping, MatchStrategy } from "@shared/types/blocks";


interface SendDataToTableBlockEditorProps {
  workflowId: string;
  config: WriteBlockConfig;
  onChange: (config: WriteBlockConfig) => void;
  phase: string;
  onPhaseChange: (phase: string) => void;
  // New props for integrated UI
  order: number;
  onOrderChange: (order: number) => void;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
}

export function SendDataToTableBlockEditor({
  workflowId,
  config,
  onChange,
  phase,
  onPhaseChange,
  order,
  onOrderChange,
  enabled,
  onEnabledChange
}: SendDataToTableBlockEditorProps) {
  const { data: dataSources } = useWorkflowDataSources(workflowId);
  const { data: variables = [] } = useWorkflowVariables(workflowId);
  const selectedDataSource = dataSources?.find(ds => ds.id === config.dataSourceId);

  // Fetch tables
  const { data: fetchedTables } = useQuery({
    queryKey: ["dataSource", config.dataSourceId, "tables"],
    queryFn: () => config.dataSourceId ? dataSourceAPI.getTables(config.dataSourceId) : Promise.resolve([]),
    enabled: !!config.dataSourceId && !selectedDataSource?.config?.isNativeTable
  });

  const { data: allNativeTables } = useTables();

  let tables: { name: string; type: string; id: string }[] = [];

  if (fetchedTables) {
    tables = fetchedTables.map((t: any) => ({ ...t, id: t.id || t.name }));
  }

  if (selectedDataSource?.config?.isNativeTable && selectedDataSource?.config?.tableId) {
    const targetTable = allNativeTables?.find(t => t.id === selectedDataSource.config.tableId);
    if (targetTable) {
      tables = [{ name: targetTable.name, type: 'native', id: targetTable.id }];
    }
  }

  const resolvedTableId = config.tableId && tables.find(t => t.name === config.tableId || t.id === config.tableId)?.id;
  const { data: columns } = useTableColumns(resolvedTableId);

  // Auto-select table if native table proxy
  useEffect(() => {
    if (selectedDataSource?.config?.isNativeTable && tables.length === 1 && config.tableId !== tables[0].id) {
      updateConfig({ tableId: tables[0].id });
    }
  }, [selectedDataSource, tables, config.tableId]);

  // Auto-add required columns and clean up duplicates
  useEffect(() => {
    if (config.tableId && columns && columns.length > 0) {
      const existingMappings = config.columnMappings || [];
      const existingMappedColIds = existingMappings.map(m => m.columnId);

      // 1. Identify missing required columns
      const uniqueRequiredCols = Array.from(new Map(columns.filter(c => c.required).map(c => [c.id, c])).values());
      const missingRequiredCols = uniqueRequiredCols.filter(c => !existingMappedColIds.includes(c.id));

      // 2. Identify duplicates in existing mappings
      const seenIds = new Set();
      const uniqueExistingMappings: ColumnMapping[] = [];
      let hasDuplicates = false;

      for (const m of existingMappings) {
        // If we've seen this column ID before (and it's not empty), skip it
        if (m.columnId && seenIds.has(m.columnId)) {
          hasDuplicates = true;
          continue;
        }
        if (m.columnId) {seenIds.add(m.columnId);}
        uniqueExistingMappings.push(m);
      }

      // 3. Update if needed
      if (missingRequiredCols.length > 0 || hasDuplicates) {
        const newMappings = missingRequiredCols.map(col => ({
          columnId: col.id,
          value: ''
        }));

        updateConfig({
          columnMappings: [...uniqueExistingMappings, ...newMappings]
        });
      }
    }
  }, [config.tableId, columns, config.columnMappings?.length]);

  const updateConfig = (updates: Partial<WriteBlockConfig>) => {
    onChange({ ...config, ...updates });
  };

  const addMapping = () => {
    const mappings = config.columnMappings || [];
    // Find first column that isn't mapped yet
    const usedIds = new Set(mappings.map(m => m.columnId));
    const nextUnmappedCol = columns?.find(c => !usedIds.has(c.id));
    // Default to next available, or empty string. NEVER default to an already used column.
    const defaultCol = nextUnmappedCol ? nextUnmappedCol.id : "";

    updateConfig({ columnMappings: [...mappings, { columnId: defaultCol, value: "" }] });
  };

  const updateMapping = (index: number, key: keyof ColumnMapping, value: string) => {
    const mappings = [...(config.columnMappings || [])];
    mappings[index] = { ...mappings[index], [key]: value };
    updateConfig({ columnMappings: mappings });
  };

  const removeMapping = (index: number) => {
    const mappings = [...(config.columnMappings || [])];
    mappings.splice(index, 1);
    updateConfig({ columnMappings: mappings });
  };

  // Validation
  const getDuplicateColumns = () => {
    const mappings = config.columnMappings || [];
    const columnCounts = mappings.reduce((acc, m) => {
      if (m.columnId) {acc[m.columnId] = (acc[m.columnId] || 0) + 1;}
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(columnCounts).filter(([_, count]) => count > 1).map(([colId, _]) => colId);
  };

  const getMissingRequiredColumns = () => {
    if (!columns) {return [];}
    const requiredCols = columns.filter(c => c.required);
    const mappedColIds = (config.columnMappings || []).map(m => m.columnId);
    return requiredCols.filter(c => !mappedColIds.includes(c.id));
  };

  const getIncompleteRows = () => {
    return (config.columnMappings || []).filter(m => !m.columnId || !m.value || m.value.trim() === '');
  };

  const duplicateColumns = getDuplicateColumns();
  const missingRequiredColumns = getMissingRequiredColumns();
  const incompleteRows = getIncompleteRows();

  const hasDestination = !!config.dataSourceId && !!config.tableId;
  const hasMappings = (config.columnMappings?.length || 0) > 0;
  // const hasValidMappings = hasMappings && duplicateColumns.length === 0 && missingRequiredColumns.length === 0 && incompleteRows.length === 0; // Strict mode commented out
  const hasValidMappings = hasMappings && duplicateColumns.length === 0 && missingRequiredColumns.length === 0; // Slightly looser for interactions

  const needsMatchStrategy = (config.mode === 'update' || config.mode === 'upsert') && (!config.matchStrategy?.columnId || !config.matchStrategy?.columnValue);

  const getColumnName = (colId: string) => columns?.find(c => c.id === colId)?.name || colId;

  // --- INTERACTIVE FLOW LOGIC ---
  // Steps: 
  // 1. Destination (Source + Table) -> When done, highlights mappings
  // 2. Mappings -> When done (required filled), highlights Settings
  // 3. Settings (Mode, Phase, Order) -> Always available after mappings, but officially 'last'

  const step1Complete = hasDestination;
  const step2Complete = step1Complete && hasValidMappings && incompleteRows.length === 0;

  // Visual States
  const isStep1Active = !step1Complete;
  const isStep2Active = step1Complete && !step2Complete;
  const isStep3Active = step2Complete;

  // If entire flow is complete, we show everything normally (no green highlight), 
  // OR we keep settings available. User said "once those required fields are filled, the green goes away, and everything is availible."

  // Highlighting classes
  const activeRingClass = "ring-2 ring-emerald-500 ring-offset-2 bg-emerald-50/20";
  const inactiveClass = "opacity-40 pointer-events-none grayscale-[0.5]";

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
      {/* LEFT COLUMN: Destination, Match, Mappings */}
      <div className="space-y-6">

        {/* 1. DESTINATION */}
        <div className={cn(
          "space-y-3 p-4 rounded-lg transition-all duration-300 border",
          isStep1Active ? `${activeRingClass  } border-emerald-500 bg-white shadow-sm` : "border-transparent px-0"
        )}>
          <div className="flex items-center justify-between">
            <Label className="text-base font-medium">Destination</Label>
            {step1Complete && <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50">Configured</Badge>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Data Source</Label>
              <Select value={config.dataSourceId || ""} onValueChange={(val) => updateConfig({ dataSourceId: val, tableId: '' })}>
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Select source..." />
                </SelectTrigger>
                <SelectContent>
                  {dataSources?.map(ds => (
                    <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Table</Label>
              <Select value={config.tableId || ""} onValueChange={(val) => updateConfig({ tableId: val })} disabled={!config.dataSourceId}>
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Select table..." />
                </SelectTrigger>
                <SelectContent>
                  {tables.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* MATCH CONFIG (Only for Update/Upsert) - MOVED TO LEFT COLUMN as requested */}
        {(config.mode === 'update' || config.mode === 'upsert') && (
          <div className={cn(
            "space-y-3 transition-opacity duration-300",
            !step1Complete ? "opacity-30 pointer-events-none" : "opacity-100" // Available as soon as Destination is picked, or with mappings?
          )}>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded space-y-3">
              <p className="text-xs font-medium text-amber-900">Match Configuration (for {config.mode})</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Match Column</Label>
                  <Select
                    value={config.matchStrategy?.columnId || ""}
                    onValueChange={(val) => updateConfig({
                      matchStrategy: {
                        ...config.matchStrategy,
                        type: 'column_match',
                        columnId: val === "___clear___" ? "" : val
                      } as MatchStrategy
                    })}
                  >
                    <SelectTrigger className="h-8 text-xs bg-white">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="___clear___" key="clear-option">
                        (Clear choice)
                      </SelectItem>
                      <div className="my-1 h-px bg-muted" />
                      {columns?.map(col => (
                        <SelectItem key={col.id} value={col.id}>{col.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Match Value</Label>
                  <Select
                    value={config.matchStrategy?.columnValue || ""}
                    onValueChange={(val) => updateConfig({
                      matchStrategy: {
                        ...config.matchStrategy,
                        type: 'column_match',
                        columnValue: val === "___clear___" ? "" : val
                      } as MatchStrategy
                    })}
                  >
                    <SelectTrigger className="h-8 text-xs bg-white">
                      <SelectValue placeholder="Variable..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="___clear___" key="clear-option">
                        (Clear choice)
                      </SelectItem>
                      <div className="my-1 h-px bg-muted" />
                      {variables.map(v => (
                        <SelectItem key={v.key} value={v.alias || v.key}>
                          <span className="font-mono text-xs">{v.alias || v.key}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. MAPPINGS */}
        <div className={cn(
          "space-y-3 rounded-lg transition-all duration-300",
          !step1Complete ? inactiveClass : "",
          isStep2Active ? `${activeRingClass  } p-4 border border-emerald-500 bg-white shadow-sm` : "px-0"
        )}>
          <div className="flex items-center justify-between">
            <Label className="text-base font-medium">Mappings</Label>
            {step2Complete && !isStep1Active && <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100"><span className="mr-1">✓</span> Ready</Badge>}
            <Button type="button" variant="outline" size="sm" onClick={addMapping} disabled={!config.tableId} className="h-7 text-xs">
              <Plus className="w-3 h-3 mr-1" />
              Add field
            </Button>
          </div>

          {/* Empty state or Grid */}
          {!config.tableId ? (
            <div className="text-center py-6 border-2 border-dashed rounded-lg bg-muted/20">
              <p className="text-sm text-muted-foreground">Select a table to start mapping</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(config.columnMappings || []).length === 0 && (
                <div className="text-center py-4 border border-dashed rounded bg-muted/10">
                  <p className="text-xs text-muted-foreground">No fields mapped. Required fields will be added automatically.</p>
                </div>
              )}

              {config.columnMappings?.map((mapping, idx) => {
                const isDuplicate = duplicateColumns.includes(mapping.columnId);
                const column = columns?.find(c => c.id === mapping.columnId);
                const isRequired = column?.required;
                const isIncomplete = !mapping.columnId || !mapping.value;

                return (
                  <div key={idx} className={cn(
                    "grid grid-cols-[1fr,1fr,auto] gap-2 items-start p-2 rounded border transition-colors bg-white",
                    isDuplicate && "border-red-300 bg-red-50",
                    isIncomplete && !isDuplicate && "border-amber-300 bg-amber-50"
                  )}>
                    {/* Column Select */}
                    <div>
                      <Select value={mapping.columnId || ""} onValueChange={(val) => updateMapping(idx, "columnId", val)}>
                        <SelectTrigger className={cn("h-8 text-xs", isDuplicate && "border-red-400")}>
                          <SelectValue placeholder="Column">
                            <div className="flex items-center gap-1.5 overflow-hidden">
                              <span className="truncate">{getColumnName(mapping.columnId)}</span>
                              {isRequired && <span className="text-[9px] text-red-500 font-bold">*</span>}
                            </div>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {columns?.map(col => (
                            <SelectItem key={col.id} value={col.id}>
                              <div className="flex items-center gap-2">
                                <span>{col.name}</span>
                                {col.required && <Badge variant="destructive" className="text-[9px] h-3 px-1">Req</Badge>}
                                <span className="text-xs text-muted-foreground">({col.type})</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Value Input */}
                    <div className="relative">
                      <Input
                        value={mapping.value || ''}
                        onChange={(e) => updateMapping(idx, "value", e.target.value)}
                        placeholder="Value..."
                        className="h-8 font-mono text-xs pr-6"
                        list={`value-suggestions-${idx}`}
                      />
                      <datalist id={`value-suggestions-${idx}`}>
                        {/* System values */}
                        <option value="system:current_date">📅 Current Date</option>
                        <option value="system:current_time">🕐 Current Time</option>
                        <option value="system:current_datetime">📅 Date & Time</option>
                        {/* Variables */}
                        <option value="system:autonumber">🔢 Auto Number</option>
                        {variables.map(v => (
                          <option key={v.key} value={v.alias || v.key}>{v.alias || v.key}</option>
                        ))}
                      </datalist>
                    </div>

                    {/* Delete */}
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => removeMapping(idx)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                );
              })}

              {/* Validation Warnings */}
              {missingRequiredColumns.length > 0 && (
                <div className="text-xs text-red-600 flex gap-1 items-center bg-red-50 p-2 rounded">
                  <AlertCircle className="w-3 h-3" />
                  Missing required: {missingRequiredColumns.map(c => c.name).join(', ')}
                </div>
              )}
            </div>
          )}
        </div>

      </div>

      {/* RIGHT COLUMN: Write Mode, Phase, Order */}
      <div className={cn(
        "space-y-6 border-l pl-6 transition-opacity duration-500",
        !step2Complete ? inactiveClass : "opacity-100" // "everything is availible"
      )}>
        <div className="space-y-4">
          <h3 className="font-semibold mb-4">Execution Settings</h3>

          {/* Write Mode */}
          <div className="space-y-2">
            <Label>Write Mode</Label>
            <Select value={config.mode || "upsert"} onValueChange={(val: any) => updateConfig({ mode: val })}>
              <SelectTrigger className="bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="upsert">Upsert (Update or Create)</SelectItem>
                <SelectItem value="create">Insert (Always Create New)</SelectItem>
                <SelectItem value="update">Update (Existing Only)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {config.mode === 'create' ? 'Always adds a new row. May fail if duplicates exist.' :
                config.mode === 'update' ? 'Only updates existing rows found by match config.' :
                  'Attempts to update via match config, creates new if not found.'}
            </p>
          </div>

          {/* When to Run */}
          <div className="space-y-2">
            <Label>When to Run</Label>
            <Select value={phase || "onRunStart"} onValueChange={onPhaseChange}>
              <SelectTrigger className="bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="onRunStart">On Run Start</SelectItem>
                <SelectItem value="onSectionEnter">On Section Enter</SelectItem>
                <SelectItem value="onSectionSubmit">On Section Submit</SelectItem>
                <SelectItem value="onNext">On Next</SelectItem>
                <SelectItem value="onRunComplete">On Run Complete</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Order */}
          <div className="space-y-2">
            <Label>Order</Label>
            <Input
              type="number"
              value={order}
              onChange={(e) => onOrderChange(Number(e.target.value))}
              className="bg-white"
            />
          </div>

          {/* Enabled */}
          <div className="pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => onEnabledChange(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm font-medium">Enabled</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
