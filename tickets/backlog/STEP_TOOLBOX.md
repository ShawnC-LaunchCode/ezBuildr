# Canonical Step Toolbox (STB) — retired 2026-09-03

**All 28 tickets shipped** (STB-1..24, including 3A/3B/3C and 15A), across six phase gates. The platform went
from storing several dialects for the same question family — `short_text` / `text`, `yes_no` / `true_false` /
`boolean`, `radio` / `multiple_choice` / `choice`, and a `*_advanced` twin for almost everything — to **one
stored toolbox of 18 canonical types**, enforced by the database enum itself.

The arc: contain new drift (Phase 0) → canonicalize each family (Phase 1–2) → make every write boundary strict
(Phase 3) → backfill stored data with an audited, transactional converter (Phase 4) → delete the enum values and
every transition branch (Phase 5).

Recover any closed ticket's Finding, acceptance criteria and dated verification notes with:

```bash
git log -p -- tickets/STEP_TOOLBOX_TICKETS.md
git log -p -- tickets/STB_REVIEWER_HANDOFF.md
```

Those keep working after the files' deletion; they are the recovery path for everything summarised here.

---

## Standing decisions — still binding

Settled by the repo owner across the initiative. Re-litigating one is an automatic send-back.

| # | Decision |
|---|---|
| **D-1** | **One stored toolbox.** The canonical types are `text`, `boolean`, `phone`, `date_time`, `choice`, `email`, `number`, `scale`, `website`, `address`, `multi_field`, `display`, `file_upload`, `list`, `js_question`, `computed`, `final_documents`, `signature_block`. Nothing else may be stored. |
| **D-2** | **Mode is exposure, not identity.** Easy and Advanced never produce different stored type names. Switching modes hides or reveals settings; it never rewrites config or runner behaviour. |
| **D-3** | **Easy keeps friendly presets.** Short Text, Long Text, Yes/No, True/False, Date, Time, Date/Time, Single Select, Multiple Choice, Number, Currency and File Upload are **preset ids and labels**, not persisted types. |
| **D-4** | **Balanced Easy settings.** Easy exposes common content, validation, layout, Other and upload controls. Storage aliases, dynamic sources, randomization and detailed numeric formatting stay Advanced. |
| **D-5** | **Strict final boundaries.** APIs, AI, template ingest and portability imports **reject** retired type names and unknown/removed config keys. They do not normalize them silently. |
| **D-6** | **Boolean checkbox means consent.** It displays `trueLabel`; a required consent checkbox must be checked. String storage uses `trueAlias`/`falseAlias`, never the presentation labels. |
| **D-7** | **Choice values stay primitive.** Other stores direct strings/string arrays. Option order is deterministic per run, stable on revisit, different across runs, and keeps Other last. |
| **D-8** | **Numeric storage stays numeric.** Number/currency controls persist `number \| null`. ISO currency formatting owns symbols and fraction rules; custom prefix/suffix are plain-number-only. |
| **D-9** | **Upload previews are display-only.** Preview images and page one of PDFs; never persist generated thumbnails. |
| **D-10** | **Display stays Markdown-only.** Raw HTML was removed, not sanitized into a new feature. |
| **D-11** | **Deferred means absent.** Country restrictions/defaults, timezone controls, respondent email verification and DNS validation stay out of active types/schemas/AI until separately implemented end to end. |
| **D-12** | **Backfill before enum deletion.** Canonical code lands first; an idempotent, audited backfill reaches zero legacy data; enum removal follows in its own migration. |
| **D-13** | **Precision is display, never storage.** `validation.precision` controls how many decimals a number is *shown* with. It never rounds, truncates or rejects what is stored — legal work mixes dollar- and cent-rounded figures, and the workflow author owns the arithmetic. A field showing `23.15` while storing `23.148` is correct. Pinned by `tests/integration/number-canonicalization.test.ts`. |
| **D-14** | **Currency uses cents-style entry.** Typed digits fill from the right, so `2314` reads as `23.14` — over-precision is unrepresentable rather than an error state. The stored value stays a decimal `number`, never cents-as-integer. |

**Read-compat is the house pattern.** Retired names remain **readable** — `LEGACY_STEP_ADAPTERS` /
`adaptLegacyStep` in `shared/types/stepConfigs.ts` map all 19, plus `signature`, which the enum never permitted
but graph JSON can still carry. They stopped being **writable**: the `step_type` enum refuses them at the
database, and `validateCanonicalStepConfig` refuses them at every API/AI/ingest/import boundary.
`validateStepConfig` is the permissive read path and **must never be tightened** — that was broken three times
during this initiative and each time cost a review round.

---

## Parked entries

### STB-B1 — International phone and address controls
**Tag:** `needs-initiative`. Country restrictions, default country and non-US address shapes were deliberately
left out (D-11). `AddressConfigSchema` is `country: z.literal('US')` with a fixed `fields` tuple, so
internationalisation is a schema change plus authoring UI, not a config toggle.

### STB-B2 — Timezone-aware Date/Time semantics
**Tag:** `product-decision`. `date_time` stores what the respondent typed with no timezone. Deciding whether a
date means "the respondent's local day" or "a UTC instant" changes stored meaning for existing answers, so it
needs an owner ruling before code.

### STB-B3 — Respondent email verification
**Tag:** `needs-initiative`. `email` validates shape only. Verifying a respondent actually controls the address
is a delivery + token flow, not a validator.

### STB-B4 — DNS-backed website validation
**Tag:** `enhancement`. `website` validates URL shape only. Resolving the host would need `safeFetch`-style SSRF
protection and an outbound-call budget.

### STB-B6 — `sanitizeStepValue` and `validateStepValue` are dead, and they look usable
**Tag:** `informational`, and the most likely to bite. Both are exported from `server/utils/stepConfigUtils.ts`,
read step configs, enforce range/precision/type rules — and **neither is referenced from anywhere**. The live
submit path is `RunPersistenceWriter -> getValidationSchema` in `shared/validation/BlockValidation.ts`.

This is an attractive nuisance rather than ordinary dead code: STB-9 "aligned precision" inside
`sanitizeStepValue`, a precision-2 field stored `1.239`, and 3,544 unit tests passed — only the vertical proof
caught it. Resolve by wiring them into the submit path deliberately (a behaviour change touching every step
type, so its own ticket) or by deleting them. **Do not leave them looking usable.**

### STB-B7 — Nothing catches an AI exclusion that has become unnecessary
**Tag:** `informational` now that STB-16 shipped. `TEMPORARY_CONFIG_KEY_EXCLUSIONS` hides config keys with no
behaviour behind them. Two drift guards exist (an exclusion naming a nonexistent field throws at module load;
manifest drift fails `tests/unit/shared/aiVocabulary.test.ts`), but nothing notices when a key gains behaviour
and the exclusion should be *removed*.

### STB-B8 — Sandboxed JS/Python transforms, rebuilt after the initiative closes
**Tag:** `needs-initiative`. ⚠️ **The scripting surface is dormant by design, not dead.**
`server/services/scripting/` (`ScriptEngine`, `ASTValidator`, `HelperLibrary`, `ScriptContext`), the lifecycle
and document hook services and the `isolated-vm` dependency are all intact and parked pending this rebuild.
Parts read as unreferenced while transform blocks are disabled. **Do not delete any of it as "dead code"** —
commit `fbe212fa` over-removed feature routes on exactly that inference and admin plus marketplace had to be
restored afterwards.

### STB-B9 — File upload on version-pinned runs is unproven
**Tag:** `informational`. No test covers a file upload on a run pinned to an older workflow version. A backfill
that rewrites `graphJson` without proving pinned-run uploads still resolve would not be caught by anything in
the suite.

### STB-B11 — Backfilled version checksums cause one spurious draft version
**Tag:** `informational`. `VersionService.createDraftVersion` detects "nothing changed" by comparing
`latestVersion.checksum` against a checksum computed from a **freshly serialized** JS graph, whose key order
comes from the serializer. A backfilled checksum is necessarily computed from a `jsonb` read-back, whose key
order Postgres normalizes. The converter cannot reproduce the serializer's order, so the two cannot be equal.

Effect: after a backfill, the first save of each converted workflow creates one extra draft version instead of
being skipped. Once per workflow, no data loss. Fixing it properly means canonically sorting keys inside
`computeChecksum`, which changes every existing checksum and needs its own migration.

### STB-B12 — Pre-`pages` version graphs are counted, not converted
**Tag:** `informational`. 56 of 60 stored `workflow_versions` on the dev branch use the older top-level
`blocks[]` graph shape rather than `pages[].steps[]`; 4 have neither key. **Every one of those `blocks` arrays
is empty**, so nothing is skipped in practice.

`canonicalizeGraphJson` converts only `pages[].steps[]`. Rather than guess at a shape that cannot be tested
against real content, it sets `unrecognizedShape`, counts `unconvertedDefinitions`, reports both, and `--audit`
fails if any are found — so a populated legacy artifact can never look like a clean run. Promote only if an
audit against `test` or production reports a non-zero "Definitions left unconverted by shape".

A third shape exists on paper: `WorkflowGraphSchema` in `shared/zod-schemas.ts` declares `pages[].blocks[]`, is
never `.parse`d, and matches nothing that is stored. **Do not reach for it** — a converter written against it
walks a key that does not exist and reports a clean run.

### STB-B13 — The RLS gate's 3 failures are all respondent (run-token) writes
**Tag:** `needs-initiative`; belongs to **RLS Phase 2**, not to STB. The `RLS Enforcement Gate` runs the
integration project as a genuine non-owner and has failed on `dev` since before this initiative (verified on
`3bbf61d6`) with these three files:

```
tests/integration/api.runs.file-upload.test.ts
tests/integration/runFileUpload.test.ts
tests/integration/text-canonicalization.test.ts
```

Every one is a respondent path authenticated by a run token. Reproduced locally: a page submission writes
**nothing** — the read is through the owner handle, so the row is genuinely absent — while the request still
returns its expected status. That is the shape the gate exists to catch: *RLS failures do not throw.*

Already ruled out: `runTokenAuth` **does** call `setCurrentTenantId(runTenantId)` (lines 113 and 241), so
"respondent has no tenant context" is not the explanation. In the test schema `step_values` and `workflow_runs`
have **no RLS enabled and zero policies**; only `steps` is enabled and forced, with a `tenant_isolation` policy
admitting a row when the workflow's owner tenant matches `app_current_tenant()` **or** the workflow is
`is_public AND active`. The likely area is the tenant GUC not reaching the pooled connection that performs the
write.

⚠️ `RLS_ENFORCED=true` is already set on the **test** environment. If this is an application gap rather than a
harness artefact, respondents submitting answers and uploading files are affected wherever enforcement is on.

**Do not allowlist these.** `.rls-allowlist.json` is for deliberate, understood exceptions; three unexplained
entries added to green a build is precisely how that gate rots.

---

## Operational state at retirement

- **`dev` and `test` Neon branches are backfilled and audited clean.** Production is **not**. Migration `0042`
  recreates the `step_type` enum with an `ALTER … USING` cast that **fails on any unconverted row**, and Railway
  runs `db:migrate` as a pre-deploy command — so production needs snapshot → `--apply --database-url` →
  `--audit` *before* the promotion carrying `0042` reaches it.
- Neon restore points retained: `backup-dev-pre-canonicalize-2026-09-03` (`br-silent-math-ahw5fz1u`) and
  `backup-test-pre-canonicalize-2026-09-03` (`br-plain-fire-ahl47pjw`). Delete once production is done and both
  environments have been exercised.
- The converter is `scripts/canonicalizeStepTypes.ts`. Dry-run is the default; `--apply` **requires** an
  explicit `--database-url` and refuses ambient `DATABASE_URL`. **Point it at the owner/migration role, never
  the app's restricted role** — under RLS the restricted role sees almost nothing and the script reports a clean
  run having converted nothing.

---

## Closed — do not re-file

| Ticket | What shipped |
|---|---|
| STB-1 | AI stopped advertising inert config keys |
| STB-2 | Canonical toolbox + preset contracts established |
| STB-3, 3A, 3B, 3C | Text canonicalized; preset presentation identity; stored-row presentation from the config discriminator; preset plumbing made data-driven |
| STB-4 | Date/Time/DateTime unified under `date_time.kind` |
| STB-5, STB-6 | Boolean canonicalized with buttons/radio/toggle; consent checkbox + correct alias storage |
| STB-7, STB-8 | Choice canonicalized with radio/checkbox layout; Other + stable per-run randomization |
| STB-9, STB-10 | Number formatting/grouping/prefix/suffix; currency modes, cents-style entry |
| STB-11, STB-12 | File Upload made authorable with image previews; lazy first-page PDF previews |
| STB-13, STB-14 | Phone/Email/Website and Address/Scale/Display configs canonicalized |
| STB-15, STB-15A | Legacy routing removed from runner/Lists/conditions/answer formatting; curated templates and demo seeds re-authored |
| STB-16, STB-17, STB-18 | AI vocabulary made mode-aware and canonical-only; strict canonical configs at every write boundary; portability converted to canonical-only round trips |
| STB-19, STB-20 | Idempotent live-step and nested-List canonicalizer; extended to versions and blueprints with checksum repair |
| STB-21, STB-22 | `step_type` enum reduced 37 → 18 (migration `0042`); transition code deleted and the toolbox verified live |
| STB-23, STB-24 | File Upload fixed on Unfiled workflows; Easy Choice presets seed option aliases |
| **STB-B5** | **Closed 2026-09-03.** The dead `Inspector.tsx` chain (`StepPropertiesPanel`, `step-properties/`) was deleted in the STB-22 sweep, along with the store's orphaned `setInspectorTab`. |
| **STB-B10** | **Closed 2026-08-30.** `signature_block` got its config schema in STB-17; `final_documents` already had one — half the original observation was wrong and was corrected in place. |

Two live bugs were found by the Phase 5 sweep rather than by any test, and are worth remembering as a pattern —
both were invisible until the enum forced the branches to be read:

- `RunShareService` and `RunStateService` located a run's final block by `step.type === 'final'` **only**. After
  the backfill that type does not exist, so the draft-run path would have found no final block at all.
- `snapshotHelpers` flagged any non-array `multiple_choice` value as `invalid_format`. Canonical `choice` stores
  a **string** when single-select, so every single-select answer would have been reported malformed.
