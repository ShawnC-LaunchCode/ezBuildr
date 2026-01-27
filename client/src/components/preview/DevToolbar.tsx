import { formatDistanceToNow } from "date-fns";
import {
    Play,
    RotateCcw,
    Wand2,
    Save,
    Files,
    ChevronDown,
    X,
    Bug
} from "lucide-react";
import React, { useState } from "react";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useSnapshots } from "@/lib/vault-hooks";
interface DevToolbarProps {
    workflowId: string;
    onExit: () => void;
    onReset: () => void;
    onRandomFill: () => void;
    onRandomFillPage: () => void;
    onLoadSnapshot: (snapshotId: string) => void;
    onToggleDevTools: () => void;
    showDevTools: boolean;
    isAiLoading?: boolean;
}
export function DevToolbar({
    workflowId,
    onExit,
    onReset,
    onRandomFill,
    onRandomFillPage,
    onLoadSnapshot,
    onToggleDevTools,
    showDevTools,
    isAiLoading
}: DevToolbarProps) {
    const { data: snapshots } = useSnapshots(workflowId);
    const [selectedSnapshot, setSelectedSnapshot] = useState<string>("");
    const handleSnapshotSelect = (snapshotId: string) => {
        setSelectedSnapshot(snapshotId);
        onLoadSnapshot(snapshotId);
    };
    return (
        <div className="h-14 border-b bg-muted/40 flex items-center justify-between px-4 shrink-0">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                        <span className="text-sm font-semibold text-foreground">Client View Preview</span>
                        <span className="text-[10px] text-muted-foreground">
                            This is exactly what your client will see.
                        </span>
                    </div>
                </div>
                <Separator orientation="vertical" className="h-6" />
                {/* Snapshot Selector */}
                <div className="flex items-center gap-2">
                    <Files className="w-4 h-4 text-muted-foreground" />
                    <Select value={selectedSnapshot} onValueChange={handleSnapshotSelect}>
                        <SelectTrigger className="w-[200px] h-8 text-xs">
                            <SelectValue placeholder="Load Snapshot..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">None (Reset)</SelectItem>
                            {snapshots?.map((snap: any) => (
                                <SelectItem key={snap.id} value={snap.id}>
                                    <div className="flex flex-col items-start">
                                        <span>{snap.name}</span>
                                        <span className="text-[10px] text-muted-foreground">
                                            {formatDistanceToNow(new Date(snap.createdAt), { addSuffix: true })}
                                        </span>
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
            <div className="flex items-center gap-2">
                {/* Random Data Actions */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 gap-2" disabled={isAiLoading}>
                            <Wand2 className="w-3.5 h-3.5" />
                            {isAiLoading ? "Generating..." : "Auto-Fill"}
                            <ChevronDown className="w-3 h-3 opacity-50" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuLabel>AI Randomizer</DropdownMenuLabel>
                        <DropdownMenuItem onClick={onRandomFillPage}>
                            Fill Current Page
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={onRandomFill}>
                            Fill & Run Entire Workflow
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={onReset}
                    title="Reset Preview"
                >
                    <RotateCcw className="w-4 h-4" />
                </Button>
                <Separator orientation="vertical" className="h-6 mx-1" />
                <Button
                    variant={showDevTools ? "secondary" : "ghost"}
                    size="sm"
                    className="h-8 gap-2"
                    onClick={onToggleDevTools}
                >
                    <Bug className="w-4 h-4" />
                    DevTools
                </Button>
                <Button
                    variant="default"
                    size="sm"
                    className="h-8 gap-2 ml-2"
                    onClick={onExit}
                >
                    <X className="w-4 h-4" />
                    Exit Preview
                </Button>
            </div>
        </div>
    );
}