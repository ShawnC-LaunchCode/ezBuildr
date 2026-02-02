import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ApiDataSource } from "@/lib/vault-api";

import type { ReadTableConfig } from "@shared/types/blocks";

interface ReadTableSourceProps {
    config: ReadTableConfig;
    dataSources?: ApiDataSource[];
    tables: { name: string; type: string; id: string }[];
    onChange: (updates: Partial<ReadTableConfig>) => void;
    step1Complete: boolean;
    step2Complete: boolean;
    isStep1Active: boolean;
    isStep2Active: boolean;
}

export function ReadTableSource({
    config,
    dataSources,
    tables,
    onChange,
    step1Complete,
    step2Complete,
    isStep1Active,
    isStep2Active
}: ReadTableSourceProps) {
    const activeRingClass = "ring-2 ring-green-500 ring-offset-2 bg-green-50/50";
    const inactiveClass = "opacity-40 pointer-events-none grayscale-[0.5]";

    return (
        <>
            {/* 1. DATA SOURCE & TABLE */}
            <div className={cn(
                "space-y-3 p-4 rounded-lg transition-all duration-300 border",
                isStep1Active ? `${activeRingClass} border-green-500 bg-white shadow-sm` : "border-transparent px-0"
            )}>
                <div className="flex items-center justify-between">
                    <Label className="text-base font-medium">Data Source</Label>
                    {step1Complete && <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">Configured</Badge>}
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

            {/* 2. OUTPUT VARIABLE */}
            <div className={cn(
                "space-y-3 rounded-lg transition-all duration-300",
                !step1Complete ? inactiveClass : "",
                isStep2Active ? `${activeRingClass} p-4 border border-green-500 bg-white shadow-sm` : "px-0"
            )}>
                <div className="flex items-center justify-between">
                    <Label className="text-base font-medium">Output Variable</Label>
                    {step2Complete && !isStep1Active && <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100"><span className="mr-1">✓</span> Ready</Badge>}
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Variable Name</Label>
                    <Input
                        value={config.outputKey ?? ""}
                        onChange={(e) => onChange({ outputKey: e.target.value })}
                        placeholder="e.g. users_list"
                        className="font-mono"
                    />
                    <p className="text-[11px] text-muted-foreground">
                        This list variable will contain all rows found. Access properties via alias (e.g. <code>users_list[0].email</code>).
                    </p>
                </div>
            </div>
        </>
    );
}
