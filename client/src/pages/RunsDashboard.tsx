/**
 * Runs Dashboard Page
 * Stage 8: Run History UI + Debug Traces + Download Center
 */

import { useQuery } from '@tanstack/react-query';
import { Download, RefreshCw, FileText } from 'lucide-react';
import React, { useState } from 'react';

import { RunFilters } from '@/components/runs/RunFilters';
import { RunsTable } from '@/components/runs/RunsTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingState } from '@/components/shared/LoadingState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { documentRunsAPI, type ListRunsParams } from '@/lib/vault-api';

export default function RunsDashboard() {
  const { toast } = useToast();
  const [filters, setFilters] = useState<ListRunsParams>({ limit: 20 });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['document-runs', filters],
    queryFn: () => documentRunsAPI.list(filters),
  });

  const handleExport = () => {
    const exportUrl = documentRunsAPI.exportCsvUrl(filters);
    window.open(exportUrl, '_blank');
    toast({
      title: 'Export started',
      description: 'Your CSV file will download shortly',
    });
  };

  const handleLoadMore = () => {
    if (data?.nextCursor) {
      setFilters(prev => ({ ...prev, cursor: data.nextCursor }));
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Run History</h1>
          <p className="text-muted-foreground mt-1">
            View and manage workflow execution history
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()} size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" onClick={handleExport} size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Search and filter runs by status, workflow, date range, or custom search
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RunFilters filters={filters} onChange={setFilters} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Runs</CardTitle>
          <CardDescription>
            {data?.items.length ?? 0} run{data?.items.length !== 1 ? 's' : ''} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <LoadingState />}

          {error && (
            <div className="text-center py-8">
              <p className="text-destructive">Error loading runs: {error.message}</p>
              <Button onClick={() => refetch()} className="mt-4">
                Try Again
              </Button>
            </div>
          )}

          {!isLoading && !error && data?.items.length === 0 && (
            <EmptyState
              icon={FileText}
              title="No runs found"
              description="No workflow runs match your current filters"
            />
          )}

          {!isLoading && !error && data && data.items.length > 0 && (
            <>
              <RunsTable runs={data.items} />

              {data.nextCursor && (
                <div className="flex justify-center mt-6">
                  <Button onClick={handleLoadMore} variant="outline">
                    Load More
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
