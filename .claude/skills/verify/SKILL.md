---
name: verify
description: 'Use this skill whenever a change needs to be proven against the live locally-running ezBuildr app instead of (or in addition to) tests. That includes: spinning up, starting, or restarting the app or dev/test server on any port; hitting an API endpoint manually on the running server with a real token; confirming the app still boots and pages still load after a merge or refactor; proving a feature or flow (e.g. a run, workflow, endpoint) actually works end-to-end before committing; screenshotting or clicking through the UI; demoing a feature; or logging in locally (it documents the Google OAuth workaround). Phrases like "spin up the app", "prove it works", "verify end to end", "make sure it still boots", or "check it in the real app, not just tests" all mean this skill. Do NOT use it for running unit/integration test suites (use run-tests), deploying, checking production availability or incidents, code review, or writing e2e tests.'
---

# Verifying Changes in ezBuildr

## Boot the app

- Preferred: `npm run dev` (Express + Vite middleware on `http://localhost:5000`). Port busy → `npm run kill-server`.
- **In a worktree, always start it yourself on your own port** (`PORT=5098 npm run dev`). Do **not** use `preview_start` there — it reads the main checkout's `.claude/launch.json` and launches from the repo root, silently serving `main`'s source. See "Driving the UI".
- `preview_start` with the `ezbuildr-dev` config from `.claude/launch.json` is fine in the main checkout only.
- Test-mode server on a separate port: `npm run dev:test` (NODE_ENV=test, port 5174).
- Required env in `.env`: `DATABASE_URL`, `SESSION_SECRET`, `VL_MASTER_KEY`, `GOOGLE_CLIENT_ID`, `VITE_GOOGLE_CLIENT_ID`, `BASE_URL`, `ALLOWED_ORIGIN` (see CLAUDE.md). The dev `.env` already exists on this machine — don't regenerate keys; changing `VL_MASTER_KEY` breaks all stored secrets.

## Getting authenticated (no browser OAuth needed)

Google OAuth can't be driven headlessly. Two working paths:

1. **API-level:** register a throwaway user for a JWT, exactly like integration tests do:
   ```
   POST /api/auth/register  { email, password, firstName, lastName }
   ```
   then send `Authorization: Bearer <token>`. See `tests/helpers/integrationTestHelper.ts:57` for the full bootstrap (tenant + org + project creation) — reuse it via a tsx script rather than reinventing.
2. **UI-level:** the login page also supports email/password auth for locally-registered users — register via the API first, then log in through the form.

## What "verified" means per change type

- **API change:** curl/supertest the real endpoint on the running server — status code, body shape, and the failure case (401 without token, 403/404 cross-tenant). Passing unit tests alone is not verification.
- **Workflow engine / step change:** create a workflow via the builder or API, add the relevant step, start a run, submit values, confirm `stepValues` and execution trace look right.
- **UI change:** drive it in a real browser — see "Driving the UI" below. Screenshot at desktop and mobile widths, and check the console for errors. UI changes also require the design skill (user's global instruction).
- **Script/hook change:** note `vm2`/`isolated-vm` are not installed locally — sandboxed JS execution paths can't run on this machine; verify logic via unit tests and flag the gap.

## Driving the UI

**Use the Playwright MCP server (`mcp__playwright__*`), not the preview pane.** It is
registered at project scope in `.mcp.json`, so it resolves in the main checkout
*and* in every worktree. On first use in a new directory Claude Code asks you to
approve the project-scoped server — approve it once per worktree.

Typical loop: `browser_navigate` → `browser_snapshot` (accessibility tree; better
than a screenshot for asserting text/structure) → `browser_click` / `browser_type`
→ `browser_take_screenshot` for the visual → `browser_console_messages` for errors.
`browser_resize` covers mobile widths.

Worth knowing for this repo's flows:

- `browser_fill_form` fills many fields in one call — the right tool for driving a
  runner section or a list item, instead of a `browser_type` per field.
- `browser_wait_for` waits on text appearing/disappearing. Use it for autosave
  ("Saved") and for step transitions. Never sleep.
- `browser_select_option` for dropdowns; `browser_network_requests` to confirm an
  autosave POST actually fired and what it carried.
- `browser_evaluate` for computed styles and anything the accessibility tree
  won't show.

### Point it at the right server

**This is the failure that keeps happening.** The preview pane's `preview_start`
reads the *main* checkout's `.claude/launch.json` and launches from the repo root,
so a worktree's changes are silently absent and you screenshot `main`'s source
while believing you proved your branch. Playwright MCP has no such magic — it
goes exactly where you navigate it — which is why it is preferred, but it does
mean **you must start the server yourself and use its port**:

```bash
# from inside your worktree, on a port nobody else is using
PORT=5098 npm run dev        # then browser_navigate http://localhost:5098
```

**Never assume port 5000 is your tree — and never kill it.** The repo owner
usually has his own `npm run dev` there. Check before touching it:

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Select ProcessId, CommandLine
```

Confirm you're on your own build in one command — ask the server for a file you
changed:

```bash
curl -s "http://localhost:5098/src/index.css" | grep -c "your-new-token"
```

`0` means it's serving the other checkout. (`/src/Foo.tsx` returns the index.html
fallback rather than a module, so grep a token in a file Vite definitely
transforms.) Do this before trusting a single screenshot.

### `browser_fill_form` silently does nothing to some controlled inputs

**This will make you report a bug that does not exist.** `browser_fill_form` and
`browser_type` (default) use Playwright's `fill()`, which sets the value in one
shot. Several builder inputs — confirmed on the List field settings' numeric
inputs — do not register it: React re-renders from state and the field goes
straight back to empty, so the value never reaches the config and it looks
exactly like a persistence bug.

Typing character-by-character works: `browser_type` with **`slowly: true`**
(`pressSequentially`). Text inputs in the same row accepted `fill()` fine, so
you cannot infer from one field that the others are safe.

Likewise, `element.click()` inside `browser_evaluate` does **not** drive React
here. Use a real `browser_click`. When an element has no stable selector, tag it
first and click the tag:

```js
// browser_evaluate: tag it
el.setAttribute('data-claude-target', '1');
// then browser_click with target: [data-claude-target]
```

**Always confirm the value stuck before concluding anything** — read the input
back, and read the persisted config over the API.

### Screenshots land in the repo root

`browser_take_screenshot` with a bare `filename` writes to the **current working
directory**, not `.playwright-mcp/`. That drops untracked `.png` files in the
repo root where they can be swept into a commit. Either pass
`.playwright-mcp/shot.png` explicitly, or move them out afterwards. Only
`.playwright-mcp/` is gitignored.

### Things that look like bugs and aren't

- The preview pane froze CSS animations when not displayed, so Radix popovers sat
  at `data-state=closed` and looked broken. Playwright doesn't have this problem,
  but the lesson stands: assert on `aria-expanded` and the accessibility snapshot
  rather than on transient DOM state.
- Screenshots of a page still mid-transition are a timing artifact. Wait on a
  selector, don't sleep.

### Writing to the dev database

The repo owner works this repo from a second IDE against the same dev DB. Creating
a throwaway tenant/workflow to prove a builder change is fine and expected — that
is what the register-a-user path above is for — but **clean up what you create**,
and never delete or mutate rows you didn't make.

## Fast checks that catch most breakage

```bash
npx tsc --noEmit          # type-check (build gate)
npm run test:fast         # 13s, no DB
npm run lint              # zero-error policy (warnings ok)
```

Run all three before calling a change done; run targeted integration tests (see the run-tests skill) when the change touches server behavior.
