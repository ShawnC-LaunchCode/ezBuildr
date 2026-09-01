# Zero-retention / ephemeral runs (ZR) — parked client ask

**This is not a retired initiative.** Nothing has been dispatched, no audit has
been run, and no ticket exists. It is a **client ask, recorded with evidence so
the next reader does not have to re-derive the surface area.** Filed 2026-09-01.

## The ask (as stated by the repo owner)

A client wants ezBuildr used with **nothing retained that could later be
subpoenaed**. Specifically:

- The **workflow** the ezBuildr user builds is saved as normal — that is the
  ezBuildr user's own work product and stays.
- The **run** is not. No answers, no client data, and **no copy of any document
  generated from those answers** may survive the session.
- End users must still be able to **generate their documents** during the
  session.

## Why it is parked

Two independent reasons, and both must clear before this is dispatchable:

1. **It needs a ruling on the erasure boundary before any code** (`ZR-B2`).
   "Nothing that could be subpoenaed" is a legal statement about custody, not a
   technical one. Whether it covers analytics counters, the ESP's copy of a
   delivery email, an AI provider's prompt logs, or the external PDF converter
   changes the design completely — and some of those are not ezBuildr's to
   delete.
2. **It is Size L and spans every layer** (`ZR-B1`). Run persistence is not one
   table with an off switch; it is fourteen tables plus a blob store plus four
   third-party egress paths, and none of them has a "don't write" mode today.

---

## ZR-B1 — Ephemeral run mode · `needs-initiative`

### What exists today

Every run writes, unconditionally. There is no flag, no mode, and no branch
anywhere that suppresses a run write. The persisted surface, all in
`shared/schema/run.ts` unless noted:

| Table | Line | What it holds that is client data |
|---|---|---|
| `workflow_runs` | `run.ts:48` | `clientEmail`, `metadata` jsonb, `visitedPageIds`, `portalAccessKey` |
| `step_values` | `run.ts:145` | **every answer**, as jsonb, one row per step |
| `run_generated_documents` | `run.ts:220` | `fileName`, `fileUrl`, `storageKey`, `unresolvedVariables` — plus the **bytes**, in `DiskStorageProvider`/`S3StorageProvider` (`server/services/storage/`) |
| `run_document_deliveries` | `shared/schema/document_delivery.ts:24` | recipient + delivery state for each generated document |
| `run_resume_links` | `run.ts:94` | `recipientEmail` (the hash is of the token, not the email) |
| `transform_block_runs` | `run.ts:238` | `outputSample` — **derived answer data by design** |
| `script_execution_log` | `run.ts:253` | `inputSample`, `outputSample`, `consoleOutput` — likewise |
| `workflow_run_events` | `run.ts:274` | `payload` jsonb per event |
| `workflow_run_metrics` | `run.ts:291` | aggregates keyed to the run |
| `review_tasks` | `run.ts:160` | reviewer-visible run state |
| `signature_requests` / `signature_events` | `run.ts:183` / `:209` | signer identity and audit trail |
| `template_generation_metrics` | `run.ts:309` | per-generation record |
| `audit_logs` / `admin_access_log` | `shared/schema/auth.ts:327` / `:356` | actor + target rows |
| `email_queue` | `shared/schema/integrations.ts:185` | queued message bodies |

`step_values` is upserted on autosave (`StepValueRepository.ts:117`,
`onConflictDoUpdate`), so answers land row-by-row as the respondent types — an
abandoned run is already persisted client data.

### Third-party egress — data leaves the process regardless of the DB

Deleting rows does not cover these, and three of them are outside ezBuildr's
custody entirely:

- **PDF conversion.** `PDF_CONVERTER_API_URL` posts the rendered document to an
  external converter. The document body leaves the box on every PDF.
- **AI providers.** Runs call AI (see `AISL-B9` in `backlog/AI_SERVICE_LAYER.md`
  — anonymous public-link runs call it untenanted), which means answer text can
  appear in a provider prompt.
- **The ESP.** Any emailed document leaves a copy at SendGrid and in the
  recipient's mailbox.
- **DocuSign.** An envelope is a durable third-party record by construction.

An honest zero-retention mode probably has to **disable** several of these in
that mode rather than clean up after them.

### Preferred shape (a sketch, not a Preferred fix — this needs its own audit)

A **workflow-level `retention` setting** (persisted on the workflow, so it is
the ezBuildr user's authored choice and travels with publish/export/import),
read once at run creation and carried on the run, gating every write at the
**persistence seam** — `server/services/runs/RunPersistenceWriter.ts` is the
obvious chokepoint to audit first — rather than sprinkled through callers.

Two candidate models, and picking between them is most of the design work:

- **(a) Never write.** Run state lives in server memory (or a TTL'd cache) for
  the session; documents are streamed to the browser and never stored. Strongest
  guarantee, but it structurally removes save-and-resume, portal access, review
  tasks, e-signature and multi-device runs — the client must accept that.
- **(b) Write, then shred.** Normal persistence, then a guaranteed purge at
  completion/abandonment. Far cheaper and keeps every feature, but it is
  materially weaker for the stated legal purpose: the data existed, was on disk
  and in WAL, and — on Neon — is inside **point-in-time-restore history and
  branch snapshots**, which a purge does not touch. Worth saying out loud to the
  client before it is chosen.

**Next step:** get the `ZR-B2` ruling, then run a real Stage-1 audit of the
persistence seam and write a phased board. Do not promote this to a single
ticket.

---

## ZR-B2 — What "nothing stored" is required to cover · `product-decision`

The ask cannot be specified without a ruling on each of these, because they have
different answers and different costs:

1. **Analytics and metrics** — `workflow_run_metrics`, `block_metrics`,
   `metrics_events`, `template_generation_metrics`. Aggregate counts are not
   client data in any ordinary reading, but they are keyed to a run id. Keep,
   anonymise, or drop?
2. **Audit logs** — `audit_logs`, `admin_access_log`. These exist for security.
   Suppressing them for one workflow weakens a control that protects everyone
   else on the tenant.
3. **Third-party copies** — PDF converter, AI provider, ESP, DocuSign (see
   `ZR-B1`). Are these in scope? If yes, the mode must disable the features.
4. **Backups and PITR** — Neon point-in-time restore and branch snapshots retain
   deleted rows for the retention window. Under model (b) this is the gap that
   defeats the whole purpose; under model (a) it is a non-issue.
5. **The strength of the promise** — is the deliverable "we do not retain" (a
   product behaviour) or "we cannot produce it" (a technical guarantee the
   client's counsel can rely on)? These are different products.

**Next step:** the repo owner rules, ideally with the client's counsel on
questions 3–5. Everything in `ZR-B1` is blocked on this.

---

## ZR-B3 — There is no way to delete a run · `enhancement`

Independent of the client ask, and the cheapest partial answer to it.

**Verified 2026-09-01.** `grep -rn "deleteRun\|purgeRun\|removeRun" server/ client/src/`
returns **nothing**. The only run-scoped deletes that exist are narrower:

- `DELETE /api/runs/:runId/documents` — `server/routes/runs.routes.ts:917`
- `DELETE /api/runs/:runId/steps/:stepId/files` — `server/routes/runs.routes.ts:370`

A run and its answers disappear **only** as collateral of deleting the parent
workflow, via the `workflowId` FK cascade at `shared/schema/run.ts:50`. There is
no per-run delete in the API, no service method, and nothing in the UI.

There is also **no retention sweeper**: `server/cron.ts` schedules exactly two
jobs — `cleanupExpiredTokens` (`cron.ts:12`) and `cleanupTempFiles`
(`cron.ts:23`). Nothing ages out run data.

So today a tenant cannot honour a deletion request for one client's run without
deleting the workflow every other client also ran.

**Next step:** promotable on its own as a normal ticket — a tenant-scoped
`DELETE /api/runs/:runId` that cascades the tables above **and** removes the
blobs from the storage provider, using the `add-api-endpoint` skill's 3-tier
pattern. Note the FK graph is already `onDelete: 'cascade'` from `workflow_runs`
for most children, so the DB half is mostly free; the storage-provider half is
not, and `GH-O4` (`backlog/ROADMAP.md`) warns that at least one file path does a
raw `fs.access` instead of going through the storage provider.

---

## Notes for whoever picks this up

- **A client-side preview shell already exists** and is *not* a foundation for
  this: `client/src/components/preview/PreviewRunner.tsx` +
  `client/src/lib/previewRunner/PreviewEnvironment.ts` keep run state in the
  browser, but document generation is server-side
  (`server/services/document/DocumentEngine.ts`), so the preview path proves
  nothing about the real requirement.
- **Re-verify before promoting.** These line numbers were accurate on
  2026-09-01; anchor on the quoted symbols, per the ticket-flow rule.
- Check `ZR-B1`'s table against the schema before designing — `shared/schema/run.ts`
  has grown repeatedly, and a new run-scoped table would be a silent leak.

## Closed — do not re-file

Nothing yet; no ZR work has been dispatched.
