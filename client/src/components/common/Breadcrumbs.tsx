/**
 * Breadcrumbs Component
 * Reusable navigation breadcrumbs with links
 * DataVault Phase 2: PR 13
 */

import { ChevronRight, Home } from "lucide-react";
import React from "react";
import { Link } from "wouter";

import { cn } from "@/lib/utils";

export interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: React.ReactNode;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
  showHome?: boolean;
}

export function Breadcrumbs({ items, className, showHome = true }: BreadcrumbsProps) {
  const allItems = showHome
    ? [{ label: "Home", href: "/", icon: <Home className="w-3 h-3" /> }, ...items]
    : items;

  return (
    <nav
      className={cn("flex items-center space-x-1 text-sm text-muted-foreground", className)}
      aria-label="Breadcrumb"
    >
      {allItems.map((item, index) => {
        const isLast = index === allItems.length - 1;

        return (
          <div key={index} className="flex items-center">
            {index > 0 && <ChevronRight className="w-4 h-4 mx-1 flex-shrink-0" />}

            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="hover:text-foreground transition-colors flex items-center gap-1.5"
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            ) : (
              <span
                className={cn(
                  "flex items-center gap-1.5",
                  isLast && "text-foreground font-medium"
                )}
              >
                {item.icon}
                {item.label}
              </span>
            )}
          </div>
        );
      })}
    </nav>
  );
}
