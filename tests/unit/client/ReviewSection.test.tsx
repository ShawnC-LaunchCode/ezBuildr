// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReviewSection } from '../../../client/src/components/runner/sections/ReviewSection';

const sections = [
  { id: 'contact', title: 'Contact' },
  { id: 'hidden-section', title: 'Hidden section' },
];

const steps = [
  {
    id: 'address',
    sectionId: 'contact',
    title: 'Mailing address',
    type: 'address',
    config: {},
  },
  {
    id: 'interests',
    sectionId: 'contact',
    title: 'Interests',
    type: 'multiple_choice',
    config: {
      options: [
        { id: 'tax-id', alias: 'tax', label: 'Tax planning' },
        { id: 'estate-id', alias: 'estate', label: 'Estate planning' },
      ],
    },
  },
  {
    id: 'international-address',
    sectionId: 'contact',
    title: 'International address',
    type: 'address_advanced',
    config: {
      fields: [
        { key: 'street1', label: 'Street', type: 'text', required: true },
        { key: 'locality', label: 'Locality', type: 'text', required: true },
      ],
    },
  },
  {
    id: 'children',
    sectionId: 'contact',
    title: 'Children',
    type: 'list',
    config: {
      fields: [
        { kind: 'question', id: 'child-name', alias: 'name', type: 'short_text', title: 'Name', order: 0 },
      ],
      labelTemplate: '{name}',
    },
  },
  {
    id: 'conditional-secret',
    sectionId: 'contact',
    title: 'Conditional secret',
    type: 'short_text',
    config: {},
  },
  {
    id: 'hidden-section-answer',
    sectionId: 'hidden-section',
    title: 'Hidden section answer',
    type: 'short_text',
    config: {},
  },
];

const values = {
  address: {
    street: '123 Main St',
    street2: 'Suite 4',
    city: 'Chicago',
    state: 'IL',
    zip: '60601',
  },
  interests: ['tax', 'estate-id'],
  'international-address': { street1: '10 Downing St', locality: 'London' },
  children: {
    items: [
      { itemId: 'child-1', values: { name: 'Ava' } },
      { itemId: 'child-2', values: { name: 'Noah' } },
    ],
  },
  'conditional-secret': 'stale hidden value',
  'hidden-section-answer': 'not on this branch',
};

afterEach(cleanup);

describe('ReviewSection (GH-162)', () => {
  it('renders only the currently visible conditional branch', () => {
    render(
      <ReviewSection
        sections={sections}
        allSteps={steps}
        values={values}
        visibleSectionIds={['contact']}
        visibleStepIds={['address', 'interests', 'international-address', 'children']}
        onEditStep={vi.fn()}
      />
    );

    expect(screen.getByText('Mailing address')).toBeInTheDocument();
    expect(screen.queryByText('Conditional secret')).not.toBeInTheDocument();
    expect(screen.queryByText('stale hidden value')).not.toBeInTheDocument();
    expect(screen.queryByText('Hidden section')).not.toBeInTheDocument();
    expect(screen.queryByText('not on this branch')).not.toBeInTheDocument();
  });

  it('formats addresses, choice labels, and repeating items without raw JSON', () => {
    const { container } = render(
      <ReviewSection
        sections={sections}
        allSteps={steps}
        values={values}
        visibleSectionIds={['contact']}
        visibleStepIds={['address', 'interests', 'international-address', 'children']}
        onEditStep={vi.fn()}
      />
    );

    expect(screen.getByText('123 Main St, Suite 4, Chicago, IL 60601')).toBeInTheDocument();
    expect(screen.getByText('Tax planning, Estate planning')).toBeInTheDocument();
    expect(screen.getByText('Street: 10 Downing St, Locality: London')).toBeInTheDocument();
    expect(screen.getAllByText('Ava')).toHaveLength(2);
    expect(screen.getAllByText('Noah')).toHaveLength(2);
    expect(container).not.toHaveTextContent('{"street"');
    expect(container).not.toHaveTextContent('"items"');
  });

  it('uses the same structured formatter for address and choice fields inside a List', () => {
    const structuredListStep = {
      id: 'household',
      sectionId: 'contact',
      title: 'Household',
      type: 'list',
      config: {
        fields: [
          {
            kind: 'question',
            id: 'member-address',
            alias: 'address',
            type: 'address_advanced',
            title: 'Address',
            order: 0,
            config: {
              fields: [
                { key: 'street', label: 'Street', type: 'text', required: true },
                { key: 'city', label: 'City', type: 'text', required: true },
              ],
            },
          },
          {
            kind: 'question',
            id: 'member-preference',
            alias: 'preference',
            type: 'multiple_choice',
            title: 'Preference',
            order: 1,
            config: {
              options: [{ id: 'a-id', alias: 'a', label: 'Option A' }],
            },
          },
        ],
      },
    };
    const { container } = render(
      <ReviewSection
        sections={[sections[0]]}
        allSteps={[structuredListStep]}
        values={{
          household: {
            items: [{
              itemId: 'member-1',
              values: {
                address: { street: '123 Main St', city: 'Chicago' },
                preference: 'a-id',
              },
            }],
          },
        }}
        visibleSectionIds={['contact']}
        visibleStepIds={['household']}
        onEditStep={vi.fn()}
      />
    );

    expect(screen.getByText('Street: 123 Main St, City: Chicago')).toBeInTheDocument();
    expect(screen.getByText('Option A')).toBeInTheDocument();
    expect(container).not.toHaveTextContent('{"street"');
    expect(container).not.toHaveTextContent('a-id');
  });

  it('omits a visible section card when none of its steps are visible', () => {
    render(
      <ReviewSection
        sections={[sections[0]]}
        allSteps={[steps[4]]}
        values={{ 'conditional-secret': 'stale hidden value' }}
        visibleSectionIds={['contact']}
        visibleStepIds={[]}
        onEditStep={vi.fn()}
      />
    );

    expect(screen.queryByText('Contact')).not.toBeInTheDocument();
    expect(screen.queryByText('No questions answered in this section.')).not.toBeInTheDocument();
    expect(screen.queryByText('stale hidden value')).not.toBeInTheDocument();
  });

  it('targets the exact step from each direct Edit action', async () => {
    const user = userEvent.setup();
    const onEditStep = vi.fn();
    render(
      <ReviewSection
        sections={sections}
        allSteps={steps}
        values={values}
        visibleSectionIds={['contact']}
        visibleStepIds={['address', 'interests', 'children']}
        onEditStep={onEditStep}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Edit Interests' }));

    expect(onEditStep).toHaveBeenCalledWith('interests', 'contact');
  });
});
