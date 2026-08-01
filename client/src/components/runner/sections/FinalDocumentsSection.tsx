/**
 * Final Documents Section - Runner View
 * Displays generated documents for download
 */
import { useQuery, useMutation } from "@tanstack/react-query";
import axios from "axios";
import { FileText, Download, Loader2, CheckCircle } from "lucide-react";
import { useEffect } from "react";
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
// eslint-disable-next-line max-lines-per-function, complexity
export function FinalDocumentsSection({ runId, runToken, sectionConfig }: FinalDocumentsSectionProps) {
  const title = sectionConfig.title ?? sectionConfig.screenTitle ?? "Your Completed Documents";
  const message = (sectionConfig.message ?? sectionConfig.markdownMessage) ?? "";
  const { showDocuments = true, customLinks, brandingColor, redirectUrl, redirectDelaySeconds = 5 } = sectionConfig;
  // Handle Redirect
  useEffect(() => {
    if (redirectUrl) {
      try {
        const url = new URL(redirectUrl, window.location.origin);
        if (['http:', 'https:'].includes(url.protocol)) {
          const timer = setTimeout(() => {
            window.location.href = redirectUrl;
          }, (redirectDelaySeconds || 5) * 1000);
          return () => clearTimeout(timer);
        }
      } catch (e) {
        // Invalid URL
      }
    }
  }, [redirectUrl, redirectDelaySeconds]);
  // Validate runId - don't proceed if it's null/undefined/empty
  const isValidRunId = runId && runId !== 'null' && runId !== 'undefined';
  // Mutation to trigger document generation
  const generateDocsMutation = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      if (!isValidRunId) {
        throw new Error('Invalid run ID');
      }
      const headers: Record<string, string> = {};
      if (runToken) {
        headers['Authorization'] = `Bearer ${runToken}`;
      }
      const response = await axios.post(`/api/runs/${runId}/generate-documents`, {}, { headers });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return response.data;
    },
    onError: (error) => {
      console.error('[FinalDocumentsSection] Document generation failed:', error);
    },
  });
  // Trigger document generation when component mounts - only if runId is valid
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (isValidRunId) {
      generateDocsMutation.mutate();
    }
  }, [runId]); // Only run once when runId changes
  // Fetch generated documents for this run - only if runId is valid
  const { data, isLoading: _isLoading, error } = useQuery({
    queryKey: ["run-documents", runId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      if (!isValidRunId) {
        throw new Error('Invalid run ID');
      }
      const headers: Record<string, string> = {};
      if (runToken) {
        headers['Authorization'] = `Bearer ${runToken}`;
      }
      const response = await axios.get<{ documents: GeneratedDocument[], generationStatus?: string }>(`/api/runs/${runId}/documents`, { headers });
      return response.data;
    },
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    enabled: !!isValidRunId, // Only fetch if runId is valid
    refetchInterval: (query) => {
      // Only refetch if runId is valid
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      if (!isValidRunId) {
        return false;
      }
      // If no documents yet, refetch every 2 seconds until they're ready
      const data = query.state.data;
      const status = data?.generationStatus;
      
      if (status === 'pending' || status === 'generating') {
        return 2000;
      }
      if ((!data?.documents || data.documents.length === 0) && status === undefined) {
        // Fallback for older runs without generationStatus
        return 2000;
      }
      // Once we have terminal status, stop refetching
      return false;
    },
  });

  const documents = data?.documents ?? [];
  const generationStatus = data?.generationStatus;
  const formatFileSize = (bytes?: number) => {
    if (!bytes) {
      return '';
    }
    const kb = bytes / 1024;
    if (kb < 1024) {
      return `${kb.toFixed(1)} KB`;
    }
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  };
  const getFileIcon = (mimeType?: string) => {
    if (mimeType?.includes('pdf')) {
      return '📄';
    }
    if (mimeType?.includes('word') ?? mimeType?.includes('document')) {
      return '📝';
    }
    return '📎';
  };
  // Show error if runId is invalid
  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  if (!isValidRunId) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Unable to Load Documents</CardTitle>
            <CardDescription>
              The workflow run could not be identified. Please ensure you&apos;re accessing this page from a valid workflow run.
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
          <CheckCircle className="w-8 h-8" aria-hidden="true" />
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
            {/*
              Render the raw markdown message directly. ReactMarkdown escapes HTML by
              default (rehype-raw is intentionally NOT enabled), so any literal <tag> in
              the message is shown as text, not executed. Do NOT add rehype-raw without a
              sanitizer — that would turn this into an XSS sink. The prior DOMPurify wrapper
              passed HTML as markdown source, which only garbled formatting.
            */}
            {message}
          </ReactMarkdown>
        </div>
      )}
      {/* Documents Section */}
      {showDocuments && (
        <Card className="border-slate-200 shadow-md overflow-hidden bg-white">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-500" aria-hidden="true" />
              Generated Documents
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {(error !== null || generationStatus?.startsWith('failed:') === true) ? (
              <div className="text-center py-8 text-destructive p-4">
                <p className="text-sm font-medium">Unable to load documents</p>
                <p className="text-xs mt-1 opacity-80">
                  {generationStatus?.startsWith('failed:') 
                    ? generationStatus.replace('failed:', '') 
                    : error instanceof Error ? error.message : 'Unknown error'}
                </p>
              </div>
            ) : (generationStatus === 'pending' || generationStatus === 'generating') ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                <Loader2 className="w-6 h-6 animate-spin text-primary mb-3" />
                <h3 className="text-sm font-medium text-slate-900">Preparing your documents...</h3>
                <p className="text-xs text-slate-500 mt-1">This usually takes just a moment.</p>
              </div>
            ) : documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                <FileText className="w-6 h-6 text-slate-400 mb-3" />
                <h3 className="text-sm font-medium text-slate-900">No documents configured</h3>
                <p className="text-xs text-slate-500 mt-1">This workflow does not generate any documents.</p>
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
                        <span className="text-xl" role="img" aria-label="Document Type">{getFileIcon(doc.mimeType)}</span>
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
                        <Download className="w-3.5 h-3.5 mr-2" aria-hidden="true" />
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
            {customLinks
              .filter(link => {
                try {
                  const url = new URL(link.url, window.location.origin);
                  return ['http:', 'https:'].includes(url.protocol);
                } catch {
                  return false;
                }
              })
              .map((link, i) => (
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