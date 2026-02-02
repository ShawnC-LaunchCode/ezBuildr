import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DatavaultColumn } from "@/lib/types/datavault";
import { cn } from "@/lib/utils";
import type { ApiDataSource } from "@/lib/vault-api";

import type { WriteBlockConfig, MatchStrategy } from "@shared/types/blocks";

interface WriteTableSourceProps {
    config: WriteBlockConfig;
    dataSources?: ApiDataSource[];
    tables: { name: string; type: string; id: string }[];
    columns?: DatavaultColumn[];
    variables: { key: string }[];
    onChange: (updates: Partial<WriteBlockConfig>) => void;
    step1Complete: boolean;
    isStep1Active: boolean;
}

export function WriteTableSource({
    config,
    dataSources,
    tables,
    columns,
    variables,
    onChange,
    step1Complete,
    isStep1Active
}: WriteTableSourceProps) {
    const activeRingClass = "ring-2 ring-emerald-500 ring-offset-2 bg-emerald-50/20";

    return (
        <>
            {/* 1. DESTINATION */}
            <div className={cn(
                "space-y-3 p-4 rounded-lg transition-all duration-300 border",
                isStep1Active ? `${activeRingClass} border-emerald-500 bg-white shadow-sm` : "border-transparent px-0"
            )}>
                <div className="flex items-center justify-between">
                    <Label className="text-base font-medium">Destination</Label>
                    {step1Complete && <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50">Configured</Badge>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Data Source</Label>
                        <Select value={config.dataSourceId ?? ""} onValueChange={(val) => onChange({ dataSourceId: val, tableId: '' })}>
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
                        <Select value={config.tableId ?? ""} onValueChange={(val) => onChange({ tableId: val })} disabled={!config.dataSourceId}>
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

            {/* MATCH CONFIG (Only for Update/Upsert) */}
            {(config.mode === 'update' || config.mode === 'upsert') && (
                <div className={cn(
                    "space-y-3 transition-opacity duration-300",
                    !step1Complete ? "opacity-30 pointer-events-none" : "opacity-100"
                )}>
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded space-y-3">
                        <p className="text-xs font-medium text-amber-900">Match Configuration (for {config.mode})</p>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1.5">
                                <Label className="text-xs">Match Column</Label>
                                <Select
                                    value={config.matchStrategy?.columnId ?? ""}
                                    onValueChange={(val) => onChange({
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
                                    value={config.matchStrategy?.columnValue ?? ""}
                                    onValueChange={(val) => onChange({
                                        matchStrategy: {
                                            ...config.matchStrategy,
                                            type: 'column_match',
                                            columnValue: val === "___clear___" ? "" : val
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
                                        {variables.map(v => (
                                            <SelectItem key={v.key} value={`{{${v.key}}}`}>{v.key}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <p className="text-[10px] text-amber-800/80">
                            We look for a row where <strong>Match Column</strong> equals <strong>Match Value</strong>.
                            {config.mode === 'update' && " If not found, the workflow will fail."}
                            {config.mode === 'upsert' && " If not found, a new row will be created."}
                        </p>
                    </div>
                </div>
            )}
        </>
    );
}
