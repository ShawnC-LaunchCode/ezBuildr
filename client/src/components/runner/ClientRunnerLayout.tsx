import { ReactNode, useState } from "react";
import { Check, AlertCircle, CloudOff, RefreshCw, Loader2, PanelLeft } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { RunnerBrandMark } from "@/components/runner/RunnerBrandMark";
import { RunnerSectionNav, type NavigateHandler, type RunnerNavData } from "@/components/runner/RunnerSectionNav";
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
    /**
     * Section rail contents (SECT-8B). Omitted on screens with nothing to
     * navigate — the completion screen, or a run whose pages logic all removed.
     */
    nav?: RunnerNavData;
    /**
     * Makes the rail navigable (SECT-9). Omitted, the rail stays inert; the
     * runner re-checks reachedness before it moves, so this is an affordance.
     */
    onNavigateToPage?: NavigateHandler;
}

function RunnerSaveStatus({ saveStatus }: { saveStatus: SaveStatus }) {
    return (
        <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-1.5 text-xs font-medium animate-in fade-in zoom-in duration-300"
        >
            {saveStatus === "saving" && (
                <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden="true" />
                    <span className="text-muted-foreground">Saving...</span>
                </>
            )}
            {saveStatus === "saved" && (
                <>
                    <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    <span className="text-muted-foreground">Saved</span>
                </>
            )}
            {saveStatus === "offline" && (
                <>
                    <CloudOff className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
                    <span className="text-amber-600 dark:text-amber-400 font-medium">Offline (saved locally)</span>
                </>
            )}
            {saveStatus === "syncing" && (
                <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-500" aria-hidden="true" />
                    <span className="text-blue-600 dark:text-blue-400 font-medium">Syncing changes...</span>
                </>
            )}
            {saveStatus === "error" && (
                <>
                    <AlertCircle className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
                    <span className="text-destructive font-medium">Save failed</span>
                </>
            )}
        </div>
    );
}

/**
 * Below `md` the rail collapses behind this trigger. The runner is respondent-
 * facing and heavily used on phones, where a fixed rail would eat the content
 * column; the sheet's contents mount only while it is open, so the rail's page
 * titles exist exactly once in the DOM at any width.
 */
function RunnerNavSheet({ nav, onNavigateToPage }: { nav: RunnerNavData; onNavigateToPage?: NavigateHandler }) {
    // Controlled so a jump dismisses the sheet: leaving it open over the page
    // the respondent just asked for would hide the answer they came to change.
    const [open, setOpen] = useState(false);

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
                aria-label="Open interview contents"
                className="-ml-1 mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none md:hidden"
            >
                <PanelLeft className="h-4 w-4" aria-hidden="true" />
            </SheetTrigger>
            <SheetContent side="left" className="w-[85vw] max-w-xs overflow-y-auto p-4 pt-10">
                <SheetTitle className="sr-only">Interview contents</SheetTitle>
                <RunnerSectionNav
                    data={nav}
                    onNavigate={onNavigateToPage && ((pageId) => {
                        setOpen(false);
                        onNavigateToPage(pageId);
                    })}
                />
            </SheetContent>
        </Sheet>
    );
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
    branding = DEFAULT_RESOLVED_BRANDING,
    nav,
    onNavigateToPage
}: ClientRunnerLayoutProps) {
    // Scoped to this element rather than :root so a preview rendered inside the
    // builder cannot repaint the surrounding app chrome.
    const brandingStyle = useBrandingStyle(branding);
    useBrandedFavicon(branding.faviconUrl);
    const hasNav = nav != null && nav.visiblePages.length > 0;

    return (
        <div className="min-h-screen bg-muted/20 flex flex-col font-sans text-foreground" style={brandingStyle}>
            {/* Header. Deliberately full-bleed rather than centred on the old
                max-w-2xl measure: with a rail beside the content column, a
                centred lockup floats over the questions instead of sitting
                above the rail it belongs to. Fixed 57px so the progress bar's
                sticky offset stays exact whatever the header holds. */}
            <header className="bg-background border-b border-border h-[57px] px-4 md:px-6 sticky top-0 z-20">
                <div className="flex h-full items-center justify-between gap-3 md:gap-4">
                    {/* shrink-0: the nav trigger costs the row 36px, which was
                        enough to squeeze the brand swatch to nothing at 390px. */}
                    <div className="flex shrink-0 items-center gap-2">
                        {hasNav && <RunnerNavSheet nav={nav} onNavigateToPage={onNavigateToPage} />}
                        <RunnerBrandMark branding={branding} />
                    </div>
                    {/* Status area (Step count + Save Status) */}
                    <div className="flex min-w-0 items-center gap-3 md:gap-4">
                        {saveAndResumeAction}
                        {saveStatus && saveStatus !== "idle" && <RunnerSaveStatus saveStatus={saveStatus} />}
                        {totalSteps && totalSteps > 0 && currentStep !== undefined && (
                            <div
                                // The rail carries position better than this counter and
                                // repeats the same n/m in its header, so on phones it yields
                                // the row rather than pushing the header into horizontal
                                // overflow at 360px. Unchanged where there is no rail.
                                className={cn(
                                    "whitespace-nowrap text-xs text-muted-foreground font-medium",
                                    hasNav && "hidden sm:block"
                                )}
                                aria-label="Progress summary"
                            >
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

            <div className="flex w-full flex-1 items-start">
                {hasNav && (
                    <aside className="sticky top-[61px] hidden h-[calc(100vh-61px)] w-64 shrink-0 overflow-y-auto border-r border-border bg-background px-3 py-4 md:block">
                        <RunnerSectionNav data={nav} onNavigate={onNavigateToPage} />
                    </aside>
                )}

                {/* Main Content Area — the measure is unchanged from before the
                    rail existed, so question layout is identical at a given
                    content width. */}
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
        </div>
    );
}
