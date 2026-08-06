import {
    ClipboardCheck,
    CheckCircle2,
    FileText,
    HelpCircle,
    Share2,
    Users,
    Rocket
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSections, useAllSteps, ApiStep, useWorkflow } from "@/lib/vault-hooks";
import { apiRequest } from "@/lib/queryClient";
import { fetchAPI } from "@/lib/vault-api";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

import { ReviewIssueList, type ReviewIssue } from "./review/ReviewIssueList";
import { ReviewStatsCard } from "./review/ReviewStatsCard";

interface ReviewTabProps {
    workflowId: string;
}

export function ReviewTab({ workflowId }: ReviewTabProps) {
    const { data: sections } = useSections(workflowId);
    const { data: workflow, refetch: refetchWorkflow } = useWorkflow(workflowId);
    const allStepsMap = useAllSteps(sections ?? []);
    const [, setLocation] = useLocation();
    const { toast } = useToast();

    const [isActivating, setIsActivating] = useState(false);

    const { data: lintIssues = [], refetch: refetchLint, isLoading: isLinting } = useQuery({
        queryKey: ['workflow', workflowId, 'lint'],
        queryFn: async () => {
            const res = await apiRequest('GET', `/api/workflows/${workflowId}/lint`);
            if (!res.ok) { throw new Error("Failed to lint workflow"); }
            return res.json() as Promise<ReviewIssue[]>;
        }
    });

    const totalSections = sections?.length ?? 0;
    let totalQuestions = 0;
    let conditionalQuestions = 0;

    // Analyze structure for basic stats only
    if (sections) {
        sections.forEach(section => {
            const steps = allStepsMap[section.id] ?? [];
            totalQuestions += steps.length;
            steps.forEach((step: ApiStep) => {
                if ((step.visibleIf as string | null | undefined)) {
                    conditionalQuestions++;
                }
            });
        });
    }

    const hasErrors = lintIssues.some(i => i.type === 'error');
    const isReady = !hasErrors && !isLinting;

    const handleActivate = async (): Promise<void> => {
        setIsActivating(true);
        try {
            // fetchAPI injects the bearer token, refreshes it on a mid-session
            // 401, and throws with the server's message (e.g. the activation
            // validation errors) on failure.
            await fetchAPI(`/api/workflows/${workflowId}/status`, {
                method: 'PUT',
                body: JSON.stringify({ status: 'active' }),
            });
            toast({
                title: "Success",
                description: "Workflow activated and published successfully.",
            });
            await refetchWorkflow();
            await refetchLint();
        } catch (error) {
            toast({
                title: "Activation Failed",
                description: error instanceof Error ? error.message : "Unknown error",
                variant: "destructive"
            });
        } finally {
            setIsActivating(false);
        }
    };

    return (
        <div className="flex-1 flex flex-col h-full bg-slate-50/50">
            <ScrollArea className="flex-1 p-6">
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="max-w-4xl mx-auto space-y-8"
                >
                    {/* Header */}
                    <div className="space-y-2">
                        <h2 className="text-2xl font-semibold tracking-tight text-slate-900 flex items-center gap-2">
                            <ClipboardCheck className="w-6 h-6 text-primary" />
                            Review & Readiness
                        </h2>
                        <p className="text-slate-500 max-w-2xl">
                            Review your workflow to ensure it&apos;s ready for clients.
                            We run a deep structural analysis to check for missing logic, unnamed variables, and configuration issues.
                        </p>
                    </div>

                    {/* Key Stats Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <ReviewStatsCard label="Pages" value={totalSections} icon={FileText} />
                        <ReviewStatsCard label="Questions" value={totalQuestions} icon={HelpCircle} />
                        <ReviewStatsCard
                            label="Branching"
                            value={conditionalQuestions > 0 ? "Active" : "None"}
                            icon={Share2}
                            highlight={conditionalQuestions > 0}
                        />
                    </div>

                    {/* Readiness Checklist */}
                    <Card className="border-0 shadow-sm ring-1 ring-slate-200/50 overflow-hidden backdrop-blur-sm bg-white/95">
                        <CardHeader className="bg-slate-50/50 border-b">
                            <CardTitle className="text-lg flex items-center justify-between">
                                <span>Readiness Checklist</span>
                                {isLinting && <span className="text-sm font-normal text-slate-400 animate-pulse">Running checks...</span>}
                            </CardTitle>
                            <CardDescription>
                                Items that might need your attention before publishing.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 p-6">
                            <ReviewIssueList
                                isReady={isReady}
                                isLinting={isLinting}
                                issues={lintIssues}
                                workflowId={workflowId}
                                onFix={setLocation}
                            />

                            {/* Collaboration Hint */}
                            <div className="pt-6 mt-6 border-t flex items-center justify-between gap-2 text-sm text-slate-500">
                                <div className="flex items-center gap-2">
                                    <Users className="w-4 h-4 text-slate-400" />
                                    <span>Team members can collaborate on this workflow.</span>
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="bg-slate-50/50 border-t p-4 flex justify-end gap-3">
                            <Button
                                variant="outline"
                                onClick={() => { void refetchLint(); }}
                                disabled={isLinting}
                            >
                                Re-run Checks
                            </Button>
                            
                            <Button 
                                className={`min-w-[140px] shadow-sm transition-all duration-300 ${isReady && workflow?.status !== 'active' ? 'shadow-primary/25 hover:shadow-primary/40 ring-2 ring-primary/20 ring-offset-2' : ''}`}
                                disabled={!isReady || isActivating || workflow?.status === 'active'}
                                onClick={() => { void handleActivate(); }}
                            >
                                {workflow?.status === 'active' ? (
                                    <>
                                        <CheckCircle2 className="w-4 h-4 mr-2" />
                                        Published
                                    </>
                                ) : isActivating ? (
                                    'Publishing...'
                                ) : (
                                    <>
                                        <Rocket className="w-4 h-4 mr-2" />
                                        Publish Workflow
                                    </>
                                )}
                            </Button>
                        </CardFooter>
                    </Card>
                </motion.div>
            </ScrollArea>
        </div>
    );
}
