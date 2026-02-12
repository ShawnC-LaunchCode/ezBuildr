/**
 * DatabasesGrid
 * Displays loading skeleton, database cards grid, empty state, or no-results state.
 */

import { Database as DatabaseIcon, Plus, Search } from "lucide-react";

import { DatabaseCard } from "@/components/datavault/DatabaseCard";
import { Button } from "@/components/ui/button";
import type { DatavaultDatabase } from "@/lib/datavault-api";

interface DatabasesGridProps {
    isLoading: boolean;
    databases: DatavaultDatabase[] | undefined;
    filteredDatabases: DatavaultDatabase[] | undefined;
    searchQuery: string;
    onClearSearch: () => void;
    onDatabaseClick: (id: string) => void;
    onTransfer: (id: string, name: string) => void;
    onDelete: (database: DatavaultDatabase) => void;
    onCreateClick: () => void;
}

export function DatabasesGrid({
    isLoading,
    databases,
    filteredDatabases,
    searchQuery,
    onClearSearch,
    onDatabaseClick,
    onTransfer,
    onDelete,
    onCreateClick,
}: DatabasesGridProps): React.JSX.Element | null {
    /* Loading skeleton */
    if (isLoading) {
        return (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="h-48 bg-muted animate-pulse rounded-lg" />
                ))}
            </div>
        );
    }

    /* Populated grid */
    if (filteredDatabases && filteredDatabases.length > 0) {
        return (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredDatabases.map((database) => (
                    <DatabaseCard
                        key={database.id}
                        database={database}
                        onClick={() => { onDatabaseClick(database.id); }}
                        onTransfer={(id, name) => onTransfer(id, name)}
                        onDelete={() => onDelete(database)}
                    />
                ))}
            </div>
        );
    }

    /* Empty state – no databases at all */
    if (databases?.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="rounded-full bg-muted p-6 mb-4">
                    <DatabaseIcon className="w-12 h-12 text-muted-foreground" aria-hidden="true" />
                </div>
                <h3 className="text-xl font-semibold mb-2">No databases yet</h3>
                <p className="text-muted-foreground mb-6 max-w-sm">
                    Get started by creating your first database to organize your tables
                </p>
                <Button onClick={onCreateClick}>
                    <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
                    Create Your First Database
                </Button>
            </div>
        );
    }

    /* No search results */
    if (searchQuery.length > 0 && filteredDatabases?.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center">
                <Search className="w-12 h-12 text-muted-foreground mb-4" aria-hidden="true" />
                <h3 className="text-xl font-semibold mb-2">No results found</h3>
                <p className="text-muted-foreground mb-4">
                    No databases match &ldquo;{searchQuery}&rdquo;
                </p>
                <Button variant="outline" onClick={onClearSearch}>Clear Search</Button>
            </div>
        );
    }

    return null;
}
