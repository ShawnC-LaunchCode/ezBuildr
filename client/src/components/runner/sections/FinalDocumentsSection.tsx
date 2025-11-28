/**
 * Final Documents Section - Runner View
 * Displays generated documents for download
 */

import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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

  // Fetch generated documents for this run
  const { data: documents = [], isLoading, error } = useQuery({
    queryKey: ["run-documents", runId],
    queryFn: async () => {
      const headers: Record<string, string> = {};
      if (runToken) {
        headers['Authorization'] = `Bearer ${runToken}`;
      }
      const response = await axios.get<{ documents: GeneratedDocument[] }>(`/api/runs/${runId}/documents`, { headers });
      return response.data.documents;
    },
    refetchInterval: (data) => {
      // If no documents yet, refetch every 2 seconds until they're ready
      if (!data || data.length === 0) {
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
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {markdownMessage}
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
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-8 space-y-4">
              {isLoading ? (
                <>
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Generating your documents...
                  </p>
                  <p className="text-xs text-muted-foreground">
                    This may take a few moments
                  </p>
                </>
              ) : (
                <>
                  <FileText className="w-12 h-12 mx-auto text-muted-foreground opacity-50" />
                  <p className="text-sm font-medium">Ready to generate your documents</p>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    Click the <strong>"Complete"</strong> button below to finish this workflow and generate your documents.
                  </p>
                </>
              )}
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
