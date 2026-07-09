---
name: add-step-type
description: Add a new workflow step/question/block type to ezBuildr, or extend what an existing step type supports. TRIGGER this skill when the user asks for a new question or block type in the builder (rating, slider, matrix, NPS, color picker, etc.), wants an existing step type to work in more places (repeaters, conditional logic, AI generation, the easy-mode palette), or reports a step type that only half-works or is missing from a palette. A step type is enumerated in ~10 places across shared/, the builder, and the runner — implementing from memory always misses some. DO NOT TRIGGER for CI pipeline steps, lifecycle or document hooks, transform-block helpers, new logic operators, styling fixes to existing blocks, or builder UX bugs unrelated to a type's definition.
---

# Adding a Step Type

A step type (like `short_text`, `signature`, `computed`) is enumerated in many places. Work through this list top to bottom; the compiler catches some misses (string unions) but not all (switch defaults, registries).

## 1. Shared — source of truth

| File | What |
|---|---|
| `shared/schema/workflow.ts:37` | `stepTypeEnum` pgEnum — the DB enum. **Requires a migration:** `ALTER TYPE "step_type" ADD VALUE IF NOT EXISTS 'my_type';` (see the db-schema-change skill) |
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
| `client/src/components/runner/blocks/validation.ts:22` | Client-side `validateBlockValue` case |

Preview reuses the runner's `BlockRenderer` — there is no separate preview renderer set.

## 4. Optional integrations (add only if the type supports them)

| Feature | File |
|---|---|
| Conditional logic operands | `shared/types/conditions.ts:15` — `ConditionSupportedStepType` + `OPERATORS_BY_STEP_TYPE` map |
| Repeater fields | `shared/types/repeater.ts:14` — `RepeaterFieldType` |
| AI workflow generation | `shared/types/ai.ts:15` — the `z.enum` step list (AI can't generate the type otherwise) |
| Docs | `docs/api/BLOCKS.md` + the step-type list in `CLAUDE.md` |

## Verify

1. `npx tsc --noEmit` — union types will flag missed switches with exhaustiveness, but registries/validation switches won't.
2. Grep for an existing similar type string (e.g. `"signature"`) across `shared/` and `client/src/` to catch any enumeration this list missed — new ones appear over time.
3. Manually: add the step in the builder, configure it, run the workflow in preview, submit a value, confirm it lands in `stepValues` and shows in run detail.
4. UI work here means loading the design skill first (per user's global instructions).
