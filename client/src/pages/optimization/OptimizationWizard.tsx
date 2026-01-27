import { useQuery, useMutation } from "@tanstack/react-query";
import {
    Loader2,
    CheckCircle,
    AlertTriangle,
    ArrowRight,
    Wand2,
    FileText,
    Box,
    GitBranch,
    Zap
} from "lucide-react";
import React, { useState, useEffect } from "react";
import { useParams } from "wouter";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { workflowAPI } from "@/lib/vault-api";
// Assuming fetchWorkflow exists or I'll implement fetch logic inline or from a hook
export default function OptimizationWizard() {
    const { workflowId } = useParams();
    const [activeStep, setActiveStep] = useState(0);
    const { toast } = useToast();
    // Basic structure for steps
    const steps = [
        { id: "overview", title: "Overview", icon: Wand2 },
        { id: "page_structure", title: "Structure", icon: FileText },
        { id: "block_structure", title: "Blocks", icon: Box },
        { id: "logic", title: "Logic", icon: GitBranch },
        { id: "performance", title: "Performance", icon: Zap },
        { id: "review", title: "Review & Fix", icon: CheckCircle },
    ];
    // Fetch Workflow Data
    const { data: workflow, isLoading: isLoadingWorkflow } = useQuery({
        queryKey: [`/api/workflows/${workflowId}`],
        // Fallback if fetchWorkflow isn't readily available as explicit import
        queryFn: async () => {
            return workflowAPI.get(workflowId!);
        },
        enabled: !!workflowId
    });
    // Analysis Mutation
    const analyzeMutation = useMutation({
        mutationFn: async (wf: any) => {
            const res = await fetch("/api/ai/workflows/optimize/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ workflow: wf, workflowId })
            });
            if (!res.ok) {throw new Error("Analysis failed");}
            return res.json();
        }
    });
    // Run analysis when workflow is loaded
    useEffect(() => {
        if (workflow && !analyzeMutation.data && !analyzeMutation.isPending) {
            analyzeMutation.mutate(workflow);
        }
    }, [workflow]);
    if (isLoadingWorkflow || analyzeMutation.isPending) {
        return (
            <div className="flex h-screen items-center justify-center flex-col gap-4">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-muted-foreground">Analyzing workflow structure...</p>
            </div>
        );
    }
    if (analyzeMutation.isError) {
        return (
            <div className="flex h-screen items-center justify-center flex-col gap-4">
                <AlertTriangle className="h-10 w-10 text-destructive" />
                <h2 className="text-xl font-semibold">Analysis Failed</h2>
                <Button onClick={() => window.location.reload()}>Retry</Button>
            </div>
        );
    }
    const analysis = analyzeMutation.data;
    return (
        <div className="container mx-auto py-8 max-w-5xl h-screen flex flex-col">
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Optimization Wizard</h1>
                <p className="text-muted-foreground">
                    AI-driven suggestions to improve your workflow's performance and usability.
                </p>
            </div>
            <div className="grid grid-cols-12 gap-8 flex-1 overflow-hidden">
                {/* Sidebar Stepper */}
                <div className="col-span-3 space-y-2">
                    {steps.map((step, index) => (
                        <div
                            key={step.id}
                            className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${activeStep === index
                                ? "bg-primary text-primary-foreground font-medium"
                                : index < activeStep
                                    ? "text-muted-foreground hover:bg-muted"
                                    : "text-muted-foreground opacity-50"
                                }`}
                            onClick={() => {
                                // Allow clicking back, or clicking next if analyzed
                                if (index <= activeStep || analysis) {setActiveStep(index);}
                            }}
                        >
                            <step.icon className="h-5 w-5" />
                            <span>{step.title}</span>
                            {index < activeStep && <CheckCircle className="h-4 w-4 ml-auto opacity-50" />}
                        </div>
                    ))}
                    <Separator className="my-4" />
                    {analysis && (
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">Optimization Score</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center justify-center py-4">
                                    <span className="text-4xl font-bold text-primary">{analysis.optimizationScore}</span>
                                    <span className="text-muted-foreground ml-1">/100</span>
                                </div>
                                <Progress value={analysis.optimizationScore} className="h-2" />
                            </CardContent>
                        </Card>
                    )}
                </div>
                {/* Main Content Area */}
                <div className="col-span-9 h-full overflow-hidden flex flex-col">
                    <ScrollArea className="flex-1 pr-4">
                        {activeStep === 0 && (
                            <OverviewStep analysis={analysis} onNext={() => setActiveStep(1)} />
                        )}
                        {/* Placeholders for other steps */}
                        {activeStep > 0 && activeStep < 5 && (
                            <CategoryStep
                                stepId={steps[activeStep].id}
                                title={steps[activeStep].title}
                                analysis={analysis}
                                onNext={() => setActiveStep(activeStep + 1)}
                                onBack={() => setActiveStep(activeStep - 1)}
                            />
                        )}
                        {activeStep === 5 && (
                            <ReviewStep analysis={analysis} workflow={workflow} onBack={() => setActiveStep(4)} />
                        )}
                    </ScrollArea>
                </div>
            </div>
        </div>
    );
}
// --- Sub-components (Will expand these) ---
function OverviewStep({ analysis, onNext }: { analysis: any, onNext: () => void }) {
    if (!analysis) {return null;}
    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-semibold">Analysis Overview</h2>
            <div className="grid grid-cols-3 gap-4">
                <MetricCard title="Total Pages" value={analysis.metrics.totalPages} />
                <MetricCard title="Total Blocks" value={analysis.metrics.totalBlocks} />
                <MetricCard title="Est. Time" value={`${Math.round(analysis.metrics.estimatedCompletionTimeMs / 1000 / 60)} min`} />
            </div>
            <div className="space-y-4">
                <h3 className="text-lg font-medium">Top Suggestions</h3>
                {analysis.suggestions.map((sugg: any) => (
                    <Card key={sugg.id}>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Wand2 className="h-4 w-4 text-primary" />
                                {sugg.title}
                            </CardTitle>
                            <CardDescription>{sugg.description}</CardDescription>
                        </CardHeader>
                    </Card>
                ))}
                {analysis.suggestions.length === 0 && (
                    <div className="p-8 text-center text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
                        No major structural suggestions found. Good job!
                    </div>
                )}
            </div>
            <div className="flex justify-end pt-4">
                <Button onClick={onNext} className="gap-2">
                    Begin Review <ArrowRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}
function CategoryStep({ stepId, title, analysis, onNext, onBack }: any) {
    const issues = analysis.issues.filter((i: any) => i.category === stepId);
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">{title} Analysis</h2>
                <Badge variant="outline">{issues.length} Issues Found</Badge>
            </div>
            <div className="space-y-4">
                {issues.map((issue: any) => (
                    <Card key={issue.id} className="border-l-4 border-l-orange-500">
                        <CardHeader>
                            <CardTitle className="text-base">{issue.title}</CardTitle>
                            <CardDescription>{issue.description}</CardDescription>
                        </CardHeader>
                        <CardFooter className="bg-muted/30 py-3">
                            {issue.fixable ? (
                                <Badge variant="secondary" className="gap-1">
                                    <Wand2 className="h-3 w-3" /> Auto-fixable
                                </Badge>
                            ) : (
                                <Badge variant="outline">Manual Review</Badge>
                            )}
                        </CardFooter>
                    </Card>
                ))}
                {issues.length === 0 && (
                    <div className="p-12 text-center text-muted-foreground bg-muted/20 rounded-lg">
                        <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500 opacity-50" />
                        <p>No issues found in this category.</p>
                    </div>
                )}
            </div>
            <div className="flex justify-between pt-8">
                <Button variant="ghost" onClick={onBack}>Back</Button>
                <Button onClick={onNext}>Next Step</Button>
            </div>
        </div>
    );
}
function ReviewStep({ analysis, workflow, onBack }: any) {
    // This will hold the logic to select fixes and Apply
    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-semibold">Review & Apply Fixes</h2>
            <p className="text-muted-foreground">Select the optimizations you want to apply to your workflow.</p>
            {/* TODO: List all fixable issues with checkboxes */}
            <div className="p-8 text-center bg-muted/20 rounded-lg">
                <p className="mb-4">Auto-fix selection UI coming next...</p>
                <Button disabled>Apply Selected Fixes</Button>
            </div>
            <div className="flex justify-between pt-8">
                <Button variant="ghost" onClick={onBack}>Back</Button>
            </div>
        </div>
    );
}
function MetricCard({ title, value }: { title: string, value: string | number }) {
    return (
        <Card>
            <CardContent className="pt-6">
                <div className="text-2xl font-bold">{value}</div>
                <p className="text-xs text-muted-foreground uppercase font-medium">{title}</p>
            </CardContent>
        </Card>
    );
}