/**
 * DataSourcesTab - Manage external data sources
 * PR5: Data sources list with "Coming Soon" labels
 */
import { Database, Settings, Link2, Unlink2, Plus, FileSpreadsheet, Server, Globe } from "lucide-react";
import React, { useState } from "react";
import { AddGoogleSheetsDialog } from "@/components/dataSource/AddGoogleSheetsDialog";
import { AddNativeTableDialog } from "@/components/dataSource/AddNativeTableDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useDataSources, useWorkflowDataSources, useLinkDataSource, useUnlinkDataSource } from "@/lib/vault-hooks";
import { BuilderLayout, BuilderLayoutHeader, BuilderLayoutContent } from "../layout/BuilderLayout";
interface DataSourcesTabProps {
  workflowId: string;
  onCollectionsClick?: () => void;
}
export function DataSourcesTab({ workflowId, onCollectionsClick }: DataSourcesTabProps) {
  const { data: allSources, isLoading: isLoadingAll, refetch: refetchAll } = useDataSources();
  const { data: linkedSources, isLoading: isLoadingLinked, refetch: refetchLinked } = useWorkflowDataSources(workflowId);
  const linkMutation = useLinkDataSource();
  const unlinkMutation = useUnlinkDataSource();
  const { toast } = useToast();
  const [isTypeSelectionOpen, setIsTypeSelectionOpen] = useState(false);
  const [isGoogleSheetsOpen, setIsGoogleSheetsOpen] = useState(false);
  const [isNativeTableOpen, setIsNativeTableOpen] = useState(false);
  const handleLink = async (sourceId: string) => {
    try {
      await linkMutation.mutateAsync({ id: sourceId, workflowId });
      toast({ title: "Source Linked", description: "Data source has been linked to this workflow." });
    } catch (e) {
      toast({ title: "Error", description: "Failed to link data source.", variant: "destructive" });
    }
  };
  const handleUnlink = async (sourceId: string) => {
    try {
      await unlinkMutation.mutateAsync({ id: sourceId, workflowId });
      toast({ title: "Source Unlinked", description: "Data source removed from this workflow." });
    } catch (e) {
      toast({ title: "Error", description: "Failed to unlink data source.", variant: "destructive" });
    }
  };
  const handleConfigure = (sourceId: string) => {
    if (sourceId === "collections") {
      onCollectionsClick?.();
    }
    // For others, open settings dialog (future)
  };
  const isLinked = (id: string) => linkedSources?.some(s => s.id === id);
  const handleSourceCreated = () => {
    refetchAll();
    refetchLinked();
  };
  if (isLoadingAll || isLoadingLinked) {
    return (
      <BuilderLayout>
        <BuilderLayoutHeader>
          <div><h2 className="text-lg font-semibold">Data Sources</h2></div>
        </BuilderLayoutHeader>
        <BuilderLayoutContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-48" /><Skeleton className="h-48" />
          </div>
        </BuilderLayoutContent>
      </BuilderLayout>
    );
  }
  // Helper to get icon
  const getIcon = (type: string) => {
    if (type === 'google_sheets') {return FileSpreadsheet;}
    if (type === 'api') {return Globe;}
    return Database;
  };
  return (
    <BuilderLayout>
      <BuilderLayoutHeader>
        <div className="flex justify-between items-center w-full">
          <div>
            <h2 className="text-lg font-semibold">Data Sources</h2>
            <p className="text-sm text-muted-foreground">
              Connect external data sources to your workflow
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => { void setIsTypeSelectionOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            New Source
          </Button>
        </div>
      </BuilderLayoutHeader>
      <BuilderLayoutContent>
        <div className="max-w-4xl space-y-8">
          {/* Active Sources */}
          <div className="space-y-4">
            {allSources?.length === 0 && <p className="text-muted-foreground">No data sources found.</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {allSources?.map(source => {
                const linked = isLinked(source.id);
                const Icon = getIcon(source.type);
                return (
                  <Card key={source.id} className={linked ? "border-primary" : ""}>
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${(source as any).type === 'native' || (source as any).type === 'native_table' ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'}`}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <CardTitle className="text-base">{source.name}</CardTitle>
                              {linked && <Badge variant="secondary" className="bg-primary/10 text-primary text-xs">Active</Badge>}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs font-normal">
                                {(source as any).type === 'native' || (source as any).type === 'native_table' ? 'Native Table' : (source as any).type === 'google_sheets' ? 'Google Sheets' : 'External API'}
                              </Badge>
                              {/* Capability Badges */}
                              <div className="flex gap-1">
                                <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full font-medium border border-green-200">Read</span>
                                <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium border border-blue-200">Write</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pb-3">
                      <CardDescription className="line-clamp-2">{source.description || "No description provided."}</CardDescription>
                      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                        <code>ID: {source.id.slice(0, 8)}...</code>
                        {((source as any).type === 'native' || (source as any).type === 'native_table') && <span>PostgreSQL</span>}
                      </div>
                    </CardContent>
                    <CardFooter className="pt-0 flex gap-2">
                      {linked ? (
                        <Button variant="outline" size="sm" onClick={() => { void handleUnlink(source.id); }}
                          disabled={unlinkMutation.isPending} className="w-full">
                          <Unlink2 className="w-4 h-4 mr-2" /> Disconnect
                        </Button>
                      ) : (
                        <Button variant="default" size="sm" onClick={() => { void handleLink(source.id); }}
                          disabled={linkMutation.isPending} className="w-full">
                          <Link2 className="w-4 h-4 mr-2" /> Connect
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => { void handleConfigure(source.id); }}>
                        <Settings className="w-4 h-4" />
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          </div>
          {/* Info Box */}
          <div className="p-4 bg-muted/50 rounded-lg border border-border">
            <h3 className="font-semibold mb-2">About Data Linking</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Linking a data source makes its tables and records available to:
            </p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li><strong>Query Blocks:</strong> Fetch data to prefill workflow steps.</li>
              <li><strong>Write Blocks:</strong> Save workflow results back to the database.</li>
              <li><strong>Validation:</strong> Ensure user input matches existing records.</li>
            </ul>
          </div>
        </div>
      </BuilderLayoutContent>
      {/* Type Selection Dialog */}
      <Dialog open={isTypeSelectionOpen} onOpenChange={setIsTypeSelectionOpen}>
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
              onClick={() => {
                setIsTypeSelectionOpen(false);
                setIsGoogleSheetsOpen(true);
              }}
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
              onClick={() => {
                setIsTypeSelectionOpen(false);
                setIsNativeTableOpen(true);
              }}
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
      {/* Google Sheets Wizard */}
      <AddGoogleSheetsDialog
        open={isGoogleSheetsOpen}
        onOpenChange={setIsGoogleSheetsOpen}
        onComplete={handleSourceCreated}
      />
      {/* Native Table Wizard */}
      <AddNativeTableDialog
        open={isNativeTableOpen}
        onOpenChange={setIsNativeTableOpen}
        onComplete={handleSourceCreated}
      />
    </BuilderLayout>
  );
}