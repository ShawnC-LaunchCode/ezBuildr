// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FileUploadBlockRenderer } from '../../../client/src/components/runner/blocks/FileUploadBlock';
import type { Step } from '../../../client/src/types';
import type { FileUploadValue } from '../../../shared/types/stepConfigs';

type Listener = () => void;
type ProgressListener = (event: { lengthComputable: boolean; loaded: number; total: number }) => void;

class FakeXMLHttpRequest {
  static latest: FakeXMLHttpRequest | undefined;
  status = 0;
  responseText = '';
  withCredentials = false;
  private listeners = new Map<string, Listener>();
  private progressListener?: ProgressListener;
  upload = {
    addEventListener: (_type: string, listener: ProgressListener) => { this.progressListener = listener; },
  };

  constructor() { FakeXMLHttpRequest.latest = this; }
  open(): void {}
  setRequestHeader(): void {}
  send(): void {}
  addEventListener(type: string, listener: Listener): void { this.listeners.set(type, listener); }
  emitProgress(loaded: number, total: number): void {
    this.progressListener?.({ lengthComputable: true, loaded, total });
  }
  respond(status: number, body: unknown): void {
    this.status = status;
    this.responseText = JSON.stringify(body);
    this.listeners.get('load')?.();
  }
}

const step = {
  id: '55555555-5555-4555-8555-555555555555',
  type: 'file_upload',
  title: 'Upload evidence',
  config: { allowedTypes: ['application/pdf'], maxSize: 1024, maxFiles: 2 },
} as unknown as Step;

describe('FileUploadBlockRenderer', () => {
  const originalXhr = globalThis.XMLHttpRequest;

  beforeEach(() => {
    FakeXMLHttpRequest.latest = undefined;
    globalThis.XMLHttpRequest = FakeXMLHttpRequest as unknown as typeof XMLHttpRequest;
  });

  afterEach(() => {
    cleanup();
    globalThis.XMLHttpRequest = originalXhr;
  });

  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    FakeXMLHttpRequest.latest = undefined;
    globalThis.XMLHttpRequest = FakeXMLHttpRequest as unknown as typeof XMLHttpRequest;
    URL.createObjectURL = vi.fn(() => 'blob:mocked-url');
    URL.revokeObjectURL = vi.fn();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
    globalThis.XMLHttpRequest = originalXhr;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  it('renders drag-and-drop, reports upload progress, and returns stored metadata', async () => {
    const onChange = vi.fn();
    render(
      <FileUploadBlockRenderer
        step={step}
        value={[]}
        onChange={onChange}
        runId="11111111-1111-4111-8111-111111111111"
        runToken="run-token"
      />,
    );

    expect(screen.getByRole('button', { name: /drop files here/i })).toBeInTheDocument();
    const file = new File(['%PDF'], 'evidence.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByTestId('file-upload-input'), { target: { files: [file] } });

    expect(await screen.findByText('Uploading…')).toBeInTheDocument();
    act(() => { FakeXMLHttpRequest.latest?.emitProgress(5, 10); });
    expect(screen.getByText('50%')).toBeInTheDocument();

    const uploaded: FileUploadValue = {
      fileId: 'file-1',
      filename: 'evidence.pdf',
      storageKey: 'tenants/t/runs/r/steps/s/file-1.pdf',
      url: '/api/storage/files/signed',
      mimeType: 'application/pdf',
      size: 4,
      uploadedAt: '2026-08-06T12:00:00.000Z',
    };
    act(() => {
      FakeXMLHttpRequest.latest?.respond(201, { success: true, data: { files: [uploaded], value: [{ ...uploaded, url: undefined }] } });
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ storageKey: uploaded.storageKey })]);
    });
  });

  it('rejects a file that exceeds the configured size before making a request', async () => {
    render(<FileUploadBlockRenderer step={step} value={[]} onChange={vi.fn()} runId="run-1" />);
    const oversized = new File([new Uint8Array(2048)], 'large.pdf', { type: 'application/pdf' });

    fireEvent.change(screen.getByTestId('file-upload-input'), { target: { files: [oversized] } });

    expect(await screen.findByRole('alert')).toHaveTextContent(/exceeds the 1 KB limit/i);
    expect(FakeXMLHttpRequest.latest).toBeUndefined();
  });

  it('rejects a file of an unallowed type', async () => {
    render(<FileUploadBlockRenderer step={step} value={[]} onChange={vi.fn()} runId="run-1" />);
    const invalid = new File(['text'], 'invalid.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByTestId('file-upload-input'), { target: { files: [invalid] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid.txt is not an allowed file type/i);
    expect(FakeXMLHttpRequest.latest).toBeUndefined();
  });

  it('rejects exceeding the maxFiles limit', async () => {
    render(<FileUploadBlockRenderer step={step} value={[]} onChange={vi.fn()} runId="run-1" />);
    const valid1 = new File(['%PDF'], 'f1.pdf', { type: 'application/pdf' });
    const valid2 = new File(['%PDF'], 'f2.pdf', { type: 'application/pdf' });
    const valid3 = new File(['%PDF'], 'f3.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByTestId('file-upload-input'), { target: { files: [valid1, valid2, valid3] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/Maximum 2 files allowed/i);
    expect(FakeXMLHttpRequest.latest).toBeUndefined();
  });

  it('shows uploaded files read-only without an upload dropzone', () => {
    const value: FileUploadValue[] = [{
      fileId: 'file-1',
      filename: 'evidence.pdf',
      storageKey: 'tenants/t/runs/r/steps/s/file-1.pdf',
      mimeType: 'application/pdf',
      size: 4,
      uploadedAt: '2026-08-06T12:00:00.000Z',
    }];
    render(<FileUploadBlockRenderer step={step} value={value} onChange={vi.fn()} readOnly />);

    expect(screen.getByText('evidence.pdf')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /drop files here/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove evidence.pdf/i })).not.toBeInTheDocument();
  });

  it('handles image previews with object URLs and cleanup', async () => {
    const imgStep = { ...step, config: { previewThumbnails: true, allowedTypes: ['image/png'] } };
    const onChange = vi.fn();
    const { rerender, unmount } = render(
      <FileUploadBlockRenderer step={imgStep} value={[]} onChange={onChange} runId="run-1" />
    );

    const file = new File(['img'], 'test.png', { type: 'image/png' });
    fireEvent.change(screen.getByTestId('file-upload-input'), { target: { files: [file] } });

    // Local preview created immediately
    expect(URL.createObjectURL).toHaveBeenCalledWith(file);

    const uploaded: FileUploadValue = {
      fileId: 'file-1',
      filename: 'test.png',
      storageKey: 'preview/test.png',
      mimeType: 'image/png',
      size: 3,
      uploadedAt: new Date().toISOString(),
    };

    act(() => {
      FakeXMLHttpRequest.latest?.respond(201, { success: true, data: { files: [uploaded], value: [uploaded] } });
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });

    rerender(
      <FileUploadBlockRenderer step={imgStep} value={[uploaded]} onChange={onChange} runId="run-1" />
    );

    // Verify image element is rendered with the mocked blob URL
    const img = screen.getByRole('img', { name: /Preview of test.png/i });
    expect(img).toHaveAttribute('src', 'blob:mocked-url');

    // Remove file triggers revoke
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({ ok: true } as Response);
    fireEvent.click(screen.getByRole('button', { name: /Remove test.png/i }));
    
    await waitFor(() => {
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mocked-url');
      expect(onChange).toHaveBeenCalledWith([]);
    });

    unmount(); // Should not crash
  });

  it('fetches signed URLs for existing image values and falls back gracefully', async () => {
    const value: FileUploadValue[] = [{
      fileId: 'file-1',
      filename: 'existing.png',
      storageKey: 'tenants/t/runs/r/steps/s/existing.png',
      mimeType: 'image/png',
      size: 4,
      uploadedAt: '2026-08-06T12:00:00.000Z',
    }];
    const imgStep = { ...step, config: { previewThumbnails: true } };

    // Setup fetch mock for the signed URL
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { url: 'https://signed-url.com/image.png' } }),
    } as Response);

    render(<FileUploadBlockRenderer step={imgStep} value={value} onChange={vi.fn()} runId="run-1" />);

    // Should fetch the signed URL
    await waitFor(() => {
      const img = screen.getByRole('img', { name: /Preview of existing.png/i });
      expect(img).toHaveAttribute('src', 'https://signed-url.com/image.png');
    });

    // Test fallback gracefully
    const fallbackValue: FileUploadValue[] = [{
      fileId: 'file-2',
      filename: 'fail.png',
      storageKey: 'tenants/t/runs/r/steps/s/fail.png',
      mimeType: 'image/png',
      size: 4,
      uploadedAt: '2026-08-06T12:00:00.000Z',
    }];
    
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('Network error'));
    render(<FileUploadBlockRenderer step={imgStep} value={fallbackValue} onChange={vi.fn()} runId="run-1" />);
    
    await waitFor(() => {
      // Should fallback to icon when fetch fails
      expect(screen.getByText('fail.png')).toBeInTheDocument();
      // Error shouldn't crash the renderer
    });
  });
});
