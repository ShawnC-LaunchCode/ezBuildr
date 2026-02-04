
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

export function LogicVariablesTab() {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Live Variables</h3>
                <Badge variant="outline" className="text-[10px] font-mono">JSON View</Badge>
            </div>
            <ScrollArea className="h-[400px] w-full rounded-md border p-4 bg-slate-950 text-slate-50 font-mono text-xs">
                {/* Placeholder for real-time variables linkage */}
                <div className="space-y-1">
                    <span className="text-slate-400">{"// Current Run State (Preview)"}</span>
                    <pre className="text-emerald-400">
                        {JSON.stringify({
                            clientName: "John Doe",
                            matterType: "Estate Planning",
                            isUrgent: true,
                            meta: {
                                timestamp: new Date().toISOString(),
                                mode: "preview"
                            }
                        }, null, 2)}
                    </pre>
                    <div className="pt-4 text-slate-500 italic">
                        {"// In a real implementation, this would connect to the active run store."}
                    </div>
                </div>
            </ScrollArea>
        </div>
    );
}
