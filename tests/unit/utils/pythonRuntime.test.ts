/**
 * Python runtime probe (CB-11).
 *
 * The bug this module exists for could not be caught by any test: the Dockerfile
 * installed `python3` in the *builder* stage only, so `spawn("python3", ...)`
 * ENOENTed in the deployed image while every suite stayed green. The probe cannot
 * make that testable either — the image is not the test environment — but it CAN
 * be held to the two things that decide whether it is worth having:
 *
 *  1. A missing interpreter is detected via `error`/ENOENT, not by hanging or
 *     throwing, and reported as unavailable.
 *  2. The generic message reaches the caller; the real spawn error reaches only
 *     the log. `/health` is unauthenticated.
 *
 * These spawn for real rather than mocking `child_process`, because a mocked
 * spawn would prove nothing about ENOENT arriving on `error` instead of `close` —
 * which is the single behaviour the whole probe turns on. `process.execPath`
 * (node itself) stands in for "an interpreter that is present": it is guaranteed
 * to exist on any machine running this suite and exits 0 on `--version`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const loggerError = vi.fn();

vi.mock('../../../server/logger', () => ({
  logger: { error: loggerError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  createLogger: () => ({ error: loggerError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const ABSENT = 'ezbuildr-definitely-not-a-python-9d3f1c';
const ORIGINAL = process.env.SANDBOX_PYTHON_EXECUTABLE;

/** `PYTHON_EXECUTABLE` is resolved at module scope, so each posture needs a fresh import. */
async function loadWith(executable: string) {
  process.env.SANDBOX_PYTHON_EXECUTABLE = executable;
  vi.resetModules();
  return import('../../../server/utils/pythonRuntime');
}

beforeEach(() => {
  loggerError.mockClear();
});

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.SANDBOX_PYTHON_EXECUTABLE;
  } else {
    process.env.SANDBOX_PYTHON_EXECUTABLE = ORIGINAL;
  }
});

describe('checkPythonSandbox', () => {
  it('reports available when the interpreter exists and exits 0', async () => {
    const { checkPythonSandbox } = await loadWith(process.execPath);

    await expect(checkPythonSandbox()).resolves.toEqual({ available: true });
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('reports unavailable — without hanging or throwing — when the binary is missing', async () => {
    const { checkPythonSandbox } = await loadWith(ABSENT);

    const health = await checkPythonSandbox();

    expect(health.available).toBe(false);
    expect(health.error).toBe('Python interpreter is not available');
  });

  it('keeps the raw spawn error out of the result and puts it in the log', async () => {
    const { checkPythonSandbox } = await loadWith(ABSENT);

    const health = await checkPythonSandbox();

    // Nothing in the payload may name the binary or the OS error: this value is
    // rendered by an unauthenticated endpoint.
    const body = JSON.stringify(health);
    expect(body).not.toContain(ABSENT);
    expect(body).not.toContain('ENOENT');
    expect(body).not.toContain('spawn');

    // The operator still gets the real reason, server-side.
    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        executable: ABSENT,
        detail: expect.stringContaining('ENOENT') as unknown as string,
      }),
      expect.stringContaining('Python sandbox unavailable')
    );
  });

  it('probes once and caches — /health is unauthenticated and must not spawn per request', async () => {
    const { checkPythonSandbox } = await loadWith(process.execPath);

    const first = checkPythonSandbox();
    const second = checkPythonSandbox();

    // The same promise, not merely an equal result: a fresh spawn per call would
    // turn the health endpoint into its own denial-of-service vector.
    expect(first).toBe(second);
    await expect(first).resolves.toEqual({ available: true });
  });

  it('re-probes after the test seam clears the cache', async () => {
    const { checkPythonSandbox, resetPythonSandboxProbe } = await loadWith(process.execPath);

    const first = checkPythonSandbox();
    resetPythonSandboxProbe();
    const second = checkPythonSandbox();

    expect(first).not.toBe(second);
    await expect(second).resolves.toEqual({ available: true });
  });
});

describe('PYTHON_EXECUTABLE', () => {
  it('honours SANDBOX_PYTHON_EXECUTABLE so the probe and the executor cannot diverge', async () => {
    const { PYTHON_EXECUTABLE } = await loadWith('/usr/local/bin/python3.12');

    expect(PYTHON_EXECUTABLE).toBe('/usr/local/bin/python3.12');
  });
});
