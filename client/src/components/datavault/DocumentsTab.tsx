import { useQuery } from "@tanstack/react-query";
import { FileText, Loader2, AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { datavaultAPI } from "@/lib/datavault-api";

interface GeneratedDocument {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType?: string;
  fileSize?: number;
  unresolvedVariables?: string[];
  pdfFailed?: boolean;
}

export function DocumentsTab({ runId }: { runId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["runs", runId, "documents"],
    queryFn: async () => {
      // Re-use vault-api function if it exists or use fetch
      const res = await fetch(`/api/runs/${runId}/documents`);
      if (!res.ok) {
        if (res.status === 404) return null; // Not a run
        throw new Error("Failed to fetch documents");
      }
      return res.json() as Promise<{ documents: GeneratedDocument[], generationStatus?: string }>;
    },
    retry: false
  });

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        No documents generated for this row, or this row is not a workflow run.
      </div>
    );
  }

  const { documents, generationStatus } = data;

  if (generationStatus === 'pending' || generationStatus === 'generating') {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Documents are currently being generated...
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        No documents found.
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {documents.map((doc) => (
        <div key={doc.id} className="p-4 border rounded-lg bg-card text-card-foreground shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 font-medium">
              <FileText className="h-4 w-4 text-muted-foreground" />
              {doc.fileName}
            </div>
            {doc.pdfFailed && (
              <Badge variant="destructive" className="text-xs">PDF Failed</Badge>
            )}
          </div>
          <div className="text-sm text-muted-foreground mb-4">
            {doc.fileSize ? `${(doc.fileSize / 1024).toFixed(1)} KB` : "Unknown size"} 
          </div>

          {doc.unresolvedVariables && doc.unresolvedVariables.length > 0 && (
            <Alert variant="destructive" className="mt-2">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Missing Variables</AlertTitle>
              <AlertDescription className="text-xs">
                The following tags in the template were not provided in the workflow payload:
                <div className="flex flex-wrap gap-1 mt-2">
                  {doc.unresolvedVariables.map((v, i) => (
                    <Badge key={i} variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 font-mono text-[10px]">
                      {v}
                    </Badge>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          )}

          <div className="mt-4 flex justify-end">
            <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
              Download Document
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}
