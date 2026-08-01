import { Loader2 } from "lucide-react"
import React from "react"

import { cn } from "@/lib/utils"

interface LoaderProps extends React.HTMLAttributes<HTMLDivElement> {
    size?: "sm" | "default" | "lg" | "xl"
    variant?: "default" | "secondary" | "ghost" | "destructive"
}

const sizeClasses = {
    sm: "h-4 w-4",
    default: "h-8 w-8",
    lg: "h-12 w-12",
    xl: "h-16 w-16",
}

export function Loader({ className, size = "default", ...props }: LoaderProps) {
    return (
        <div
            role="status"
            aria-label="Loading"
            className={cn("flex justify-center items-center p-4", className)}
            {...props}
        >
            <Loader2
                className={cn("animate-spin text-muted-foreground", sizeClasses[size])}
                aria-hidden="true"
            />
        </div>
    )
}

export function FullScreenLoader({ message }: { message?: string }) {
    return (
        <div className="flex flex-col h-screen w-screen items-center justify-center bg-background gap-4">
            <Loader size="xl" />
            {message && <p className="text-sm text-muted-foreground animate-pulse">{message}</p>}
        </div>
    );
}
