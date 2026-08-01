import { ReactNode } from "react";
import { Check } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface ClientRunnerLayoutProps {
    children: ReactNode;
    title?: string;
    progress?: number;
    currentStep?: number;
    totalSteps?: number;
    saveStatus?: "idle" | "saving" | "saved" | "error";
    saveAndResumeAction?: ReactNode;
    className?: string;
}

export function ClientRunnerLayout({
    children,
    title,
    progress,
    currentStep,
    totalSteps,
    saveStatus,
    saveAndResumeAction,
    className
}: ClientRunnerLayoutProps) {
    return (
        <div className="min-h-screen bg-muted/20 flex flex-col font-sans text-foreground">
            {/* Minimal Header */}
            <header className="bg-background border-b border-border py-4 px-4 sticky top-0 z-20">
                <div className="max-w-2xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {/* Placeholder Logo / Brand */}
                        <div className="w-6 h-6 bg-primary rounded-sm" />
                        <span className="font-semibold text-sm tracking-tight text-foreground">ezBuildr</span>
                    </div>
                    {/* Status area (Step count + Save Status) */}
                    <div className="flex items-center gap-4">
                        {saveAndResumeAction}
                        {saveStatus && saveStatus !== "idle" && (
                            <div className="flex items-center gap-1.5 text-xs font-medium animate-in fade-in zoom-in duration-300">
                                {saveStatus === "saving" && (
                                    <>
                                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                        <span className="text-muted-foreground">Saving...</span>
                                    </>
                                )}
                                {saveStatus === "saved" && (
                                    <>
                                        <Check className="h-3 w-3 text-green-500" />
                                        <span className="text-muted-foreground">Saved</span>
                                    </>
                                )}
                                {saveStatus === "error" && (
                                    <span className="text-destructive">Save failed</span>
                                )}
                            </div>
                        )}
                        {totalSteps && totalSteps > 0 && currentStep !== undefined && (
                            <div className="text-xs text-muted-foreground font-medium">
                                {currentStep >= totalSteps ? "Review" : `Step ${currentStep + 1} of ${totalSteps}`}
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Progress Bar (Sticky under header) */}
            {progress !== undefined && (
                <div className="sticky top-[57px] z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                    <Progress value={progress} className="h-1 w-full rounded-none bg-muted" aria-label="Survey Progress" />
                </div>
            )}

            {/* Main Content Area */}
            <main className={cn("flex-1 w-full max-w-2xl mx-auto p-4 md:p-8 md:pt-12", className)}>
                {title && (
                    <div className="mb-6 md:mb-8 text-center md:text-left animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                            {title}
                        </h1>
                    </div>
                )}

                {/* Content Container */}
                <div className="bg-background rounded-xl shadow-sm border border-border p-6 md:p-8 animate-in fade-in zoom-in-95 duration-500 delay-75">
                    {children}
                </div>

                {/* Footer / Trust Signals */}
                <div className="mt-8 text-center text-xs text-muted-foreground pb-8">
                    <p>Securely powered by ezBuildr</p>
                </div>
            </main>
        </div>
    );
}
