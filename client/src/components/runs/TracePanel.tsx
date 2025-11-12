/**
 * Trace Panel Component
 * Stage 8: Display node-by-node execution trace with filters
 */

import { useState } from 'react';
import { TraceEntry } from '@/lib/vault-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { CheckCircle2, XCircle, Circle, ChevronRight } from 'lucide-react';
import { JsonViewer } from '@/components/shared/JsonViewer';

interface TracePanelProps {
  trace: TraceEntry[];
}

export function TracePanel({ trace }: TracePanelProps) {
  const [showSkipped, setShowSkipped] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set());

  const filteredTrace = showSkipped
    ? trace
    : trace.filter((entry) => entry.status === 'executed');

  const toggleNode = (index: number) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedNodes(newExpanded);
  };

  const getStatusIcon = (status: string, error?: string) => {
    if (error) {
      return <XCircle className="h-5 w-5 text-destructive" />;
    }

    switch (status) {
      case 'executed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'skipped':
        return <Circle className="h-5 w-5 text-muted-foreground" />;
      default:
        return <Circle className="h-5 w-5" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'executed':
        return <Badge className="bg-green-500">Executed</Badge>;
      case 'skipped':
        return <Badge variant="secondary">Skipped</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleCopyTrace = async () => {
    const traceJson = JSON.stringify(trace, null, 2);
    await navigator.clipboard.writeText(traceJson);
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="show-skipped"
              checked={showSkipped}
              onCheckedChange={setShowSkipped}
            />
            <Label htmlFor="show-skipped">Show skipped nodes</Label>
          </div>

          <div className="text-sm text-muted-foreground">
            {filteredTrace.length} of {trace.length} nodes
          </div>
        </div>

        <Button variant="outline" size="sm" onClick={handleCopyTrace}>
          Copy Trace JSON
        </Button>
      </div>

      {/* Trace List */}
      <div className="space-y-2">
        {filteredTrace.map((entry, index) => (
          <Card key={index} className="p-4">
            <div className="flex items-start gap-3">
              <div className="mt-1">{getStatusIcon(entry.status, entry.error)}</div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{entry.nodeId}</span>
                  <Badge variant="outline">{entry.type}</Badge>
                  {getStatusBadge(entry.status)}

                  {entry.condition && entry.conditionResult !== undefined && (
                    <Badge variant={entry.conditionResult ? 'default' : 'secondary'}>
                      Condition: {entry.conditionResult ? 'true' : 'false'}
                    </Badge>
                  )}
                </div>

                {entry.condition && (
                  <div className="mt-2 text-sm">
                    <span className="text-muted-foreground">Condition:</span>{' '}
                    <code className="bg-muted px-2 py-1 rounded">{entry.condition}</code>
                  </div>
                )}

                {entry.error && (
                  <div className="mt-2 p-2 bg-destructive/10 border border-destructive rounded text-sm text-destructive">
                    {entry.error}
                  </div>
                )}

                {entry.outputsDelta && Object.keys(entry.outputsDelta).length > 0 && (
                  <div className="mt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleNode(index)}
                      className="h-auto py-1 px-2"
                    >
                      <ChevronRight
                        className={`h-4 w-4 mr-1 transition-transform ${
                          expandedNodes.has(index) ? 'rotate-90' : ''
                        }`}
                      />
                      {expandedNodes.has(index) ? 'Hide' : 'Show'} Outputs (
                      {Object.keys(entry.outputsDelta).length} variables)
                    </Button>

                    {expandedNodes.has(index) && (
                      <div className="mt-2">
                        <JsonViewer data={entry.outputsDelta} maxHeight="300px" />
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-2 text-xs text-muted-foreground">
                  {new Date(entry.timestamp).toLocaleString()}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {filteredTrace.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No trace entries to display
        </div>
      )}
    </div>
  );
}
