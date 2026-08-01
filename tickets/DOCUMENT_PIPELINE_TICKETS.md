# Document Pipeline — Tickets (DOCP-001)

Source: re-audit of `tickets/document-automation-audit.md` against the working
tree, **2026-08-01**. That file was an unstructured 8-finding audit with no
status markers, written before the DOCH and DEBT work landed. Every finding was
re-checked; **seven of eight were already fixed** by that later work and the
file was deleted. This is the one survivor, rewritten in house format.

Prefix is `DOCP` rather than reusing `DOCH` (the closed document-hardening
initiative), so ticket IDs stay unambiguous when searching git history.

## What the re-audit found

| Original | Finding | Verdict 2026-08-01 |
|---|---|---|
| T-001 | ZipBundler OOM (PizZip, all buffers in memory) | ✅ Fixed — now `archiver` + `createWriteStream`, streaming (`ZipBundler.ts:4,64`) |
| T-002 | `setTimeout` cleanup lost on restart | ✅ Fixed — hourly `cron.schedule('0 * * * *')` calls `cleanupExpiredPreviews`, started at boot in **both** entrypoints (`server/cron.ts:23`, `index.ts:93`, `production.ts:90`). The `setTimeout` is now a best-effort fast path with a durable backstop — the recommended architecture |
| T-003 | Puppeteer zombie browser + no timeouts | ⚠️ **Partial — this ticket.** Health check landed, timeouts did not |
| T-004 | PDF fidelity loss via mammoth→HTML | ✅ Fixed — Gotenberg/LibreOffice strategy (`PdfConverter.ts:14-16,34,198`); mammoth is now only the fallback path |
| T-005 | Path traversal in template resolver | ✅ Fixed — containment moved into `DiskStorageProvider.resolveWithinBase` under DEBT-5 (`FinalBlockRenderer.ts:501-507`) |
| T-006 | Filename collision on `Date.now()` | ✅ Fixed — `crypto.randomUUID()` (`DocumentEngine.ts:60`) |
| T-007 | Empty-string fallback for missing mapped vars | ✅ Fixed — guarded by `sourceValue !== undefined && sourceValue !== null` (`MappingInterpreter.ts:152`) |
| T-008 | Loose `new Date()` parsing | ✅ Fixed — `parseISO` + `isValid` first, `new Date()` only as a labelled fallback behind an `isNaN` guard (`docxHelpers.ts:13,151-155`) |

## How to work this document

- The ticket has **Finding**, **Preferred fix**, **Ties**, **Acceptance
  criteria**. Devs do not commit; the reviewer commits per passed ticket.
- Load `.claude/skills/run-tests` before running any test — `npm test` naively
  gives wrong results here.
- Status legend: 🔲 Open · 🔄 In progress · ✅ Done (verified at review)

| Ticket | Title | Priority | Size | Status |
|---|---|---|---|---|
| DOCP-001 | Puppeteer PDF conversion has no explicit timeouts | P2 | S | ✅ verified at review 2026-08-01 |

---

## DOCP-001 — Puppeteer PDF conversion has no explicit timeouts ✅ Done (2026-08-01)

**Priority: P2** · Size: S · File: `server/services/document/PdfConverter.ts`

### Finding

The original audit raised two problems with `PuppeteerStrategy`: a shared
browser that could go zombie, and unbounded page operations. **The first was
fixed; the second was not.**

Fixed — `getBrowser` now health-checks the shared instance and relaunches,
nulling the promise on rejection (`PdfConverter.ts:75-97`):

```ts
const existing = await PuppeteerStrategy.browserPromise;
if (existing.connected) { return existing; }
```

Still open — neither page operation sets a timeout
(`PdfConverter.ts:171,174`):

```ts
await page.setContent(styledHtml, { waitUntil: 'networkidle0' });

await page.pdf({
    path: outputPath,
    format: 'A4',
```

`waitUntil: 'networkidle0'` waits for network quiet. The HTML comes from
mammoth and normally references nothing remote, so it settles immediately — but
a template that embeds an external image or font makes this wait on a third
party, falling back to Puppeteer's 30 s default, and `page.pdf` has no default
timeout at all in some versions. A hang holds the request open and the page
never closes.

**Severity is P2, not higher, because this is the fallback path.** The strategy
is selected by whether `PDF_CONVERTER_API_URL` is set (`PdfConverter.ts:14-16`);
production uses Gotenberg. Puppeteer serves local dev and any environment where
that variable is missing or misconfigured — which is precisely when you least
want a silent hang.

### Preferred fix

Pass an explicit `timeout` to both calls, sourced from one named constant at the
top of the strategy rather than two literals, so they cannot drift apart. Keep
it well under any upstream request timeout — a few seconds is generous for
locally-generated HTML.

Wrap both in `try/finally` so `page.close()` runs even on timeout; a timed-out
page that is never closed leaks a renderer process and reintroduces the zombie
problem the health check just solved. Check whether the existing `finally`
around these calls already covers it before adding another.

On timeout, throw through the same error path the strategy already uses, so
callers see a normal conversion failure rather than a hang.

Do **not** change the Gotenberg strategy or the strategy-selection logic — this
ticket is limited to the two unbounded calls and their cleanup.

### Ties

- No other ticket touches this file. Can run any time, in parallel with
  anything.
- Load `.claude/skills/run-tests` before testing.
- File footprint: `server/services/document/PdfConverter.ts` plus its test file.
- Related history: DOCH-3/5/6 introduced the Gotenberg strategy; DEBT-5 moved
  storage containment. Neither touched these two calls.

### Acceptance criteria

1. `page.setContent` is called with an explicit `timeout`.
2. `page.pdf` is called with an explicit `timeout`.
3. Both read the same named constant; no duplicated literal.
4. A timeout on either call closes the page (no leaked renderer) and surfaces as
   a normal conversion error, not a hang.
5. Successful conversion behaviour is unchanged — same output path, same PDF
   options.
6. The Gotenberg strategy and the `PDF_CONVERTER_API_URL` selection logic are
   untouched.
7. New test asserts 4: a `setContent` that exceeds the timeout rejects rather
   than hanging, and the page is closed. Mock the page rather than launching a
   real browser — Puppeteer may not be installed in every environment.
8. Gates: `npm run type-check` 0 errors, `npx eslint` clean on touched files,
   `npm run test:fast` green with no reduction against baseline.

---

### Reviewer verification (2026-08-01)

**All 8 criteria met.** Both page operations now pass
`PUPPETEER_PAGE_TIMEOUT_MS` (10 s) — one named constant, no duplicated literal
(AC1–3). The dev followed the ticket's instruction to *check before adding*: the
existing `try/finally` around both calls already runs `page.close()`, so no
second `finally` was introduced (AC4). The Gotenberg strategy and the
`PDF_CONVERTER_API_URL` selection are untouched (AC6), and the diff is 14 lines
plus a comment explaining why the budget is small and must stay under any
upstream request timeout.

AC7's test mocks `puppeteer.launch` and `mammoth.convertToHtml` rather than
launching Chromium, so it runs anywhere. It asserts both timeouts are numbers
**and equal to each other** — which is how AC3 gets checked behaviourally
rather than by reading the source — and that a timing-out `setContent` rejects
with a normal `PDF conversion failed` error, closes the page exactly once, and
never reaches `page.pdf`. Its `afterEach` drops the static browser singleton so
tests cannot contaminate each other.

**Proved load-bearing, not vacuous.** The reviewer deleted the `setContent`
timeout and re-ran: `1 failed | 19 passed`, with
`AssertionError: expected 'undefined' to be 'number'`. Restored and confirmed
byte-identical afterwards. Note the close-on-timeout assertion is a
characterisation test — that cleanup pre-dated this ticket — which is correct,
since AC4 asked to confirm the existing `finally` covers it.

**Merge safety:** the worktree was based on `cde530ef` while `main` was at
`fab72de9`, but no commit in between touched either file and the base copy was
byte-identical to main's, so there was no stale-branch clobber risk.

**Gates (run by the reviewer on main after merging):** `npx tsc --noEmit` 0
errors · `npx eslint` on both files clean · `npm run test:fast` **2206 passed**
/14 skipped (2204 before, +2 — exactly the new tests).

---

## Gate

- [x] DOCP-001 ✅ with a dated verification note
- [x] type-check 0 errors · lint clean · `test:fast` green
- [x] Reviewer has committed the passed ticket
