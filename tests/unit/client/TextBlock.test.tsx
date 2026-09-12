// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BlockRenderer } from '../../../client/src/components/runner/blocks/BlockRenderer';
import type { Step } from '../../../client/src/types';

function textStep(variant: 'short' | 'long', config: Record<string, unknown> = {}): Step {
  return {
    id: `text-${variant}`,
    workflowId: 'workflow-1',
    pageId: 'page-1',
    type: 'text',
    title: `${variant} answer`,
    description: null,
    required: false,
    alias: null,
    order: 0,
    config: { variant, ...config },
    createdAt: '2026-08-27T00:00:00.000Z',
  };
}

afterEach(cleanup);

describe('canonical text runner', () => {
  it('renders the short variant with placeholder, max length, and string/null input shape', () => {
    const onChange = vi.fn();
    render(<BlockRenderer
      step={textStep('short', { placeholder: 'Short hint', validation: { maxLength: 4 } })}
      value={null}
      onChange={onChange}
    />);

    const input = screen.getByRole('textbox', { name: /short answer/i });
    expect(input.tagName).toBe('INPUT');
    expect(input).toHaveAttribute('placeholder', 'Short hint');
    expect(input).toHaveAttribute('maxLength', '4');
    expect(input).toHaveValue('');

    fireEvent.change(input, { target: { value: 'Text' } });
    expect(onChange).toHaveBeenLastCalledWith('Text');
  });

  it('renders the long variant as a textarea and enforces the configured maximum', () => {
    const onChange = vi.fn();
    render(<BlockRenderer
      step={textStep('long', { placeholder: 'Long hint', validation: { maxLength: 5 } })}
      value="Hello"
      onChange={onChange}
    />);

    const textarea = screen.getByRole('textbox', { name: /long answer/i });
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea).toHaveValue('Hello');
    expect(screen.getByText('5 / 5')).toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: 'Hello!' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('adapts legacy long_text rows at the runner boundary', () => {
    const legacy = {
      ...textStep('short'),
      id: 'legacy-long',
      type: 'long_text',
      title: 'Legacy notes',
      config: { placeholder: 'Old hint', maxLength: 12 },
    } as Step;

    render(<BlockRenderer step={legacy} value="Old value" onChange={vi.fn()} />);

    const textarea = screen.getByRole('textbox', { name: /Legacy notes/i });
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea).toHaveAttribute('placeholder', 'Old hint');
    expect(textarea).toHaveAttribute('maxLength', '12');
  });
});
