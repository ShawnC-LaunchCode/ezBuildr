/**
 * Database Table Tabs Component
 * Airtable-style horizontal scrollable tab bar for switching between tables
 */

import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import React, { useRef, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { DatavaultTable } from "@shared/schema";

interface DatabaseTableTabsProps {
  tables: DatavaultTable[];
  activeTableId: string | null;
  onTabClick: (tableId: string) => void;
  onCreateTable?: () => void;
}

export function DatabaseTableTabs({
  tables,
  activeTableId,
  onTabClick,
  onCreateTable,
}: DatabaseTableTabsProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);

  // Scroll active tab into view when it changes
  useEffect(() => {
    if (activeTabRef.current && scrollContainerRef.current) {
      activeTabRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [activeTableId]);

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -200, behavior: "smooth" });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 200, behavior: "smooth" });
    }
  };

  return (
    <div className="flex items-center border-b bg-background">
      {/* Scroll Left Button */}
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0 h-10 px-2"
        onClick={scrollLeft}
        aria-label="Scroll left"
      >
        <ChevronLeft className="w-4 h-4" />
      </Button>

      {/* Scrollable Tabs Container */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent"
        style={{ scrollbarWidth: "thin" }}
      >
        <div className="flex items-center h-10 px-1">
          {tables.map((table) => (
            <button
              key={table.id}
              ref={table.id === activeTableId ? activeTabRef : null}
              onClick={() => onTabClick(table.id)}
              className={cn(
                "px-4 h-8 text-sm font-medium whitespace-nowrap rounded-md transition-colors shrink-0 mx-0.5",
                table.id === activeTableId
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              {table.name}
            </button>
          ))}

          {tables.length === 0 && (
            <div className="px-4 py-2 text-sm text-muted-foreground">
              No tables in this database
            </div>
          )}
        </div>
      </div>

      {/* Scroll Right Button */}
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0 h-10 px-2"
        onClick={scrollRight}
        aria-label="Scroll right"
      >
        <ChevronRight className="w-4 h-4" />
      </Button>

      {/* Add Table Button */}
      {onCreateTable && (
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 h-10 px-3 mx-2 border"
          onClick={onCreateTable}
        >
          <Plus className="w-4 h-4 mr-1" />
          New Table
        </Button>
      )}
    </div>
  );
}
