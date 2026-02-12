/**
 * DatabasesPageHeader
 * Header section for the Databases List page including breadcrumbs,
 * title, create button, and search input.
 */

import { Database as DatabaseIcon, Plus, Search } from "lucide-react";

import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface DatabasesPageHeaderProps {
    searchQuery: string;
    onSearchChange: (value: string) => void;
    onCreateClick: () => void;
    showSearch: boolean;
}

export function DatabasesPageHeader({
    searchQuery,
    onSearchChange,
    onCreateClick,
    showSearch,
}: DatabasesPageHeaderProps): React.JSX.Element {
    return (
        <>
            {/* Breadcrumbs */}
            <div className="mb-4">
                <Breadcrumbs
                    items={[
                        { label: "DataVault", href: "/datavault", icon: <DatabaseIcon className="w-3 h-3" /> },
                        { label: "Databases" },
                    ]}
                />
            </div>

            {/* Page Header */}
            <div className="flex flex-col gap-4 mb-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-foreground">
                            <DatabaseIcon className="inline-block w-8 h-8 mr-3" aria-hidden="true" />
                            Databases
                        </h1>
                        <p className="text-muted-foreground mt-1">
                            Organize your tables into databases by project, workflow, or account
                        </p>
                    </div>
                    <Button onClick={onCreateClick}>
                        <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
                        Create Database
                        <kbd className="ml-2 hidden sm:inline-block pointer-events-none h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                            <span className="text-xs">⌘</span>K
                        </kbd>
                    </Button>
                </div>

                {/* Search */}
                {showSearch && (
                    <div className="relative max-w-md">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" aria-hidden="true" />
                        <Input
                            placeholder="Search databases..."
                            value={searchQuery}
                            onChange={(e) => { onSearchChange(e.target.value); }}
                            className="pl-9"
                        />
                    </div>
                )}
            </div>
        </>
    );
}
