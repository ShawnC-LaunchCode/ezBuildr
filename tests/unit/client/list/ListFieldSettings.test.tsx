// @vitest-environment jsdom
/**
 * ListFieldSettings (LIST2-7) — the per-field settings host.
 *
 * Covers ACs 3-6: a list field's type-specific config (scale/number/display/
 * multi_field), description, and visibleIf can all be authored through this
 * component, fully controlled (field + onChange) with no `useUpdateStep` call
 * anywhere in the tree.
 *
 * `EditorField`'s `<Label>` is not `htmlFor`-linked to its control (it is a
 * sibling, not a wrapper), so `getByLabelText` cannot resolve it — this file
 * instead walks from the label text to its next-sibling control, which is
 * how `EditorField` always renders (`<Label/>{children}{description}`).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ListFieldSettings } from '../../../../client/src/components/builder/cards/list/ListFieldSettings';

import type { ListField } from '@shared/types/stepConfigs';

// Radix Select needs these polyfilled in jsdom before it will open (same
// recipe as tests/unit/client/ListDrillEditor.test.tsx).
beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => undefined;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined;
  }
});

afterEach(() => {
  cleanup();
});

type QuestionField = Extract<ListField, { kind: 'question' }>;

function questionField(overrides: Partial<QuestionField> & Pick<QuestionField, 'id' | 'alias' | 'title' | 'order' | 'type'>): QuestionField {
  return {
    kind: 'question',
    ...overrides,
  };
}

/** Finds an `EditorField`-style label (text may carry a trailing required `*`) and returns its control sibling. */
function controlForLabel(pattern: string): HTMLInputElement | HTMLTextAreaElement {
  const label = screen.getByText(new RegExp(`^${pattern}`), { selector: 'label' });
  const control = label.nextElementSibling;
  if (!control) {
    throw new Error(`No control found next to label matching "${pattern}"`);
  }
  return control as HTMLInputElement | HTMLTextAreaElement;
}

/**
 * The visibility panel renders `LogicBuilder` (LU-2), which calls
 * `useWorkflowVariables`/`useWorkflowSteps` even though they're gated off via
 * `enabled: false` on the injected-variables path — `useQuery` still needs a
 * `QueryClientProvider` ancestor to mount at all. Only tests that open the
 * visibility panel need this; every other describe block below renders
 * `ListFieldSettings` directly since `CollapsibleContent` doesn't mount
 * `LogicBuilder` while collapsed.
 */
function renderWithQueryClient(ui: JSX.Element) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('ListFieldSettings — description (LIST2-7 AC5)', () => {
  it('seeds the description textarea from field.description and reports edits via onChange', () => {
    const field = questionField({ id: 'f1', alias: 'notes', title: 'Notes', order: 0, type: 'short_text', description: 'Existing help text' });
    const onChange = vi.fn();

    render(<ListFieldSettings field={field} siblingFields={[]} onChange={onChange} />);

    const textarea = controlForLabel('Description') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Existing help text');

    fireEvent.change(textarea, { target: { value: 'New help text' } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ description: 'New help text' }));
  });
});

describe('ListFieldSettings — scale settings persist into field.config (LIST2-7 AC3)', () => {
  it('setting min/max/step through RangeSection produces a ScaleAdvancedConfig on field.config', () => {
    const field = questionField({ id: 'f1', alias: 'rating', title: 'Rating', order: 0, type: 'scale' });
    const onChange = vi.fn();

    render(<ListFieldSettings field={field} siblingFields={[]} onChange={onChange} />);

    fireEvent.change(controlForLabel('Minimum Value'), { target: { value: '2' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    const [next] = onChange.mock.calls[0] as [QuestionField];
    expect(next.config).toMatchObject({ min: 2, max: 10, step: 1, display: 'slider' });
  });
});

describe('ListFieldSettings — number settings persist into field.config (LIST2-7 AC4)', () => {
  it('setting min/max produces a canonical number config on field.config (STB-9)', () => {
    const field = questionField({ id: 'f1', alias: 'age', title: 'Age', order: 0, type: 'number' });
    const onChange = vi.fn();

    render(<ListFieldSettings field={field} siblingFields={[]} onChange={onChange} />);

    fireEvent.change(controlForLabel('Minimum Value'), { target: { value: '18' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    const [next] = onChange.mock.calls[0] as [QuestionField];
    // STB-9: a list number field stores the same canonical shape as a
    // top-level one -- limits nested under `validation`, never at the root.
    // Asserted whole rather than partially, so a stray key would fail here.
    expect(next.config).toEqual({ mode: 'number', validation: { min: 18, step: 1 } });
    // Currency stays out of a list field's config; STB-10 owns that family.
    expect(next.config).not.toHaveProperty('currency');
  });

  it('does not offer the currency/advanced mode switcher for a list number field', () => {
    const field = questionField({ id: 'f1', alias: 'age', title: 'Age', order: 0, type: 'number' });

    render(<ListFieldSettings field={field} siblingFields={[]} onChange={vi.fn()} />);

    expect(screen.getByText(/mode is fixed in easy mode/i)).toBeInTheDocument();
  });
});

describe('ListFieldSettings — display settings persist into field.config (LIST2-7 AC4)', () => {
  it('setting markdown content produces a DisplayConfig on field.config', () => {
    const field = questionField({ id: 'f1', alias: 'intro', title: 'Intro', order: 0, type: 'display' });
    const onChange = vi.fn();

    render(<ListFieldSettings field={field} siblingFields={[]} onChange={onChange} />);

    fireEvent.change(controlForLabel('Markdown'), { target: { value: '# Welcome' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    const [next] = onChange.mock.calls[0] as [QuestionField];
    expect(next.config).toEqual({ markdown: '# Welcome' });
  });
});

describe('ListFieldSettings — multi_field settings persist into field.config (LIST2-7 AC4)', () => {
  it('changing the layout preset produces a MultiFieldConfig on field.config', () => {
    const field = questionField({ id: 'f1', alias: 'contact', title: 'Contact', order: 0, type: 'multi_field' });
    const onChange = vi.fn();

    render(<ListFieldSettings field={field} siblingFields={[]} onChange={onChange} />);

    fireEvent.click(screen.getByRole('radio', { name: /contact \(email \+ phone\)/i }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const [next] = onChange.mock.calls[0] as [QuestionField];
    expect(next.config).toMatchObject({
      layout: 'contact',
      fields: [
        { key: 'email', label: 'Email', type: 'email', required: true },
        { key: 'phone', label: 'Phone', type: 'phone', required: false },
      ],
    });
  });
});

describe('ListFieldSettings — out-of-scope types (LIST2-7 Finding)', () => {
  it('renders only Description + Visibility for a type with no LIST2-7 settings section', () => {
    const field = questionField({ id: 'f1', alias: 'name', title: 'Name', order: 0, type: 'short_text' });

    render(<ListFieldSettings field={field} siblingFields={[]} onChange={vi.fn()} />);

    expect(screen.getByText('Description', { selector: 'label' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /visibility/i })).toBeInTheDocument();
    // None of the type-specific section headers from scale/number/display/multi_field leak in.
    expect(screen.queryByText('Range')).not.toBeInTheDocument();
    expect(screen.queryByText('Content')).not.toBeInTheDocument();
    expect(screen.queryByText('Layout Type')).not.toBeInTheDocument();
    expect(screen.queryByText('Validation Rules')).not.toBeInTheDocument();
  });
});

describe('ListFieldSettings — visibility scoped to sibling fields (LIST2-7 AC6, LU-2)', () => {
  it('shows an explanatory message instead of a toggle when there are no siblings', async () => {
    const field = questionField({ id: 'f1', alias: 'only', title: 'Only field', order: 0, type: 'short_text' });

    renderWithQueryClient(<ListFieldSettings field={field} siblingFields={[]} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /visibility/i }));

    expect(await screen.findByText(/add another field at this level/i)).toBeInTheDocument();
    expect(screen.queryByText('Conditional Visibility')).not.toBeInTheDocument();
  });

  // LU-2: the hand-wired ConditionGroup + SwitchField were deleted in favor of
  // rendering LogicBuilder directly (fed the sibling list via its injected
  // `variables` prop). LogicBuilder commits on an explicit "Apply Changes"
  // click rather than per-toggle, matching how VisibilityField.tsx /
  // PageLogicSheet.tsx already behave for steps/pages.
  it('enabling conditional visibility, picking a sibling operand, and applying round-trips an expression through onChange', async () => {
    const field = questionField({ id: 'f1', alias: 'target', title: 'Target', order: 1, type: 'short_text' });
    const sibling = questionField({ id: 'f0', alias: 'trigger', title: 'Trigger', order: 0, type: 'short_text' });
    const onChange = vi.fn();

    renderWithQueryClient(<ListFieldSettings field={field} siblingFields={[sibling]} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /visibility/i }));
    await screen.findByText('Conditional Visibility');
    fireEvent.click(screen.getByRole('switch'));

    // Pick the sibling field as the condition's operand — proves the
    // injected sibling list (not a workflow-variables fetch) backs the picker.
    const user = userEvent.setup();
    const variableTrigger = (await screen.findAllByRole('combobox'))[0];
    await user.click(variableTrigger);
    await user.click(await screen.findByRole('option', { name: /trigger/i }));

    fireEvent.click(screen.getByRole('button', { name: /apply changes/i }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const [next] = onChange.mock.calls[0] as [QuestionField];
    expect(next.visibleIf).toBeTruthy();
    expect(next.visibleIf).toMatchObject({
      type: 'group',
      conditions: [expect.objectContaining({ variable: 'trigger' })],
    });
  });

  it('disabling conditional visibility and applying clears visibleIf back to null', async () => {
    const field = questionField({
      id: 'f1',
      alias: 'target',
      title: 'Target',
      order: 1,
      type: 'short_text',
      visibleIf: {
        id: 'g1',
        type: 'group',
        operator: 'AND',
        conditions: [{ id: 'c1', type: 'condition', variable: 'trigger', operator: 'equals', valueType: 'constant', value: 'x' }],
      },
    });
    const sibling = questionField({ id: 'f0', alias: 'trigger', title: 'Trigger', order: 0, type: 'short_text' });
    const onChange = vi.fn();

    renderWithQueryClient(<ListFieldSettings field={field} siblingFields={[sibling]} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /visibility/i }));
    await screen.findByText('Conditional Visibility');
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('button', { name: /apply changes/i }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ visibleIf: null }));
  });
});
