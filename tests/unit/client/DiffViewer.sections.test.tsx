// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const diffVersions = vi.hoisted(() => vi.fn());

vi.mock('@/lib/vault-api', () => ({
  versionAPI: { diff: diffVersions },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import { DiffViewer } from '../../../client/src/components/builder/versioning/DiffViewer';

describe('DiffViewer Section and Page labels', () => {
  it('renders distinct Section and Page counters and lists from the API diff', async () => {
    diffVersions.mockResolvedValue({
      sections: [{ id: 'section-1234', title: 'Applicant details', changeType: 'added' }],
      pages: [{ id: 'page-1234', title: 'Contact information', changeType: 'removed' }],
      steps: [],
      summary: {
        sectionsAdded: 1,
        sectionsRemoved: 0,
        sectionsModified: 0,
        pagesAdded: 0,
        pagesRemoved: 1,
        pagesModified: 0,
        stepsAdded: 0,
        stepsRemoved: 0,
        stepsModified: 0,
      },
    });

    render(
      <DiffViewer
        workflowId="workflow-1"
        version1={{ id: 'version-1', label: 'Version 1' }}
        version2={{ id: 'version-2', label: 'Version 2' }}
        isOpen
        onClose={vi.fn()}
      />
    );

    await waitFor(() => expect(diffVersions).toHaveBeenCalledWith('version-1', 'version-2'));
    expect(await screen.findByText('Sections Added')).toBeInTheDocument();
    expect(screen.getByText('Pages Removed')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sections' })).toBeInTheDocument();
    expect(screen.getByText('Applicant details')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pages' })).toBeInTheDocument();
    expect(screen.getByText('Contact information')).toBeInTheDocument();
  });
});
