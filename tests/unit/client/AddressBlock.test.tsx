// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AddressBlockRenderer } from '../../../client/src/components/runner/blocks/AddressBlock';
import type { Step } from '../../../client/src/types';
import type { AddressConfig } from '../../../shared/types/stepConfigs';

function addressStep(config: AddressConfig): Step {
  return {
    id: 'address-1',
    workflowId: 'workflow-1',
    pageId: 'page-1',
    type: 'address',
    title: 'Your Address',
    description: null,
    required: false,
    alias: null,
    order: 0,
    config,
    createdAt: '2026-08-28T00:00:00.000Z',
    updatedAt: '2026-08-28T00:00:00.000Z',
  } as unknown as Step;
}

afterEach(cleanup);

describe('AddressBlockRenderer — storage is JSON object', () => {
  it('emits a structured object with street, city, state, zip', () => {
    const onChange = vi.fn();
    render(
      <AddressBlockRenderer
        step={addressStep({ country: 'US', fields: ['street', 'city', 'state', 'zip'] })}
        value={null}
        onChange={onChange}
      />
    );

    const streetInput = screen.getByPlaceholderText(/123 Main St/i);
    fireEvent.change(streetInput, { target: { value: '123 Main St' } });
    
    // Check it emits partial objects immediately or full, depending on implementation
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      street: '123 Main St'
    }));

    const cityInput = screen.getByPlaceholderText(/Miami/i);
    fireEvent.change(cityInput, { target: { value: 'Miami' } });

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      city: 'Miami'
    }));
  });

  it('populates initial value correctly', () => {
    const onChange = vi.fn();
    render(
      <AddressBlockRenderer
        step={addressStep({ country: 'US', fields: ['street', 'city', 'state', 'zip'] })}
        value={{ street: '456 Oak Ave', city: 'Denver', state: 'CO', zip: '80202' }}
        onChange={onChange}
      />
    );

    const streetInput = screen.getByPlaceholderText(/123 Main St/i);
    expect(streetInput).toHaveValue('456 Oak Ave');
    
    const cityInput = screen.getByPlaceholderText(/Miami/i);
    expect(cityInput).toHaveValue('Denver');
    
    const zipInput = screen.getByPlaceholderText(/33101/i);
    expect(zipInput).toHaveValue('80202');
  });
});
