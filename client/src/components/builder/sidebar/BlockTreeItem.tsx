
import { Play, CheckCircle, GitBranch, Database, Save, Send, Code, Sparkles, Blocks, Lock, GripVertical, Trash2 } from "lucide-react";
import { type MouseEvent } from "react";

import { ConfirmationDialog } from "@/components/shared/ConfirmationDialog";
import { Button } from "@/components/ui/button";
import { Mode } from "@/lib/mode";
import { cn } from "@/lib/utils";
import { ApiBlock } from "@/lib/vault-api";
import { useDeleteBlock } from "@/lib/vault-hooks";

interface BlockTreeItemProps {
    block: ApiBlock;
    mode: Mode;
    onEdit: () => void;
    workflowId: string;
}

export function BlockTreeItem({ block, mode, onEdit, workflowId }: BlockTreeItemProps) {
    // Unlock editing for supported blocks in Easy Mode
    const isEditableInEasyMode = ['read_table', 'write', 'send_table', 'external_send', 'list_tools', 'query'].includes(block.type);
    const isLocked = mode === 'easy' && !isEditableInEasyMode;
    const deleteBlockMutation = useDeleteBlock();

    const handleDelete = () => {
        deleteBlockMutation.mutate({ id: block.id, workflowId });
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'prefill': return <Play className="w-3 h-3" />;
            case 'validate': return <CheckCircle className="w-3 h-3" />;
            case 'branch': return <GitBranch className="w-3 h-3" />;
            case 'query': case 'read_table': return <Database className="w-3 h-3" />;
            case 'write': case 'send_table': return <Save className="w-3 h-3" />;
            case 'external_send': return <Send className="w-3 h-3" />;
            case 'js': case 'transform': return <Code className="w-3 h-3" />;
            case 'list_tools': return <Sparkles className="w-3 h-3" />;
            default: return <Blocks className="w-3 h-3" />;
        }
    };

    const getLabel = (type: string) => {
        switch (type) {
            case 'read_table': return 'Read Table';
            case 'write': case 'send_table': return 'Send to Table';
            case 'external_send': return 'Send to API';
            case 'list_tools': return 'List Tool';
            case 'js': return 'Script';
            case 'query': return 'Read Data (Legacy)';
            default: return type;
        }
    };

    return (
        <div
            className={cn(
                "flex items-center gap-2 p-1.5 rounded-md text-sm transition-colors border border-transparent group",
                isLocked
                    ? "bg-slate-50 text-slate-400 cursor-not-allowed italic"
                    : "hover:bg-sidebar-accent/50 cursor-pointer text-slate-600"
            )}
            onClick={(e: MouseEvent) => {
                if (!isLocked) {
                    e.stopPropagation();
                    onEdit();
                }
            }}
            title={isLocked ? "This block type is only editable in Advanced Mode" : block.type}
            onKeyDown={(e) => {
                if (!isLocked && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onEdit();
                }
            }}
            tabIndex={isLocked ? -1 : 0}
        >
            <div className={cn("w-3 mr-1", isLocked ? "opacity-50" : "")}>
                {isLocked ? <Lock className="w-3 h-3" /> : <GripVertical className="w-3 h-3 text-muted-foreground" />}
            </div>
            <div className={cn(isLocked ? "opacity-50" : "text-indigo-500")}>
                {getIcon(block.type)}
            </div>
            <span className="flex-1 truncate text-xs font-medium">
                {getLabel(block.type)}
                {block.phase === 'onSectionEnter' ? ' (Enter)' : ' (Submit)'}
            </span>
            {/* Delete Action (Hover) */}
            {!isLocked && (
                <div className="opacity-0 group-hover:opacity-100 transition-opacity ml-1" onClick={(e) => e.stopPropagation()}>
                    <ConfirmationDialog
                        title="Delete Block?"
                        description="Are you sure you want to delete this block? This action cannot be undone."
                        variant="destructive"
                        onConfirm={handleDelete}
                        trigger={
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                title="Delete Block"
                            >
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        }
                    />
                </div>
            )}
        </div>
    );
}
