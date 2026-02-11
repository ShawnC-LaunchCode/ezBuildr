
import { Play } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { ApiTransformBlock } from "@/lib/vault-api";
import { useTestTransformBlock } from "@/lib/vault-hooks";

export function TransformBlockTester({ block }: { block: ApiTransformBlock }): JSX.Element {
    const testMutation = useTestTransformBlock();
    const { toast } = useToast();
    const [testData, setTestData] = useState("{}");
    const [testResult, setTestResult] = useState<unknown>(null);

    const handleTest = async () => {
        if (!block.id) {
            toast({ title: "Info", description: "Save the block first before testing", variant: "default" });
            return;
        }

        try {
            const parsedData = JSON.parse(testData) as Record<string, unknown>;
            const result = await testMutation.mutateAsync({ id: block.id, testData: parsedData });
            setTestResult(result);

            if (result.success) {
                toast({ title: "Test Successful", description: "Check output below" });
            } else {
                toast({ title: "Test Failed", description: result.error ?? "Unknown error", variant: "destructive" });
            }
        } catch (error) {
            if (error instanceof SyntaxError) {
                toast({ title: "Invalid JSON", description: "Test data must be valid JSON", variant: "destructive" });
            } else {
                toast({ title: "Test Error", description: "Failed to test block", variant: "destructive" });
            }
        }
    };

    return (
        <div className="space-y-2 pt-4 border-t">
            <Label>Test Block</Label>
            <div className="flex gap-2">
                <Textarea
                    value={testData}
                    onChange={(e) => { setTestData(e.target.value); }}
                    rows={4}
                    className="font-mono text-xs flex-1"
                    placeholder='{"inputKey1": "value1", "inputKey2": "value2"}'
                />
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => { void handleTest(); }}
                    disabled={testMutation.isPending}
                >
                    <Play className="w-3 h-3 mr-1" />
                    Test
                </Button>
            </div>
            {testResult !== null && (
                <div className="mt-2">
                    <Label className="text-xs">Result:</Label>
                    <pre className="mt-1 p-2 bg-muted rounded text-xs font-mono overflow-x-auto">
                        {JSON.stringify(testResult, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
}
