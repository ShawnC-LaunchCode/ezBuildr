/**
 * Run Details Page
 * Stage 8: View run details with trace, inputs, outputs, logs, and metadata
 */
import { useQuery, useMutation } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { ArrowLeft, Download, PlayCircle, FileText, Share2, Copy } from 'lucide-react';
import React, { useState } from 'react';
import { useRoute, useLocation } from 'wouter';

import { TracePanel } from '@/components/runs/TracePanel';
import { JsonViewer } from '@/components/shared/JsonViewer';
import { LoadingState } from '@/components/shared/LoadingState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { documentRunsAPI } from '@/lib/vault-api';
export default function RunDetails() {
  const [_, params] = useRoute('/runs/:id');
  const [_location, setLocation] = useLocation();
  const { toast } = useToast();
  const runId = params?.id;
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const { data: run, isLoading, error } = useQuery({
    queryKey: ['document-run', runId],
    queryFn: () => documentRunsAPI.get(runId!),
    enabled: !!runId,
  });
  const { data: logs } = useQuery({
    queryKey: ['document-run-logs', runId],
    queryFn: () => documentRunsAPI.getLogs(runId!, { limit: 100 }),
    enabled: !!runId,
  });
  const rerunMutation = useMutation({
    mutationFn: () => documentRunsAPI.rerun(runId!),
    onSuccess: (data) => {
      toast({
        title: 'Run started',
        description: 'Workflow is being re-executed',
      });
      setLocation(`/runs/${data.runId}`);
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Re-run failed',
        description: error.message,
      });
    },
  });
  const shareMutation = useMutation({
    mutationFn: () => documentRunsAPI.share(runId!),
    onSuccess: (data) => {
      const link = `${window.location.origin}/share/${data.shareToken}`;
      setShareLink(link);
      setShareDialogOpen(true);
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Share failed',
        description: error.message,
      });
    },
  });
  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareLink);
    toast({
      title: 'Copied!',
      description: 'Link copied to clipboard.',
    });
  };
  if (isLoading) {
    return <LoadingState />;
  }
  if (error || !run) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-center">
          <p className="text-destructive">Error loading run details</p>
          <Button onClick={() => { void setLocation('/runs'); }} className="mt-4">
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
  const formatDuration = (ms?: number) => {
    if (!ms) {return '-';}
    if (ms < 1000) {return `${ms}ms`;}
    if (ms < 60000) {return `${(ms / 1000).toFixed(2)}s`;}
    return `${(ms / 60000).toFixed(2)}m`;
  };
  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { void setLocation('/runs'); }}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Run Details</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {run.workflowVersion?.workflow?.name} • {run.workflowVersion?.name}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {run.status === 'success' && run.outputRefs && (
            <>
              <Button variant="outline" size="sm" asChild>
                <a
                  href={documentRunsAPI.downloadUrl(run.id, 'docx')}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download DOCX
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a
                  href={documentRunsAPI.downloadUrl(run.id, 'pdf')}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Download PDF
                </a>
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => { void shareMutation.mutate(); }}
            disabled={shareMutation.isPending}
          >
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>
          <Button
            size="sm"
            onClick={() => { void rerunMutation.mutate(); }}
            disabled={rerunMutation.isPending}
          >
            <PlayCircle className="h-4 w-4 mr-2" />
            Re-run
          </Button>
        </div>
      </div>
      {/* Status Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Status</div>
              <div className="mt-1">{getStatusBadge(run.status)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Duration</div>
              <div className="mt-1 font-medium">{formatDuration(run.durationMs)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Started</div>
              <div className="mt-1 font-medium">
                {formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Created By</div>
              <div className="mt-1 font-medium">
                {run.createdByUser?.email || run.createdBy}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Run ID</div>
              <div className="mt-1 font-mono text-xs">{run.id.slice(0, 8)}...</div>
            </div>
          </div>
          {run.error && (
            <div className="mt-4 p-4 bg-destructive/10 border border-destructive rounded-md">
              <div className="text-sm font-semibold text-destructive">Error</div>
              <div className="mt-1 text-sm">{run.error}</div>
            </div>
          )}
        </CardContent>
      </Card>
      {/* Tabs */}
      <Card>
        <Tabs defaultValue="trace" className="w-full">
          <CardHeader>
            <TabsList>
              <TabsTrigger value="trace">Trace</TabsTrigger>
              <TabsTrigger value="inputs">Inputs</TabsTrigger>
              <TabsTrigger value="outputs">Outputs</TabsTrigger>
              <TabsTrigger value="logs">Logs</TabsTrigger>
              <TabsTrigger value="meta">Metadata</TabsTrigger>
            </TabsList>
          </CardHeader>
          <CardContent>
            {/* Trace Tab */}
            <TabsContent value="trace">
              {run.trace && run.trace.length > 0 ? (
                <TracePanel trace={run.trace} />
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No trace data available
                </div>
              )}
            </TabsContent>
            {/* Inputs Tab */}
            <TabsContent value="inputs">
              {run.inputJson ? (
                <JsonViewer data={run.inputJson} maxHeight="600px" />
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No input data
                </div>
              )}
            </TabsContent>
            {/* Outputs Tab */}
            <TabsContent value="outputs">
              {run.outputRefs ? (
                <div className="space-y-4">
                  <JsonViewer data={run.outputRefs} maxHeight="600px" />
                  {run.status === 'success' && (
                    <div className="flex gap-2">
                      <Button variant="outline" asChild>
                        <a
                          href={documentRunsAPI.downloadUrl(run.id, 'docx')}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download DOCX
                        </a>
                      </Button>
                      <Button variant="outline" asChild>
                        <a
                          href={documentRunsAPI.downloadUrl(run.id, 'pdf')}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          Download PDF
                        </a>
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No output files
                </div>
              )}
            </TabsContent>
            {/* Logs Tab */}
            <TabsContent value="logs">
              {logs && logs.items.length > 0 ? (
                <div className="space-y-2">
                  {logs.items.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 border rounded-md bg-muted/30 font-mono text-sm"
                    >
                      <div className="flex items-start gap-2">
                        <Badge variant={log.level === 'error' ? 'destructive' : 'secondary'}>
                          {log.level}
                        </Badge>
                        <div className="flex-1">
                          <div>{log.message}</div>
                          {log.nodeId && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Node: {log.nodeId}
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground mt-1">
                            {new Date(log.createdAt).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No logs available
                </div>
              )}
            </TabsContent>
            {/* Metadata Tab */}
            <TabsContent value="meta">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm font-semibold">Run ID</div>
                    <div className="mt-1 font-mono text-sm">{run.id}</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold">Workflow Version ID</div>
                    <div className="mt-1 font-mono text-sm">{run.workflowVersionId}</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold">Workflow</div>
                    <div className="mt-1">{run.workflowVersion?.workflow?.name}</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold">Version</div>
                    <div className="mt-1">{run.workflowVersion?.name}</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold">Created At</div>
                    <div className="mt-1">{new Date(run.createdAt).toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold">Updated At</div>
                    <div className="mt-1">{new Date(run.updatedAt).toLocaleString()}</div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share Run</DialogTitle>
            <DialogDescription>
              Anyone with this link can view the run completion page and download documents.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center space-x-2">
            <div className="grid flex-1 gap-2">
              <Label htmlFor="link" className="sr-only">
                Link
              </Label>
              <Input
                id="link"
                defaultValue={shareLink}
                value={shareLink}
                readOnly
              />
            </div>
            <Button type="button" size="sm" className="px-3" onClick={() => { void handleCopyLink(); }}>
              <span className="sr-only">Copy</span>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div >
  );
}