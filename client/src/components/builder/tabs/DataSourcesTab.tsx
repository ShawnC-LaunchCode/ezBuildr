/**
 * DataSourcesTab - Manage external data sources
 * PR5: Data sources list with "Coming Soon" labels
 */

import { useState } from "react";
import { Database, Settings, ExternalLink } from "lucide-react";
import { BuilderLayout, BuilderLayoutHeader, BuilderLayoutContent } from "../layout/BuilderLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface DataSource {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  status: "active" | "coming_soon";
  category: "database" | "spreadsheet" | "api";
}

const DATA_SOURCES: DataSource[] = [
  {
    id: "collections",
    name: "Collections",
    description: "Built-in data storage for workflow runs and external data",
    icon: Database,
    status: "active",
    category: "database",
  },
  {
    id: "airtable",
    name: "Airtable",
    description: "Connect to Airtable bases and tables for data lookup and storage",
    icon: Database,
    status: "coming_soon",
    category: "database",
  },
  {
    id: "google_sheets",
    name: "Google Sheets",
    description: "Read from and write to Google Sheets spreadsheets",
    icon: Database,
    status: "coming_soon",
    category: "spreadsheet",
  },
  {
    id: "api_connector",
    name: "API Connector",
    description: "Connect to external REST APIs for data fetching and webhooks",
    icon: ExternalLink,
    status: "coming_soon",
    category: "api",
  },
];

interface DataSourcesTabProps {
  workflowId: string;
  onConfigureCollections?: () => void;
}

export function DataSourcesTab({ workflowId, onConfigureCollections }: DataSourcesTabProps) {
  const [selectedSource, setSelectedSource] = useState<string | null>(null);

  const handleConfigure = (sourceId: string) => {
    if (sourceId === "collections") {
      onConfigureCollections?.();
    } else {
      // Coming soon sources - no action
      console.log("Configure not yet available for:", sourceId);
    }
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      database: "Database",
      spreadsheet: "Spreadsheet",
      api: "API",
    };
    return labels[category] || category;
  };

  return (
    <BuilderLayout>
      <BuilderLayoutHeader>
        <div>
          <h2 className="text-lg font-semibold">Data Sources</h2>
          <p className="text-sm text-muted-foreground">
            Connect external data sources to your workflow
          </p>
        </div>
      </BuilderLayoutHeader>

      <BuilderLayoutContent>
        <div className="max-w-4xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {DATA_SOURCES.map((source) => {
              const Icon = source.icon;
              const isActive = source.status === "active";
              const isSelected = selectedSource === source.id;

              return (
                <Card
                  key={source.id}
                  className={`transition-all ${
                    isSelected ? "ring-2 ring-primary" : ""
                  } ${!isActive ? "opacity-75" : ""}`}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <Icon className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{source.name}</CardTitle>
                          <Badge
                            variant="outline"
                            className="mt-1 text-xs"
                          >
                            {getCategoryLabel(source.category)}
                          </Badge>
                        </div>
                      </div>
                      {!isActive && (
                        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                          COMING SOON
                        </Badge>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent>
                    <CardDescription>{source.description}</CardDescription>
                  </CardContent>

                  <CardFooter>
                    <Button
                      variant={isActive ? "default" : "outline"}
                      className="w-full"
                      onClick={() => handleConfigure(source.id)}
                      disabled={!isActive}
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      {isActive ? "Configure" : "Not Available Yet"}
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>

          {/* Info Box */}
          <div className="mt-8 p-4 bg-muted/50 rounded-lg border border-border">
            <h3 className="font-semibold mb-2">About Data Sources</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Data sources allow you to connect external databases, spreadsheets, and APIs
              to your workflows. Use them to:
            </p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Prefill form fields with existing data</li>
              <li>Validate user input against external records</li>
              <li>Store workflow outputs to external systems</li>
              <li>Trigger webhooks and API calls based on workflow events</li>
            </ul>
          </div>
        </div>
      </BuilderLayoutContent>
    </BuilderLayout>
  );
}
