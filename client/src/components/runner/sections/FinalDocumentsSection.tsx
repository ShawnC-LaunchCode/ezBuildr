/**
 * Final Documents Section - Runner View
 * Displays generated documents for download
 */

import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import DOMPurify from "isomorphic-dompurify";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, Loader2, CheckCircle } from "lucide-react";

interface FinalDocumentsSectionProps {
  runId: string;
  runToken?: string; // Optional run token for preview mode
  sectionConfig: {
    screenTitle: string;
    markdownMessage: string;
    templates: string[];
  };
}

interface GeneratedDocument {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType?: string;
  fileSize?: number;
  createdAt: string;
}

export function FinalDocumentsSection({ runId, runToken, sectionConfig }: FinalDocumentsSectionProps) {
  const { screenTitle, markdownMessage } = sectionConfig;

  // Validate runId - don't proceed if it's null/undefined/empty
  const isValidRunId = runId && runId !== 'null' && runId !== 'undefined';

  // Mutation to trigger document generation
  const generateDocsMutation = useMutation({
    mutationFn: async () => {
      if (!isValidRunId) {
        throw new Error('Invalid run ID');
      }
      console.log('[FinalDocumentsSection] Triggering document generation for runId:', runId);
      const headers: Record<string, string> = {};
      if (runToken) {
        headers['Authorization'] = `Bearer ${runToken}`;
      }
      const response = await axios.post(`/api/runs/${runId}/generate-documents`, {}, { headers });
      console.log('[FinalDocumentsSection] Document generation response:', response.data);
      return response.data;
    },
    onSuccess: (data) => {
      console.log('[FinalDocumentsSection] Document generation succeeded:', data);
    },
    onError: (error) => {
      console.error('[FinalDocumentsSection] Document generation failed:', error);
    },
  });

  // Trigger document generation when component mounts - only if runId is valid
  useEffect(() => {
    if (isValidRunId) {
      console.log('[FinalDocumentsSection] Mounting with runId:', runId, 'runToken:', runToken ? 'present' : 'missing');
      generateDocsMutation.mutate();
    } else {
      console.warn('[FinalDocumentsSection] Invalid runId:', runId);
    }
  }, [runId]); // Only run once when runId changes

  // Fetch generated documents for this run - only if runId is valid
  const { data: documents = [], isLoading, error } = useQuery({
    queryKey: ["run-documents", runId],
    queryFn: async () => {
      if (!isValidRunId) {
        throw new Error('Invalid run ID');
      }
      const headers: Record<string, string> = {};
      if (runToken) {
        headers['Authorization'] = `Bearer ${runToken}`;
      }
      const response = await axios.get<{ documents: GeneratedDocument[] }>(`/api/runs/${runId}/documents`, { headers });
      return response.data.documents;
    },
    enabled: isValidRunId, // Only fetch if runId is valid
    refetchInterval: (query) => {
      // Only refetch if runId is valid
      if (!isValidRunId) return false;

      // If no documents yet, refetch every 2 seconds until they're ready
      const docs = query.state.data as GeneratedDocument[] | undefined;
      if (!docs || docs.length === 0) {
        return 2000;
      }
      // Once we have documents, stop refetching
      return false;
    },
  });

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  };

  const getFileIcon = (mimeType?: string) => {
    if (mimeType?.includes('pdf')) {
      return '📄';
    }
    if (mimeType?.includes('word') || mimeType?.includes('document')) {
      return '📝';
    }
    return '📎';
  };

  // Show error if runId is invalid
  if (!isValidRunId) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Unable to Load Documents</CardTitle>
            <CardDescription>
              The workflow run could not be identified. Please ensure you're accessing this page from a valid workflow run.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Run ID: <code className="px-2 py-1 bg-muted rounded">{runId || 'Not provided'}</code>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Screen Title */}
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">{screenTitle}</h1>
      </div>

      {/* Markdown Message */}
      <Card>
        <CardContent className="pt-6">
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              urlTransform={(url) => {
                if (url.startsWith("http:") || url.startsWith("https:") || url.startsWith("mailto:")) {
                  return url;
                }
                return "#";
              }}
            >
              {DOMPurify.sanitize(markdownMessage, { ALLOWED_TAGS: [] })}
            </ReactMarkdown>
          </div>
        </CardContent>
      </Card>

      {/* Documents Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Your Documents
          </CardTitle>
          <CardDescription>
            Generated documents are ready for download
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="text-center py-8 text-destructive">
              <p className="text-sm">Failed to load documents. Please try again.</p>
              <p className="text-xs text-muted-foreground mt-2">{error instanceof Error ? error.message : 'Unknown error'}</p>
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-8 space-y-4">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Generating your documents...
              </p>
              <p className="text-xs text-muted-foreground">
                This may take a few moments. Your documents will appear below when ready.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div className="text-2xl">{getFileIcon(doc.mimeType)}</div>
                    <div className="flex-1">
                      <div className="font-medium text-sm">{doc.fileName}</div>
                      {doc.fileSize && (
                        <div className="text-xs text-muted-foreground">
                          {formatFileSize(doc.fileSize)}
                        </div>
                      )}
                    </div>
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  </div>
                  <Button
                    size="sm"
                    asChild
                    className="ml-4"
                  >
                    <a href={doc.fileUrl} download={doc.fileName} target="_blank" rel="noopener noreferrer">
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </a>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Additional Info */}
      <div className="text-center text-sm text-muted-foreground">
        <p>Documents are available for download for 30 days</p>
      </div>
    </div>
  );
}
