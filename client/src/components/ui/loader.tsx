import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

interface LoaderProps extends React.HTMLAttributes<HTMLDivElement> {
    size?: "sm" | "default" | "lg" | "xl";
    variant?: "default" | "secondary" | "ghost" | "destructive";
}

export function Loader({ className, size = "default", ...props }: LoaderProps) {
    const sizeClasses = {
        sm: "h-4 w-4",
        default: "h-8 w-8",
        lg: "h-12 w-12",
        xl: "h-16 w-16",
    };

    return (
        <div className={cn("flex justify-center items-center p-4", className)} {...props}>
            <Loader2 className={cn("animate-spin text-muted-foreground", sizeClasses[size])} />
        </div>
    );
}

export function FullScreenLoader() {
    return (
        <div className="flex h-screen w-screen items-center justify-center bg-background">
            <Loader size="xl" />
        </div>
    );
}
