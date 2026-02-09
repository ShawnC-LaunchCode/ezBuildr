
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { Mode } from "@/lib/mode";

interface AiAssistInputProps {
    input: string;
    setInput: (value: string) => void;
    handleSend: () => void;
    isLoading: boolean;
    isWaitingForReview: boolean;
    mode: Mode;
}

export function AiAssistInput({
    input,
    setInput,
    handleSend,
    isLoading,
    isWaitingForReview,
    mode
}: AiAssistInputProps) {
    const isDisabled = isLoading || isWaitingForReview;

    return (
        <div className="p-4 border-t bg-background">
            <form
                className="flex gap-2"
                onSubmit={(e) => {
                    e.preventDefault();
                    void handleSend();
                }}
            >
                <Input
                    placeholder={mode === 'easy' ? "Describe changes to auto-apply..." : "Describe changes..."}
                    value={input}
                    onChange={(e) => { setInput(e.target.value); }}
                    disabled={isDisabled}
                />
                <Button type="submit" size="icon" disabled={!input.trim() || isDisabled}>
                    <Send className="w-4 h-4" />
                </Button>
            </form>
            {isWaitingForReview && (
                <p className="text-xs text-center mt-2 text-muted-foreground animate-pulse">Waiting for your review...</p>
            )}
        </div>
    );
}
