# Document Pipeline — Hardening & Truthfulness Tickets (DOCH-1..6 + backlog)

Source: senior re-verification of GitHub epics
[#155](https://github.com/ShawnC-LaunchCode/ezBuildr/issues/155),
[#168](https://github.com/ShawnC-LaunchCode/ezBuildr/issues/168),
[#169](https://github.com/ShawnC-LaunchCode/ezBuildr/issues/169), and
[#174](https://github.com/ShawnC-LaunchCode/ezBuildr/issues/174), 2026-07-26.

Scope: `server/routes/templates.routes.ts`, `server/services/document/*`
(`DocxSanitizer`, `TemplateScanner`, `PdfConverter`), `server/services/processingLimiter.ts`,
`server/utils/magicBytes.ts`, `server/routes/health.ts`, `docs/claude/FEATURES.md`,
`docs/hardening/docx-editor-gate.md`, and the dead final-document surfaces under
`client/src/components/{runner,builder,blocks}`.

Overall grade at audit time: **B-**. The document upload pipeline is better than
its own hardening doc claims — size limits, MIME filtering, magic-byte validation,
virus-scanner hooks and storage quota checks are all real production code, and the
PATCH path is effectively atomic. What's left is a tight, specific set of gaps:
three ZIP/resource controls that were never added, a sanitizer that was written and
then never wired in, a converter that records a hardcoded lie about which engine
produced each PDF, and docs that advertise two features which throw
`not yet implemented` at runtime.

Every finding below was verified against the working tree on 2026-07-26 with
file:line evidence and quoted code. Line numbers may drift as fixes land — search
for the quoted code if a reference is stale.

> **Working-tree caveat at authoring time:** `server/services/document/PdfConverter.ts`
> had **uncommitted** modifications that implement `ApiStrategy` (Gotenberg) for real
> — it was previously a `throw new Error('API PDF conversion not fully implemented')`
> stub. DOCH-4 and DOCH-5 assume that work is present. If `git status` shows that file
> clean and `ApiStrategy.convert` throws, **stop and report** rather than guessing.

---

## How to work this document

- **Tickets are grouped into 3 phases**, ordered by risk and dependency. Do not
  start a phase until the previous phase's **Phase Gate** has been verified and
  committed by the reviewer (Shawn's senior model).
- Each ticket has: **Finding** (what is wrong, with evidence), **Preferred fix**
  (the approach the reviewer expects — deviate only with a stated reason),
  **Ties** (related tickets/skills/docs — load the named skills before touching
  code), and **Acceptance criteria** (all must pass).
- **Load the named project skills before touching code.** For anything under
  `server/routes/`, `server/services/`, or `server/repositories/`, load
  `add-api-endpoint`. For every ticket, load `run-tests` — **`npm test` naively
  gives wrong results in this repo**; the suite is three separate Vitest projects.
  No ticket in this file requires a schema change; if you think you need one, that
  is a blocker to report, not a thing to do (load `db-schema-change` and stop).
- **Gates for every ticket:** `npm run type-check` → 0 errors, `npm run lint` on
  every file you touched → 0 problems, `npm run test:fast` → green and no fewer
  passing tests than the baseline below. `tsc --pretty` emits ANSI codes, so
  `grep "error TS"` finds nothing on a failing tree — read the raw output or grep
  `-E "Found [0-9]+ error"`.
- **Devs do not commit.** The reviewer commits one commit per passed ticket.
- **Do not `git add -A`.** Shawn works this repo from a second IDE concurrently and
  unrelated changes are routinely present in the tree.
- Status legend: 🔲 Open · 🔄 In progress · ✅ Done (verified at review)

### Phase overview

| Phase | Theme | Tickets | Est. effort |
|---|---|---|---|
| 1 | Delete dead code & stop advertising what doesn't work | DOCH-1, DOCH-2 | ~3 h |
| 2 | ZIP & resource-exhaustion controls | DOCH-3, DOCH-4 | ~1 day |
| 3 | Converter truthfulness & observability | DOCH-5, DOCH-6 | ~1 day |

### Baseline at audit time

`npm run test:fast` on the working tree, 2026-07-26 (with the uncommitted
`PdfConverter.ts` / `RunLifecycleService.ts` changes present):

```
Test Files  136 passed | 1 skipped (137)
     Tests  1896 passed | 15 skipped (1911)
  Duration  26.25s
```

**Do not lower these numbers.** All findings below are additional to a green suite.

### Not in this file (escalated to Shawn)

- **S3-in-production default + migration of existing files** (from #169). Requires
  a storage-posture decision and a data migration with a missing-source-file report.
  Senior-owned.
- **Real malware scanning** (from #169). `ClamAVVirusScanner.scan()` at
  `server/services/security/VirusScanner.ts:82` is a stub that always rejects, and
  the default is `NoOpVirusScanner`. Choosing between running ClamAV, buying a
  scanning API, or accepting the risk is a product/infra decision, not a dev task.
- **Making Gotenberg the production default** (from #168). Depends on deploying the
  service; DOCH-5/DOCH-6 make it *safe and observable* to switch, they do not switch it.
- **Rewriting FEATURES.md wholesale into a Production/Beta/Preview/Partial matrix**
  (the rest of #174). Status taxonomy is a product-judgment call; DOCH-2 only fixes
  the three claims that are provably false today.

---

# Phase 1 — Delete dead code & stop advertising what doesn't work

Two low-risk, high-clarity tickets. Neither changes behavior for any reachable
user path; both remove the ability for the codebase to lie about itself. Explicitly
out of scope: building any *new* final-document editing surface (that is #155's
consolidation work, senior-owned) and restructuring FEATURES.md (see escalations).

## DOCH-1 — Delete the three unreachable final-document surfaces 🔲

**Priority: P2** · Size: S · Files: `client/src/components/runner/blocks/FinalBlock.tsx`, `client/src/components/runner/blocks/BlockRenderer.tsx`, `client/src/components/runner/blocks/index.ts`, `client/src/components/builder/cards/FinalBlockEditor.tsx`, `client/src/components/builder/cards/index.tsx`, `client/src/components/blocks/FinalBlockEditor.tsx`

### Finding

GitHub #155 reports that final-document paths "show an alert instead of downloading
generated output". That code is really there — but it is **unreachable**, which
makes #155's P1 framing wrong and this ticket a deletion rather than a fix.

**1. The `alert()` path.** `client/src/components/runner/blocks/FinalBlock.tsx:112`:

```tsx
alert(`Document generation will be implemented in Prompt 10.\n\nDocument: ${document.alias}`);
```

with a header comment at `FinalBlock.tsx:8` — `"Displays download placeholders
(Prompt 10 will add actual generation)"`. It is rendered only via
`BlockRenderer.tsx:189`:

```tsx
return <FinalBlockRenderer step={step} stepValues={props.context} />;
```

But `client/src/hooks/runner/useSectionVisibility.ts:72-74` unconditionally strips
every `final_documents` step before any step list reaches `SectionSteps`/`BlockRenderer`:

```ts
normalizeRunnerStepType(step.type) !== 'final_documents'
```

and `client/src/pages/WorkflowRunner.tsx:201` feeds exactly that filtered list in.
The only in-app way to create a `final_documents` step (`SidebarTree.tsx:47-69`,
"Add Final Docs") always also sets `section.config.finalBlock = true`, routing the
section through `CompletedRunnerScreen` → `FinalDocumentsSection` instead
(`WorkflowRunner.tsx:96-97, 401-416`). `FinalDocumentsSection.tsx` is the real
surface and is clean: it calls `POST /api/runs/:id/generate-documents`, polls
`GET /api/runs/:id/documents`, and renders a true `<a href={doc.fileUrl} download>`.

**2. The placeholder-document-ID editor.**
`client/src/components/builder/cards/FinalBlockEditor.tsx:76-84` creates
`{ documentId: "placeholder", ... }` with the comment *"In Prompt 10, this will open
a modal to select from uploaded templates"*, and `:215-220` renders a
`"Conditions (Placeholder)"` panel. It is exported only from
`client/src/components/builder/cards/index.tsx:22`, and **that barrel has zero
importers anywhere in `client/src`** (verified: no import of `builder/cards` or
`@/components/builder/cards` exists, and nothing imports
`builder/cards/FinalBlockEditor` directly). The live authoring surface is
`client/src/components/builder/final/FinalDocumentsSectionEditor.tsx`, which
persists real template IDs from `/api/projects/:id/templates`.

**3. A third orphaned duplicate.** `client/src/components/blocks/FinalBlockEditor.tsx`
is a second, older `FinalBlockEditor` with a different config shape and **no
importers at all**.

Consequence: three dead surfaces that (a) will be found and "fixed" or accidentally
re-wired by future work, (b) make `grep` for final-document code return mostly
misleading hits, and (c) keep Prompt-era copy alive in the repo. Leaving them is how
a decoupled future change turns a dead `alert()` into a live one.

### Preferred fix

Delete, do not deprecate. In order:

1. Delete `client/src/components/blocks/FinalBlockEditor.tsx` outright (no importers).
2. Delete `client/src/components/builder/cards/FinalBlockEditor.tsx` and remove its
   re-export line from `client/src/components/builder/cards/index.tsx:22`. If that
   barrel is left with zero remaining exports, delete the barrel too.
3. Delete `client/src/components/runner/blocks/FinalBlock.tsx`, remove the
   `FinalBlockRenderer` import at `BlockRenderer.tsx:28`, remove the
   `case "final_documents":` arm at `BlockRenderer.tsx:188-189`, and remove the
   re-export at `client/src/components/runner/blocks/index.ts:27`.
4. For the removed `case "final_documents":` arm, do **not** invent a new fallback —
   let it fall through to whatever `BlockRenderer`'s existing `default:` arm does for
   an unhandled type, and mirror that arm's existing behavior/comment style.

Per the repo's turn-in rules: **delete the code, never comment it out**, and remove
every import/prop/param the deletion orphans. Run `npm run lint` on each touched
file specifically — unused imports are the expected failure mode here.

Do **not** touch `FinalDocumentsSection.tsx` or `FinalDocumentsSectionEditor.tsx`;
those are the live, working surfaces and are out of scope.

### Ties

- Parent epic: GitHub #155. This ticket closes only its dead-code half; the
  "one supported final-document editor" consolidation stays senior-owned.
- Load the `run-tests` skill. This is client-only, so `npm run test:fast` is the
  relevant project.
- Coordinates with **DOCH-2** (docs) only thematically — no shared files, so the two
  can run in parallel.
- Prior art for the required deletion discipline: memory of ICW-B1 (retire
  `LegacyStepBody`), which deleted an orphaned editor tree the same way.

### Acceptance criteria

1. All three files above are deleted from the working tree; `git status` shows them
   as deletions, and no file contains commented-out remnants of them.
2. `grep -rn "FinalBlockRenderer\|Prompt 10" client/src` returns **zero** matches.
3. `grep -rn "documentId: \"placeholder\"" client/src` returns **zero** matches.
4. `BlockRenderer.tsx` no longer imports `./FinalBlock` and no longer has a
   `case "final_documents":` arm; the file's `default:` handling is unchanged.
5. A `final_documents` step still never reaches `BlockRenderer` — the existing
   filter in `useSectionVisibility.ts:72-74` is left **untouched** (do not "clean it
   up" as now-redundant; it is the thing that makes this deletion safe).
6. New/updated test asserts criterion 5 — that `getVisibleSectionSteps` filters
   `final_documents` — added to the existing runner hook/section tests under
   `tests/unit/client/`. Name the file you chose in your report.
7. `npm run type-check` → 0 errors; `npm run lint` on every touched file → 0
   problems; `npm run test:fast` → green, passing count ≥ baseline.

---

## DOCH-2 — Correct the three provably false capability claims in FEATURES.md 🔲

**Priority: P2** · Size: S · Files: `docs/claude/FEATURES.md`, `client/src/components/builder/cards/SignatureBlockEditor.components.tsx`

### Finding

`docs/claude/FEATURES.md` lists under **"## Complete Features (Production Ready)"**
three capabilities that do not work. This is #174's verified core; the rest of #174
(a full status taxonomy) is escalated.

**1. E-Signature.** `FEATURES.md:21`:

```
| **E-Signature** | DocuSign + native signatures via `/api/esign`, signing callbacks |
```

Every core DocuSign operation throws. `server/services/esign/DocusignProvider.ts`:
`refreshAccessToken()` L124-127, `createEnvelope()` L178-181, `getEnvelopeStatus()`
L322-325, `voidEnvelope()` L378, `downloadSignedDocuments()` L398 — all
`throw new EsignApiError('DocuSign ... not yet implemented ...', 'docusign')`. Only
`verifyWebhookSignature()`/`parseWebhookEvent()` are real. `createEnvelope`'s
`preview: true` branch (L153-160) returns a mock.

Worse, the **UI presents DocuSign as the ready option**:
`client/src/components/builder/cards/SignatureBlockEditor.components.tsx:95-100`
offers `docusign` as a plain `<option>` while labelling `hellosign`/`native`
`"(Coming Soon)"` — exactly inverted from reality.

**2. Document Generation / "AI binding".** `FEATURES.md:22`:

```
| **Document Generation** | PDF/DOCX generation, template variables, repeating sections, AI binding |
```

AI binding produces nothing durable.
`client/src/components/builder/templates/DocumentTemplateEditor.tsx:65-69`:

```ts
const handleApplyMapping = (mapping: any) => {
    console.log("Applying mapping", mapping);
    // TODO: Persist mapping to backend
};
```

**3. "38 Step Types".** `FEATURES.md:10` lists `file upload` and `repeater` among
production-ready step types, but `shared/types/runnerStepTypes.ts:69-73` names
`file_upload`, `loop_group`, and `repeater` in
`RUNNER_INTENTIONALLY_UNSUPPORTED_STEP_TYPES`; per that file's own doc comment
(L119-127) they render only a skip notice — there is **no respondent-fillable
control**.

Consequence: internal work is planned against a document that says these are done
(this is precisely how GitHub #152 came to be filed against an already-built publish
gate), and the signature editor actively steers authors onto a provider that 500s.

### Preferred fix

Surgical and literal. **Do not restructure the document** or introduce a new status
taxonomy — that is escalated. Make exactly these edits:

1. `FEATURES.md:21` — move E-Signature out of "Complete Features (Production Ready)"
   into the existing **"## Orphaned / Partial"** section, following that section's
   established bullet style (name → em-dash → what exists → what to treat it as).
   State that native signatures and DocuSign *webhook verification* are real, and
   that DocuSign envelope create/status/void/download throw `not yet implemented`.
2. `FEATURES.md:22` — keep Document Generation under production-ready but strike
   `AI binding` from the description and add a bullet to "## Orphaned / Partial"
   noting AI mapping suggestions render but are never persisted
   (`DocumentTemplateEditor.handleApplyMapping`), with a pointer to GitHub #156.
3. `FEATURES.md:10` — keep the row, but qualify it: state that three of the 38
   (`file_upload`, `loop_group`, `repeater`) are schema/builder-only and render a
   skip notice in the runner, citing `RUNNER_INTENTIONALLY_UNSUPPORTED_STEP_TYPES`
   as the source of truth. Cite the constant by name so the doc can be re-checked
   mechanically.
4. `SignatureBlockEditor.components.tsx:95-100` — relabel the `docusign` option
   `"DocuSign (Coming Soon)"` and apply whatever `disabled` treatment the existing
   `hellosign`/`native` options already use. **Copy the sibling options' exact
   pattern**; do not invent a new disabled-state mechanism, and do not remove the
   option or change the persisted config value.

Keep every claim you write traceable to a `file:line` you personally re-checked. If
you find a *fourth* false claim, do **not** fix it — note it in your report so it
can be ticketed.

### Ties

- Parent epic: GitHub #174 (this closes its verified core). Related: #157 (DocuSign
  lifecycle) and #156 (mapping persistence) — both senior-owned; **do not implement
  either**, only stop claiming they work.
- Runs in parallel with DOCH-1 (no shared files).
- CLAUDE.md names `docs/claude/FEATURES.md` as a Quick Reference doc to keep in
  sync when architecture changes land — this ticket is that obligation, paid late.

### Acceptance criteria

1. `FEATURES.md` no longer lists E-Signature under "Complete Features (Production
   Ready)"; it appears under "Orphaned / Partial" with the DocuSign stub state named.
2. `FEATURES.md:22`'s Document Generation row no longer contains the words
   `AI binding`, and a new "Orphaned / Partial" bullet records the unpersisted
   mapping with a #156 pointer.
3. The step-types row states that `file_upload`, `loop_group`, and `repeater` are
   not respondent-fillable, and names
   `RUNNER_INTENTIONALLY_UNSUPPORTED_STEP_TYPES` as the source of truth.
4. Every factual statement added cites a real `file:line` that you re-verified;
   list those citations in your report.
5. The signature-block provider `<select>` labels DocuSign `"(Coming Soon)"` and
   disables it using the same mechanism as the existing `hellosign`/`native`
   options; the stored config value for `docusign` is unchanged.
6. New/updated test asserts criterion 5 (DocuSign is not a selectable/enabled
   provider option) in a test file under `tests/unit/client/`. Name the file in
   your report.
7. `npm run type-check` → 0 errors; `npm run lint` on the touched `.tsx` file → 0
   problems; `npm run test:fast` → green, passing count ≥ baseline.

---

## Phase 1 Gate

- [ ] DOCH-1, DOCH-2 both ✅ with dated verification notes
- [ ] `npm run type-check` → 0 errors
- [ ] `npm run lint` → 0 errors (zero-error policy)
- [ ] `npm run test:fast` → green, passing count ≥ recorded baseline
- [ ] `grep -rn "Prompt 10\|FinalBlockRenderer" client/src` → zero matches
- [ ] Reviewer has committed each passed ticket + this gate

---

# Phase 2 — ZIP & resource-exhaustion controls

The three unchecked items in `docs/hardening/docx-editor-gate.md` §2 that are
genuinely missing from code. Explicitly out of scope: XXE hardening (§2's third
item — needs an audit of which XML parsers are actually reachable, which is its own
ticket), malware scanning, and S3 migration (both escalated).

## DOCH-3 — Enforce ZIP-bomb limits on every DOCX ingestion path 🔲

**Priority: P1** · Size: M · Files: new `server/utils/zipLimits.ts`, `server/routes/templates.routes.ts`

### Finding

`docs/hardening/docx-editor-gate.md:28` lists as a **non-negotiable blocking
requirement**:

```
-   [ ] **Zip Bomb Protection:** Ensure the DOCX parser enforces a compression ratio
    limit (e.g., max 100x expansion) and max uncompressed size (e.g., 256MB).
```

It is unchecked, and no such check exists anywhere in the repo. A DOCX is a ZIP
container, and both ingestion paths hand attacker-controlled archives straight to a
ZIP parser after validating only the *compressed* size:

- **POST** (`templates.routes.ts:282`):
  `await documentProcessingLimiter.run(() => templateScanner.scanAndFix(fileBuffer))`
- **PATCH** (`templates.routes.ts:441`): the same call.

`TemplateScanner.scanAndFix` then does `new PizZip(currentBuffer)`
(`server/services/document/TemplateScanner.ts:33`) and later
`zip.generate({ type: 'nodebuffer' })` (L66) — full in-memory inflate and re-deflate.
The only size control upstream is multer's `fileSize: 10 * 1024 * 1024`
(`templates.routes.ts:64`), which bounds the *compressed* upload. A ~10 MB DOCX can
inflate to many GB; `documentProcessingLimiter` (max 2 concurrent) bounds
concurrency, not memory, so two such uploads can OOM the instance.

The magic-byte check at `templates.routes.ts:258-263` already proves the buffer is a
ZIP (`50 4B 03 04`) before this point — so a hostile-but-well-formed archive passes
every existing gate.

### Preferred fix

Add a new validator and call it in both paths, immediately after the existing
`validateMagicBytes` call and **before** any scan/parse work.

Create `server/utils/zipLimits.ts` and **mirror `server/utils/magicBytes.ts`
exactly** as the donor pattern: a module-level constants block, one exported pure
function taking `(buffer, filename)`, `logger.warn` with structured context on
rejection, no thrown errors from the util itself. Return a small result object
(e.g. `{ ok: boolean; reason?: string; totalUncompressed: number; ratio: number }`)
rather than a bare boolean, because the caller needs the reason for its error
message and DOCH-6 will want the ratio.

Implementation notes:

- Read the ZIP central directory to sum declared uncompressed sizes **without
  inflating**. `pizzip` is already a dependency and `TemplateScanner` already uses
  it; prefer it over adding a new library. Entry metadata is available without
  calling `.asText()`/`.asNodeBuffer()` on entries — do not inflate to measure.
- Enforce both limits from the gate doc: max total uncompressed **256 MB** and max
  compression **ratio 100x**. Put both in named exported constants with the doc as
  a cited comment, and allow env overrides only if you mirror how
  `server/services/processingLimiter.ts:5` reads `MAX_CONCURRENT_DOC_PROCESSES`.
- Also reject entries whose names escape the archive root (`../`, absolute paths,
  drive letters). The gate doc's testing plan calls for this at
  `docx-editor-gate.md:70` and it is a 3-line addition in the same central-directory
  walk — bundling it here avoids a second pass over the same code.
- In both route handlers, on rejection: `await cleanupFile(req.file.path)` then
  `throw createError.validation(...)`. **Copy the exact shape of the adjacent
  magic-byte rejection** at `templates.routes.ts:260-263` (POST) and `:419-422`
  (PATCH), including the cleanup-before-throw ordering.
- Do not touch `TemplateScanner`. Keeping the check at the route boundary means one
  place to audit and no change to scanner semantics.

If a declared-size check turns out to be spoofable in a way that matters (a ZIP can
lie in its central directory), still land the declared-size check — then note the
residual risk in your report so a streaming-inflate cap can be ticketed separately.
Do not expand this ticket into streaming inflation.

### Ties

- Gate doc: `docs/hardening/docx-editor-gate.md` §2 (`:28`) and testing plan (`:68-70`).
- Parent epic: GitHub #169.
- **Sequencing: DOCH-3 must land before DOCH-4.** Both edit the same two blocks of
  `templates.routes.ts` (POST ~L256-263, PATCH ~L417-422). Do not run them in parallel.
- Load `add-api-endpoint` (route/service change) and `run-tests`.
- Donor pattern to copy: `server/utils/magicBytes.ts` + its two call sites.

### Acceptance criteria

1. `server/utils/zipLimits.ts` exists, exports named limit constants and one pure
   validation function, and inflates nothing.
2. A DOCX whose declared uncompressed total exceeds 256 MB is rejected on **POST**
   `/api/projects/:projectId/templates` with **400** and a validation message
   naming the uncompressed-size limit.
3. The same file is rejected identically on **PATCH** `/api/templates/:id`.
4. A DOCX whose compression ratio exceeds 100x is rejected with **400** on both paths.
5. A ZIP entry name containing `../` or an absolute path is rejected with **400** on
   both paths.
6. A normal, valid DOCX template still uploads and still PATCHes successfully —
   prove no regression by pointing at an existing green template-upload test.
7. On every rejection the multer temp file is cleaned up (no leak in `os.tmpdir()`)
   and no `templates` row is inserted/updated.
8. New unit tests for `zipLimits.ts` cover: oversized-uncompressed, high-ratio,
   traversal entry name, and a normal DOCX passing. Build the hostile fixtures
   programmatically with `pizzip` in the test — **do not commit a real ZIP bomb** to
   the repo.
9. New/updated integration test asserts criteria 2-5 through the real route with a
   real auth token (this is the live verification for this ticket).
10. `npm run type-check` → 0 errors; `npm run lint` on every touched file → 0
    problems; `npm run test:fast` green ≥ baseline; the template integration tests green.

---

## DOCH-4 — Add a wall-clock timeout to DOCX/PDF processing 🔲

**Priority: P1** · Size: M · Files: `server/utils/concurrency.ts` or new sibling util, `server/services/processingLimiter.ts`, `server/routes/templates.routes.ts`

### Finding

`docs/hardening/docx-editor-gate.md:30` requires:

```
-   [ ] **Timeout Enforcement:** Wrap all DOCX processing (parsing, regeneration) in
    `documentProcessingLimiter` or a strict timeout (e.g., 5s). Fail safe if processing hangs.
```

The code satisfies the letter of "wrap in `documentProcessingLimiter`" but not the
intent. `server/services/processingLimiter.ts` is only a semaphore:

```ts
export const documentProcessingLimiter = new ConcurrencyLimiter(MAX_CONCURRENT_DOCS);
```

and `ConcurrencyLimiter.execute` (`server/utils/concurrency.ts:26-36`) simply
`await fn()` in a `try/finally` — **no timer anywhere in the file**. So a hostile or
pathological document that makes `PizZip`/`Docxtemplater` spin does not fail; it
occupies one of only **2** concurrency slots (`processingLimiter.ts:5`) indefinitely.
Two such uploads deadlock all document processing for every tenant on the instance,
including PDF generation, with no error surfaced and no recovery short of a restart.

Affected call sites, all wrapping genuinely unbounded work:
`templates.routes.ts:282` (POST DOCX scan), `:307-311` (POST PDF unlock + field
extract), `:441` (PATCH DOCX scan), `:462-466` (PATCH PDF unlock + extract).

### Preferred fix

Add a real timeout and make it observable.

1. Add a `withTimeout<T>(fn, ms, label)` helper. Put it in
   `server/utils/concurrency.ts` next to `ConcurrencyLimiter` (same concern, same
   file, keeps the import surface small) unless that pushes the file over a lint
   complexity limit — in which case a sibling `server/utils/withTimeout.ts` is fine.
   It must reject with a distinguishable error type/code on expiry and always clear
   its timer in a `finally` so it never leaks a handle.
2. Compose rather than replace: keep `documentProcessingLimiter.run(...)` and wrap
   the inner function, so the semaphore slot is released when the timeout fires.
   Verify the slot is actually released — `ConcurrencyLimiter.execute`'s `finally`
   handles this, but assert it in a test.
3. Default the budget to a named exported constant, env-overridable following the
   exact `parseInt(process.env.X ?? 'default')` idiom already at
   `processingLimiter.ts:5`. The gate doc suggests 5s; that is tight for a 10 MB
   DOCX on a small Railway instance — pick a defensible default (**30s** is the
   reviewer's expectation), state your reasoning in your report, and make the doc's
   5s figure a comment rather than silently contradicting it.
4. On timeout, the routes must return **400** (client-supplied document could not be
   processed in budget) via `createError.validation`, clean up the temp file, and
   log at `error` with the label and elapsed ms. **Mirror the existing catch blocks**
   at `templates.routes.ts:300-304` (POST) and `:454-459` (PATCH), including their
   `isErrorWithCode(error) && error.code === 'VALIDATION_ERROR'` re-throw guard.
5. Apply it to all four call sites listed in the Finding. Do not apply it to PDF
   *generation* paths — `PdfConverter` is DOCH-5/DOCH-6's territory and Puppeteer
   needs its own budget; note it as follow-up instead.

### Ties

- Gate doc: `docs/hardening/docx-editor-gate.md:30`.
- Parent epic: GitHub #169.
- **Sequencing: run after DOCH-3.** Same two `templates.routes.ts` blocks; DOCH-3
  lands first and DOCH-4 rebases onto it.
- Load `add-api-endpoint` and `run-tests`.
- Related instrumentation the gate doc wants (`docx-editor-gate.md:59`, "Log duration
  of editor.save operations, alert on > 2s average") is **not** in scope; DOCH-6
  covers converter observability only.

### Acceptance criteria

1. A `withTimeout` helper exists with a named, env-overridable default budget
   constant and clears its timer in `finally`.
2. All four `documentProcessingLimiter.run(...)` call sites in
   `templates.routes.ts` are covered by the timeout.
3. A document whose processing exceeds the budget returns **400** with a message
   indicating a processing timeout, on both POST and PATCH.
4. On timeout the multer temp file is cleaned up and no `templates` row is
   inserted/updated.
5. On timeout the concurrency slot is released — a unit test proves that after N+1
   timed-out operations (N = max concurrency), a subsequent normal operation still
   runs rather than hanging. **This is the criterion most likely to be skipped; it
   is not optional.**
6. Normal uploads are unaffected: an existing green template-upload test still
   passes unchanged, and the timeout does not fire for a normal DOCX or PDF.
7. New unit tests cover: expiry rejects with the distinguishable error, success
   inside budget resolves normally, timer cleanup on both paths, and criterion 5.
8. Your report states the budget you chose and why, and confirms the gate doc's 5s
   suggestion is addressed in a comment rather than contradicted silently.
9. `npm run type-check` → 0 errors; `npm run lint` on every touched file → 0
   problems; `npm run test:fast` green ≥ baseline; template integration tests green.

---

## Phase 2 Gate

- [ ] DOCH-3, DOCH-4 both ✅ with dated verification notes
- [ ] `npm run type-check` → 0 errors; `npm run lint` → 0 errors
- [ ] `npm run test:fast` green ≥ baseline; `npm run test:integration` for template
      routes green
- [ ] `docs/hardening/docx-editor-gate.md` §2 zip-bomb and timeout boxes checked,
      with the implementing file cited next to each
- [ ] Reviewer has committed each passed ticket + this gate

---

# Phase 3 — Converter truthfulness & observability

Both tickets concern `PdfConverter` and the record it leaves behind. Out of scope:
actually deploying Gotenberg or flipping the production default (escalated), and
golden-fixture PDF comparison in CI (#168's larger ask — a separate initiative).

## DOCH-5 — Record which converter actually produced each PDF 🔲

**Priority: P1** · Size: M · Files: `server/services/document/PdfConverter.ts`, `server/routes/finalBlock.routes.ts`, `server/services/document/{DocumentEngine,EnhancedDocumentEngine,FinalBlockRenderer}.ts`, `server/services/workflow-runs/{RunLifecycleService,types}.ts`, `server/services/TemplatePreviewService.ts`

### Finding

The `run_generated_documents.pdf_strategy` column exists
(`shared/schema/run.ts:202`, `pdfStrategy: text("pdf_strategy"), // Added for DOC-107`)
— **so no schema change is needed** — but the value written to it is a hardcoded
constant, not an observation. Every type and default in the chain admits only one value:

- `server/routes/finalBlock.routes.ts:45` and `:64`:
  `pdfStrategy: z.enum(['puppeteer']).optional().default('puppeteer')`
- `pdfStrategy?: 'puppeteer'` at `DocumentEngine.ts:16`,
  `EnhancedDocumentEngine.ts:54` and `:119`, `FinalBlockRenderer.ts:61`,
  `RunLifecycleService.ts:31`
- Hardcoded literals at `FinalBlockRenderer.ts:341`
  (`pdfStrategy: 'puppeteer'`), `TemplatePreviewService.ts:175`, and
  `RunLifecycleService.ts:457` / `:477` (`options.pdfStrategy ?? 'puppeteer'`)

Meanwhile `PdfConverter` (`server/services/document/PdfConverter.ts:196-221`) has
**two** strategies and picks between them at construction:

```ts
if (process.env.PDF_CONVERTER_API_URL) {
    this.strategy = new ApiStrategy();      // Gotenberg / LibreOffice
    this.fallback = new PuppeteerStrategy();
} else {
    this.strategy = new PuppeteerStrategy();
    this.fallback = null;
}
```

and silently degrades on failure (`:213-219`):

```ts
logger.warn({ error }, 'API PDF conversion failed; falling back to local Puppeteer');
return this.fallback.convert(options);
```

`PdfConverter.convert` returns `Promise<void>` — it tells no caller which engine
won. So with Gotenberg configured, a document converted by Gotenberg is recorded as
`'puppeteer'`, and a Gotenberg document that silently fell back to the low-fidelity
Mammoth→HTML path is *also* recorded as `'puppeteer'` — indistinguishable from a
document that was never eligible for high-fidelity conversion.

Consequence: this is #168's "the system never silently returns a materially
different PDF" criterion, and it is currently unmet in the most damaging way — the
audit trail actively misreports fidelity. A customer disputing a generated legal
document cannot be told which engine produced it.

### Preferred fix

Make the converter report, and widen the type to admit the truth.

1. Introduce a shared exported union — `export type PdfStrategyName = 'gotenberg' | 'puppeteer'`
   — in `PdfConverter.ts` (it owns the concept) and import it everywhere the
   `'puppeteer'` literal type currently appears. Replace all six
   `pdfStrategy?: 'puppeteer'` annotations with it.
2. Change `PdfConversionStrategy.convert` / `PdfConverter.convert` to resolve with
   the strategy that succeeded (e.g. `Promise<{ strategy: PdfStrategyName; fellBack: boolean }>`),
   and thread that value to the `run_generated_documents` insert instead of the
   hardcoded literal. Follow the existing `pdfFailed` plumbing as the donor pattern
   — `FinalBlockRenderer.ts:363` already carries `pdfFailed: result.pdfFailed` from
   engine result to DB row; carry the strategy the same way.
3. Update the two `z.enum(['puppeteer'])` schemas at `finalBlock.routes.ts:45,64`.
   These are **request** schemas (a caller *requesting* a strategy), so keep the
   default `'puppeteer'` for backwards compatibility and add `'gotenberg'` as an
   accepted value; do not make the field required.
4. Distinguish fallback in the record. Prefer setting `pdfStrategy` to the engine
   that actually ran and recording the degradation separately (a `fellBack` flag in
   the row's existing jsonb/metadata, or reusing the adjacent `pdfFailed` semantics
   — pick one, state which and why). **Do not add a column**; if you conclude a
   column is genuinely required, that is a blocker to report, not a thing to do.
5. Keep the fallback *behavior* exactly as-is — falling back is correct; being quiet
   about it is the bug. Raise the log at `PdfConverter.ts:217` from `warn` to `error`
   and include both strategy names.

### Ties

- Parent epic: GitHub #168.
- **Depends on the uncommitted `ApiStrategy` implementation** — see the
  working-tree caveat at the top of this file. Verify it is present before starting.
- **Sequencing: DOCH-5 before DOCH-6.** Both touch `PdfConverter.ts`; DOCH-6's
  health check consumes the strategy names DOCH-5 introduces.
- Load `add-api-endpoint` and `run-tests`. **Do not** load `db-schema-change` — no
  schema change is in scope (the column already exists).
- `server/services/document/README.md:100` documents `pdfFailed` behavior and is
  **stale** regarding the Gotenberg→Puppeteer fallback (it doesn't mention it).
  Updating that paragraph is in scope for this ticket.

### Acceptance criteria

1. A single exported `PdfStrategyName` union exists and every former
   `pdfStrategy?: 'puppeteer'` annotation (6 sites listed in the Finding) uses it.
2. `PdfConverter.convert` resolves with which strategy succeeded and whether it fell
   back; no caller infers the strategy from an env var.
3. With `PDF_CONVERTER_API_URL` set and the API succeeding, the
   `run_generated_documents` row records `gotenberg`.
4. With `PDF_CONVERTER_API_URL` set and the API failing, the row records
   `puppeteer` **and** the fallback is distinguishable from a never-eligible
   conversion; your report states the mechanism chosen and why.
5. With `PDF_CONVERTER_API_URL` unset, the row records `puppeteer` and no fallback
   flag — existing behavior preserved.
6. The fallback log line is at `error` level and names both strategies.
7. `finalBlock.routes.ts` accepts `'gotenberg'` as a requested strategy and still
   defaults to `'puppeteer'` when the field is absent.
8. **No migration is added and `shared/schema/` is unmodified.**
9. New unit tests cover criteria 3, 4, and 5 by stubbing the two strategies — no
   real Gotenberg or Chromium needed.
10. `server/services/document/README.md`'s conversion section documents the
    two-strategy selection and the fallback's recorded outcome.
11. `npm run type-check` → 0 errors; `npm run lint` on every touched file → 0
    problems; `npm run test:fast` green ≥ baseline.

---

## DOCH-6 — Health-check the PDF converter and surface it 🔲

**Priority: P2** · Size: M · Files: `server/services/document/PdfConverter.ts`, `server/routes/health.ts`

### Finding

#168 requires "Converter health is checked at startup and surfaced in
readiness/admin status." Neither exists.

`server/routes/health.ts` checks exactly one dependency — the database
(`:61`, `await db.execute(sql\`SELECT 1 as health_check\`)`) — and its
`HealthCheckResponse` interface (`:32-43`) has no converter field. `/ready`
(`:95-113`) likewise checks only the DB. Nothing anywhere probes
`PDF_CONVERTER_API_URL`; there is no Gotenberg reference in `health.ts`, no
docker-compose service, and no `.env` entry that sets it — so today the variable
being wrong or the service being down is discovered only when a user's document
comes out in degraded fidelity (and, before DOCH-5, silently).

Consequence: the operator has no signal. Combined with DOCH-5's silent-fallback
recording, a misconfigured Gotenberg URL degrades every generated PDF indefinitely
with nothing to alert on.

### Preferred fix

1. Add a `healthCheck()` to `PdfConverter` returning the configured primary strategy
   name plus a reachability result. For `ApiStrategy`, probe Gotenberg's own health
   endpoint (`GET {PDF_CONVERTER_API_URL}/health`) with a **short** timeout (2-3 s) —
   never convert a document as a health probe. When no API URL is configured, report
   the local Puppeteer strategy as the primary and do not report an error; that is a
   valid production posture today.
2. Surface it in `health.ts` following that file's **existing structure exactly**:
   add a `pdfConverter` field to `HealthCheckResponse` shaped like the `database`
   field (`connected`/`responseTime`/`error`), populate it in the same `try` style,
   and reuse the existing `degraded` semantics — a configured-but-unreachable
   converter is **`degraded` (HTTP 200), not `unhealthy`**, because documents still
   generate via fallback.
3. Follow `health.ts:71-78`'s security discipline: log the real error server-side
   with `logger.error` and return a generic message. `/health` is unauthenticated —
   **do not** leak the Gotenberg URL, hostname, or raw error into the response body.
4. Leave `/ready` and `/live` alone: the converter is not required for the process to
   accept traffic, and adding it to `/ready` would take the app out of the load
   balancer for a degraded-but-working dependency.
5. Add a startup log line (not a startup failure) recording the selected strategy, so
   the boot log answers "which converter is this instance using?".
6. Add the operational note to `server/services/document/README.md`: the env var,
   what degraded means, and how to read the health field.

### Ties

- Parent epic: GitHub #168 (health-check criterion only).
- **Sequencing: run after DOCH-5** — consumes its `PdfStrategyName` union. Same file.
- Load `add-api-endpoint` and `run-tests`.
- Donor pattern: the `database` block of `health.ts` (`:51-78`) — copy its shape,
  its degraded-vs-unhealthy logic, and its error-redaction comment style.
- Out of scope: an admin-UI surface for this, and Gotenberg deployment itself.

### Acceptance criteria

1. `PdfConverter.healthCheck()` exists, reports the configured primary strategy, and
   probes the API strategy's health endpoint with a timeout ≤ 3 s without converting
   a document.
2. `GET /health` includes a `pdfConverter` field naming the active strategy.
3. With no `PDF_CONVERTER_API_URL`: status stays `healthy`, the field reports the
   local strategy, and **no** error is reported.
4. With `PDF_CONVERTER_API_URL` set and reachable: status `healthy`, field reports
   the API strategy plus a response time.
5. With `PDF_CONVERTER_API_URL` set and unreachable: overall status is `degraded`
   with **HTTP 200**, not `unhealthy`/503.
6. The response body contains no converter URL, hostname, or raw error text; the
   real error appears only in server logs. Assert this in a test.
7. `/ready` and `/live` responses are byte-identical to before this ticket.
8. A startup log line records the selected converter strategy.
9. New tests cover criteria 3, 4, 5, and 6 with the probe stubbed — no real
   Gotenberg required.
10. `npm run type-check` → 0 errors; `npm run lint` on every touched file → 0
    problems; `npm run test:fast` green ≥ baseline.

---

## Phase 3 Gate

- [ ] DOCH-5, DOCH-6 both ✅ with dated verification notes
- [ ] `npm run type-check` → 0 errors; `npm run lint` → 0 errors
- [ ] `npm run test:fast` green ≥ baseline
- [ ] `GET /health` verified live against the running dev server in both
      converter-configured and unconfigured states (load the `verify` skill)
- [ ] `shared/schema/` untouched across the whole phase; `git diff --stat` proves it
- [ ] Reviewer has committed each passed ticket + this gate

---

## Backlog / observations

Not phase-gated. Verified but too small or too speculative to dispatch yet.

- **DOCH-B1 — XXE hardening.** `docs/hardening/docx-editor-gate.md:29` requires
  disabling external entity resolution in XML parsers. Needs an inventory of which
  parsers are actually reachable from user content (`pizzip`/`docxtemplater` in
  `TemplateScanner`, `mammoth` in `PuppeteerStrategy`, whatever `TemplateParser`
  uses) before a fix can be specified. Ticket this after the inventory.
- **DOCH-B2 — `DocxSanitizer` is fully written and never used.**
  `server/services/document/DocxSanitizer.ts` (374 lines, singleton exported at
  `:373`) strips `word/vbaProject.bin`, ActiveX, embeddings and external
  relationships, and exposes a cheap `needsSanitization()` pre-check — but it is
  **imported nowhere outside its own file**, so `docx-editor-gate.md:23`'s macro-
  stripping requirement is unmet despite the code existing. Wiring it into both
  ingestion paths looks like a small ticket, but it **mutates the stored template**
  (it re-zips at compression level 9 and can remove `customXml/`, which some real
  templates legitimately use), so it needs a decision from Shawn on
  sanitize-vs-reject before dispatch. **Do not dispatch as a "just wire it up"
  ticket.**
- **Two ZIP libraries in one pipeline.** `DocxSanitizer` uses `jszip`;
  `TemplateScanner` uses `pizzip`. Consolidating would shrink the attack surface and
  the bundle, but it touches working code with no current defect. Low priority.
- **Puppeteer conversion has no timeout.** DOCH-4 deliberately excludes PDF
  generation. `PuppeteerStrategy.convert` (`PdfConverter.ts:67-149`) awaits
  `page.setContent(..., { waitUntil: 'networkidle0' })` with no budget, on a shared
  browser instance. Worth its own ticket after DOCH-4 establishes the helper.
- **`docs/hardening/docx-editor-gate.md` is still marked `Status: Draft`** while
  being cited as a blocking gate. Someone should own promoting or retiring it.
