import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface Collaborator {
    userId: string;
    displayName: string;
    color: string;
    email?: string;
}

interface StepLockOverlayProps {
    isLockedByOther: boolean;
    lockedBy: Collaborator | null;
}

export function StepLockOverlay({ isLockedByOther, lockedBy }: StepLockOverlayProps) {
    if (!isLockedByOther) {return null;}

    return (
        <>
            <div className="absolute top-2 right-12 z-20 flex items-center gap-2 bg-background/95 backdrop-blur px-2 py-1 rounded-full shadow-sm border border-indigo-100 animate-in fade-in zoom-in-95 duration-200">
                <span className="text-[10px] font-medium text-indigo-700">Edited by {lockedBy?.displayName}</span>
                <Avatar className="w-5 h-5 ring-1 ring-white">
                    <AvatarFallback style={{ backgroundColor: lockedBy?.color }} className="text-[9px] text-white">
                        {lockedBy?.displayName.charAt(0)}
                    </AvatarFallback>
                </Avatar>
            </div>
            {/* Interaction Blocker */}
            <div className="absolute inset-0 z-10 bg-white/20" />
        </>
    );
}
