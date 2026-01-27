/**
 * Row Detail Drawer Component
 * Displays detailed information about a row with tabs for notes and history
 */
import React, { useState } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { NotesTab } from "./NotesTab";
interface RowDetailDrawerProps {
  rowId: string | null;
  tableOwnerId?: string | null;
  onClose: () => void;
}
export function RowDetailDrawer({
  rowId,
  tableOwnerId,
  onClose,
}: RowDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState("notes");
  return (
    <Sheet open={!!rowId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0">
        {/* Header */}
        <SheetHeader className="px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle>Row Details</SheetTitle>
              <SheetDescription>
                View notes and history for this row
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-2 px-6">
            <TabsTrigger value="notes">Notes</TabsTrigger>
            <TabsTrigger value="history" disabled>
              History
            </TabsTrigger>
          </TabsList>
          <TabsContent value="notes" className="flex-1 mt-0">
            {rowId && (
              <NotesTab rowId={rowId} tableOwnerId={tableOwnerId} />
            )}
          </TabsContent>
          <TabsContent value="history" className="flex-1 mt-0 px-6">
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p className="text-sm">History coming soon...</p>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}