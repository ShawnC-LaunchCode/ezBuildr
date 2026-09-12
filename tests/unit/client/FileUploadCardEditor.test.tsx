// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FileUploadCardEditor } from '../../../client/src/components/builder/cards/FileUploadCardEditor';
import type { Step } from '../../../client/src/types';
import type { FileUploadConfig } from '../../../shared/types/stepConfigs';

// Mock the trpc useUpdateStep hook
const mockMutate = vi.fn();
vi.mock('../../../client/src/lib/vault-hooks', () => ({
  useUpdateStep: () => ({ mutate: mockMutate }),
}));

describe('FileUploadCardEditor', () => {
  const queryClient = new QueryClient();

  const renderEditor = (stepConfig: FileUploadConfig = {}) => {
    const step = {
      id: 'step-1',
      alias: 'file1',
      type: 'file_upload',
      title: 'Upload File',
      required: false,
      config: stepConfig,
    } as unknown as Step;

    return render(
      <QueryClientProvider client={queryClient}>
        <FileUploadCardEditor stepId="step-1" pageId="page-1" workflowId="workflow-1" step={step} />
      </QueryClientProvider>
    );
  };

  it('renders inputs with default values', () => {
    const { container } = renderEditor();
    expect(container.querySelector('input[type="number"]') as HTMLInputElement).toHaveValue(1);
    expect(container.querySelectorAll('input[type="number"]')[1] as HTMLInputElement).toHaveValue(null);
    expect(container.querySelector('input[type="text"][placeholder*="image/jpeg"]') as HTMLInputElement).toHaveValue('');
    expect(screen.getAllByRole('switch')[1]).not.toBeChecked();
  });

  it('updates maxFiles when changed', () => {
    const { container } = renderEditor();
    fireEvent.change(container.querySelector('input[type="number"]') as HTMLInputElement, { target: { value: '3' } });
    expect(mockMutate).toHaveBeenCalledWith({
      id: 'step-1',
      pageId: 'page-1',
      config: expect.objectContaining({ maxFiles: 3 }),
    });
  });

  it('updates maxSize and converts to bytes', () => {
    const { container } = renderEditor();
    fireEvent.change(container.querySelectorAll('input[type="number"]')[1] as HTMLInputElement, { target: { value: '5' } });
    expect(mockMutate).toHaveBeenCalledWith({
      id: 'step-1',
      pageId: 'page-1',
      config: expect.objectContaining({ maxSize: 5 * 1024 * 1024 }),
    });
  });

  it('updates allowedTypes by splitting commas', () => {
    const { container } = renderEditor();
    fireEvent.change(container.querySelector('input[type="text"][placeholder*="image/jpeg"]') as HTMLInputElement, { target: { value: 'image/jpeg, application/pdf' } });
    expect(mockMutate).toHaveBeenCalledWith({
      id: 'step-1',
      pageId: 'page-1',
      config: expect.objectContaining({ allowedTypes: ['image/jpeg', 'application/pdf'] }),
    });
  });

  it('toggles previewThumbnails', () => {
    renderEditor();
    fireEvent.click(screen.getAllByRole('switch')[1]);
    expect(mockMutate).toHaveBeenCalledWith({
      id: 'step-1',
      pageId: 'page-1',
      config: expect.objectContaining({ previewThumbnails: true }),
    });
  });
});
