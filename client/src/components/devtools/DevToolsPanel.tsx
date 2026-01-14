import React, { useState, useMemo } from "react";

import { ExecutionTimeline } from "@/components/devpanel/ExecutionTimeline";
import { RuntimeVariableList } from "@/components/devpanel/RuntimeVariableList";
import { UnifiedDevPanel } from "@/components/devpanel/UnifiedDevPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PreviewEnvironment } from "@/lib/previewRunner/PreviewEnvironment";
import { usePreviewEnvironment } from "@/lib/previewRunner/usePreviewEnvironment";
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
        if (!state || !env) {return [];}

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

    // ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS
    // Determine the effective toggle handler based on parent's onClose or local intent
    // The requirement says "minimize to Sidebar", so we should ideally control the open state
    // But PreviewRunner might be controlling the overall visibility.
    // However, Builder's "DevPanel" controls its own width (w-0 vs w-[360px]) based on isOpen props.
    // We'll use local state to toggle between collapsed and expanded sidebar,
    // assuming 'isOpen' from props means "Dev Tools Enabled/Visible at all".

    const contextValues = useMemo(() => {
        if (!state || !env) {return {};}
        const values = { ...state.values };
        const steps = env.getSteps();

        const contextAwareValues: Record<string, any> = {};

        // Helper to deep set values
        const deepSet = (obj: Record<string, any>, path: string[], value: any) => {
            let current = obj;
            for (let i = 0; i < path.length - 1; i++) {
                const key = path[i];
                // If the key doesn't exist, create an object
                if (!(key in current)) {
                    current[key] = {};
                }
                // If it exists but isn't an object (collision), we have a problem.
                if (current[key] !== undefined && (typeof current[key] !== 'object' || current[key] === null)) {
                    // Collision: Primitive blocks path. Skip this nested value to prevent crash.
                    return;
                }
                current = current[key];
            }
            const lastKey = path[path.length - 1];
            current[lastKey] = value;
        };

        // First pass: Put all values in.
        // We need to handle the case where "pet" (object) and "pet.email" (string) both exist.
        // If "pet.email" is processed BEFORE "pet" (object), we create { pet: { email: ... } }.
        // Then "pet" (object) comes along and overwrites it!
        // So we should process "deep" objects (shorter keys / objects) first? 
        // Or process everything and do a smart merge?

        // Better strategy:
        // 1. Map all entries to { path: string[], value: any }
        // 2. Sort by path length? Or just use a deep merge utility.

        Object.entries(values).forEach(([stepId, value]) => {
            if (value === undefined || value === null) {return;}

            const step = steps.find(s => s.id === stepId);
            const key = step?.alias || stepId;
            const path = key.split('.');

            if (path.length === 1) {
                // Top level assignment
                // If existing value is an object (created by a previous nested child), we should merge this value into it?
                // Example: processed 'pet.email' -> context['pet'] = { email: ... }
                // Now processing 'pet' -> value is { street: ... }
                // We should merge { street: ... } into existing { email: ... }
                if (contextAwareValues[key] && typeof contextAwareValues[key] === 'object' && typeof value === 'object') {
                    Object.assign(contextAwareValues[key], value);
                } else {
                    // Overwrite (or first assignment)
                    // If we overwrite an existing object created by children, we lose those children!
                    // So if existing is object, we must merge.
                    if (contextAwareValues[key] && typeof contextAwareValues[key] === 'object') {
                        if (typeof value === 'object') {
                            Object.assign(contextAwareValues[key], value);
                        } else {
                            // Collision: existing is object (container), new is primitive.
                            // Rare case. Just overwrite? 
                            contextAwareValues[key] = value;
                        }
                    } else {
                        contextAwareValues[key] = value;
                    }
                }
            } else {
                // Nested assignment
                deepSet(contextAwareValues, path, value);
            }
        });

        // Re-sorting keys for display?
        // JS objects preserve insertion order mostly, but recursive structure is what matters.
        return contextAwareValues;
    }, [state, env]);

    // Conditional return AFTER all hooks have been called
    if (!isOpen || !state) {return null;}

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
                        <TabsList className="w-full grid grid-cols-3">
                            <TabsTrigger value="variables">Variables</TabsTrigger>
                            <TabsTrigger value="execution">Execution</TabsTrigger>
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

                    <TabsContent value="execution" className="flex-1 mt-0 overflow-hidden">
                        <ExecutionTimeline
                            trace={state.trace || []}
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
