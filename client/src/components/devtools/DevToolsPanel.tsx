import { useState, useMemo } from "react";
import { PreviewEnvironment } from "@/lib/previewRunner/PreviewEnvironment";
import { usePreviewEnvironment } from "@/lib/previewRunner/usePreviewEnvironment";
import { UnifiedDevPanel } from "@/components/devpanel/UnifiedDevPanel";
import { RuntimeVariableList } from "@/components/devpanel/RuntimeVariableList";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiWorkflowVariable } from "@/lib/vault-api";
import { JsonViewer } from "./JsonViewer";

interface DevToolsPanelProps {
    env: PreviewEnvironment | null;
    isOpen: boolean;
    onClose: () => void;
}

export function DevToolsPanel({ env, isOpen, onClose }: DevToolsPanelProps) {
    const state = usePreviewEnvironment(env);
    const [localOpen, setLocalOpen] = useState(true);

    const variables = useMemo<ApiWorkflowVariable[]>(() => {
        if (!state || !env) return [];

        // Map steps to variables
        return env.getSteps()
            .map(step => {
                const section = env.getSections().find(s => s.id === step.sectionId);
                return {
                    key: step.id,
                    alias: step.alias || null,
                    label: step.title,
                    type: step.type,
                    sectionId: step.sectionId,
                    sectionTitle: section?.title || "Unknown Section",
                    stepId: step.id
                };
            })
            .filter(v => v.sectionTitle !== "Final Documents");
    }, [state, env]);

    if (!isOpen || !state) return null;

    // Determine the effective toggle handler based on parent's onClose or local intent
    // The requirement says "minimize to Sidebar", so we should ideally control the open state
    // But PreviewRunner might be controlling the overall visibility.
    // However, Builder's "DevPanel" controls its own width (w-0 vs w-[360px]) based on isOpen props.
    // We'll use local state to toggle between collapsed and expanded sidebar,
    // assuming 'isOpen' from props means "Dev Tools Enabled/Visible at all".

    const contextValues = useMemo(() => {
        if (!state || !env) return {};
        const values = { ...state.values };
        const steps = env.getSteps();

        const contextAwareValues: Record<string, any> = {};

        Object.entries(values).forEach(([stepId, value]) => {
            // Filter out null/undefined values to keep JSON view clean
            if (value === undefined || value === null) return;

            const step = steps.find(s => s.id === stepId);
            // Use alias if available, otherwise fall back to stepId
            const key = step?.alias || stepId;
            contextAwareValues[key] = value;
        });

        return contextAwareValues;
    }, [state, env]);

    return (
        <div className="h-full flex flex-col pointer-events-auto">
            <UnifiedDevPanel
                workflowId={state.workflowId}
                isOpen={localOpen}
                onToggle={() => setLocalOpen(!localOpen)}
                className="border-l shadow-xl h-full"
            >
                <Tabs defaultValue="variables" className="h-full flex flex-col">
                    <div className="px-3 py-2 border-b">
                        <TabsList className="w-full grid grid-cols-2">
                            <TabsTrigger value="variables">Variables</TabsTrigger>
                            <TabsTrigger value="json">JSON</TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="variables" className="flex-1 mt-0 overflow-hidden">
                        <RuntimeVariableList
                            workflowId={state.workflowId}
                            variables={variables}
                            values={state.values}
                        />
                    </TabsContent>

                    <TabsContent value="json" className="flex-1 mt-0 p-0 overflow-hidden">
                        <JsonViewer
                            data={contextValues}
                            className="w-full h-full"
                        />
                    </TabsContent>
                </Tabs>
            </UnifiedDevPanel>
        </div>
    );
}
