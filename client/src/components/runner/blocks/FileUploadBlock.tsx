import { Download, File, FileText, Image, Upload, X } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { formatFileSize } from '@/lib/formatting';
import type { Step } from '@/types';

import type { FileUploadConfig, FileUploadValue } from '@shared/types/stepConfigs';

interface FileUploadBlockProps {
  step: Step;
  value: unknown;
  onChange: (value: FileUploadValue[]) => void;
  runId?: string;
  runToken?: string | null;
  /** Top-level owning step when this control is nested inside a List. */
  runStepId?: string;
  readOnly?: boolean;
  ariaDescribedBy?: string;
  required?: boolean;
  hasError?: boolean;
}

interface UploadResponse {
  success: boolean;
  data?: { files: FileUploadValue[]; value?: FileUploadValue[] };
  error?: string;
}

function normalizeValue(value: unknown): FileUploadValue[] {
  const candidates = Array.isArray(value) ? value : value === null || value === undefined ? [] : [value];
  return candidates.filter((candidate): candidate is FileUploadValue => (
    typeof candidate === 'object'
    && candidate !== null
    && typeof (candidate as Partial<FileUploadValue>).fileId === 'string'
    && typeof (candidate as Partial<FileUploadValue>).storageKey === 'string'
  ));
}

function acceptsFile(file: globalThis.File, allowedTypes: string[] | undefined): boolean {
  if (!allowedTypes?.length) { return true; }
  return allowedTypes.some(type => {
    if (type.endsWith('/*')) { return file.type.startsWith(type.slice(0, -1)); }
    if (type.startsWith('.')) { return file.name.toLowerCase().endsWith(type.toLowerCase()); }
    return file.type === type;
  });
}

function withoutTransientUrl(file: FileUploadValue): FileUploadValue {
  const { url: _url, ...stored } = file;
  return stored;
}

function fileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) { return <Image className="h-4 w-4" aria-hidden="true" />; }
  if (mimeType === 'application/pdf') { return <FileText className="h-4 w-4" aria-hidden="true" />; }
  return <File className="h-4 w-4" aria-hidden="true" />;
}

function parseUploadResponse(xhr: XMLHttpRequest): UploadResponse {
  try {
    return JSON.parse(xhr.responseText) as UploadResponse;
  } catch {
    return { success: false, error: 'The server returned an invalid upload response.' };
  }
}

function mergeFreshUrls(current: Record<string, string>, files: FileUploadValue[]): Record<string, string> {
  const next = { ...current };
  for (const file of files) {
    if (file.url !== undefined) { next[file.fileId] = file.url; }
  }
  return next;
}

export function FileUploadBlockRenderer({
  step,
  value,
  onChange,
  runId,
  runToken,
  runStepId,
  readOnly = false,
  ariaDescribedBy,
  required,
  hasError,
}: FileUploadBlockProps) {
  const config = (step.config ?? {}) as FileUploadConfig;
  const files = useMemo(() => normalizeValue(value), [value]);
  const maxFiles = config.maxFiles ?? 1;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>();
  const [freshUrls, setFreshUrls] = useState<Record<string, string>>({});
  const owningStepId = runStepId ?? step.id;
  const nestedFieldId = owningStepId === step.id ? undefined : step.id;

  const validateSelection = useCallback((selected: globalThis.File[]): string | undefined => {
    if (files.length + selected.length > maxFiles) {
      return `Maximum ${maxFiles} file${maxFiles === 1 ? '' : 's'} allowed.`;
    }
    const tooLarge = selected.find(file => config.maxSize !== undefined && file.size > config.maxSize);
    if (tooLarge) {
      return `${tooLarge.name} exceeds the ${formatFileSize(config.maxSize ?? 0)} limit.`;
    }
    const rejected = selected.find(file => !acceptsFile(file, config.allowedTypes));
    if (rejected) {
      return `${rejected.name} is not an allowed file type.`;
    }
    return undefined;
  }, [config.allowedTypes, config.maxSize, files.length, maxFiles]);

  const uploadSelected = useCallback(async (selected: globalThis.File[]): Promise<void> => {
    const validationError = validateSelection(selected);
    setError(validationError);
    if (validationError !== undefined || selected.length === 0) { return; }

    if (!runId) {
      const previewFiles = selected.map(file => {
        const fileId = crypto.randomUUID();
        return {
          fileId,
          filename: file.name,
          storageKey: `preview/${fileId}`,
          url: URL.createObjectURL(file),
          mimeType: file.type === '' ? 'application/octet-stream' : file.type,
          size: file.size,
          uploadedAt: new Date().toISOString(),
        } satisfies FileUploadValue;
      });
      setFreshUrls(current => mergeFreshUrls(current, previewFiles));
      onChange([...files, ...previewFiles.map(withoutTransientUrl)]);
      return;
    }

    setUploading(true);
    setProgress(0);
    try {
      const result = await new Promise<UploadResponse>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `/api/runs/${runId}/steps/${owningStepId}/files`);
        xhr.withCredentials = true;
        if (runToken) { xhr.setRequestHeader('Authorization', `Bearer ${runToken}`); }
        xhr.upload.addEventListener('progress', event => {
          if (event.lengthComputable) { setProgress(Math.round((event.loaded / event.total) * 100)); }
        });
        xhr.addEventListener('load', () => {
          const response = parseUploadResponse(xhr);
          if (xhr.status >= 200 && xhr.status < 300 && response.success) { resolve(response); }
          else { reject(new Error(response.error ?? 'Upload failed.')); }
        });
        xhr.addEventListener('error', () => { reject(new Error('Upload failed.')); });
        const formData = new FormData();
        selected.forEach(file => formData.append('files', file));
        if (nestedFieldId) { formData.append('fieldId', nestedFieldId); }
        xhr.send(formData);
      });

      const uploaded = result.data?.files ?? [];
      setFreshUrls(current => mergeFreshUrls(current, uploaded));
      onChange(result.data?.value ?? [...files, ...uploaded.map(withoutTransientUrl)]);
      setProgress(100);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }, [files, nestedFieldId, onChange, owningStepId, runId, runToken, validateSelection]);

  const removeFile = async (file: FileUploadValue): Promise<void> => {
    setError(undefined);
    if (runId && !file.storageKey.startsWith('preview/')) {
      const response = await fetch(`/api/runs/${runId}/steps/${owningStepId}/files`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(runToken ? { Authorization: `Bearer ${runToken}` } : {}),
        },
        body: JSON.stringify({ storageKey: file.storageKey }),
      });
      if (!response.ok) {
        setError('The file could not be removed. Please try again.');
        return;
      }
    }
    onChange(files.filter(candidate => candidate.fileId !== file.fileId));
  };

  const downloadFile = async (file: FileUploadValue): Promise<void> => {
    let url = freshUrls[file.fileId] ?? file.url;
    if (!url && runId) {
      const query = new URLSearchParams({ storageKey: file.storageKey });
      const response = await fetch(`/api/runs/${runId}/steps/${owningStepId}/files/url?${query.toString()}`, {
        credentials: 'include',
        headers: runToken ? { Authorization: `Bearer ${runToken}` } : undefined,
      });
      const result = await response.json() as { data?: { url?: string }; error?: string };
      if (!response.ok || !result.data?.url) {
        setError(result.error ?? 'The file could not be opened.');
        return;
      }
      const signedUrl = result.data.url;
      url = signedUrl;
      setFreshUrls(current => ({ ...current, [file.fileId]: signedUrl }));
    }
    if (url) { window.open(url, '_blank', 'noopener,noreferrer'); }
  };

  const canUpload = !readOnly && !uploading && files.length < maxFiles;
  return (
    <div className="space-y-3" data-testid="file-upload-block">
      {canUpload && (
        <button
          type="button"
          className={`flex w-full flex-col items-center rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors ${dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/60'}`}
          onClick={() => inputRef.current?.click()}
          onDragEnter={event => { event.preventDefault(); setDragging(true); }}
          onDragOver={event => { event.preventDefault(); setDragging(true); }}
          onDragLeave={event => { event.preventDefault(); setDragging(false); }}
          onDrop={event => {
            event.preventDefault();
            setDragging(false);
            void uploadSelected(Array.from(event.dataTransfer.files));
          }}
          aria-describedby={ariaDescribedBy}
        >
          <Upload className="mb-2 h-7 w-7 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-medium">Drop files here or choose files</span>
          <span className="mt-1 text-xs text-muted-foreground">
            {config.allowedTypes?.length ? config.allowedTypes.join(', ') : 'Documents and images'}
            {config.maxSize ? ` · up to ${formatFileSize(config.maxSize)}` : ''}
          </span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        multiple={maxFiles > 1}
        accept={config.allowedTypes?.join(',')}
        aria-label={`Upload files for ${step.title}`}
        aria-describedby={ariaDescribedBy}
        aria-required={required ?? undefined}
        aria-invalid={hasError ?? undefined}
        onChange={event => {
          void uploadSelected(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
        data-testid="file-upload-input"
      />

      {uploading && (
        <div className="space-y-1" aria-live="polite">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Uploading…</span><span>{progress}%</span>
          </div>
          <Progress value={progress} />
        </div>
      )}

      {files.map(file => (
        <div key={file.fileId} className="flex items-center gap-3 rounded-md border bg-muted/30 p-3">
          {fileIcon(file.mimeType)}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.filename}</p>
            <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => { void downloadFile(file); }} aria-label={`Download ${file.filename}`}>
            <Download className="h-4 w-4" aria-hidden="true" />
          </Button>
          {!readOnly && (
            <Button type="button" variant="ghost" size="icon" onClick={() => { void removeFile(file); }} aria-label={`Remove ${file.filename}`}>
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      ))}

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    </div>
  );
}
