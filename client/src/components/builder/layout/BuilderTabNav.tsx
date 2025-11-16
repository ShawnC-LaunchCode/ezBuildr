/**
 * BuilderTabNav - Tab navigation for workflow builder
 * Supports: Sections, Templates, Data Sources, Settings, Snapshots
 */

import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  Layers,
  FileText,
  Database,
  Settings,
  Camera,
} from "lucide-react";

export type BuilderTab = "sections" | "templates" | "data-sources" | "settings" | "snapshots";

interface TabConfig {
  id: BuilderTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TABS: TabConfig[] = [
  { id: "sections", label: "Sections", icon: Layers },
  { id: "templates", label: "Templates", icon: FileText },
  { id: "data-sources", label: "Data Sources", icon: Database },
  { id: "snapshots", label: "Snapshots", icon: Camera },
  { id: "settings", label: "Settings", icon: Settings },
];

interface BuilderTabNavProps {
  workflowId: string;
  activeTab: BuilderTab;
  onTabChange: (tab: BuilderTab) => void;
}

export function BuilderTabNav({ workflowId, activeTab, onTabChange }: BuilderTabNavProps) {
  return (
    <div className="flex items-center justify-center gap-1 border-b bg-card/50">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative",
              "hover:text-foreground hover:bg-accent/50",
              isActive
                ? "text-foreground bg-background border-b-2 border-primary"
                : "text-muted-foreground"
            )}
          >
            <Icon className="w-4 h-4" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
