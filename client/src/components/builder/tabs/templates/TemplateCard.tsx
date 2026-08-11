
import { Edit, TestTube, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { TemplateVariableHealth } from "@/components/builder/templates/TemplateVariableHealth";

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
    workflowId: string;
    workflowVariableAliases: Set<string>;
    onEdit: (template: Template) => void;
    onTest: (id: string) => void;
    onDelete: (id: string, name: string) => void;
}

export function TemplateCard({
    template,
    workflowId,
    workflowVariableAliases,
    onEdit,
    onTest,
    onDelete
}: TemplateCardProps) {
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
                <TemplateVariableHealth
                    templateId={template.id}
                    templateType={template.type}
                    templateVariables={template.variables}
                    workflowId={workflowId}
                    workflowVariableAliases={workflowVariableAliases}
                />
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
