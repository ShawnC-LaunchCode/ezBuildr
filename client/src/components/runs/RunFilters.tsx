/**
 * Run Filters Component
 * Stage 8: Filters for status, workflow, date range, and search
 */

import { useState } from 'react';
import { ListRunsParams } from '@/lib/vault-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Search } from 'lucide-react';

interface RunFiltersProps {
  filters: ListRunsParams;
  onChange: (filters: ListRunsParams) => void;
}

export function RunFilters({ filters, onChange }: RunFiltersProps) {
  const [searchTerm, setSearchTerm] = useState(filters.q || '');

  const handleStatusChange = (value: string) => {
    onChange({
      ...filters,
      status: value === 'all' ? undefined : (value as 'pending' | 'success' | 'error'),
      cursor: undefined, // Reset pagination
    });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onChange({
      ...filters,
      q: searchTerm || undefined,
      cursor: undefined,
    });
  };

  const handleDateFromChange = (value: string) => {
    onChange({
      ...filters,
      from: value ? new Date(value).toISOString() : undefined,
      cursor: undefined,
    });
  };

  const handleDateToChange = (value: string) => {
    onChange({
      ...filters,
      to: value ? new Date(value).toISOString() : undefined,
      cursor: undefined,
    });
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    onChange({ limit: filters.limit });
  };

  const hasActiveFilters = filters.status || filters.q || filters.from || filters.to;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Status filter */}
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select
            value={filters.status || 'all'}
            onValueChange={handleStatusChange}
          >
            <SelectTrigger id="status">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Date from */}
        <div className="space-y-2">
          <Label htmlFor="dateFrom">From</Label>
          <Input
            id="dateFrom"
            type="datetime-local"
            value={filters.from ? new Date(filters.from).toISOString().slice(0, 16) : ''}
            onChange={(e) => handleDateFromChange(e.target.value)}
          />
        </div>

        {/* Date to */}
        <div className="space-y-2">
          <Label htmlFor="dateTo">To</Label>
          <Input
            id="dateTo"
            type="datetime-local"
            value={filters.to ? new Date(filters.to).toISOString().slice(0, 16) : ''}
            onChange={(e) => handleDateToChange(e.target.value)}
          />
        </div>

        {/* Clear button */}
        <div className="flex items-end">
          {hasActiveFilters && (
            <Button
              variant="outline"
              onClick={handleClearFilters}
              className="w-full"
            >
              <X className="h-4 w-4 mr-2" />
              Clear Filters
            </Button>
          )}
        </div>
      </div>

      {/* Search */}
      <form onSubmit={handleSearchSubmit} className="flex gap-2">
        <div className="flex-1">
          <Input
            placeholder="Search by run ID, creator email, or input data..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button type="submit" variant="secondary">
          <Search className="h-4 w-4 mr-2" />
          Search
        </Button>
      </form>
    </div>
  );
}
