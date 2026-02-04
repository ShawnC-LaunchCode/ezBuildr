
import { Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import type { ApiTransformBlock } from "@/lib/vault-api";
import { useDeleteTransformBlock, useWorkflowVariables } from "@/lib/vault-hooks";

export function TransformBlockCard({
    block,
    workflowId,
    onEdit
}: {
    block: ApiTransformBlock;
    workflowId: string;
    onEdit: (block: ApiTransformBlock) => void
}) {
    const deleteMutation = useDeleteTransformBlock();
    const { toast } = useToast();
    const { data: variables = [] } = useWorkflowVariables(workflowId);

    const getVariableDisplayName = (key: string) => {
        const variable = variables.find((v) => v.key === key);
        return variable?.alias ?? key;
    };

    const handleDelete = async () => {
        try {
            await deleteMutation.mutateAsync({ id: block.id, workflowId });
            toast({ title: "Success", description: "Transform block deleted" });
        } catch (error) {
            toast({ title: "Error", description: "Failed to delete block", variant: "destructive" });
        }
    };

    const displayInputKeys = block.inputKeys.map(getVariableDisplayName).join(", ") || "none";

    return (
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => { onEdit(block); }}>
            <CardContent className="p-3">
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">{block.name}</span>
                            <Badge variant="outline" className="text-xs">
                                {block.language}
                            </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground space-y-0.5">
                            <div>Phase: {block.phase || "onSectionSubmit"}</div>
                            <div>Inputs: {displayInputKeys}</div>
                            <div>Output: {block.outputKey}</div>
                            <div>Order: {block.order} • {block.enabled ? "Enabled" : "Disabled"}</div>
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => {
                            e.stopPropagation();
                            void handleDelete();
                        }}
                    >
                        <Trash2 className="h-3 w-3" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
