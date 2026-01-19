import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Database, Table, Check, Search } from "lucide-react";
import React, { useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
interface NativeCatalog {
    databases: {
        id: string;
        name: string;
        tables: { id: string; name: string }[];
    }[];
    orphanTables: { id: string; name: string }[];
}
interface AddNativeTableDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onComplete: () => void;
}
export function AddNativeTableDialog({ open, onOpenChange, onComplete }: AddNativeTableDialogProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
    const [selectedTableName, setSelectedTableName] = useState<string>("");
    const [selectedDatabaseId, setSelectedDatabaseId] = useState<string | null>(null);
    const [filter, setFilter] = useState("");
    const { data: catalog, isLoading } = useQuery<NativeCatalog>({
        queryKey: ["/api/data-sources/native/catalog"],
        enabled: open,
    });
    const createMutation = useMutation({
        mutationFn: async (data: { name: string; type: string; config: any }) => {
            const res = await fetch("/api/data-sources", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || "Failed to create data source");
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/data-sources"] });
            toast({ title: "Success", description: "Native table added as data source." });
            onComplete();
            onOpenChange(false);
            setSelectedTableId(null);
            setSelectedTableName("");
            setSelectedDatabaseId(null);
        },
        onError: (err) => {
            toast({ title: "Error", description: err.message, variant: "destructive" });
        },
    });
    const handleAdd = () => {
        if (!selectedTableId) {return;}
        createMutation.mutate({
            name: selectedTableName || "Native Table",
            type: "native_table",
            config: {
                tableId: selectedTableId,
                databaseId: selectedDatabaseId,
            },
        });
    };
    const handleSelect = (tableId: string, tableName: string, databaseId: string | null) => {
        setSelectedTableId(tableId);
        setSelectedTableName(tableName);
        setSelectedDatabaseId(databaseId);
    };
    // Filter logic
    const filteredDatabases = catalog?.databases.map(db => ({
        ...db,
        tables: db.tables.filter(t => t.name.toLowerCase().includes(filter.toLowerCase()))
    })).filter(db => db.tables.length > 0) || [];
    const filteredOrphans = catalog?.orphanTables.filter(t => t.name.toLowerCase().includes(filter.toLowerCase())) || [];
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md h-[500px] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Select Native Table</DialogTitle>
                    <DialogDescription>
                        Choose a table to use as a data source.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex items-center gap-2 mb-2">
                    <Search className="w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Search tables..."
                        value={filter}
                        onChange={(e) => { void setFilter(e.target.value); }}
                        className="h-8"
                    />
                </div>
                <ScrollArea className="flex-1 border rounded-md p-2">
                    {isLoading ? (
                        <div className="flex justify-center items-center h-40">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Databases */}
                            {filteredDatabases.length > 0 && (
                                <Accordion type="multiple" defaultValue={filteredDatabases.map(d => d.id)} className="w-full">
                                    {filteredDatabases.map(db => (
                                        <AccordionItem key={db.id} value={db.id} className="border-b-0">
                                            <AccordionTrigger className="py-2 hover:no-underline px-2 rounded-sm hover:bg-muted/50">
                                                <div className="flex items-center gap-2 text-sm">
                                                    <Database className="w-4 h-4 text-blue-500" />
                                                    <span className="font-semibold">{db.name}</span>
                                                    <Badge variant="secondary" className="text-[10px] h-4">Database</Badge>
                                                </div>
                                            </AccordionTrigger>
                                            <AccordionContent className="pb-1 pt-0">
                                                <div className="ml-6 space-y-1">
                                                    {db.tables.map(table => (
                                                        <button
                                                            key={table.id}
                                                            onClick={() => { void handleSelect(table.id, table.name, db.id); }}
                                                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-sm transition-colors ${selectedTableId === table.id
                                                                    ? "bg-primary text-primary-foreground"
                                                                    : "hover:bg-accent hover:text-accent-foreground"
                                                                }`}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <Table className="w-3.5 h-3.5 opacity-70" />
                                                                <span>{table.name}</span>
                                                            </div>
                                                            {selectedTableId === table.id && <Check className="w-3.5 h-3.5" />}
                                                        </button>
                                                    ))}
                                                </div>
                                            </AccordionContent>
                                        </AccordionItem>
                                    ))}
                                </Accordion>
                            )}
                            {/* Orphan Tables */}
                            {filteredOrphans.length > 0 && (
                                <div className="space-y-1 mt-2">
                                    <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                        Other Tables
                                    </div>
                                    {filteredOrphans.map(table => (
                                        <button
                                            key={table.id}
                                            onClick={() => { void handleSelect(table.id, table.name, null); }}
                                            className={`w-full flex items-center justify-between px-2 py-2 rounded-md text-sm transition-colors ${selectedTableId === table.id
                                                    ? "bg-primary text-primary-foreground"
                                                    : "hover:bg-accent hover:text-accent-foreground"
                                                }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <Table className="w-4 h-4 opacity-70" />
                                                <span>{table.name}</span>
                                            </div>
                                            {selectedTableId === table.id && <Check className="w-4 h-4" />}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {filteredDatabases.length === 0 && filteredOrphans.length === 0 && (
                                <div className="text-center py-8 text-muted-foreground text-sm">
                                    No tables found.
                                </div>
                            )}
                        </div>
                    )}
                </ScrollArea>
                <DialogFooter className="mt-4">
                    <Button variant="outline" onClick={() => { void onOpenChange(false); }}>
                        Cancel
                    </Button>
                    <Button
                        onClick={() => { void handleAdd(); }}
                        disabled={!selectedTableId || createMutation.isPending}
                    >
                        {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Add Data Source
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}