import { ReactNode } from "react";
import { Check, AlertCircle, CloudOff, RefreshCw, Loader2 } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { RunnerBrandMark } from "@/components/runner/RunnerBrandMark";
import { useBrandedFavicon, useBrandingStyle } from "@/hooks/useRunnerBranding";
import { cn } from "@/lib/utils";
import { type SaveStatus } from "@/hooks/useAutoSave";
import { DEFAULT_RESOLVED_BRANDING, type ResolvedBranding } from "@shared/types/branding";

interface ClientRunnerLayoutProps {
    children: ReactNode;
    title?: string;
    progress?: number;
    currentStep?: number;
    totalSteps?: number;
    saveStatus?: SaveStatus;
    saveAndResumeAction?: ReactNode;
    className?: string;
    /** Resolved participant branding (GH-158). Defaults to the ezBuildr brand. */
    branding?: ResolvedBranding;
}

export function ClientRunnerLayout({
    children,
    title,
    progress,
    currentStep,
    totalSteps,
    saveStatus,
    saveAndResumeAction,
    className,
    branding = DEFAULT_RESOLVED_BRANDING
}: ClientRunnerLayoutProps) {
    // Scoped to this element rather than :root so a preview rendered inside the
    // builder cannot repaint the surrounding app chrome.
    const brandingStyle = useBrandingStyle(branding);
    useBrandedFavicon(branding.faviconUrl);

    return (
        <div className="min-h-screen bg-muted/20 flex flex-col font-sans text-foreground" style={brandingStyle}>
            {/* Minimal Header */}
            <header className="bg-background border-b border-border py-4 px-4 sticky top-0 z-20">
                <div className="max-w-2xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <RunnerBrandMark branding={branding} />
                    </div>
                    {/* Status area (Step count + Save Status) */}
                    <div className="flex items-center gap-4">
                        {saveAndResumeAction}
                        {saveStatus && saveStatus !== "idle" && (
                            <div
                                className="flex items-center gap-1.5 text-xs font-medium animate-in fade-in zoom-in duration-300"
                                role="status"
                                aria-live="polite"
                            >
                                {saveStatus === "saving" && (
                                    <>
                                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                                        <span className="text-muted-foreground">Saving...</span>
                                    </>
                                )}
                                {saveStatus === "saved" && (
                                    <>
                                        <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                        <span className="text-muted-foreground">Saved</span>
                                    </>
                                )}
                                {saveStatus === "offline" && (
                                    <>
                                        <CloudOff className="h-3.5 w-3.5 text-amber-500" />
                                        <span className="text-amber-600 dark:text-amber-400 font-medium">Offline (saved locally)</span>
                                    </>
                                )}
                                {saveStatus === "syncing" && (
                                    <>
                                        <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-500" />
                                        <span className="text-blue-600 dark:text-blue-400 font-medium">Syncing changes...</span>
                                    </>
                                )}
                                {saveStatus === "error" && (
                                    <>
                                        <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                                        <span className="text-destructive font-medium">Save failed</span>
                                    </>
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
                    <Progress value={progress} className="h-1 w-full rounded-none bg-muted" aria-label="Workflow Progress" />
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

                {/* Footer / Trust Signals — removed entirely under white-label */}
                {!branding.whiteLabel && (
                    <div className="mt-8 text-center text-xs text-muted-foreground pb-8">
                        <p>Securely powered by ezBuildr</p>
                    </div>
                )}
            </main>
        </div>
    );
}
