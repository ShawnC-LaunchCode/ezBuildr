# DOCX Editor Hardening Gate

> **Status:** Draft
> **Applies to:** New in-app DOCX template creator/editor features.

Before enabling any "DOCX Editor" features in production, the following hardening measures must be verified. This ensures we do not introduce new attack vectors via client-side generated content or server-side manipulation.

## Threat Model
-   **Malicious Content:** User-generated DOCX files acting as vectors (Macros, OLE objects, Zip bombs).
-   **Resource Exhaustion:** Complex XML parsing causing CPU spikes or memory leaks.
-   **Integrity:** Corrupted files crashing the renderer or parser.
-   **Persistence:** Data loss due to ephemeral storage on Railway before S3 migration.

---

## 🛑 Must Be True (The Gate)
*These items are non-negotiable blocking requirements.*

### 1. Input Validation & Sanitization
-   [ ] **Strict Size Limit:** Enforce `10MB` limit (consistent with `server/routes/templates.routes.ts` `upload` config) for any *save* operations from the editor.
-   [ ] **Magic Bytes:** Check magic bytes (`50 4B 03 04`) for *every* save/upload, not just initial file creation. Reuse `utils/magicBytes.ts`.
-   [ ] **Virus Scan:** Run `virusScanner().scan()` on the editor's output buffer *before* committing to storage.
-   [ ] **Macro Stripping:** The editor MUST NOT preserve macros.
    -   *Server-side enforcement:* If using a library like `mammoth` or `docxtemplater`, verify it ignores/strips `vbaProject.bin`.
    -   *Validation:* Re-run `templateScanner.scanAndFix()` on editor output to ensure it remains a valid, clean DOCX.

### 2. Parsing Safety (Server-Side)
-   [x] **Zip Bomb Protection:** DOCX uploads enforce a 100x compression-ratio limit, a 256MB uncompressed-size limit, and archive-path safety in `server/utils/zipLimits.ts`.
-   [ ] **XXE Prevention:** Configure any XML parsers (used for `document.xml` or `styles.xml`) to **disable external entity resolution** (`resolveExternalEntities: false`).
-   [x] **Timeout Enforcement:** Template DOCX/PDF parsing runs inside `documentProcessingLimiter` with `withTimeout` from `server/utils/concurrency.ts`. The default is 30s (environment-overridable via `DOCUMENT_PROCESSING_TIMEOUT_MS`); the illustrative 5s budget is too tight for normal 10MB uploads on small Railway instances.
    -   *Scope, verified 2026-07-27:* `withTimeout` is a `Promise.race`, so it bounds **asynchronous** stalls and frees the concurrency slot, but it **cannot interrupt synchronous CPU-bound work** — a blocked event loop also blocks the timer. Measured: a 1500ms synchronous spin under a 100ms budget did not time out and ran to completion. `PizZip` parsing and `zip.generate()` are synchronous, so a pathological archive that spins the parser is bounded by the **ZIP limits above** (rejected before parsing), not by this timeout. Fully bounding CPU spin needs worker-thread offload — see DOCH-B7.

### 3. Editor UI Security
-   [ ] **CSP Updates:** Update Content Security Policy to allow *only* necessary sources for the editor (e.g., fonts, scripts).
    -   *Goal:* Prevent the editor from loading malicious external resources if a user pastes HTML/RTF with external references.
-   [ ] **Sanitized Preview:** If the editor offers a "Live Preview" (HTML rendering):
    -   Sanitize all HTML output using `DOMPurify` (or server-side equivalent) before rendering.
    -   Disable `javascript:` URIs in links.

### 4. Storage & Integrity
-   [ ] **Atomic Writes:** Ensure saves are atomic.
    -   *Pattern:* Write to temp file -> Validate -> Move/Replace -> Update DB. (See `templates.routes.ts` PATCH logic).
    -   *Constraint:* Never overwrite the "live" template file until the new one is fully validated.

---

## ⚠️ Can Be Deferred
*These are valuable but do not block MVP release.*

-   [ ] **S3 Migration:** `DiskStorageProvider` is acceptable for MVP *if* we accept Railway ephemeral disk risks (or use a persistent volume mount).
    -   *Mitigation:* Warn users "Templates may be reset on deployment" OR configure Railway Volume for `server/files`.
-   [ ] **Diffing History:** Storing full diffs of DOCX versions is complex. Storing whole file versions is sufficient for MVP.
-   [ ] **Advanced Font Support:** Restrict to standard web-safe fonts to avoid font parsing vulnerabilities.

---

## 📊 Instrumentation & Alerts
*Add these to existing observability (e.g., `server/logger`, metrics)*

-   [ ] **Parsing Duration:** Log duration of `editor.save` operations. Alert on > 2s average.
-   [ ] **Validation Failures:** Alert on spikes in `Magic Bytes validation failed` or `Virus detected`. This indicates active probing.
-   [ ] **Compression Ratios:** Log high compression ratios (zip bomb attempts).

---

## 🧪 Testing Plan

### Unit Tests
-   [ ] **Corrupt Header:** Test parser rejection of random bytes disguised as `.docx`.
-   [ ] **Recursive XML:** Test parser against an XML with deep recursion (Billion Laughs attack).
-   [ ] **Path Traversal:** Ensure filenames inside the ZIP structure cannot reference `../`.

### Integration Tests
-   [ ] **Huge File:** Attempt to save a 9.9MB DOCX (just under limit). Verify CPU/Memory usage.
-   [ ] **Concurrency:** Simulate 5 concurrent users saving templates. Verify no cross-talk or file locking errors.
-   [ ] **Race Condition:** Rapid-fire "Save" clicks. Ensure last write wins or optimistic locking rejects stale overwrites.

---

## Railway & Local Behavior

| Feature | Local Dev | Railway (Prod) |
| :--- | :--- | :--- |
| **Storage** | `server/files` (Persistent) | `server/files` (Ephemeral unless Volume mounted) |
| **Virus Scan** | Mocked/ClamAV Local | ClamAV Service (or Mock in staging) |
| **Rate Limits** | Loose (1000/15min) | Strict (Global + Upload limits active) |

> **Recommendation:** Verify Railway Volume configuration for `server/files` BEFORE enabling user-generated templates to prevent data loss on deploy.
