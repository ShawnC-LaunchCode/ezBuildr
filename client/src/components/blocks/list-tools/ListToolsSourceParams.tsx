
import { ChevronDown, ChevronRight, Target } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ApiStep } from "@/lib/vault-api";

import type { ListToolsConfig } from "@shared/types/blocks";

import { selectListSourceVariables } from "./listSourceVariables";

interface ListToolsSourceParamsProps {
    config: Partial<ListToolsConfig>;
    onChange: (updates: Partial<ListToolsConfig>) => void;
    expanded: boolean;
    onToggle: () => void;
    steps: ApiStep[] | undefined;
}

export function ListToolsSourceParams({
    config,
    onChange,
    expanded,
    onToggle,
    steps
}: ListToolsSourceParamsProps) {
    // Get list variables from workflow (LIST-B1)
    const listVariables = selectListSourceVariables(steps, config.outputListVar);
    // A saved source that no longer appears in the list (its block was deleted,
    // or it was seeded by hand) still has to render, or the trigger goes blank
    // with a value set and the block looks unconfigured.
    const orphanedSource = config.sourceListVar && !listVariables.some(v => v.alias === config.sourceListVar)
        ? config.sourceListVar
        : null;

    return (
        <Card className="border-green-200 bg-green-50/30">
            <CardHeader className="pb-3 cursor-pointer" onClick={onToggle}>
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        <Target className="w-4 h-4 text-green-600" />
                        Source & Output
                    </CardTitle>
                    {config.sourceListVar && config.outputListVar && (
                        <Badge variant="outline" className="text-xs bg-green-100 border-green-300">
                            {config.sourceListVar} → {config.outputListVar}
                        </Badge>
                    )}
                </div>
            </CardHeader>
            {expanded && (
                <CardContent className="space-y-3 pt-0">
                    <div className="space-y-2">
                        <Label className="text-xs">Source List Variable</Label>
                        <Select
                            value={config.sourceListVar ?? ""}
                            onValueChange={(value) => onChange({ sourceListVar: value })}
                        >
                            <SelectTrigger className="bg-background">
                                <SelectValue placeholder="Select source list..." />
                            </SelectTrigger>
                            <SelectContent>
                                {listVariables.length === 0 && !orphanedSource && (
                                    <div className="p-2 text-xs text-muted-foreground">
                                        No list variables yet. Add a Read Table, Query, or List Tools block to produce one.
                                    </div>
                                )}
                                {orphanedSource && (
                                    <SelectItem value={orphanedSource}>
                                        {orphanedSource} (not found in this workflow)
                                    </SelectItem>
                                )}
                                {listVariables.map((variable) => (
                                    <SelectItem key={variable.id} value={variable.alias ?? ""}>
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
                            value={config.outputListVar ?? ""}
                            onChange={(e) => onChange({ outputListVar: e.target.value })}
                        />
                        <p className="text-[11px] text-muted-foreground">
                            Name for the transformed list output
                        </p>
                    </div>
                </CardContent>
            )}
        </Card>
    );
}
