/**
 * DataVault Table View Page
 * Displays table details, columns, and rows with management UI
 * Full implementation for PR 6
 */

import { useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
  useDatavaultTable,
  useDatavaultColumns,
  useDatavaultRows,
  useCreateDatavaultColumn,
  useUpdateDatavaultColumn,
  useDeleteDatavaultColumn,
} from "@/lib/datavault-hooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ArrowLeft, Plus, Database } from "lucide-react";
import { ColumnManager } from "@/components/datavault/ColumnManager";
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";

export default function TableViewPage() {
  const { tableId } = useParams<{ tableId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: table, isLoading: tableLoading } = useDatavaultTable(tableId);
  const { data: columns, isLoading: columnsLoading } = useDatavaultColumns(tableId);
  const { data: rowsData, isLoading: rowsLoading } = useDatavaultRows(tableId, { limit: 25, offset: 0 });

  const createColumnMutation = useCreateDatavaultColumn();
  const updateColumnMutation = useUpdateDatavaultColumn();
  const deleteColumnMutation = useDeleteDatavaultColumn();

  const [activeTab, setActiveTab] = useState("data");

  const handleAddColumn = async (data: { name: string; type: string; required: boolean }) => {
    if (!tableId) return;

    try {
      await createColumnMutation.mutateAsync({
        tableId,
        ...data,
      });

      toast({
        title: "Column added",
        description: `Column "${data.name}" has been added successfully.`,
      });
    } catch (error) {
      toast({
        title: "Failed to add column",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleUpdateColumn = async (columnId: string, data: { name: string; required: boolean }) => {
    if (!tableId) return;

    try {
      await updateColumnMutation.mutateAsync({
        columnId,
        tableId,
        ...data,
      });

      toast({
        title: "Column updated",
        description: `Column has been updated successfully.`,
      });
    } catch (error) {
      toast({
        title: "Failed to update column",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleDeleteColumn = async (columnId: string) => {
    if (!tableId) return;

    try {
      await deleteColumnMutation.mutateAsync({
        columnId,
        tableId,
      });

      toast({
        title: "Column deleted",
        description: "Column has been deleted successfully.",
      });
    } catch (error) {
      toast({
        title: "Failed to delete column",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const isLoading = tableLoading || columnsLoading;
  const isMutating =
    createColumnMutation.isPending || updateColumnMutation.isPending || deleteColumnMutation.isPending;

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-4 py-8">
            {/* Loading State */}
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Table Content */}
            {!isLoading && table && (
              <>
                {/* Back Button */}
                <div className="mb-4">
                  <Link href="/datavault/tables">
                    <Button variant="ghost" size="sm">
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Back to Tables
                    </Button>
                  </Link>
                </div>

                {/* Page Header */}
                <div className="mb-8">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h1 className="text-3xl font-bold text-foreground mb-2">
                        <i className="fas fa-table mr-3"></i>
                        {table.name}
                      </h1>
                      {table.description && (
                        <p className="text-muted-foreground">{table.description}</p>
                      )}
                      <p className="text-sm text-muted-foreground mt-1">
                        Slug: <span className="font-mono">/{table.slug}</span>
                      </p>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardDescription>Columns</CardDescription>
                        <CardTitle className="text-2xl">{columns?.length || 0}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="pb-3">
                        <CardDescription>Rows</CardDescription>
                        <CardTitle className="text-2xl">{rowsData?.pagination.total || 0}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="pb-3">
                        <CardDescription>Last Updated</CardDescription>
                        <CardTitle className="text-2xl">
                          {new Date(table.updatedAt).toLocaleDateString()}
                        </CardTitle>
                      </CardHeader>
                    </Card>
                  </div>
                </div>

                {/* Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList>
                    <TabsTrigger value="data">
                      <Database className="w-4 h-4 mr-2" />
                      Data
                    </TabsTrigger>
                    <TabsTrigger value="columns">
                      <i className="fas fa-columns mr-2"></i>
                      Columns
                    </TabsTrigger>
                  </TabsList>

                  {/* Data Tab */}
                  <TabsContent value="data" className="mt-6">
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle>Table Data</CardTitle>
                            <CardDescription>
                              {rowsData?.pagination.total || 0} row
                              {rowsData?.pagination.total === 1 ? "" : "s"}
                            </CardDescription>
                          </div>
                          <Button>
                            <Plus className="w-4 h-4 mr-2" />
                            Add Row
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {columns && columns.length === 0 ? (
                          <div className="text-center py-12 text-muted-foreground">
                            <i className="fas fa-columns text-4xl mb-4"></i>
                            <p className="mb-2">No columns defined yet</p>
                            <p className="text-sm">
                              Add columns in the Columns tab to start adding data
                            </p>
                          </div>
                        ) : rowsLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                          </div>
                        ) : !rowsData || rowsData.rows.length === 0 ? (
                          <div className="text-center py-12 text-muted-foreground">
                            <Database className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                            <p className="mb-2">No data yet</p>
                            <p className="text-sm mb-4">
                              Click "Add Row" to start adding data to your table
                            </p>
                          </div>
                        ) : (
                          /* Row CRUD UI - Placeholder for PR 7 */
                          <div className="text-center py-8 text-muted-foreground">
                            <p>Row management UI coming in PR 7</p>
                            <p className="text-sm mt-2">
                              {rowsData.rows.length} row{rowsData.rows.length === 1 ? "" : "s"} loaded
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Columns Tab */}
                  <TabsContent value="columns" className="mt-6">
                    <ColumnManager
                      columns={columns || []}
                      onAddColumn={handleAddColumn}
                      onUpdateColumn={handleUpdateColumn}
                      onDeleteColumn={handleDeleteColumn}
                      isLoading={isMutating}
                    />
                  </TabsContent>
                </Tabs>
              </>
            )}

            {/* Not Found */}
            {!isLoading && !table && (
              <div className="text-center py-12">
                <i className="fas fa-exclamation-triangle text-4xl text-destructive mb-4"></i>
                <h2 className="text-2xl font-bold mb-2">Table Not Found</h2>
                <p className="text-muted-foreground mb-6">
                  The table you're looking for doesn't exist or has been deleted.
                </p>
                <Link href="/datavault/tables">
                  <Button>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Tables
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
