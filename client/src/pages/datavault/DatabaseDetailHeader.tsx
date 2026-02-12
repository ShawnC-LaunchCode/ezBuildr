/**
 * DatabaseDetailHeader
 * Header section for the Database Detail page including breadcrumbs,
 * back button, database info, and settings dropdown.
 */

import { Database as DatabaseIcon, ArrowLeft, Settings, MoreVertical } from "lucide-react";

import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DatabaseDetailHeaderProps {
    database: { name: string; description?: string | null };
    onNavigateBack: () => void;
    onNavigateSettings: () => void;
}

export function DatabaseDetailHeader({
    database,
    onNavigateBack,
    onNavigateSettings,
}: DatabaseDetailHeaderProps): React.JSX.Element {
    return (
        <div className="border-b bg-background px-4 py-3">
            {/* Breadcrumbs */}
            <div className="mb-3">
                <Breadcrumbs
                    items={[
                        { label: "DataVault", href: "/datavault", icon: <DatabaseIcon className="w-3 h-3" /> },
                        { label: "Databases", href: "/datavault/databases" },
                        { label: database.name },
                    ]}
                />
            </div>

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={onNavigateBack}>
                        <ArrowLeft className="w-4 h-4 mr-2" aria-hidden="true" />
                        Back
                    </Button>
                    <DatabaseIcon className="w-6 h-6 text-muted-foreground" aria-hidden="true" />
                    <div>
                        <h1 className="text-lg font-semibold">{database.name}</h1>
                        {database.description && (
                            <p className="text-sm text-muted-foreground">{database.description}</p>
                        )}
                    </div>
                </div>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                            <MoreVertical className="w-4 h-4" aria-hidden="true" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={onNavigateSettings}>
                            <Settings className="w-4 h-4 mr-2" aria-hidden="true" />
                            Settings
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
}
