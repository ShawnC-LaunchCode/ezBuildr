// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PreviewVariablesPanel } from '../../../client/src/components/preview/variables/PreviewVariablesPanel';
import type { CodeBlockInspectorData, PreviewVariable } from '../../../client/src/hooks/api/useCodeBlockRuns';
import type { ApiAdvanceBlockState, ApiAdvanceResult } from '../../../client/src/lib/vault-api';

const { fetchAPI } = vi.hoisted(() => ({ fetchAPI: vi.fn() }));
vi.mock('@/lib/vault-api', () => ({ fetchAPI }));

const variable = (key: string, overrides: Partial<PreviewVariable> = {}): PreviewVariable => ({
  key, stepId: key, alias: key, label: key, type: 'number', declaredType: 'number',
  pageId: 'page', pageTitle: 'Party details', isVirtual: false, source: 'question', ...overrides,
});
const variables = [variable('num_adults', { label: 'Adult count' }),
  variable('party_size', { type: 'computed', isVirtual: true, source: 'code block', blockStepId: 'block' }),
  variable('external_ref', { declaredType: 'string', type: 'text', source: 'inbound' })];
const state = (status: string, pendingInputs: string[] = [], errorMessage: string | null = null): ApiAdvanceBlockState =>
  ({ stepId: 'block', status, pendingInputs, errorMessage, firedAt: null });
const response = (blockStates: ApiAdvanceBlockState[], values: Record<string, unknown> = {}): ApiAdvanceResult =>
  ({ blockStates, values, success: true, navigation: { nextPageId: 'page-two' }, submissionKey: 'submit-1' });
let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  fetchAPI.mockReset();
  fetchAPI.mockResolvedValue({ variables, blockStates: [] });
});
afterEach(() => { cleanup(); client.clear(); });
function mount(result?: ApiAdvanceResult, values: Record<string, unknown> = {}) {
  const view = render(<QueryClientProvider client={client}>
    <PreviewVariablesPanel runId="run-one" values={values} result={result} onClose={vi.fn()} />
  </QueryClientProvider>);
  return { ...view, update: (next: ApiAdvanceResult, runId = 'run-one') => view.rerender(
    <QueryClientProvider client={client}><PreviewVariablesPanel key={runId} runId={runId} values={{}} result={next} onClose={vi.fn()} /></QueryClientProvider>) };
}
async function output() { return screen.findByRole('article', { name: 'Variable party_size' }); }

describe('CB-9 preview variables', () => {
  it('shows aliases, committed values, declared types and all source labels', async () => {
    mount(undefined, { num_adults: 0, party_size: 5, external_ref: 'ABC' });
    expect(within(await output()).getByLabelText('Current value').textContent).toBe('5');
    const question = screen.getByRole('article', { name: 'Variable num_adults' });
    expect(within(question).getByLabelText('Current value').textContent).toBe('0');
    expect(within(question).getByText('question')).toBeTruthy();
    expect(within(await output()).getByText('number')).toBeTruthy();
    expect(within(await output()).getByText('code block')).toBeTruthy();
    expect(screen.getByText('inbound')).toBeTruthy();
  });

  it('marks only virtual outputs as computed and keeps absent rows distinct from unchanged', async () => {
    mount();
    const row = await output();
    expect(within(row).getByText('Computed')).toBeTruthy();
    expect(within(row).getByText('Not evaluated — no recorded state')).toBeTruthy();
    expect(within(screen.getByRole('article', { name: 'Variable num_adults' })).queryByText('Computed')).toBeNull();
    expect(screen.queryByText('Skipped, unchanged')).toBeNull();
  });

  it.each([
    ['skipped_unready', ['num_children'], null, 'Waiting on num_children'],
    ['fired', [], null, 'Fired'],
    ['skipped_unchanged', [], null, 'Skipped, unchanged'],
    ['error', [], 'boom', 'Errored: boom'],
  ] as const)('renders the recorded %s state', async (status, pending, error, expected) => {
    mount(response([state(status, [...pending], error)]));
    expect(within(await output()).getByText(expected)).toBeTruthy();
  });

  it('changes the same row after a submit without refetching the inspector', async () => {
    fetchAPI.mockResolvedValue({ variables, blockStates: [state('skipped_unready', ['num_children'])] });
    const view = mount();
    expect(within(await output()).getByText('Waiting on num_children')).toBeTruthy();
    view.update(response([state('fired')], { party_size: 5 }));
    await waitFor(() => { expect(within(screen.getByRole('article', { name: 'Variable party_size' })).getByText('Fired')).toBeTruthy(); });
    expect(within(await output()).getByLabelText('Current value').textContent).toBe('5');
    expect(fetchAPI).toHaveBeenCalledTimes(1);
    view.update(response([state('skipped_unchanged')], { party_size: 5 }));
    expect(within(await output()).getByText('Skipped, unchanged')).toBeTruthy();
    expect(within(await output()).getByLabelText('Current value').textContent).toBe('5');
  });

  it('does not let a late initial read overwrite a submission, including an empty state set', async () => {
    let finish: (data: CodeBlockInspectorData) => void = () => {};
    fetchAPI.mockImplementation(() => new Promise<CodeBlockInspectorData>(resolve => { finish = resolve; }));
    const view = mount();
    expect(screen.getByText('Loading variables…')).toBeTruthy();
    view.update(response([], { party_size: 0 }));
    await act(async () => { finish({ variables, blockStates: [state('fired')] }); });
    expect(within(await output()).getByText('Not evaluated — no recorded state')).toBeTruthy();
    expect(within(await output()).getByLabelText('Current value').textContent).toBe('0');
  });

  it('searches aliases and labels case-insensitively and applies the shared computed filter', async () => {
    mount(); await output();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search variables' }), { target: { value: 'ADULT count' } });
    expect(screen.getByRole('article', { name: 'Variable num_adults' })).toBeTruthy();
    expect(screen.queryByRole('article', { name: 'Variable party_size' })).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search variables' }), { target: { value: '' } });
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Computed' }), { button: 0, ctrlKey: false });
    expect(await output()).toBeTruthy();
    expect(screen.queryByRole('article', { name: 'Variable num_adults' })).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search variables' }), { target: { value: 'no-match' } });
    expect(screen.getByText('No matching variables. Try another search or filter.')).toBeTruthy();
  });

  it('shows readable null, false, empty string and structured values', async () => {
    const view = mount(response([], { party_size: false }));
    expect(within(await output()).getByLabelText('Current value').textContent).toBe('false');
    for (const value of [null, '', { children: [1, 2] }]) {
      view.update(response([], { party_size: value }));
      expect(within(await output()).getByLabelText('Current value').textContent).toBe(JSON.stringify(value, null, 2));
    }
  });

  it('shows an actionable load error and retries', async () => {
    fetchAPI.mockRejectedValueOnce(new Error('Access denied'));
    mount();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Not evaluated — no recorded state')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry variables' }));
    expect(await output()).toBeTruthy();
    expect(fetchAPI).toHaveBeenCalledTimes(2);
  });

  it('loads fresh metadata for a replacement run and never displays the previous run values', async () => {
    const view = mount(response([state('fired')], { party_size: 5 }));
    await output();
    fetchAPI.mockResolvedValue({ variables: [variable('new_question')], blockStates: [] });
    view.update(response([], {}), 'run-two');
    expect(await screen.findByRole('article', { name: 'Variable new_question' })).toBeTruthy();
    expect(screen.queryByRole('article', { name: 'Variable party_size' })).toBeNull();
    expect(fetchAPI).toHaveBeenLastCalledWith('/api/runs/run-two/code-blocks');
  });
});
