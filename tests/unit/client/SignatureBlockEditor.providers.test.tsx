// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  DocumentsSection,
  ProviderSection,
} from '../../../client/src/components/builder/cards/SignatureBlockEditor.components';

import type { SignatureBlockConfig } from '@shared/types/stepConfigs';

const config: SignatureBlockConfig = {
  signerRole: 'Applicant',
  routingOrder: 1,
  documents: [],
  provider: 'docusign',
};

describe('SignatureBlockEditor provider options', () => {
  it('offers the production DocuSign provider', () => {
    const onUpdate = vi.fn();

    render(<ProviderSection config={config} onUpdate={onUpdate} />);

    const providerSelect = screen.getByRole('combobox');
    const docusignOption = screen.getByRole('option', { name: 'DocuSign' });

    expect(providerSelect).toHaveValue('docusign');
    expect(docusignOption).toBeEnabled();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('adds an unselected document without persisting a placeholder ID', () => {
    const onUpdate = vi.fn();

    render(<DocumentsSection config={config} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Document' }));

    expect(onUpdate).toHaveBeenCalledWith({
      documents: [
        expect.objectContaining({ documentId: '' }),
      ],
    });
  });
});
