
import { AlertCircle, CheckCircle, Edit, TestTube, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface Template {
    id: string;
    name: string;
    key: string;
    type: "docx" | "pdf";
    lastUpdated: string;
    fileSize?: number;
    variables?: string[];
}

interface TemplateCardProps {
    template: Template;
    workflowVariableAliases: Set<string>;
    onEdit: (template: Template) => void;
    onTest: (id: string) => void;
    onDelete: (id: string, name: string) => void;
}

export function TemplateCard({
    template,
    workflowVariableAliases,
    onEdit,
    onTest,
    onDelete
}: TemplateCardProps) {
    // Helper to check variable status
    const getVariableStatus = (templateVars: string[]) => {
        const missing = templateVars.filter(v => !workflowVariableAliases.has(v));
        const matched = templateVars.filter(v => workflowVariableAliases.has(v));
        return { missing, matched, total: templateVars.length };
    };

    const { missing, matched, total } = getVariableStatus(template.variables ?? []);
    const hasMissing = missing.length > 0;

    return (
        <Card className="flex flex-col hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
                <div className="flex justify-between items-start gap-4">
                    <div className="min-w-0">
                        <CardTitle className="text-base truncate leading-tight" title={template.name}>
                            {template.name}
                        </CardTitle>
                        <CardDescription className="font-mono text-[10px] mt-1 text-slate-400 truncate">
                            {template.key}
                        </CardDescription>
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0 h-5 font-normal text-slate-500">
                        {template.type.toUpperCase()}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="flex-1 space-y-4">
                {/* Variable Analysis Feedback */}
                <div className="rounded-md bg-slate-50 p-3 text-xs space-y-2 border border-slate-100">
                    <div className="flex items-center justify-between font-medium">
                        <span className="text-slate-500">Variables</span>
                        {hasMissing ? (
                            <span className="text-amber-600 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                {missing.length} missing
                            </span>
                        ) : (
                            <span className="text-emerald-600 flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" />
                                {matched.length}/{total} matched
                            </span>
                        )}
                    </div>
                    {/* Progress Bar */}
                    <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div
                            className={cn("h-full transition-all", hasMissing ? "bg-amber-500" : "bg-emerald-500")}
                            style={{ width: `${total > 0 ? (matched.length / total) * 100 : 100}%` }}
                        />
                    </div>
                    {hasMissing && (
                        <div className="pt-2 border-t border-slate-200/50 mt-2">
                            <p className="font-semibold text-amber-700 mb-1.5">Create these variables:</p>
                            <div className="flex flex-wrap gap-1">
                                {missing.slice(0, 3).map(v => (
                                    <code key={v} className="bg-white text-amber-700 px-1 py-0.5 rounded border border-amber-200 shadow-sm text-[10px]">
                                        {v}
                                    </code>
                                ))}
                                {missing.length > 3 && <span className="text-amber-600 text-[10px] self-center">+{missing.length - 3}</span>}
                            </div>
                        </div>
                    )}
                </div>
            </CardContent>
            <CardFooter className="pt-0 flex gap-2 justify-end border-t bg-slate-50/30 p-3">
                <Button size="sm" variant="default" className="h-7 text-xs px-3 shadow-sm" onClick={() => onEdit(template)}>
                    <Edit className="w-3 h-3 mr-1.5" />
                    {template.type === 'pdf' ? 'Map Fields' : 'Preview'}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onTest(template.id)} title="Test Generation">
                    <TestTube className="w-3.5 h-3.5 text-slate-500" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:bg-destructive/10 hover:text-destructive text-slate-400" onClick={() => onDelete(template.id, template.name)} title="Delete Template">
                    <Trash2 className="w-3.5 h-3.5" />
                </Button>
            </CardFooter>
        </Card>
    );
}
