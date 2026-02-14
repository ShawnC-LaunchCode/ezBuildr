/**
 * DataSourcesTab - Manage external data sources
 * PR5: Data sources list with "Coming Soon" labels
 */
import { Plus } from "lucide-react";
import { useState } from "react";

import { AddGoogleSheetsDialog } from "@/components/dataSource/AddGoogleSheetsDialog";
import { AddNativeTableDialog } from "@/components/dataSource/AddNativeTableDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useDataSources, useWorkflowDataSources, useLinkDataSource, useUnlinkDataSource } from "@/lib/vault-hooks";

import { BuilderLayout, BuilderLayoutHeader, BuilderLayoutContent } from "../layout/BuilderLayout";

import { DataSourceCard, DataSource } from "./datasources/DataSourceCard";
import { DataSourceTypeSelectionDialog } from "./datasources/DataSourceTypeSelectionDialog";

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
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    refetchAll();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    refetchLinked();
  };

  const handleTypeSelect = (type: 'google_sheets' | 'native_table') => {
    setIsTypeSelectionOpen(false);
    if (type === 'google_sheets') {
      setIsGoogleSheetsOpen(true);
    } else {
      setIsNativeTableOpen(true);
    }
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
          <Button size="sm" variant="outline" onClick={() => setIsTypeSelectionOpen(true)}>
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
                const linked = !!isLinked(source.id);
                return (
                  <DataSourceCard
                    key={source.id}
                    source={source as DataSource}
                    isLinked={linked}
                    isLinkPending={linkMutation.isPending}
                    isUnlinkPending={unlinkMutation.isPending}
                    onLink={(id) => { void handleLink(id); }}
                    onUnlink={(id) => { void handleUnlink(id); }}
                    onConfigure={handleConfigure}
                  />
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
      <DataSourceTypeSelectionDialog
        open={isTypeSelectionOpen}
        onOpenChange={setIsTypeSelectionOpen}
        onSelectType={handleTypeSelect}
      />

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