/**
 * Send Data to Table Block Editor
 * Simplified UX for writing workflow data to DataVault tables
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { useTables } from "@/hooks/useDatavaultTables";
import { useTableColumns } from "@/hooks/useTableColumns";
import { cn } from "@/lib/utils";
import { dataSourceAPI } from "@/lib/vault-api";
import { useWorkflowDataSources, useWorkflowVariables } from "@/lib/vault-hooks";

import type { WriteBlockConfig, ColumnMapping } from "@shared/types/blocks";

import { WriteTableMapping } from "./send-data/WriteTableMapping";
import { WriteTableSettings } from "./send-data/WriteTableSettings";
import { WriteTableSource } from "./send-data/WriteTableSource";

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
    enabled: !!config.dataSourceId && !((selectedDataSource?.config as any)?.isNativeTable)
  });

  const { data: allNativeTables } = useTables();
  let tables: { name: string; type: string; id: string }[] = [];

  if (fetchedTables) {
    tables = fetchedTables.map((t: any) => ({ ...t, id: t.id || t.name }));
  }

  if ((selectedDataSource?.config as any)?.isNativeTable && (selectedDataSource?.config as any)?.tableId) {
    const targetTable = allNativeTables?.find(t => t.id === (selectedDataSource?.config as any).tableId);
    if (targetTable) {
      tables = [{ name: targetTable.name, type: 'native', id: targetTable.id }];
    }
  }

  const resolvedTableId = config.tableId && tables.find(t => t.name === config.tableId || t.id === config.tableId)?.id;
  const { data: columns } = useTableColumns(resolvedTableId);

  const updateConfig = (updates: Partial<WriteBlockConfig>) => {
    onChange({ ...config, ...updates });
  };

  // Auto-select table if native table proxy
  useEffect(() => {
    if ((selectedDataSource?.config as any)?.isNativeTable && tables.length === 1 && config.tableId !== tables[0].id) {
      updateConfig({ tableId: tables[0].id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDataSource, tables, config.tableId]); // Intentionally omitting updateConfig

  // Auto-add required columns and clean up duplicates
  useEffect(() => {
    if (config.tableId && columns && columns.length > 0) {
      const existingMappings = config.columnMappings ?? [];
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
        if (m.columnId) { seenIds.add(m.columnId); }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.tableId, columns, config.columnMappings?.length]); // Intentionally robust deps

  // Validation
  const getDuplicateColumns = () => {
    const mappings = config.columnMappings ?? [];
    const columnCounts = mappings.reduce((acc, m) => {
      if (m.columnId) { acc[m.columnId] = (acc[m.columnId] || 0) + 1; }
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(columnCounts).filter(([_, count]) => count > 1).map(([colId, _]) => colId);
  };

  const getMissingRequiredColumns = () => {
    if (!columns) { return []; }
    const requiredCols = columns.filter(c => c.required);
    const mappedColIds = (config.columnMappings ?? []).map(m => m.columnId);
    return requiredCols.filter(c => !mappedColIds.includes(c.id));
  };

  const getIncompleteRows = () => {
    return (config.columnMappings ?? []).filter(m => !m.columnId || !m.value || m.value.trim() === '');
  };

  const duplicateColumns = getDuplicateColumns();
  const missingRequiredColumns = getMissingRequiredColumns();
  const incompleteRows = getIncompleteRows();

  const hasDestination = !!config.dataSourceId && !!config.tableId;
  const hasMappings = (config.columnMappings?.length || 0) > 0;
  const hasValidMappings = hasMappings && duplicateColumns.length === 0 && missingRequiredColumns.length === 0;

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

  const inactiveClass = "opacity-40 pointer-events-none grayscale-[0.5]";

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
      {/* LEFT COLUMN: Destination, Match, Mappings */}
      <div className="space-y-6">
        <WriteTableSource
          config={config}
          dataSources={dataSources}
          tables={tables}
          columns={columns}
          variables={variables}
          onChange={updateConfig}
          step1Complete={step1Complete}
          isStep1Active={isStep1Active}
        />

        <WriteTableMapping
          config={config}
          columns={columns}
          variables={variables}
          onChange={updateConfig}
          validationErrors={{ duplicateColumns, missingRequiredColumns, incompleteRows }}
          step2Complete={step2Complete}
          isStep2Active={isStep2Active}
        />
      </div>

      {/* RIGHT COLUMN: Settings */}
      <div className={cn(
        "space-y-6 border-l pl-6 transition-opacity duration-500",
        !step2Complete ? inactiveClass : "opacity-100"
      )}>
        <WriteTableSettings
          config={config}
          phase={phase}
          order={order}
          enabled={enabled}
          onChange={updateConfig}
          onPhaseChange={onPhaseChange}
          onOrderChange={onOrderChange}
          onEnabledChange={onEnabledChange}
        />
      </div>
    </div>
  );
}