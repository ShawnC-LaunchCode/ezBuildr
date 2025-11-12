/**
 * Runs Compare Page
 * Stage 8: Compare two runs side-by-side
 */

import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { documentRunsAPI } from '@/lib/vault-api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft } from 'lucide-react';
import { LoadingState } from '@/components/shared/LoadingState';
import { JsonViewer } from '@/components/shared/JsonViewer';

export default function RunsCompare() {
  const [_location, setLocation] = useLocation();

  // Get runA and runB from URL query params
  const searchParams = new URLSearchParams(window.location.search);
  const runA = searchParams.get('runA');
  const runB = searchParams.get('runB');

  const { data, isLoading, error } = useQuery({
    queryKey: ['compare-runs', runA, runB],
    queryFn: () => documentRunsAPI.compare(runA!, runB!),
    enabled: !!runA && !!runB,
  });

  if (isLoading) {
    return <LoadingState />;
  }

  if (error || !data || !runA || !runB) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-center">
          <p className="text-destructive">Error loading comparison</p>
          <Button onClick={() => setLocation('/runs')} className="mt-4">
            Back to Runs
          </Button>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-500">Success</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation('/runs')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <div>
          <h1 className="text-3xl font-bold">Compare Runs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Side-by-side comparison of two workflow runs
          </p>
        </div>
      </div>

      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle>Comparison Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Status Match</div>
              <div className="mt-1">
                {data.summaryDiff.statusMatch ? (
                  <Badge className="bg-green-500">Same</Badge>
                ) : (
                  <Badge variant="destructive">Different</Badge>
                )}
              </div>
            </div>

            <div>
              <div className="text-sm text-muted-foreground">Duration Difference</div>
              <div className="mt-1 font-medium">
                {data.summaryDiff.durationDiff > 0 ? '+' : ''}
                {(data.summaryDiff.durationDiff / 1000).toFixed(2)}s
              </div>
            </div>

            <div>
              <div className="text-sm text-muted-foreground">Changed Fields</div>
              <div className="mt-1 font-medium">
                {data.summaryDiff.inputsChangedKeys.length} inputs,{' '}
                {data.summaryDiff.outputsChangedKeys.length} outputs
              </div>
            </div>
          </div>

          {data.summaryDiff.inputsChangedKeys.length > 0 && (
            <div className="mt-4">
              <div className="text-sm font-semibold">Changed Input Keys:</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {data.summaryDiff.inputsChangedKeys.map((key) => (
                  <Badge key={key} variant="outline">
                    {key}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {data.summaryDiff.outputsChangedKeys.length > 0 && (
            <div className="mt-4">
              <div className="text-sm font-semibold">Changed Output Keys:</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {data.summaryDiff.outputsChangedKeys.map((key) => (
                  <Badge key={key} variant="outline">
                    {key}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Side-by-side comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Run A */}
        <Card>
          <CardHeader>
            <CardTitle>Run A</CardTitle>
            <div className="flex items-center gap-2 mt-2">
              {getStatusBadge(data.runA.status)}
              <span className="text-sm text-muted-foreground">
                {data.runA.durationMs}ms
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm font-semibold mb-2">Run ID</div>
              <div className="font-mono text-xs">{data.runA.id}</div>
            </div>

            <div>
              <div className="text-sm font-semibold mb-2">Created At</div>
              <div className="text-sm">{new Date(data.runA.createdAt).toLocaleString()}</div>
            </div>

            {data.runA.error && (
              <div>
                <div className="text-sm font-semibold mb-2">Error</div>
                <div className="p-2 bg-destructive/10 border border-destructive rounded text-sm">
                  {data.runA.error}
                </div>
              </div>
            )}

            <div>
              <div className="text-sm font-semibold mb-2">Inputs</div>
              <JsonViewer data={data.runA.inputs || {}} maxHeight="300px" />
            </div>

            <div>
              <div className="text-sm font-semibold mb-2">Outputs</div>
              <JsonViewer data={data.runA.outputs || {}} maxHeight="300px" />
            </div>
          </CardContent>
        </Card>

        {/* Run B */}
        <Card>
          <CardHeader>
            <CardTitle>Run B</CardTitle>
            <div className="flex items-center gap-2 mt-2">
              {getStatusBadge(data.runB.status)}
              <span className="text-sm text-muted-foreground">
                {data.runB.durationMs}ms
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm font-semibold mb-2">Run ID</div>
              <div className="font-mono text-xs">{data.runB.id}</div>
            </div>

            <div>
              <div className="text-sm font-semibold mb-2">Created At</div>
              <div className="text-sm">{new Date(data.runB.createdAt).toLocaleString()}</div>
            </div>

            {data.runB.error && (
              <div>
                <div className="text-sm font-semibold mb-2">Error</div>
                <div className="p-2 bg-destructive/10 border border-destructive rounded text-sm">
                  {data.runB.error}
                </div>
              </div>
            )}

            <div>
              <div className="text-sm font-semibold mb-2">Inputs</div>
              <JsonViewer data={data.runB.inputs || {}} maxHeight="300px" />
            </div>

            <div>
              <div className="text-sm font-semibold mb-2">Outputs</div>
              <JsonViewer data={data.runB.outputs || {}} maxHeight="300px" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
