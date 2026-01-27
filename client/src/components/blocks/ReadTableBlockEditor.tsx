/**
 * Read Table Block Editor
 * Simplified UX for reading workflow data from DataVault tables
 */
import { useQuery } from "@tanstack/react-query";
import {  Plus, Trash2 } from "lucide-react";
import React, {  useEffect } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTables } from "@/hooks/useDatavaultTables";
import { useTableColumns } from "@/hooks/useTableColumns";
import { cn } from "@/lib/utils";
import { dataSourceAPI } from "@/lib/vault-api";
import { useWorkflowDataSources } from "@/lib/vault-hooks";

import type { ReadTableConfig } from "@shared/types/blocks";
interface ReadTableBlockEditorProps {
  workflowId: string;
  config: ReadTableConfig;
  onChange: (config: ReadTableConfig) => void;
  phase: string;
  onPhaseChange: (phase: string) => void;
  // New props for integrated UI
  order: number;
  onOrderChange: (order: number) => void;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
}
export function ReadTableBlockEditor({
  workflowId,
  config,
  onChange,
  phase,
  onPhaseChange,
  order,
  onOrderChange,
  enabled,
  onEnabledChange
}: ReadTableBlockEditorProps) {
  const { data: dataSources } = useWorkflowDataSources(workflowId);
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
  const updateConfig = (updates: Partial<ReadTableConfig>) => {
    onChange({ ...config, ...updates });
  };
  // ---------------------------------------------------------------------------
  // Validation & Progress Logic
  // ---------------------------------------------------------------------------
  const hasSource = !!config.dataSourceId && !!config.tableId;
  const hasOutput = !!config.outputKey;
  // Logic Steps:
  // 1. Source (Data Source + Table) -> When done, highlights Output
  // 2. Output (Variable Name) -> When done, highlights Settings
  // 3. Settings (Filters, Sort, Limit) -> Always available after Output
  const step1Complete = hasSource;
  const step2Complete = step1Complete && hasOutput;
  // Visual States
  const isStep1Active = !step1Complete;
  const isStep2Active = step1Complete && !step2Complete;
  // Highlighting classes
  const activeRingClass = "ring-2 ring-green-500 ring-offset-2 bg-green-50/50";
  const inactiveClass = "opacity-40 pointer-events-none grayscale-[0.5]";
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
      {/* LEFT COLUMN: Data Source, Table, Output */}
      <div className="space-y-6">
        {/* 1. DATA SOURCE & TABLE */}
        <div className={cn(
          "space-y-3 p-4 rounded-lg transition-all duration-300 border",
          isStep1Active ? `${activeRingClass  } border-green-500 bg-white shadow-sm` : "border-transparent px-0"
        )}>
          <div className="flex items-center justify-between">
            <Label className="text-base font-medium">Data Source</Label>
            {step1Complete && <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">Configured</Badge>}
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
        {/* 2. OUTPUT VARIABLE */}
        <div className={cn(
          "space-y-3 rounded-lg transition-all duration-300",
          !step1Complete ? inactiveClass : "",
          isStep2Active ? `${activeRingClass  } p-4 border border-green-500 bg-white shadow-sm` : "px-0"
        )}>
          <div className="flex items-center justify-between">
            <Label className="text-base font-medium">Output Variable</Label>
            {step2Complete && !isStep1Active && <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100"><span className="mr-1">✓</span> Ready</Badge>}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Variable Name</Label>
            <Input
              value={config.outputKey || ""}
              onChange={(e) => updateConfig({ outputKey: e.target.value })}
              placeholder="e.g. users_list"
              className="font-mono"
            />
            <p className="text-[11px] text-muted-foreground">
              This list variable will contain all rows found. Access properties via alias (e.g. <code>users_list[0].email</code>).
            </p>
          </div>
        </div>
        {/* 3. COLUMNS SELECTOR */}
        <div className={cn(
          "space-y-3 rounded-lg transition-all duration-300",
          !step2Complete ? inactiveClass : "",
          // If step2 is complete (has output), this is always potentially active along with settings
          // Actually, step 2 highlights Output. Once Output is done, Next steps (Settings/Columns) are available
          // We can use same ring class if interacted with or just keep available
        )}>
          <div className="flex items-center justify-between">
            <Label className="text-base font-medium">Columns</Label>
            <Badge variant="outline">{(config.columns === undefined || config.columns === null) ? `All (${columns?.length || 0})` : config.columns.length}</Badge>
          </div>
          <div className="bg-slate-50 border rounded-lg p-4 space-y-3">
            <div className="flex items-center space-x-2 pb-2 border-b border-slate-200">
              <input
                type="checkbox"
                id="all-cols"
                className="rounded border-gray-300"
                checked={config.columns === undefined || config.columns === null}
                onChange={(e) => {
                  if (e.target.checked) {
                    // Explicitly set columns to null to clear it from database
                    updateConfig({ columns: null, totalColumnCount: columns?.length || 0 });
                  } else {
                    // Default to all selected when switching to manual mode
                    updateConfig({ columns: columns?.map(c => c.id) || [], totalColumnCount: columns?.length || 0 });
                  }
                }}
              />
              <Label htmlFor="all-cols" className="font-medium cursor-pointer">
                Read All Columns
              </Label>
            </div>
            {/* Individual Columns List */}
            {config.columns !== undefined && config.columns !== null && (
              <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                {columns?.map((col) => {
                  const isSelected = config.columns?.includes(col.id);
                  return (
                    <div key={col.id} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`col-${col.id}`}
                        className="rounded border-gray-300"
                        checked={isSelected}
                        onChange={(e) => {
                          const current = config.columns || [];
                          let next: string[];
                          if (e.target.checked) {
                            next = [...current, col.id];
                          } else {
                            next = current.filter(id => id !== col.id);
                          }
                          updateConfig({ columns: next });
                        }}
                      />
                      <Label htmlFor={`col-${col.id}`} className="text-sm font-normal cursor-pointer truncate" title={col.name}>
                        {col.name}
                      </Label>
                    </div>
                  );
                })}
              </div>
            )}
            {(config.columns === undefined || config.columns === null) && (
              <div className="py-4 text-center text-xs text-muted-foreground italic">
                Retrieving all({columns?.length || 0}) fields.
              </div>
            )}
          </div>
        </div>
      </div>
      {/* RIGHT COLUMN: Settings, Order, Enabled */}
      <div className={cn(
        "space-y-6 border-l pl-6 transition-opacity duration-500",
        !step2Complete ? inactiveClass : "opacity-100"
      )}>
        {/* 3. FILTERS (Moved to Top of Right Column) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Filters</h3>
            <Badge variant="outline">{config.filters?.length || 0}</Badge>
          </div>
          <div className="bg-slate-50 border rounded-lg p-4 space-y-3">
            {(config.filters || []).map((filter, index) => (
              <div key={index} className="flex gap-2 items-start p-2 bg-white rounded border shadow-sm">
                <div className="grid grid-cols-3 gap-2 flex-1">
                  <Select
                    value={filter.columnId || "_clear"}
                    onValueChange={(val) => {
                      const newFilters = [...(config.filters || [])];
                      if (val === '_clear') {
                        newFilters[index] = { columnId: '', operator: 'equals', value: '' };
                      } else {
                        newFilters[index].columnId = val;
                      }
                      updateConfig({ filters: newFilters });
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Column" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_clear" className="text-muted-foreground italic">None</SelectItem>
                      {columns?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select
                    value={filter.operator}
                    onValueChange={(val: any) => {
                      const newFilters = [...(config.filters || [])];
                      newFilters[index].operator = val;
                      updateConfig({ filters: newFilters });
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="equals">Equals</SelectItem>
                      <SelectItem value="contains">Contains</SelectItem>
                      <SelectItem value="gt">Greater Than</SelectItem>
                      <SelectItem value="lt">Less Than</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={filter.value}
                    onChange={(e) => {
                      const newFilters = [...(config.filters || [])];
                      newFilters[index].value = e.target.value;
                      updateConfig({ filters: newFilters });
                    }}
                    className="h-8 text-xs"
                    placeholder="Value..."
                  />
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-500" onClick={() => {
                  const newFilters = [...(config.filters || [])];
                  newFilters.splice(index, 1);
                  updateConfig({ filters: newFilters });
                }}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full border-dashed" onClick={() => {
              updateConfig({ filters: [...(config.filters || []), { columnId: '', operator: 'equals', value: '' }] });
            }}>
              <Plus className="w-4 h-4 mr-2" />
              Add Filter
            </Button>
          </div>
        </div>
        <div className="h-px bg-gray-100 my-4" />
        <div className="space-y-4">
          <h3 className="font-semibold mb-4">Query Settings</h3>
          {/* Sorting */}
          <div className="space-y-2">
            <Label>Sort By</Label>
            <div className="flex gap-2">
              <Select value={config.sort?.columnId || "none"} onValueChange={(val) => {
                if (val === 'none') {
                  updateConfig({ sort: undefined });
                } else {
                  updateConfig({ sort: { columnId: val, direction: config.sort?.direction || 'asc' } });
                }
              }}>
                <SelectTrigger className="bg-white flex-1">
                  <SelectValue placeholder="No sorting" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {columns?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {config.sort && (
                <Select value={config.sort.direction} onValueChange={(val: 'asc' | 'desc') => {
                  updateConfig({ sort: { ...config.sort!, direction: val } });
                }}>
                  <SelectTrigger className="w-[100px] bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asc">Asc</SelectItem>
                    <SelectItem value="desc">Desc</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          {/* Limit */}
          <div className="space-y-2">
            <Label>Row Limit</Label>
            <Input
              type="number"
              value={config.limit || 100}
              onChange={(e) => updateConfig({ limit: parseInt(e.target.value) })}
              className="bg-white"
            />
            <p className="text-xs text-muted-foreground">Max rows to fetch (default 100).</p>
          </div>
          <div className="h-px bg-gray-100 my-4" />
          {/* Execution Phase */}
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