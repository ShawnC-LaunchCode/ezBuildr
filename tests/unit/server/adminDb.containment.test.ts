import fs from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";

/**
 * RLS-6 containment guard.
 *
 * server/db/adminDb.ts exposes a BYPASSRLS connection pool — a role that
 * reads across every tenant, on purpose, so the admin console keeps working
 * once RLS-4 sets FORCE ROW LEVEL SECURITY. Its entire safety property is
 * that exactly one module can reach it: server/services/AdminAccessService.ts,
 * called only from the admin routes. Neither `tsc` nor ESLint can catch a
 * *used* import that simply should not be there — the same class of gap
 * `tests/unit/client/store.deadSetters.test.ts` guards on the client side
 * (O-10: an uncalled store action is a used property of an object literal,
 * not an unused export). This is the server-side mirror of that shape.
 *
 * ALLOWED_FILES is a short, explicit allowlist rather than a directory/prefix
 * pattern, so widening it is a deliberate, reviewed edit — not something a
 * new file can slide into just by living under server/routes/ or
 * server/services/.
 */

const SERVER_ROOT = path.join(process.cwd(), "server");
const ADMIN_DB_MODULE = path.join(SERVER_ROOT, "db", "adminDb.ts");

// Matches both static (`from "../db/adminDb"`) and dynamic
// (`import("../db/adminDb")`) imports, any number of directories deep —
// deliberately NOT anchored to a specific relative-path depth, because a
// future file under a nested server/ subdirectory would still resolve here
// via a longer "../../" prefix.
const IMPORT_RE = /(?:from\s+|import\()\s*["'][^"']*\bdb\/adminDb["']/;

const ALLOWED_FILES = new Set([
  path.join(SERVER_ROOT, "services", "AdminAccessService.ts"),
]);

function listTsFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listTsFiles(full, acc);
    } else if (/\.ts$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

describe("server/db/adminDb.ts is imported by nothing outside the admin path (RLS-6)", () => {
  const allServerFiles = listTsFiles(SERVER_ROOT).filter((f) => f !== ADMIN_DB_MODULE);

  it("no file outside the allowlist imports adminDb", () => {
    const offenders = allServerFiles.filter((f) => {
      if (ALLOWED_FILES.has(f)) { return false; }
      const text = fs.readFileSync(f, "utf8");
      return IMPORT_RE.test(text);
    });

    expect(
      offenders,
      "These files import server/db/adminDb.ts but are not on the RLS-6 " +
      "allowlist: " +
      `${offenders.map((f) => path.relative(process.cwd(), f)).join(", ")}. ` +
      "Route cross-tenant reads through server/services/AdminAccessService.ts " +
      "instead — a BYPASSRLS pool reachable from more than one module defeats " +
      "the reason RLS-6 exists.",
    ).toEqual([]);
  });

  it("the allowlist itself still imports adminDb (guards against a silently stale allowlist)", () => {
    for (const f of ALLOWED_FILES) {
      const text = fs.readFileSync(f, "utf8");
      expect(
        IMPORT_RE.test(text),
        `${path.relative(process.cwd(), f)} is on the allowlist but no longer imports ` +
        "adminDb — remove it from ALLOWED_FILES so the allowlist stays honest.",
      ).toBe(true);
    }
  });
});
