# Roadmap epics (GH-146..174) — retired 2026-08-18

The board was `tickets/ROADMAP_TICKETS.md`, opened 2026-08-09 from the 23
competitive-audit GitHub issues. **20 of 27 tickets closed.** Recover the full
text of anything below with:

```bash
git log -p -- tickets/ROADMAP_TICKETS.md
```

## Why it retired with 7 items open

The remaining seven were never dispatchable. They are **epics, not tickets** —
the competitive audit that produced them wrote against the product's *intended*
shape, not the codebase, so they carry no `file:line` evidence and their sizing
is uniform (every one Size L or M with no decomposition).

Measured 2026-08-18, **5 of the 6 file paths the open epics cite do not exist**:

| Epic | Cites | Present? |
|---|---|---|
| GH-164 | `client/src/pages/runner/KioskRunner.tsx` | ❌ |
| GH-165 | `client/src/pages/EasyMode.tsx` | ❌ |
| GH-166 | `client/src/pages/BuilderPage.tsx` | ❌ |
| GH-172 | `server/services/document/OcrService.ts` | ❌ |
| GH-173 | `client/src/templates/` | ❌ |
| GH-172 | `server/services/document/PdfService.ts` | ✅ |

**Promoting any of these means a fresh audit first, not a re-read.** The Finding
has to be rewritten against real code before it can be a ticket. That is the
whole reason they are parked rather than carried.

GH-174 was **not** parked — it is a real, evidence-backed ticket and was carried
into the active initiative that now owns docs. See "Carried out, not parked".

---

## Closed — do not re-file

Twenty epics shipped. Re-auditing any of these areas will surface work that was
deliberately done; check here before filing it as new.

| Epic | Delivered |
|---|---|
| GH-169A | Real clamd virus-scanner client, fail-closed on every error path |
| GH-169B | Storage init fixed, signed URLs served, S3 provider hardened |
| GH-168 | High-fidelity DOCX→PDF conversion as the production default |
| GH-156 | Document mappings persisted in a guided mapping workbench |
| GH-170 | Document delivery destinations with retries and audit status |
| GH-157 | Production DocuSign envelope lifecycle |
| GH-149 | Legal delivery integrations packaged (Clio, e-sign, payments) |
| GH-160 | Resilient autosave, offline buffering, conflict recovery |
| GH-146 | Repeaters, loop groups and file uploads in the runner |
| GH-147 | Save-and-resume, assignment, staff/client handoff |
| GH-158 | Workflow branding and white labeling across the runner |
| GH-159 | WCAG 2.2 AA conformance for builder and runner |
| GH-154 | Conditional logic editing unified across the builder |
| GH-153 | Visual workflow map with deterministic path simulation |
| GH-152 | Publish gate extended to document readiness and provider availability |
| GH-167 | Document-to-interview onboarding with field/question generation |
| GH-161 | Answer piping and dynamic content (delivered by TPL-7, 2026-08-10) |
| GH-162 | Review improved for structured values and conditional visibility |
| GH-171 | Document template versioning + dependency impact analysis (2026-08-11) |
| GH-155 | Final-document authoring configurability |

Also closed as **observations**, recorded so they are not rediscovered:

| Was | Outcome |
|---|---|
| O-2 | `BASE_URL`/`VITE_BASE_URL` now `https://www.ezbuildr.com`; Railway service domain renamed `vaultlogic-production` → `ezbuildr-production`. Closed 2026-08-13. |
| O-3 | S3 adopted in production (`STORAGE_DRIVER=s3`, bucket `integrated-flask`), provider proven live before the flip; old volume contents abandoned as test data. Closed 2026-08-04. **The stale `DEBT-OPS1` index entry contradicting this already misled one reviewer — do not re-file.** |
| O-6 | Corrected, then closed. The "two duplicate `BrandingProvider`s" claim was **wrong** (the audit grep filtered out the importer). Only `components/providers/BrandingProvider.tsx` was genuinely dead; deleted. `branding/BrandingContext.tsx`, `hooks/useResolvedBranding.ts` and `components/intake/*` are all **live** — deleting them removes working buttons from two settings pages. |
| O-9 | Preview renders the same server-resolved branding as production. Closed 2026-08-05. |
| O-12 | The `/intake/*` parallel run pipeline deleted (1,407 lines). **`workflows.intakeConfig`, `prefillFilter.ts` and `CaptchaService` were deliberately KEPT** — the first is a live security control feeding `filterPrefillValues`, the last serves login/registration captcha. Six now-inert `IntakeConfig` fields were deliberately left because `IntakeConfigSchema` is `.strict()` and removing them would make stored configs fail to parse and **silently switch prefill off**. |
| O-17a | `GEMINI_MODEL` pinned to a zero-quota model. Substantially resolved by the AI Service Layer initiative — `AISL-5` removed the hardcoded `gemini-1.5-pro` from transform generation/revision, and the residual was diagnosed as **a Gemini account quota problem, not configuration**. See `backlog/AI_SERVICE_LAYER.md`. |

---

## Carried out, not parked

**GH-174 — Align feature documentation with executable product status**
(P2 · Size S) is a real ticket: its cited files (`docs/claude/FEATURES.md`,
`docs/INDEX.md`, `README.md`) all exist, and it is the only open roadmap item
with evidence behind it.

It moved to **`SECT-10`** on the Sections-above-Pages board, because the
`sections` → `pages` rename (SECT-1) rewrites the vocabulary of every document
GH-174 would touch. Doing it before the rename means doing it twice.

**Shipped 2026-08-24** as SECT-10 (`0b175796`); that board has since retired
into [`SECTIONS_AND_PAGES.md`](SECTIONS_AND_PAGES.md). GH-174 is therefore
closed — do not re-file it. Two documentation follow-ups it deliberately did not
absorb are parked as `SECT-B14` (dead links in two closed security audit
records) and `SECT-B15` (~26 documents still branded "VaultLogic").

---

## Parked entries

### The six epics

Each needs a fresh audit before it can be ticketed. Recorded here at one
paragraph so the *intent* is not lost; the original text is in git history.

- **GH-163 — payment, scheduling, ranking and matrix interview blocks.**
  P2 · L · `needs-initiative`. Four new step types in one epic. This repo has an
  `add-step-type` skill precisely because a step type touches ~10 files, so each
  block is its own ticket at minimum. Note the step-type enum is one of the
  surfaces the SECT rename does **not** touch, so this is not blocked by it —
  only by needing a real audit.

- **GH-164 — mobile-first kiosk mode for participant interviews.**
  P2 · M · `needs-initiative`. Cites a `KioskRunner.tsx` that has never existed.
  Overlaps SECT-8, which restructures the runner layout shell and adds a
  responsive nav; kiosk mode should be specified *after* that lands or it will
  be written against a shell that is about to change.

- **GH-165 — Easy Mode as a guided Questions-to-Publish workflow.**
  P2 · M · `needs-initiative`. Cites a non-existent `EasyMode.tsx`. Easy/Advanced
  mode is real (`workflows.modeOverride`, `client/src/lib/mode.ts`) but there is
  no such page. ⚠️ Read `CLAUDE.md` convention 8 before auditing this: builder
  `mode` sat at its `"easy"` default for months because it was mirrored into a
  zustand store nobody wrote to, making every Advanced branch unreachable. Any
  Easy Mode audit must establish what is actually reachable before proposing work.

- **GH-166 — builder usable at tablet and mobile widths.**
  P2 · M · `enhancement`. Cites a non-existent `BuilderPage.tsx` (the real page is
  `client/src/pages/WorkflowBuilder.tsx`). Directly overlaps SECT-5/SECT-6, which
  rework the outline and page canvas; specify after Phase 2 of that board.

- **GH-172 — PDF/OCR extraction and broader template formats.**
  P2 · L · `needs-initiative`. Cites a non-existent `OcrService.ts`;
  `PdfService.ts` does exist. The only open epic with **no** collision against
  the SECT initiative, so it is the one that could be audited at any time.

- **GH-173 — legal drafting primitives and curated workflow templates.**
  P2 · M · `needs-initiative`. **Substantially delivered by two other
  initiatives** — the Legal Drafting board (LD-1/LD-2, retired 2026-08-18,
  `backlog/LEGAL_DRAFTING.md`) shipped the drafting primitives, and the Template
  Marketplace board (TM-1/TM-2 done) shipped the curated catalog. Curated content
  lives at `templates/curated/<slug>/`, not the `client/src/templates/` this epic
  cites. **Do not re-audit this as if it were untouched.** What remains of it is
  tracked as TM-3..TM-5 on the marketplace board.

### Observations

- **GH-O1 — production runs placeholder `JWT_SECRET` / `SESSION_SECRET`.**
  `operational`. The prod service has both set to the literal example strings
  from `.env.example`, which are committed to a public repo.
  **⚠️ The repo owner has ruled these deliberate placeholders. Do NOT re-file
  this as a security finding** — it has been raised and settled more than once
  (see also `ENVIRONMENTS_AND_RLS_TICKETS.md` ENV-3 AC2). Recorded here only so
  the next auditor recognizes it as settled rather than new. Rotating them
  invalidates all existing sessions and refresh tokens; it is a Railway variable
  change, no code.

- **GH-O4 — `outputFileExists()` bypasses the storage provider.**
  `enhancement`. **⚠️ Its stated precondition has now fired.**
  `server/services/templateFiles.ts` does a raw `fs.access` on `OUTPUTS_DIR`
  with the comment *"Outputs are still local-only for now"*. The original entry
  said this "becomes a correctness bug the moment O-3 happens" — **O-3 closed
  2026-08-04**, production runs `STORAGE_DRIVER=s3`. This is the highest-value
  entry in this file and the first candidate for promotion.

- **GH-O5 — `pingClamd` assumes an unsplit `PONG`.** `enhancement`.
  `server/services/security/VirusScanner.ts` resolves `false` as soon as any
  non-`PONG` bytes arrive, so a `PONG\0` split across TCP segments misreports the
  scanner as unhealthy. Harmless today (clamd writes it atomically; worst case is
  a misleading boot log). Fix: wait for a NUL/newline terminator before classifying.

- **GH-O7 — white-label cannot be plan-gated until individuals can buy plans.**
  `needs-initiative`. `custom_branding` is declared on Team/Enterprise in
  `server/lib/billing/billingConfig.ts` and read by nothing. `subscriptions` is
  keyed solely by `organizationId`, so gating today would permanently deny
  white-label to every user-owned and legacy-NULL workflow. GH-158 therefore
  shipped the toggle **ungated** (decision D3). ~5 lines once `subscriptions` can
  point at a user. `tenants.plan` is a third, vestigial signal — set by nothing,
  read by nothing. **Do not build on it.**

- **GH-O8 — there is no project-level branding.** `product-decision`.
  GitHub #158 asked to resolve tenant, project and workflow branding, but
  `projects` has no branding column and one tenant has many organizations, so
  where a project tier would sit is genuinely ambiguous. Needs a schema change
  and an ownership ruling.

- **GH-O10 — email, custom domains and the signature-transition screen are still
  unbranded.** `enhancement`. The remaining GH-158 acceptance criteria, all cheap
  now that `BrandingService.resolveForWorkflow()` is the single entry point.

- **GH-O11 — the tenant branding preview previews a fake form.**
  `product-decision`. `/intake/preview` renders `IntakeDemo`: a hardcoded 3-step
  name/email/phone/message mock ending in `alert('Form submitted! (This is a
  demo)')`, themed by a parallel `Themed*`/`IntakeLayout` stack (~1,040 lines) no
  participant ever sees. Since GH-158 the real runner brands itself through the
  design system's CSS custom properties, so the preview shows authors something
  that is **not** what their clients get. Options: (a) re-point at the real runner
  chrome and delete the `Themed*` stack — recommended; (b) delete the route and
  the two settings-page buttons that link it; (c) leave it. Needs the repo
  owner's call: (b) removes a feature, (a) is a rebuild.

- **GH-O15 — `totalGenerated` counts output *files*, not documents.**
  `informational`. `FinalBlockRenderer.render` returns
  `totalGenerated: documents.length`, so a one-template run emitting DOCX+PDF
  reports `totalAttempted: 1, totalGenerated: 2`. Defensible (it matches the
  `documents[]` array it accompanies) but the two fields no longer measure the
  same unit. Only logging and the render response consume it.

- **GH-O16 — two redirect paths, only one hardened.** `enhancement`.
  `client/src/components/runner/sections/FinalDocumentsSection.tsx` validates only
  the protocol, while `client/src/pages/WorkflowRunner.tsx` routes its redirect
  through `getSafeRedirectUrl`. Author-controlled and the same trust level as
  `customLinks`, so severity is low, but the two should converge on the hardened
  helper. Related to the closed SEC-033 ruling on e-sign `redirectUrl`.

- **GH-O18 — no automated test exercises a real AI provider call.**
  `enhancement`. `tests/integration/ai/documentOnboarding.test.ts` and
  `api.ai.test.ts` `vi.mock` `createAIServiceFromEnv` — right for CI determinism,
  but it means a provider-side break (the O-17a class of failure) is invisible to
  the entire suite. Worth an env-flag-gated smoke check rather than un-mocking.

- **GH-O19 — the Final Documents inspector's `draftConfig` snapshot never
  re-syncs.** `enhancement`. *(Filed in the source file as a second `O-17`, an ID
  collision with the Gemini entry; renumbered here.)*
  `FinalDocumentsSectionEditor` seeds a `draftConfig` from server state once on
  mount and spreads it into every `PATCH`. That deliberately fixes a real
  lost-update bug — with 5+ fields, consecutive edits spreading a not-yet-refetched
  `config` dropped each other — but it means a concurrent edit from another
  collaborator is overwritten wholesale by this panel's next write.

---

## Process lessons

- **An audit written from a product's intended shape produces epics, not
  tickets.** Every one of the 23 competitive-audit issues arrived Size L with no
  `file:line` evidence, and 5 of the 6 that survived to retirement cite files
  that have never existed. The tickets that shipped are the ones a reviewer
  re-derived against real code first. Treat an externally-sourced issue list as
  *input to* an audit, never as its output.

- **Counters drift; recount from headings.** The board's OVERALL line read 17/27
  against 18 ✅ headings and was corrected 2026-08-09. Do not increment a
  progress counter — recount it.

- **A "closed" entry in one file and a "live incident" entry in the index can
  coexist for months.** `DEBT-OPS1` claimed `STORAGE_DRIVER=s3` was unset long
  after O-3 closed it, and a reviewer cited it as a live production incident.
  When closing an observation, fix the index entry in the same commit.
