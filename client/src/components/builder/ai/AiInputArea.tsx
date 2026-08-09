
import { FileText, X, Send } from "lucide-react";
import { FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { UploadedFile } from "./types";

interface AiInputAreaProps {
    input: string;
    setInput: (val: string) => void;
    contextFiles: UploadedFile[];
    setContextFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
    mode: string;
    /** A propose or apply request is in flight. */
    isBusy: boolean;
    uploading: boolean;
    /** Input stays locked until the user applies or discards the proposal. */
    hasPendingProposal: boolean;
    onSend: () => void;
}

export function AiInputArea({
    input,
    setInput,
    contextFiles,
    setContextFiles,
    mode,
    isBusy,
    uploading,
    hasPendingProposal,
    onSend
}: AiInputAreaProps) {
    return (
        <div className="shrink-0 border-t bg-background p-4">
            {/* File Previews */}
            {contextFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                    {contextFiles.map((f, i) => (
                        <Badge key={i} variant="secondary" className="pl-1 pr-2 py-0.5 h-6 text-xs flex items-center gap-1">
                            <FileText className="w-3 h-3" />
                            <span className="max-w-[100px] truncate">{f.name}</span>
                            <button
                                onClick={() => setContextFiles(prev => prev.filter((_, idx) => idx !== i))}
                                className="ml-1 hover:text-destructive"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </Badge>
                    ))}
                </div>
            )}

            <form
                className="flex gap-2"
                onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    void onSend();
                }}
            >
                <Input
                    placeholder={mode === 'easy' ? "Describe changes to auto-apply..." : "Describe changes..."}
                    value={input}
                    onChange={(e) => { setInput(e.target.value); }}
                    disabled={isBusy || hasPendingProposal || uploading}
                    className="flex-1"
                />
                <Button type="submit" size="icon" disabled={(!input.trim() && contextFiles.length === 0) || isBusy || hasPendingProposal || uploading}>
                    <Send className="w-4 h-4" />
                </Button>
            </form>
            {hasPendingProposal && (
                <p className="text-xs text-center mt-2 text-muted-foreground animate-pulse">Waiting for your review...</p>
            )}
        </div>
    );
}
