/**
 * Stage 21: Run Outputs Panel
 *
 * UI for viewing and downloading generated documents from workflow runs.
 * Features:
 * - List all outputs (DOCX, PDF) for a run
 * - Show output status (pending, ready, failed)
 * - Download ready outputs
 * - Display error messages for failed outputs
 * - File metadata (size, created date, template key)
 * - Retry failed PDF conversions
 */

import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  FileText,
  Download,
  Loader2,
  AlertCircle,
  CheckCircle,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

interface RunOutput {
  id: string;
  runId: string;
  workflowVersionId: string;
  templateKey: string;
  fileType: 'docx' | 'pdf';
  storagePath: string;
  status: 'pending' | 'ready' | 'failed';
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RunOutputsPanelProps {
  runId: string;
}

export function RunOutputsPanel({ runId }: RunOutputsPanelProps) {
  const queryClient = useQueryClient();

  // Fetch run outputs
  const {
    data: outputs,
    isLoading,
    error,
  } = useQuery<{ data: RunOutput[] }>({
    queryKey: ['run-outputs', runId],
    queryFn: async () => {
      const response = await fetch(`/api/runs/${runId}/outputs`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch run outputs');
      }

      return response.json();
    },
    refetchInterval: (data: any) => {
      // Auto-refresh if there are pending outputs
      const hasPending = data?.data?.some((o: any) => o.status === 'pending');
      return hasPending ? 5000 : false; // Poll every 5 seconds
    },
  });

  // Download output mutation
  const downloadMutation = useMutation({
    mutationFn: async (outputId: string) => {
      const response = await fetch(`/api/runs/${runId}/outputs/${outputId}/download`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to download output');
      }

      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="?([^"]+)"?/);
      const filename = filenameMatch?.[1] || 'output.docx';

      // Download file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      return { filename };
    },
    onSuccess: (result) => {
      toast.success(`Downloaded ${result.filename}`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Retry PDF conversion mutation
  const retryMutation = useMutation({
    mutationFn: async (outputId: string) => {
      const response = await fetch(`/api/runs/${runId}/outputs/${outputId}/retry`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to retry PDF conversion');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['run-outputs', runId] });
      toast.success('PDF conversion retry queued');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleDownload = (outputId: string) => {
    downloadMutation.mutate(outputId);
  };

  const handleRetry = (outputId: string) => {
    retryMutation.mutate(outputId);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ready':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ready':
        return (
          <Badge variant="default" className="bg-green-600">
            Ready
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="secondary" className="bg-yellow-600">
            Processing
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive" className="bg-red-600">
            Failed
          </Badge>
        );
      default:
        return null;
    }
  };

  const formatFileSize = (path: string): string => {
    // Placeholder: In real implementation, would fetch file size from backend
    return 'N/A';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <p className="text-red-900 dark:text-red-100 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          Error: {(error as Error).message}
        </p>
      </div>
    );
  }

  if (!outputs?.data || outputs.data.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>No outputs generated yet</p>
        <p className="text-sm">
          Outputs will appear here once the workflow generates documents
        </p>
      </div>
    );
  }

  // Group outputs by template key
  const groupedOutputs = outputs.data.reduce((acc, output) => {
    if (!acc[output.templateKey]) {
      acc[output.templateKey] = [];
    }
    acc[output.templateKey].push(output);
    return acc;
  }, {} as Record<string, RunOutput[]>);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Generated Documents ({outputs.data.length})
        </h3>
      </div>

      {Object.entries(groupedOutputs).map(([templateKey, outputs]) => (
        <div key={templateKey} className="space-y-2">
          <h4 className="font-medium text-sm text-gray-700 dark:text-gray-300">
            Template: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{templateKey}</code>
          </h4>

          <div className="space-y-2">
            {outputs.map((output) => (
              <div
                key={output.id}
                className="p-4 bg-white dark:bg-gray-800 border rounded-lg shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    {getStatusIcon(output.status)}

                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <FileText className="h-4 w-4 text-gray-500" />
                        <span className="font-medium">
                          {output.fileType.toUpperCase()} Output
                        </span>
                        {getStatusBadge(output.status)}
                      </div>

                      {output.status === 'ready' && output.storagePath && (
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          File: {output.storagePath}
                        </p>
                      )}

                      {output.status === 'pending' && (
                        <p className="text-sm text-yellow-700 dark:text-yellow-300 flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Processing...
                        </p>
                      )}

                      {output.status === 'failed' && output.error && (
                        <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
                          <p className="text-sm text-red-900 dark:text-red-100">
                            <strong>Error:</strong> {output.error}
                          </p>
                        </div>
                      )}

                      <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                        <span>
                          Created: {new Date(output.createdAt).toLocaleString()}
                        </span>
                        {output.status !== 'pending' && (
                          <>
                            <span>•</span>
                            <span>
                              Updated: {new Date(output.updatedAt).toLocaleString()}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {output.status === 'ready' && (
                      <Button
                        size="sm"
                        onClick={() => handleDownload(output.id)}
                        disabled={downloadMutation.isPending}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Download
                      </Button>
                    )}

                    {output.status === 'failed' && output.fileType === 'pdf' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRetry(output.id)}
                        disabled={retryMutation.isPending}
                      >
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Retry
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {outputs.data.some((o) => o.status === 'pending') && (
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <p className="text-sm text-blue-900 dark:text-blue-100 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Some outputs are still being processed. This panel will auto-refresh.
          </p>
        </div>
      )}
    </div>
  );
}
