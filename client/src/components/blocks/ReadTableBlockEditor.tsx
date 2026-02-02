/**
 * Read Table Block Editor
 * Simplified UX for reading workflow data from DataVault tables
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { useTables } from "@/hooks/useDatavaultTables";
import { useTableColumns } from "@/hooks/useTableColumns";
import { cn } from "@/lib/utils";
import { dataSourceAPI } from "@/lib/vault-api";
import { useWorkflowDataSources } from "@/lib/vault-hooks";

import type { ReadTableConfig } from "@shared/types/blocks";

import { ReadTableColumnSelector } from "./read-table/ReadTableColumnSelector";
import { ReadTableFilterSelector } from "./read-table/ReadTableFilterSelector";
import { ReadTableSettings } from "./read-table/ReadTableSettings";
import { ReadTableSource } from "./read-table/ReadTableSource";

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


// Helper Interface for Native Table Data Source Config
interface NativeTableConfig {
  isNativeTable?: boolean;
  tableId?: string;
}

function isNativeTableConfig(config: unknown): config is NativeTableConfig {
  return typeof config === 'object' && config !== null && 'isNativeTable' in config;
}

interface FetchedTable {
  name: string;
  id?: string;
  type?: string;
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

  const dsConfig = selectedDataSource?.config;
  const isNative = isNativeTableConfig(dsConfig) && dsConfig.isNativeTable;

  // Fetch tables
  const { data: fetchedTables } = useQuery({
    queryKey: ["dataSource", config.dataSourceId, "tables"],
    queryFn: () => config.dataSourceId ? dataSourceAPI.getTables(config.dataSourceId) : Promise.resolve([]),
    enabled: !!config.dataSourceId && !isNative
  });

  const { data: allNativeTables } = useTables();
  let tables: { name: string; type: string; id: string }[] = [];

  if (fetchedTables) {
    tables = (fetchedTables as FetchedTable[]).map((t) => ({ ...t, type: t.type ?? 'unknown', id: t.id || t.name }));
  }

  if (isNative && isNativeTableConfig(dsConfig) && dsConfig.tableId) {
    const targetTable = allNativeTables?.find(t => t.id === dsConfig.tableId);
    if (targetTable) {
      tables = [{ name: targetTable.name, type: 'native', id: targetTable.id }];
    }
  }

  const resolvedTableId = config.tableId && tables.find(t => t.name === config.tableId || t.id === config.tableId)?.id;
  const { data: columns } = useTableColumns(resolvedTableId);

  const updateConfig = (updates: Partial<ReadTableConfig>) => {
    onChange({ ...config, ...updates });
  };

  // Auto-select table if native table proxy
  useEffect(() => {
    if (isNative && tables.length === 1 && config.tableId !== tables[0].id) {
      updateConfig({ tableId: tables[0].id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDataSource, tables, config.tableId]); // Intentionally omitting updateConfig

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

  const inactiveClass = "opacity-40 pointer-events-none grayscale-[0.5]";

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
      {/* LEFT COLUMN: Data Source, Table, Output, Columns */}
      <div className="space-y-6">
        <ReadTableSource
          config={config}
          dataSources={dataSources}
          tables={tables}
          onChange={updateConfig}
          step1Complete={step1Complete}
          step2Complete={step2Complete}
          isStep1Active={isStep1Active}
          isStep2Active={isStep2Active}
        />

        {/* 3. COLUMNS SELECTOR */}
        <div className={cn(
          "space-y-3 rounded-lg transition-all duration-300",
          !step2Complete ? inactiveClass : ""
        )}>
          <ReadTableColumnSelector
            config={config}
            columns={columns}
            onChange={updateConfig}
          />
        </div>
      </div>

      {/* RIGHT COLUMN: Settings, Order, Enabled */}
      <div className={cn(
        "space-y-6 border-l pl-6 transition-opacity duration-500",
        !step2Complete ? inactiveClass : "opacity-100"
      )}>
        <ReadTableFilterSelector
          config={config}
          columns={columns}
          onChange={updateConfig}
        />

        <div className="h-px bg-gray-100 my-4" />

        <ReadTableSettings
          config={config}
          columns={columns}
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