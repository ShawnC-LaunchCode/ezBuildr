
import { Package } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SnipDefinition } from "@/lib/snips/types";

interface SnipCardProps {
    snip: SnipDefinition;
    isSelected: boolean;
    onSelect: (id: string) => void;
}

export function SnipCard({ snip, isSelected, onSelect }: SnipCardProps) {
    return (
        <Card
            className={`cursor-pointer transition-all ${isSelected
                ? "ring-2 ring-indigo-500 border-indigo-500"
                : "hover:border-indigo-300"
                }`}
            onClick={() => { onSelect(snip.id); }}
        >
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                    <div>
                        <CardTitle className="text-base">{snip.displayName}</CardTitle>
                        <CardDescription className="text-sm mt-1">
                            {snip.description}
                        </CardDescription>
                    </div>
                    {snip.category && (
                        <Badge variant="secondary" className="ml-2">
                            {snip.category}
                        </Badge>
                    )}
                </div>
            </CardHeader>
            <CardContent className="pt-0">
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{snip.pages.length} page{snip.pages.length !== 1 ? 's' : ''}</span>
                    <span>
                        {snip.pages.reduce((sum, p) => sum + p.questions.length, 0)} question
                        {snip.pages.reduce((sum, p) => sum + p.questions.length, 0) !== 1 ? 's' : ''}
                    </span>
                    <span className="ml-auto font-mono">v{snip.version}</span>
                </div>
            </CardContent>
        </Card>
    );
}

export function SnipEmptyState() {
    return (
        <div className="text-center py-8 text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No snips available yet</p>
        </div>
    );
}
