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
});
