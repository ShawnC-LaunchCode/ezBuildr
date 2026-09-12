import * as fs from "fs";
import * as path from "path";

import { describe, it, expect } from "vitest";

/**
 * RLS-1 AC1 guard: `rlsContext` must be registered in BOTH application
 * entrypoints.
 *
 * Why a source-level assertion rather than a behavioural one. The behavioural
 * proof (`tests/integration/rls-context.middleware.test.ts`) mounts the
 * middleware onto its own test app, because the shared integration harness
 * builds its app from `registerRoutes`, which does not mount it — the
 * entrypoints do. That test therefore proves the middleware *works* and can
 * never notice one of the entrypoints losing its registration. Neither can
 * `tsc` or ESLint: a deleted `app.use(...)` call leaves no unused import once
 * the import is deleted with it, and no type error either way.
 *
 * The failure this guards is silent and severe: the tenant context simply
 * stops being populated in whichever entrypoint lost the line, so every
 * consumer of `getCurrentTenantId()` reads `undefined` and any RLS built on it
 * degrades to "no tenant" rather than failing loudly. Production and
 * development are separate files, so it can break in production alone.
 *
 * Same rationale as `tests/unit/client/store.deadSetters.test.ts`, which exists
 * because an uncalled store action is a *used property of an object literal*
 * and equally invisible to the compiler.
 */
const ENTRYPOINTS = ["server/index.ts", "server/production.ts"] as const;

/**
 * Drop comment lines before asserting.
 *
 * Without this the assertions are **vacuous**: a plain regex for
 * `app.use(rlsContext)` matches `// app.use(rlsContext);` just as happily, so
 * commenting the registration out — the single most likely way it gets
 * disabled — would leave every test in this file green. Verified by mutation:
 * with the line commented out and no stripping, all six passed.
 *
 * Line-oriented on purpose. A character-level stripper has to reason about
 * `//` inside string literals (these files contain URLs), which is more ways to
 * be wrong than the job needs; a disabled `app.use(...)` is always a whole
 * commented line or a block comment.
 */
function stripComments(source: string): string {
    let inBlock = false;
    return source
        .split("\n")
        .filter((line) => {
            const trimmed = line.trim();
            if (inBlock) {
                if (trimmed.includes("*/")) { inBlock = false; }
                return false;
            }
            if (trimmed.startsWith("/*")) {
                if (!trimmed.includes("*/")) { inBlock = true; }
                return false;
            }
            return !trimmed.startsWith("//") && !trimmed.startsWith("*");
        })
        .join("\n");
}

function readEntrypoint(relativePath: string): string {
    return stripComments(fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8"));
}

describe("rlsContext is registered in every entrypoint (RLS-1 AC1)", () => {
    it.each(ENTRYPOINTS)("%s imports rlsContext", (entrypoint) => {
        const source = readEntrypoint(entrypoint);
        expect(source).toMatch(/import\s*\{[^}]*\brlsContext\b[^}]*\}\s*from\s*["'][^"']*middleware\/rlsContext["']/);
    });

    it.each(ENTRYPOINTS)("%s mounts rlsContext on the app", (entrypoint) => {
        const source = readEntrypoint(entrypoint);
        expect(source).toMatch(/app\.use\(\s*rlsContext\s*\)/);
    });

    it.each(ENTRYPOINTS)("%s mounts rlsContext before it registers routes", (entrypoint) => {
        const source = readEntrypoint(entrypoint);
        const mountIndex = source.search(/app\.use\(\s*rlsContext\s*\)/);
        // Match the CALL (`registerRoutes(app)`), not a bare `registerRoutes()`
        // mention — `server/index.ts` names it inside a comment above the
        // middleware stack, and a looser pattern matches that comment and
        // reports a false ordering violation.
        const registerIndex = source.search(/registerRoutes\s*\(\s*app\s*\)/);

        expect(mountIndex).toBeGreaterThan(-1);
        // Both entrypoints call registerRoutes; if that ever stops being true
        // this assertion should be revisited rather than silently skipped.
        expect(registerIndex).toBeGreaterThan(-1);
        // Express matches in registration order: mounted after the routes, the
        // middleware would never wrap them and the context would be empty for
        // every request while still appearing "registered".
        expect(mountIndex).toBeLessThan(registerIndex);
    });
});
