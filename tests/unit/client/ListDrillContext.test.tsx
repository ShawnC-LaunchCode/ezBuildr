// @vitest-environment jsdom
/**
 * LIST-8 — the drill-in navigation stack's browser-history wiring (AC9:
 * "Browser back pops one drill level instead of leaving the run"). Every
 * level entered pushes one history entry; every level left — hardware back
 * or our own UI-triggered `history.back()` — pops through the SAME
 * `popstate` handler, so this test drives both paths through one harness.
 */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ListDrillProvider,
  useListDrill,
} from '../../../client/src/components/runner/list/ListDrillContext';

function Harness() {
  const { drill, enterList, pushSegment, popOne, clearAutoFocus } = useListDrill();

  return (
    <div>
      <p data-testid="depth">{drill?.segments.length ?? 0}</p>
      <p data-testid="labels">{drill?.segments.map((s) => s.label).join(',') ?? ''}</p>
      <p data-testid="autofocus">{String(drill?.segments.at(-1)?.autoFocusFirstField ?? false)}</p>
      <button onClick={() => { enterList('step-1', { fieldAlias: null, itemId: 'ava', label: 'Ava', autoFocusFirstField: true }); }}>
        enter
      </button>
      <button onClick={() => { pushSegment({ fieldAlias: 'addresses', itemId: 'addr-1', label: '1 Oak St' }); }}>
        push
      </button>
      <button onClick={popOne}>pop</button>
      <button onClick={clearAutoFocus}>clearAutoFocus</button>
    </div>
  );
}

function renderHarness() {
  return render(
    <ListDrillProvider>
      <Harness />
    </ListDrillProvider>
  );
}

afterEach(() => {
  cleanup();
});

describe('ListDrillProvider history wiring', () => {
  it('enterList opens depth 1 and pushes a history entry', async () => {
    const user = userEvent.setup();
    const startLength = window.history.length;
    renderHarness();

    await user.click(screen.getByText('enter'));

    expect(screen.getByTestId('depth').textContent).toBe('1');
    expect(screen.getByTestId('labels').textContent).toBe('Ava');
    expect(window.history.length).toBe(startLength + 1);
  });

  it('pushSegment drills to depth 2 and pushes another history entry', async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByText('enter'));
    const afterEnter = window.history.length;
    await user.click(screen.getByText('push'));

    expect(screen.getByTestId('depth').textContent).toBe('2');
    expect(screen.getByTestId('labels').textContent).toBe('Ava,1 Oak St');
    expect(window.history.length).toBe(afterEnter + 1);
  });

  it('popOne (UI-triggered) goes through history.back() and pops exactly one level', async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByText('enter'));
    await user.click(screen.getByText('push'));
    expect(screen.getByTestId('depth').textContent).toBe('2');

    await user.click(screen.getByText('pop'));

    await waitFor(() => {
      expect(screen.getByTestId('depth').textContent).toBe('1');
    });
    expect(screen.getByTestId('labels').textContent).toBe('Ava');
  });

  it('closes entirely (drill becomes null) after popping the last level', async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByText('enter'));
    await user.click(screen.getByText('pop'));

    await waitFor(() => {
      expect(screen.getByTestId('depth').textContent).toBe('0');
    });
  });

  it('a genuine hardware/gesture back button press pops one level too — the SAME path as the UI pop button, not a separate implementation', async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByText('enter'));
    await user.click(screen.getByText('push'));
    expect(screen.getByTestId('depth').textContent).toBe('2');

    // Simulate the browser's own back button — NOT calling our popOne prop,
    // to prove the handler reacts to any popstate, not just ones we triggered.
    act(() => {
      window.history.back();
    });

    await waitFor(() => {
      expect(screen.getByTestId('depth').textContent).toBe('1');
    });
  });

  it('clearAutoFocus strips the flag from only the deepest segment', async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByText('enter'));
    expect(screen.getByTestId('autofocus').textContent).toBe('true');

    await user.click(screen.getByText('clearAutoFocus'));
    expect(screen.getByTestId('autofocus').textContent).toBe('false');
  });
});
