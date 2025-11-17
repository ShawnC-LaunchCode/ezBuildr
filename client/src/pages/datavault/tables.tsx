import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";

/**
 * DataVault Tables List Page
 * Lists all tables with stats and actions
 * Full implementation in PR 5
 */
export default function DataVaultTablesPage() {
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-4 py-8">
            {/* Page Header */}
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-3xl font-bold text-foreground mb-2">
                  <i className="fas fa-table mr-3"></i>
                  Tables
                </h1>
                <p className="text-muted-foreground">
                  Manage your custom data tables
                </p>
              </div>
              <Button>
                <i className="fas fa-plus mr-2"></i>
                Create Table
              </Button>
            </div>

            {/* Placeholder Content */}
            <Card>
              <CardHeader>
                <CardTitle>Tables List</CardTitle>
                <CardDescription>
                  Full implementation coming in PR 5
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="py-12 text-center">
                  <i className="fas fa-table text-6xl text-muted-foreground mb-4"></i>
                  <p className="text-muted-foreground">
                    No tables yet. Create your first table to get started.
                  </p>
                  <Button className="mt-4" variant="outline">
                    <i className="fas fa-plus mr-2"></i>
                    Create Your First Table
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Back Button */}
            <div className="mt-6">
              <Link href="/datavault">
                <Button variant="ghost">
                  <i className="fas fa-arrow-left mr-2"></i>
                  Back to Dashboard
                </Button>
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
