/**
 * Database Settings Page
 * Dedicated settings page for database configuration
 * DataVault Phase 2: PR 13
 */

import { ArrowLeft, Loader2, Database as DatabaseIcon, Settings } from "lucide-react";
import React from "react";
import { useParams, useLocation } from "wouter";

import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { DatabaseSettings } from "@/components/datavault/DatabaseSettings";
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/button";
import { useDatavaultDatabase } from "@/lib/datavault-hooks";

export default function DatabaseSettingsPage() {
  const { databaseId } = useParams<{ databaseId: string }>();
  const [, setLocation] = useLocation();

  const { data: database, isLoading } = useDatavaultDatabase(databaseId);

  if (isLoading) {
    return (
      <div className="flex h-screen bg-background overflow-hidden">
        <Sidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <Header title="Loading..." description="" />
          <main className="flex-1 overflow-y-auto flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
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
            <div className="container mx-auto px-4 py-8 text-center">
              <h2 className="text-2xl font-bold mb-4">Database not found</h2>
              <Button onClick={() => setLocation("/datavault/databases")}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Databases
              </Button>
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
        {/* Header with back button */}
        <div className="border-b bg-background px-4 py-3">
          {/* Breadcrumbs */}
          <div className="mb-3">
            <Breadcrumbs
              items={[
                { label: "DataVault", href: "/datavault", icon: <DatabaseIcon className="w-3 h-3" /> },
                { label: "Databases", href: "/datavault/databases" },
                { label: database.name, href: `/datavault/databases/${databaseId}` },
                { label: "Settings", icon: <Settings className="w-3 h-3" /> },
              ]}
            />
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation(`/datavault/databases/${databaseId}`)}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <DatabaseIcon className="w-6 h-6 text-muted-foreground" />
            <div>
              <h1 className="text-lg font-semibold">Database Settings</h1>
              <p className="text-sm text-muted-foreground">{database.name}</p>
            </div>
          </div>
        </div>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-4 py-8 max-w-4xl">
            <DatabaseSettings
              database={database}
              onClose={() => setLocation(`/datavault/databases/${databaseId}`)}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
