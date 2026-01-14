import React, { ReactNode } from "react";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface ClientRunnerLayoutProps {
    children: ReactNode;
    title?: string;
    progress?: number;
    currentStep?: number;
    totalSteps?: number;
    className?: string;
}

export function ClientRunnerLayout({
    children,
    title,
    progress,
    currentStep,
    totalSteps,
    className
}: ClientRunnerLayoutProps) {
    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
            {/* Minimal Header */}
            <header className="bg-white border-b border-slate-100 py-4 px-4 sticky top-0 z-20">
                <div className="max-w-2xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {/* Placeholder Logo / Brand */}
                        <div className="w-6 h-6 bg-slate-900 rounded-sm" />
                        <span className="font-semibold text-sm tracking-tight">ezBuildr</span>
                    </div>
                    {totalSteps && currentStep !== undefined && (
                        <div className="text-xs text-slate-500 font-medium">
                            Step {currentStep + 1} of {totalSteps}
                        </div>
                    )}
                </div>
            </header>

            {/* Progress Bar (Sticky under header) */}
            {progress !== undefined && (
                <div className="sticky top-[57px] z-20 bg-slate-50">
                    <Progress value={progress} className="h-1 w-full rounded-none bg-slate-200" />
                </div>
            )}

            {/* Main Content Area */}
            <main className={cn("flex-1 w-full max-w-2xl mx-auto p-4 md:p-8 md:pt-12", className)}>
                {title && (
                    <div className="mb-6 md:mb-8 text-center md:text-left animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
                            {title}
                        </h1>
                    </div>
                )}

                {/* Content Container */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 md:p-8 animate-in fade-in zoom-in-95 duration-500 delay-75">
                    {children}
                </div>

                {/* Footer / Trust Signals */}
                <div className="mt-8 text-center text-xs text-slate-400 pb-8">
                    <p>Securely powered by ezBuildr</p>
                </div>
            </main>
        </div>
    );
}
