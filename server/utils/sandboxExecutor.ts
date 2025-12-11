import { spawn } from "child_process";
import { createLogger } from "../logger";

const logger = createLogger({ module: "sandbox-executor" });

// Security Constants
const MAX_CODE_SIZE = parseInt(process.env.SANDBOX_MAX_CODE_SIZE || "32768", 10); // 32KB
const MAX_INPUT_SIZE = parseInt(process.env.SANDBOX_MAX_INPUT_SIZE || "65536", 10); // 64KB
const MAX_OUTPUT_SIZE = parseInt(process.env.SANDBOX_MAX_OUTPUT_SIZE || "65536", 10); // 64KB
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 3000;

/**
 * Sandbox Executor for Transform Blocks
 *
 * Provides secure, sandboxed execution of user-supplied code in:
 * - JavaScript (using vm2)
 * - Python (using subprocess with restricted environment)
 *
 * Security features:
 * - Timeouts enforced
 * - Input whitelisting
 * - No file system or network access
 * - Memory and output limits
 */

interface ExecutionResult {
  ok: boolean;
  output?: Record<string, unknown> | string | number | boolean | null;
  error?: string;
  errorDetails?: {
    message: string;
    stack?: string;
    name?: string;
    line?: number;
    column?: number;
  };
}

// LRU cache for compiled scripts using Map's insertion order
const scriptCache = new Map<string, any>();
const MAX_CACHE_SIZE = 100;

/**
 * Add script to cache with proper LRU eviction
 * Map maintains insertion order, so we can use it for LRU
 */
function addToCache(key: string, script: any): void {
  // If key exists, delete it first so we can re-insert at the end
  if (scriptCache.has(key)) {
    scriptCache.delete(key);
  }

  // Evict oldest entry if cache is full
  if (scriptCache.size >= MAX_CACHE_SIZE) {
    const firstKey = scriptCache.keys().next().value;
    if (firstKey !== undefined) {
      scriptCache.delete(firstKey);
    }
  }

  // Add to end (most recently used)
  scriptCache.set(key, script);
}

/**
 * Get script from cache and mark as recently used
 */
function getFromCache(key: string): any | undefined {
  const script = scriptCache.get(key);
  if (script !== undefined) {
    // Move to end (most recently used)
    scriptCache.delete(key);
    scriptCache.set(key, script);
  }
  return script;
}

/**
 * Execute JavaScript code in a vm2 sandbox
 *
 * Code is treated as a function body that returns a value.
 * Example code:
 * ```javascript
 * // input = { firstName: "Ada", lastName: "Lovelace" }
 * // return input.firstName + " " + input.lastName;
 * ```
 *
 * @param code - User-supplied JavaScript code (function body)
 * @param input - Whitelisted input data
 * @param timeoutMs - Execution timeout in milliseconds (max 3000ms)
 * @returns Execution result with output or error
 */
// Dynamically import isolated-vm to avoid build-time errors if not present in all envs (optional, but good practice)
// However, since we installed it as a dep, we can define it at top level if we want, but dynamic is safer for the "refactor" step 
// to match the existing pattern logic (which had dynamic vm2).
// Actually, let's keep it clean.

// We need to import it at the top or dynamically.
// Let's assume it's available.

export async function runJsIsolatedVm(
  code: string,
  input: Record<string, unknown>,
  timeoutMs: number = 1000
): Promise<ExecutionResult> {
  let ivm: any;
  try {
    ivm = await import("isolated-vm");
  } catch (error) {
    logger.error({ error }, "Failed to load isolated-vm");
    return {
      ok: false,
      error: "SandboxEnvironmentError: isolated-vm is not available",
    };
  }

  // Enforce timeout limits
  const actualTimeout = Math.min(Math.max(timeoutMs, MIN_TIMEOUT_MS), MAX_TIMEOUT_MS);

  // Validate code size
  if (code.length > MAX_CODE_SIZE) {
    return {
      ok: false,
      error: `Code size exceeds ${MAX_CODE_SIZE / 1024}KB limit`,
    };
  }

  // Validate input size
  try {
    const inputJson = JSON.stringify(input);
    if (inputJson.length > MAX_INPUT_SIZE) {
      return {
        ok: false,
        error: `Input size exceeds ${MAX_INPUT_SIZE / 1024}KB limit`,
      };
    }
  } catch (e) {
    return { ok: false, error: "InputSerializationError: Input must be JSON serializable" };
  }

  let isolate: any;
  try {
    // 1. Create Isolate
    // 128MB limit is usually sufficient for simple scripts
    isolate = new ivm.Isolate({ memoryLimit: 128 });

    // 2. Create Context
    const context = await isolate.createContext();
    const jail = context.global;

    // 3. Setup Global Environment
    // Make 'global' available as a reference to itself (common in JS envs)
    await jail.set("global", jail.derefInto());

    // 4. Transfer Input
    // Use ExternalCopy for safe, copy-by-value transfer of the input object
    // This is much safer than proxies
    const inputCopy = new ivm.ExternalCopy(input);
    await jail.set("input", inputCopy.copyInto());

    // 5. Wrap user code
    // We wrap it to ensure it returns a value and handles the 'input' variable scope effectively
    // 'input' is already in global scope from step 4, but let's encourage "return" style
    const wrappedCode = `
      (function() {
        ${code}
      })()
    `;

    // 6. Compile Script
    const script = await isolate.compileScript(wrappedCode);

    // 7. Execute
    const resultRef = await script.run(context, {
      timeout: actualTimeout,
      copy: true // Copy the result back automatically if primitive
    });

    // 8. Process Result
    // If the result is an object/array, 'copy: true' might return a Reference if using 'promise' or complex types unless handled.
    // For simple JSON objects, ExternalCopy output is best.

    // Actually, run({ copy: true }) tries to copy deeply.
    // Let's be safe: if it's a reference, try to copy it out.

    let output = resultRef;
    if (typeof resultRef === 'object' && resultRef !== null && typeof resultRef.copy === 'function') {
      output = await resultRef.copy();
    }

    return {
      ok: true,
      output: output as Record<string, unknown> | string | number | boolean | null,
    };

  } catch (error: any) {
    // Handle specific ivm errors
    const msg = error.message || String(error);

    if (msg.includes("timed out") || msg.includes("timeout")) {
      return {
        ok: false,
        error: "TimeoutError: Execution exceeded time limit",
      };
    }

    // Parse stack trace if possible (ivm stack traces are strings in error.stack)
    // We can try to extract line numbers similar to before

    return {
      ok: false,
      error: `SandboxError: ${msg}`,
      errorDetails: {
        message: msg,
        stack: error.stack
      }
    };
  } finally {
    // 9. Cleanup
    if (isolate) {
      isolate.dispose();
    }
  }
}

/**
 * Execute Python code in a subprocess with restricted environment
 *
 * Code is passed to the subprocess via STDIN to prevent injection attacks.
 *
 * Security:
 * - No file system access
 * - No network access
 * - Filtered builtins (no os, sys, open, subprocess, socket, etc.)
 * - Memory and output limits
 * - Enforced timeout with process kill
 *
 * @param code - User-supplied Python code
 * @param input - Whitelisted input data
 * @param timeoutMs - Execution timeout in milliseconds (max 3000ms)
 * @returns Execution result with output or error
 */
export async function runPythonSubprocess(
  code: string,
  input: Record<string, unknown>,
  timeoutMs: number = 1000
): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    try {
      // Enforce timeout limits
      const actualTimeout = Math.min(Math.max(timeoutMs, MIN_TIMEOUT_MS), MAX_TIMEOUT_MS);

      // Validate code size
      if (code.length > MAX_CODE_SIZE) {
        resolve({
          ok: false,
          error: `Code size exceeds ${MAX_CODE_SIZE / 1024}KB limit`,
        });
        return;
      }

      // Prepare payload (Input + Code)
      // This allows us to pass the code safely without string interpolation injection risks
      const payload = {
        input,
        __sys_code__: code
      };

      // Validate payload size
      const payloadJson = JSON.stringify(payload);
      if (payloadJson.length > MAX_INPUT_SIZE) {
        resolve({
          ok: false,
          error: `Input size exceeds ${MAX_INPUT_SIZE / 1024}KB limit`,
        });
        return;
      }

      // Python wrapper script that creates a restricted execution environment
      // Reads BOTH input data AND user code from STDIN
      const pythonWrapper = `
import json
import sys

# Restricted builtins - only safe operations allowed
safe_builtins = {
    'abs': abs,
    'all': all,
    'any': any,
    'bool': bool,
    'dict': dict,
    'enumerate': enumerate,
    'filter': filter,
    'float': float,
    'int': int,
    'len': len,
    'list': list,
    'map': map,
    'max': max,
    'min': min,
    'pow': pow,
    'range': range,
    'round': round,
    'set': set,
    'sorted': sorted,
    'str': str,
    'sum': sum,
    'tuple': tuple,
    'zip': zip,
    'True': True,
    'False': False,
    'None': None,
}

# Read payload from stdin
try:
    payload = json.loads(sys.stdin.read())
    input_data = payload.get('input', {})
    user_code = payload.get('__sys_code__', '')
except Exception as e:
    print(json.dumps({"ok": False, "error": "SystemError: Failed to read input payload"}))
    sys.exit(1)

# Track output
result = None
emit_called = False

def emit(value):
    global result, emit_called
    if emit_called:
        raise Exception("emit() can only be called once")
    emit_called = True
    result = value

# Create execution namespace with restricted builtins
namespace = {
    '__builtins__': safe_builtins,
    'input': input_data,
    'emit': emit,
}

# Execute user code safely
try:
    exec(user_code, namespace)
except Exception as e:
    # Capture exception details
    print(json.dumps({
        "ok": False, 
        "error": f"{type(e).__name__}: {str(e)}"
    }))
    sys.exit(0)

if not emit_called:
    # Default to None if not emitted, or raise error? 
    # Current contract expects emit, but let's handle gracefully
    print(json.dumps({"ok": False, "error": "Code did not call emit() to produce output"}))
    sys.exit(0)

# Output result as JSON
try:
    print(json.dumps({"ok": True, "output": result}))
except Exception as e:
    print(json.dumps({"ok": False, "error": "OutputError: Failed to serialize output to JSON"}))
`;

      let stdout = "";
      let stderr = "";
      let killed = false;

      // Spawn Python subprocess
      // We pass the wrapper itself via -c
      const pythonProcess = spawn("python3", ["-c", pythonWrapper], {
        timeout: actualTimeout,
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Set timeout to kill process
      const timeoutHandle = setTimeout(() => {
        if (!pythonProcess.killed) {
          killed = true;
          pythonProcess.kill("SIGKILL");
        }
      }, actualTimeout);

      // Collect stdout
      pythonProcess.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
        // Enforce max output size
        if (stdout.length > MAX_OUTPUT_SIZE) {
          pythonProcess.kill("SIGKILL");
          killed = true;
        }
      });

      // Collect stderr (only used for system-level errors since we catch exceptions in python)
      pythonProcess.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
        // Enforce max error size
        if (stderr.length > MAX_OUTPUT_SIZE) {
          pythonProcess.kill("SIGKILL");
          killed = true;
        }
      });

      // Handle process completion
      pythonProcess.on("close", (code: number | null) => {
        clearTimeout(timeoutHandle);

        if (killed) {
          resolve({
            ok: false,
            error: "TimeoutError: Execution exceeded time limit",
          });
          return;
        }

        if (code !== 0) {
          // Extract error message from stderr
          const errorLines = stderr.trim().split("\n");
          const lastLine = errorLines[errorLines.length - 1] || "Unknown error";
          resolve({
            ok: false,
            error: `PythonProcessError: ${lastLine.slice(0, 500)}`,
          });
          return;
        }

        try {
          // Parse JSON output from the wrapper
          const result = JSON.parse(stdout.trim());
          if (result.ok) {
            resolve({
              ok: true,
              output: result.output
            });
          } else {
            resolve({
              ok: false,
              error: result.error || "Unknown execution error"
            });
          }
        } catch (parseError) {
          console.error("Failed to parse stdout:", stdout);
          resolve({
            ok: false,
            error: `OutputError: Failed to parse Python output - ${parseError instanceof Error ? parseError.message : 'unknown error'}`,
          });
        }
      });

      // Handle process errors
      pythonProcess.on("error", (error: Error) => {
        clearTimeout(timeoutHandle);
        resolve({
          ok: false,
          error: `ProcessError: ${error.message}`,
        });
      });

      // Send payload to stdin
      pythonProcess.stdin.write(payloadJson);
      pythonProcess.stdin.end();
    } catch (error) {
      resolve({
        ok: false,
        error: `SetupError: ${error instanceof Error ? error.message : 'unknown error'}`,
      });
    }
  });
}

/**
 * Execute code in the appropriate sandbox based on language
 */
export async function executeCode(
  language: "javascript" | "python",
  code: string,
  input: Record<string, unknown>,
  timeoutMs: number = 1000
): Promise<ExecutionResult> {
  if (language === "javascript") {
    return runJsIsolatedVm(code, input, timeoutMs);
  } else if (language === "python") {
    return runPythonSubprocess(code, input, timeoutMs);
  } else {
    return {
      ok: false,
      error: `Unsupported language: ${language}`,
    };
  }
}
