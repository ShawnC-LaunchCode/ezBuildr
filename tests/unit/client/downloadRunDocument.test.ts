// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadRunDocument } from '../../../client/src/lib/vault-api';

function stubFetch(status: number) {
  const fetchMock = vi.fn(() => Promise.resolve(new Response(status === 200 ? 'PK-docx-bytes' : '{}', { status })));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  // jsdom has no object-URL support; the download path needs both.
  vi.stubGlobal('URL', Object.assign(URL, {
    createObjectURL: vi.fn(() => 'blob:mock'),
    revokeObjectURL: vi.fn(),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('downloadRunDocument', () => {
  // 2026-09-15: an anonymous respondent's completion screen could not download
  // its documents -- the route needs a Bearer run token and a link sends none.
  it('authenticates with the run token when one is given', async () => {
    const fetchMock = stubFetch(200);
    await downloadRunDocument('run-1', 'directive.docx', 'run-token-1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/api/runs/run-1/final-documents/directive.docx/download');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer run-token-1');
  });

  it('treats a 401 with a run token as final: no session renewal, no retry', async () => {
    const fetchMock = stubFetch(401);
    await expect(downloadRunDocument('run-1', 'directive.docx', 'run-token-1')).rejects.toThrow(/HTTP 401/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
