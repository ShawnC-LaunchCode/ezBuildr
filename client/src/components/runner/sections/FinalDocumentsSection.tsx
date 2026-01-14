/**
 * Final Documents Section - Runner View
 * Displays generated documents for download
 */

import { useQuery, useMutation } from "@tanstack/react-query";
import axios from "axios";
import DOMPurify from "isomorphic-dompurify";
import { FileText, Download, Loader2, CheckCircle } from "lucide-react";
import { useEffect, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";


interface FinalDocumentsSectionProps {
  runId: string;
  runToken?: string; // Optional run token for preview mode
  sectionConfig: {
    screenTitle?: string;
    title?: string;
    markdownMessage?: string;
    message?: string;
    showDocuments?: boolean;
    redirectUrl?: string;
    redirectDelaySeconds?: number;
    customLinks?: Array<{ label: string; url: string; style: 'button' | 'link' }>;
    brandingColor?: string;
    templates?: string[];
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
  const title = sectionConfig.title || sectionConfig.screenTitle || "Your Completed Documents";
  const message = sectionConfig.message || sectionConfig.markdownMessage || "";
  const { showDocuments = true, customLinks, brandingColor, redirectUrl, redirectDelaySeconds = 5 } = sectionConfig;

  // Handle Redirect
  useEffect(() => {
    if (redirectUrl) {
      const timer = setTimeout(() => {
        window.location.href = redirectUrl;
      }, (redirectDelaySeconds || 5) * 1000);
      return () => clearTimeout(timer);
    }
  }, [redirectUrl, redirectDelaySeconds]);

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
    enabled: !!isValidRunId, // Only fetch if runId is valid
    refetchInterval: (query) => {
      // Only refetch if runId is valid
      if (!isValidRunId) {return false;}

      // If no documents yet, refetch every 2 seconds until they're ready
      const docs = query.state.data;
      if (!docs || docs.length === 0) {
        return 2000;
      }
      // Once we have documents, stop refetching
      return false;
    },
  });

  const formatFileSize = (bytes?: number) => {
    if (!bytes) {return '';}
    const kb = bytes / 1024;
    if (kb < 1024) {return `${kb.toFixed(1)} KB`;}
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
    <div className="max-w-2xl mx-auto py-12 px-6 space-y-8 animate-in fade-in duration-500">
      {/* Success Header */}
      <div className="text-center space-y-6">
        <div className="mx-auto w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4 shadow-sm">
          <CheckCircle className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h1
            className="text-3xl font-bold tracking-tight text-slate-900"
            style={brandingColor ? { color: brandingColor } : undefined}
          >
            {title}
          </h1>
          {/* Default subtitle if none provided in markdown */}
          {!message && (
            <p className="text-slate-500 text-lg">
              You have successfully completed this workflow.
            </p>
          )}
        </div>
      </div>

      {/* Markdown Message */}
      {message && (
        <div className="prose prose-slate prose-sm md:prose-base dark:prose-invert max-w-none text-center text-slate-600">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            urlTransform={(url) => {
              if (url.startsWith("http:") || url.startsWith("https:") || url.startsWith("mailto:")) {
                return url;
              }
              return "#";
            }}
          >
            {DOMPurify.sanitize(message, { ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'ul', 'ol', 'li', 'br', 'h1', 'h2', 'h3', 'h4'] })}
          </ReactMarkdown>
        </div>
      )}

      {/* Documents Section */}
      {showDocuments && (
        <Card className="border-slate-200 shadow-md overflow-hidden bg-white">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-500" />
              Generated Documents
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {error ? (
              <div className="text-center py-8 text-destructive p-4">
                <p className="text-sm font-medium">Unable to load documents</p>
                <p className="text-xs mt-1 opacity-80">{error instanceof Error ? error.message : 'Unknown error'}</p>
              </div>
            ) : documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                <Loader2 className="w-6 h-6 animate-spin text-primary mb-3" />
                <h3 className="text-sm font-medium text-slate-900">Preparing your documents...</h3>
                <p className="text-xs text-slate-500 mt-1">This usually takes just a moment.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors group"
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                        <span className="text-xl">{getFileIcon(doc.mimeType)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-slate-900 truncate pr-4">{doc.fileName}</div>
                        {doc.fileSize && (
                          <div className="text-xs text-slate-500">
                            {formatFileSize(doc.fileSize)}
                          </div>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="ml-2 shrink-0 bg-slate-900 text-white hover:bg-slate-800 shadow-sm"
                      asChild
                    >
                      <a href={doc.fileUrl} download={doc.fileName} target="_blank" rel="noopener noreferrer">
                        <Download className="w-3.5 h-3.5 mr-2" />
                        Download
                      </a>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Custom Links */}
      {
        customLinks && customLinks.length > 0 && (
          <div className="flex flex-col gap-3 pt-4">
            {customLinks.map((link, i) => (
              <Button
                key={i}
                variant={link.style === 'button' ? 'default' : 'outline'}
                size="lg"
                className="w-full text-base h-12"
                asChild
                style={link.style === 'button' && brandingColor ? { backgroundColor: brandingColor } : undefined}
              >
                <a href={link.url} target="_blank" rel="noopener noreferrer">
                  {link.label}
                </a>
              </Button>
            ))}
          </div>
        )
      }

      {/* Footer */}
      <div className="text-center pt-8 border-t border-slate-100 mt-8">
        <p className="text-sm text-slate-400">
          Documents are securely available for 30 days. You can close this window at any time.
        </p>
      </div>
    </div >
  );
}
