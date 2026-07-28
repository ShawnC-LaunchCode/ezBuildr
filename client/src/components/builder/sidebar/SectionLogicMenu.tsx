
import { Zap, Save, Database, Send, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type Mode } from "@/lib/mode";

interface SectionLogicMenuProps {
    mode: Mode;
    onAddBlock: (type: "write" | "read_table" | "list_tools" | "external_send") => void;
}

export function SectionLogicMenu({ mode, onAddBlock }: SectionLogicMenuProps) {
    if (mode !== 'easy' && mode !== 'advanced') { return null; }

    const handleSelect = (type: "write" | "read_table" | "list_tools" | "external_send") => (e: React.MouseEvent) => {
        e.stopPropagation();
        onAddBlock(type);
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    title="Add Action"
                    onClick={(e) => { e.stopPropagation(); }}
                >
                    <Zap className="h-3 w-3" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleSelect("write")}>
                    <Save className="w-3 h-3 mr-2" />
                    Send Data to Table
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSelect("read_table")}>
                    <Database className="w-3 h-3 mr-2" />
                    Read from Table
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSelect("external_send")}>
                    <Send className="w-3 h-3 mr-2" />
                    Send Data to API
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSelect("list_tools")}>
                    <Sparkles className="w-3 h-3 mr-2" />
                    List Tools
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
