---
name: add-step-type
description: 'Use this skill whenever the task involves a workflow step type, question type, or block type in ezBuildr — adding a new one (rating, slider, NPS, matrix, color picker, star scale, etc.), changing how an existing one behaves or is configured (defaults, settings panel options, runner behavior), or fixing one that is incompletely wired up (missing from the palette, erroring in AI generation, unsupported inside a List or in conditional logic). Any request that names a step/question/block type and asks to create, extend, configure, or finish it belongs here: step types are enumerated in ~10 places across shared/, the builder, and the runner, and this skill has the full checklist. Do not use for CI pipeline steps, lifecycle/document hooks, new logic operators, or pure visual styling fixes.'
---

# Adding a Step Type

A step type (like `short_text`, `choice`, `computed`) is enumerated in many places. Work through this list top to bottom; the compiler catches some misses (string unions) but not all (switch defaults, registries).

**Every path below was re-verified against the tree on 2026-08-01.** Two were dead and had misled at least one dev each: `client/src/components/runner/blocks/validation.ts` (client-side value validation lives in `shared/validation/BlockValidation.ts`) and `shared/types/repeater.ts` (deleted with the `repeater` type in LIST-13).

## 1. Shared — source of truth

| File | What |
|---|---|
| `shared/schema/workflow.ts:38` | `stepTypeEnum` pgEnum — the DB enum (38 values). **Requires a migration:** `ALTER TYPE "step_type" ADD VALUE IF NOT EXISTS 'my_type';` (see the db-schema-change skill) |
| `shared/types/workflow.ts:12` | `StepType` string-union |
| `shared/types/stepConfigs.ts` | Config + value types for the new type (what goes in `step.config`, what a submitted value looks like) |
| `shared/validation/BlockValidation.ts:81` | Server-side value validation `switch` — without a case, submissions for the type are under-validated |

## 2. Client — builder (authoring)

| File | What |
|---|---|
| `client/src/lib/blockRegistry.tsx` | Add a `BLOCK_REGISTRY` entry: `type`, `label`, `icon`, `category`, `modes`, `createDefaultConfig`. This is what makes it appear in the palette |
| `client/src/components/builder/cards/` | New card editor component (copy the closest existing, e.g. `TextCardEditor`) |
| `client/src/components/builder/StepEditorRouter.tsx:33` | Route the type to the card editor |
| `client/src/components/builder/step-properties/StepTypeSettings.tsx` | Per-type settings panel if the type has options |
| `client/src/components/builder/cards/common/StepIcons.tsx` | Icon mapping |

## 3. Client — runner (filling out)

| File | What |
|---|---|
| `client/src/components/runner/blocks/` | New renderer component + barrel `index.ts` export |
| `client/src/components/runner/blocks/BlockRenderer.tsx:96` | Add the `case` in the master switch |
| `shared/types/runnerStepTypes.ts` | Add to `RUNNER_RENDERED_STEP_TYPES` (or `RUNNER_HIDDEN_*` / `RUNNER_INTENTIONALLY_UNSUPPORTED_*`). **Do not skip this** — it is the single source of truth for whether the runner can present a fillable control, and both validators refuse to `require` a type that is not listed (RUN2-3) |
| `shared/validation/BlockValidation.ts` | Add the `case` in `getValidationSchema` if the type has validation rules beyond `required` |

Preview reuses the runner's `BlockRenderer` — there is no separate preview renderer set.

## 4. Optional integrations (add only if the type supports them)

| Feature | File |
|---|---|
| Conditional logic operands | `shared/types/conditions.ts:15` — `ConditionSupportedStepType` + `OPERATORS_BY_STEP_TYPE` map |
| List fields | **Nothing to do.** `LIST_FIELD_QUESTION_TYPES` (`shared/types/stepConfigs.ts`) is *derived* from `RUNNER_RENDERED_STEP_TYPES` minus `final_documents`/`signature_block`/`list`, so registering the type above automatically makes it usable inside a List. This replaced the hand-maintained `RepeaterFieldType` of the retired `repeater` type, which went stale by exactly this route (LIST-13). Only touch it to *exclude* a type that has no per-item meaning |
| AI workflow generation | `shared/types/ai.ts:15` — the `z.enum` step list (AI can't generate the type otherwise) |
| Docs | `docs/api/BLOCKS.md` + the step-type list in `CLAUDE.md` |

## Portability — this one is a gate, not optional

`tests/integration/portability.roundtrip.test.ts` iterates `stepTypeEnum` and
**fails if your new type has neither a config fixture nor an entry in its
`SKIPPED` map** (IEX3-3). Add a representative config to `buildStepConfigs()`
there — distinctive enough that a dropped or coerced key shows up — and the
test proves the type survives export/import at both project and workflow
scope.

Skipping is allowed but has to be argued: a `SKIPPED` entry is a claim that
portability does not apply to the type, and it needs a reason in the map. Two
live defects (IEX3-1, IEX3-2) hid behind this suite covering only a single
`text` step, which is why it is now a gate.

## Verify

1. `npx tsc --noEmit` — union types will flag missed switches with exhaustiveness, but registries/validation switches won't.
2. Grep for an existing similar type string (e.g. `"signature"`) across `shared/` and `client/src/` to catch any enumeration this list missed — new ones appear over time.
3. Manually: add the step in the builder, configure it, run the workflow in preview, submit a value, confirm it lands in `stepValues` and shows in run detail.
4. UI work here means loading the design skill first (per user's global instructions).
