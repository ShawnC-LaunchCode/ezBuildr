import { Link } from "wouter";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDatavaultTables } from "@/lib/datavault-hooks";

/**
 * DataVault Dashboard
 * Main landing page for DataVault with overview and quick actions
 */
export default function DataVaultDashboard() {
  const { data: tables, isLoading } = useDatavaultTables(true);

  const tableCount = tables?.length || 0;

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header title="DataVault" description="Manage your custom data tables" />
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-4 py-8">
            {/* Page Header */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-foreground mb-2">
                <i className="fas fa-database mr-3"></i>
                DataVault
              </h1>
              <p className="text-muted-foreground">
                Manage your custom data tables, columns, and records
              </p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <i className="fas fa-table text-primary"></i>
                    <span>Tables</span>
                  </CardTitle>
                  <CardDescription>Total data tables</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-4xl font-bold text-foreground">
                    {isLoading ? '...' : tableCount}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <i className="fas fa-plug text-blue-500"></i>
                    <span>API Access</span>
                  </CardTitle>
                  <CardDescription>REST API endpoints</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Coming Soon
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <i className="fas fa-bolt text-yellow-500"></i>
                    <span>Triggers</span>
                  </CardTitle>
                  <CardDescription>Workflow automation</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Coming Soon
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <i className="fas fa-database text-blue-500"></i>
                    <span>Databases</span>
                  </CardTitle>
                  <CardDescription>
                    Organize tables into databases
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Link href="/datavault/databases">
                    <Button className="w-full" variant="default">
                      <i className="fas fa-list mr-2"></i>
                      View Databases
                    </Button>
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    Group related tables by project, workflow, or account
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <i className="fas fa-table text-primary"></i>
                    <span>Your Tables</span>
                  </CardTitle>
                  <CardDescription>
                    {tableCount === 0
                      ? 'No tables yet. Create your first table to get started.'
                      : `You have ${tableCount} table${tableCount === 1 ? '' : 's'}`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Link href="/datavault/tables">
                    <Button className="w-full" variant="default">
                      <i className="fas fa-list mr-2"></i>
                      View All Tables
                    </Button>
                  </Link>
                  <Link href="/datavault/tables/new">
                    <Button className="w-full" variant="outline">
                      <i className="fas fa-plus mr-2"></i>
                      Create New Table
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <i className="fas fa-copy text-purple-500"></i>
                    <span>Table Templates</span>
                  </CardTitle>
                  <CardDescription>
                    Start with pre-built templates
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="p-3 bg-muted rounded-lg text-center">
                      <p className="text-sm text-muted-foreground">
                        <i className="fas fa-info-circle mr-2"></i>
                        Coming Soon
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Templates for People, Businesses, Contacts, and more
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Help Section */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <i className="fas fa-question-circle text-blue-500"></i>
                  <span>Getting Started with DataVault</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex items-start space-x-3">
                    <i className="fas fa-check-circle text-green-500 mt-0.5"></i>
                    <span>
                      <strong>Create Tables:</strong> Define custom data structures with columns and types
                    </span>
                  </li>
                  <li className="flex items-start space-x-3">
                    <i className="fas fa-check-circle text-green-500 mt-0.5"></i>
                    <span>
                      <strong>Manage Data:</strong> Add, edit, and delete rows with built-in validation
                    </span>
                  </li>
                  <li className="flex items-start space-x-3">
                    <i className="fas fa-check-circle text-green-500 mt-0.5"></i>
                    <span>
                      <strong>Coming Soon:</strong> Connect tables to workflows and use in automation
                    </span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
