# server/workflows/

## Live modules

### `validation.ts` — page validation engine

`validatePage()` validates all fields on a page against the run's submitted
values, respecting visibility (`visibleStepIds`) and virtual steps. It builds
each field's schema via `shared/validation/BlockValidation.ts`'s
`getValidationSchema()` — the same schema builder the client uses — so
required/format rules are byte-identical between browser and server.

`list`-type steps get recursive, path-keyed validation via
`validateListValue` instead of the flat `ValidationRule[]` schema.

Format-rule enforcement (minLength/maxLength/min/max/email/url/pattern) is
gated by `SERVER_FIELD_VALIDATION=enforce` (`isServerFieldValidationEnforced()`);
`required` is unaffected by the switch and is always enforced. See the
in-file comment on `isServerFieldValidationEnforced` for the rollout history
(RUN2-16).

Imported by `server/services/runs/RunExecutionCoordinator.ts`.

## Condition evaluation lives elsewhere

Workflow visibility conditions (`steps.visible_if`, `pages.visible_if`)
are **not** evaluated in this directory. The live condition model —
`ConditionExpression`, nested AND/OR groups, and the full comparison-operator
set — is defined in `shared/types/conditions.ts` and evaluated by
`shared/conditionEvaluator.ts` on both client and server. See that file and
its tests (`tests/unit/shared/conditionEvaluator.test.ts`,
`tests/unit/shared/conditions.test.ts`) for usage and operator coverage.

An earlier, unrelated condition system — a string-expression /
`ConditionExpression`-lookalike engine plus its UI-format adapter and usage
examples, which this file used to document — lived in this directory but had
no production importer. It was removed as dead code (LU-1, GH-154
decomposition, 2026-08-07); its test coverage was checked against and is
superseded by `shared/conditionEvaluator.ts`'s tests.
