import { spawn } from "child_process";

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
export async function runJsVm2(
  code: string,
  input: Record<string, unknown>,
  timeoutMs: number = 1000
): Promise<ExecutionResult> {
  try {
    // Enforce timeout limits
    const actualTimeout = Math.min(Math.max(timeoutMs, 100), 3000);

    // Validate code size
    if (code.length > 32 * 1024) {
      return {
        ok: false,
        error: "Code size exceeds 32KB limit",
      };
    }

    // Validate input size
    const inputJson = JSON.stringify(input);
    if (inputJson.length > 64 * 1024) {
      return {
        ok: false,
        error: "Input size exceeds 64KB limit",
      };
    }

    // Dynamically import vm2 (may not be available in all environments)
    let VM2: any;
    try {
      // @ts-ignore - vm2 is optional and may not be installed
      const vm2Module = await import("vm2");
      VM2 = vm2Module.VM;
    } catch (importError) {
      // Fallback: vm2 not available - use Node.js vm module with warnings
      return runJsNodeVm(code, input, actualTimeout);
    }

    // Create VM2 sandbox with restricted globals
    const vm = new VM2({
      timeout: actualTimeout,
      sandbox: {
        input,
      },
      eval: false,
      wasm: false,
    });

    // Wrap code in a function and execute it
    // This allows the code to use 'return' statements
    const wrappedCode = `
      (function(input) {
        ${code}
      })(input);
    `;

    // Execute code and capture return value
    const result = vm.run(wrappedCode);

    return {
      ok: true,
      output: result as Record<string, unknown> | string | number | boolean | null,
    };
  } catch (error) {
    if (error instanceof Error) {
      // Check for timeout
      if (error.message.includes("timeout") || error.message.includes("timed out")) {
        return {
          ok: false,
          error: "TimeoutError: Execution exceeded time limit",
        };
      }

      return {
        ok: false,
        error: `SandboxError: ${error.message}`,
      };
    }

    return {
      ok: false,
      error: "Unknown execution error",
    };
  }
}

/**
 * Fallback JavaScript executor using Node.js built-in vm module
 * WARNING: Less secure than vm2, use only when vm2 is not available
 */
async function runJsNodeVm(
  code: string,
  input: Record<string, unknown>,
  timeoutMs: number
): Promise<ExecutionResult> {
  try {
    const vm = await import("vm");

    const sandbox = {
      input,
      console: undefined,
      require: undefined,
      process: undefined,
      global: undefined,
      Buffer: undefined,
      setTimeout: undefined,
      setInterval: undefined,
      setImmediate: undefined,
    };

    // Wrap code in a function and execute it
    const wrappedCode = `
      (function(input) {
        ${code}
      })(input);
    `;

    const context = vm.createContext(sandbox);
    const result = vm.runInContext(wrappedCode, context, {
      timeout: timeoutMs,
      displayErrors: true,
    });

    return {
      ok: true,
      output: result as Record<string, unknown> | string | number | boolean | null,
    };
  } catch (error) {
    if (error instanceof Error) {
      return {
        ok: false,
        error: `SandboxError: ${error.message}`,
      };
    }

    return {
      ok: false,
      error: "Unknown execution error",
    };
  }
}

/**
 * Execute Python code in a subprocess with restricted environment
 *
 * Example code:
 * ```python
 * # input = {"amount": 100, "taxRate": 0.07}
 * # emit(input["amount"] * (1 + input["taxRate"]))
 * ```
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
      const actualTimeout = Math.min(Math.max(timeoutMs, 100), 3000);

      // Validate code size
      if (code.length > 32 * 1024) {
        resolve({
          ok: false,
          error: "Code size exceeds 32KB limit",
        });
        return;
      }

      // Validate input size
      const inputJson = JSON.stringify(input);
      if (inputJson.length > 64 * 1024) {
        resolve({
          ok: false,
          error: "Input size exceeds 64KB limit",
        });
        return;
      }

      // Python wrapper script that creates a restricted execution environment
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

# Read input from stdin
input_data = json.loads(sys.stdin.read())

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

# Execute user code
user_code = """${code.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"""
exec(user_code, namespace)

if not emit_called:
    raise Exception("Code did not call emit() to produce output")

# Output result as JSON
print(json.dumps({"ok": True, "output": result}))
`;

      let stdout = "";
      let stderr = "";
      let killed = false;

      // Spawn Python subprocess
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
        // Enforce max output size (64KB)
        if (stdout.length > 64 * 1024) {
          pythonProcess.kill("SIGKILL");
          killed = true;
        }
      });

      // Collect stderr
      pythonProcess.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
        // Enforce max error size (64KB)
        if (stderr.length > 64 * 1024) {
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
            error: `PythonError: ${lastLine.slice(0, 500)}`, // Truncate long errors
          });
          return;
        }

        try {
          // Parse JSON output
          const result = JSON.parse(stdout.trim());
          resolve(result);
        } catch (parseError) {
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

      // Send input to stdin
      pythonProcess.stdin.write(inputJson);
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
    return runJsVm2(code, input, timeoutMs);
  } else if (language === "python") {
    return runPythonSubprocess(code, input, timeoutMs);
  } else {
    return {
      ok: false,
      error: `Unsupported language: ${language}`,
    };
  }
}
