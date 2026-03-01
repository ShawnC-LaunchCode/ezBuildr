import { Database } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { ApiStep } from "@/lib/vault-api";

interface SimpleWorkflowVariable {
    label?: string;
    alias?: string | null;
}

interface StepBadgesProps {
    step: ApiStep;
    isExpanded: boolean;
    isLinkedToIntake: boolean;
    linkedVariable?: SimpleWorkflowVariable | null;
    upstreamWorkflowTitle?: string;
}

export function StepBadges({
    step,
    isExpanded,
    isLinkedToIntake,
    linkedVariable,
    upstreamWorkflowTitle
}: StepBadgesProps) {
    return (
        <>
            {/* Expanded Header Badges (Required / Conditional) */}
            {(step.required || (step.visibleIf !== null && step.visibleIf !== undefined)) && (
                <div className="flex items-center gap-1.5">
                    {step.required && (
                        <Badge variant="destructive" className="text-[9px] h-4 px-1.5 font-medium">
                            Required
                        </Badge>
                    )}
                    {step.visibleIf !== null && step.visibleIf !== undefined && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-amber-500/20 font-medium">
                            Conditional
                        </Badge>
                    )}
                </div>
            )}

            {/* Collapsed Intake Badge */}
            {!isExpanded && isLinkedToIntake && (
                <div className="flex items-center gap-1.5 text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full w-fit border border-emerald-100 mt-1">
                    <Database className="w-3 h-3" />
                    <span>Linked to <strong>{upstreamWorkflowTitle}</strong> ({linkedVariable?.label ?? linkedVariable?.alias})</span>
                </div>
            )}

            {/* Collapsed Conditional Badge - if not shown in header or just separate? 
                In original code, there was a separate "Conditional" badge for collapsed view 
                separate from the header row. Let's replicate that logic.
            */}
            {!isExpanded && step.visibleIf !== null && step.visibleIf !== undefined && (
                <div className="mt-1">
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-amber-500/20 font-medium">
                        Conditional
                    </Badge>
                </div>
            )}
        </>
    );
}

// Separate component for the little pill under the chevron?
// In the original, there's a badge under the chevron/icon column for "Conditional".
// And also badges in the main content area.
// The "Badges" component above combines the main content area badges.
// The "Conditional" pill under the chevron is specific to the sidebar column.
// Let's migrate that one too or keep it?
// StepBadges above seems to mix two locations (Header row vs Sidebar).
// Actually, looking at StepCard.tsx:
// 1. Sidebar Column: "Conditional" badge (collapsed only) - Lines 211-217 (WAIT, this is in the sidebar column? No, lines 180-208 is sidebar.)
// Lines 211-217 is "Visual Pills (collapsed view)" - logic seems to be:
//    Sidebar is Grip + Icon/Collapse Button.
//    Then "Visual Pills (collapsed view)"... wait, line 210 says "Visual Pills (collapsed view)".
//    But line 170 `flex items-start gap-2` starts the main row.
//    Sidebar is a `flex-col`? No, `flex items-start gap-2` is the row.
//    Children:
//      1. Drag Handle
//      2. Icon/Collapse Column (lines 181-208)
//      3. "Visual Pills" (lines 211-217)? NO, that's strictly INSIDE the flex row?
//      Wait, line 211-217 is effectively column 3?
//      Then Content Div (line 220) is column 4.
//
//      Let's re-read the structure.
//      <div flex items-start gap-2>
//          <button> (Grip)
//          <div> (Icon + Chevron)
//          <div> (Pills? No, this div is conditional) -> line 211.
//          <div> (Content) -> line 220.
//      </div>
//
//      So "Visual Pills" (Conditional) is a separate column between Icon and Content?
//      This seems odd layout-wise if it's just one badge.
//
//      Then inside Content (line 220):
//          Header Row (Required/Conditional) -> line 222
//          StepTitleRow -> line 238
//          Intake Badge -> line 251.
//
//      So we have duplication of "Conditional" badge?
//      One in the "Visual Pills" column (collapsed only), and one in the Header Row (always?).
//
//      Refactoring strategy: consolidate visual logic.
//      I will make `StepBadges` handle the *Content Area* badges (Header + Intake).
//      The "Visual Pills" column badge I might leave or extract separately if it's distinct.
//      Actually, maybe it's cleaner to put it all in `StepBadges` and just render it in `StepCard`.
