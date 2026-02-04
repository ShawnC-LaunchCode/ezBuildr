import { GitGraph } from "lucide-react";
import { useState } from 'react';

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { ApiWorkflow } from "@/lib/vault-api";

import { LogicDebugTab } from "./logic/LogicDebugTab";
import { LogicGeneratorTab } from "./logic/LogicGeneratorTab";
import { LogicVariablesTab } from "./logic/LogicVariablesTab";

interface LogicInspectorPanelProps {
    workflowId: string;
    currentWorkflow: ApiWorkflow;
    isOpen: boolean;
    onClose: () => void;
}

export function LogicInspectorPanel({ workflowId, currentWorkflow, isOpen, onClose }: LogicInspectorPanelProps) {
    const [activeTab, setActiveTab] = useState('generate');

    if (!isOpen) { return null; }

    return (
        <div className="fixed inset-y-0 right-0 w-[400px] bg-background border-l shadow-xl z-50 flex flex-col transition-transform duration-300">
            <div className="p-4 border-b flex justify-between items-center">
                <h2 className="font-semibold text-lg flex items-center gap-2">
                    <GitGraph className="w-5 h-5 text-blue-500" />
                    Logic Inspector
                </h2>
                <Button variant="ghost" size="sm" onClick={() => { void onClose(); }}>Close</Button>
            </div>
            <div className="flex-1 overflow-hidden">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
                    <TabsList className="m-4 grid grid-cols-3">
                        <TabsTrigger value="generate">Generate</TabsTrigger>
                        <TabsTrigger value="debug">Debug</TabsTrigger>
                        <TabsTrigger value="variables">Variables</TabsTrigger>
                    </TabsList>

                    <TabsContent value="generate" className="flex-1 p-4 space-y-4 overflow-auto">
                        <LogicGeneratorTab workflowId={workflowId} currentWorkflow={currentWorkflow} />
                    </TabsContent>

                    <TabsContent value="debug" className="flex-1 p-4 flex flex-col overflow-hidden">
                        <LogicDebugTab workflowId={workflowId} currentWorkflow={currentWorkflow} />
                    </TabsContent>

                    <TabsContent value="variables" className="flex-1 p-4 space-y-4 overflow-auto">
                        <LogicVariablesTab />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}