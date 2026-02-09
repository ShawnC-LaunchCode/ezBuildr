
import { FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SidebarEmptyStateProps {
    onAddPage: () => void;
}

export function SidebarEmptyState({ onAddPage }: SidebarEmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center py-8 text-center px-4 animate-in fade-in duration-500">
            <div className="p-3 bg-indigo-50 rounded-full mb-3 ring-4 ring-indigo-50/50">
                <FileText className="w-5 h-5 text-indigo-600" />
            </div>
            <h4 className="font-medium text-sm text-foreground mb-1">Start Building</h4>
            <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                Pages are the main steps of your workflow. Add one to begin.
            </p>
            <div className="relative">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-0.5 h-3 bg-indigo-200"></div>
                <Button onClick={onAddPage} size="sm" className="bg-indigo-600 hover:bg-indigo-700 shadow-sm">
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Add First Page
                </Button>
            </div>
        </div>
    );
}
