/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TemplateUpdateDialog } from '../../../client/src/components/builder/tabs/templates/TemplateUpdateDialog';

vi.mock('axios');

describe('TemplateUpdateDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders renamed placeholders as a group distinct from added and removed', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: {
        data: {
          comparison: {
            added: ['new_field'],
            removed: ['legacy_field'],
            unchanged: [],
            renamed: [{ from: 'client_name', to: 'customer_name' }],
          },
          impact: {
            workflowsAffected: 1,
            workflows: [{ id: 'workflow-1', name: 'Client intake' }],
            hasRemovedPlaceholders: true,
            requiresReview: true,
          },
        },
      },
    });

    render(
      <TemplateUpdateDialog
        open
        onOpenChange={vi.fn()}
        templateId="template-1"
        templateName="Engagement letter"
        projectId="project-1"
        onSuccess={vi.fn()}
      />
    );

    const fileInput = screen.getByLabelText('New Template File');
    await userEvent.upload(
      fileInput,
      new File(['template'], 'updated.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
    );

    expect(await screen.findByText('1 renamed')).toBeInTheDocument();
    expect(screen.getByText('client_name')).toBeInTheDocument();
    expect(screen.getByText('customer_name')).toBeInTheDocument();
    expect(screen.getByText('1 added')).toBeInTheDocument();
    expect(screen.getByText('new_field')).toBeInTheDocument();
    expect(screen.getByText('1 removed')).toBeInTheDocument();
    expect(screen.getByText('legacy_field')).toBeInTheDocument();
  });
});
