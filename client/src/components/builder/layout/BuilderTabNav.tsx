/**
 * BuilderTabNav - Tab navigation for workflow builder
 * Supports: Sections, Templates, Data Sources, Settings, Snapshots
 */
import {
  Layers,
  FileText,
  Database,
  Settings,
  Camera,
  ClipboardCheck,
  Waypoints,
} from "lucide-react";

import { cn } from "@/lib/utils";

import type React from "react";
import type { ComponentType } from "react";

export type BuilderTab = "sections" | "map" | "templates" | "data-sources" | "settings" | "snapshots" | "review";
interface TabConfig {
  id: BuilderTab;
  label: string;
  icon: ComponentType<{ className?: string }>;
}
const TABS: TabConfig[] = [
  { id: "sections", label: "Sections", icon: Layers },
  { id: "map", label: "Map", icon: Waypoints },
  { id: "templates", label: "Templates", icon: FileText },
  { id: "data-sources", label: "Data Sources", icon: Database },
  { id: "review", label: "Review", icon: ClipboardCheck },
  { id: "snapshots", label: "Snapshots", icon: Camera },
  { id: "settings", label: "Settings", icon: Settings },
];
interface BuilderTabNavProps {
  activeTab: BuilderTab;
  onTabChange: (tab: BuilderTab) => void;
}

export function isBuilderTab(value: string | null): value is BuilderTab {
  return value !== null && TABS.some((tab) => tab.id === value);
}

export function BuilderTabNav({ activeTab, onTabChange }: BuilderTabNavProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex = -1;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      nextIndex = (currentIndex + 1) % TABS.length;
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
    } else if (e.key === "Home") {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === "End") {
      e.preventDefault();
      nextIndex = TABS.length - 1;
    }

    if (nextIndex >= 0 && nextIndex < TABS.length) {
      const nextTab = TABS[nextIndex];
      onTabChange(nextTab.id);
      const nextElement = document.getElementById(`builder-tab-${nextTab.id}`);
      nextElement?.focus();
    }
  };

  return (
    <div
      role="tablist"
      aria-label="Workflow Builder Navigation"
      aria-orientation="horizontal"
      className="flex items-center justify-start gap-1 overflow-x-auto border-b bg-card/50 lg:justify-center"
    >
      {TABS.map((tab, index) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            id={`builder-tab-${tab.id}`}
            role="tab"
            aria-selected={isActive}
            aria-controls={`builder-tabpanel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onTabChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={cn(
              "flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 py-3 text-sm font-medium transition-colors relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              "w-[100px] shrink-0 md:w-auto md:px-4",
              "hover:text-foreground hover:bg-accent/50",
              isActive
                ? "text-foreground bg-background border-b-2 border-primary"
                : "text-muted-foreground"
            )}
          >
            <Icon className="w-5 h-5 md:w-4 md:h-4" aria-hidden="true" />
            <span className="text-xs md:text-sm">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
