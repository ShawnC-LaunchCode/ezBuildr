
import { CheckCircle2, Play } from "lucide-react";
import { RefObject } from "react";

import { HelperLibraryDocs } from "@/components/builder/HelperLibraryDocs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface JSCodeEditorProps {
    code: string;
    onChange: (code: string) => void;
    onValidate: () => void;
    onRunTest: () => void;
    error: string | null;
    textareaRef: RefObject<HTMLTextAreaElement>;
}

export function JSCodeEditor({
    code,
    onChange,
    onValidate,
    onRunTest,
    error,
    textareaRef,
}: JSCodeEditorProps) {
    return (
        <div className="space-y-4">
            <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">
                    JavaScript Code
                </label>
                <Textarea
                    ref={textareaRef}
                    value={code}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="// Example:\n// return { fullName: input.firstName + ' ' + input.lastName };\n\n// Or perform calculations:\n// return { total: input.price * input.quantity };"
                    className="font-mono text-sm h-64 resize-none"
                />
            </div>

            {error && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                    <p className="text-destructive text-sm font-mono">{error}</p>
                </div>
            )}

            <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={onValidate}>
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Validate Syntax
                </Button>
                <Button size="sm" variant="secondary" onClick={onRunTest}>
                    <Play className="w-3 h-3 mr-1" />
                    Run Test
                </Button>
            </div>

            <div className="p-3 bg-muted/50 rounded-md">
                <p className="text-xs text-muted-foreground">
                    <strong>Tips:</strong>
                </p>
                <ul className="text-xs text-muted-foreground mt-1 space-y-1 list-disc list-inside">
                    <li>Access variables via <code className="bg-background px-1 py-0.5 rounded">input.variableName</code></li>
                    <li>Return an object with your transformed data</li>
                    <li>Tests use realistic mock data based on variable types</li>
                    <li>Use <code className="bg-background px-1 py-0.5 rounded">helpers</code> object for 40+ utility functions</li>
                </ul>
            </div>

            <HelperLibraryDocs />
        </div>
    );
}
