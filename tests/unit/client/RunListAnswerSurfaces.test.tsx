// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExecutionValueView } from '../../../client/src/components/history/ExecutionDetailView';
import { ReviewPage } from '../../../client/src/components/runner/pages/ReviewPage';
import type { ApiStep } from '../../../client/src/lib/vault-api';
import type { ListConfig, ListValue } from '../../../shared/types/stepConfigs';

afterEach(cleanup);

const config: ListConfig = {
  fields: [
    { kind: 'question', id: 'name-field', alias: 'name', type: 'short_text', title: 'Name', order: 0 },
  ],
  labelTemplate: '{name}',
};
const value: ListValue = { items: [{ itemId: 'person-1', values: { name: 'Ava Chen' } }] };
const listStep = {
  id: 'list-step',
  pageId: 'page-1',
  workflowId: 'workflow-1',
  title: 'Household members',
  type: 'list',
  config,
} as unknown as ApiStep;

describe('List answers in run surfaces (GH-146 AC3)', () => {
  it('renders the structured outline in respondent review', () => {
    render(
      <ReviewPage
        pages={[{ id: 'page-1', title: 'People' }]}
        allSteps={[listStep]}
        values={{ 'list-step': value }}
        visiblePageIds={['page-1']}
        visibleStepIds={['list-step']}
        onEditStep={vi.fn()}
      />,
    );

    expect(screen.getByText('Household members')).toBeInTheDocument();
    expect(screen.getAllByText('Ava Chen')).toHaveLength(2);
  });

  it('renders the same structured outline in execution details instead of JSON', () => {
    const { container } = render(<ExecutionValueView step={listStep} value={value} />);

    expect(screen.getAllByText('Ava Chen')).toHaveLength(2);
    expect(container.textContent).not.toContain('"items"');
    expect(container.textContent).not.toContain('person-1');
  });
});
