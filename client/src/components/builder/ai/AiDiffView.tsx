import { Plus, Edit, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
interface DiffChange {
    type: 'add' | 'modify' | 'remove';
    entity: 'section' | 'step' | 'logic';
    name: string;
    details?: string;
}
interface AiDiffViewProps {
    suggestions: any;
}
export function AiDiffView({ suggestions }: AiDiffViewProps) {
    // Parse suggestions into a flat list of changes for display
    const changes: DiffChange[] = [];
    if (suggestions.newSections) {
        suggestions.newSections.forEach((s: any) => {
            changes.push({ type: 'add', entity: 'section', name: s.title, details: `${s.steps?.length || 0} steps` });
        });
    }
    if (suggestions.newSteps) {
        suggestions.newSteps.forEach((s: any) => {
            changes.push({ type: 'add', entity: 'step', name: s.title, details: s.type });
        });
    }
    // Hypothetical 'modifications' structure from AI
    if (suggestions.modifications) {
        suggestions.modifications.forEach((m: any) => {
            changes.push({ type: 'modify', entity: m.entity, name: m.name, details: m.reason });
        });
    }
    return (
        <div className="space-y-2 text-xs">
            {changes.length === 0 && (
                <div className="text-muted-foreground italic">No structural changes detected.</div>
            )}
            {changes.map((change, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-white rounded border select-none">
                    <ChangeIcon type={change.type} />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <span className={cn("font-medium", getChangeColor(change.type))}>
                                {change.type === 'add' ? 'Create' : change.type === 'modify' ? 'Update' : 'Remove'}
                            </span>
                            <Badge variant="outline" className="text-[10px] px-1 h-4">{change.entity}</Badge>
                        </div>
                        <div className="truncate text-slate-700 mt-0.5">
                            {change.name}
                        </div>
                    </div>
                    {change.details && (
                        <div className="text-[10px] text-muted-foreground bg-slate-50 px-1.5 py-0.5 rounded border">
                            {change.details}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
function ChangeIcon({ type }: { type: DiffChange['type'] }) {
    switch (type) {
        case 'add': return <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0"><Plus className="w-3 h-3 text-emerald-600" /></div>;
        case 'modify': return <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center shrink-0"><Edit className="w-3 h-3 text-amber-600" /></div>;
        case 'remove': return <div className="w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center shrink-0"><Minus className="w-3 h-3 text-rose-600" /></div>;
    }
}
function getChangeColor(type: DiffChange['type']) {
    switch (type) {
        case 'add': return "text-emerald-700";
        case 'modify': return "text-amber-700";
        case 'remove': return "text-rose-700";
    }
}