
import { ChevronDown, ChevronRight, Target } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ApiStep } from "@/lib/vault-api";

import type { ListToolsConfig } from "@shared/types/blocks";

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
    // Get list variables from workflow
    const listVariables = (steps ?? []).filter(step =>
        step.type === 'computed' && step.alias && step.alias.length > 0
    );

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
                                {listVariables.length === 0 && (
                                    <div className="p-2 text-xs text-muted-foreground">
                                        No list variables found. Create a Read Table or Query block first.
                                    </div>
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
