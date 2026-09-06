// @vitest-environment jsdom
/**
 * CB-8 AC 3, 4, 5 and 7 — the Code Block editor modal.
 *
 * "Persists" is taken literally throughout: every control is set, the modal is
 * SAVED, the payload that actually left the client is asserted, and the modal is
 * then re-mounted from what the server stored. Reading a control's own state
 * back proves only that React works.
 *
 * Monaco is the one thing stubbed. It needs canvas, workers and layout
 * measurement, none of which exist in jsdom; AC 1 and AC 2 are proven in the
 * browser instead (see the ticket's live proof), and nothing asserted here
 * depends on the code field being real.
 */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { JSCodeEditorSection } from '../../../client/src/components/builder/questions/js-question/JSCodeEditorSection';
import { classifySaveError, classifyWarning } from '../../../client/src/components/builder/questions/js-question/saveErrors';
import { ASTValidator } from '../../../server/services/scripting/ASTValidator';
import { validateFiringPolicy } from '../../../server/services/codeBlocks/firingPolicy';
import { validateAliasFormat } from '../../../server/services/stepAlias';

import type { JsQuestionConfig } from '@shared/types/steps';

if (!Element.prototype.hasPointerCapture) { Element.prototype.hasPointerCapture = () => false; }
if (!Element.prototype.setPointerCapture) { Element.prototype.setPointerCapture = () => undefined; }
if (!Element.prototype.releasePointerCapture) { Element.prototype.releasePointerCapture = () => undefined; }
if (!Element.prototype.scrollIntoView) { Element.prototype.scrollIntoView = () => undefined; }

const { mutateAsyncMock, fetchAPIMock } = vi.hoisted(() => ({
    mutateAsyncMock: vi.fn(),
    fetchAPIMock: vi.fn(),
}));

vi.mock('@/lib/vault-hooks', () => ({
    useUpdateStep: () => ({ mutateAsync: mutateAsyncMock, isPending: false }),
    usePages: () => ({ data: [{ id: 'page-2', title: 'Pricing' }] }),
}));

vi.mock('@/lib/vault-api', () => ({ fetchAPI: fetchAPIMock }));

vi.mock('@/components/blocks/js-editor/JSCodeEditor', () => ({
    JSCodeEditor: ({ code, onChange }: { code: string; onChange: (next: string) => void }) => (
        <textarea aria-label="Code Block JavaScript" value={code}
            onChange={(event) => { onChange(event.target.value); }} />
    ),
}));

vi.mock('@/components/builder/HelperLibraryDocs', () => ({
    HelperLibraryDocs: () => <div data-testid="helper-docs" />,
}));

vi.mock('@/components/common/EnhancedVariablePicker', () => ({
    EnhancedVariablePicker: () => <div data-testid="variable-picker" />,
}));

const BASE: JsQuestionConfig = {
    code: 'emit({ order_total: input.price * input.quantity });',
    inputs: [{ key: 'price', required: true }, { key: 'quantity', required: true }],
    outputs: [{ key: 'order_total', type: 'number' }],
    timeoutMs: 1000,
};

/** The validate-only response the modal fetches when it opens. */
function validateResponse(overrides: Partial<{ warnings: string[] }> = {}) {
    return {
        success: true, executed: false,
        warnings: overrides.warnings ?? [],
        derivedInputs: ['price', 'quantity'],
        derivedOutputs: ['order_total'],
    };
}

async function openModal(config: JsQuestionConfig = BASE): Promise<ReturnType<typeof userEvent.setup>> {
    const user = userEvent.setup();
    render(
        <JSCodeEditorSection
            config={config}
            elementId="step-1"
            pageId="page-1"
            workflowId="workflow-1"
            title="Order total"
        />
    );
    await user.click(screen.getByRole('button', { name: /open code editor/i }));
    await screen.findByRole('dialog');
    return user;
}

/** Radix Select: open the trigger, then pick the option by its accessible name. */
async function choose(user: ReturnType<typeof userEvent.setup>, control: string, option: string): Promise<void> {
    await user.click(screen.getByRole('combobox', { name: control }));
    await user.click(await screen.findByRole('option', { name: option }));
}

function savedConfig(): JsQuestionConfig {
    const call = mutateAsyncMock.mock.calls.at(-1) as [{ config: JsQuestionConfig }] | undefined;
    if (!call) { throw new Error('save was never attempted'); }
    return call[0].config;
}

describe('CB-8 Code Block editor modal', () => {
    beforeEach(() => {
        fetchAPIMock.mockResolvedValue(validateResponse());
        mutateAsyncMock.mockImplementation(
            ({ id, config }: { id: string; config: JsQuestionConfig }) =>
                Promise.resolve({ id, config })
        );
    });

    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it('AC 3: lists derived input keys and persists a required → optional toggle', async () => {
        const user = await openModal();

        // Derived from the code by CB-5's AST pass, fetched on open.
        await waitFor(() => {
            expect(fetchAPIMock).toHaveBeenCalledWith(
                '/api/steps/step-1/code-block/test',
                expect.objectContaining({ method: 'POST' })
            );
        });
        expect(screen.getByRole('switch', { name: 'Required: price' })).toBeTruthy();
        expect(screen.getByRole('switch', { name: 'Required: quantity' })).toBeTruthy();

        await user.click(screen.getByRole('switch', { name: 'Required: quantity' }));
        await user.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => { expect(mutateAsyncMock).toHaveBeenCalledTimes(1); });
        const persisted = savedConfig();
        expect(persisted.inputs).toEqual([
            { key: 'price', required: true },
            { key: 'quantity', required: false },
        ]);

        // Re-mount from what was stored: the toggle must come back off.
        cleanup();
        await openModal(persisted);
        expect(screen.getByRole('switch', { name: 'Required: quantity' }).getAttribute('aria-checked')).toBe('false');
    });

    it('AC 4: lists derived output keys and persists a declared type change', async () => {
        const user = await openModal();
        expect(screen.getByRole('combobox', { name: 'Type: order_total' })).toBeTruthy();

        await choose(user, 'Type: order_total', 'string');
        await user.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => { expect(mutateAsyncMock).toHaveBeenCalledTimes(1); });
        const persisted = savedConfig();
        expect(persisted.outputs).toEqual([{ key: 'order_total', type: 'string' }]);

        cleanup();
        await openModal(persisted);
        expect(screen.getByRole('combobox', { name: 'Type: order_total' }).textContent).toContain('string');
    });

    it('AC 5: persists trigger and repeat', async () => {
        const user = await openModal();
        await choose(user, 'Trigger', 'Run complete');
        await choose(user, 'Repeat', 'Always');
        await user.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => { expect(mutateAsyncMock).toHaveBeenCalledTimes(1); });
        expect(savedConfig()).toMatchObject({ trigger: 'runComplete', repeat: 'always' });

        cleanup();
        await openModal(savedConfig());
        expect(screen.getByRole('combobox', { name: 'Trigger' }).textContent).toContain('Run complete');
        expect(screen.getByRole('combobox', { name: 'Repeat' }).textContent).toContain('Always');
    });

    it('AC 5: the trigger page appears only for atPage, and persists', async () => {
        const user = await openModal();
        expect(screen.queryByRole('combobox', { name: 'Trigger page' })).toBeNull();

        await choose(user, 'Trigger', 'From a page onward');
        expect(screen.getByRole('combobox', { name: 'Trigger page' })).toBeTruthy();
        await choose(user, 'Trigger page', 'Pricing');
        await user.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => { expect(mutateAsyncMock).toHaveBeenCalledTimes(1); });
        const persisted = savedConfig();
        expect(persisted).toMatchObject({ trigger: 'atPage', triggerPageId: 'page-2' });

        cleanup();
        await openModal(persisted);
        expect(screen.getByRole('combobox', { name: 'Trigger page' }).textContent).toContain('Pricing');
    });

    it('AC 5: switching away from atPage clears the page the server would reject', async () => {
        const user = await openModal({ ...BASE, trigger: 'atPage', triggerPageId: 'page-2' });
        await choose(user, 'Trigger', 'Every submit');
        await user.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => { expect(mutateAsyncMock).toHaveBeenCalledTimes(1); });
        expect(savedConfig().triggerPageId).toBeUndefined();
        // The real rule this mirrors, from the server, not paraphrased:
        expect(() => { validateFiringPolicy({ trigger: 'everySubmit', triggerPageId: 'page-2' }); })
            .toThrow(/triggerPageId is only allowed when trigger is "atPage"/);
    });

    it('AC 7: CB-7 alias collision renders against the outputs panel, not as a toast', async () => {
        const user = await openModal();
        const collision = 'Alias "order_total" is already in use by step "Order total" (step-9). Please choose a unique alias.';
        mutateAsyncMock.mockRejectedValueOnce(new Error(collision));

        await user.click(screen.getByRole('button', { name: 'Save' }));

        const outputs = screen.getByRole('region', { name: /outputs/i });
        expect(within(outputs).getByRole('alert').textContent).toBe(collision);
        // Still open — an author cannot fix what has been dismissed.
        expect(screen.getByRole('dialog')).toBeTruthy();
    });

    it('AC 7: CB-6 impure-helper rejection renders against the repeat control', async () => {
        const user = await openModal();
        const impure = "Code Block calls impure helper(s): now. Choose repeat 'once' (compute and freeze) or 'always' (recompute every evaluation); 'onChange' cannot track these changes.";
        mutateAsyncMock.mockRejectedValueOnce(new Error(impure));

        await user.click(screen.getByRole('button', { name: 'Save' }));

        const firing = screen.getByRole('region', { name: /firing/i });
        expect(within(firing).getByRole('alert').textContent).toBe(impure);
    });

    it('AC 7: CB-5 refuses an illegal derived output key, inline on outputs', async () => {
        const user = await openModal();
        // The real message, produced by the real validator rather than retyped.
        const aliasError = (() => {
            try { validateAliasFormat('2bad key'); return 'never'; }
            catch (error) { return (error as Error).message; }
        })();
        mutateAsyncMock.mockRejectedValueOnce(new Error(aliasError));

        await user.click(screen.getByRole('button', { name: 'Save' }));

        const outputs = screen.getByRole('region', { name: /outputs/i });
        expect(within(outputs).getByRole('alert').textContent).toBe(aliasError);
    });

    it("AC 7: CB-5's dynamic-access warning reaches the author instead of dying in a log line", async () => {
        // Produced by the real AST pass — the same call ScriptEngine.validate makes.
        const warning = new ASTValidator()
            .validateJavaScript('const k = "quantity"; emit({ order_total: input.price * input[k] });')
            .warnings?.[0];
        expect(warning).toMatch(/^Dynamic input access/);
        fetchAPIMock.mockResolvedValue(validateResponse({ warnings: [warning as string] }));

        await openModal();

        const inputs = await screen.findByRole('region', { name: /inputs/i });
        await waitFor(() => {
            expect(within(inputs).getByRole('status').textContent).toContain(warning);
        });
    });

    it('routes every server error phrase to the field that owns it', () => {
        expect(classifySaveError('Validation error: triggerPageId is required when trigger is "atPage"')).toBe('trigger');
        expect(classifySaveError("Code Block calls impure helper(s): now. Choose repeat 'once' ...")).toBe('repeat');
        expect(classifySaveError('Validation error: Code Block inputs and outputs form a cycle: a → b → a')).toBe('outputs');
        expect(classifySaveError('Alias "x" is already in use by step "X" (id). Please choose a unique alias.')).toBe('outputs');
        expect(classifySaveError('Script validation failed: Forbidden construct: process.exit')).toBe('code');
        expect(classifySaveError("Validation error: Invalid config for step type 'js_question': config.outputs: Array must contain at least 1 element(s)")).toBe('outputs');
        expect(classifySaveError('Failed to update step')).toBe('general');
        expect(classifyWarning('Dynamic input access: declare input keys manually; they cannot all be derived from code.')).toBe('inputs');
        expect(classifyWarning('Dynamic output access: declare output keys manually; they cannot all be derived from code.')).toBe('outputs');
        expect(classifyWarning('Code does not call emit(). Script will not produce output.')).toBe('code');
    });
});
