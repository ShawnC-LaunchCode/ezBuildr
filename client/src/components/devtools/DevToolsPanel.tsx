import { useState } from "react";
import { PreviewEnvironment } from "@/lib/previewRunner/PreviewEnvironment";
import { usePreviewEnvironment } from "@/lib/previewRunner/usePreviewEnvironment";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, Activity, Variable, Play, History, Bug } from "lucide-react";
import { cn } from "@/lib/utils";

interface DevToolsPanelProps {
    env: PreviewEnvironment | null;
    isOpen: boolean;
    onClose: () => void;
}

export function DevToolsPanel({ env, isOpen, onClose }: DevToolsPanelProps) {
    const state = usePreviewEnvironment(env);
    const [activeTab, setActiveTab] = useState("variables");

    if (!isOpen || !state) return null;

    return (
        <div className="fixed right-4 bottom-4 w-[400px] h-[600px] z-50 flex flex-col shadow-2xl animate-in slide-in-from-right-10 fade-in duration-200">
            <Card className="h-full flex flex-col border-primary/20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <CardHeader className="py-3 px-4 flex flex-row items-center justify-between border-b space-y-0">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Bug className="w-4 h-4 text-primary" />
                        DevTools
                        <Badge variant="secondary" className="text-[10px] h-5">
                            Draft Mode
                        </Badge>
                    </CardTitle>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
                        <X className="w-4 h-4" />
                    </Button>
                </CardHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
                    <div className="px-4 pt-2">
                        <TabsList className="w-full grid grid-cols-4">
                            <TabsTrigger value="variables" title="Variables">
                                <Variable className="w-4 h-4" />
                            </TabsTrigger>
                            <TabsTrigger value="logs" title="Logs">
                                <Activity className="w-4 h-4" />
                            </TabsTrigger>
                            <TabsTrigger value="timeline" title="Timeline">
                                <History className="w-4 h-4" />
                            </TabsTrigger>
                            <TabsTrigger value="logic" title="Logic Trace">
                                <Play className="w-4 h-4" />
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="variables" className="flex-1 overflow-hidden p-0 m-0">
                        <ScrollArea className="h-full p-4">
                            {/* Variables Inspector Placeholder */}
                            <div className="space-y-2">
                                {Object.entries(state.values).map(([key, value]) => (
                                    <div key={key} className="flex justify-between items-start text-xs border-b pb-1">
                                        <span className="font-mono text-muted-foreground">{key}</span>
                                        <span className="font-mono text-primary truncate max-w-[150px]">
                                            {JSON.stringify(value)}
                                        </span>
                                    </div>
                                ))}
                                {Object.keys(state.values).length === 0 && (
                                    <p className="text-muted-foreground text-sm text-center py-8">No variables set</p>
                                )}
                            </div>
                        </ScrollArea>
                    </TabsContent>

                    <TabsContent value="logs" className="flex-1 overflow-hidden p-4">
                        <div className="text-sm text-muted-foreground text-center pt-10">
                            Logs coming soon...
                        </div>
                    </TabsContent>

                    <TabsContent value="timeline" className="flex-1 overflow-hidden p-4">
                        <div className="text-sm text-muted-foreground text-center pt-10">
                            Timeline coming soon...
                        </div>
                    </TabsContent>

                    <TabsContent value="logic" className="flex-1 overflow-hidden p-4">
                        <div className="text-sm text-muted-foreground text-center pt-10">
                            Logic Trace coming soon...
                        </div>
                    </TabsContent>
                </Tabs>

                <div className="p-2 border-t bg-muted/50 text-[10px] text-muted-foreground flex justify-between">
                    <span>Run ID: {state.id.slice(0, 8)}...</span>
                    <span>{new Date(state.updatedAt).toLocaleTimeString()}</span>
                </div>
            </Card>
        </div>
    );
}
