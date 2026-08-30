// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reactPdfMock = vi.hoisted(() => ({
  documentFiles: [] as unknown[],
  failures: new Map<string, 'load' | 'password'>(),
  pageNumbers: [] as number[],
  workerOptions: { workerSrc: '' },
}));

vi.mock('react-pdf', async () => {
  const React = await import('react');
  type ReactNode = import('react').ReactNode;

  interface DocumentProps {
    children?: ReactNode;
    file?: unknown;
    onLoadError?: (error: Error) => void;
    onLoadSuccess?: (result: { numPages: number }) => void;
    onPassword?: (callback: (password: string) => void, reason: number) => void;
  }

  interface PageProps {
    onRenderSuccess?: () => void;
    pageNumber: number;
  }

  function Document(props: DocumentProps) {
    const propsRef = React.useRef(props);
    propsRef.current = props;
    const file = props.file;
    React.useEffect(() => {
      reactPdfMock.documentFiles.push(file);
      const failure = reactPdfMock.failures.get(String(file));
      if (failure === 'load') {
        propsRef.current.onLoadError?.(new Error('PDF load failed'));
      } else if (failure === 'password') {
        propsRef.current.onPassword?.(() => undefined, 1);
      } else {
        propsRef.current.onLoadSuccess?.({ numPages: 3 });
      }
    }, [file]);
    return React.createElement('div', { 'data-testid': 'pdf-document' }, props.children);
  }

  function Page(props: PageProps) {
    const onRenderSuccessRef = React.useRef(props.onRenderSuccess);
    onRenderSuccessRef.current = props.onRenderSuccess;
    React.useEffect(() => {
      reactPdfMock.pageNumbers.push(props.pageNumber);
      onRenderSuccessRef.current?.();
    }, [props.pageNumber]);
    return React.createElement('canvas', { 'data-testid': 'pdf-page' });
  }

  return {
    Document,
    Page,
    pdfjs: { GlobalWorkerOptions: reactPdfMock.workerOptions },
  };
});

import { FileUploadBlockRenderer } from '../../../client/src/components/runner/blocks/FileUploadBlock';
import type { Step } from '../../../client/src/types';
import type { FileUploadValue } from '../../../shared/types/stepConfigs';

type Listener = () => void;
type ProgressListener = (event: { lengthComputable: boolean; loaded: number; total: number }) => void;

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly root = null;
  readonly rootMargin = '0px';
  readonly thresholds = [0.01];
  private target?: Element;

  constructor(private readonly callback: IntersectionObserverCallback) {
    FakeIntersectionObserver.instances.push(this);
  }

  disconnect(): void {}
  observe(target: Element): void { this.target = target; }
  takeRecords(): IntersectionObserverEntry[] { return []; }
  unobserve(): void {}
  trigger(isIntersecting = true): void {
    if (this.target === undefined) { throw new Error('Intersection target was not observed'); }
    this.callback([{
      boundingClientRect: this.target.getBoundingClientRect(),
      intersectionRatio: isIntersecting ? 1 : 0,
      intersectionRect: this.target.getBoundingClientRect(),
      isIntersecting,
      rootBounds: null,
      target: this.target,
      time: performance.now(),
    }], this as unknown as IntersectionObserver);
  }
}

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
  const originalIntersectionObserver = globalThis.IntersectionObserver;

  beforeEach(() => {
    FakeXMLHttpRequest.latest = undefined;
    FakeIntersectionObserver.instances = [];
    reactPdfMock.documentFiles = [];
    reactPdfMock.failures.clear();
    reactPdfMock.pageNumbers = [];
    globalThis.IntersectionObserver = FakeIntersectionObserver as unknown as typeof IntersectionObserver;
    globalThis.XMLHttpRequest = FakeXMLHttpRequest as unknown as typeof XMLHttpRequest;
  });

  afterEach(() => {
    cleanup();
    globalThis.IntersectionObserver = originalIntersectionObserver;
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

  it('lazily renders only page one from a local PDF file with an accessible bounded preview', async () => {
    const pdfStep = { ...step, config: { previewThumbnails: true } };
    const onChange = vi.fn();
    const localPdf = new File([new Uint8Array(1024)], 'local-evidence.pdf', { type: 'application/pdf' });

    const { rerender } = render(<FileUploadBlockRenderer step={pdfStep} value={[]} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('file-upload-input'), { target: { files: [localPdf] } });
    await waitFor(() => { expect(onChange).toHaveBeenCalledTimes(1); });
    const value = vi.mocked(onChange).mock.calls[0]?.[0] as FileUploadValue[];
    rerender(<FileUploadBlockRenderer step={pdfStep} value={value} onChange={onChange} />);

    expect(reactPdfMock.documentFiles).toEqual([]);
    expect(screen.queryByRole('img', { name: /page one preview of local-evidence\.pdf/i })).not.toBeInTheDocument();

    act(() => { FakeIntersectionObserver.instances[0]?.trigger(); });

    expect(await screen.findByRole('img', { name: /page one preview of local-evidence\.pdf/i })).toHaveClass('max-w-sm');
    await waitFor(() => { expect(screen.queryByRole('status')).not.toBeInTheDocument(); });
    expect(reactPdfMock.documentFiles).toEqual([localPdf]);
    expect(reactPdfMock.pageNumbers).toEqual([1]);
    expect(screen.getByText('1 KB · Page 1')).toBeInTheDocument();
  });

  it('does not fetch twenty persisted PDFs before an individual preview becomes visible', async () => {
    const values: FileUploadValue[] = Array.from({ length: 20 }, (_, index) => ({
      fileId: `pdf-${index}`,
      filename: `evidence-${index}.pdf`,
      storageKey: `tenants/t/runs/r/steps/s/evidence-${index}.pdf`,
      mimeType: 'application/pdf',
      size: 1024,
      uploadedAt: '2026-08-29T12:00:00.000Z',
    }));
    const pdfStep = { ...step, config: { previewThumbnails: true, maxFiles: 20 } };
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { url: 'https://signed.example/visible.pdf' } }),
    } as Response);

    render(<FileUploadBlockRenderer step={pdfStep} value={values} onChange={vi.fn()} runId="run-1" />);

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(reactPdfMock.documentFiles).toEqual([]);
    expect(FakeIntersectionObserver.instances).toHaveLength(20);

    act(() => { FakeIntersectionObserver.instances[7]?.trigger(); });

    await waitFor(() => { expect(globalThis.fetch).toHaveBeenCalledTimes(1); });
    expect(String(vi.mocked(globalThis.fetch).mock.calls[0]?.[0])).toContain('evidence-7.pdf');
    await waitFor(() => { expect(reactPdfMock.documentFiles).toEqual(['https://signed.example/visible.pdf']); });
  });

  it('refreshes an expired signed PDF URL once and renders the replacement URL', async () => {
    const value: FileUploadValue[] = [{
      fileId: 'expired-pdf',
      filename: 'expired.pdf',
      storageKey: 'tenants/t/runs/r/steps/s/expired.pdf',
      url: 'https://signed.example/expired.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      uploadedAt: '2026-08-29T12:00:00.000Z',
    }];
    const pdfStep = { ...step, config: { previewThumbnails: true } };
    reactPdfMock.failures.set('https://signed.example/expired.pdf', 'load');
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { url: 'https://signed.example/fresh.pdf' } }),
    } as Response);

    render(<FileUploadBlockRenderer step={pdfStep} value={value} onChange={vi.fn()} runId="run-1" />);
    act(() => { FakeIntersectionObserver.instances[0]?.trigger(); });

    await waitFor(() => {
      expect(reactPdfMock.documentFiles).toEqual([
        'https://signed.example/expired.pdf',
        'https://signed.example/fresh.pdf',
      ]);
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(reactPdfMock.pageNumbers).toEqual([1, 1]);
    await waitFor(() => { expect(screen.queryByRole('status')).not.toBeInTheDocument(); });
  });

  it('falls back when an expired signed PDF URL cannot be refreshed', async () => {
    const value: FileUploadValue[] = [{
      fileId: 'unrefreshable-pdf',
      filename: 'unrefreshable.pdf',
      storageKey: 'tenants/t/runs/r/steps/s/unrefreshable.pdf',
      url: 'https://signed.example/unrefreshable-expired.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      uploadedAt: '2026-08-29T12:00:00.000Z',
    }];
    const pdfStep = { ...step, config: { previewThumbnails: true } };
    const unhandled = vi.fn();
    window.addEventListener('unhandledrejection', unhandled);
    reactPdfMock.failures.set('https://signed.example/unrefreshable-expired.pdf', 'load');
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'Signed URL expired' }),
    } as Response);

    render(<FileUploadBlockRenderer step={pdfStep} value={value} onChange={vi.fn()} runId="run-1" />);
    act(() => { FakeIntersectionObserver.instances[0]?.trigger(); });

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('img', { name: /page one preview of unrefreshable\.pdf/i })).not.toBeInTheDocument();
      expect(screen.getByText('unrefreshable.pdf')).toBeInTheDocument();
    });
    await Promise.resolve();
    expect(unhandled).not.toHaveBeenCalled();
    window.removeEventListener('unhandledrejection', unhandled);
  });

  it.each([
    ['corrupt', 'load'],
    ['password-protected', 'password'],
  ] as const)('falls back to the compact row for a %s local PDF without an unhandled rejection', async (name, failure) => {
    const url = `blob:${name}`;
    const value: FileUploadValue[] = [{
      fileId: `${name}-pdf`,
      filename: `${name}.pdf`,
      storageKey: `preview/${name}.pdf`,
      url,
      mimeType: 'application/pdf',
      size: 1024,
      uploadedAt: '2026-08-29T12:00:00.000Z',
    }];
    const pdfStep = { ...step, config: { previewThumbnails: true } };
    const unhandled = vi.fn();
    window.addEventListener('unhandledrejection', unhandled);
    reactPdfMock.failures.set(url, failure);

    render(<FileUploadBlockRenderer step={pdfStep} value={value} onChange={vi.fn()} />);
    act(() => { FakeIntersectionObserver.instances[0]?.trigger(); });

    await waitFor(() => {
      expect(screen.queryByRole('img', { name: new RegExp(`page one preview of ${name}`) })).not.toBeInTheDocument();
      expect(screen.getByText(`${name}.pdf`)).toBeInTheDocument();
    });
    await Promise.resolve();
    expect(unhandled).not.toHaveBeenCalled();
    window.removeEventListener('unhandledrejection', unhandled);
  });

  it('falls back after a signed-URL network error without an unhandled rejection', async () => {
    const value: FileUploadValue[] = [{
      fileId: 'network-pdf',
      filename: 'network.pdf',
      storageKey: 'tenants/t/runs/r/steps/s/network.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      uploadedAt: '2026-08-29T12:00:00.000Z',
    }];
    const pdfStep = { ...step, config: { previewThumbnails: true } };
    const unhandled = vi.fn();
    window.addEventListener('unhandledrejection', unhandled);
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('Network error'));

    render(<FileUploadBlockRenderer step={pdfStep} value={value} onChange={vi.fn()} runId="run-1" />);
    act(() => { FakeIntersectionObserver.instances[0]?.trigger(); });

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('img', { name: /page one preview of network\.pdf/i })).not.toBeInTheDocument();
      expect(screen.getByText('network.pdf')).toBeInTheDocument();
    });
    await Promise.resolve();
    expect(unhandled).not.toHaveBeenCalled();
    window.removeEventListener('unhandledrejection', unhandled);
  });

  it('keeps PDFs in the compact row when preview thumbnails are disabled', () => {
    const value: FileUploadValue[] = [{
      fileId: 'disabled-pdf',
      filename: 'disabled.pdf',
      storageKey: 'tenants/t/runs/r/steps/s/disabled.pdf',
      url: 'https://signed.example/disabled.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      uploadedAt: '2026-08-29T12:00:00.000Z',
    }];

    render(<FileUploadBlockRenderer step={step} value={value} onChange={vi.fn()} runId="run-1" />);

    expect(screen.getByText('disabled.pdf')).toBeInTheDocument();
    expect(FakeIntersectionObserver.instances).toHaveLength(0);
    expect(reactPdfMock.documentFiles).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
