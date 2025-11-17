import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TemplateCard } from '@/components/datavault/TemplateCard';

/**
 * DataVault Phase 1 PR 10: TemplateCard Component Tests
 */
describe('TemplateCard Component', () => {
  const mockTemplate = {
    name: 'People',
    description: 'Manage contacts, team members, or any person-related data',
    icon: 'fas fa-users',
    previewColumns: ['First Name', 'Last Name', 'Email', 'Phone'],
  };

  it('should render template name and description', () => {
    render(<TemplateCard {...mockTemplate} />);

    expect(screen.getByText('People')).toBeInTheDocument();
    expect(screen.getByText('Manage contacts, team members, or any person-related data')).toBeInTheDocument();
  });

  it('should show "Coming Soon" badge', () => {
    render(<TemplateCard {...mockTemplate} />);

    expect(screen.getByText('Coming Soon')).toBeInTheDocument();
  });

  it('should render preview columns', () => {
    render(<TemplateCard {...mockTemplate} />);

    expect(screen.getByText('First Name')).toBeInTheDocument();
    expect(screen.getByText('Last Name')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Phone')).toBeInTheDocument();
  });

  it('should limit preview columns to 5 and show count for remaining', () => {
    const manyColumns = {
      ...mockTemplate,
      previewColumns: ['Col1', 'Col2', 'Col3', 'Col4', 'Col5', 'Col6', 'Col7'],
    };

    render(<TemplateCard {...manyColumns} />);

    expect(screen.getByText('Col1')).toBeInTheDocument();
    expect(screen.getByText('Col5')).toBeInTheDocument();
    expect(screen.getByText('+2 more')).toBeInTheDocument();
    expect(screen.queryByText('Col6')).not.toBeInTheDocument();
  });

  it('should handle empty preview columns', () => {
    const noColumns = {
      ...mockTemplate,
      previewColumns: [],
    };

    render(<TemplateCard {...noColumns} />);

    expect(screen.queryByText('Suggested columns:')).not.toBeInTheDocument();
  });

  it('should have cursor-not-allowed style', () => {
    const { container } = render(<TemplateCard {...mockTemplate} />);

    const card = container.querySelector('.cursor-not-allowed');
    expect(card).toBeInTheDocument();
  });
});
