
import { Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
    type ValidateRule,
    type CompareRule,
    type ConditionalRequiredRule,
    type ForEachRule
} from "@shared/types/blocks";

import { CompareRuleEditor } from "./CompareRuleEditor";
import { ConditionalRequiredRuleEditor } from "./ConditionalRequiredRuleEditor";
import { ForEachRuleEditor } from "./ForEachRuleEditor";

interface RuleCardProps {
    rule: ValidateRule;
    index: number;
    onUpdate: (r: ValidateRule) => void;
    onDelete: () => void;
    workflowId: string;
}

export function RuleCard({ rule, index, onUpdate, onDelete, workflowId }: RuleCardProps) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- Loose typing on rule discrimination
    const type = (rule as any).type || 'simple';

    return (
        <Card className="relative group">
            <div className="absolute top-2 right-2">
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={onDelete}>
                    <Trash2 className="h-3 w-3" />
                </Button>
            </div>
            <CardContent className="p-3 pt-3 space-y-3">
                <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                        {(type as string).replace('_', ' ')}
                    </Badge>
                    <span className="text-xs text-muted-foreground">Rule #{index + 1}</span>
                </div>
                {type === 'compare' && (
                    <CompareRuleEditor rule={rule as CompareRule} onChange={onUpdate} workflowId={workflowId} />
                )}
                {type === 'conditional_required' && (
                    <ConditionalRequiredRuleEditor rule={rule as ConditionalRequiredRule} onChange={onUpdate} workflowId={workflowId} />
                )}
                {type === 'foreach' && (
                    <ForEachRuleEditor rule={rule as ForEachRule} onChange={onUpdate} workflowId={workflowId} />
                )}
                {(type === 'simple' || !type) && (
                    <div className="text-sm text-yellow-600 bg-yellow-50 p-2 rounded">
                        Legacy/Advanced Rule (Edit in JSON mode)
                    </div>
                )}
                <div className="pt-2 border-t mt-2">
                    <Label className="text-xs text-muted-foreground">Error Message</Label>
                    <Input
                        value={rule.message}
                        onChange={(e) => onUpdate({ ...rule, message: e.target.value })}
                        className="h-7 text-xs mt-1"
                        placeholder="Error message displayed to user..."
                    />
                </div>
            </CardContent>
        </Card>
    );
}
