/**
 * Enhanced Sandbox Executor for Custom Scripting System
 * Extends sandboxExecutor.ts with helper library and context injection
 */

import { spawn } from "child_process";
import vm from "vm";
import type { ScriptExecutionResult, ScriptContextAPI } from "@shared/types/scripting";
import { createHelperLibrary } from "../services/scripting/HelperLibrary";
import { createLogger } from "../logger";

const logger = createLogger({ module: "enhanced-sandbox" });

// Security Constants (Mirrored from sandboxExecutor)
const MAX_CODE_SIZE = parseInt(process.env.SANDBOX_MAX_CODE_SIZE ?? "32768", 10);
const MAX_INPUT_SIZE = parseInt(process.env.SANDBOX_MAX_INPUT_SIZE ?? "65536", 10);
const MAX_OUTPUT_SIZE = parseInt(process.env.SANDBOX_MAX_OUTPUT_SIZE ?? "65536", 10);
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 3000;

interface ExecuteCodeWithHelpersParams {
  language: "javascript" | "python";
  code: string;
  input: Record<string, unknown>;
  context: ScriptContextAPI;
  helpers?: Record<string, any>;
  timeoutMs?: number;
  consoleEnabled?: boolean;
  // Performance optimizations
  isolate?: any; // Re-use existing Isolate
  scriptCache?: Map<string, any>; // Cache compiled scripts
}

/**
 * Execute JavaScript code with helpers and context injection
 */
/**
 * Execute JavaScript code with helpers and context injection using isolated-vm
 */
async function runJsWithHelpers(
  code: string,
  input: Record<string, unknown>,
  context: ScriptContextAPI,
  helpers: Record<string, any> | undefined,
  timeoutMs: number,
  consoleEnabled: boolean,
  existingIsolate?: any,
  scriptCache?: Map<string, any>
): Promise<ScriptExecutionResult> {
  const helperLib = createHelperLibrary({ consoleEnabled });
  const actualHelpers = helpers || helperLib.helpers;

  let ivm: any;
  try {
    // @ts-ignore
    ivm = await import("isolated-vm");
  } catch (error) {
    logger.warn({ error }, "isolated-vm not found, falling back to node 'vm' module");
    return runJsWithVmFallback(code, input, context, actualHelpers, timeoutMs, consoleEnabled);
  }

  // Create or reuse Isolate
  const isolate = existingIsolate || new ivm.Isolate({ memoryLimit: 128 });
  const disposeIsolate = !existingIsolate; // Only dispose if we created it


  // Enforce timeout limits
  const actualTimeout = Math.min(Math.max(timeoutMs, MIN_TIMEOUT_MS), MAX_TIMEOUT_MS);

  // Validate code size
  if (code.length > MAX_CODE_SIZE) {
    return { ok: false, error: `Code size exceeds ${MAX_CODE_SIZE / 1024}KB limit` };
  }

  // Validate input size
  try {
    const inputJson = JSON.stringify(input);
    if (inputJson.length > MAX_INPUT_SIZE) {
      if (disposeIsolate) isolate.dispose();
      return { ok: false, error: `Input size exceeds ${MAX_INPUT_SIZE / 1024}KB limit` };
    }
  } catch (e) {
    if (disposeIsolate) isolate.dispose();
    return { ok: false, error: "InputSerializationError: Input must be JSON serializable" };
  }

  try {
    const ctx = await isolate.createContext();
    const jail = ctx.global;

    // 2. Setup Global Scope
    await jail.set("global", jail.derefInto());

    // 3. Transfer Input (Data)
    await jail.set("input", new ivm.ExternalCopy(input).copyInto());

    // 4. Transfer Context (Data - confirmed purely JSON)
    await jail.set("context", new ivm.ExternalCopy(context).copyInto());

    // 5. Setup Helpers Bridge
    // We can't transfer functions directly. We create a structure map and a generic caller.

    // Helper to get structure
    const getStructure = (obj: any): any => {
      if (typeof obj === 'function') return '__fn__';
      if (typeof obj === 'object' && obj !== null) {
        const struct: any = {};
        for (const k of Object.keys(obj)) {
          struct[k] = getStructure(obj[k]);
        }
        return struct;
      }
      return '__val__'; // Primitive value (we don't support passing values this way currently, only functions or nested objects)
    };

    const helpersStructure = getStructure(actualHelpers);
    await jail.set("_helpersStructure", new ivm.ExternalCopy(helpersStructure).copyInto());



    // We MUST allow the callback to be async (returns Promise) if target is async?
    // But isolated-vm 'applySync' cannot wait for Promise.
    // If target is async, we MUST use 'apply' in sandbox.
    // However, HelperLibrary functions are synchronous.
    // So we can use a synchronous callback for them.
    // But 'callHostParams' is async?
    // Let's make it sync if we can.
    // Wait, 'ExternalCopy' is synchronous.
    // If all helpers are synchronous, we can define the callback as synchronous?
    // ivm.Reference function wrapper is ... depends on how we define it.
    // Let's rely on ivm handling.
    // If we define:
    // jail.setSync("callHost", new ivm.Reference( (path, ...args) => ... ));

    await jail.set("callHost", new ivm.Reference(function (path: string[], ...args: any[]) {
      // With { arguments: { copy: true } }, path and args are copied by value (not References)

      let target: any = actualHelpers;
      // Debug log
      // logger.debug({ path: path.join('.') }, 'Bridge Path');

      for (const key of path) {
        if (!target) {
          throw new Error(`Helper not found: ${path.join('.')}`);
        }
        target = target[key];
      }

      const fn = target as Function;

      // Args are already copies
      const res = fn(...args);

      // Handle void return (undefined)
      if (res === undefined) return undefined;

      return new ivm.ExternalCopy(res).copyInto();
    }));

    // Bootstrap Script to rebuild helpers object
    const bootstrapCode = `
      function buildHelpers(struct, path = []) {
        if (struct === '__fn__') {
          return function(...args) {
            // Force copy of arguments to avoid Reference issues
            return callHost.applySync(undefined, [path, ...args], { arguments: { copy: true } });
          };
        }
        if (typeof struct === 'object') {
           const obj = {};
           for (const k in struct) {
             obj[k] = buildHelpers(struct[k], [...path, k]);
           }
           return obj;
        }
        return undefined;
      }
      
      const helpers = buildHelpers(_helpersStructure);
      
      // Wrap user code
      (function(input, context, helpers) {
         ${code}
      })(input, context, helpers);
    `;

    // 6. Compile & Run
    // 6. Compile & Run
    // Check cache
    // Simple hash: code string itself (could use SHA-256 for large code)
    const cacheKey = code;
    let script: any;

    if (scriptCache && scriptCache.has(cacheKey)) {
      script = scriptCache.get(cacheKey);
    } else {
      script = await isolate.compileScript(bootstrapCode);
      if (scriptCache) {
        scriptCache.set(cacheKey, script);
      }
    }

    const startTime = Date.now();

    const resultRef = await script.run(ctx, {
      timeout: actualTimeout,
      copy: true
    });

    const durationMs = Date.now() - startTime;

    // Unpack result if needed (same as runJsIsolatedVm)
    let output = resultRef;
    if (typeof resultRef === 'object' && resultRef !== null && typeof resultRef.copy === 'function') {
      output = await resultRef.copy();
    }

    // Explicitly dispose context (script is cached or disposed by isolate)
    ctx.release();

    return {
      ok: true,
      output: output as any,
      consoleLogs: helperLib.getConsoleLogs ? helperLib.getConsoleLogs() : undefined,
      durationMs,
    };

  } catch (error: any) {
    const msg = error.message || String(error);
    if (msg.includes("timed out") || msg.includes("timeout")) {
      return { ok: false, error: "TimeoutError: Execution exceeded time limit" };
    }
    return { ok: false, error: `SandboxError: ${msg}` };
  } finally {
    if (disposeIsolate && isolate) {
      isolate.dispose();
    }
  }
}

/**
 * Execute Python code with helpers and context injection
 * Helpers are serialized as utility functions available in Python
 */
async function runPythonWithHelpers(
  code: string,
  input: Record<string, unknown>,
  context: ScriptContextAPI,
  timeoutMs: number,
  consoleEnabled: boolean
): Promise<ScriptExecutionResult> {
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

      // Validate input size BEFORE combining with code to prevent DoS
      const inputJson = JSON.stringify(input);
      if (inputJson.length > MAX_INPUT_SIZE) {
        resolve({
          ok: false,
          error: `Input size exceeds ${MAX_INPUT_SIZE / 1024}KB limit. Size: ${inputJson.length} bytes.`,
        });
        return;
      }

      // Serialize context for Python
      const contextJson = JSON.stringify(context);

      // Prepare payload (Input + Code)
      const payload = {
        input,
        __sys_code__: code,
        __sys_context__: contextJson // Pass context string to be parsed in python
      };

      // Final combined size check (defense in depth)
      const payloadJson = JSON.stringify(payload);
      if (payloadJson.length > MAX_INPUT_SIZE + MAX_CODE_SIZE) {
        resolve({
          ok: false,
          error: `Combined payload size exceeds maximum allowed. Consider reducing input or code size.`,
        });
        return;
      }

      // Python wrapper script with helpers and context
      // Reads input, context, and code from stdin
      const pythonWrapper = `
import json
import sys
import math
from datetime import datetime, timedelta

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
    context_data = json.loads(payload.get('__sys_context__', '{}'))
    user_code = payload.get('__sys_code__', '')
except Exception as e:
    print(json.dumps({"ok": False, "error": "SystemError: Failed to read input payload"}))
    sys.exit(1)

# Track output
result = None
emit_called = False
console_logs = []

def emit(value):
    global result, emit_called
    if emit_called:
        raise Exception("emit() can only be called once")
    emit_called = True
    result = value

# Helper functions (Python implementations)
class Helpers:
    class date:
        @staticmethod
        def now():
            return datetime.now().isoformat()

        @staticmethod
        def add(date_str, value, unit):
            try:
                dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                if unit == 'days':
                    return (dt + timedelta(days=value)).isoformat()
                elif unit == 'hours':
                    return (dt + timedelta(hours=value)).isoformat()
                elif unit == 'minutes':
                    return (dt + timedelta(minutes=value)).isoformat()
                elif unit == 'seconds':
                    return (dt + timedelta(seconds=value)).isoformat()
                else:
                    raise ValueError(f"Unknown unit: {unit}")
            except Exception as e:
                raise ValueError(f"Date error: {str(e)}")

    class string:
        @staticmethod
        def upper(s):
            return str(s).upper()

        @staticmethod
        def lower(s):
            return str(s).lower()

        @staticmethod
        def trim(s):
            return str(s).strip()

        @staticmethod
        def slug(s):
            import re
            s = str(s).lower()
            s = re.sub(r'\\s+', '-', s)
            s = re.sub(r'[^a-z0-9-]', '', s)
            return s

    class number:
        @staticmethod
        def round(num, decimals=0):
            return round(float(num), decimals)

        @staticmethod
        def ceil(num):
            return math.ceil(float(num))

        @staticmethod
        def floor(num):
            return math.floor(float(num))

        @staticmethod
        def abs(num):
            return abs(float(num))

    class array:
        @staticmethod
        def unique(arr):
            # Sort to make deterministic, but handle mixed types gracefully
            return list(set(arr))

        @staticmethod
        def flatten(arr):
            result = []
            for item in arr:
                if isinstance(item, list):
                    result.extend(Helpers.array.flatten(item))
                else:
                    result.append(item)
            return result

    class math:
        @staticmethod
        def sum(arr):
            return sum(arr)

        @staticmethod
        def avg(arr):
            return sum(arr) / len(arr) if len(arr) > 0 else 0

        @staticmethod
        def min(arr):
            return min(arr)

        @staticmethod
        def max(arr):
            return max(arr)

    class console:
        @staticmethod
        def log(*args):
            console_logs.append(list(args))

        @staticmethod
        def warn(*args):
            console_logs.append(['[WARN]'] + list(args))

        @staticmethod
        def error(*args):
            console_logs.append(['[ERROR]'] + list(args))

helpers = Helpers()

# Create execution namespace
namespace = {
    '__builtins__': safe_builtins,
    'input': input_data,
    'context': context_data,
    'helpers': helpers,
    'emit': emit,
}

# Execute user code
try:
    exec(user_code, namespace)
except Exception as e:
    print(json.dumps({
        "ok": False, 
        "error": f"{type(e).__name__}: {str(e)}",
        "consoleLogs": console_logs
    }))
    sys.exit(0)

if not emit_called:
    print(json.dumps({
        "ok": False, 
        "error": "Code did not call emit() to produce output", 
        "consoleLogs": console_logs
    }))
    sys.exit(0)

# Output result as JSON
output = {
    "ok": True,
    "output": result
}

if console_logs:
    output["consoleLogs"] = console_logs

try:
    print(json.dumps(output))
except Exception as e:
     print(json.dumps({
        "ok": False, 
        "error": "OutputError: Failed to serialize output", 
        "consoleLogs": console_logs
    }))
`;

      let stdout = "";
      let stderr = "";
      let killed = false;
      const startTime = Date.now();

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
        // Enforce max output size
        if (stdout.length > MAX_OUTPUT_SIZE) {
          pythonProcess.kill("SIGKILL");
          killed = true;
        }
      });

      // Collect stderr
      pythonProcess.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
        if (stderr.length > MAX_OUTPUT_SIZE) {
          pythonProcess.kill("SIGKILL");
          killed = true;
        }
      });

      // Handle process completion
      pythonProcess.on("close", (code: number | null) => {
        clearTimeout(timeoutHandle);
        const durationMs = Date.now() - startTime;

        if (killed) {
          resolve({
            ok: false,
            error: "TimeoutError: Execution exceeded time limit",
            durationMs,
          });
          return;
        }

        if (code !== 0) {
          const errorLines = stderr.trim().split("\n");
          const lastLine = errorLines[errorLines.length - 1] || "Unknown error";
          resolve({
            ok: false,
            error: `PythonProcessError: ${lastLine.slice(0, 500)}`,
            durationMs,
          });
          return;
        }

        try {
          // Parse JSON output
          const result = JSON.parse(stdout.trim());
          result.durationMs = durationMs;
          resolve(result);
        } catch (parseError) {
          resolve({
            ok: false,
            error: `OutputError: Failed to parse Python output - ${parseError instanceof Error ? parseError.message : 'unknown error'}`,
            durationMs,
          });
        }
      });

      // Handle process errors
      pythonProcess.on("error", (error: Error) => {
        clearTimeout(timeoutHandle);
        resolve({
          ok: false,
          error: `ProcessError: ${error.message}`,
          durationMs: Date.now() - startTime,
        });
      });

      // Send payload to stdin
      pythonProcess.stdin.write(payloadJson);
      pythonProcess.stdin.end();
    } catch (error: any) {
      resolve({
        ok: false,
        error: `SetupError: ${error instanceof Error ? error.message : 'unknown error'}`,
      });
    }
  }); // End Promise
}

/**
 * Execute code with helpers and context injection
 * Main entry point for enhanced sandbox execution
 */
export async function executeCodeWithHelpers(
  params: ExecuteCodeWithHelpersParams
): Promise<ScriptExecutionResult> {
  const {
    language,
    code,
    input,
    context,
    helpers,
    timeoutMs = 1000,
    consoleEnabled = false,
  } = params;

  if (language === "javascript") {
    return runJsWithHelpers(
      code,
      input,
      context,
      helpers,
      timeoutMs,
      consoleEnabled,
      params.isolate,
      params.scriptCache
    );
  } else if (language === "python") {
    return runPythonWithHelpers(code, input, context, timeoutMs, consoleEnabled);
  } else {
    return {
      ok: false,
      error: `Unsupported language: ${language}`,
    };
  }
}

/**
 * Fallback execution using Node's native vm module
 * Used when isolated-vm is not available (e.g. dev/test environments)
 */
async function runJsWithVmFallback(
  code: string,
  input: Record<string, unknown>,
  context: ScriptContextAPI,
  actualHelpers: Record<string, any> | undefined,
  timeoutMs: number,
  consoleEnabled: boolean
): Promise<ScriptExecutionResult> {
  const consoleLogs: any[][] = [];

  const sandbox = {
    input,
    context,
    helpers: actualHelpers,
    console: {
      log: (...args: any[]) => consoleLogs.push(args),
      warn: (...args: any[]) => consoleLogs.push(['[WARN]', ...args]),
      error: (...args: any[]) => consoleLogs.push(['[ERROR]', ...args]),
      info: (...args: any[]) => consoleLogs.push(['[INFO]', ...args]),
    }
  };

  const startTime = Date.now();
  try {
    // Wrap code in function IIFE to mimic isolated-vm behavior
    const wrappedCode = `
      (function(input, context, helpers) {
        ${code}
      })(input, context, helpers);
    `;

    const script = new vm.Script(wrappedCode);
    const result = script.runInNewContext(sandbox, {
      timeout: timeoutMs
    });

    return {
      ok: true,
      output: result,
      consoleLogs: consoleLogs.length > 0 ? consoleLogs : undefined,
      durationMs: Date.now() - startTime
    };
  } catch (error: any) {
    const msg = error.message;
    if (msg.includes("timed out")) {
      return { ok: false, error: "TimeoutError: Execution exceeded time limit" };
    }
    return { ok: false, error: `SandboxError: ${msg}` };
  }
}
