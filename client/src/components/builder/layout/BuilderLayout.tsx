/**
 * BuilderLayout - Main layout wrapper for workflow builder tabs
 * Provides consistent structure for all builder tab views
 */

import React, { ReactNode } from "react";

interface BuilderLayoutProps {
  children: ReactNode;
  className?: string;
}

export function BuilderLayout({ children, className = "" }: BuilderLayoutProps) {
  return (
    <div className={`flex-1 flex flex-col overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

export function BuilderLayoutHeader({ children }: { children: ReactNode }) {
  return (
    <div className="border-b px-6 py-4 bg-card">
      {children}
    </div>
  );
}

export function BuilderLayoutContent({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      {children}
    </div>
  );
}
