#!/usr/bin/env node
/**
 * PreToolUse guard: keep pushes on the dev -> test -> main promotion chain.
 *
 * Work lands on `dev`. `dev` is promoted to `test` once CI is green, and `test`
 * reaches `main` through a pull request, because `main` auto-deploys to
 * production on Railway with no staging step in between. This hook blocks a
 * direct push to `test` or `main` so the order cannot be skipped by a session
 * that has simply lost track of which branch it is on.
 *
 * The override is deliberate and greppable: prefix the command with
 * EZB_DIRECT_PUSH=1 (bash) or set $env:EZB_DIRECT_PUSH='1' first (PowerShell).
 * Per CLAUDE.md, Claude may only do that when the repo owner has asked for a
 * direct push in that session.
 *
 * Scope, stated plainly: this stops *forgetful* pushes, not determined ones —
 * the assistant can type the override itself. The hard boundary is GitHub
 * branch protection on `main`, which is currently OFF for this repo.
 *
 * Contract: reads the hook payload as JSON on stdin, exit 2 blocks the call and
 * returns stderr to Claude, exit 0 allows it.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PROTECTED_BRANCHES = new Set(["main", "test"]);
const OVERRIDE_TOKEN = "EZB_DIRECT_PUSH";

/** Split a command line into segments that each run as their own command. */
function splitSegments(command) {
    return command.split(/&&|\|\||[;\n|]/);
}

/** Whitespace-tokenise a segment, dropping surrounding quotes. */
function tokenise(segment) {
    const matches = segment.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
    return matches.map((token) => token.replace(/^["']|["']$/g, ""));
}

/** The push argument list, or null when this segment is not a git push. */
function pushArgs(segment) {
    const tokens = tokenise(segment);
    const gitIndex = tokens.findIndex((t) => t === "git" || t.endsWith("/git") || t.endsWith("\\git.exe"));
    if (gitIndex === -1) { return null; }

    const pushIndex = tokens.indexOf("push", gitIndex + 1);
    if (pushIndex === -1) { return null; }

    return tokens.slice(pushIndex + 1);
}

/** Normalise a refspec to the branch it writes: `+HEAD:refs/heads/main` -> `main`. */
function refspecTarget(refspec) {
    const withoutForce = refspec.replace(/^\+/, "");
    const destination = withoutForce.includes(":")
        ? withoutForce.slice(withoutForce.lastIndexOf(":") + 1)
        : withoutForce;
    return destination.replace(/^refs\/heads\//, "");
}

function currentBranch() {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
    }).trim();
}

/**
 * Branches a push would write. Returns `"*"` for whole-ref pushes (--all,
 * --mirror), which necessarily include the protected branches.
 */
function targetsOf(args) {
    if (args.some((a) => a === "--all" || a === "--mirror")) { return ["*"]; }

    // Positional args are `<remote> <refspec>...`; everything else is a flag.
    // A bare `git push` carries no refspec and writes the current branch.
    const positional = args.filter((a) => !a.startsWith("-"));
    const refspecs = positional.slice(1);

    return refspecs.length > 0 ? refspecs.map(refspecTarget) : [currentBranch()];
}

function blockedBranches(command) {
    const blocked = new Set();

    for (const segment of splitSegments(command)) {
        const args = pushArgs(segment);
        if (args === null) { continue; }

        for (const target of targetsOf(args)) {
            if (target === "*") {
                blocked.add("main");
                blocked.add("test");
            } else if (PROTECTED_BRANCHES.has(target)) {
                blocked.add(target);
            }
        }
    }

    return [...blocked];
}

function main() {
    let payload;
    try {
        payload = JSON.parse(readStdin());
    } catch {
        // Nothing parseable to inspect. Guarding is a convenience, not the
        // security boundary, so an unreadable payload must not wedge the session.
        process.exit(0);
    }

    const command = payload?.tool_input?.command;
    if (typeof command !== "string" || !command.includes("push")) { process.exit(0); }

    if (command.includes(OVERRIDE_TOKEN)) { process.exit(0); }

    let blocked;
    try {
        blocked = blockedBranches(command);
    } catch (error) {
        // A push IS present and its target could not be resolved. Fail closed:
        // this is the one narrow path where guessing wrong pushes to production.
        process.stderr.write(
            `Blocked: could not resolve the target branch of this git push (${error.message}).\n` +
            `Name the branch explicitly, e.g. \`git push origin dev\`.\n`
        );
        process.exit(2);
    }

    if (blocked.length === 0) { process.exit(0); }

    process.stderr.write(
        `Blocked: direct push to ${blocked.map((b) => `\`${b}\``).join(" and ")}.\n\n` +
        `This repo promotes dev -> test -> main (see CLAUDE.md, "Branch flow").\n` +
        `  - Work lands on \`dev\`.\n` +
        `  - \`dev\` -> \`test\` by merge, once CI is green on dev.\n` +
        `  - \`test\` -> \`main\` by pull request only; main auto-deploys to production.\n\n` +
        `If the repo owner explicitly asked for a direct push in this session, re-run with:\n` +
        `  EZB_DIRECT_PUSH=1 git push ...            (bash)\n` +
        `  $env:EZB_DIRECT_PUSH='1'; git push ...    (PowerShell)\n` +
        `Do not set that on your own initiative.\n`
    );
    process.exit(2);
}

function readStdin() {
    try {
        return readFileSync(0, "utf8");
    } catch {
        return "";
    }
}

main();
