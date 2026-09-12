import { CheckCircle2, Edit2 } from "lucide-react";

import { ListAnswerView } from "@/components/runner/list/ListAnswerView";
import { normalizeListConfig } from "@/components/runner/list/listRuntime";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAnswerValue } from "@/lib/formatAnswerValue";

import type { ListValue } from "@shared/types/stepConfigs";
interface ReviewPageProps {
    pages: ReviewPageData[];
    allSteps: ReviewStepData[];
    values: Record<string, unknown>;
    onEditStep: (stepId: string, pageId: string) => void;
    visiblePageIds: string[];
    visibleStepIds: string[];
}

interface ReviewPageData {
    id: string;
    title: string;
}

interface ReviewStepData {
    id: string;
    pageId: string;
    title: string;
    type?: string;
    config?: Record<string, unknown> | null;
}

function hasReviewValue(value: unknown): boolean {
    return value !== undefined && value !== null && value !== "";
}

function StepEditButton({ step, onEditStep }: {
    step: ReviewStepData;
    onEditStep: ReviewPageProps["onEditStep"];
}) {
    return (
        <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 px-2 text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700"
            aria-label={`Edit ${step.title}`}
            onClick={() => { onEditStep(step.id, step.pageId); }}
        >
            <Edit2 className="mr-1.5 h-3 w-3" aria-hidden="true" />
            Edit
        </Button>
    );
}

export function ReviewPage({
    pages,
    allSteps,
    values,
    onEditStep,
    visiblePageIds,
    visibleStepIds,
}: ReviewPageProps) {
    const visibleStepIdSet = new Set(visibleStepIds);

    return (
        <div className="space-y-8">
            <div className="text-center space-y-2 mb-8">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 mb-2">
                    <CheckCircle2 className="w-6 h-6" aria-hidden="true" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900">Review your answers</h2>
                <p className="text-slate-500 max-w-md mx-auto">
                    Please review the information below. You can go back and make changes if needed before finalizing.
                </p>
            </div>
            <div className="space-y-6">
                {pages.map((page) => {
                    // Only show visible pages
                    if (!visiblePageIds.includes(page.id)) {
                        return null;
                    }
                    const pageSteps = allSteps.filter((step) =>
                        step.pageId === page.id && visibleStepIdSet.has(step.id)
                    );
                    if (pageSteps.length === 0) {
                        return null;
                    }
                    return (
                        <Card key={page.id} className="border-slate-200 shadow-sm overflow-hidden">
                            <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-3 px-4">
                                <CardTitle className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
                                    {page.title}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="divide-y divide-slate-100">
                                    {pageSteps.map(step => {
                                        // A list answer always renders (even at zero items, as "None added"), since
                                        // an unanswered list is a meaningful confirmation state, not conciseness noise.
                                        if (step.type === "list") {
                                            return (
                                                <div key={step.id} className="p-4 hover:bg-slate-50/30 transition-colors">
                                                    <div className="mb-2 flex items-center justify-between gap-3">
                                                        <div className="text-sm font-medium text-slate-500">
                                                            {step.title}
                                                        </div>
                                                        <StepEditButton step={step} onEditStep={onEditStep} />
                                                    </div>
                                                    <ListAnswerView
                                                        config={normalizeListConfig(step.config)}
                                                        value={values[step.id] as ListValue | null | undefined}
                                                    />
                                                </div>
                                            );
                                        }
                                        const val = values[step.id];
                                        if (!hasReviewValue(val)) {
                                            return null;
                                        } // Skip empty for conciseness
                                        return (
                                            <div key={step.id} className="grid grid-cols-1 gap-1 p-4 transition-colors hover:bg-slate-50/30 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] md:gap-4">
                                                <div className="text-sm font-medium text-slate-500 md:col-span-1">
                                                    {step.title}
                                                </div>
                                                <div className="text-sm font-medium text-slate-900 break-words">
                                                    {formatAnswerValue(val, { type: step.type, config: step.config })}
                                                </div>
                                                <StepEditButton step={step} onEditStep={onEditStep} />
                                            </div>
                                        );
                                    })}
                                    {pageSteps.every((step) => step.type !== "list" && !hasReviewValue(values[step.id])) && (
                                        <div className="p-4 text-sm text-slate-400 italic text-center">
                                            No questions answered in this page.
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}
