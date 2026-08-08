import fs from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";

/**
 * O-10 guardrail: a zustand action with zero call sites.
 *
 * `useWorkflowBuilder`'s `setMode` was never called from anywhere, so `mode`
 * sat at its `"easy"` default forever and every component gating on it
 * silently never rendered its Advanced branch. It survived months because
 * **no standard tool catches this**: to TypeScript and ESLint the action is a
 * used property of an object literal, not an unused export, so neither
 * `noUnusedLocals` nor `no-unused-vars` sees anything wrong.
 *
 * This walks the store files, extracts each action, and asserts it is called
 * at least once outside its own store. A store action nobody calls means the
 * state it owns is stuck at its initial value — which is either dead state to
 * delete or a wiring bug to fix.
 *
 * KNOWN_DEAD below is debt, not permission: it exists so this check can start
 * guarding against NEW occurrences today instead of waiting for unrelated
 * cleanups. Entries should only ever be removed.
 */

/**
 * Actions already dead when this check was introduced (2026-08-08, O-11).
 * Each means its state is frozen at its initial value.
 */
const KNOWN_DEAD: Record<string, string[]> = {
  // Builder preview state: nothing starts a preview through the store, so
  // `previewRunId`/`isPreviewOpen` are permanently null/false — the same bug
  // `mode` had. SectionsTab reads both.
  "workflow-builder.ts": ["selectWorkflow", "clearSelection", "startPreview"],
  // Run-token cache: individual tokens are cleared, the bulk clear is not.
  "preview.ts": ["clearAll"],
  // DataVault filter store: filters are never written through this action.
  "useDatavaultFilterStore.ts": ["setFilters"],
};

const STORE_DIR = path.join(process.cwd(), "client", "src", "store");
const SEARCH_ROOT = path.join(process.cwd(), "client", "src");

/** Action-shaped store keys: `name: (args) => ...`. */
const ACTION_RE = /^\s{2}(\w+):\s*\((?:[^)]*)\)\s*=>/gm;

function listFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { listFiles(full, acc); }
    else if (/\.(ts|tsx)$/.test(entry.name)) { acc.push(full); }
  }
  return acc;
}

const ALL_SOURCES = listFiles(SEARCH_ROOT);
const SOURCE_TEXT = new Map(ALL_SOURCES.map((f) => [f, fs.readFileSync(f, "utf8")]));

describe("zustand stores expose no NEW dead actions (O-10)", () => {
  const storePaths = fs
    .readdirSync(STORE_DIR)
    .filter((f) => /\.ts$/.test(f))
    .map((f) => path.join(STORE_DIR, f));

  for (const storePath of storePaths) {
    const storeName = path.basename(storePath);
    const source = fs.readFileSync(storePath, "utf8");
    // Dedupe: the pattern matches both the interface and the implementation.
    const actions = [...new Set([...source.matchAll(ACTION_RE)].map((m) => m[1]))];

    if (actions.length === 0) { continue; }

    it(`${storeName}: every action has a caller outside the store`, () => {
      const allowed = new Set(KNOWN_DEAD[storeName] ?? []);
      const dead = actions.filter((action) => {
        if (allowed.has(action)) { return false; }
        const re = new RegExp(`\\b${action}\\b`);
        for (const [file, text] of SOURCE_TEXT) {
          if (file !== storePath && re.test(text)) { return false; }
        }
        return true;
      });

      expect(
        dead,
        `${storeName} exposes action(s) nobody calls: ${dead.join(", ")}. ` +
          `A never-called setter means its state is stuck at its initial value ` +
          `(O-10). Wire it up, or delete the state it owns.`
      ).toEqual([]);
    });
  }

  it("KNOWN_DEAD only lists actions that are still dead", () => {
    // Keeps the allowlist honest: once something gets wired up, it must be
    // removed here so the check starts enforcing it.
    const revived: string[] = [];
    for (const [storeName, actions] of Object.entries(KNOWN_DEAD)) {
      const storePath = path.join(STORE_DIR, storeName);
      for (const action of actions) {
        const re = new RegExp(`\\b${action}\\b`);
        for (const [file, text] of SOURCE_TEXT) {
          if (file !== storePath && re.test(text)) {
            revived.push(`${storeName}:${action}`);
            break;
          }
        }
      }
    }
    expect(revived, `now called — remove from KNOWN_DEAD: ${revived.join(", ")}`).toEqual([]);
  });
});
