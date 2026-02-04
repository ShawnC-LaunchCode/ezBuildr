
import { FileSpreadsheet, Globe, Server } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

interface DataSourceTypeSelectionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelectType: (type: 'google_sheets' | 'native_table') => void;
}

export function DataSourceTypeSelectionDialog({ open, onOpenChange, onSelectType }: DataSourceTypeSelectionDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Add Data Source</DialogTitle>
                    <DialogDescription>
                        Select the type of data source you want to connect.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                    <Button
                        variant="outline"
                        className="h-auto p-4 flex flex-col items-start gap-2 hover:border-green-500 hover:bg-green-50"
                        onClick={() => onSelectType('google_sheets')}
                    >
                        <div className="p-2 bg-green-100 rounded-md">
                            <FileSpreadsheet className="w-6 h-6 text-green-600" />
                        </div>
                        <div className="text-left">
                            <h3 className="font-semibold">Google Sheets</h3>
                            <p className="text-sm text-muted-foreground">Read and write data to Google Sheets.</p>
                        </div>
                    </Button>
                    <Button
                        variant="outline"
                        className="h-auto p-4 flex flex-col items-start gap-2 hover:border-blue-500 hover:bg-blue-50"
                        onClick={() => onSelectType('native_table')}
                    >
                        <div className="p-2 bg-blue-100 rounded-md">
                            <Server className="w-6 h-6 text-blue-600" />
                        </div>
                        <div className="text-left">
                            <h3 className="font-semibold">Native Table</h3>
                            <p className="text-sm text-muted-foreground">Select an existing table from your database.</p>
                        </div>
                    </Button>
                    <Button
                        variant="outline"
                        className="h-auto p-4 flex flex-col items-start gap-2 opacity-60 cursor-not-allowed"
                        disabled
                    >
                        <div className="p-2 bg-orange-100 rounded-md">
                            <Globe className="w-6 h-6 text-orange-600" />
                        </div>
                        <div className="text-left">
                            <h3 className="font-semibold">External API</h3>
                            <p className="text-sm text-muted-foreground">Connect to any REST API endpoint.</p>
                            <Badge variant="secondary" className="mt-1 text-xs">Coming Soon</Badge>
                        </div>
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
