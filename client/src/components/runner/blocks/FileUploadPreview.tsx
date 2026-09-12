import { Download, File, FileText, Image as ImageIcon, X } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';

import type { RefObject } from 'react';

import { Button } from '@/components/ui/button';
import { formatFileSize } from '@/lib/formatting';

import type { FileUploadValue } from '@shared/types/stepConfigs';

const PdfUploadThumbnail = lazy(() => import('./PdfUploadThumbnail'));

interface FileUploadPreviewProps {
  file: FileUploadValue;
  url: string | undefined;
  localPdfFile?: globalThis.File;
  runId?: string;
  runToken?: string | null;
  owningStepId: string;
  readOnly?: boolean;
  onDownload: () => void;
  onRemove: () => void;
  onUrlFetched?: (fileId: string, url: string) => void;
}

interface SignedUrlResponse {
  data?: { url?: string };
}

async function fetchSignedUrl(
  runId: string,
  owningStepId: string,
  storageKey: string,
  runToken: string | null | undefined,
  signal: AbortSignal,
): Promise<string | undefined> {
  try {
    const query = new URLSearchParams({ storageKey });
    const response = await fetch(`/api/runs/${runId}/steps/${owningStepId}/files/url?${query.toString()}`, {
      credentials: 'include',
      headers: runToken ? { Authorization: `Bearer ${runToken}` } : undefined,
      signal,
    });
    if (!response.ok) { return undefined; }
    const result = await response.json() as SignedUrlResponse;
    return result.data?.url;
  } catch {
    return undefined;
  }
}

function FileActions({
  file,
  readOnly,
  onDownload,
  onRemove,
}: Pick<FileUploadPreviewProps, 'file' | 'readOnly' | 'onDownload' | 'onRemove'>) {
  return (
    <>
      <Button type="button" variant="ghost" size="icon" onClick={onDownload} aria-label={`Download ${file.filename}`}>
        <Download className="h-4 w-4" aria-hidden="true" />
      </Button>
      {!readOnly && (
        <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label={`Remove ${file.filename}`}>
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      )}
    </>
  );
}

function CompactFileRow({
  file,
  readOnly,
  onDownload,
  onRemove,
  containerRef,
}: Pick<FileUploadPreviewProps, 'file' | 'readOnly' | 'onDownload' | 'onRemove'> & {
  containerRef?: RefObject<HTMLDivElement>;
}) {
  return (
    <div ref={containerRef} className="flex items-center gap-3 rounded-md border bg-muted/30 p-3">
      {file.mimeType === 'application/pdf' ? <FileText className="h-4 w-4" aria-hidden="true" /> :
       file.mimeType.startsWith('image/') ? <ImageIcon className="h-4 w-4" aria-hidden="true" /> :
       <File className="h-4 w-4" aria-hidden="true" />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{file.filename}</p>
        <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
      </div>
      <FileActions
        file={file}
        readOnly={readOnly}
        onDownload={onDownload}
        onRemove={onRemove}
      />
    </div>
  );
}

export function FileUploadPreview({ 
  file, 
  url, 
  localPdfFile,
  runId, 
  runToken, 
  owningStepId, 
  readOnly, 
  onDownload, 
  onRemove,
  onUrlFetched 
}: FileUploadPreviewProps) {
  const isImage = file.mimeType.startsWith('image/');
  const isPdf = file.mimeType === 'application/pdf';
  const [imgError, setImgError] = useState(false);
  const [pdfError, setPdfError] = useState(false);
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const [pdfVisible, setPdfVisible] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(url);
  const previewRef = useRef<HTMLDivElement>(null);
  const previousUrlPropRef = useRef(url);
  const requestControllerRef = useRef<AbortController | undefined>(undefined);
  const fetchingUrlRef = useRef(false);
  const retriedSignedUrlRef = useRef(false);
  const isPersistedFile = runId !== undefined && !file.storageKey.startsWith('preview/');

  // A freshly fetched URL is echoed back through the parent cache. Preserve a
  // completed render when that prop matches the URL already shown locally.
  useEffect(() => {
    if (previousUrlPropRef.current === url) { return; }
    previousUrlPropRef.current = url;
    setImgError(false);
    if (url !== previewUrl) {
      setPdfError(false);
      setPdfLoaded(false);
      setPreviewUrl(url);
    }
  }, [previewUrl, url]);

  useEffect(() => {
    retriedSignedUrlRef.current = false;
  }, [file.fileId]);

  useEffect(() => {
    if (!isPdf || pdfVisible) { return; }
    const target = previewRef.current;
    if (target === null) { return; }
    if (typeof IntersectionObserver === 'undefined') {
      setPdfVisible(true);
      return;
    }

    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setPdfVisible(true); }
    }, { rootMargin: '0px', threshold: 0.01 });
    observer.observe(target);
    return () => { observer.disconnect(); };
  }, [isPdf, pdfVisible]);

  const loadSignedUrl = useCallback(async (): Promise<void> => {
    if (!isPersistedFile || runId === undefined || fetchingUrlRef.current) { return; }
    fetchingUrlRef.current = true;
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    const nextUrl = await fetchSignedUrl(runId, owningStepId, file.storageKey, runToken, controller.signal);
    fetchingUrlRef.current = false;
    if (controller.signal.aborted) { return; }
    if (nextUrl === undefined) {
      if (isPdf) { setPdfError(true); }
      return;
    }
    setPdfError(false);
    setPdfLoaded(false);
    setPreviewUrl(nextUrl);
    onUrlFetched?.(file.fileId, nextUrl);
  }, [file.fileId, file.storageKey, isPdf, isPersistedFile, onUrlFetched, owningStepId, runId, runToken]);

  useEffect(() => {
    const needsUrl = previewUrl === undefined && (isImage || (isPdf && pdfVisible));
    if (needsUrl) { void loadSignedUrl(); }
  }, [isImage, isPdf, loadSignedUrl, pdfVisible, previewUrl]);

  useEffect(() => () => { requestControllerRef.current?.abort(); }, []);

  const handlePdfError = useCallback(() => {
    setPdfLoaded(false);
    if (isPersistedFile && !retriedSignedUrlRef.current) {
      retriedSignedUrlRef.current = true;
      setPreviewUrl(undefined);
      void loadSignedUrl();
      return;
    }
    setPdfError(true);
  }, [isPersistedFile, loadSignedUrl]);

  const showImage = isImage && previewUrl !== undefined && !imgError;
  const showPdf = isPdf && pdfVisible && !pdfError;
  const pdfSource = localPdfFile ?? previewUrl;

  if (showPdf) {
    return (
      <div ref={previewRef} className="overflow-hidden rounded-md border bg-muted/30">
        <div
          className="relative mx-auto aspect-[4/5] w-full max-w-sm overflow-hidden bg-muted"
          role="img"
          aria-label={`Page one preview of ${file.filename}`}
        >
          {!pdfLoaded && (
            <div
              className="absolute inset-0 z-10 flex animate-pulse items-center justify-center bg-muted text-xs text-muted-foreground motion-reduce:animate-none"
              role="status"
            >
              Loading page one…
            </div>
          )}
          {pdfSource !== undefined && (
            <Suspense fallback={null}>
              <PdfUploadThumbnail
                key={localPdfFile === undefined ? previewUrl : `${file.fileId}:${localPdfFile.lastModified}`}
                filename={file.filename}
                source={pdfSource}
                onError={handlePdfError}
                onLoad={() => { setPdfLoaded(true); }}
              />
            </Suspense>
          )}
        </div>
        <div className="flex w-full items-center gap-2 border-t bg-muted/50 p-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" title={file.filename}>{file.filename}</p>
            <p className="text-xs text-muted-foreground">{formatFileSize(file.size)} · Page 1</p>
          </div>
          <FileActions
            file={file}
            readOnly={readOnly}
            onDownload={onDownload}
            onRemove={onRemove}
          />
        </div>
      </div>
    );
  }

  if (!showImage) {
    return (
      <CompactFileRow
        file={file}
        readOnly={readOnly}
        onDownload={onDownload}
        onRemove={onRemove}
        containerRef={previewRef}
      />
    );
  }

  return (
    <div className="relative flex flex-col overflow-hidden rounded-md border bg-muted/30 p-0">
      <div className="relative aspect-video w-full bg-black/5 flex items-center justify-center">
        <img
          src={previewUrl}
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
        <FileActions file={file} readOnly={readOnly} onDownload={onDownload} onRemove={onRemove} />
      </div>
    </div>
  );
}
