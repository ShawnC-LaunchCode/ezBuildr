import fs from 'fs';
import path from 'path';

import { describe, it, expect } from 'vitest';

import { lifecycleHookPhaseEnum } from '@shared/schema';

/**
 * SCRIPT-1 AC5. `lifecycleHookPhaseEnum` offered four phases and the builder let an
 * author save a hook on any of them, but only two were ever executed:
 * `BlockRunner.runPhase` was the sole caller of `executeHooksForPhase`, and its map
 * produced `beforePage` and `afterPage` only. `beforeFinalBlock` and
 * `afterDocumentsGenerated` appeared nowhere else in `server/`, so a hook saved on
 * either silently never ran — no error, no warning, nothing in a log.
 *
 * Four hand-written "does this phase fire" tests would not have prevented that,
 * because the phase that rots is the one nobody wrote a test for. This test is
 * driven by the enum itself: add a fifth phase and it fails until something
 * dispatches it.
 *
 * It deliberately greps source rather than executing a run. Proving a phase fires
 * end-to-end needs a full run with documents, which lives in the integration suite;
 * what must never regress is the cheap structural fact that *some* code path passes
 * each phase to the hook service.
 */

const SERVER_DIR = path.join(process.cwd(), 'server');

function collectTsFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTsFiles(full, acc);
    } else if (entry.name.endsWith('.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

/** Files that merely define or validate the enum, rather than dispatching a phase. */
const NON_DISPATCH_FILES = [
  path.join('services', 'scripting', 'LifecycleHookService.ts'),
  path.join('routes', 'lifecycleHooks.routes.ts'),
];

describe('lifecycle hook phase coverage (SCRIPT-1)', () => {
  const phases = lifecycleHookPhaseEnum.enumValues;

  const dispatchSources = collectTsFiles(SERVER_DIR)
    .filter((file) => !NON_DISPATCH_FILES.some((skip) => file.endsWith(skip)))
    .map((file) => fs.readFileSync(file, 'utf-8'));

  it('the enum still has the phases this test was written against', () => {
    // Guards the guard: if the enum were emptied or renamed wholesale, the
    // per-phase assertions below would all pass vacuously.
    expect(phases.length).toBeGreaterThanOrEqual(4);
    expect(phases).toContain('beforePage');
    expect(phases).toContain('afterDocumentsGenerated');
  });

  it.each(phases)('phase "%s" is dispatched by some code path', (phase) => {
    const dispatched = dispatchSources.some(
      (source) => source.includes(`'${phase}'`) || source.includes(`"${phase}"`)
    );

    expect(
      dispatched,
      `No file under server/ passes "${phase}" to executeHooksForPhase. ` +
        `A hook saved on this phase would be selectable in the builder and never run. ` +
        `Either dispatch it, or remove it from lifecycleHookPhaseEnum — a removed phase ` +
        `is honest, a dead one is not.`
    ).toBe(true);
  });
});
