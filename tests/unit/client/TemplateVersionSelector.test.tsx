/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import axios from 'axios';
import { TemplateVersionSelector } from '../../../client/src/components/builder/final/FinalDocumentsPageEditor';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

if (typeof window !== 'undefined') {
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

vi.mock('axios');

describe('TemplateVersionSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
  });

  it('fetches versions and renders the select options based on the versions envelope', async () => {
    // Mock the GET /api/templates/:id/versions response
    const mockVersions = [
      { id: 'v-1', versionNumber: 1, createdAt: new Date().toISOString() },
      { id: 'v-2', versionNumber: 2, createdAt: new Date().toISOString() }
    ];
    
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: { versions: mockVersions }
    });

    const onChange = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <TemplateVersionSelector
          templateId="t-1"
          value={null}
          onChange={onChange}
        />
      </QueryClientProvider>
    );

    // Should fetch the versions
    expect(axios.get).toHaveBeenCalledWith('/api/templates/t-1/versions');

    // Wait for the combobox to render
    const trigger = await screen.findByRole('combobox');
    expect(trigger).toBeInTheDocument();

    // Verify it says "Follow Latest" when value is null
    expect(trigger).toHaveTextContent('Follow Latest');
    
    // Open the popover
    await userEvent.click(trigger);

    // Both versions should be in the dropdown
    const option1 = await screen.findByText(/v1/);
    expect(option1).toBeInTheDocument();

    const option2 = await screen.findByText(/v2/);
    expect(option2).toBeInTheDocument();
  });
});
