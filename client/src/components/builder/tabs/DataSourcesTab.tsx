/**
 * DataSourcesTab - Manage external data sources
 * PR5: Data sources list with "Coming Soon" labels
 */

import { useState } from "react";
import { Database, Settings, ExternalLink, RefreshCw, Link2, Unlink2, Lock, Plus } from "lucide-react";
import { BuilderLayout, BuilderLayoutHeader, BuilderLayoutContent } from "../layout/BuilderLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDataSources, useWorkflowDataSources, useLinkDataSource, useUnlinkDataSource } from "@/lib/vault-hooks";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import type { ApiDataSource } from "@/lib/vault-api";

interface DataSourcesTabProps {
  workflowId: string;
  onCollectionsClick?: () => void;
}

export function DataSourcesTab({ workflowId, onCollectionsClick }: DataSourcesTabProps) {
  const { data: allSources, isLoading: isLoadingAll } = useDataSources();
  const { data: linkedSources, isLoading: isLoadingLinked } = useWorkflowDataSources(workflowId);
  const linkMutation = useLinkDataSource();
  const unlinkMutation = useUnlinkDataSource();
  const { toast } = useToast();

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
    if (sourceId === "collections") { // TODO: Check if source name/type matches "collections" or handle by ID
      // The mock data had ID "collections", real data depends on DB.
      // Assuming for now the 'collections' logic lives elsewhere or this ID matches the native DB one.
      // For PR, we might not have a dedicated Collections *DataSource* row yet unless created.
      // Let's assume we trigger the sidebar regardless.
      onCollectionsClick?.();
    }
    // For others, open settings dialog (future)
  };

  const isLinked = (id: string) => linkedSources?.some(s => s.id === id);

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

  // Group sources if needed, or just list
  // Merging with static "Coming Soon" for demo if they don't exist in DB?
  // For this feature, let's just show what's in DB + maybe hardcode the "Coming Soon" ones if they aren't there.

  // Helper to get icon
  const getIcon = (type: string) => {
    if (type === 'google_sheets') return Database; // Spreadsheet icon?
    if (type === 'api') return ExternalLink;
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
          <Button size="sm" variant="outline">
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
                          <div className={`p-2 rounded-lg ${source.type === 'native' ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'}`}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <CardTitle className="text-base">{source.name}</CardTitle>
                              {linked && <Badge variant="secondary" className="bg-primary/10 text-primary text-xs">Active</Badge>}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs font-normal">
                                {source.type === 'native' ? 'Native Table' : 'External API'}
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
                        {source.type === 'native' && <span>PostgreSQL</span>}
                      </div>
                    </CardContent>
                    <CardFooter className="pt-0 flex gap-2">
                      {linked ? (
                        <Button variant="outline" size="sm" onClick={() => handleUnlink(source.id)}
                          disabled={unlinkMutation.isPending} className="w-full">
                          <Unlink2 className="w-4 h-4 mr-2" /> Disconnect
                        </Button>
                      ) : (
                        <Button variant="default" size="sm" onClick={() => handleLink(source.id)}
                          disabled={linkMutation.isPending} className="w-full">
                          <Link2 className="w-4 h-4 mr-2" /> Connect
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => handleConfigure(source.id)}>
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
    </BuilderLayout>
  );
}
