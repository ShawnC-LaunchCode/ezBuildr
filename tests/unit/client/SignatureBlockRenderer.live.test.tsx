// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SignatureBlockRenderer } from '../../../client/src/components/runner/blocks/SignatureBlockRenderer';

import type { Step } from '../../../client/src/types';

const signatureStep = {
  id: '11111111-1111-4111-8111-111111111111',
  type: 'signature_block',
  title: 'Sign agreement',
  config: {
    signerRole: 'Applicant',
    routingOrder: 1,
    provider: 'docusign',
    signerEmail: '{{email}}',
    documents: [{ id: 'document-1', documentId: 'template-1' }],
  },
} as unknown as Step;

describe('SignatureBlockRenderer live DocuSign execution', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts the stored signature step with the current run token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      // Deliberately rejected by the client URL allowlist after the API call;
      // this keeps jsdom from attempting a real navigation.
      signingUrl: 'https://example.invalid/sign',
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <SignatureBlockRenderer
        step={signatureStep}
        runId="22222222-2222-4222-8222-222222222222"
        runToken="run-token"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Sign' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/esign/execute/22222222-2222-4222-8222-222222222222/11111111-1111-4111-8111-111111111111',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ authorization: 'Bearer run-token' }),
          body: '{}',
        })
      );
    });
    expect(await screen.findByText('The signature provider returned an invalid signing URL')).toBeInTheDocument();
  });
});
