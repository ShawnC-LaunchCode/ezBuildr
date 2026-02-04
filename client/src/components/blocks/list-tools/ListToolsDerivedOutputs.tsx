
import { ChevronDown, ChevronRight, Hash } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { ListToolsConfig } from "@shared/types/blocks";

interface ListToolsDerivedOutputsProps {
    config: Partial<ListToolsConfig>;
    onChange: (updates: Partial<ListToolsConfig>) => void;
    expanded: boolean;
    onToggle: () => void;
}

export function ListToolsDerivedOutputs({
    config,
    onChange,
    expanded,
    onToggle
}: ListToolsDerivedOutputsProps) {
    return (
        <Card className="border-pink-200 bg-pink-50/30">
            <CardHeader className="pb-3 cursor-pointer" onClick={onToggle}>
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        <Hash className="w-4 h-4 text-pink-600" />
                        Derived Outputs
                    </CardTitle>
                </div>
            </CardHeader>
            {expanded && (
                <CardContent className="space-y-3 pt-0">
                    <div className="space-y-2">
                        <Label className="text-xs">Count Variable (optional)</Label>
                        <Input
                            className="h-8 text-xs font-mono bg-background"
                            placeholder="e.g., user_count"
                            value={config.outputs?.countVar ?? ''}
                            onChange={(e) => onChange({
                                outputs: {
                                    ...config.outputs,
                                    countVar: e.target.value || undefined
                                }
                            })}
                        />
                        <p className="text-[11px] text-muted-foreground">
                            Store the number of rows as a separate variable
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs">First Row Variable (optional)</Label>
                        <Input
                            className="h-8 text-xs font-mono bg-background"
                            placeholder="e.g., top_user"
                            value={config.outputs?.firstVar ?? ''}
                            onChange={(e) => onChange({
                                outputs: {
                                    ...config.outputs,
                                    firstVar: e.target.value || undefined
                                }
                            })}
                        />
                        <p className="text-[11px] text-muted-foreground">
                            Store the first row as a separate variable
                        </p>
                    </div>
                </CardContent>
            )}
        </Card>
    );
}
