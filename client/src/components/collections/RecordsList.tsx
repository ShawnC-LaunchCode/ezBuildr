/**
 * RecordsList Component
 * Container for records with search, filters, and view options
 */

import { useState } from "react";
import { RecordTable } from "./RecordTable";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, Filter } from "lucide-react";
import type { ApiCollectionRecord, ApiCollectionField } from "@/lib/vault-api";

interface RecordsListProps {
  records: ApiCollectionRecord[];
  fields: ApiCollectionField[];
  isLoading?: boolean;
  page?: number;
  pageSize?: number;
  totalRecords?: number;
  onPageChange?: (page: number) => void;
  onRecordClick?: (record: ApiCollectionRecord) => void;
  onAddRecord?: () => void;
  onDelete?: (recordId: string) => void;
}

export function RecordsList({
  records,
  fields,
  isLoading = false,
  page = 1,
  pageSize = 50,
  totalRecords = 0,
  onPageChange,
  onRecordClick,
  onAddRecord,
  onDelete,
}: RecordsListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Filter records based on search query (client-side for now)
  const filteredRecords = searchQuery
    ? records.filter((record) => {
        const searchLower = searchQuery.toLowerCase();
        return fields.some((field) => {
          const value = record.data[field.slug];
          if (value === null || value === undefined) return false;

          // Handle different field types
          if (Array.isArray(value)) {
            return value.some(v => String(v).toLowerCase().includes(searchLower));
          }
          return String(value).toLowerCase().includes(searchLower);
        });
      })
    : records;

  return (
    <div className="space-y-4">
      {/* Search and Actions Bar */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search records..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={() => setShowFilters(!showFilters)}
          title="Filters (coming soon)"
          disabled
        >
          <Filter className="w-4 h-4" />
        </Button>

        {onAddRecord && (
          <Button onClick={onAddRecord}>
            <Plus className="w-4 h-4 mr-2" />
            Add Record
          </Button>
        )}
      </div>

      {/* Filters Panel (stub for now) */}
      {showFilters && (
        <div className="p-4 border rounded-lg bg-muted/50">
          <p className="text-sm text-muted-foreground">
            Advanced filters coming in PR 7...
          </p>
        </div>
      )}

      {/* Records Table */}
      <RecordTable
        records={filteredRecords}
        fields={fields}
        isLoading={isLoading}
        page={page}
        pageSize={pageSize}
        totalRecords={searchQuery ? filteredRecords.length : totalRecords}
        onPageChange={onPageChange}
        onRecordClick={onRecordClick}
        onDelete={onDelete}
      />
    </div>
  );
}
