
import { AlertTriangle, Camera, Edit2, Eye, Play, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiSnapshot } from "@/lib/vault-api";

interface SnapshotsTableProps {
    snapshots: ApiSnapshot[] | undefined;
    isLoading: boolean;
    onPreview: (snapshot: ApiSnapshot) => void;
    onView: (snapshot: ApiSnapshot) => void;
    onRename: (snapshot: ApiSnapshot) => void;
    onDelete: (snapshot: ApiSnapshot) => void;
}

export function SnapshotsTable({
    snapshots,
    isLoading,
    onPreview,
    onView,
    onRename,
    onDelete
}: SnapshotsTableProps) {
    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-muted-foreground">Loading scenarios...</div>
            </div>
        );
    }

    if (!snapshots || snapshots.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center max-w-sm mx-auto">
                <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mb-4">
                    <Camera className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No saved scenarios yet</h3>
                <p className="text-sm text-muted-foreground text-center">
                    Create a scenario by running a Preview. At any point, you can click &quot;Save Scenario&quot; to capture the current answers for later use.
                </p>
            </div>
        );
    }

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Scenario Name</TableHead>
                    <TableHead>Data Points</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {snapshots.map((snapshot) => {
                    const valueCount = Object.keys(snapshot.values).length;
                    // Show outdated indicator if no versionHash (old snapshot) or hash missing
                    const isOutdated = !snapshot.versionHash;
                    return (
                        <TableRow key={snapshot.id}>
                            <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                    {snapshot.name}
                                    {isOutdated && (
                                        <span
                                            className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 px-1.5 py-0.5 rounded"
                                            title="Scenario created on an older version of this workflow"
                                        >
                                            <AlertTriangle className="w-3 h-3" />
                                            <span className="hidden sm:inline">Needs Update</span>
                                        </span>
                                    )}
                                </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                                {valueCount} {valueCount === 1 ? 'answer' : 'answers'}
                            </TableCell>
                            <TableCell>{new Date(snapshot.createdAt).toLocaleDateString()}</TableCell>
                            <TableCell className="text-right space-x-2">
                                <Button
                                    size="sm"
                                    variant="default"
                                    className="bg-indigo-600 hover:bg-indigo-700"
                                    onClick={() => onPreview(snapshot)}
                                >
                                    <Play className="w-3 h-3 mr-1" />
                                    Run Scenario
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => onView(snapshot)}>
                                    <Eye className="w-3 h-3" />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => onRename(snapshot)}>
                                    <Edit2 className="w-3 h-3" />
                                </Button>
                                <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => onDelete(snapshot)}>
                                    <Trash2 className="w-3 h-3" />
                                </Button>
                            </TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
}
