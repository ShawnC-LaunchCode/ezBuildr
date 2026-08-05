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
6. **Line numbers are advisory.** Every Finding quotes the code and names its enclosing symbol — that quote plus symbol is the real locator. If a line number has drifted, grep for the quoted text; a drifted line is not a broken ticket.

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

## Roadmap Index & Dependency Overview

```
[P0: Storage & Security Foundation]
  └── GH-169A (Real clamd virus scanner client)
  └── GH-169B (Storage init, signed-URL route, S3 hardening)
        │
        ├──► [Phase 1: Document & Delivery Pipeline]
        │      ├── GH-168 (High-fidelity DOCX-to-PDF Converter)
        │      ├── GH-156 (Document Mapping Workbench)
        │      ├── GH-170 (Delivery Destinations & Retries)
        │      ├── GH-157 (DocuSign Envelope Lifecycle)
        │      └── GH-149 (Packaged Legal Integrations: Clio/Stripe/E-sign)
        │
        ├──► [Phase 2: Runner Experience, Reliability & Compliance]
        │      ├── GH-160 (Resilient Autosave & Offline Buffering)
        │      ├── GH-146 (File Uploads & Repeaters in Runner)
        │      ├── GH-147 (Save-and-Resume & Client Handoff)
        │      ├── GH-158 (Workflow Branding & White Labeling)
        │      ├── GH-159 (WCAG 2.2 AA Accessibility Conformance)
        │      └── GH-148 (Multilingual & Locale-Aware Runner)
        │
        ├──► [Phase 3: Builder Logic & Visual Architecture]
        │      ├── GH-154 (Unified Conditional Logic Editor)
        │      ├── GH-153 (Visual Workflow Map & Path Simulation)
        │      ├── GH-152 (Publish Gate Review Grouping)
        │      └── GH-167 (Document-to-Interview AI Onboarding)
        │
        └──► [Phase 4 & 5: Advanced Blocks, UX & Docs]
               ├── GH-161 (Answer Piping & Dynamic Recall)
               ├── GH-162 (Review Step Structured Values & Visibility)
               ├── GH-163 (Payment, Scheduling, Ranking & Matrix Blocks)
               ├── GH-165 (Guided Easy-Mode Workflow)
               ├── GH-171 (Template Versioning & Impact Analysis)
               ├── GH-173 (Legal Drafting Primitives & Templates)
               ├── GH-155 (Final-Document Authoring Config)
               ├── GH-164 (Mobile-First Kiosk Mode)
               ├── GH-166 (Mobile/Tablet Responsive Builder)
               ├── GH-172 (PDF/OCR Extraction & Broadened Formats)
               └── GH-174 (Documentation & Capability Alignment)
```

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

## GH-168 — Make high-fidelity DOCX-to-PDF conversion the production default 🔲

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

## GH-156 — Persist document mappings in a guided mapping workbench 🔲

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

## GH-157 — Complete the production DocuSign envelope lifecycle 🔲

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

## GH-149 — Package legal delivery integrations for Clio, e-signature, and payments 🔲

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

## GH-160 — Add resilient autosave, offline buffering, and conflict recovery 🔲

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

## GH-146 — Support repeaters, loop groups, and file uploads in the runner 🔲

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

## GH-147 — Make save-and-resume, assignment, and staff/client handoff first-class 🔲

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

## GH-158 — Apply workflow branding and white labeling across the runner 🔲

**Priority: P1** · Size: S · Files: `client/src/components/runner/`, `client/src/pages/runner/`, `shared/schema/workflow.ts`
**Ties:** Independent

### Context & Current State
- Workflow branding settings (primary color, logo, favicon, white label toggles) exist in schema but runner hardcodes default ezBuildr headers/footers in several views.

### Acceptance Criteria
1. Runner dynamically applies workflow branding: custom logo, primary/accent colors, font styling, and custom favicon.
2. White label mode removes "Powered by ezBuildr" badge when enabled on authorized plans.
3. Contrast and readability safeguards ensure dynamic themes maintain WCAG contrast.
4. Visual snapshot / component tests verify custom vs default branding.

---

## GH-159 — Establish WCAG 2.2 AA conformance for builder and runner 🔲

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

## GH-148 — Add multilingual interview content and locale-aware formatting 🔲

**Priority: P1** · Size: L · Files: `client/src/lib/i18n.ts`, `shared/schema/workflow.ts`, `client/src/components/runner/`
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

# Phase 3: P1 Builder Logic & Visual Architecture

## GH-154 — Unify conditional logic editing across the builder 🔲

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

## GH-153 — Add a visual workflow map with deterministic path simulation 🔲

**Priority: P1** · Size: XL · Files: `client/src/components/builder/map/`, `shared/workflowLogic.ts`
**Ties:** Preceded by GH-154

### Context & Current State
- Complex branching workflows are difficult to visualize across sequential pages.

### Acceptance Criteria
1. Interactive visual graph/node map showing sections, conditional branches, skip targets, final documents, and endings.
2. Clicking any node opens the corresponding section/step inspector.
3. Deterministic path simulation: author inputs hypothetical answers and map highlights active route in real time.
4. Map flags unreachable sections, dead ends, and infinite loop risks.
5. Component tests prove map rendering and path simulation accuracy.

---

## GH-152 — Extend the publish gate to document readiness and provider availability 🔲

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

## GH-167 — Build document-to-interview onboarding with field and question generation 🔲

**Priority: P1** · Size: L · Files: `client/src/pages/onboarding/`, `server/routes/ai.doc.routes.ts`, `server/services/ai/`
**Ties:** Preceded by GH-156

### Context & Current State
- AI doc analysis and placeholder extraction exist in separate API routes. A cohesive onboarding wizard should allow an author to upload a DOCX/PDF, auto-generate corresponding interview questions, and bind mappings in one step.

### Acceptance Criteria
1. Step-by-step onboarding flow: Upload Document -> AI Extracts Variables -> Generates Workflow -> Maps Fields.
2. Author can review, edit, and approve generated question types and aliases before workflow creation.
3. Resulting workflow immediately testable in PreviewRunner.
4. Error handling and rate limiting prevent AI timeouts on large templates.
5. Integration tests verify full generation flow from document buffer to published workflow.

---

# Phase 4: P2 Advanced Blocks, Authoring & Templates

## GH-161 — Add answer piping and dynamic content throughout interviews 🔲

**Priority: P2** · Size: M · Files: `client/src/components/runner/`, `shared/conditionEvaluator.ts`
**Ties:** Preceded by GH-154

### Acceptance Criteria
1. Question titles, descriptions, and static text blocks support `@alias` or `{{alias}}` answer recall syntax.
2. Runner updates piped text reactively as preceding answers change.
3. Formatter modifiers supported (e.g. `@client_name | uppercase`, `@fee | currency`).
4. Missing or unfilled references render configurable fallback or blank.
5. Tests verify reactivity, formatting, and XSS sanitization.

---

## GH-162 — Improve review for structured values and conditional visibility 🔲

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

## GH-171 — Add document template versioning and dependency impact analysis 🔲

**Priority: P2** · Size: M · Files: `server/services/TemplateVersionService.ts`, `client/src/components/builder/templates/`
**Ties:** Preceded by GH-156

### Acceptance Criteria
1. Template uploads create immutable versions with commit notes and timestamps.
2. Dependency analyzer lists all workflows referencing a template before an update is published.
3. Impact warning highlights added, removed, or renamed placeholders across active workflows.
4. Workflows can pin to a specific template version or follow latest.

---

## GH-173 — Add legal drafting primitives and curated workflow templates 🔲

**Priority: P2** · Size: M · Files: `server/services/document/`, `client/src/templates/`
**Ties:** Preceded by GH-156

### Acceptance Criteria
1. Pre-built legal drafting helpers: legal hierarchical numbering, party singular/plural agreements, pronoun agreement, date calculation helpers.
2. Curated workflow starter templates: Non-Disclosure Agreement (NDA), Retainer Agreement, Intake Questionnaire.
3. Templates include sample DOCX files with pre-configured variable mappings.

---

## GH-155 — Finish final-document authoring configurability 🔲

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

## Backlog / observations

Not tickets. Found during the 2026-08-04 GH-169 audit of the live Railway config. Promote
only with the repo owner's say-so.

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
- [ ] GH-160, GH-146, GH-147, GH-158, GH-159, GH-148 all ✅ verified
- [ ] `npm run test:fast` green with zero regressions

### Phase 3 Gate (P1 Builder Logic & Workflow Architecture)
- [ ] GH-154, GH-153, GH-152, GH-167 all ✅ verified
- [ ] Builder map and logic test suites green

### Phase 4 & 5 Gate (P2 Advanced Blocks, Mobile & Docs)
- [ ] All P2 tickets verified and docs aligned
- [ ] Full regression suite green
