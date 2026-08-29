import { Image as ImageIcon, File, FileText, Download, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { formatFileSize } from '@/lib/formatting';
import type { FileUploadValue } from '@shared/types/stepConfigs';

interface FileUploadPreviewProps {
  file: FileUploadValue;
  url: string | undefined;
  runId?: string;
  runToken?: string | null;
  owningStepId: string;
  readOnly?: boolean;
  onDownload: () => void;
  onRemove: () => void;
  onUrlFetched?: (fileId: string, url: string) => void;
}

export function FileUploadPreview({ 
  file, 
  url, 
  runId, 
  runToken, 
  owningStepId, 
  readOnly, 
  onDownload, 
  onRemove,
  onUrlFetched 
}: FileUploadPreviewProps) {
  const isImage = file.mimeType.startsWith('image/');
  const [imgError, setImgError] = useState(false);

  // Re-evaluate error state if the URL changes
  useEffect(() => {
    setImgError(false);
  }, [url]);

  // Fetch signed URL if we don't have one and we need one for the preview
  useEffect(() => {
    if (isImage && url === undefined && runId !== undefined && !file.storageKey.startsWith('preview/')) {
      let active = true;
      const query = new URLSearchParams({ storageKey: file.storageKey });
      fetch(`/api/runs/${runId}/steps/${owningStepId}/files/url?${query.toString()}`, {
        credentials: 'include',
        headers: runToken ? { Authorization: `Bearer ${runToken}` } : undefined,
      })
      .then(res => res.json() as Promise<{ data?: { url?: string } }>)
      .then(result => {
        if (active && result.data?.url) {
          onUrlFetched?.(file.fileId, result.data.url);
        }
      })
      .catch(() => {
        // Silently fail preview fetch, fallback to normal icon
      });
      return () => { active = false; };
    }
  }, [isImage, url, runId, file.storageKey, owningStepId, runToken, file.fileId, onUrlFetched]);

  const showImage = isImage && url !== undefined && !imgError;

  return (
    <div className={`relative flex ${showImage ? 'flex-col overflow-hidden' : 'items-center gap-3'} rounded-md border bg-muted/30 ${showImage ? 'p-0' : 'p-3'}`}>
      {showImage ? (
        <>
          <div className="relative aspect-video w-full bg-black/5 flex items-center justify-center">
            <img 
              src={url} 
              alt={`Preview of ${file.filename}`}
              className="object-contain w-full h-full"
              onError={() => setImgError(true)}
            />
          </div>
          <div className="flex items-center gap-2 p-3 w-full bg-muted/50 border-t">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" title={file.filename}>{file.filename}</p>
              <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={onDownload} aria-label={`Download ${file.filename}`}>
              <Download className="h-4 w-4" aria-hidden="true" />
            </Button>
            {!readOnly && (
              <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label={`Remove ${file.filename}`}>
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          {file.mimeType === 'application/pdf' ? <FileText className="h-4 w-4" aria-hidden="true" /> : 
           file.mimeType.startsWith('image/') ? <ImageIcon className="h-4 w-4" aria-hidden="true" /> :
           <File className="h-4 w-4" aria-hidden="true" />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.filename}</p>
            <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onDownload} aria-label={`Download ${file.filename}`}>
            <Download className="h-4 w-4" aria-hidden="true" />
          </Button>
          {!readOnly && (
            <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label={`Remove ${file.filename}`}>
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </>
      )}
    </div>
  );
}
