# ROADMAP TICKETS — GitHub Issues Master Roadmap (P0 → P2)

## How to work this document

1. **One ticket at a time.** Read the header, the Decisions section, your assigned ticket, and its ties. Do not read or implement other tickets concurrently in the same working tree.
2. **Use git worktrees for parallel agents.** Run `pwsh scripts/new-worktree.ps1 -Name <ticket-id>`.
3. **Gates must be green before turn-in:**
   - `npm run type-check` (0 errors)
   - `npm run lint` (0 problems)
   - `npm run test:fast` (green, test count ≥ baseline)
   - **Baseline as of 2026-08-04:** `test:fast` = 189 files passed / 2392 tests passed, 1 file + 14 tests skipped.
4. **Never test against production.** Never push to test or point at the production database.
5. **Report back:** Changed files, gate output proving green, and dated verification note.
6. **Update the progress graphic when you close a ticket.** Flip the ticket heading's
   🔲 to ✅, flip the matching node in the Roadmap Progress graphic below, bump that
   phase's count and the overall bar, and add a row to the Completed table.
7. **Line numbers are advisory.** Every Finding quotes the code and names its enclosing symbol — that quote plus symbol is the real locator. If a line number has drifted, grep for the quoted text; a drifted line is not a broken ticket.
8. **The template-language gate is cleared (2026-08-10).** GH-161, GH-171 and GH-173 all
   consumed the DOCX/runner template grammar. That initiative closed 11/11 and is retired to
   `tickets/backlog/TEMPLATE_LANGUAGE.md`; GH-161 closed with it. **GH-171 and GH-173 are now
   dispatchable**, and both should build on the shipped filter vocabulary rather than a new
   mechanism — see the retired detail for the four settled decisions.
9. **Deferred tickets are not dispatchable.** Anything under “Deferred — parked” is off the board: no phase owns it, no phase gate blocks on it, and it is not counted in the progress bar. Do not pick one up unless the repo owner promotes it back into a phase.

---

## Decisions (repo owner, 2026-08-04)

These were escalated during ticket generation and answered. Do not relitigate them.

- **D1 — Virus scanning: build the real thing.** A `railway-clamav` service is already
  deployed in the **EZBuildr** Railway project with private networking live at
  `railway-clamav.railway.internal`. GH-169A implements a working clamd client, not a
  hardened stub.
- **D2 — Build the missing storage-serving route.** `DiskStorageProvider.getSignedUrl()`
  currently returns a URL to an endpoint that does not exist. GH-169B builds the real
  authenticated endpoint rather than making the failure louder.
- **D3 (2026-08-05) — white-label ships as an ungated workflow toggle.** GH-158 does **not**
  check a plan. The entitlement that exists (`custom_branding`) is reachable only through
  org-keyed `subscriptions`, and individuals cannot hold a plan at all, so gating now would
  permanently deny white-label to every user-owned workflow. Revisit when user-level billing
  exists — see **O-7**. Scope was also cut to the resolver + runner: project-level branding,
  email, custom domains and the signature screen are **O-8/O-10**, not this ticket.

### Audit corrections to the original GH-169 text (2026-08-04)

The roadmap's GH-169 was written on two premises that are **factually wrong**; the
rewritten tickets below supersede it.

1. **Production disk storage is already durable.** The prod service has a Railway volume
   (`RAILWAY_VOLUME_MOUNT_PATH=/app/server/files`) and the container runs at `WORKDIR
   /app`. `DiskStorageProvider`'s `baseDir` is `<cwd>/server/files` and `OUTPUTS_DIR` is
   `<cwd>/server/files/outputs` — **both are inside the mounted volume.** Templates and
   generated outputs already survive deploys. `DEBT-OPS1` ("set `STORAGE_DRIVER=s3` to
   eliminate ephemeral disk 404s") is therefore **not the cause of the 404s** and is no
   longer a prerequisite for this ticket.
2. **~~Flipping `STORAGE_DRIVER=s3` is a migration~~ — SUPERSEDED 2026-08-04.** The repo
   owner confirmed the volume holds only test data, so the orphaning risk was accepted and
   **S3 is now live in production** (see the GH-169B closure note). No backfill was run;
   the old volume contents were deliberately abandoned.
3. **The real 404 cause is a dead route** — see GH-169B Finding 2.

---

## Roadmap Progress & Dependency Overview

**20 of 27 tickets complete (74%)** — updated 2026-08-12 · 1 deferred (GH-148)

> Keep this in sync: when a ticket's own heading earns a ✅, flip its node below
> and bump the phase count and the overall bar. The heading is the source of truth.

```
LEGEND    ✅ done      🔲 open      ⏸ deferred (off the board)

OVERALL   ████████████████████░░░░░░░   20 / 27   (74%)


[Phase 0 — P0 Security & Storage Foundation]      ██████████  2/2  DONE
  ├── ✅ GH-169A   Real clamd virus scanner client
  └── ✅ GH-169B   Storage init, signed-URL route, S3 hardening
        │
        ├──► [Phase 1 — Document & Delivery Pipeline]    ██████████  5/5  DONE
        │      ├── ✅ GH-168   High-fidelity DOCX-to-PDF converter
        │      ├── ✅ GH-156   Document mapping workbench
        │      ├── ✅ GH-170   Delivery destinations & retries
        │      ├── ✅ GH-157   DocuSign envelope lifecycle
        │      └── ✅ GH-149   Packaged legal integrations (Clio/Stripe/e-sign)
        │
        ├──► [Phase 2 — Runner Experience, Reliability & Compliance]  ██████████  5/5  DONE
        │      ├── ✅ GH-160   Resilient autosave & offline buffering
        │      ├── ✅ GH-146   File uploads & repeaters in runner
        │      ├── ✅ GH-147   Save-and-resume & client handoff
        │      ├── ✅ GH-158   Workflow branding & white labeling
        │      └── ✅ GH-159   WCAG 2.2 AA accessibility conformance
        │           ⏸ GH-148   Multilingual & locale-aware runner — parked 2026-08-07, not counted
        │
        ├──► [Phase 3 — Builder Logic & Visual Architecture]   ██████████  4/4  DONE
        │      ├── ✅ GH-154   Unified conditional logic editor
        │      ├── ✅ GH-153   Visual workflow map & path simulation
        │      ├── ✅ GH-152   Publish gate review grouping
        │      └── ✅ GH-167   Document-to-interview AI onboarding
        │
        ├──► [Phase 4 — P2 Advanced Blocks, Authoring & Templates]  ██████░░░░  4/7
        │      │   ✔ template-language gate cleared 2026-08-10 (11/11, retired to
        │      │     tickets/backlog/TEMPLATE_LANGUAGE.md); GH-171 + GH-173 unblocked
        │      ├── ✅ GH-161   Answer piping & dynamic recall  (delivered by TPL-7)
        │      ├── ✅ GH-162   Review step structured values & visibility
        │      ├── 🔲 GH-163   Payment, scheduling, ranking & matrix blocks
        │      ├── 🔲 GH-165   Guided Easy-Mode workflow
        │      ├── ✅ GH-171   Template versioning & impact analysis
        │      ├── 🔲 GH-173   Legal drafting primitives & templates
        │      └── ✅ GH-155   Final-document authoring config
        │
        └──► [Phase 5 — P2 Mobile, Kiosk, OCR & Documentation]  ░░░░░░░░░░  0/4
               ├── 🔲 GH-164   Mobile-first kiosk mode
               ├── 🔲 GH-166   Mobile/tablet responsive builder
               ├── 🔲 GH-172   PDF/OCR extraction & broadened formats
               └── 🔲 GH-174   Documentation & capability alignment
```

### Completed so far

| Ticket | Title | Closed |
|---|---|---|
| ✅ GH-169A | Real clamd virus scanner client | 2026-08-04 |
| ✅ GH-169B | Storage init, signed-URL route, S3 hardening | 2026-08-04 |
| ✅ GH-168 | High-fidelity DOCX-to-PDF conversion as prod default | 2026-08-06 |
| ✅ GH-170 | Delivery destinations with retries & audit status | 2026-08-05 |
| ✅ GH-160 | Resilient autosave, offline buffering, conflict recovery | 2026-08-06 |
| ✅ GH-158 | Workflow branding & white labeling in the runner | 2026-08-05 |
| ✅ GH-159 | WCAG 2.2 AA conformance (builder + runner) | 2026-08-06 |
| ✅ GH-146 | File uploads in the runner and inside List items | 2026-08-06 |
| ✅ GH-157 | Production DocuSign envelope lifecycle | 2026-08-06 |
| ✅ GH-152 | Publish gate review grouping and deep links | 2026-08-06 |
| ✅ GH-149 | Packaged Clio, Stripe, and DocuSign legal integrations | 2026-08-06 |
| ✅ GH-147 | Save-and-resume, assignment, and staff/client handoff | 2026-08-06 |
| ✅ GH-156 | Document mapping workbench with persisted bindings | 2026-08-06 |
| ✅ GH-154 | Unified conditional logic editor | 2026-08-08 |
| ✅ GH-153 | Visual workflow map & path simulation | 2026-08-09 |
| ✅ GH-167 | Document-to-interview AI onboarding | 2026-08-09 |
| ✅ GH-162 | Review step structured values and conditional visibility | 2026-08-09 |
| ✅ GH-155 | Final-document authoring configurability | 2026-08-09 |
| ✅ GH-161 | Answer piping & dynamic recall (via TPL-7) | 2026-08-10 |
| ✅ GH-171 | Document template versioning & dependency impact analysis | 2026-08-11 |

---

# Phase 0: P0 Security & Storage Foundation

## GH-169A — Implement a real clamd virus scanner client ✅

> **Verified 2026-08-04 (Senior).** All 9 ACs met. Gates re-run by the reviewer in the
> GH-169A worktree, not taken from the dev's report: `type-check` exit 0, `lint` exit 0
> (`--max-warnings 0`), `test:fast` **189 files / 2401 tests passed** (baseline 2392, +9).
> INSTREAM and PING implemented over `node:net` with no new dependency, as specified.
> Every AC has a labelled test driving a real fake clamd TCP server on an ephemeral port;
> AC3 uses the actual EICAR string. Fail-closed proven separately for refused connection,
> socket timeout, and `ERROR` reply. The old `SCANNER_NOT_IMPLEMENTED` stub is gone, and
> its test was converted into a regression assertion rather than deleted.
>
> **Not verified live.** `railway-clamav` is only reachable over Railway private
> networking, so there is no local path to a real daemon; correctness rests on the fake
> server matching the documented protocol. First real end-to-end proof happens when
> `ENABLE_VIRUS_SCANNING=true` is set in production — watch the boot log for the health
> line added by AC8.
>
> **Observation (not blocking, filed as O-5).** `pingClamd` resolves `false` if the first
> TCP segment does not already contain `PONG`. clamd writes `PONG\0` as a single 5-byte
> write so this will not trigger in practice, and the only consequence is a spurious
> boot-time "unhealthy" log — but a split read would misreport health.

**Priority: P0** · Size: M
**Files (footprint):** `server/services/security/VirusScanner.ts`, `tests/unit/security/VirusScanner.test.ts`, `.env.example`, `server/index.ts` (boot warning only)
**Collides with:** nothing. Safe to run in parallel with GH-169B.
**Ties:** Supersedes part of GH-169. Decision **D1**. Load the `run-tests` skill before running any test. Relates to GH-174 AC3 (documenting `ENABLE_VIRUS_SCANNING`).

### Finding

`ClamAVVirusScanner` is a stub that rejects every file it is asked to scan. In
`server/services/security/VirusScanner.ts`, inside **`class ClamAVVirusScanner`**:

```ts
  scan(buffer: Buffer, filename: string): Promise<ScanResult> {
    const startTime = Date.now();

    // TODO: Implement actual ClamAV integration
    ...
    // Fail-safe: Reject files when ClamAV is configured but not implemented
    return Promise.resolve({
      safe: false,
      threatName: 'SCANNER_NOT_IMPLEMENTED',
```

and

```ts
  isHealthy(): Promise<boolean> {
    // TODO: Implement health check via PING command to clamd
    return Promise.resolve(false);
  }
```

Consequence: `ENABLE_VIRUS_SCANNING=true` + `VIRUS_SCANNER_PROVIDER=clamav` bricks **all**
template and intake uploads (they all fail closed), so the flag can never actually be
turned on. Production currently has `ENABLE_VIRUS_SCANNING` **unset**, so `getVirusScanner()`
returns `NoOpVirusScanner` and **every uploaded file today is accepted unscanned**.

Infrastructure is already in place (Decision D1): service `railway-clamav` in the EZBuildr
Railway project, private DNS `railway-clamav.railway.internal`, clamd default port `3310`.

### Preferred fix

**Implement the clamd INSTREAM protocol directly over `node:net`. Do not add the `clamscan`
npm package.** A direct socket client is ~100 lines, has no dependency footprint, and — the
deciding reason — is **unit-testable against a fake TCP server**, so acceptance criteria can
be proven without a live daemon in CI. `clamscan` would make every test require a real clamd.

Protocol (all commands use the `z` prefix = NULL-terminated):

- **Health check:** send `zPING\0`, expect `PONG\0`.
- **Scan:** send `zINSTREAM\0`, then for each chunk write a **4-byte big-endian length**
  followed by that many bytes; terminate with a 4-byte zero. Then read the reply:
  - `stream: OK\0` → clean
  - `stream: <ThreatName> FOUND\0` → infected, parse out `<ThreatName>`
  - anything containing `ERROR` (e.g. `INSTREAM size limit exceeded. ERROR\0`) → treat as a
    scanner failure, **not** as "clean"

Use 64 KB chunks. Put a socket timeout on the whole operation (`CLAMAV_TIMEOUT_MS`, default
30000) and `destroy()` the socket on timeout.

**Fail closed everywhere.** Any error — connection refused, timeout, malformed reply, DNS
failure — must produce `safe: false` with a distinguishable `threatName` (e.g.
`SCANNER_UNAVAILABLE`) and an `logger.error`. Never let an infrastructure failure return
`safe: true`. Keep `scan()`'s existing signature and the `ScanResult` shape exactly as-is —
callers in `templates.routes.ts` and `intake.routes.ts` already depend on it.

Keep `NoOpVirusScanner`, `getVirusScanner()`, and the singleton helpers unchanged.

Add a **boot-time warning**: if `ENABLE_VIRUS_SCANNING === 'true'`, call `isHealthy()` once
during server startup and `logger.error` loudly if it returns false. Do not crash the
process — an unreachable scanner should be noisy, not fatal.

### Acceptance criteria

1. `ClamAVVirusScanner.isHealthy()` opens a TCP connection to `CLAMAV_HOST:CLAMAV_PORT`,
   sends `zPING\0`, and resolves `true` only on a `PONG` reply; resolves `false` (never
   throws) on refusal, timeout, or unexpected reply.
2. `ClamAVVirusScanner.scan()` implements INSTREAM as specified and returns
   `safe: true` for a clean reply.
3. `scan()` returns `safe: false` with the parsed threat name for a `... FOUND` reply. Prove
   this with the **EICAR** test-string payload against the fake daemon.
4. `scan()` returns `safe: false` (fail-closed) with a non-empty `threatName` for: connection
   refused, socket timeout, and an `ERROR` reply. Each is a separate assertion.
5. `scanDurationMs` and `fileSize` are populated correctly on every returned `ScanResult`.
6. New unit tests in `tests/unit/security/VirusScanner.test.ts` cover AC1–AC5 by standing up
   a **fake clamd TCP server** on an ephemeral port (`net.createServer`, port `0`) that
   speaks the protocol above. The tests must not require a real ClamAV daemon and must close
   every server they open. Existing tests in that file that assert the old stub behaviour
   must be **updated, not deleted** — they currently assert `SCANNER_NOT_IMPLEMENTED`.
7. `.env.example` documents `ENABLE_VIRUS_SCANNING`, `VIRUS_SCANNER_PROVIDER`, `CLAMAV_HOST`,
   `CLAMAV_PORT`, `CLAMAV_TIMEOUT_MS`, including the note that on Railway the host is
   `railway-clamav.railway.internal`.
8. Boot-time health warning implemented as described.
9. `npm run type-check`, `npm run lint`, `npm run test:fast` all green; `test:fast` count
   ≥ 2392 passing.

> **Do not** set any Railway environment variable and do not deploy. Flipping
> `ENABLE_VIRUS_SCANNING=true` in production is the repo owner's action, after this merges.

---

## GH-169B — Fix storage init, serve signed URLs, and harden the S3 provider ✅

> **Verified 2026-08-04 (Senior).** All 11 ACs met. Gates re-run by the reviewer on the
> **merged** tree (the dev's own run predated GH-169A and so proved nothing about the
> combination): `type-check` exit 0, `lint` exit 0, `test:fast` **191 files / 2421 tests
> passed** — exactly baseline 2392 + 9 (GH-169A) + 20 (GH-169B), so zero regressions.
>
> **Integrated by cherry-pick, not by copying files.** GH-169A and GH-169B both edit
> `server/index.ts`; copying B's copy over main would have silently deleted A's scanner
> health check with no conflict. The 3-way merge kept both, verified by grep afterwards.
>
> **Verified live** against `npm run dev:test` on port 5174 (a probe script, since removed):
> - Finding 1 proven at boot — `File storage initialized successfully` in the log.
> - Round trip: a URL minted by the real `DiskStorageProvider.getSignedUrl()` served the
>   file, **200**, correct `Content-Type`, `Cache-Control: no-store`.
> - Tampered signature **403**; unsigned request **403**; correctly-signed-but-expired **403**;
>   validly-signed nonexistent key **404** (not 500).
> - Path traversal blocked: `../../.env` percent-encoded so it survived client-side URL
>   normalisation, signed with a *valid* signature, returned **400** with no env leakage.
>   (An unencoded `..` is normalised by `fetch` before it leaves the client and never
>   reaches the route — that variant proves nothing; use `%2f`.)
>
> **Reviewer fix applied (triage option 3).** `getStorageSigningSecret()` fell back to a
> hardcoded constant when neither `SESSION_SECRET` nor `JWT_SECRET` was set. That constant
> is public in this repo, and it is the *only* credential guarding an unauthenticated
> endpoint — so any environment missing both vars would have had a silent arbitrary-read of
> the storage root. Now throws in production, keeps the fallback for dev/test. Gates re-run
> after the change.
>
> Both dev deviations reviewed and accepted: `initializeFileStorage()` over
> `storageProvider.init()` (the ticket offered either), and a sidecar `.etag` file over
> in-memory ETag state (avoids mutable class state and is what the tests drive).

**Priority: P0** · Size: M
**Files (footprint):** `server/services/storage/*`, `server/services/templates.ts`, new `server/routes/storage.routes.ts`, `server/routes/index.ts`, `server/index.ts`, `tests/unit/services/*`
**Collides with:** nothing else currently open. Safe to run in parallel with GH-169A.
**Ties:** Supersedes part of GH-169. Decision **D2**. **Load the `add-api-endpoint` skill** before writing the new route — the error-string contract and auth middleware choice are non-obvious. Load `run-tests` before running tests. Blocks GH-168, GH-170, GH-156, GH-146.

### Finding 1 — `storageProvider.init()` is never called

`server/services/templates.ts`, symbol **`initializeFileStorage`**:

```ts
export async function initializeFileStorage(): Promise<void> {
  await storageProvider.init();
}
```

`grep -rn "initializeFileStorage" server/` returns **only this definition**. Nothing calls
it. `S3StorageProvider.init()` is the only place the required-bucket check lives:

```ts
  async init(): Promise<void> {
    if (!this.bucket) {
      throw new Error('S3 bucket name is required (set AWS_S3_BUCKET environment variable)');
    }
```

So that fail-fast is dead code. Deploying with `STORAGE_DRIVER=s3` and no `AWS_S3_BUCKET`
boots cleanly and then fails every upload at runtime with a generic
`createError.internal('Failed to save file')`. (`DiskStorageProvider` is unaffected — its
`saveFile`/`uploadFile`/`list` each call `await this.init()` internally.)

### Finding 2 — disk signed URLs point at a route that does not exist  ⬅ the real 404 cause

`server/services/storage/DiskStorageProvider.ts`, symbol **`getSignedUrl`**:

```ts
    async getSignedUrl(fileRef: string, _expiresIn?: number): Promise<string> {
        // Return a local API URL relative to the server
        // Requires an endpoint to serve these files, e.g. /api/storage/files/:key
        return `/api/storage/files/${fileRef}`;
    }
```

**No such route is registered anywhere in the repo** — `grep -rn "storage/files"` matches
only this file. Production runs the disk driver, so every caller of `getSignedUrl` hands the
browser a guaranteed 404. Live callers:
`server/services/TemplatePreviewService.ts` (`previewUrl`) and
`server/services/TemplateTestService.ts` (`docxUrl`, `pdfUrl`).

### Finding 3 — `S3StorageProvider.exists()` reports "missing" for every failure

```ts
    } catch (error: unknown) {
      // eslint-disable-next-line sonarjs/prefer-single-boolean-return
      if ((error as AwsSdkError).name === 'NotFound' || ...) {
        return false;
      }
      return false;
    }
```

Both branches return `false`, so an auth failure, network partition, or throttle is
indistinguishable from a genuinely absent object — surfacing to users as "file not found"
and hiding real misconfiguration. Note the dead `if` and the lint suppression papering over it.

### Finding 4 — custom S3 metadata can be written but never read back

`StorageMetadata` in `server/services/storage/types.ts` documents
`custom?: Record<string, unknown>; // Custom metadata like expiresAt`, and `uploadFile`
writes `Metadata: metadata as Record<string, string>`. But `getMetadata()` builds its return
value from `ContentType`/`ContentLength`/`ETag`/`LastModified` only and **drops
`response.Metadata`**, so `custom` is never populated. Anything stored there is unrecoverable.

### Finding 5 — `getLocalPath` temp cache collides and never invalidates

```ts
    const sanitizedRef = fileRef.replace(/[^a-zA-Z0-9.-]/g, '_');
    const tempFilePath = path.join(tempDir, `s3-cache-${sanitizedRef}`);
```

Distinct keys collapse to one filename (`a/b.docx` and `a_b.docx` both → `s3-cache-a_b.docx`),
and once cached the file is returned forever without any freshness check — an object replaced
in the bucket keeps serving stale bytes for the life of the container.

### Finding 6 — `S3StorageProvider` has no tests at all

`tests/unit/services/` contains `diskStorageProvider.test.ts` and nothing for S3. GH-169's
original AC5 ("tests prove fallback, error handling, and signed URL generation across
drivers") has never been met.

### Preferred fix

**Finding 1:** call `initializeFileStorage()` (or `storageProvider.init()` directly) during
server startup, before the app begins serving, and let a failure abort boot. Wire it where
the other startup steps live in `server/index.ts` — match the surrounding style.

**Finding 2 — make signed URLs genuinely signed on both drivers.** Do **not** serve raw
storage keys off an authenticated route: keys are shared across tenants' templates, previews
and outputs with no owner record to check, so "logged in" is not an authorization decision.
Instead mirror S3 presigning semantics with an HMAC:

- `DiskStorageProvider.getSignedUrl(key, expiresIn = 300)` returns
  `/api/storage/files/<key>?exp=<unixSeconds>&sig=<hex>` where
  `sig = HMAC-SHA256(secret, "<key>:<exp>")`.
- Derive the secret from an existing server secret (`SESSION_SECRET`/`JWT_SECRET` — follow
  whatever `server/services/CaptchaService.ts` or `server/lib/webhooks/dispatcher.ts` already
  does with `createHmac`; reuse, don't invent).
- New `server/routes/storage.routes.ts` exposes `GET /api/storage/files/*` which:
  recomputes the HMAC and rejects a mismatch; rejects `exp` in the past; **compares
  signatures with `crypto.timingSafeEqual`**; then streams the bytes via
  `storageProvider.getFile()`. Register it in `server/routes/index.ts` following the
  `registerDocsRoutes(app)` pattern.
- The route must be reachable **without** a session (that is the entire point of a signed
  URL — the signature is the credential), so do not attach `hybridAuth`. Send
  `Cache-Control: no-store` and a correct `Content-Type`.
- Path traversal is already handled inside `DiskStorageProvider.resolveWithinBase()`; route
  the request through the provider so you inherit it. Do not build paths in the route.

**Finding 3:** return `false` only for a genuine 404/`NotFound`; log and **rethrow**
everything else. Delete the dead second `return false` and the now-unneeded lint suppression.

**Finding 4:** populate `custom: response.Metadata` in `getMetadata()`.

**Finding 5:** hash the full key into the temp filename (e.g.
`s3-cache-${createHash('sha256').update(fileRef).digest('hex')}${path.extname(fileRef)}`) so
distinct keys cannot collide, and validate the cache entry against the object's `ETag` via
`getMetadata()` before reusing it — re-download on mismatch.

### Acceptance criteria

1. Storage initialization runs at server startup; a missing `AWS_S3_BUCKET` under
   `STORAGE_DRIVER=s3` fails boot with the existing explicit error instead of failing later
   per-upload.
2. `GET /api/storage/files/*` exists, is registered, and streams a stored file given a valid
   signature.
3. That route returns 403 (or the repo's equivalent via `classifyRouteError`) for a tampered
   signature, and 403 for an expired `exp`. Signature comparison uses `timingSafeEqual`.
4. A request for a well-signed but nonexistent key returns 404, not 500.
5. `DiskStorageProvider.getSignedUrl()` returns a URL carrying `exp` and `sig`, and a URL it
   produces verifies successfully against the route (**round-trip test**, not two isolated
   unit tests).
6. `S3StorageProvider.exists()` returns `false` for a 404 and **rethrows** any other error;
   the dead branch and its `sonarjs` suppression are gone.
7. `S3StorageProvider.getMetadata()` populates `custom` from `response.Metadata`.
8. `getLocalPath()` maps distinct keys to distinct temp files, and re-downloads when the
   cached copy's ETag no longer matches.
9. New `tests/unit/services/s3StorageProvider.test.ts` covers AC6, AC7, AC8 and signed-URL
   generation, mocking `@aws-sdk/client-s3` (`vi.mock`) — **no network calls, no real bucket.**
10. New tests cover AC2–AC5 for the route.
11. `npm run type-check`, `npm run lint`, `npm run test:fast` all green; `test:fast` count
    ≥ 2392 passing.

> **Out of scope, do not do:** setting `STORAGE_DRIVER=s3`, touching Railway, or writing an
> S3 backfill/migration script (see Audit correction 2 — it would orphan live files).

---

# Phase 1: P1 Document & Delivery Pipeline

## GH-168 — Make high-fidelity DOCX-to-PDF conversion the production default ✅

> **CLOSED 2026-08-06.** Production configuration was audited read-only and selects the
> Railway Gotenberg 8 service through `PDF_CONVERTER_API_URL`; a local app health check
> reported `healthy`, `strategy: gotenberg`, and `reachable: true`. The conversion boundary
> now emits structured selection/fallback/failure telemetry, returns safe actionable notices
> to template authors, preserves the usable DOCX when PDF conversion fails, and records
> failed PDF generation on the run document. A real two-page Gotenberg integration fixture
> verifies repeated headers/footers, live page numbering, an embedded Carlito font, merged
> and bordered table content, and stable pagination; both rendered pages were also inspected
> visually. Verification: `type-check` exit 0; `lint` exit 0 with zero warnings;
> `test:fast` 203 passed / 1 skipped files, 2531 passed / 14 skipped tests (baseline 2526);
> targeted Gotenberg integration 2 files / 2 tests passed. Self-grade: **A**.
>
> **Reviewer verification pass 2026-08-06.** Gates re-run from scratch in the ticket's
> worktree, not taken on report: `tsc --noEmit` exit 0, `npm run lint` exit 0
> (`--max-warnings 0`), `test:fast` 203 passed / 1 skipped files and 2531 passed /
> 14 skipped tests. Live proof: a real `gotenberg/gotenberg:8` container was started on
> :3009 and `pdfFidelity.test.ts` + `pdfStrategy.test.ts` ran **unskipped** — 2 files /
> 2 tests passed — so the two-page fixture genuinely converted through Gotenberg and the
> generated-document row genuinely recorded `pdfStrategy: 'gotenberg'`. Reviewer changes:
> none. Observation filed: on a degraded-but-successful conversion the template test
> runner shows the notice in a tab labelled "Errors" while the summary still reads "Test
> Successful" — cosmetic, logged as O-11 rather than reopened here.

**Priority: P1** · Size: M · Files: `server/services/document/PdfConverter.ts`, `server/services/document/GotenbergPdfConverter.ts`, `server/routes/ops.routes.ts`
**Ties:** Preceded by GH-169; Blocks GH-170

### Context & Current State
- Gotenberg converter selection (`DOCH-5`) and converter health check endpoint (`DOCH-6`) have already shipped.
- Ensure production deployment configuration defaults to Gotenberg and fallback paths (e.g. LibreOffice / Puppeteer) accurately log conversion telemetry.

### Acceptance Criteria
1. Gotenberg conversion is verified as the primary engine for template DOCX -> PDF generation.
2. Layout fidelity (headers, footers, page numbering, custom fonts, complex tables) renders matching Word output.
3. Conversion failures gracefully report actionable errors to authors and audit logs.
4. Unit/integration tests cover converter selection, health checks, and failure recovery.

---

## GH-156 — Persist document mappings in a guided mapping workbench ✅

> **CLOSED 2026-08-06.** A Document Mapping Workbench lists every extracted placeholder and
> binds each one through a new `MappingBinding` discriminated union — `variable` (step alias
> or dotted path), `constant`, `formula` (`{{alias}}` substitution, no eval), and `datavault`
> (table/column/row). `AIAssistPanel` was **replaced** by `DocxMappingPanel` and deleted, not
> left in place; the reviewer confirmed no live references remain.
>
> **No migration — and that is the right call.** Mappings persist in the existing jsonb
> (`templates.mapping` and step `config`), and saving one now records a template version
> ("Field mapping updated via Document Mapping Workbench"), so AC3's "with workflow
> versioning" is satisfied by the mechanism that already versions steps through
> `VersionService.serializeWorkflow`. **Consequence: GH-156 did not consume a migration
> number — the chain tip is still `0019` and the next migration is `0020`.**
>
> **AC4 lands on GH-152's new contract.** The publish-gate warnings are emitted through the
> `issue(...)` helper with `category: "documents"` and a deep-link `target`, so unmapped and
> mismatched bindings appear in the Review tab's Documents tab with a working "Fix" link
> rather than as uncategorized strings.
>
> **Reviewer verification pass 2026-08-06.** The dev agent ended its run without producing a
> turn-in report, so **every gate here was run by the reviewer from scratch**, not accepted
> on report: `tsc` exit 0, `lint` exit 0, `test:fast` 216 passed / 1 skipped files and 2604
> passed / 14 skipped tests (+37 over `main`'s 2567), `templates.mapping-workbench`
> integration 1 file / 5 tests.
>
> **Two apparent scope violations were checked and cleared.** (1) `server/services/esign/`
> was modified — justified: widening `mapping` to `MappingBinding` breaks
> `SignatureDocument.mapping`'s old narrow `{type:'variable', source}` shape, so the esign
> tab builder had to move to `resolveBindingToString`. Leaving it would not have compiled.
> (2) `AIAssistPanel.tsx` was deleted — justified as above. Both should have been declared
> by the dev rather than found by the reviewer.
>
> **Reviewer fix (senior, at review).** `extractFormulaReferences` did
> `refs.push(match[1])` — clean under `tsc --noEmit` and `lint`, but
> `shared/types/documentMapping.ts` sits in a **strict zone** with
> `noUncheckedIndexedAccess`, where a capture group is `string | undefined`. The
> pre-commit hook's `check:strict-zones` rejected it with three TS2345s. Narrowed with an
> explicit `undefined` check rather than a non-null assertion. Worth recording as a process
> point: `tsc` + `lint` passing is **not** the commit gate here — `check:strict-zones` pulls
> files in transitively and only `npx tsx scripts/pre-commit-checks.ts` reproduces it.

**Priority: P1** · Size: L · Files: `client/src/components/builder/`, `client/src/pages/`, `server/routes/templates.routes.ts`, `server/services/document/`
**Ties:** Preceded by GH-169; Blocks GH-167

### Context & Current State
- Template preview suggests and extracts placeholders, but the builder lacks a unified workbench to review, bind, validate, and permanently persist variable-to-step mappings.

### Acceptance Criteria
1. Dedicated Document Mapping Workbench UI in builder showing all extracted template placeholders.
2. Visual binding interface mapping template variables to workflow step aliases, DataVault columns, or formulas.
3. Field mapping definitions persist in database with workflow versioning.
4. Unmapped or mismatched variable types display clear warnings in the editor and publish gate.
5. Unit and integration tests verify persistence, round-trip editing, and execution during document generation.

---

## GH-170 — Add document delivery destinations with retries and audit status ✅

> **CLOSED 2026-08-05 (Senior re-dispatch).** F1–F6 are corrected: real user/org/project
> ownership resolves to a tenant before insert; both server entrypoints own the worker
> lifecycle and stale jobs are reclaimed; destination credentials and webhook headers are
> encrypted at the step persistence boundary and redacted from delivery APIs; webhook and
> custom S3 traffic is DNS-validated and pinned with sanitized object keys; all reads and
> manual retries are tenant-scoped; and destination config validation is discriminated by
> type. Email jobs now attach generated artifacts and become delivered only after SendGrid
> accepts the message. Real-DB tests cover the FK, claims, stale recovery, audit append,
> encryption, and RLS policy; an authenticated integration test proves cross-tenant denial.
> Verification: `type-check` exit 0; `lint` exit 0; `test:fast` 195 passed / 1 skipped
> files, 2464 passed / 14 skipped tests; `test:unit:db` 15 files / 143 tests passed; targeted integration
> 1 passed file / 3 passed tests. Self-grade: **A**.

> **FAILED review 2026-08-04 (Senior).** Gates re-run by the reviewer and confirmed green
> (`type-check` exit 0, `lint` exit 0, `test:fast` **194 files / 2440 tests**, baseline 2401
> after GH-169A/B). The gates are honest; the feature is not. Six defects, two of them
> runtime-fatal, one a credential-exposure. See the failure report below. Triage: **SEND
> BACK**. Do not commit this tree.
>
> **F1 (fatal) — every enqueue throws a foreign-key violation.**
> `DocumentDeliveryService.enqueueDeliveriesForRun` derives the tenant as
> `const tenantId = workflow?.ownerUuid ?? run.ownerUuid ?? 'default-tenant';`
> with no `ownerType === 'tenant'` guard. `workflows.owner_uuid` is a `varchar` holding a
> **user** id when `owner_type = 'user'`, but `run_document_deliveries.tenant_id` is
> `uuid NOT NULL REFERENCES tenants(id)`. Reviewer queried the dev database read-only:
> `workflows.owner_type` = `[{user: 83}, {null: 1}]`, and **0 of 84** `owner_uuid` values
> match a `tenants.id`. So the insert raises `23503` for every workflow that exists, and
> `RunLifecycleService` swallows it in its `catch` (logs `Failed to enqueue document
> deliveries for run`, run continues). The literal `'default-tenant'` fallback additionally
> raises `22P02` — it is not a UUID. AC1/AC2/AC3/AC5 are all unreachable in practice.
> The unit test hides this: its fixture sets `ownerType: 'tenant', ownerUuid: 'tenant-789'`,
> a shape that does not occur in the data, and the repository is mocked so no constraint runs.
>
> **F2 (fatal) — the retry worker is never started, so backoff retries never fire.**
> `DocumentDeliveryService.startWorker()` has no caller anywhere in `server/`. Compare
> `emailQueueService.startWorker()`, which is wired at `server/index.ts:115` and
> `server/production.ts:85` — the pattern was copied but not connected. A failed delivery
> is written `status='retry'` with a future `nextAttemptAt` and nothing ever polls it again.
> The only dispatch triggers are the `setImmediate` after enqueue, the extra
> `processPendingDeliveries()` in `RunLifecycleService`, and the manual retry route. AC2
> ("background queue manages delivery dispatch with exponential backoff retries") is unmet:
> `calculateBackoff` is correct and dead. Related: `claimBatch` moves rows to `'processing'`
> with no reaper, so a crash mid-delivery strands the row permanently.
>
> **F3 (security) — destination credentials are stored and served in plaintext.**
> `CloudStorageDeliveryConfig` carries `accessKeyId` / `secretAccessKey` and
> `WebhookDeliveryConfig` carries `secret`. These land unencrypted in `steps.config` jsonb
> and are copied verbatim into `run_document_deliveries.destination_config`, then returned
> raw by `GET /api/tenants/:tenantId/deliveries/:deliveryId` and
> `GET .../runs/:runId/deliveries` (`res.json(delivery)` / `res.json(deliveries)` — no
> redaction). This violates CLAUDE.md convention 6 (secrets are AES-256-GCM encrypted and
> reached only through the secrets service). Fix: reference a `secrets` entry by id, or at
> minimum encrypt at rest and strip these keys in the route serializer.
>
> **F4 (security) — AC4's `safeFetch` requirement is only half-met.**
> `WebhookDeliveryAdapter` correctly routes through `safeFetch`. `CloudStorageDeliveryAdapter`
> passes user-controlled `config.endpoint` straight into `new S3Client({ endpoint })` with no
> validation at all — an arbitrary internal host or `169.254.169.254` receives a POST carrying
> the generated document. AC4 says *all* outbound payloads. Also `config.pathPrefix` +
> `doc.fileName` are concatenated into the object key unsanitised.
>
> **F5 — the tenant-isolation check on the list route does not execute, and its test
> cannot fail.** `documentDelivery.routes.ts` does
> `const runTenant = run.ownerType === 'tenant' ? run.ownerUuid : null; if (runTenant && ...)`.
> Per F1 no run has `ownerType = 'tenant'`, so `runTenant` is always `null` and the check is
> skipped — `findByRunId(runId)` is then unscoped, so any authenticated user of any tenant
> can read any run's deliveries by id (IDOR). The test that claims to cover this
> (`should return list of deliveries for the run`) mocks the run as `{ id, tenantId }` —
> `workflow_runs` has **no** `tenantId` column; the route never reads that field. The
> assertion passes because the guard is bypassed, not because it works. There is no test for
> a run owned by a different tenant.
>
> **F6 — `DeliveryDestinationSchema.config` is a plain `z.union`, not discriminated.**
> Validation never ties `config` to `type`, so `{ type: 'webhook', config: { to: 'a@b.c' } }`
> validates. `docs/architecture/SECURITY_THREAT_MODEL.md` documents discriminated unions as
> the repo's standing answer to exactly this. Use `z.discriminatedUnion('type', …)` with
> per-type `config`, and make `WebhookDeliveryConfigSchema.url` a real URL check rather than
> `z.string().min(1)`.
>
> **Testing gap behind all of the above.** Every test mocks the repository and the adapters;
> there is not one unit-db test. F1 would have been caught by a single real insert, F5 by one
> real row. AC3 ("stored and queryable per run") and AC5's "audit event logging" are asserted
> only as "the mock was called" — the jsonb `||` append, the CHECK constraints, the partial
> claim index and `FOR UPDATE SKIP LOCKED` are entirely unexercised. Re-dispatch must add
> unit-db coverage.
>
> **Not a blocker, note for the re-dispatch:** there is no builder UI for
> `deliveryDestinations`, so the feature is unreachable from the product even once F1/F2 are
> fixed. The ACs do not require UI, so this is not counted against the ticket — file it as a
> follow-up.

**Priority: P1** · Size: L · Files: `server/services/document/delivery/`, `server/queues/`, `shared/schema/document.ts`
**Ties:** Preceded by GH-169, GH-168

### Context & Current State
- Rendered documents are currently available via immediate download. Delivery to external endpoints (Email attachment via SendGrid, S3 client bucket, webhook, Google Drive/Clio) lacks structured retry and delivery audit log.

### Acceptance Criteria
1. Define configurable delivery destinations for workflows (Email, Webhook, Cloud Storage).
2. Background queue manages delivery dispatch with exponential backoff retries.
3. Delivery status, timestamp, attempts, and error logs are stored and queryable per run.
4. Security: All outbound payloads enforce tenant isolation and URL validation (`safeFetch`).
5. Tests prove successful delivery, retry exhaustion, and audit event logging.

---

## GH-157 — Complete the production DocuSign envelope lifecycle ✅

> **CLOSED 2026-08-06.** `DocusignProvider` is now a real client: OAuth JWT grant with
> `signature impersonation` scope and a cached, early-refreshed access token; envelope
> creation with recipient role, routing order, `clientUserId`, variable-backed text tabs
> and run/step custom fields; embedded recipient views; status, void, and combined
> signed-document download. `initializeEsignProviders()` is finally called — from both
> `server/index.ts` and `server/production.ts` — so the registry is no longer
> unconditionally empty (closes the `DEBT-4` / e-sign-registry gap). `/api/esign/webhook/docusign`
> verifies DocuSign Connect HMAC over the **exact raw bytes** (`express.json` now captures
> `rawBody`) and fails closed when the secret is unset. Completed envelopes stream their
> combined PDF into `storageProvider` under `runs/<runId>/signatures/<requestId>/` and get
> a `run_generated_documents` row plus a `documentUrl` on the request. Migration 0017 adds
> the `completed`/`voided`/`expired` signature events and the `voided` request status; the
> builder's "DocuSign (Coming Soon)" option is now selectable and the runner calls the real
> endpoint. The 723-line "dormant architecture" guide was replaced with a 114-line operator
> guide, because the old one documented behaviour that no longer exists.
>
> **Reviewer verification pass 2026-08-06.** Gates re-run in the worktree after the
> reviewer fixes below: `tsc --noEmit` exit 0, `npm run lint` exit 0, `test:fast` 204
> passed / 1 skipped files and 2530 passed / 14 skipped tests, `test:unit:db` 15 files /
> 145 tests. Live proof: `tests/integration/esign.docusign.test.ts` ran against the
> worktree's own Postgres — 1 file / 5 tests — driving real HTTP through the registered
> routes: a run-token holder creates an envelope from server-owned run data, a creator in
> a *different tenant* is refused 403, a **forged** webhook signature is refused 401, a
> valid `envelope-completed` webhook stores the signed PDF and its audit event, and
> declined/voided webhooks persist their lifecycle status. The DocuSign HTTP boundary is
> injected, so no credentials or outbound calls are involved. `DocusignProvider.test.ts`
> additionally verifies the JWT assertion by **RS256 signature against the public key**,
> not just by shape.
>
> **Reviewer fixes (senior, at review).** (1) `LoadedRunnerScreenProps` had re-admitted
> `isProductionMode` as *optional*, so a caller that forgot it would silently downgrade
> real signing to the local preview simulation — made required and the RUN2-4 test props
> updated. (2) The signed-PDF document row was writing `pdfStrategy: 'docusign'`; that
> column records which DOCX→PDF converter ran, and none did. Dropped, so GH-168's converter
> telemetry stays truthful — the storage key already carries the provenance.
>
> **Observation filed (O-12):** `express.json`'s `verify` hook now retains a `rawBody`
> copy for *every* JSON request up to `MAX_REQUEST_SIZE`, not just the webhook path.
> Harmless today (uploads go through multer) but worth scoping to the webhook route.
>
> **Merge reconciliation with GH-146 (reviewer).** Both tickets threaded run context down
> the same three runner files. Rebasing GH-157 onto GH-146 conflicted on
> `BlockRendererProps`, `SectionSteps` and `WorkflowRunner`, where each had independently
> added a `runId`/`runToken` pair with *different* token types. Resolved to one chain
> carrying `runId`, `runToken?: string | null` (the type `getRunToken` actually returns),
> `runStepId` for List-nested uploads and `preview` for signature blocks; the duplicate
> pair on `QuestionCardContentProps` was removed since it already inherits them, and
> `FileUploadBlock`/`ListDrillEditor` were widened to accept the null. Merged tree re-gated:
> `tsc` exit 0, `lint` exit 0, `test:fast` 208 passed / 1 skipped files and 2544 passed /
> 14 skipped tests, and the esign + file-upload integration suites together 2 files /
> 8 tests passed — so both features are proven to coexist, not just to have merged.

**Priority: P1** · Size: L · Files: `server/services/esign/`, `server/routes/esign.routes.ts`, `shared/schema/esign.ts`
**Ties:** Preceded by GH-169; Relates to GH-149

### Context & Current State
- DocuSign preview stubs exist; `initializeEsignProviders()` was historically dormant (`DEBT-4`). Production OAuth JWT grant, envelope creation, recipient signing URLs, webhook status updates, and final signed document retrieval need completion.

### Acceptance Criteria
1. Production DocuSign JWT Grant authentication and connection configuration.
2. Workflow runner triggers real envelope creation with mapped recipient roles and template tabs.
3. Webhook listener (`/api/esign/webhook/docusign`) handles `completed`, `declined`, and `voided` events with HMAC verification.
4. Completed signed PDFs are saved to durable storage (`storageProvider`) and attached to the run record.
5. Comprehensive integration tests with mocked DocuSign API endpoints.

---

## GH-149 — Package legal delivery integrations for Clio, e-signature, and payments ✅

> **CLOSED 2026-08-06.** A project-scoped integrations hub at
> `/projects/:id/settings/integrations` packages Clio Manage, Stripe, and DocuSign.
> Clio: region-pinned OAuth (us/eu/ca/au), contact creation, and matter-document filing.
> Stripe: idempotent PaymentIntents and a signed-webhook endpoint. Both providers'
> credentials go through the existing `secrets` service, so AES-256-GCM under
> `VL_MASTER_KEY` is inherited rather than reimplemented, and setup responses return only
> secret *references*. DocuSign is surfaced read-only from the GH-157 registry.
>
> **Reviewer verification pass 2026-08-06.** Rebased onto `main` (GH-152) **before**
> gating, so the numbers describe what actually lands: `tsc` exit 0, `lint` exit 0,
> `test:fast` 212 passed / 1 skipped files and 2560 passed / 14 skipped tests,
> `legal-integrations.routes` integration 1 file / 4 tests.
>
> **Live proof (reviewer).** The dev reported no browser backend, so the reviewer drove it:
> worktree server on **:5178**, confirmed serving this branch (not `main`) by grepping a
> changed source file over HTTP. `GET /api/projects/:id/integrations` returned **200** with
> Clio/Stripe `not_configured` and DocuSign `unavailable` (correct — no `DOCUSIGN_*` set
> locally). Drove the page in a real browser: hub renders, the Stripe dialog opens with
> correct key-format placeholders, mobile (390px) stacks without overflow. The only console
> errors are Vite HMR websocket noise on :5000. Probe tenant/user/project deleted and the
> deletion proven (`leftover tenants: 0  projects: 0`).
>
> **Security notes checked:** Clio's `baseUrl` is server-pinned from the region enum, and
> both providers call out through `safeFetch`, so a hand-crafted `provider: 'clio'`
> connection pointing at an internal address is refused by the SSRF guard rather than
> proxied. The Stripe webhook verifies `t=`/`v1=` with a 300s replay window and a
> timing-safe compare over `${timestamp}.${rawBody}`, rejects a project-id mismatch, and
> fails closed when the signing secret is absent.
>
> **Observation filed (O-14):** the PaymentIntent `Idempotency-Key` is taken verbatim from
> the client and not namespaced by project. Harmless while each project holds its own
> Stripe secret key (idempotency is scoped per Stripe account), but worth prefixing if
> projects ever share an account.

**Priority: P1** · Size: L · Files: `server/services/integrations/`, `server/routes/connections.routes.ts`, `client/src/components/builder/integrations/`
**Ties:** Preceded by GH-157, GH-170

### Context & Current State
- Generic REST connections exist, but curated legal workflows require out-of-the-box templates for Clio (matters/contacts), DocuSign/Adobe Sign, and Stripe payments.

### Acceptance Criteria
1. Curated integration wizard for Clio API (creating contacts, filing matter documents).
2. Packaged Stripe payment intent generation and webhook confirmation.
3. Connection credentials encrypted via AES-256-GCM (`VL_MASTER_KEY`).
4. End-to-end failure handling and user-facing setup documentation.

---

# Phase 2: P1 Runner Experience, Reliability & Compliance

## GH-160 — Add resilient autosave, offline buffering, and conflict recovery ✅

> **CLOSED 2026-08-06 (Senior).** Landed as `28b08b08`, merged to `main` via `70898daa`.
> All five ACs met, and all five were **proven against the live app**, not just unit tests
> — this ticket had never been reviewed, so the reviewer drove it end to end on port 5174.
>
> - **AC1** — `client/src/lib/runner/offlineBuffer.ts` writes to IndexedDB
>   (`ezbuildr_runner_offline_db` / `pending_step_values`). Proven live: with
>   `navigator.onLine` stubbed false, typing into a runner field produced a buffered row
>   `{value: "Ada Lovelace Byron King", clientTimestamp, clientRevision: 23,
>   status: "pending"}` while the UI showed **"Offline (saved locally)"**.
> - **AC2** — dispatching `online` drained it: the buffer went to `[]` and the value
>   landed in `step_values` in Postgres with a fresh `updated_at`. Zero data loss across
>   a full disconnect/reconnect.
> - **AC3** — `StepValueRepository.upsertManyWithTimestamps` compares the incoming
>   `clientTimestamp` against the row's `updatedAt` and, when the server copy is strictly
>   newer, preserves it and reports it in a `conflicts[]` array that
>   `POST /api/runs/:runId/values/bulk` returns alongside the save.
> - **AC4** — the four states render and announce: observed live in order
>   **"Offline (saved locally)" → "Syncing changes..." → "Saving..." → "Saved"**, inside
>   GH-159's `role="status" aria-live="polite"` region with every icon `aria-hidden="true"`.
> - **AC5** — `useRunValuesOffline.test.ts` (388 lines), `offlineBuffer.test.ts`,
>   `runConflictRecovery.test.ts`, plus `tests/e2e/runner-offline-resilience.e2e.ts`.
>
> Verification: `type-check` exit 0; `check:strict-zones` 4/4; `lint` exit 0; `test:fast`
> **202 files / 2524 tests passed** (baseline 2504 after GH-159, +20); `test:unit:db`
> 15 files / 143 tests; **full integration 102 files / 1057 tests passed**.
>
> **Merge note.** `ClientRunnerLayout.tsx` conflicted with GH-159 twice. Resolution kept
> GH-160's `Loader2` spinner and `emerald-600/dark:emerald-400` check (both higher
> contrast than the `green-500` pair they replaced) and extended GH-159's `aria-hidden`
> to the offline/syncing/error icons GH-160 introduced.
>
> **One latent sharp edge, not blocking.** `upsertManyWithTimestamps` derives its
> comparison set from `findByRunId(dataList[0].runId)` while `assertRunsMutable` accepts
> many run ids. Every current caller passes a single run id from the route param, so this
> is unreachable today — but a future batch spanning runs would silently skip conflict
> detection for every run after the first.

**Priority: P1** · Size: M · Files: `client/src/hooks/useAutoSave.ts`, `client/src/components/runner/`, `server/routes/runs.routes.ts`
**Ties:** Independent

### Context & Current State
- `useAutoSave` has a `beforeunload` guard and `keepalive` bulk-save.
- Needs IndexedDB / local storage offline buffer queue when network drops, with automatic flush and optimistic conflict recovery upon reconnection.

### Acceptance Criteria
1. Runner buffers step responses to IndexedDB when offline.
2. Network status listener automatically flushes buffered answers on reconnect.
3. Server versioning/timestamp checks detect and gracefully merge conflicting submissions.
4. Visual indicator shows saving, saved, offline, and syncing states to the respondent.
5. Unit and browser tests prove zero data loss during simulated offline disconnect/reconnect.

---

## GH-146 — Support repeaters, loop groups, and file uploads in the runner ✅

> **CLOSED 2026-08-06.** The runner now renders `file_upload` with a keyboard-reachable
> drag-and-drop dropzone, XHR progress, client-side type/size/count validation, download
> and delete, and the same control nested inside a List item. Uploads are spooled by
> multer, virus-scanned, quota-checked, then streamed through `storageProvider` under a
> `tenants/<tenantId>/runs/<runId>/steps/<stepId>/` key; reads and deletes re-derive that
> prefix and refuse anything outside it. List answers now render as a structured outline
> in both respondent review and execution details instead of raw JSON, and `file_upload`
> moved from `RUNNER_INTENTIONALLY_UNSUPPORTED_STEP_TYPES` into the rendered set so the
> publish gate accepts it. Repeater/loop-group scope was correctly dropped: both types
> were retired in LIST-13.
>
> **Reviewer verification pass 2026-08-06.** Gates re-run in the worktree after the
> reviewer fix below: `tsc --noEmit` exit 0, `npm run lint` exit 0, `test:fast` 205 passed
> / 1 skipped files and 2535 passed / 14 skipped tests. Live proof: `api.runs.file-upload`
> and `hardening/quota` ran against the worktree's own Postgres — 2 files / 5 tests
> passed — covering a real multipart POST with a bearer token, tenant-prefixed key
> assertion, storage round-trip, answer persistence, MIME rejection, and a cross-tenant
> 403.
>
> **Reviewer fix (senior, at review).** `StorageQuotaService.getStoredBytes` listed the
> tenant prefix and then issued one `getMetadata` per stored object — on the live S3
> driver that is a `HeadObject` per file, fired with unbounded `Promise.all` concurrency,
> on a path that runs on *every* upload including template uploads and imports. Replaced
> with `StorageProvider.getTotalSize(prefix)`: S3 sums the `Size` that `ListObjectsV2`
> already returns (one request per 1000 objects), disk recurses over `readdir` dirents.
> The now-unused `isDirectory` metadata flag added to `DiskStorageProvider` was reverted.
> The S3 `list()` pagination fix the dev added is a genuine separate bug fix and was kept.

**Priority: P1** · Size: L · Files: `client/src/components/runner/blocks/`, `server/routes/runs.routes.ts`, `shared/schema/`
**Ties:** Preceded by GH-169

### Context & Current State
- Structural repeating questions were unified into the `list` question type (`LIST-1..14`, `LIST2-1..16`). `repeater` and `loop_group` were retired.
- `file_upload` block in runner requires completion: secure upload endpoint, storage quota enforcement, mime validation, and inclusion in final document attachments.

### Acceptance Criteria
1. Runner renders `file_upload` with drag-and-drop, progress bar, and file validation.
2. Uploads are streamed to tenant-scoped storage via `storageProvider`.
3. List question answers render cleanly in review and run execution details.
4. Publish validation gate permits only supported runner step types.
5. Unit and integration tests verify upload, validation, and answer persistence.

---

## GH-147 — Make save-and-resume, assignment, and staff/client handoff first-class ✅

> **CLOSED 2026-08-06.** Respondents can request an emailed resume link; staff can hand a
> run off to a tenant user or a client email. Links are 256-bit
> (`randomBytes(32)`), stored only as `hashToken(...)`, and single-use: `consumeActive`
> is one atomic `UPDATE ... WHERE token_hash = ? AND expires_at > now AND used_at IS NULL
> AND revoked_at IS NULL RETURNING`, so a concurrent second redemption matches zero rows
> instead of racing. Handoff requires workflow **edit** permission; creation, access and
> handoff all emit audit events; resume credentials are excluded from portability exports.
>
> **Migration 0018 + 0019 (see note below).** Chain tip was `0017`.
>
> **Reviewer verification pass 2026-08-06.** Rebased onto `main` (`1344b663`) before
> gating — four files overlapped what landed since this branch was cut (`WorkflowBuilder.tsx`
> from GH-152; `CLAUDE.md`, `API_ENDPOINTS.md`, `SERVICES.md` from GH-149) and merged
> cleanly. Gates re-run by the reviewer: `tsc` exit 0, `lint` exit 0, `test:fast` 214
> passed / 1 skipped files and 2567 passed / 14 skipped tests,
> `api.runs.resume-handoff` 1 file / 3 tests, `test:unit:db` 15 files / 145 tests.
>
> **Fresh-database migration proven independently.** This was the blocker the original dev
> could not clear, so the reviewer re-ran it rather than accepting the report: created an
> empty database, ran `db:migrate` end to end (`✅ Migrations completed successfully!`), then
> confirmed on that database that `run_resume_links` has row-level security enabled and
> `workflow_runs` carries both new columns. Database dropped afterward.
>
> **Deviation accepted — two migration numbers, not one.** `run_resume_links` has a direct
> `tenant_id`, so per SEC-051 it needs its own `tenant_isolation` policy, and this repo never
> mixes drizzle-generated DDL with hand-written RLS in one file. The reviewer verified the
> claimed precedent rather than taking it: `0014` generates `run_document_deliveries` and
> `0015` adds its RLS, exactly the same split, and `0019`'s policy body is character-for-character
> the `current_setting('app.current_tenant_id', true)::uuid` form used in `0015`. Journal was
> written by drizzle-kit, not hand-edited. **Consequence: the next migration is `0020`.**

**Priority: P1** · Size: M · Files: `server/services/runs/`, `server/routes/runs.routes.ts`, `client/src/pages/runner/`
**Ties:** Preceded by GH-160

### Context & Current State
- Run token authentication exists (`RunTokenService`), but respondents lack an explicit "Save and Continue Later" modal with email link generation, and staff lack clean re-assignment/handoff controls.

### Acceptance Criteria
1. Respondent can request a magic resume link sent to their email with configurable expiry.
2. Workflow authors/staff can re-assign an in-progress run to another user or client email.
3. Resumed sessions restore complete wizard state, current section, and validated answers.
4. Audit events log save-and-resume link creation, access, and handoff.
5. Tests verify link security, expiration enforcement, and session restoration.

---

## GH-158 — Apply workflow branding and white labeling across the runner ✅

> **Verified 2026-08-05 (Senior).** All 10 ACs met, gates run in the GH-158 worktree:
> `type-check` exit 0, `lint` exit 0 (`--max-warnings 0`), `check:strict-zones` ✅,
> `test:fast` **194 files / 2469 tests passed** (worktree baseline 2421 at `1c173d55`, +48).
>
> **Proven live** against the worktree's own server on port 5199 (confirmed serving this
> tree, not `main`, by grepping a token added and a string removed). Three runs were created
> differing only in branding:
> - **default** → inherited *tenant* branding (`Tenant Fallback Co`, `#1D4ED8`), proving the
>   tenant fallback rather than just the workflow path.
> - **branded** → Northwind logo replaced the ezBuildr mark; `#B22222` reached the Next
>   button, card border and focus ring **with no component changes**, which is the whole
>   point of theming through the existing CSS custom properties.
> - **white-label** → `document.body.innerText.includes('ezBuildr') === false`.
>
> Also verified live: `--primary` lands on the runner root and **not** on
> `document.documentElement` (so a preview cannot repaint builder chrome); the `/share/:token`
> completion screen renders the same branding and drops the footer under white-label while
> keeping it without; and the API rejects `javascript:`, `data:` and non-hex values with 400
> (safe payload 200). Builder round-trip read back `organizationName`, `logoUrl`,
> `primaryColor`, `whiteLabel` after save+reload. Probe fixtures cleaned up (`leftover
> tenants: 0`).
>
> **Two things fixed during review, not shipped as found.** (1) `--primary-foreground` is
> *derived* (better of black/white against the brand), which is provably >= 4.58:1 for any
> brand color — the AA guarantee does not depend on the author picking well. (2) The brand
> accent is exposed as `--brand-accent` and deliberately **not** mapped onto `--accent`,
> which in this design system is a subtle hover surface; assigning a saturated color to it
> would have made every dropdown unreadable.
>
> **Preview parity closed 2026-08-05 (O-9).** Preview originally resolved workflow branding
> client-side and could not see tenant-level fallbacks. It now reads a server-resolved value
> off the single-workflow GET, through the same service the runtime payload uses, so GitHub
> #158's "preview renders the exact resolved participant branding" criterion is met for
> branding. (Preview still renders the *live draft* rather than the pinned published version
> — by design, and unrelated to branding.)
>
> **Re-proven independently by the reviewer 2026-08-06** before merge, against `main` on
> port 5174 with two public workflows differing only in `workflows.settings`:
> - default → ezBuildr mark and the "Securely powered by ezBuildr" footer.
> - branded + white-label → header read **"Northwind Legal"**;
>   `GET /api/runs/:id/runtime` returned `{organizationName: "Northwind Legal",
>   primaryColor: "#B22222", accentColor: "#7A1010", whiteLabel: true}`; the Review
>   button's computed `background-color` was **`rgb(178, 34, 34)`** — #B22222 reaching a
>   component with no component changes, which is the point of theming through the CSS
>   custom properties; and `document.body.innerText.includes('ezBuildr') === false`.
> Confirmed at 1280px, 390px, and in dark mode.
>
> **Fixture gotcha for whoever tests this next:** branding keys live **flat** on
> `workflows.settings` (`settings.primaryColor`, `settings.whiteLabel`, …), matching the
> PATCH route's `workflowBrandingSettingsSchema.passthrough()`. Nesting them under
> `settings.branding` parses cleanly, stores fine, and silently resolves to product
> defaults — it looks exactly like a broken feature.

**Priority: P1** · Size: M
**Files (footprint):** `shared/types/branding.ts`, `shared/colorUtils.ts` (new), `client/src/lib/colorUtils.ts`, `server/routes/workflows.routes.ts`, `server/services/workflow-runs/RunRuntimeService.ts`, `client/src/lib/vault-api.ts`, `client/src/hooks/useRunnerBranding.ts` (new), `client/src/components/runner/ClientRunnerLayout.tsx`, `client/src/pages/WorkflowRunner.tsx`, `client/src/pages/RunCompletionView.tsx`, `client/src/components/builder/tabs/settings/BrandingSettingsCard.tsx`, `client/src/components/builder/tabs/SettingsTab.tsx`
**Collides with:** GH-160 also touches `client/src/pages/WorkflowRunner.tsx`. Sequence them, or keep this ticket's edit to the two `ClientRunnerLayout` props it adds.
**Ties:** `add-api-endpoint` skill (route validation), `run-tests` skill, `verify` skill (live proof), `design` skill (any runner UI change). Related: GH-159 (contrast/a11y), GH-147 (save-and-resume surface sits inside the branded layout).

### Context & Current State

Branding is **write-only**. The builder persists it, the runtime payload already
delivers it, and **nothing reads it**.

`SettingsTab.tsx` (`handleSave`) writes four branding keys into `workflows.settings`:

```ts
        settings: {
          brandingEnabled,
          logoUrl,
          primaryColor,
          secondaryColor,
```

Grep for `brandingEnabled` across `server/`, `shared/`, and `client/`: the only
hits are the builder card that writes it. There is no reader.

The delivery plumbing already exists. `RunRuntimeService.getRuntime` returns
`settings: graph.settings`, `ApiRunRuntime.workflow` is typed
`Pick<ApiWorkflow, ... | 'settings'>`, and `WorkflowRunner.tsx` already reaches into
that object for a sibling key (`allowsSaveAndResume`). Only the branding
consumption is missing.

Meanwhile the participant sees ezBuildr hardcoded in three places.
`ClientRunnerLayout` (the layout behind **all four** runner screens — question
pages, review, completion, and the loading state):

```tsx
                        {/* Placeholder Logo / Brand */}
                        <div className="w-6 h-6 bg-primary rounded-sm" />
                        <span className="font-semibold text-sm tracking-tight text-foreground">ezBuildr</span>
```

```tsx
                    <p>Securely powered by ezBuildr</p>
```

and `RunCompletionView` (the `/share/:token` document-download screen):

```tsx
                <div className="mt-12 text-center text-sm text-gray-400">
                    Powered by ezBuildr
                </div>
```

**Four disagreeing branding models exist, with no resolution order.** `tenants.branding`
(jsonb, `TenantBranding`, uses `accentColor`), `workflows.settings` (uses
`secondaryColor` for the same idea), the final-block `brandingColor`, and
`workflows.intakeConfig`. A complete branded-intake component family
(`client/src/components/intake/`), **two duplicate `BrandingProvider`s**
(`components/branding/BrandingContext.tsx` and `components/providers/BrandingProvider.tsx`),
and `client/src/hooks/useResolvedBranding.ts` (**zero importers**) were all built and
wired to nothing but `IntakeDemo`/`IntakePreviewPage`. This ticket introduces the
single resolver those should eventually collapse into; see O-6.

`workflows.settings` is **unvalidated on write** — `server/routes/workflows.routes.ts`
declares `settings: z.record(z.any()).optional()`, so `logoUrl` reaches an `<img src>`
and the colors reach CSS custom properties with no sanitization.

### Preferred fix

**One resolver, applied as CSS custom properties.** Do not introduce new themed
components — the runner is built on shadcn/Tailwind tokens that already read
`var(--primary)`, `var(--background)` etc. (see `tailwind.config.ts`). Setting those
variables on the runner's root element re-themes every existing component for free.
This is why the `intake/` `Themed*` family is *not* the pattern to copy.

1. Add `resolveBranding(tenantBranding, workflowSettings)` to `shared/types/branding.ts`
   returning a single `ResolvedBranding`. Workflow settings win over tenant; tenant
   fills gaps; `brandingEnabled: false` falls back to tenant-only. Normalize the
   `accentColor`/`secondaryColor` naming split here — this function is the only place
   that should know about it.
2. Move the pure color math from `client/src/lib/colorUtils.ts` into `shared/colorUtils.ts`
   and re-export from the old path so existing importers keep working. The server needs
   `getContrastRatio` for write-time validation; duplicating it is not acceptable.
3. Replace `z.record(z.any())` with a passthrough schema that validates the branding
   keys and leaves other settings keys alone. Reject non-hex colors, and reject any
   image URL that is not `http:`/`https:` (blocks `javascript:`, `data:`, `vbscript:`).
4. Resolve on the server in `RunRuntimeService` and add `branding` to the runtime
   payload, so the anonymous participant needs no extra request and preview/production
   render identically. Resolve the workflow's tenant with the established
   project-then-creator fallback (see `WriteBlockRunner.resolveTenantId`).
5. Apply in `ClientRunnerLayout`: logo (or organization name), the brand color as
   `--primary`/`--ring`, and a footer that honors `whiteLabel`. Same footer treatment in
   `RunCompletionView`. Swap the favicon from the resolved value.
6. **White-label ships ungated** — repo owner's decision, 2026-08-05. Do not add a plan
   check; see O-7 for why it is blocked on billing work.

### Acceptance Criteria

1. `resolveBranding()` exists in `shared/`, is pure, and unit tests cover: workflow
   overrides tenant, tenant fills gaps, `brandingEnabled:false` ignores workflow values,
   and both empty inputs yield the ezBuildr default.
2. Workflow branding renders in the runner: custom logo image, organization name,
   and the primary color applied so existing buttons/progress/focus rings pick it up
   without per-component changes.
3. Favicon is swapped to the resolved `faviconUrl` while a branded run is open, and
   restored when it unmounts.
4. `RunCompletionView` (`/share/:token`) renders the same resolved branding and honors
   `whiteLabel`.
5. When `whiteLabel` is true, no "ezBuildr" string appears in the participant runner or
   completion view; when false, the attribution footer is present. A test asserts both.
6. Unsafe image URLs are rejected at the API boundary: `javascript:`, `data:`, and
   `vbscript:` logo/favicon URLs return 400 and never reach the DB. A test asserts each.
7. Colors are validated as hex at the API boundary, and a brand color with insufficient
   contrast against the runner surface is corrected (not silently rendered) so button
   label text stays ≥ 4.5:1. A test asserts the corrected value's ratio.
8. The builder's Branding card exposes `whiteLabel`, `organizationName`, and `faviconUrl`
   alongside the existing fields, and round-trips them through save/reload.
9. `npm run type-check` 0 errors, `npm run lint` 0 problems, `npm run test:fast` green
   with total ≥ **2421** (baseline measured in this worktree at `1c173d55`).
10. Live proof in the running app: screenshots of one branded run and one default run,
    plus the white-label footer difference.

### Out of scope (filed as observations, do not build here)

Project-level branding (`projects` has no branding column and one tenant has many
orgs — O-8), email branding, custom-domain resolution, the signature-transition
screen, typography/webfont loading, and visual-regression infrastructure. These are
the remaining GitHub #158 acceptance criteria; they are cheap once this resolver
exists and expensive before it.

---

## GH-159 — Establish WCAG 2.2 AA conformance for builder and runner ✅

> **CLOSED 2026-08-06 (Senior).** Landed as `5124388d`, merged to `main` via `7922429f`.
> All four ACs met.
>
> - **AC1** — the builder tab strip was a row of plain buttons with no tablist semantics
>   and no arrow-key handling; it is now `tablist`/`tab`/`tabpanel` with a roving
>   `tabIndex`, Arrow/Home/End navigation and `focus-visible` rings, and the panels carry
>   matching `aria-labelledby` ids. Runner controls are keyboard-operable, proven by a
>   `userEvent` test that drives them without a mouse.
> - **AC2** — the save-status indicator is a `role="status" aria-live="polite"` region;
>   validation errors are associated with their inputs and expose `role="alert"`.
> - **AC3** — axe-core runs in CI through `vitest-axe` inside the `unit-fast` project
>   (not Playwright — the ACs allow either), asserting zero serious/critical violations
>   over the builder tab strip and the runner section. A companion test asserts the
>   fixture covers **every** member of `RUNNER_RENDERED_STEP_TYPES`, so a new step type
>   cannot silently escape the axe sweep. `color-contrast` is disabled in the axe run
>   because jsdom cannot compute it, which is why AC3's contrast half is carried by the
>   token test below rather than by axe.
> - **AC4** — conformance matrix and VPAT checklist in `docs/accessibility/WCAG_CONFORMANCE.md`.
>
> **Colour tokens changed product-wide, deliberately.** `--primary` 56% → 48% and
> `--destructive` 60% → 42% in light mode; dark mode stops pairing white text with a
> mid-tone fill; `--input` 88% → 57% so field borders are perceivable at 3:1. This
> repaints every surface that uses the tokens, which is the point — the previous values
> did not reach 4.5:1. `tests/unit/client/colorContrast.test.ts` parses
> `client/src/index.css` and computes the ratios, so a future palette edit fails the
> build instead of silently regressing.
>
> Verification: `type-check` exit 0; `check:strict-zones` 4/4; `lint` exit 0
> (`--max-warnings 0`); `test:fast` **199 files / 2504 tests passed**, 1 file + 14 tests
> skipped (baseline 2489 after GH-158, +15). No server code touched, so the DB-backed
> projects were not re-run for this ticket. Live proof: see the GH-160 note.

**Priority: P1** · Size: L · Files: `client/src/components/runner/`, `client/src/components/ui/`, `client/src/components/builder/`
**Ties:** Relates to GH-158

### Context & Current State
- Basic ARIA attributes exist; complete audit and automated testing for WCAG 2.2 AA (keyboard navigation, focus management, screen reader labels, color contrast, error announcements) are required.

### Acceptance Criteria
1. All runner question blocks operable via keyboard with clear focus indicators.
2. Form errors and validation changes announced via `aria-live` regions.
3. Automated axe-core / Playwright accessibility checks run in CI with zero critical/serious violations.
4. Accessibility conformance statement and VPAT checklist documented in `docs/`.

---

# Phase 3: P1 Builder Logic & Visual Architecture

## GH-154 — Unify conditional logic editing across the builder ✅

> **CLOSED 2026-08-08.** Delivered by the Logic Unification initiative (LU-1..6c), retired
> into `tickets/backlog/LOGIC_UNIFICATION.md`. Recover the full ticket text with
> `git log -p -- tickets/LOGIC_UNIFICATION_TICKETS.md`.
>
> The audit found **four** condition languages, not two. `ConditionExpression` is now the only
> one — steps, sections, list fields, workflow rules and documents all speak it through one
> evaluator. `skip_to`/`require`/`make_optional` were fully implemented but had no authoring
> UI; they are now usable. Two of this epic's five ACs (the operator dropdown, and type-aware
> value inputs) were **already built** when it was written.
>
> `test:fast` 2277 → 2681 · `test:unit` 2826 · `test:integration` 108 files / 1075 tests.

**Priority: P1** · Size: L · Files: `client/src/components/logic/`, `client/src/components/builder/`, `shared/conditionEvaluator.ts`
**Ties:** Blocks GH-153

### Context & Current State
- Multiple separate logic surfaces exist (step `visibleIf`, section `skipLogic`, workflow logic rules, final document visibility).

### Acceptance Criteria
1. Single unified visual Condition Editor component reused across steps, sections, and document outputs.
2. Standardized operator dropdown matching `ComparisonOperator` union (equals, contains, between, date diffs, etc.).
3. Step alias autocompletion with type-aware comparison values (e.g. date picker for date fields).
4. Logic validation prevents circular references and unresolvable dependencies.
5. Tests verify evaluation parity between client builder and server execution engine.

---

## GH-153 — Add a visual workflow map with deterministic path simulation ✅

**Priority: P1** · Size: XL · Files: `client/src/components/builder/map/`, `shared/workflowLogic.ts`
**Ties:** Preceded by GH-154 — **now ✅ closed, so this is unblocked.**

> **✅ CLOSED 2026-08-08.** Delivered by MAP-1..10, retired 2026-08-09 into
> `tickets/backlog/WORKFLOW_MAP.md`. Recover the full ticket text with
> `git log -p -- tickets/WORKFLOW_MAP_TICKETS.md`.
> All five ACs met. `test:fast` 2677 → 2787.
>
> **AUDITED AND PARTED OUT 2026-08-08 into MAP-1..10** (ten tickets, four phases), all
> closed along with all eight of their backlog observations.
> This entry is the epic; the dispatchable tickets live in that file, which also carries
> the four architecture decisions (D-1..D-4) the repo owner ruled on at generation time and
> a table mapping each of the five ACs below to the tickets covering it. Do not dispatch
> from this entry.
>
> Audit grade at the time: **C** — every input the map needs already exists and is correct
> after GH-154, but nothing composes them, the previous attempt at this feature
> (`0cbcf479`) was deleted and left `reactflow@11` behind as an unused dependency, and the
> only surface claiming to do AC4 today asks an LLM to do it.

> **What GH-154 left you (read before auditing this).** Detail:
> `tickets/backlog/LOGIC_UNIFICATION.md`.
>
> - **One condition language.** `ConditionExpression` (`shared/types/conditions.ts`) evaluated
>   by `shared/conditionEvaluator.ts` on both client and server. The map can draw every branch
>   from one model; there is no longer a second dialect to reconcile.
> - **`shared/conditionGraph.ts` already exists** — LU-3 built a `visibleIf` dependency graph
>   with three-colour DFS cycle detection, O(V+E), correctly not flagging diamonds. **AC4
>   (unreachable sections, dead ends, loop risks) should extend this, not reimplement it.**
>   Note its limit: it resolves references through an alias-or-raw-id map because
>   `ConditionRow` writes `v.alias ?? v.id`.
> - **`shared/workflowLogic.ts` `evaluateRules` is the deterministic simulator core** for AC3.
>   It resolves all five actions with first-firing-`skip_to`-wins ordering by `rule.order` and
>   a backward-skip guard. Reuse it; do not write a second evaluator — that is the mistake
>   this epic's predecessor spent 8 tickets undoing.
> - **`logic_rules` holds 0 rows across 84 workflows** and is only now authorable (LU-6b), so
>   a map built today has almost no rule data to render. Seed fixtures deliberately.

### Context & Current State
- Complex branching workflows are difficult to visualize across sequential pages.

### Acceptance Criteria
1. Interactive visual graph/node map showing sections, conditional branches, skip targets, final documents, and endings.
2. Clicking any node opens the corresponding section/step inspector.
3. Deterministic path simulation: author inputs hypothetical answers and map highlights active route in real time.
4. Map flags unreachable sections, dead ends, and infinite loop risks.
5. Component tests prove map rendering and path simulation accuracy.

---

## GH-152 — Extend the publish gate to document readiness and provider availability ✅

> **Reviewer verification pass 2026-08-06.** Gates re-run in the worktree: `tsc` exit 0,
> `lint` exit 0, `test:fast` 209 passed / 1 skipped files and 2549 passed / 14 skipped
> tests, and `publish-document-readiness` + `publish-lint-gate` + `activation-publish`
> 3 files / 12 tests. All four ACs met.
>
> **Reviewer fixes (senior, at review) — the original dev was unavailable to finish.**
>
> 1. **The headline change shipped untested.** Beyond the ACs, this ticket unified
>    `WorkflowLintService.lint` with the publish gate: the Review tab previously ran only
>    `lintWorkflowContent` and so never showed document or e-sign findings, reporting
>    "ready" on a workflow that then failed to publish. Correct fix, but nothing guarded
>    it — and `WorkflowLintService.test.ts` mocks `lintSerializedWorkflow` to call
>    `lintWorkflowContent`, stubbing out the exact composition being introduced. Proven by
>    reverting the one-liner: 21 related tests across four files stayed green. Added a
>    case to `publish-document-readiness.test.ts` asserting `workflowLintService.lint`
>    returns the `documents`-category finding, that its `target` points at the real final
>    step, and that its message is the same string the gate blocks on. **Verified failing
>    against the reverted code (`[]`, zero findings) and passing with it.**
> 2. **The gate opened on the wrong tab.** `defaultValue="questions"` meant a workflow
>    blocked solely by document errors opened on an empty "Questions — no findings"
>    panel. Now `defaultIssueCategory()` lands on the first category holding an error,
>    then any finding, then Questions. Two of the dev's tests implicitly relied on the old
>    default and were made explicit about which tab they act on.
> 3. **Target tab was routed off a display string** (`typeName === "Document hook"`).
>    Replaced with a `BlockLintKind { typeName, category, tab }` descriptor — which also
>    resolved the `max-params` error the direct fix introduced, rather than suppressing it.
>
> **Observation filed (O-13):** the red/amber/green finding surfaces carry no `dark:`
> variants. Pre-existing (the file had the same gap before this ticket), not a regression.

> **Verified 2026-08-06.** The Review tab groups the publish gate's exact findings into
> Questions, Logic, Documents, and Integrations, with direct links that select the
> offending builder item or open its setting panel. Errors remain blocking; warnings
> remain publishable and are recorded by the existing publish audit entry. Component
> tests cover tab grouping, deep-link URLs/navigation, and warning audit messaging.
> Gates: `type-check` 0 errors, `lint` 0 problems, `test:fast` **209 files / 2547 tests
> passed** (worktree baseline 2544, +3); focused publish/document integration tests 10/10.

**Priority: P1** · Size: S · Files: `client/src/components/builder/PublishModal.tsx`, `server/services/workflowLintRules.ts`
**Ties:** Preceded by GH-156

### Context & Current State
- Residual gap on #152: Document readiness rules and project-scoping checks already landed (`6faf1f2a`).
- Remaining work: Review-tab UI grouping issues by Questions / Logic / Documents / Integrations with direct links to fix locations.

### Acceptance Criteria
1. Publish validation modal organizes findings into categorized tabs: Questions, Logic, Documents, Integrations.
2. Each warning/error includes a clickable link that navigates directly to the offending step or setting.
3. Blocking errors prevent publishing while warnings allow override with audit log.
4. Component tests verify tab grouping and navigation deep-links.

---

## GH-167 — Build document-to-interview onboarding with field and question generation ✅

**Priority: P1** · Size: L · ✅ **Done 2026-08-09**

> **Reviewer verification 2026-08-09.** The dev ended without a turn-in report, so **every
> gate here was run by the reviewer from scratch**: `type-check` 0, `lint` 0 (full repo,
> `--max-warnings 0`), `test:fast` **2824 passed / 14 skipped**, `pre-commit-checks` 0,
> and `tests/integration/ai/documentOnboarding.test.ts` **4/4** — all re-run after
> fast-forwarding the worktree onto current `main`.
>
> **Live proof (AC8), driven against an isolated local Postgres — never the Neon
> instance `.env` points at.** Entry point `/workflows/new` → "From Document" → wizard;
> a real DOCX yielded all 5 `{{ }}` placeholders; edited **type** (Short Text→Date) and
> **alias** (`feeAmount`→`quotedFee`) on the review screen; Approve disabled until a
> project is chosen and both buttons disabled in flight; **0 rows existed in the DB while
> generation was running**, confirming nothing persists before approve. After approve:
> workflow `status=draft` (unpublished), all 5 steps carrying the approved aliases with
> `signingDate -> date`, template `gh167-live.docx` attached, and its mapping holding
> **all 5 bindings** including `fee_amount -> quotedFee`. PreviewRunner opened the result
> and **ran** it — page 1 → page 2 — and the signing-date question rendered as a native
> `input[type="date"]`, proving the review-screen edit reaches the runner, not just the
> database.
>
> **Two deviations, both verified and accepted.** (1) `logicRules`/`transformBlocks` are
> forced to `[]`: the `updateWorkflowSchema` declared inside `PUT /api/workflows/:id`
> (`workflows.routes.ts`) has no keys for them and Zod strips unknowns, so generating them
> would only mislead the review screen. Confirmed by reading the schema, not taken on
> report. (2) The mapping is built deterministically from approved aliases rather than via
> AI `suggest-mappings` — strictly better here, since the overlay guarantees exactly one
> step per variable with that exact alias, and it removes an AI call that can fail.
>
> **Process note worth keeping.** A first verification pass produced a convincing phantom
> bug — a template carrying only 3 of 5 fields — caused by the dev subagent *still running*
> and driving the same server, uploading its own fixture and deleting rows. Byte size
> (1029 vs 1057) was what exposed it. Stop the agent and rebuild the environment before
> trusting any live observation.
>
> **Filed, not fixed here:** the integration test `vi.mock`s the AI generator, so no
> automated check anywhere exercises a real provider call; and `GEMINI_MODEL` is pinned
> repo-wide to `gemini-2.0-flash`, whose free-tier limit Google has set to **0** — every
> AI feature 429s until that pin moves (see Backlog).
**Files:** `client/src/pages/onboarding/` (new), `client/src/Router.tsx` (one lazy import + one route),
`server/routes/ai.doc.routes.ts`, `server/services/ai/`, `tests/integration/`, `tests/unit/client/`
**Ties:** Preceded by GH-156 (✅ mapping workbench — this ticket hands off *to* it, never reimplements it).
Adjacent to GH-152 (publish gate) but **must not touch it**. Load skills: `add-api-endpoint`,
`run-tests`, `design` (any UI work), `verify` (live proof).

> **File-footprint warning — read before you start.** Another IDE is concurrently editing
> `client/src/pages/WorkflowBuilder.tsx`, `client/src/components/builder/layout/BuilderTabNav.tsx`,
> `ResizableBuilderLayout.tsx`, `SidebarTree.tsx` and `ActivateToggle.tsx`. **Do not modify any file
> under `client/src/components/builder/`.** This ticket is designed to need zero changes there
> (see Preferred fix step 5). If you believe you need one, STOP and report it as a blocker.

### Context & Current State (re-audited 2026-08-08 — the original one-liner understated this badly)

Every capability this ticket needs **already exists and works**. The gap is purely orchestration:
nothing joins them, and the generation endpoint has no client caller at all.

| Piece | Where | State |
|---|---|---|
| `POST /api/ai/doc/analyze` (multipart) returns `{ variables: AnalyzedVariable[], suggestions: string[] }` | `server/routes/ai.doc.routes.ts`, handler `router.post("/analyze"` | works: magic-byte + virus scan + temp cleanup + `uploadLimiter` |
| `POST /api/ai/doc/suggest-improvements` returns `{ aliases?, formatting? }` | same file | works — **this is AC2's alias source** |
| `POST /api/ai/doc/suggest-mappings` returns `MappingSuggestion[]` | same file | works |
| `POST /api/ai/workflows/generate` returns `AIGeneratedWorkflow`, **not persisted** | `server/routes/ai.routes.ts`, `AiController.generateWorkflow` | works but **zero client callers** |
| `POST /api/projects/:projectId/templates` (multipart upload) | `server/routes/templates.routes.ts` | works |
| `PATCH /api/templates/:id` body `{ mapping }` typed `DocumentFieldMapping` | `templates.routes.ts`; types in `shared/types/documentMapping.ts` | works, GH-156, auto-versions |
| `replaceWorkflowContent` delegating to `workflowContentIngestService.apply(..., { source: 'ai' })` | `server/services/WorkflowService.ts`, method `replaceWorkflowContent` | works — the persist path |
| `client/src/pages/onboarding/` | — | **does not exist** |

**Gotchas found during the re-audit — do not rediscover these:**

1. **The JSDoc in `ai.doc.routes.ts` lies about its own paths.** Comments say
   `POST /api/ai/template/analyze`, but `server/routes/index.ts` mounts the router with
   `app.use("/api/ai/doc", aiDocRouter)`. The real paths are `/api/ai/doc/analyze`,
   `/api/ai/doc/suggest-mappings`, `/api/ai/doc/suggest-improvements`. Correct those three stale
   comments while you are in the file — one line each, in scope.
2. **`generateWorkflow` returns a draft and persists nothing.** That is exactly what AC2 wants
   (review before creation). Do **not** add a draft table or any new persistence — the draft lives
   in client state until the author approves, mirroring `ImportWorkflow.tsx`'s deliberate two-step
   design (see its header comment: the two-step shape exists precisely so a user can review before
   applying).
3. **`?tab=templates` deep-linking already works.** `WorkflowBuilder.tsx` reads
   `searchParams.get("tab")` and `"templates"` is a member of the `BuilderTab` union declared in
   `BuilderTabNav.tsx`. So the handoff in step 5 needs **no builder changes**.

### Decisions already made (Senior, 2026-08-08) — implement these, do not relitigate

- **The wizard ends by creating the workflow and opening PreviewRunner. It does NOT publish.**
  AC5's phrase "published workflow" is loose wording for *created and runnable*; AC1 and AC3 both
  stop short of publish. Auto-publishing generated content contradicts AC2's human-in-the-loop
  intent, and a freshly generated workflow often fails GH-152's publish gate — which would make the
  wizard dead-end on its final screen. Leave the workflow unpublished; the existing publish gate
  stays the one and only publish path.
- **Step 4 "Map Fields" deep-links into GH-156's existing workbench — it is not reimplemented
  inline.** Duplicating binding UI would fork the surface GH-171 (template versioning) is already
  scheduled to land on. To keep the flow seamless, the wizard **pre-writes the AI-suggested
  bindings** via `PATCH /api/templates/:id` before navigating, so the author arrives at a populated
  workbench and reviews rather than maps from scratch.

### Preferred fix

Build in this order; each step should leave the tree gate-clean.

1. **Server orchestration service.** Add `server/services/ai/DocumentOnboardingService.ts`. One
   method that takes extracted variables plus author-approved question edits and returns an
   `AIGeneratedWorkflow`-shaped payload. Compose the existing services — call
   `documentAIAssistService` and the AI generation service directly; **do not** re-implement
   extraction or prompt-building. Follow the 3-tier rules in the `add-api-endpoint` skill: the
   service owns authorization and throws the exact error strings (`not found`, `Access denied`)
   that `classifyRouteError` maps to 404/403.
2. **Server route.** Add the orchestration endpoint(s) to `server/routes/ai.doc.routes.ts`, reusing
   the `hybridAuth` + `strictLimiter`/`uploadLimiter` + Zod-validation pattern already in that file.
   AC4's rate limiting is satisfied by reusing those limiters plus
   `aiWorkflowRateLimit`/`aiDailyRateLimit` where an AI call is made — do not invent a new limiter.
   Every Zod schema must enumerate and length-cap its fields and `.strip()` unknown keys (SEC-028 —
   see `variableObjectSchema` in that file for the exact precedent).
3. **Wizard shell.** New `client/src/pages/onboarding/DocumentOnboardingWizard.tsx` plus step
   components in the same folder. Copy the state shape from `client/src/pages/ImportWorkflow.tsx`
   (file → result → apply → navigate, with per-phase `isXing` flags and a single `uploadError`) and
   the step chrome from `client/src/pages/optimization/OptimizationWizard.tsx` (`activeStep` plus a
   `steps` array plus sidebar). Register one lazy route in `Router.tsx` at `/workflows/onboarding`,
   next to the existing `/workflows/import` entry.
4. **Review/edit step (AC2).** The author must be able to edit generated **question type** and
   **alias** per variable before anything is persisted. Seed aliases from
   `/api/ai/doc/suggest-improvements`'s `aliases` map. Question types must come from the real
   `stepTypeEnum` — load the `add-step-type` skill for the canonical list; do not hardcode a subset.
5. **Persist and hand off.** On approve: create the workflow, apply content via the existing
   `replaceWorkflowContent` path, upload/attach the template, `PATCH` the AI-suggested `mapping`,
   then navigate to `/workflows/:id/builder?tab=templates`. Offer PreviewRunner via
   `/workflows/:workflowId/preview` (AC3). **No changes to any file under
   `client/src/components/builder/`.**

### Acceptance Criteria

1. Wizard implements the four steps in order: Upload Document → AI Extracts Variables → Review &
   Approve → Generate Workflow → hand off to Mapping. Reachable from a route registered in
   `Router.tsx`, and linked from `client/src/pages/NewWorkflow.tsx` as an entry point.
2. Author can review, edit, and approve generated **question types and aliases** before the workflow
   is created; nothing is persisted until approve is pressed. A component test proves that editing a
   type/alias changes the payload sent on approve, and that cancelling persists nothing.
3. On completion the workflow exists, the template is attached with its AI-suggested `mapping`
   already written, and the author lands on the populated GH-156 workbench. The resulting workflow
   opens and runs in PreviewRunner (`/workflows/:workflowId/preview`). **The workflow is left
   unpublished.**
4. Error handling and rate limiting: oversized, wrong-type and malicious uploads surface a clear
   inline error (reuse `ImportWorkflow.tsx`'s error mapping); AI timeouts and provider failures
   surface a retryable error rather than a blank screen or an unhandled rejection; the AI endpoints
   sit behind the existing rate limiters. A test covers the AI-failure path.
5. Integration test in `tests/integration/` drives document buffer → extracted variables → generated
   workflow → persisted workflow plus attached template with mapping, asserting the rows land.
   Follow the fixture/`ctx` pattern in `tests/integration/templates.mapping-workbench.test.ts`.
   Cross-tenant access is rejected (mirror that file's tenant-isolation case).
6. The three stale JSDoc route paths in `ai.doc.routes.ts` (`/api/ai/template/...`) are corrected to
   `/api/ai/doc/...`.
7. Gates green and reported with pasted output: `npm run type-check`, `npm run lint`,
   `npm run test:fast` (no regressions against the baseline recorded at dispatch), the new
   integration test, and `npx tsx scripts/pre-commit-checks.ts` — that last one is the real commit
   gate, because `type-check` alone does **not** run `check:strict-zones`.
8. Live proof per the `verify` skill: screenshots of the wizard driving a real DOCX end-to-end on the
   running dev app, plus the resulting workflow open in PreviewRunner. RTL tests are not live proof.

---

# Phase 4: P2 Advanced Blocks, Authoring & Templates

## GH-161 — Add answer piping and dynamic content throughout interviews ✅

> **Closed 2026-08-10 — delivered by TPL-7** in the template-language initiative, exactly as
> the 2026-08-09 re-scope specified. All 6 ACs met, verified by the reviewer on the merged
> tree: `type-check` 0 errors · `lint` 0 problems repo-wide · `test:fast` **267 files / 3031
> passed / 14 skipped**.
>
> Piping covers question titles, descriptions, display blocks and List-nested questions, using
> the same grammar and filter vocabulary as document templates rather than a runner-local
> syntax — which is why this ticket was re-scoped to wait for TPL-2/TPL-3 instead of inventing
> a third syntax. Structured values render through `formatAnswerValue` /
> `normalizeRunnerStepType`, escaping is structural at the interpolation boundary, and a
> missing reference renders blank rather than throwing mid-interview.
>
> Live proof: a real run recalled an earlier answer in a later question title and updated it
> immediately on edit, with no reload. Full detail in TPL-7's verification note.

> **Re-scoped 2026-08-09. DO NOT DISPATCH THIS TICKET DIRECTLY.** The work is delivered by
> **TPL-7** (retired detail: `tickets/backlog/TEMPLATE_LANGUAGE.md`).
> It is kept on the board so the Phase 4 count stays honest, not as dispatchable work.
>
> **Why it moved.** Investigation on 2026-08-09 found that answer recall is not a runner
> feature with a formatter bolted on — it is a *consumer of a template language the repo
> does not yet have*. The DOCX engine already owns a grammar (`{{ }}` with one helper per
> tag), the runner owns a second, partial one (`interpolateVariables()` in
> `client/src/components/runner/blocks/DisplayBlock.tsx`, display blocks only), and neither
> supports filter chaining. Shipping AC3's formatters inside this ticket would have created
> a third syntax. TPL-1..3 define one grammar; TPL-7 consumes it here.
>
> **Two ACs changed on the repo owner's instruction:**
> - **AC1 — `@alias` is dropped.** `{{alias}}` only. It is already shipped in display
>   blocks and in every DOCX template, and the industry-standard form the repo owner
>   picked. Two syntaxes for one concept was the thing to avoid.
> - **AC3 — pipe filters, from a named-preset vocabulary** (`{{ fee | usd }}`), shared
>   with documents rather than runner-local. See Decision D4 in the TPL file.
>
> **`shared/conditionEvaluator.ts` was never in scope** and is removed from the Files
> line — piping is a rendering concern; the evaluator is the condition language. The real
> shared surface is the TPL grammar plus `formatAnswerValue`/`normalizeRunnerStepType`,
> which GH-162 made canonical.

**Priority: P2** · Size: M · Files: `client/src/components/runner/`
**Ties:** Preceded by GH-154. Delivered by **TPL-7**; detail in `tickets/backlog/TEMPLATE_LANGUAGE.md`.

### Acceptance Criteria
1. Question titles, descriptions, and static text blocks support `{{alias}}` answer recall syntax.
2. Runner updates piped text reactively as preceding answers change.
3. Filter modifiers supported using the shared template grammar and preset vocabulary (e.g. `{{ client_name | upper }}`, `{{ fee | usd }}`).
4. Missing or unfilled references render configurable fallback or blank.
5. Structured values (address, choice, list) render human-readable labels, not raw JSON.
6. Tests verify reactivity, formatting, and XSS sanitization.

---

## GH-162 — Improve review for structured values and conditional visibility ✅

> **Verified 2026-08-09 (reviewer, live).** Review consumes the runner's canonical
> visible-step set, so a step hidden by `visibleIf` is omitted along with its stale
> answer. Structured formatting lives in the shared `formatAnswerValue` and
> dispatches through `normalizeRunnerStepType`, so it applies identically to
> top-level answers and to fields nested inside a List. Every answer carries a
> step-specific Edit that returns to review after the section validates and saves.
>
> Live proof on a fixture run (server on :5183 from this worktree, source confirmed
> served from the worktree, not `main`): a `parcel_number` step hidden by
> `owns_property = Yes` kept the persisted value `STALE-HIDDEN-PARCEL-9999` in
> `step_values` and did **not** appear on review; address rendered
> `123 Main St, Suite 400, Chicago, IL 60601`; a `multiple_choice` stored as
> option-id and alias rendered as labels; inside the List, the nested address
> rendered `77 Lake Shore Dr, Evanston, IL 60201` and the nested choice rendered
> `Spouse` / `Child`. Clicking Edit on a section-1 answer focused that step's
> control and re-labelled Next as "Review"; the edit saved and returned to review.
> Desktop and 390px mobile both checked; console clean apart from Vite HMR noise.
>
> First submission FAILED review: the formatting was local to `ReviewSection`, so a
> nested address rendered raw JSON and a nested choice rendered its raw id, and it
> hand-listed type aliases the `normalizeRunnerStepType` map already owned. Both
> fixed on resubmission and covered by regression tests.
>
> Gates re-run by the reviewer on the post-fast-forward tree: `type-check` 0 errors,
> `lint` 0 problems, `test:fast` 248 files / 2807 tests passed, 14 skipped.

**Priority: P2** · Size: M · Files: `client/src/components/runner/ReviewStep.tsx`, `server/services/workflowLogic.ts`
**Ties:** Preceded by GH-146

### Acceptance Criteria
1. Review step hides steps made invisible by `visibleIf` rules.
2. Structured values (`list`, address, multiple choice) render human-readable labels instead of raw JSON.
3. Direct "Edit" button jumps respondent to specific step and returns back upon completion.
4. Tests verify review step rendering across conditional branches and repeating items.

---

## GH-163 — Add payment, scheduling, ranking, and matrix interview blocks 🔲

**Priority: P2** · Size: L · Files: `client/src/components/runner/blocks/`, `client/src/components/blocks/`, `shared/schema/workflow.ts`
**Ties:** Follows `add-step-type` skill

### Acceptance Criteria
1. Register new step types in `stepTypeEnum`: `ranking`, `matrix_table`, `scheduler`.
2. Builder inspectors and runner renderers implemented for each type.
3. Data stored and validated with zod schemas in `stepConfigs.ts`.
4. Tests cover rendering, response storage, and review step integration.

---

## GH-165 — Turn Easy Mode into a guided Questions-to-Publish workflow 🔲

**Priority: P2** · Size: M · Files: `client/src/pages/EasyMode.tsx`, `client/src/components/builder/`
**Ties:** Independent

### Acceptance Criteria
1. Streamlined authoring experience focused on 3 steps: Add Questions -> Customize Theme -> Publish.
2. Complex advanced settings hidden behind progressive disclosure.
3. Real-time preview panel embedded directly next to question editor.
4. Seamless 1-click upgrade to Advanced Mode without losing configuration.

---

## GH-171 — Add document template versioning and dependency impact analysis ✅ DONE 2026-08-11

> **✅ CLOSED — all 4 ACs met.** Landed on `main` (unpushed) across two merges:
> `24491c3e` (versioning, pinning, and the cross-tenant pin fix) and `36cd2fa7`
> (AC3, renamed-placeholder detection, via G171-1).
>
> Reviewer-verified, every gate re-run rather than accepted from a turn-in:
> `type-check` 0 errors · `lint` 0 problems · `test:fast` **3043 passed / 0 failed** ·
> integration at exactly the documented baseline (4 files / 10 tests failed,
> 108 files / 1093 passed) with no new failures.
>
> The cross-tenant pin fix was proven **non-vacuous** by the reviewer, not just by
> the dev: breaking `getVersionForTemplate`'s `templateId` scoping makes 4 tests
> fail, two of them completing a real run and rendering the foreign template.
>
> **Open follow-ups, none of them GH-171 ACs** — see `tickets/GH171_FOLLOWUP_TICKETS.md`:
> G171-2 (real-run pin test + preview/run parity), G171-3 (test-count delta),
> G171-4 (carry-over cleanups), G171-5 (stale `run-tests` doc).
>
> Behaviour change shipped beyond the ACs and deliberately kept: `requiresReview`
> now trips on renames, which previously passed review silently despite breaking
> every workflow piping to the old alias.

> **Gate cleared 2026-08-10.** This was blocked on the template-language initiative
> (TPL-2/TPL-3) has landed — it did, 2026-08-10; detail in `tickets/backlog/TEMPLATE_LANGUAGE.md`. Immutable versions are
> exactly what makes a grammar change unaffordable: once a version is frozen it must keep
> rendering as authored forever, so any template written in the old grammar becomes a
> permanent second system. Note `template_versions` already exists in `shared/schema/workflow.ts`
> with `versionNumber`, `notes` and `isActive` — this ticket is closer to done than it reads.

**Priority: P2** · Size: M · Files: `server/services/TemplateVersionService.ts`, `client/src/components/builder/templates/`
**Ties:** Preceded by GH-156. TPL-2/TPL-3 landed 2026-08-10 — **no longer blocked**; build drafting helpers as filters in the shipped vocabulary (`tickets/backlog/TEMPLATE_LANGUAGE.md`).

### Acceptance Criteria
1. Template uploads create immutable versions with commit notes and timestamps.
2. Dependency analyzer lists all workflows referencing a template before an update is published.
3. Impact warning highlights added, removed, or renamed placeholders across active workflows.
4. Workflows can pin to a specific template version or follow latest.

---

## GH-173 — Add legal drafting primitives and curated workflow templates 🔲

> **Gate cleared 2026-08-10.** This was blocked on the template-language initiative
> (TPL-2/TPL-3) has landed — it did, 2026-08-10; detail in `tickets/backlog/TEMPLATE_LANGUAGE.md`. This ticket ships the
> first curated templates (NDA, retainer, intake); written in the old grammar they would all
> need rewriting, and every customer template descends from them. The drafting primitives in
> AC1 (legal numbering, party plurality, pronoun agreement) should be implemented as filters
> in TPL-3's vocabulary, not as a separate mechanism — see observation TPL-O4.

**Priority: P2** · Size: M · Files: `server/services/document/`, `client/src/templates/`
**Ties:** Preceded by GH-156. TPL-2/TPL-3 landed 2026-08-10 — **no longer blocked**; build drafting helpers as filters in the shipped vocabulary (`tickets/backlog/TEMPLATE_LANGUAGE.md`).

### Acceptance Criteria
1. Pre-built legal drafting helpers: legal hierarchical numbering, party singular/plural agreements, pronoun agreement, date calculation helpers.
2. Curated workflow starter templates: Non-Disclosure Agreement (NDA), Retainer Agreement, Intake Questionnaire.
3. Templates include sample DOCX files with pre-configured variable mappings.

---

## GH-155 — Finish final-document authoring configurability ✅

> **Verified 2026-08-09** — reviewer independently re-ran every gate. All 3 ACs
> met. The builder inspector now persists the completion page title, a
> per-document output title, DOCX/PDF format selection, secure-download
> visibility and a redirect URL, alongside the existing conditional rules. Both
> formats upload through `storageProvider` and bundle into the existing ZIP when
> both are selected; the obsolete advanced-options placeholder is gone.
>
> Output titles reach the filename through the document alias, and
> `DocumentEngine.generate` — the only place `.docx`/`.pdf` names are
> constructed — now sanitizes `outputName`, so an author-supplied title cannot
> escape the output directory.
>
> **Two defects found and fixed in review:** visiting the output-title field
> without editing it persisted the current template name, freezing it against
> later template renames (an empty field now means "follow the template name");
> and the overall progress bar over-reported at 16 filled blocks for 14 done.
>
> Gates re-run by the reviewer on the merged tree (main `02ca681d` + GH-155):
> `type-check` exit 0 · `lint` exit 0 repo-wide (`--max-warnings 0`) ·
> `check:strict-zones` 6/6 zones · `test:fast` **250 files / 2814 passed /
> 14 skipped / 0 failed**. The implementing session's lower counts (2760) were
> measured on a base three commits behind main, as CLAUDE.md predicts.
>
> Live browser verification (port 5185, isolated test DB, fixtures removed) was
> performed by the implementing session; the reviewer verified the gates and the
> full title→filename code path but did not re-run the browser pass.
>
> Mobile/tablet builder layout remains scoped to GH-166 — GH-155 adds no new
> responsive regression. Unrelated pre-existing suite flakiness was observed
> (`ExternalSendRunner`, `WorkflowService.verifyOwnership`; each passes in
> isolation, a different file each run) — an existing condition, not a GH-155
> defect.
>
> **Reviewer fixed at merge:** GH-162 closed into Phase 4 on main while GH-155 sat
> on an older base. Both branches bumped the same counter lines to the same
> values, so git auto-merged them with no conflict and the board silently read
> 14/27 and Phase 4 1/7 with *two* ✅ tickets in it. Corrected to 15/27 and 2/7.
> Observations O-15..O-17 filed below.
>
> **Also corrected:** the OVERALL counter had drifted independently of the phase
> rows and read 15/27 while the six phase numerators summed to 17/27 (17 done,
> 9 open, 1 in progress, GH-148 deferred and uncounted). The drift predates
> GH-155 -- it read 13 when the phases summed to 15 -- so incrementing it per
> ticket, as the "keep this in sync" note directs, propagated the error rather
> than fixing it. Recount the phase rows rather than incrementing next time.

**Priority: P2** · Size: S · Files: `client/src/components/blocks/FinalBlockEditor.tsx`, `client/src/components/runner/blocks/FinalBlock.tsx`
**Ties:** Preceded by GH-156

### Acceptance Criteria
1. Complete builder inspector for Final Document block: document title, delivery options, multiple format selection (DOCX + PDF), and conditional output rules.
2. Clean integration with `storageProvider` download endpoints.
3. Elimination of any remaining stub warnings or placeholder text in editor.

---

# Phase 5: P2 Mobile, Kiosk, OCR & Documentation

## GH-164 — Add a mobile-first kiosk mode for participant interviews 🔲

**Priority: P2** · Size: M · Files: `client/src/pages/runner/KioskRunner.tsx`, `client/src/components/runner/`
**Ties:** Preceded by GH-160

### Acceptance Criteria
1. Dedicated Kiosk Mode URL parameter (`?kiosk=true`) with full-screen presentation.
2. Inactivity timeout automatically resets session and wipes participant answers for privacy.
3. Instant post-submission reset button ready for the next respondent.
4. Touch-optimized button targets and virtual keyboard handling.

---

## GH-166 — Make the interview builder usable on tablet and mobile widths 🔲

**Priority: P2** · Size: M · Files: `client/src/components/builder/`, `client/src/pages/BuilderPage.tsx`
**Ties:** Independent

### Acceptance Criteria
1. Builder layout collapses into tabbed/drawer navigation below 1024px width.
2. Question canvas, step list, and property inspector accessible via bottom sheets on mobile.
3. Touch gestures supported for step re-ordering and selection.
4. Tested on iPad/tablet viewports and mobile screen widths.

---

## GH-172 — Complete PDF/OCR extraction and broaden supported template formats 🔲

**Priority: P2** · Size: L · Files: `server/services/document/PdfService.ts`, `server/services/document/OcrService.ts`
**Ties:** Preceded by GH-169

### Acceptance Criteria
1. Optical Character Recognition (OCR) fallback for scanned/flattened PDFs.
2. Robust text extraction and form field bounding box detection.
3. Support for additional template formats (HTML templates, Markdown to PDF).
4. Concurrency limits and processing timeouts prevent server memory spikes during OCR.

---

## GH-174 — Align feature documentation with executable product status 🔲

**Priority: P2** · Size: S · Files: `docs/claude/FEATURES.md`, `docs/INDEX.md`, `README.md`
**Ties:** Final cleanup across all phases

### Acceptance Criteria
1. Update `docs/claude/FEATURES.md`, `CLAUDE.md`, and public documentation to reflect exact shipped status of all features.
2. Remove any claims of partial features as production-ready.
3. Document all environment flags (`STORAGE_DRIVER`, `GOTENBERG_URL`, `ENABLE_VIRUS_SCANNING`).
4. Ensure documentation index accurately links to all current architectural guides.

---

## Deferred — parked, not dispatchable

Full tickets the repo owner has pulled off the active board. They keep their acceptance
criteria so they can be promoted back without a re-audit — but **re-verify the Context
section before dispatching**, because the codebase moves underneath a parked ticket.
Nothing here is counted in a phase total, and no phase gate blocks on it.

### ⏸ GH-148 — Add multilingual interview content and locale-aware formatting

> **Parked 2026-08-07 by the repo owner.** Pulled out of Phase 2 so the roadmap can close
> Phase 2 and move on to Phase 3. Nothing depends on it: the ticket is `Ties: Independent`
> and no Phase 3–5 ticket references it. Deferred, not dropped — the capability is still
> wanted, just not next.
>
> **State of the code when parked (verified 2026-08-07).** This is greenfield. There is no
> `client/src/lib/i18n.ts`; `shared/schema/workflow.ts` has no locale or translation column
> (its only `language` enum is `transform_block_language`, for JS/Python transform blocks);
> and there are **zero** locale references anywhere under `client/src/components/runner/`.
> Formatting is ad hoc — 41 `Intl.*` / `toLocale*` call sites across 15 files, of which
> only `runner/blocks/CurrencyBlock.tsx` and `runner/SaveAndResumeButton.tsx` are in the
> runner. Validation strings are hardcoded English in `shared/validation/messages.ts` and
> `shared/validation/BlockValidation.ts`.
>
> **Two questions must be answered before this is dispatchable.** Both are repo-owner
> calls and both were left open by the original ticket text:
>
> 1. **Where do translations live?** A jsonb column on `workflows` vs. a dedicated
>    translations table. This is a schema decision — load the `db-schema-change` skill.
> 2. **Is the builder authoring UI in scope?** AC1 says workflows “can define” translation
>    dictionaries but never says how an author enters them. If authoring is in scope this
>    is XL rather than L and should be split into two tickets.
>
> **Two traps the original ticket does not mention:**
>
> - **Choice labels are stored as values** since the CVM initiative closed (2026-07-30).
>   Translating a choice label must not change what is persisted, or logic rules and
>   generated documents break on a translated run.
> - **`shared/validation/` runs on both sides.** Localized validation messages (AC1, AC3)
>   therefore mean threading a locale through *server-side* validation too — a wider
>   footprint than the three paths the Files line names.

**Priority: P1** · Size: L (XL if the builder authoring UI is in scope) · Files: `client/src/lib/i18n.ts`, `shared/schema/workflow.ts`, `client/src/components/runner/`
**Ties:** Independent

### Context & Current State
- No unified translation schema or locale selector for runner workflows.

### Acceptance Criteria
1. Workflows can define base locale and translation dictionaries for titles, descriptions, choices, and errors.
2. Runner supports URL query param (`?lang=es`) or dropdown locale switcher.
3. Locale-aware formatting for dates, currency, numbers, and validation messages.
4. Missing translations fall back predictably to base locale without crashing.
5. Unit tests verify translation resolution and formatting fallbacks.

---

## Backlog / observations

Not tickets. Found during the 2026-08-04 GH-169 audit of the live Railway config. Promote
only with the repo owner's say-so.

Filed 2026-08-09 during the GH-155 review pass:

- **O-17 (operational, HIGH) — `GEMINI_MODEL` is pinned to a model Google has capped at
  zero.** `.env` and `.env.example` both set `GEMINI_MODEL=gemini-2.0-flash`, and Google
  now returns `429 ... limit: 0` for it on the free tier — a permanent block, not a
  rolling quota, so it never self-heals. Probed live 2026-08-09: `gemini-2.0-flash` 429,
  `gemini-2.5-flash` **200**, `gemini-flash-latest` **200**, `gemini-1.5-flash` and
  `gemini-1.5-pro` **404 (retired)**. Nine call sites take the pin via
  `process.env.GEMINI_MODEL ?? 'gemini-2.0-flash'`, so one env change fixes the running
  app — but the stale string is also the hardcoded *fallback* in those nine, and
  `server/lib/ai/transformGenerator.ts` / `transformRevision.ts` hardcode the retired
  `gemini-1.5-pro` with no env override at all, so transform-block generation is dead
  independently. `ModelRegistry.ts` also lists two retired models. **If Railway carries
  the same pin, every AI feature is 429ing in production right now.** Needs its own
  ticket; deliberately not fixed inside GH-167.

- **O-18 (test-coverage, medium) — no automated test exercises a real AI provider call.**
  `tests/integration/ai/documentOnboarding.test.ts` (and `api.ai.test.ts`) `vi.mock`
  `createAIServiceFromEnv`, which is the right call for CI determinism but means a
  provider-side break like O-17 is invisible to the entire suite. Worth a smoke check
  gated on an env flag rather than un-mocking the suite.

- **O-15 (correctness, low) — `totalGenerated` now counts output *files*, not documents.**
  `FinalBlockRenderer.render` returns `totalGenerated: documents.length`
  (`server/services/document/FinalBlockRenderer.ts`), so a one-template run that
  emits DOCX+PDF reports `totalAttempted: 1, totalGenerated: 2`. It keeps the
  count consistent with the `documents[]` array it accompanies, which is
  defensible, but the two fields no longer measure the same unit. Only logging
  and the render response consume it, so nothing breaks today.
- **O-16 (security, low) — two redirect paths, only one hardened.** GH-155 makes
  the completion redirect authorable in the builder for the first time, and the
  runner path that consumes it
  (`client/src/components/runner/sections/FinalDocumentsSection.tsx`) validates
  only the protocol, while `client/src/pages/WorkflowRunner.tsx` routes its
  redirect through `getSafeRedirectUrl`. Author-controlled and same trust level
  as `customLinks`, so severity is low, but the two paths should converge on the
  hardened helper. Related to the closed SEC-033 ruling on e-sign `redirectUrl`.
- **O-17 (correctness, low) — the Final Documents inspector's `draftConfig`
  snapshot never re-syncs.** `FinalDocumentsSectionEditor` now seeds a
  `draftConfig` from server state once on mount and spreads it into every
  `PATCH`. That deliberately fixes a real lost-update bug (with 5+ fields,
  consecutive edits spreading a not-yet-refetched `config` dropped each other),
  but it means a concurrent edit from another collaborator is overwritten
  wholesale by this panel's next write.

- **⚠️ O-1 (security, repo owner action) — production is running placeholder secrets.** The
  prod service has `JWT_SECRET` and `SESSION_SECRET` set to the literal example strings from
  `.env.example` (`your-jwt-secret-min-32-chars-...`, `your-super-secret-session-key-...`).
  These are committed to a public repo, so anyone can forge a session or JWT for
  www.ezbuildr.com. Rotating them invalidates all existing sessions and refresh tokens.
  Not code work — no ticket — but this outranks everything else on this board.
- **O-2 (operational) — `BASE_URL`/`VITE_BASE_URL` disagree with the public domain.** Both
  point at `https://vaultlogic-production.up.railway.app/` while `RAILWAY_PUBLIC_DOMAIN` is
  `www.ezbuildr.com`. Anything building an absolute URL (OAuth redirects, emailed
  save-and-resume links in GH-147, webhook callbacks) emits the wrong host.
- **O-3 ✅ CLOSED 2026-08-04 — S3 adopted, backfill deliberately skipped.** Production now
  runs `STORAGE_DRIVER=s3` against the Railway bucket `integrated-flask`
  (`integrated-flask-bf4igkar` on `https://t3.storageapi.dev`, region `iad`, Tigris-backed).
  Credentials are wired as **Railway reference variables** (`${{integrated-flask.BUCKET}}`
  etc.), so no secret literal is stored on the app service. The old volume's contents were
  abandoned by the repo owner's call that it is all test data.
  - `S3StorageProvider` was proven against the real bucket before the flip: init, saveFile,
    exists (present *and* absent), getFile round trip, getMetadata, a **fetchable** signed
    URL (200), getLocalPath, list, deleteFile — bucket left at 0 objects.
  - Two live traps checked rather than assumed: the bucket accepts **both** path-style and
    virtual-host addressing (so `forcePathStyle: !!endpoint` is harmless here, despite
    Railway documenting virtual-host), and the reference resolves `AWS_REGION` to **`iad`**
    while the CLI credentials report `auto` — both were tested and both sign correctly.
  - Note the Railway volume is still mounted at `/app/server/files` and still billed. It is
    now unused; detaching it is a separate operational decision.
- **O-5 (enhancement, from GH-169A review) — `pingClamd` assumes an unsplit `PONG`.**
  `server/services/security/VirusScanner.ts` resolves `false` as soon as any non-`PONG`
  bytes arrive, so a `PONG\0` split across TCP segments would misreport the scanner as
  unhealthy. Harmless today (clamd writes it atomically; worst case is a misleading boot
  log). Fix would be to wait for a NUL/newline terminator before classifying.
- **O-4 (informational) — `outputFileExists()` bypasses the storage provider.** In
  `server/services/templateFiles.ts` it does a raw `fs.access` on `OUTPUTS_DIR` with the
  comment "Outputs are still local-only for now". Harmless while the disk driver is in use;
  becomes a correctness bug the moment O-3 happens.

Found during the 2026-08-05 GH-158 branding audit:

- **O-6 — CORRECTED 2026-08-05. Mostly NOT dead code; the dead part is now deleted.**
  The original text claimed two duplicate `BrandingProvider`s and a zero-importer
  `useResolvedBranding`. **Both claims were wrong** — the audit grep that produced them
  filtered out `branding/EmailPreview.tsx`, which is exactly where the importer lived.
  Re-verified by walking imports from `Router.tsx`:
  - `components/providers/BrandingProvider.tsx` — genuinely 0 importers, sole file in its
    directory, a strictly inferior duplicate of the live `branding/BrandingContext.tsx`
    (unimplemented domain-lookup stub; applies theme tokens to the **document root**, the
    anti-pattern GH-158 avoided). **Deleted**, directory removed.
  - `branding/BrandingContext.tsx` — **live**, `EmailTemplateEditorPage` uses `useBranding`.
  - `hooks/useResolvedBranding.ts` — **live**, `branding/EmailPreview.tsx` uses it.
  - `components/intake/*` + `IntakePreviewPage` — **live feature, not dead code.**
    `/intake/preview` is linked from `BrandingSettingsPage` ("Open Full Preview") and from
    `DomainSettingsPage` (to test a verified custom domain). Deleting it removes working
    buttons from two settings pages.

  **What remains is a product question, not cleanup — see O-11.**
- **O-11 (product-decision, split out of O-6) — the tenant branding preview previews a fake
  form.** `/intake/preview` renders `IntakeDemo`: a hardcoded 3-step name/email/phone/message
  mock ending in `alert('Form submitted! (This is a demo)')`, themed by a parallel
  `Themed*`/`IntakeLayout` stack (~1,040 lines) that no participant ever sees. Since GH-158,
  the real runner brands itself from `resolveBranding()` through the design system's own CSS
  custom properties. So the preview shows authors something that is **not** what their
  clients get. Three options: (a) re-point `/intake/preview` at the real runner chrome and
  delete the `Themed*` stack — one branding model, preview becomes truthful; (b) delete the
  route and both buttons outright; (c) leave it. Recommend (a); it needs the repo owner's
  call because (b) removes a feature and (a) is a rebuild, not a cleanup.
- **O-12 ✅ EXECUTED 2026-08-05 — the `/intake/*` parallel run pipeline is deleted.**
  The repo owner confirmed it was the second half of the legacy system, not an intended embed
  API. **Removed** (1,407 lines): `server/routes/intake.routes.ts` and its registration,
  `IntakeService`, `IntakeNavigationService`, `IntakeQuestionVisibilityService`,
  `IntakeReceiptService`, `sendIntakeReceipt`/`IntakeReceiptData` and the then-orphaned
  `escapeHtml` from `emailService.ts`, the dead `IntakeSubmitResult`/`IntakeEmailReceipt`
  types, and `tests/integration/intake.portal.test.ts` +
  `tests/unit/services/intakeQuestionVisibility.test.ts`.

  **Deliberately KEPT — each is load-bearing elsewhere, and deleting any would have been a
  live break:**
  - `workflows.intakeConfig` + `IntakeConfigSchema` + `shared/types/intake.ts#IntakeConfig`
    — a **live security control**. `RunService.createRun`/`createAnonymousRun` feed it to
    `filterPrefillValues` (RUN2-6); without it every caller-supplied prefill value is
    dropped. The `PUT /api/workflows/:id/intake-config` route stays for the same reason.
  - `server/utils/prefillFilter.ts` — used by `RunService`, not just the portal.
  - `server/services/CaptchaService.ts` + `CaptchaChallenge`/`CaptchaResponse`/`CaptchaType`
    — serve the **login and registration** captcha in `auth.routes.ts`.

  **Known residue, deliberate:** six `IntakeConfig` fields (`requireCaptcha`, `captchaType`,
  `sendEmailReceipt`, `receiptEmailVar`, `receiptTemplateId`, `excludeFromReceipt`) are now
  inert — the portal was their only reader. They were **not** removed because
  `IntakeConfigSchema` is `.strict()` and `RunService.resolveIntakeConfig` degrades to `{}`
  on a parse failure, so dropping them would make any stored config still containing them
  fail to parse and **silently switch prefill off**. Removing them needs a data migration
  first (`intake_config - 'requireCaptcha' - ...`), same shape as migration 0006.
  **Capability lost by design:** intake email receipts. No other path sent them.

  Verified: `type-check` 0, `lint` 0, strict-zones ✅, `test:fast` **2445** (2469 before,
  −24 = the deleted unit file). Live on port 5199: server boots, `/intake/*` now falls
  through to the SPA (`text/html`) instead of answering JSON, and a probe proved the prefill
  allowlist still enforces — allowlisted key seeded, non-allowlisted key dropped. The two
  surviving integration suites (`api.workflow-intake-config`, `api.runs.prefill-allowlist`)
  pass 9/9 and still assert `isIntake`/`upstreamWorkflowId` are rejected.

  Original mapping, kept for context — "intake" names **three unrelated things** here and
  only one was the legacy data-linking the repo owner already removed:

  1. **Legacy intake workflow / upstream reuse — already gone, cleanly.**
     `migrations/0006_remove_legacy_intake_reuse.sql` stripped `isIntake`,
     `upstreamWorkflowId`, `assignments`, step `default_value.source = 'intake'`, and
     `sections.config.intakeAssignment`. **Verified zero code leftovers** for every one of
     those markers. Nothing to do.
  2. **The public intake portal API — live, served, and with no first-party caller.**
     `server/routes/intake.routes.ts` is registered (`routes/index.ts:162`) and exposes a
     *second* run pipeline beside `/api/runs/*`: `/intake/runs` create/save/submit/status/
     download, `/intake/workflows/:slug/published`, `/intake/captcha/challenge`,
     `/intake/upload`, plus its own captcha, prefill allowlist and email receipts.
     **No client code calls any of it.** The public entry point `/w/:slug` was re-pointed at
     the standard `WorkflowRunner` (see the comment at `Router.tsx:75` — "the old
     PublicRunner stub never rendered questions and faked completion"), so this API's
     consumer is already gone. Two of its services are dead outright:
     `IntakeNavigationService` (217 lines, 0 importers — only a stale comment in
     `workflows/conditionAdapter.ts` mentions it) and `IntakeQuestionVisibilityService`
     (365 lines, 0 production importers; only `tests/unit/services/intakeQuestionVisibility.test.ts`
     keeps it referenced).
     **Do not delete on this evidence alone.** Migration 0006's own comment calls these "the
     modern public intake settings" and deliberately preserved `workflows.intakeConfig`, and
     `tests/integration/intake.portal.test.ts` exercises the pipeline — so it may be an
     intentional embed/third-party API with no first-party UI yet. That is the repo owner's
     knowledge, not the code's. **Question to answer before any deletion: is `/intake/*`
     meant to be a public API for embedding, or is it the second half of the system 0006
     started removing?** If the latter, the removal is ~1,719 lines plus `intakeConfig`,
     `shared/types/intake.ts`, `CaptchaService`, `prefillFilter`, and 3 test files.
  3. **Stage 17 intake *branding* — unrelated to both.** `client/src/components/intake/`
     and `/intake/preview` share the word but are a branding preview, not a data path.
     Tracked separately as **O-11**.
- **O-7 (needs-initiative) — white-label cannot be plan-gated until individuals can buy
  plans.** `custom_branding` is declared on the Team/Enterprise plans in
  `server/lib/billing/billingConfig.ts` and read by nothing. It is reachable only through
  `subscriptions`, which is keyed **solely** by `organizationId`
  (`shared/schema/billing.ts`) — there is no user-level subscription. Workflows carry
  `ownerType: 'user' | 'org'`, so gating today would work for org-owned workflows and
  **permanently deny white-label to every user-owned and legacy-NULL workflow.** The repo
  owner therefore shipped GH-158's toggle **ungated** (decision D3). Gating is ~5 lines once
  `subscriptions` can point at a user; the blocker is the billing model, not the code.
  `tenants.plan` (`free`/`pro`/`enterprise`) is a third, vestigial signal — set by nothing,
  read by nothing. Do not build on it.
- **O-8 (product-decision) — there is no project-level branding.** GitHub #158 asks to
  "resolve tenant, project, and workflow branding", but `projects` has no branding column,
  and one tenant has **many** organizations (`organizations.tenantId`), so where a project
  tier would sit is genuinely ambiguous. Deferred out of GH-158; needs a schema change and
  an ownership ruling.
- **O-9 ✅ FIXED 2026-08-05 — preview now renders the same resolved branding as production.**
  `WorkflowService.getWorkflowWithDetails` resolves branding through the same
  `BrandingService.resolveForWorkflow()` the runtime payload uses and returns it on the
  single-workflow GET, which is exactly the request the builder preview already makes.
  `WorkflowRunner` reads the server-resolved value on both paths; the client-side
  `resolveBranding(null, settings)` fallback survives only for an older cached response and
  is documented as a floor, not the normal path.
  Proven live: a workflow with `settings = {}` (no branding of its own) whose tenant carries
  logo/name/colors returned the **full tenant-resolved branding** on the preview payload —
  before the fix that field did not exist and the fallback produced nothing.
  **Note for reviewers:** this change pulled `BrandingService` → `shared/colorUtils.ts` into
  `check:strict-zones`' transitive closure, surfacing 4 pre-existing strict-mode errors that
  `npm run type-check` does not catch (`getLuminance`'s destructured map result, and
  `addDomain`'s `.returning()` row). Both fixed. `addDomain` uses `=== undefined` rather than
  a truthiness check because ESLint types it from the non-strict config and rejects the
  latter as always-true — the two gates disagree, and only the explicit comparison satisfies
  both.
- **O-10 (enhancement) — email, custom domains, and the signature-transition screen are
  still unbranded.** These are the remaining GitHub #158 acceptance criteria. All three are
  cheap now that `resolveBranding()` exists and `BrandingService.resolveForWorkflow()` is the
  single entry point; none were in GH-158's scope.

---

## Phase Gates

### Phase 0 Gate (P0 Hardening & Storage)
- [ ] GH-169A ✅ verified — clamd client proven against a fake daemon, fail-closed on every error path
- [ ] GH-169B ✅ verified — signed-URL round trip proven live against the running app
- [ ] `npm run type-check` (0 errors)
- [ ] `npm run lint` (0 errors)
- [ ] `npm run test:fast` green

### Phase 1 Gate (P1 Document & Delivery Pipeline)
- [ ] GH-168, GH-156, GH-170, GH-157, GH-149 all ✅ verified
- [ ] `npm run type-check` && `npm run lint` green
- [ ] Integration tests for document generation and e-sign green

### Phase 2 Gate (P1 Runner Experience)
- [ ] GH-160, GH-146, GH-147, GH-158, GH-159 all ✅ verified (GH-148 deferred 2026-08-07 — does not block this gate)
- [ ] `npm run test:fast` green with zero regressions

### Phase 3 Gate (P1 Builder Logic & Workflow Architecture)
- [ ] GH-154, GH-153, GH-152, GH-167 all ✅ verified
- [ ] Builder map and logic test suites green

### Phase 4 & 5 Gate (P2 Advanced Blocks, Mobile & Docs)
- [x] Template-language initiative closed 2026-08-10 — 11/11, retired to `tickets/backlog/TEMPLATE_LANGUAGE.md`
- [x] GH-161 ✅ (delivered by TPL-7, 2026-08-10) · GH-171 and GH-173 unblocked — still to verify
- [ ] All P2 tickets verified and docs aligned
- [ ] Full regression suite green
- [ ] Phase counts **recounted from the ticket headings**, not incremented — the OVERALL
      line drifted to 17/27 against 18 ✅ headings and was corrected 2026-08-09
