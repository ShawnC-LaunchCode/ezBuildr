import {
    CheckCircle2,
    AlertTriangle,
    Info,
    ArrowRight,
    ClipboardCheck,
    FileText,
    HelpCircle,
    Share2,
    Users
} from "lucide-react";
import React, {  } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {  useSections, useAllSteps } from "@/lib/vault-hooks";
interface ReviewTabProps {
    workflowId: string;
}
export function ReviewTab({ workflowId }: ReviewTabProps) {
    const { data: sections } = useSections(workflowId);
    // We need all steps to check for aliases/content
    const allStepsMap = useAllSteps(sections || []);
    const { toast } = useToast();
    // We don't have a direct 'publish' mutation that doesn't ask for generic JSON, 
    // but existing usePublishWorkflow takes graphJson. We'll reuse it or just simulate for now.
    const [location, setLocation] = useLocation();
    // Basic stats
    const totalSections = sections?.length || 0;
    let totalQuestions = 0;
    let missingAliases = 0;
    let emptyTitles = 0;
    let conditionalQuestions = 0;
    const activeIssues: Array<{
        type: 'warning' | 'info' | 'success';
        message: string;
        sectionId?: string;
        stepId?: string;
    }> = [];
    // Analyze structure
    if (sections) {
        sections.forEach(section => {
            const steps = allStepsMap[section.id] || [];
            totalQuestions += steps.length;
            steps.forEach(step => {
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
                if (step.visibleIf) {
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
                            Review your workflow to ensure it's ready for clients.
                            We've checked for common issues and best practices.
                        </p>
                    </div>
                    {/* Key Stats Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <StatsCard label="Pages" value={totalSections} icon={FileText} />
                        <StatsCard label="Questions" value={totalQuestions} icon={HelpCircle} />
                        <StatsCard
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
                            {/* Ready Status */}
                            {isReady && missingAliases === 0 ? (
                                <div className="flex items-center gap-3 p-3 bg-green-50 text-green-700 rounded-md border border-green-100">
                                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                                    <div>
                                        <p className="font-medium">Everything looks great!</p>
                                        <p className="text-sm opacity-90">Your workflow is well-structured and all questions are named.</p>
                                    </div>
                                </div>
                            ) : null}
                            {/* Blocking Issues (Empty Titles) */}
                            {emptyTitles > 0 && (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-amber-600 font-medium">
                                        <AlertTriangle className="w-4 h-4" />
                                        <span>Questions missing text ({emptyTitles})</span>
                                    </div>
                                    <div className="pl-6 space-y-1">
                                        <p className="text-sm text-slate-500 mb-2">
                                            Some questions are blank. Your client won't know what to answer.
                                        </p>
                                        {activeIssues.filter(i => i.type === 'warning').map((issue, idx) => (
                                            <div key={idx} className="text-sm p-2 bg-amber-50 rounded border border-amber-100 flex items-center justify-between">
                                                <span className="text-amber-800">{issue.message}</span>
                                                <Button variant="ghost" size="sm" className="h-6 text-amber-700 hover:text-amber-900 hover:bg-amber-100"
                                                    onClick={() => setLocation(`/workflows/${workflowId}/builder?tab=sections`)}
                                                >
                                                    Fix
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {/* Soft Suggestions (Aliases) */}
                            {missingAliases > 0 && (
                                <div className="space-y-2 pt-2">
                                    <div className="flex items-center gap-2 text-slate-600 font-medium">
                                        <Info className="w-4 h-4 text-blue-500" />
                                        <span>Unnamed answers ({missingAliases})</span>
                                    </div>
                                    <div className="pl-6 space-y-1">
                                        <p className="text-sm text-slate-500 mb-2">
                                            Naming answers ("Save answer as") helps you reuse them in documents later.
                                            It's okay to skip this if you don't need to reuse the answer.
                                        </p>
                                        <div className="text-sm text-slate-500 italic">
                                            Review the "Save answer as" field in your questions.
                                        </div>
                                    </div>
                                </div>
                            )}
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
function StatsCard({ label, value, icon: Icon, highlight }: { label: string, value: string | number, icon: any, highlight?: boolean }) {
    return (
        <Card>
            <CardContent className="p-6 flex items-center gap-4">
                <div className={`p-3 rounded-full ${highlight ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-600'}`}>
                    <Icon className="w-5 h-5" />
                </div>
                <div>
                    <p className="text-sm text-slate-500 font-medium">{label}</p>
                    <p className="text-2xl font-semibold text-slate-900">{value}</p>
                </div>
            </CardContent>
        </Card>
    )
}