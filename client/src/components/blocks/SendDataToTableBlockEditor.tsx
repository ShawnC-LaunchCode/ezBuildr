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

import type { WriteBlockConfig } from "@shared/types/blocks";

import { useWriteTableMapping } from "./send-data/useWriteTableMapping";
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
    tables = (fetchedTables as FetchedTable[]).map((t) => ({ ...t, type: t.type ?? 'unknown', id: t.id ?? t.name }));
  }

  if (isNative && isNativeTableConfig(dsConfig) && dsConfig.tableId) {
    const targetTable = allNativeTables?.find(t => t.id === dsConfig.tableId);
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
    if (isNative && tables.length === 1 && config.tableId !== tables[0].id) {
      updateConfig({ tableId: tables[0].id });
    }

  }, [selectedDataSource, tables, config.tableId]); // Intentionally omitting updateConfig

  // Auto-mapping and Validation Logic encapsulated in hook
  const {
    duplicateColumns,
    missingRequiredColumns,
    incompleteRows,
    hasValidMappings
  } = useWriteTableMapping({ config, columns, onChange: updateConfig });

  const hasDestination = !!config.dataSourceId && !!config.tableId;

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