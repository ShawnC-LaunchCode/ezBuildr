/**
 * useDatabaseDetailHandlers
 * Custom hook encapsulating all CRUD mutations and handlers for the Database Detail Page.
 * Extracted from [databaseId].tsx to reduce component complexity.
 */

import {
    useCreateDatavaultTable,
    useMoveDatavaultTable,
    useCreateDatavaultColumn,
    useUpdateDatavaultColumn,
    useDeleteDatavaultColumn,
    useReorderDatavaultColumns,
    useCreateDatavaultRow,
    useUpdateDatavaultRow,
    useDeleteDatavaultRow,
} from "@/lib/datavault-hooks";

interface UseHandlersParams {
    databaseId: string;
    activeTableId: string | null;
    activeTableName?: string;
    editingRow: { id: string; values: Record<string, unknown> } | null;
    deleteRowConfirm: string | null;
    toast: (opts: { title: string; description?: string; variant?: "default" | "destructive" }) => void;
    setLocation: (path: string) => void;
    setCreateTableOpen: (open: boolean) => void;
    setActiveTableId: (id: string) => void;
    setRowEditorOpen: (open: boolean) => void;
    setEditingRow: (row: { id: string; values: Record<string, unknown> } | null) => void;
    setDeleteRowConfirm: (id: string | null) => void;
    setMoveTableOpen: (open: boolean) => void;
}

interface DatabaseDetailHandlers {
    handleCreateTable: (data: { name: string; description?: string; slug?: string }) => Promise<void>;
    handleMoveTable: (targetDatabaseId: string | null) => Promise<void>;
    handleAddColumn: (data: { name: string; type: string; required: boolean }) => Promise<void>;
    handleUpdateColumn: (columnId: string, data: { name: string; required: boolean }) => Promise<void>;
    handleDeleteColumn: (columnId: string) => Promise<void>;
    handleReorderColumns: (columnIds: string[]) => Promise<void>;
    handleAddRow: (values: Record<string, unknown>) => Promise<void>;
    handleCreateRow: (values: Record<string, unknown>) => Promise<void>;
    handleUpdateRow: (values: Record<string, unknown>) => Promise<void>;
    handleDeleteRow: () => Promise<void>;
    openEditRow: (rowId: string, values: Record<string, unknown>) => void;
    isColumnMutating: boolean;
    isRowMutating: boolean;
    createTableMutation: { isPending: boolean };
    moveTableMutation: { isPending: boolean };
}

function toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "An error occurred";
}

export function useDatabaseDetailHandlers(params: UseHandlersParams): DatabaseDetailHandlers {
    const {
        databaseId,
        activeTableId,
        activeTableName,
        editingRow,
        deleteRowConfirm,
        toast,
        setLocation,
        setCreateTableOpen,
        setActiveTableId,
        setRowEditorOpen,
        setEditingRow,
        setDeleteRowConfirm,
        setMoveTableOpen,
    } = params;

    // Mutations
    const createTableMutation = useCreateDatavaultTable();
    const moveTableMutation = useMoveDatavaultTable();
    const createColumnMutation = useCreateDatavaultColumn();
    const updateColumnMutation = useUpdateDatavaultColumn();
    const deleteColumnMutation = useDeleteDatavaultColumn();
    const reorderColumnsMutation = useReorderDatavaultColumns();
    const createRowMutation = useCreateDatavaultRow();
    const updateRowMutation = useUpdateDatavaultRow();
    const deleteRowMutation = useDeleteDatavaultRow();

    const isColumnMutating =
        createColumnMutation.isPending || updateColumnMutation.isPending || deleteColumnMutation.isPending;

    const isRowMutating =
        createRowMutation.isPending || updateRowMutation.isPending || deleteRowMutation.isPending;

    const handleCreateTable = async (data: { name: string; description?: string; slug?: string }): Promise<void> => {
        try {
            const table = await createTableMutation.mutateAsync({
                ...data,
                databaseId,
            } as Parameters<typeof createTableMutation.mutateAsync>[0]);
            toast({ title: "Table created", description: `Table "${data.name}" has been created.` });
            setCreateTableOpen(false);
            setActiveTableId(table.id);
        } catch (error: unknown) {
            toast({ title: "Failed to create table", description: toErrorMessage(error), variant: "destructive" });
        }
    };

    const handleMoveTable = async (targetDatabaseId: string | null): Promise<void> => {
        if (!activeTableId || !activeTableName) { return; }
        try {
            await moveTableMutation.mutateAsync({ tableId: activeTableId, databaseId: targetDatabaseId });
            toast({ title: "Table moved", description: `Table "${activeTableName}" has been moved.` });
            setMoveTableOpen(false);
            if (targetDatabaseId) {
                setLocation(`/datavault/databases/${targetDatabaseId}`);
            } else {
                setLocation('/datavault');
            }
        } catch (error: unknown) {
            toast({ title: "Failed to move table", description: toErrorMessage(error), variant: "destructive" });
        }
    };

    const handleAddColumn = async (data: { name: string; type: string; required: boolean }): Promise<void> => {
        if (!activeTableId) { return; }
        try {
            await createColumnMutation.mutateAsync({ tableId: activeTableId, ...data });
            toast({ title: "Column added", description: `Column "${data.name}" has been added.` });
        } catch (error: unknown) {
            toast({ title: "Failed to add column", description: toErrorMessage(error), variant: "destructive" });
        }
    };

    const handleUpdateColumn = async (columnId: string, data: { name: string; required: boolean }): Promise<void> => {
        if (!activeTableId) { return; }
        try {
            await updateColumnMutation.mutateAsync({ columnId, tableId: activeTableId, ...data });
            toast({ title: "Column updated" });
        } catch (error: unknown) {
            toast({ title: "Failed to update column", description: toErrorMessage(error), variant: "destructive" });
            throw error;
        }
    };

    const handleDeleteColumn = async (columnId: string): Promise<void> => {
        if (!activeTableId) { return; }
        try {
            await deleteColumnMutation.mutateAsync({ columnId, tableId: activeTableId });
            toast({ title: "Column deleted" });
        } catch (error: unknown) {
            toast({ title: "Failed to delete column", description: toErrorMessage(error), variant: "destructive" });
        }
    };

    const handleReorderColumns = async (columnIds: string[]): Promise<void> => {
        if (!activeTableId) { return; }
        await reorderColumnsMutation.mutateAsync({ tableId: activeTableId, columnIds });
    };

    const handleAddRow = async (values: Record<string, unknown>): Promise<void> => {
        if (!activeTableId) { return; }
        try {
            await createRowMutation.mutateAsync({ tableId: activeTableId, values });
            toast({ title: "Row added" });
            setRowEditorOpen(false);
        } catch (error: unknown) {
            toast({ title: "Failed to add row", description: toErrorMessage(error), variant: "destructive" });
        }
    };

    const handleCreateRow = async (values: Record<string, unknown>): Promise<void> => {
        if (!activeTableId) { return; }
        await createRowMutation.mutateAsync({ tableId: activeTableId, values });
    };

    const handleUpdateRow = async (values: Record<string, unknown>): Promise<void> => {
        if (!activeTableId || !editingRow) { return; }
        try {
            await updateRowMutation.mutateAsync({ rowId: editingRow.id, tableId: activeTableId, values });
            toast({ title: "Row updated" });
            setEditingRow(null);
        } catch (error: unknown) {
            toast({ title: "Failed to update row", description: toErrorMessage(error), variant: "destructive" });
        }
    };

    const handleDeleteRow = async (): Promise<void> => {
        if (!activeTableId || !deleteRowConfirm) { return; }
        try {
            await deleteRowMutation.mutateAsync({ rowId: deleteRowConfirm, tableId: activeTableId });
            toast({ title: "Row deleted" });
            setDeleteRowConfirm(null);
        } catch (error: unknown) {
            toast({ title: "Failed to delete row", description: toErrorMessage(error), variant: "destructive" });
        }
    };

    const openEditRow = (rowId: string, values: Record<string, unknown>): void => {
        setEditingRow({ id: rowId, values });
    };

    return {
        handleCreateTable,
        handleMoveTable,
        handleAddColumn,
        handleUpdateColumn,
        handleDeleteColumn,
        handleReorderColumns,
        handleAddRow,
        handleCreateRow,
        handleUpdateRow,
        handleDeleteRow,
        openEditRow,
        isColumnMutating,
        isRowMutating,
        createTableMutation: { isPending: createTableMutation.isPending },
        moveTableMutation: { isPending: moveTableMutation.isPending },
    };
}
