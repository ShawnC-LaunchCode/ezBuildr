/**
 * Database Detail Page
 * Shows database details with tabs for tables, settings, etc.
 * DataVault Phase 2: Databases feature
 */

import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
  useDatavaultDatabase,
  useDatabaseTables,
  useUpdateDatavaultDatabase,
} from "@/lib/datavault-hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Database as DatabaseIcon, Table, Settings, ArrowLeft, Search, Plus } from "lucide-react";
import { TableCard } from "@/components/datavault/TableCard";
import { CreateTableModal } from "@/components/datavault/CreateTableModal";
import { DatabaseSettings } from "@/components/datavault/DatabaseSettings";
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";

export default function DatabaseDetailPage() {
  const { databaseId } = useParams<{ databaseId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: database, isLoading: dbLoading } = useDatavaultDatabase(databaseId);
  const { data: tables, isLoading: tablesLoading } = useDatabaseTables(databaseId);

  const [searchQuery, setSearchQuery] = useState("");
  const [createTableOpen, setCreateTableOpen] = useState(false);

  // Filter tables by search query
  const filteredTables = tables?.filter((table) => {
    const query = searchQuery.toLowerCase();
    return (
      table.name.toLowerCase().includes(query) ||
      table.slug.toLowerCase().includes(query) ||
      table.description?.toLowerCase().includes(query)
    );
  });

  const handleTableClick = (tableId: string) => {
    setLocation(`/datavault/tables/${tableId}`);
  };

  const handleTableDelete = (tableId: string) => {
    // This would trigger a delete confirmation modal
    // Implementation depends on existing table deletion flow
    console.log('Delete table:', tableId);
  };

  if (dbLoading) {
    return (
      <div className="flex h-screen bg-background overflow-hidden">
        <Sidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <Header title="Loading..." description="" />
          <main className="flex-1 overflow-y-auto">
            <div className="container mx-auto px-4 py-8">
              <div className="animate-pulse space-y-4">
                <div className="h-8 bg-muted rounded w-1/3"></div>
                <div className="h-4 bg-muted rounded w-1/2"></div>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (!database) {
    return (
      <div className="flex h-screen bg-background overflow-hidden">
        <Sidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <Header title="Not Found" description="" />
          <main className="flex-1 overflow-y-auto">
            <div className="container mx-auto px-4 py-8">
              <div className="text-center">
                <h2 className="text-2xl font-bold">Database not found</h2>
                <Button
                  onClick={() => setLocation('/datavault/databases')}
                  className="mt-4"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Databases
                </Button>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header title={database.name} description={database.description || ''} />
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-4 py-8">
            {/* Page Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLocation('/datavault/databases')}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <div>
                  <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                    <DatabaseIcon className="w-8 h-8" />
                    {database.name}
                  </h1>
                  {database.description && (
                    <p className="text-muted-foreground mt-1">{database.description}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="tables" className="space-y-6">
              <TabsList>
                <TabsTrigger value="tables" className="gap-2">
                  <Table className="w-4 h-4" />
                  Tables
                  {typeof database.tableCount === 'number' && (
                    <span className="ml-1 text-xs bg-muted px-1.5 py-0.5 rounded">
                      {database.tableCount}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="settings" className="gap-2">
                  <Settings className="w-4 h-4" />
                  Settings
                </TabsTrigger>
              </TabsList>

              {/* Tables Tab */}
              <TabsContent value="tables" className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="relative max-w-md flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <Input
                      placeholder="Search tables..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Button onClick={() => setCreateTableOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Table
                  </Button>
                </div>

                {tablesLoading ? (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {[...Array(6)].map((_, i) => (
                      <div
                        key={i}
                        className="h-48 bg-muted animate-pulse rounded-lg"
                      />
                    ))}
                  </div>
                ) : filteredTables && filteredTables.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {filteredTables.map((table) => (
                      <TableCard
                        key={table.id}
                        table={table}
                        onClick={() => handleTableClick(table.id)}
                        onDelete={() => handleTableDelete(table.id)}
                      />
                    ))}
                  </div>
                ) : tables?.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="rounded-full bg-muted p-6 mb-4">
                      <Table className="w-12 h-12 text-muted-foreground" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">No tables yet</h3>
                    <p className="text-muted-foreground mb-6 max-w-sm">
                      Get started by creating your first table in this database
                    </p>
                    <Button onClick={() => setCreateTableOpen(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Table
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Search className="w-12 h-12 text-muted-foreground mb-4" />
                    <h3 className="text-xl font-semibold mb-2">No results found</h3>
                    <p className="text-muted-foreground mb-4">
                      No tables match "{searchQuery}"
                    </p>
                    <Button variant="outline" onClick={() => setSearchQuery("")}>
                      Clear Search
                    </Button>
                  </div>
                )}
              </TabsContent>

              {/* Settings Tab */}
              <TabsContent value="settings">
                <DatabaseSettings database={database} />
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>

      {/* Create Table Modal */}
      <CreateTableModal
        open={createTableOpen}
        onOpenChange={setCreateTableOpen}
        onSubmit={async (data) => {
          // Implementation would create table with databaseId
          console.log('Create table in database:', databaseId, data);
          setCreateTableOpen(false);
        }}
        isLoading={false}
        defaultDatabaseId={databaseId}
      />
    </div>
  );
}
