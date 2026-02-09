
import { FileCheck, FileText, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UI_LABELS } from "@/lib/labels";

interface SidebarHeaderProps {
    onAddPage: () => void;
    onAddFinalDocs: () => void;
    onAiAssist: () => void;
    onAddSnip: () => void;
}

export function SidebarHeader({
    onAddPage,
    onAddFinalDocs,
    onAiAssist,
    onAddSnip,
}: SidebarHeaderProps) {
    return (
        <div className="p-4 border-b space-y-2">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button size="sm" className="w-full">
                        <Plus className="w-4 h-4 mr-2" />
                        {UI_LABELS.ADD_PAGE}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuItem onClick={onAddPage}>
                        <FileText className="w-4 h-4 mr-2" />
                        Regular Page
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onAddFinalDocs}>
                        <FileCheck className="w-4 h-4 mr-2" />
                        Final Documents Section
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {/* AI Assistant Button */}
            <Button
                variant="outline"
                size="sm"
                className="w-full border-dashed border-indigo-300 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800"
                onClick={onAiAssist}
            >
                <Sparkles className="w-3 h-3 mr-2" />
                Edit with AI
            </Button>

            {/* Add Snip Button */}
            <Button
                variant="outline"
                size="sm"
                className="w-full border-dashed border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                onClick={onAddSnip}
            >
                <Plus className="w-3 h-3 mr-2" />
                Add Snip
            </Button>
        </div>
    );
}
