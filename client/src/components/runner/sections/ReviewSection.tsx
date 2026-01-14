import { Edit2, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface ReviewSectionProps {
    sections: any[];
    allSteps: any[];
    values: Record<string, any>;
    onEditSection: (sectionIndex: number) => void;
    visibleSectionIds: string[];
}

export function ReviewSection({
    sections,
    allSteps,
    values,
    onEditSection,
    visibleSectionIds
}: ReviewSectionProps) {

    // Helper to format values for display
    const formatValue = (val: any): string => {
        if (val === null || val === undefined || val === "") {return "Not answered";}
        if (typeof val === "boolean") {return val ? "Yes" : "No";}
        if (val instanceof Date) {return val.toLocaleDateString();}
        if (Array.isArray(val)) {return val.join(", ");}
        if (typeof val === "object") {return JSON.stringify(val);} // Fallback
        return String(val);
    };

    return (
        <div className="space-y-8">
            <div className="text-center space-y-2 mb-8">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 mb-2">
                    <CheckCircle2 className="w-6 h-6" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900">Review your answers</h2>
                <p className="text-slate-500 max-w-md mx-auto">
                    Please review the information below. You can go back and make changes if needed before finalizing.
                </p>
            </div>

            <div className="space-y-6">
                {sections.map((section, index) => {
                    // Only show visible sections
                    if (!visibleSectionIds.includes(section.id)) {return null;}

                    const sectionSteps = allSteps.filter(s => s.sectionId === section.id);
                    // Hide sections with no visible steps? For now show all visible sections.

                    return (
                        <Card key={section.id} className="border-slate-200 shadow-sm overflow-hidden">
                            <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-3 px-4 flex flex-row items-center justify-between">
                                <CardTitle className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
                                    {section.title}
                                </CardTitle>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 px-2"
                                    onClick={() => onEditSection(index)}
                                >
                                    <Edit2 className="w-3 h-3 mr-1.5" />
                                    Edit
                                </Button>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="divide-y divide-slate-100">
                                    {sectionSteps.map((step: any) => {
                                        // Hide un-answered or invisible steps if needed
                                        // For review, we usually want to show what was answered.
                                        // If a step was hidden by logic, it shouldn't be here (values might be empty or stale).
                                        // Ideally, we check step visibility too, but that requires re-running logic.
                                        // Simplification: Show if value exists or if it's in the list.

                                        const val = values[step.id];
                                        if (val === undefined || val === null || val === "") {return null;} // Skip empty for conciseness

                                        return (
                                            <div key={step.id} className="grid grid-cols-1 md:grid-cols-3 gap-1 md:gap-4 p-4 hover:bg-slate-50/30 transition-colors">
                                                <div className="text-sm font-medium text-slate-500 md:col-span-1">
                                                    {step.title}
                                                </div>
                                                <div className="text-sm text-slate-900 md:col-span-2 font-medium break-words">
                                                    {formatValue(val)}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {sectionSteps.every((s: any) => !values[s.id]) && (
                                        <div className="p-4 text-sm text-slate-400 italic text-center">
                                            No questions answered in this section.
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
