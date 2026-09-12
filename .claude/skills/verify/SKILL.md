---
name: verify
description: 'Use this skill whenever a change needs to be proven against the live locally-running ezBuildr app instead of (or in addition to) tests. That includes: spinning up, starting, or restarting the app or dev/test server on any port; hitting an API endpoint manually on the running server with a real token; confirming the app still boots and pages still load after a merge or refactor; proving a feature or flow (e.g. a run, workflow, endpoint) actually works end-to-end before committing; screenshotting or clicking through the UI; demoing a feature; or logging in locally (it documents how to get an authenticated session without Google OAuth). Phrases like "spin up the app", "prove it works", "verify end to end", "make sure it still boots", or "check it in the real app, not just tests" all mean this skill. Do NOT use it for running unit/integration test suites (use run-tests), deploying, checking production availability or incidents, code review, or writing e2e tests.'
---

# Verifying Changes in ezBuildr

> **Every recipe below was executed end-to-end on 2026-08-02 and produced the
> stated output.** The previous version of this skill documented an auth flow that
> had silently stopped working — public signup was gated, and a registered user no
> longer got a tenant — which cost a reviewer several cycles mid-verification. If
> you find a step here that does not behave as written, fix this file as part of
> your task rather than working around it in silence.

## Boot the app

**Default choice for verification: `npm run dev:test`** (port **5174**,
`NODE_ENV=test`). Use this unless you specifically need development semantics,
because test mode removes the two things that otherwise block you:

- **Public signup is open.** `isPublicSignupEnabled` (`shared/publicSignup.ts`)
  returns true when `NODE_ENV === 'test'` *or*
  `VITE_PUBLIC_SIGNUP_ENABLED === 'true'`. In plain `npm run dev` you get
  `{"error":"registration_closed"}` and cannot create a user at all.
- **Auth rate limiting is effectively off.** `server/middleware/rateLimiter.ts`
  allows `NODE_ENV === 'test' ? 1000 : 10` attempts per 15 minutes. Verified: 12
  rapid registers in test mode → 12 accepted, 0 limited. In dev you get
  `"Too many login/register attempts"` after 10 and, since the limiter store is
  in-memory, the only quick fix is **restarting the server**.

Other options:

- `npm run dev` — development mode, port 5000. `npm run kill-server` frees the port,
  but see the warning below before you touch 5000.
- `PORT=5098 VITE_PUBLIC_SIGNUP_ENABLED=true npm run dev` — development semantics
  *plus* an open signup gate, on your own port. Use when you must reproduce
  something that behaves differently under `NODE_ENV=test`.
- **In a worktree, always start the server yourself on your own port.** Do **not**
  use `preview_start` there — it reads the *main* checkout's `.claude/launch.json`
  and launches from the repo root, silently serving `main`'s source.

Confirm it is actually up and talking to the database — `/health` reports both,
plus the PDF converter:

```bash
curl -s http://localhost:5174/health
# {"status":"healthy","environment":"test","database":{"connected":true,...},"pdfConverter":{...}}
```

`.env` already exists on this machine. Don't regenerate keys — changing
`VL_MASTER_KEY` breaks every stored secret.

## Getting an authenticated session (no browser OAuth)

Google OAuth can't be driven headlessly. **Three steps, and it is simpler than it
looks** — you do *not* need to log in, and you do *not* need to verify an email:

1. **Insert a tenant row.** Registration does **not** create one, and almost every
   tenant-scoped endpoint fails without it.
2. **`POST /api/auth/register`** → returns `{ token, user: { id } }`. Keep that token.
3. **Attach the tenant to the user** with a direct DB update
   (`tenantId`, `role: 'admin'`, `tenantRole: 'owner'`).

Then use the **token from step 2 directly.** No re-login. This works because
`attachUserToRequest` (`server/middleware/auth.ts:214`) deliberately re-hydrates
`tenantId` and roles **from the database** on every request rather than trusting
the JWT claim, so a tenant attached after the token was minted takes effect
immediately.

```ts
// run with: npx tsx ./.probe.mts   (from the repo root, then delete the file)
import { eq } from 'drizzle-orm';
import * as schema from './shared/schema';
import { db, initializeDatabase } from './server/db';

await initializeDatabase();                       // required, or you get
                                                  // "Database not initialized"
const [tenant] = await db.insert(schema.tenants)
  .values({ name: `Probe ${Date.now()}`, plan: 'pro' }).returning();

const reg = await fetch('http://localhost:5174/api/auth/register', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: `probe-${Date.now()}@example.com`,
    password: 'StrongTestUser123!@#', firstName: 'P', lastName: 'Q' }),
}).then(r => r.json());

await db.update(schema.users)
  .set({ tenantId: tenant.id, role: 'admin', tenantRole: 'owner' })
  .where(eq(schema.users.id, reg.user.id));

// reg.token now works on tenant-scoped endpoints.
```

`tests/helpers/integrationTestHelper.ts` does the same thing plus an organization
and membership — copy from there if your change touches org-level ACLs.

### The four traps, in the order you will hit them

1. **No tenant on register.** Symptom: `500 {"message":"Failed to create table"}`
   and a server log line `User session missing tenantId`. Fix: step 1 + 3 above.
2. **Login needs a verified email.** `auth.routes.ts:81` throws
   `EmailNotVerifiedError` (`AUTH_006`) unconditionally — there is no test-mode
   escape. **So don't log in.** If you genuinely need the login endpoint, set
   `emailVerified: true` in the same DB update.
3. **`POST /api/workflows` wants `title`, not `name`.** Sending `name` gives
   `400 Invalid workflow data … path: ["title"] Required`.
4. **A 30-second user cache** backs that DB re-hydration. If you make an
   authenticated request *before* attaching the tenant, a stale row can linger
   briefly. Attach the tenant first and you will never see it.

### Getting an authenticated *browser* (not just a token)

The recipe above gives you a bearer token for `curl`. It does **not** get you a
logged-in browser, and you cannot bridge the two by injecting the token: the
client holds it in a module-scoped variable (`globalAccessToken` in
`client/src/lib/vault-api.ts`), never in `localStorage`, so `browser_evaluate`
cannot reach it. Verified 2026-08-28, and this is the sequence that works:

1. **Register through the UI** at `/auth/register` — test mode leaves the gate
   open. This sets the httpOnly `refresh_token` cookie, which is the part you
   actually need.
2. It then redirects you to `/auth/login`. **Do not try to log in** — trap 2
   still applies. Instead run a probe that finds the user by email and sets
   `tenantId`, `role`, `tenantRole` **and `emailVerified: true`**.
3. **Navigate anywhere.** The app refreshes from the cookie, re-hydrates the
   tenant from the database, and you are simply signed in — no login form.

To get a bearer token back *out* of that browser session for `curl`, call
**`POST /api/auth/refresh-token`**. Note the name: there is no `/api/auth/refresh`,
and hitting it returns the SPA's `index.html`, which surfaces as
`SyntaxError: Unexpected token '<'` from `res.json()` and looks like an auth
failure rather than a wrong path.

```js
// browser_evaluate
const r = await fetch('/api/auth/refresh-token', { method: 'POST', credentials: 'include' });
return (await r.json()).token;      // ~355 chars, good for Authorization: Bearer
```

### Cleaning up — and the trap that leaks fixtures

You are writing to the **dev database**, which the repo owner also uses from a
second IDE. Creating a throwaway tenant/user/workflow is expected. **Deleting what
you created is mandatory. Never touch rows you did not make.**

Put teardown in a `finally` block **and raise failures with `throw`, never
`process.exit()`** — `process.exit()` skips `finally`, so an early bail-out leaks
its fixtures. This has happened: an aborted probe left two orphaned tenants and
users behind, found only by grepping for them afterwards.

```ts
try { /* ... */ if (!userId) { throw new Error('register failed'); } }
finally { /* delete table -> workflow -> project -> org -> user -> tenant */ }
```

Then **prove** the cleanup worked — count what you named before declaring done:

```ts
const leftover = await db.select().from(schema.tenants)
  .where(like(schema.tenants.name, 'Probe %'));
console.log(`leftover: ${leftover.length}`);   // must be 0
```

## What "verified" means per change type

- **API change:** curl the real endpoint on the running server — status code, body
  shape, **and the failure cases** (401 unauthenticated, 403/404 cross-tenant,
  400 malformed). Passing unit tests is not verification.
- **Workflow engine / step change:** create a workflow, add the step, start a run,
  submit values, confirm `step_values` and the execution trace.
- **Server-side block runner:** you can import and invoke the runner directly from a
  tsx script against the live DB (`new ReadTableBlockRunner().execute(config, ctx,
  block)`). That exercises the real query path without building a whole workflow —
  the fastest honest proof for filter/sort behaviour.
- **UI change:** drive a real browser (below). Screenshot desktop **and** mobile,
  and read the console. UI changes also require the `design` skill (repo rule).
- **Script/hook change:** **`isolated-vm` IS installed on this machine** (verified
  2026-08-12 — `ls node_modules | grep isolated-vm`), so sandboxed JS runs for real
  and lifecycle hooks are fully verifiable live. The previous text here claimed
  neither sandbox module was present and told you to settle for unit tests; that
  was stale and would have had you under-verify. `vm2` is absent, which is fine —
  `enhancedSandboxExecutor` prefers `isolated-vm` and only falls back to node `vm`
  (refused in production) when it is missing. **Check before assuming either way.**

  Fastest honest proof, no browser and no HTTP server needed: insert
  `lifecycle_hooks` rows and call `runLifecycleService.generateDocuments(runId)`
  from a tsx probe against the live DB — that is the same path
  `RunCompletionJobWorker` drives. Then assert on **`script_execution_log`**
  (`run_id`, `phase`, `status`) for occurrence, and put the hook's emitted key in
  the DOCX template (`{{ hookRan }}`, with the key listed in the hook's
  `outputKeys`) so the rendered document proves the output actually reached the
  renderer rather than merely that the hook ran.

- **Template filter / document-rendering change:** render a real DOCX end to end
  and check the value by hand. Build the fixture with `PizZip` — copy
  `createDocxBuffer` from `tests/integration/docs.autogeneration.test.ts` — and read
  the result back with `storageProvider.getFile(record.storageKey)` plus a
  tag-stripping regex on `word/document.xml`.

  **Make the assertion discriminating.** Workflow-configurable behaviour must be
  proven to depend on the configuration: compute the expected value for *both*
  settings up front, assert the rendered text matches the one you configured **and
  does not match the other**. A date that happens to be right under either setting
  proves nothing about the setting. Verified 2026-08-12: with
  `settings.businessDayCalendar = 'us-federal'`, `{{ startDate | addBusinessDays:1 }}`
  on Thu 2026-07-02 rendered `07/06/2026` (skipping the Fri Jul 3 observed holiday
  and the weekend) and not the weekends-only answer `07/03/2026`.

## Running DB-backed tests from the main checkout

**Main's `.env` has no `TEST_DATABASE_URL`**, so `tests/setup.ts` falls back to
`DATABASE_URL` — the real Neon dev database — and integration runs die with
`password authentication failed for user "postgres"`. That is a configuration
artifact, not a broken test. Set it explicitly:

```bash
TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5434/ezbuildr_test" \
  npx vitest run --project integration tests/integration/some.test.ts
```

Worktrees created by `scripts/new-worktree.ps1` get their own database
(`ezbuildr_test_<name>`) written into their `.env` — don't override it, it is what
lets parallel worktrees run DB suites without clobbering each other's schemas.

Two integration suites currently fail on `main` for reasons unrelated to DataVault
— `organizations-audit-fixes` and `organizations-workflow`, from the org-invite
work. Check whether a failure predates your change before debugging it.

## Driving the UI

**Use the Playwright MCP server (`mcp__playwright__*`), not the preview pane.** It
is registered at project scope in `.mcp.json`, so it resolves in the main checkout
*and* in every worktree. On first use in a new directory Claude Code asks you to
approve the project-scoped server — approve it once per worktree.

Typical loop: `browser_navigate` → `browser_snapshot` (accessibility tree; better
than a screenshot for asserting text/structure) → `browser_click` / `browser_type`
→ `browser_take_screenshot` for the visual → `browser_console_messages` for errors.
`browser_resize` covers mobile widths.

- `browser_fill_form` fills many fields in one call — the right tool for a runner
  section or list item, instead of one `browser_type` per field.
- `browser_wait_for` waits on text appearing/disappearing. Use it for autosave
  ("Saved") and step transitions. Never sleep.
- `browser_select_option` for dropdowns; `browser_network_requests` to confirm a
  request actually fired and what it carried.
- `browser_evaluate` for computed styles and anything the a11y tree won't show.

### Point it at the right server

**This is the failure that keeps happening.** `preview_start` reads the *main*
checkout's `.claude/launch.json` and launches from the repo root, so a worktree's
changes are silently absent and you screenshot `main`'s source while believing you
proved your branch. Playwright MCP goes exactly where you navigate it, which is why
it is preferred — but you still **must start the server yourself and use its port**.

**Never assume port 5000 is your tree — and never kill it.** The repo owner usually
has his own `npm run dev` there. Check first:

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Select ProcessId, CommandLine
```

Then confirm you are on your own build by asking the server for a file you changed:

```bash
curl -s "http://localhost:5174/src/components/.../YourFile.ts" | grep -c "a-token-you-added"
```

`0` means it is serving another checkout. Grep a token in a file Vite definitely
transforms — and grep for the string you **removed** too, expecting `0`. Do this
before trusting a single screenshot.

### `browser_fill_form` silently does nothing to some controlled inputs

**This will make you report a bug that does not exist.** `browser_fill_form` and
`browser_type` (default) use Playwright's `fill()`, which sets the value in one
shot. Several builder inputs — confirmed on the List field settings' numeric
inputs — do not register it: React re-renders from state and the field goes
straight back to empty, so the value never reaches the config and it looks exactly
like a persistence bug.

Typing character-by-character works: `browser_type` with **`slowly: true`**
(`pressSequentially`). Text inputs in the same row accepted `fill()` fine, so you
cannot infer from one field that the others are safe.

Likewise, `element.click()` inside `browser_evaluate` does **not** drive React
here. Use a real `browser_click`. When an element has no stable selector, tag it
first and click the tag:

```js
el.setAttribute('data-claude-target', '1');   // in browser_evaluate
// then browser_click with target: [data-claude-target]
```

**Always confirm the value stuck** — read the input back, *and* read the persisted
config over the API.

### Screenshots land in the repo root — of the *main* checkout

`browser_take_screenshot` with a bare `filename` writes to the **current working
directory**, not `.playwright-mcp/`. That drops untracked `.png` files where they
can be swept into a commit. Pass `.playwright-mcp/shot.png` explicitly, or move
them afterwards — only `.playwright-mcp/` is gitignored.

**And in a worktree, that path still resolves against the main checkout.**
Verified 2026-08-28: driving a server started from `.claude/worktrees/p1-verify`,
every `filename` — screenshots *and* `browser_evaluate`'s `filename` output —
landed in `C:\Users\scoot\poll\ezBuildr\.playwright-mcp\`, not the worktree's.
Harmless (that directory is gitignored), but you will chase a "missing" file if
you expect it beside your worktree. Read such files back from the main checkout's
path.

One Windows follow-on: `python` is a native binary and does **not** understand
Git Bash's `/c/Users/...` form. `cat /c/...` works because bash rewrites it;
`json.load(open('/c/...'))` raises `FileNotFoundError`. Use `C:/Users/...` in
anything you hand to a native tool.

### Things that look like bugs and aren't

- Vite HMR websocket reconnect errors in the console are noise, not your change.
- The preview pane froze CSS animations when not displayed, so Radix popovers sat
  at `data-state=closed` and looked broken. Playwright doesn't have this problem,
  but the lesson stands: assert on `aria-expanded` and the a11y snapshot rather
  than transient DOM state.
- Screenshots taken mid-transition are a timing artifact. Wait on a selector.

## Fast checks that catch most breakage

```bash
npx tsc --noEmit          # type-check
npm run lint              # repo-wide, --max-warnings 0
npm run test:fast         # ~60s, no DB
```

Run all three before calling a change done. `npm run type-check` alone is **not**
the commit gate — the pre-commit hook also runs `check:strict-zones`, which pulls
files in transitively. To know what the hook will say, run it:

```bash
npx tsx scripts/pre-commit-checks.ts   # after staging
```

For DB-backed suites see the `run-tests` skill — `npm test` naively gives wrong
results in this repo.
