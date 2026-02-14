import {
    ClipboardCheck,
    FileText,
    HelpCircle,
    Share2,
    Users
} from "lucide-react";
import { useLocation } from "wouter";

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSections, useAllSteps, ApiStep } from "@/lib/vault-hooks";

import { ReviewIssueList, ReviewIssue } from "./review/ReviewIssueList";
import { ReviewStatsCard } from "./review/ReviewStatsCard";

interface ReviewTabProps {
    workflowId: string;
}

export function ReviewTab({ workflowId }: ReviewTabProps) {
    const { data: sections } = useSections(workflowId);
    // We need all steps to check for aliases/content
    const allStepsMap = useAllSteps(sections ?? []);
    // We don't have a direct 'publish' mutation that doesn't ask for generic JSON, 
    // but existing usePublishWorkflow takes graphJson. We'll reuse it or just simulate for now.
    const [, setLocation] = useLocation();

    // Basic stats
    const totalSections = sections?.length ?? 0;
    let totalQuestions = 0;
    let missingAliases = 0;
    let emptyTitles = 0;
    let conditionalQuestions = 0;

    const activeIssues: ReviewIssue[] = [];

    // Analyze structure
    if (sections) {
        sections.forEach(section => {
            const steps = allStepsMap[section.id] ?? [];
            totalQuestions += steps.length;

            steps.forEach((step: ApiStep) => {
                if (!step.title) {
                    emptyTitles++;
                    activeIssues.push({
                        type: 'warning',
                        message: `Question in "${section.title}" is missing text`,
                        sectionId: section.id,
                        stepId: step.id
                    });
                }

                if (!step.alias) {
                    missingAliases++;
                    activeIssues.push({
                        type: 'info',
                        message: `Question "${step.title || 'Untitled'}" doesn't have a saved name (alias)`,
                        sectionId: section.id,
                        stepId: step.id
                    });
                }

                if ((step.visibleIf as string | null | undefined)) {
                    conditionalQuestions++;
                }
            });
        });
    }

    const isReady = emptyTitles === 0;

    return (
        <div className="flex-1 flex flex-col h-full bg-slate-50/50">
            <ScrollArea className="flex-1 p-6">
                <div className="max-w-4xl mx-auto space-y-8">
                    {/* Header */}
                    <div className="space-y-2">
                        <h2 className="text-2xl font-semibold tracking-tight text-slate-900 flex items-center gap-2">
                            <ClipboardCheck className="w-6 h-6 text-primary" />
                            Review & Readiness
                        </h2>
                        <p className="text-slate-500 max-w-2xl">
                            Review your workflow to ensure it&apos;s ready for clients.
                            We&apos;ve checked for common issues and best practices.
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
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Readiness Checklist</CardTitle>
                            <CardDescription>
                                Items that might need your attention before sharing.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <ReviewIssueList
                                isReady={isReady}
                                missingAliases={missingAliases}
                                emptyTitles={emptyTitles}
                                activeIssues={activeIssues}
                                workflowId={workflowId}
                                onFix={setLocation}
                            />

                            {/* Collaboration Hint */}
                            <div className="pt-4 border-t flex items-center gap-2 text-sm text-slate-500">
                                <Users className="w-4 h-4" />
                                <span>
                                    Others can edit this workflow with you.
                                </span>
                            </div>
                        </CardContent>
                        <CardFooter className="bg-slate-50/50 border-t p-4 flex justify-end gap-2">
                        </CardFooter>
                    </Card>
                </div>
            </ScrollArea>
        </div>
    );
}