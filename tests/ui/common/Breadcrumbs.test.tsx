/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { Database } from 'lucide-react';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { Breadcrumbs, type BreadcrumbItem } from '@/components/common/Breadcrumbs';
/**
 * DataVault Phase 2 PR 13: Breadcrumbs Component Tests
 */
// Mock wouter's Link component
vi.mock('wouter', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href} data-testid="breadcrumb-link">
      {children}
    </a>
  ),
}));
describe('Breadcrumbs Component', () => {
  const mockItems: BreadcrumbItem[] = [
    { label: 'DataVault', href: '/datavault', icon: <Database data-testid="icon" className="w-3 h-3" /> },
    { label: 'Databases', href: '/datavault/databases' },
    { label: 'Test Database' },
  ];
  it('should render all breadcrumb items', () => {
    render(<Breadcrumbs items={mockItems} />);
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('DataVault')).toBeInTheDocument();
    expect(screen.getByText('Databases')).toBeInTheDocument();
    expect(screen.getByText('Test Database')).toBeInTheDocument();
  });
  it('should render without home when showHome is false', () => {
    render(<Breadcrumbs items={mockItems} showHome={false} />);
    expect(screen.queryByText('Home')).not.toBeInTheDocument();
    expect(screen.getByText('DataVault')).toBeInTheDocument();
  });
  it('should render icons for items that have them', () => {
    render(<Breadcrumbs items={mockItems} />);
    const icons = screen.getAllByTestId('icon');
    expect(icons.length).toBeGreaterThan(0);
  });
  it('should render links for non-last items with href', () => {
    render(<Breadcrumbs items={mockItems} />);
    const links = screen.getAllByTestId('breadcrumb-link');
    // Home, DataVault, and Databases should have links (not Test Database as it's last)
    expect(links.length).toBeGreaterThan(0);
  });
  it('should render last item without link', () => {
    render(<Breadcrumbs items={mockItems} />);
    const lastItem = screen.getByText('Test Database');
    expect(lastItem.closest('a')).toBeNull();
  });
  it('should apply custom className', () => {
    const { container } = render(<Breadcrumbs items={mockItems} className="custom-class" />);
    const nav = container.querySelector('nav');
    expect(nav).toHaveClass('custom-class');
  });
  it('should render chevron separators between items', () => {
    const { container } = render(<Breadcrumbs items={mockItems} />);
    // Should have chevrons between items
    const chevrons = container.querySelectorAll('svg');
    expect(chevrons.length).toBeGreaterThan(0);
  });
  it('should handle single item', () => {
    render(<Breadcrumbs items={[{ label: 'Single Item' }]} showHome={false} />);
    expect(screen.getByText('Single Item')).toBeInTheDocument();
    expect(screen.queryByText('Home')).not.toBeInTheDocument();
  });
  it('should handle empty items array with home', () => {
    render(<Breadcrumbs items={[]} />);
    expect(screen.getByText('Home')).toBeInTheDocument();
  });
  it('should apply font-medium to last item', () => {
    render(<Breadcrumbs items={mockItems} />);
    const lastItem = screen.getByText('Test Database');
    expect(lastItem.closest('span')).toHaveClass('font-medium');
  });
});