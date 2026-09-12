/**
 * Where the Python interpreter lives, and whether it is actually there (CB-11).
 *
 * Deliberately a standalone module rather than part of `enhancedSandboxExecutor`,
 * for two reasons:
 *
 *  1. **One name for the binary.** `executePython` spawns `PYTHON_EXECUTABLE` and
 *     `/health` probes `PYTHON_EXECUTABLE`. A readiness probe that checks a
 *     different binary than the executor runs is worse than no probe at all, so
 *     the constant has exactly one definition and both sides import it.
 *  2. **`/health` stays cheap to import.** The executor pulls in `vm`, the helper
 *     library and the optional isolated-vm bridge. A health route has no business
 *     dragging a sandbox into its import graph just to ask whether a file exists.
 */
import { spawn } from "child_process";

import { createLogger } from "../logger";

const logger = createLogger({ module: "python-runtime" });

// Python installs expose different launcher names by platform. On Windows,
// `python3.exe` is commonly a Microsoft Store shim even when a real
// `python.exe` interpreter is installed; Linux CI exposes `python3`.
export const PYTHON_EXECUTABLE = process.env.SANDBOX_PYTHON_EXECUTABLE
  ?? (process.platform === "win32" ? "python" : "python3");

export interface PythonSandboxHealth {
  available: boolean;
  /** Generic; the raw spawn error goes to the log, never to an unauthenticated caller. */
  error?: string;
}

const PROBE_TIMEOUT_MS = 2000;
const UNAVAILABLE = "Python interpreter is not available";

let probe: Promise<PythonSandboxHealth> | undefined;

/**
 * The interpreter is a property of the DEPLOYED IMAGE, not of the code, so no test
 * in this repo can tell you it is missing: the Dockerfile installed `python3` in the
 * *builder* stage only until CB-11, and every Python Code Block ENOENTed in
 * production while the whole suite stayed green. This is how that becomes visible.
 */
function runProbe(): Promise<PythonSandboxHealth> {
  return new Promise<PythonSandboxHealth>((resolve) => {
    let settled = false;
    const done = (health: PythonSandboxHealth, detail?: string): void => {
      if (settled) { return; }
      settled = true;
      if (!health.available) {
        logger.error(
          { executable: PYTHON_EXECUTABLE, detail },
          "Python sandbox unavailable - Python Code Blocks will fail on this instance"
        );
      }
      resolve(health);
    };

    try {
      const child = spawn(PYTHON_EXECUTABLE, ["--version"], { stdio: "ignore" });
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        done({ available: false, error: "Python interpreter probe timed out" }, "timeout");
      }, PROBE_TIMEOUT_MS);

      // `error` fires INSTEAD of `close` when the binary does not exist (ENOENT),
      // which is precisely the production case this exists to catch.
      child.on("error", (err: Error) => {
        clearTimeout(timer);
        done({ available: false, error: UNAVAILABLE }, err.message);
      });
      child.on("close", (code: number | null) => {
        clearTimeout(timer);
        if (code === 0) {
          done({ available: true });
        } else {
          done({ available: false, error: UNAVAILABLE }, `exit ${String(code)}`);
        }
      });
    } catch (err: unknown) {
      // spawn can throw synchronously (EACCES on a non-executable path).
      done({ available: false, error: UNAVAILABLE }, err instanceof Error ? err.message : String(err));
    }
  });
}

/**
 * Cached: the answer is a property of the container's filesystem, which does not
 * change under a running process, and `/health` is unauthenticated — re-spawning a
 * subprocess per request would make the endpoint its own denial-of-service vector.
 */
export function checkPythonSandbox(): Promise<PythonSandboxHealth> {
  probe ??= runProbe();
  return probe;
}

/** Test seam: forget the cached result so a suite can assert both postures. */
export function resetPythonSandboxProbe(): void {
  probe = undefined;
}
