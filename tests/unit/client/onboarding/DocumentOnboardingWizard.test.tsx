// @vitest-environment jsdom
/**
 * Document onboarding wizard (GH-167) — AC4: error handling.
 *
 * AI timeouts and provider failures at the "generate workflow" step must
 * surface a retryable inline error rather than a blank screen or an
 * unhandled rejection, and clicking "Try again" must retry the same
 * request rather than requiring the author to redo the review step.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import DocumentOnboardingWizard from '../../../../client/src/pages/onboarding/DocumentOnboardingWizard';

const navigate = vi.fn();

vi.mock('wouter', () => ({
  useLocation: () => ['/workflows/onboarding', navigate],
}));

vi.mock('../../../../client/src/lib/vault-hooks', () => ({
  useProjects: () => ({
    data: [{ id: 'p1', title: 'Estate Planning' }],
  }),
}));

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => undefined;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined;
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const ANALYZE_RESULT = {
  data: {
    variables: [
      { name: 'client_name', confidence: 0.9, source: 'explicit_tag', type: 'text' },
    ],
    suggestions: [],
  },
};

function docxFile(): File {
  return new File(['docx-bytes'], 'intake.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

/** Routes every network call this wizard makes by URL substring. */
function mockFetch(generateResult: { ok: boolean; status?: number; body: unknown }) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/ai/doc/analyze')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(ANALYZE_RESULT) } as Response);
    }
    if (url.includes('/api/ai/doc/suggest-improvements')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { aliases: {} } }) } as Response);
    }
    if (url.includes('/api/ai/doc/onboarding/generate-workflow')) {
      return Promise.resolve({
        ok: generateResult.ok,
        status: generateResult.status ?? (generateResult.ok ? 200 : 500),
        json: () => Promise.resolve(generateResult.body),
      } as Response);
    }
    return Promise.reject(new Error(`Unexpected fetch call: ${url}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function driveToReview(user: ReturnType<typeof userEvent.setup>) {
  const input = screen.getByLabelText('Document');
  await user.upload(input, docxFile());
  await screen.findByRole('heading', { name: 'Review & approve' });

  await user.click(screen.getByRole('combobox', { name: /project/i }));
  await user.click(await screen.findByRole('option', { name: 'Estate Planning' }));
}

describe('DocumentOnboardingWizard (GH-167 AC4)', () => {
  it('shows a retryable inline error when workflow generation fails, without crashing', async () => {
    const fetchMock = mockFetch({
      ok: false,
      status: 504,
      body: { error: 'AI request timed out. Please try again.', retryable: true },
    });
    const user = userEvent.setup();
    render(<DocumentOnboardingWizard />);

    await driveToReview(user);
    await user.click(screen.getByRole('button', { name: /Approve & generate workflow/ }));

    const alert = await screen.findByText('Workflow generation failed');
    expect(alert).toBeInTheDocument();
    expect(screen.getByText('AI request timed out. Please try again.')).toBeInTheDocument();

    // Still on the review step -- nothing was persisted, no dead-end screen.
    expect(screen.getByRole('button', { name: /Approve & generate workflow/ })).toBeInTheDocument();

    const retryButton = screen.getByRole('button', { name: /Try again/ });
    expect(retryButton).toBeInTheDocument();

    const callsBeforeRetry = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/onboarding/generate-workflow')
    ).length;
    await user.click(retryButton);

    await waitFor(() => {
      const callsAfterRetry = fetchMock.mock.calls.filter((c) =>
        String(c[0]).includes('/onboarding/generate-workflow')
      ).length;
      expect(callsAfterRetry).toBe(callsBeforeRetry + 1);
    });
  });

  it('does not offer retry for a non-retryable failure (e.g. validation error)', async () => {
    mockFetch({
      ok: false,
      status: 422,
      body: { error: 'AI generated invalid structure.', retryable: false },
    });
    const user = userEvent.setup();
    render(<DocumentOnboardingWizard />);

    await driveToReview(user);
    await user.click(screen.getByRole('button', { name: /Approve & generate workflow/ }));

    await screen.findByText('AI generated invalid structure.');
    expect(screen.queryByRole('button', { name: /Try again/ })).toBeNull();
  });
});
