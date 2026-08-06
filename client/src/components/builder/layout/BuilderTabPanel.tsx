import type { ReactNode } from "react";

import type { BuilderTab } from "@/components/builder/layout/BuilderTabNav";

interface BuilderTabPanelProps {
  activeTab: BuilderTab;
  children?: ReactNode;
  tab: BuilderTab;
}

export function BuilderTabPanel({ activeTab, children, tab }: BuilderTabPanelProps) {
  const isActive = activeTab === tab;

  return (
    <div
      id={`builder-tabpanel-${tab}`}
      role="tabpanel"
      aria-labelledby={`builder-tab-${tab}`}
      tabIndex={isActive ? 0 : -1}
      hidden={!isActive}
      className={isActive
        ? "flex-1 flex flex-col overflow-hidden relative focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        : "hidden"}
    >
      {children}
    </div>
  );
}
