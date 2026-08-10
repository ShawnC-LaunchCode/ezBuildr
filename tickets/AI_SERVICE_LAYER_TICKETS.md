# AI Service Layer — Consolidation & Provider Readiness Tickets (AISL-1..11 + backlog)

Source: full read-through of the AI service layer (`server/services/ai/`,
`server/services/AIService.ts`, `server/lib/ai/`, `server/routes/ai*`,
`shared/schema/ai.ts`, `shared/types/ai.ts`), 2026-08-09.
Scope: every code path that reaches an LLM provider, plus the budget, telemetry,
rate-limit, and prompt-injection controls around them. Overall grade at audit
time: **B−** (the governed core is well-designed and deliberately hardened; it
just doesn't cover most of the surface).

Every finding below was verified against the working tree at audit time. **Line
numbers are advisory** — they were accurate when written and drift as fixes
land. The locator is the quoted code and the named symbol; grep for those. A
stale line number is not a broken ticket and does not need re-issuing.

## Why this initiative exists

ezBuildr has **two AI stacks**, not one.

The governed stack (`server/services/ai/`) funnels every call through
`AIProviderClient.callLLM()`, which enforces a per-tenant token budget, records
usage to `ai_usage`, retries rate-limits and timeouts with backoff, and emits
cost telemetry. It sits behind a provider abstraction with three
implementations.

A second set of call sites constructs `new GoogleGenerativeAI(...)` directly and
gets **none of that** — no budget, no ledger row, no retry, no cost telemetry —
and ignores `AI_PROVIDER` entirely. By endpoint count that second stack is the
majority of the AI surface: all of `/api/ai/transform/*` (5),
`/api/ai/doc/*` (4), `/api/ai/personalize/*` (5), and `/api/ai/sentiment`.

The consequence that makes this urgent rather than cosmetic: **the repo owner is
evaluating a provider switch for production, and it cannot be done today.**
Setting `AI_PROVIDER=openai` moves the governed half and silently leaves the
other half on Gemini, and the governed half would immediately hard-fail on
context-window validation because `ModelRegistry` has never heard of the new
model. Consolidation is the prerequisite for the provider decision, not a
follow-up cleanup.

These tickets are deliberately **provider-neutral** — none of them picks a
provider. They make the layer capable of switching.

---

## How to work this document

- **Tickets are grouped into 3 phases**, ordered by dependency. Do not start a
  phase until the previous phase's **Phase Gate** has been verified and
  committed by the reviewer (the repo owner's senior model). Phase 1 is a hard
  prerequisite for Phase 2 — consolidating onto a client whose budget is opt-in
  and whose registry misreports context windows would spread those bugs to
  every remaining endpoint.
- Each ticket has: **Finding**, **Preferred fix**, **Ties**, and
  **Acceptance criteria** (all must pass).
- **Load the `add-api-endpoint` skill** before touching anything under
  `server/routes/`, `server/services/`, or `server/repositories/` — the
  error-string contract and tenancy checks are easy to get subtly wrong.
- **Load the `run-tests` skill** before running any test. `npm test` naively
  gives wrong results here; the suite is three Vitest projects with separate
  commands. `npm run test:fast` (~13s, no DB) is the default sanity check.
- `test:fast` intermittently fails **one unrelated test** that passes in
  isolation, and adding a test file shifts scheduling enough to surface it.
  Verify any single failure in isolation before blaming your change.
- Gates for every ticket: `npm run type-check` (0 errors), `npm run lint`
  (`--max-warnings 0`, repo-wide), and the relevant suites. `tsc --pretty`
  emits ANSI codes — `grep "error TS"` finds nothing on a failing tree; grep
  `Found [0-9]+ error` or read the raw output.
- Devs do not commit; the reviewer commits per passed ticket.
- Status legend: 🔲 Open · 🔄 In progress · ✅ Done (verified at review)

### Phase overview

| Phase | Theme | Tickets | Est. effort |
|---|---|---|---|
| 1 | Make the governed path correct and switchable | AISL-1..4 | ~1 day |
| 2 | Consolidate the bypass stack onto `AIProviderClient` | AISL-5..8 | ~2 days |
| 3 | Cost visibility and control | AISL-9..11 | ~1 day |
| Backlog | Not phase-gated | AISL-B1..B8 | |

### Ticket index

| Ticket | Title | Priority | Size | Status |
|---|---|---|---|---|
| AISL-1 | `ModelRegistry` silently fabricates config for unknown models | P0 | M | ✅ |
| AISL-2 | Tenant budget is fail-open by omission | P0 | S | ✅ |
| AISL-3 | `AnthropicProvider` would 400 on every current Claude model | P1 | S | ✅ |
| AISL-4 | Extend `TaskType` to cover the four bypass domains | P1 | S | ✅ |
| AISL-5 | Transform AI bypasses the governed client | P1 | M | ✅ |
| AISL-6 | Personalization AI bypasses the governed client | P1 | M | ✅ |
| AISL-7 | Document-assist AI bypasses the governed client | P1 | M | ✅ |
| AISL-8 | Sentiment AI bypasses the governed client | P2 | S | ✅ |
| AISL-9 | Budget on dollars, not raw token count | P1 | M | ✅ |
| AISL-10 | No per-operation unit economics | P1 | S | 🔲 **unblocked — last one** |
| AISL-11 | System prompt is not a stable cacheable prefix | P2 | S | ✅ |
| AISL-12 | `workflow_personalization_settings` is read and discarded | P1 | S | 🔲 decided: option (a) |

---

# Phase 1 — Make the governed path correct and switchable

Four independent fixes to `server/services/ai/` and its callers. All are
prerequisites for Phase 2. In scope: the registry/env contract, budget
enforcement, the Anthropic provider, and the `TaskType` union. Explicitly out
of scope: touching any `server/lib/ai/` file (that is Phase 2), and choosing a
provider or model (that is the repo owner's call).

## AISL-1 — `ModelRegistry` silently fabricates config for unknown models ✅

> **Verified 2026-08-09** (branch `aisl-1`, base `1bbab2a7`). All 7 criteria met.
> Took three passes; the last correction was made by the reviewer, not the dev.
>
> Reviewer-run gates: `type-check` 0 errors, `npm run lint` clean at repo-wide
> `--max-warnings 0`, focused suite **7/7**, `test:fast` **252 files / 2825
> tests passed** (+2 vs the 2823 baseline). Criterion 3 confirmed from actual
> log output, not by inspection — the `level: 40` line carries `provider`,
> `model`, and `registeredModels`, and execution continues.
>
> **Rev 1 failed:** three retired Anthropic models retained (incl. the then-live
> default `claude-3-5-sonnet-20241022`), `claude-sonnet-5` and `claude-opus-4-8`
> missing — which would have blocked AISL-3 AC2.
>
> **Rev 2 failed:** the Anthropic table was corrected, but `gemini-2.0-flash`
> and `gemini-1.5-pro` were dropped as vendor-deprecated **while seven files
> still selected them**. That put the live production model into the "not
> registered" path (permanent boot warning for the model actually in use) and
> cut `gemini-1.5-pro`'s ceiling from 2,097,152 to `getDefaultConfig`'s
> 1,000,000, so large transform prompts would begin hard-throwing — a
> request-time behavior change, violating AC5, and the exact failure this
> ticket exists to prevent. **Caused by the reviewer's own send-back wording**
> ("remove any entry you cannot confirm"), which never stated the constraint
> that mattered.
>
> **Rev 3 (reviewer fix):** both rows restored with a comment recording *why*
> they are retained, plus two regression tests — one asserting every
> code-selected model stays registered with its real context/pricing, one
> asserting the default Gemini deployment boots with `error: undefined`.
>
> **Rule this establishes:** the registry's contract is *"models this deployment
> might call"*, not *"models the vendor currently sells."* Never delete a row
> while any code path can still select it. Dropping the retired Anthropic rows
> was correct because nothing referenced them.
>
> **Residual risk, accepted:** the OpenAI and Gemini figures are sourced by the
> dev from vendor pages but are **past the reviewer's knowledge cutoff and were
> not independently verified**; only the Anthropic table was checked against
> authoritative data. Wrong prices would distort AISL-10's unit economics;
> wrong context windows could throw at request time. Re-verify both providers
> as part of the provider decision — the point at which they start to matter.

**Priority: P0 (bug)** · Size: M · File: `server/services/ai/ModelRegistry.ts`

### Finding

Which model ezBuildr calls is **env-driven**; what `ModelRegistry` knows is
**code-driven**; nothing validates that the env value exists in the registry.

`getConfig()` in `server/services/ai/ModelRegistry.ts` falls through to
`getDefaultConfig(provider)` for any unregistered model:

```ts
const config = this.configMap.get(key);

if (!config) {
  // Return reasonable defaults for unknown models
  return this.getDefaultConfig(provider);
}
```

and that default is a fabricated entry:

```ts
case 'openai':
  return {
    provider: 'openai',
    model: 'unknown',
    maxContextTokens: 8000,
    pricing: { input: 10.00, output: 30.00 },
  };
```

This is not merely bad telemetry. `getMaxContextTokens()` feeds
`validateTokenLimits()` in `BaseAIProvider`, which **hard-throws**:

```ts
if (totalTokens > maxContext) {
  ...
  throw this.createError(errorMsg, 'VALIDATION_ERROR', { ... });
}
```

So pointing `AI_MODEL_WORKFLOW` at any real OpenAI model the registry doesn't
list gives it an 8,000-token ceiling and rejects workflows that worked the day
before, with an error message that blames the workflow's size and never
mentions the registry. The Anthropic fallback (100K) has the same shape with a
milder blast radius. Gemini's (1M) is generous enough to have hidden the bug so
far, which is why nobody has hit it — Gemini is the live provider.

`MODEL_CONFIGS` is also stale: the newest entries are
`claude-3-5-sonnet-20241022`, `gpt-4-turbo-preview`, and `gemini-2.5-pro`.
Every current Anthropic and OpenAI model resolves to the "unknown" fallback.

`providerConfig.ts` already documents the hazard in its header comment — "Model
ids default to registry-known values so telemetry cost/context checks resolve
to real pricing rather than the ModelRegistry 'unknown' fallback" — so the
*defaults* are safe and anything an operator types is not.

### Preferred fix

Two parts, both in `server/services/ai/`:

1. **Fail loudly at startup instead of silently at request time.** Extend
   `validateAIConfig()` in `server/services/AIService.ts` (it already runs at
   boot and is already non-throwing) to check the resolved model against
   `ModelRegistry.getModelsForProvider(provider)` and return a populated
   `error` field when it is unregistered. Log it at `warn` with the provider,
   the model, and the list of registered models for that provider. Do not
   throw — an unregistered model must stay usable, it just must not be silent.
2. **Add an explicit `isRegistered(provider, model)` static** to
   `ModelRegistry` rather than having callers infer it from
   `getModelsForProvider().includes(...)`. `getDefaultConfig` stays as the
   runtime behavior; this ticket makes the fallback *observable*, not fatal.
3. **Refresh `MODEL_CONFIGS`** with the current Anthropic, OpenAI, and Gemini
   model IDs, context windows, and per-1M pricing. Do not guess these — take
   them from each provider's live pricing/models page and put the retrieval
   date in a comment above the array. For Anthropic, the `claude-api` skill
   carries the current table.

Do **not** make an unregistered model throw at request time, and do not remove
`getDefaultConfig` — a deployment must be able to run a model newer than the
registry.

### Ties

- **Blocks AISL-3** (which adds current Claude model IDs the registry must
  know) — sequence AISL-1 before AISL-3, or bundle if one dev takes both.
- Blocks all of Phase 2: consolidating onto a client that misreports context
  windows spreads the bug.
- Load: `add-api-endpoint` skill (service-layer conventions).
- Model IDs and pricing for Anthropic: load the `claude-api` skill rather than
  answering from memory.
- File footprint: `server/services/ai/ModelRegistry.ts`,
  `server/services/AIService.ts` (`validateAIConfig` only),
  `tests/unit/services/ai/`. Collides with **AISL-3** (`ModelRegistry.ts`) and
  **AISL-2** (`AIService.ts`, different function). No other overlap.

### Acceptance criteria

1. `ModelRegistry.isRegistered(provider, model)` exists and returns `false` for
   a model not in `MODEL_CONFIGS`, `true` for one that is.
2. `validateAIConfig()` returns `configured: true` **with a populated `error`
   string naming the unregistered model** when the resolved model is not in the
   registry; it returns `error: undefined` when the model is registered.
3. Boot logs a `warn` containing the provider, the unregistered model, and the
   registered models for that provider when (2) fires. Boot is not blocked.
4. `MODEL_CONFIGS` contains current model IDs, context windows, and pricing for
   all three providers, with a dated sourcing comment above the array.
5. `getConfig()` still returns the provider default for an unknown model — no
   throw, no behavior change at request time.
6. New tests in `tests/unit/services/ai/` assert 1, 2, and 5, including the
   specific case that an unregistered OpenAI model still yields the 8,000-token
   default (documenting the fallback rather than silently changing it).
7. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast`
   green.

---

## AISL-2 — Tenant budget is fail-open by omission ✅

> **Verified 2026-08-09** (branch `aisl-2`, base `3f5f6b35`). All 6 criteria met.
> Reviewer re-ran every gate independently: `type-check` 0 errors, `npm run lint`
> clean at `--max-warnings 0`, `test:fast` **253 files / 2827 tests passed**.
> Criterion 5's third clause spot-checked rather than taken on report —
> `tests/unit/services/ai/AIProviderClient.test.ts:165`
> (`records random-fill usage against the requesting tenant`) asserts a real
> `recordUsage` call carrying `tenantId: 'tenant-random-fill'`.
> Tenant threading verified in the diff: `runs.routes.ts` → `RunService` →
> `RunLifecycleService.generateRandomValues(workflowId, tenantId)` →
> `createAIServiceFromEnv(tenantId)`. `enforceBudget` and `recordUsage` are
> untouched. Observation filed as AISL-B9 (anonymous public-link runs).

**Priority: P0 (bug)** · Size: S · File: `server/services/ai/AIProviderClient.ts`

### Finding

`enforceBudget` is only called when a `tenantId` happens to be present on the
config. `callLLM` in `server/services/ai/AIProviderClient.ts`:

```ts
const { provider, model, tenantId } = this.config;
...
if (tenantId) {
  await this.enforceBudget(tenantId);
}
```

and the same guard gates the ledger write:

```ts
if (tenantId) {
  await this.recordUsage(tenantId, taskType, usage.inputTokens, usage.outputTokens);
}
```

`AIProviderConfig.tenantId` is optional, so **forgetting to thread a tenant
silently disables both the budget and the usage ledger** rather than erroring.
This is not hypothetical — `generateRandomValues()` in
`server/services/workflow-runs/RunLifecycleService.ts` already forgets:

```ts
// Call AI service to generate random values
const aiService = createAIServiceFromEnv();
return aiService.suggestValues(stepData, 'full');
```

Every other call site (`AiController`, six occurrences) threads
`authReq.tenantId` correctly, so this path is the odd one out — AI random-fill
runs unbudgeted and invisible to `ai_usage`.

The guard being opt-in is the underlying defect; the `RunLifecycleService` call
is the proof that the shape invites the mistake.

### Preferred fix

1. Thread the tenant through `generateRandomValues()` in
   `RunLifecycleService.ts`. Follow the existing convention: the callers of
   `AiController` read `authReq.tenantId` and pass it to
   `createAIServiceFromEnv(tenantId)` — do the same here, taking `tenantId` as
   a parameter on `generateRandomValues` and passing it down from its route
   caller. Grep for callers of `generateRandomValues` and update them.
2. Make the omission loud rather than silent. In `AIProviderClient`'s
   constructor, when `config.apiKey` is present but `config.tenantId` is not,
   log a `warn` with `event: 'ai_client_untenanted'` naming the provider and
   model. Do **not** throw — a throw would break any legitimately
   tenant-less path (scripts, tests) and is a bigger behavioral change than
   this ticket should make. The warn is what turns a silent hole into a
   greppable one.

Do not make `tenantId` required on the `AIProviderConfig` type in this ticket —
that is a wider refactor and would fight with Phase 2, which adds new call
sites. Revisit after AISL-8.

### Ties

- **AISL-9** replaces the budget's unit of account and touches
  `enforceBudget` — sequence AISL-2 before AISL-9.
- Phase 2 tickets all construct `AIProviderClient` and must pass `tenantId`;
  the warn added here is how the reviewer verifies they did.
- Load: `add-api-endpoint` skill (tenancy conventions), `run-tests` skill.
- File footprint: `server/services/ai/AIProviderClient.ts`,
  `server/services/workflow-runs/RunLifecycleService.ts`, that service's route
  caller, `tests/unit/services/ai/AIProviderClient.test.ts`. Collides with
  **AISL-9** (`AIProviderClient.ts`). No overlap with Phase 2 files.

### Acceptance criteria

1. `generateRandomValues()` accepts a `tenantId` and passes it to
   `createAIServiceFromEnv`; its route caller supplies `authReq.tenantId`.
2. Constructing `AIProviderClient` with an `apiKey` but no `tenantId` logs a
   `warn` containing `ai_client_untenanted`, the provider, and the model.
3. Constructing it *with* a `tenantId` logs no such warning.
4. Budget enforcement and `ai_usage` recording still occur exactly as before
   when `tenantId` is present — no change to the enforced threshold or the
   recorded row.
5. New/updated tests in `tests/unit/services/ai/AIProviderClient.test.ts`
   assert 2 and 3, and a test asserts that a random-fill run now produces an
   `ai_usage` row for the tenant.
6. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast`
   green.

---

## AISL-3 — `AnthropicProvider` would 400 on every current Claude model ✅

> **Verified 2026-08-09** (worktree `aisl-3`, base `3f5f6b35`). All 6 criteria met.
> `temperature` dropped from the payload; both Anthropic defaults now resolve to
> `claude-sonnet-5`, which AISL-1 registered; `@anthropic-ai/sdk` 0.68.0 → 0.116.0.
>
> **Criteria were only checkable after the merge.** The worktree was cut from
> `3f5f6b35`, before AISL-1 landed, so `claude-sonnet-5` was absent from its
> `MODEL_CONFIGS` and **AC2 was not provable there** — its `test:fast` figure
> (255/2826) is likewise not comparable to main's. The dev flagged the
> dependency and declined to duplicate AISL-1's registry rows, which was the
> right call. Reviewer verified everything on merged main: type-check 0,
> strict-zones passed, lint clean, `test:fast` **255 files / 2836 tests**
> (+1 file, +2 tests over the post-AISL-2 baseline), `@anthropic-ai/sdk`
> resolving at 0.116.0.
>
> **Merge hazard handled:** `server/services/AIService.ts` was dirty in the
> worktree *and* modified by AISL-1 on main. Copying the worktree's copy would
> have silently reverted `validateAIConfig` / `getUnregisteredModelError` with
> no conflict. The one-line `getDefaultModel` change was hand-applied to main's
> version instead; post-merge grep confirms AISL-1's symbols intact.
>
> Test quality note: `AnthropicProvider.test.ts` passes `temperature: 0.9` into
> the config deliberately, so it proves the parameter is *dropped* rather than
> merely absent.
>
> **Dispatch note:** the dev reported the `claude-api` skill was unavailable to
> it. Model IDs must stay inline in ticket text rather than delegated to that
> skill — the send-back table is what carried them here.

**Priority: P1** · Size: S · File: `server/services/ai/providers/AnthropicProvider.ts`

### Finding

The Anthropic path has never been exercised — `GEMINI_API_KEY` takes precedence
in both `resolveAiProviderConfig` and `createAIServiceFromEnv`, and
`AI_PROVIDER` defaults to `openai` — and it would fail immediately if it were.

`generateResponse()` in `server/services/ai/providers/AnthropicProvider.ts`
sends a sampling parameter:

```ts
const { model, temperature = 0.7, maxTokens } = this.config;
...
const response = await this.client.messages.create({
    model,
    max_tokens: safeMaxTokens,
    temperature,
    messages: [{ role: 'user', content: prompt }],
    system: systemMessage ?? 'You are a workflow design expert. ...',
});
```

`temperature`, `top_p`, and `top_k` are **rejected with a 400** on current
Claude models (Sonnet 5, Opus 5, and the Opus 4.7/4.8 family). Combined with
the default model in `providerConfig.ts` and `AIService.ts`:

```ts
anthropic: 'claude-3-5-sonnet-20241022',
```

— a model ID that is retired — the provider is wired to a dead model and would
400 on a live one. Any plan that puts Claude in an escalation tier hits this on
its first call.

`@anthropic-ai/sdk` is pinned at `^0.68.0` in `package.json`, which predates
several of the current request-shape changes.

### Preferred fix

1. **Drop `temperature` from the Anthropic request.** Steer with the system
   prompt instead — that is the documented replacement. Leave the field on
   `AIProviderConfig` (OpenAI and Gemini still use it); just do not forward it
   from `AnthropicProvider`.
2. **Update the Anthropic default model** in both
   `server/services/ai/providerConfig.ts` (`DEFAULT_MODELS.anthropic`) and
   `server/services/AIService.ts` (`getDefaultModel`) to a current, registered
   ID. These two constants duplicate each other — see AISL-B4; do not attempt
   the dedup here, just keep them in sync and note it.
3. **Bump `@anthropic-ai/sdk`** to a current release and confirm
   `messages.create` still type-checks.
4. Load the `claude-api` skill for the exact current model IDs and request
   shape rather than answering from memory — the IDs are complete as written
   there and must not have date suffixes appended.

Do **not** add adaptive thinking, effort, or structured outputs in this ticket.
The goal is a provider that works, not one that is optimized; structured
outputs is tracked separately as AISL-B1.

### Ties

- **Depends on AISL-1** — the new model ID must be in `MODEL_CONFIGS` or it
  resolves to the 100K "unknown" fallback. Sequence after AISL-1, or bundle.
- Load: `claude-api` skill (model IDs, request shape), `run-tests` skill.
- File footprint: `server/services/ai/providers/AnthropicProvider.ts`,
  `server/services/ai/providerConfig.ts`, `server/services/AIService.ts`
  (`getDefaultModel` only), `package.json`,
  `tests/unit/services/ai/`. Collides with **AISL-1** (`ModelRegistry` /
  `AIService.ts`) and **AISL-2** (`AIService.ts`, different function).

### Acceptance criteria

1. `AnthropicProvider.generateResponse` does not send `temperature`, `top_p`,
   or `top_k` in the `messages.create` payload.
2. `DEFAULT_MODELS.anthropic` in `providerConfig.ts` and the `'anthropic'` case
   of `getDefaultModel` in `AIService.ts` both resolve to the same current
   model ID, and that ID is present in `MODEL_CONFIGS`.
3. `@anthropic-ai/sdk` is upgraded; `npm run type-check` passes against the new
   version.
4. A new test in `tests/unit/services/ai/` mocks the Anthropic SDK and asserts
   the request payload contains no `temperature` key and uses the configured
   model.
5. A test asserts `resolveAiProviderConfig({ provider: 'anthropic' })` and
   `createAIServiceFromEnv` agree on the default Anthropic model.
6. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast`
   green.

---

## AISL-4 — Extend `TaskType` to cover the four bypass domains ✅

> **Verified 2026-08-09** (worktree `aisl-4`, base `180962c6` — current main, so no
> merge hazard). All 6 criteria met. Reviewer-run gates on merged main:
> type-check 0, strict-zones 6/6, lint clean, `test:fast` **255 files / 2837
> tests**.
>
> Approach note: the dev converted `TaskType` from a hand-written union into
> `TaskType = (typeof TASK_TYPES)[number]` over an exported `as const` array.
> That is not a deviation — AC5 requires a test that iterates the union, which a
> bare type cannot do. `TASK_MAX_TOKENS` stays `Record<TaskType, number>`, so
> exhaustiveness remains compiler-enforced, and the new test pairs a
> `satisfies Record<TaskType, number>` expectation map with a loop over
> `TASK_TYPES`, meaning a future member added without a cap fails at compile
> time *and* at runtime. All eight pre-existing members are preserved (AC4).
>
> One `test:fast` run reported "2 errors" and a clean rerun did not; this is the
> documented order-dependent flake (adding a test file shifts scheduling), not
> a regression from this ticket.

**Priority: P1** · Size: S · File: `server/services/ai/types.ts`

### Finding

The `TaskType` union in `server/services/ai/types.ts` covers only the governed
stack:

```ts
export type TaskType =
  | 'workflow_generation'
  | 'workflow_suggestion'
  | 'binding_suggestion'
  | 'value_suggestion'
  | 'workflow_revision'
  | 'logic_generation'
  | 'logic_debug'
  | 'logic_visualization';
```

None of these describe the work done by the four bypass domains (transform
generation/revision/schema-align, personalization, document assist, sentiment).
`taskType` is the column `ai_usage` groups by and the key
`ModelRegistry.getTaskMaxTokens` looks up, so Phase 2 cannot route its calls
through `callLLM` without values to pass.

`TASK_MAX_TOKENS` in `ModelRegistry.ts` is typed `Record<TaskType, number>`, so
adding a union member without an output cap is a compile error — that is the
desired behavior and must be preserved.

This ticket exists separately so that the four Phase 2 tickets have **disjoint
file footprints** and can be dispatched in parallel. Without it, four devs
would each edit `types.ts` and `ModelRegistry.ts`.

### Preferred fix

Add exactly these members to `TaskType`, and a `TASK_MAX_TOKENS` entry for
each:

| New `TaskType` | Used by (Phase 2) | Suggested cap |
|---|---|---|
| `transform_generation` | AISL-5 | 4000 |
| `transform_revision` | AISL-5 | 4000 |
| `transform_schema_align` | AISL-5 | 4000 |
| `personalization` | AISL-6 | 1000 |
| `document_analysis` | AISL-7 | 4000 |
| `document_mapping` | AISL-7 | 4000 |
| `sentiment_analysis` | AISL-8 | 500 |

Caps are the reviewer's starting estimates — a dev may deviate with a stated
reason, but personalization and sentiment must stay small (they return a
sentence and a small JSON object respectively, and an oversized cap only
inflates the context-window check).

Keep `VALID_STEP_TYPES` / `TYPE_ALIASES` in this file untouched — they are
duplicated with `AIServiceUtils.ts` and that dedup is AISL-B4, not this ticket.

### Ties

- **Blocks AISL-5, AISL-6, AISL-7, AISL-8** — all four read these values.
  Must land before any of them is dispatched.
- File footprint: `server/services/ai/types.ts`,
  `server/services/ai/ModelRegistry.ts` (`TASK_MAX_TOKENS` only),
  `tests/unit/services/ai/`. Collides with **AISL-1** and **AISL-3**
  (`ModelRegistry.ts`) — sequence within Phase 1.
- Load: `run-tests` skill.

### Acceptance criteria

1. All seven new members exist on the `TaskType` union.
2. `TASK_MAX_TOKENS` has an entry for each; `npm run type-check` proves
   exhaustiveness (no entry may be missing).
3. `ModelRegistry.getTaskMaxTokens()` returns the configured cap for each new
   value.
4. No existing `TaskType` member is renamed or removed.
5. A new test in `tests/unit/services/ai/` asserts 3 for every member of the
   union by iterating it, so a future added member without a cap fails the test
   as well as the compiler.
6. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast`
   green.

---

## Phase 1 Gate — ✅ PASSED 2026-08-09

- [x] AISL-1..4 all ✅ with dated verification notes
- [x] `npm run type-check` → `Found 0 errors`
- [x] `npm run lint` → clean at `--max-warnings 0`
- [x] `npm run check:strict-zones` → 6 zones / 11 files, ALL PASSED
- [x] `npm run test:fast` green — **255 files / 2837 tests passed, 14 skipped.
      This is the Phase 2 baseline.**
- [x] Boot path exercised in a real process with an unregistered model
      (`GEMINI_MODEL=gemini-not-registered-probe`): the `level: 40` warn fires
      carrying provider, model, and the full registered list; the returned
      `error` names the model and the alternatives; execution continues. The
      happy path was checked too — with the real `.env`, `validateAIConfig()`
      returns `error: undefined` and boot takes the INFO branch, so Phase 1
      introduces **no spurious warning for this deployment's actual config**.
- [x] Reviewer has committed each passed ticket + this gate

### Defect found *at* the gate — fixed here, not sent back

`server/index.ts` read `aiConfig.error` only in the `else` (not-configured)
branch. AISL-1's unregistered-model case returns `configured: true` **with** an
error, so boot logged the cheerful `AI Service configured and ready` and
discarded the error string — the operator saw a warning immediately contradicted
by a reassurance one line later. Every AISL-1 per-ticket gate passed; the defect
only exists in the composition with `index.ts`, which no ticket touched. That is
exactly the seam a phase gate is for. Boot now takes an explicit third branch:
configured-but-unregistered logs a `warn` naming the fallback consequence, and
`AI Service configured and ready` is reserved for a genuinely registered model.

Not unit-tested: `index.ts` is the bootstrap and would need heavy mocking. The
contract it depends on (`validateAIConfig` returning `configured: true` + an
`error`) is covered by `tests/unit/services/ai/ModelRegistry.test.ts`, and the
branch itself was exercised by the live probe above.

---

## Phase 2 dispatch — ready

AISL-5..8 have **disjoint file footprints** and can go out together, each in its
own worktree (`pwsh scripts/new-worktree.ps1 -Name aisl-5` …). Cut them from
`main` at or after the Phase 1 gate commit — a worktree based before AISL-4 will
not have the `TaskType` values its ticket tells it to use.

Phase 2 gate headline check: `grep -rn "new GoogleGenerativeAI" server/` must
return exactly one match (`GeminiProvider.ts`).

---

# Phase 2 — Consolidate the bypass stack onto `AIProviderClient`

Four tickets, one per bypass domain, with **disjoint file footprints** — they
can be dispatched in parallel, each in its own worktree. Every one is the same
transformation: replace a direct `new GoogleGenerativeAI(...)` with a
`AIProviderClient` constructed from `resolveAiProviderConfig({ tenantId })`,
and call `callLLM(prompt, taskType, systemMessage)` instead of
`model.generateContent(prompt)`.

**In scope:** the provider call and its plumbing. **Explicitly out of scope:**
changing prompts, changing response schemas, changing route contracts, or
"improving" the JSON parsing while you are in there (that is AISL-B1). A
reviewer will bounce a diff that changes what these endpoints return.

**Preserve prompt-injection fencing exactly.** These files wrap untrusted input
in `fenceUntrusted(...)` — do not drop, move, or "simplify" a fence while
restructuring the call. Count the call sites before and after.

**Corrected 2026-08-09:** the audit claimed coverage was "100% of
prompt-building sites". It was not. `DocumentAIAssistService.suggestCleanupActions`
(main lines 173–188) built a prompt from document text with **no** fence; AISL-7
added one. If you find another unfenced prompt while doing plumbing work, fence
it and say so — that is an accepted scope expansion, not a deviation.

**Preserve test escape hatches.** Each of these files has a
`NODE_ENV === 'test'` / `'test_without_mock'` branch that exists because the
Google SDK is awkward to mock. `AIProviderClient` is mocked differently (it
takes an injectable `aiUsageRepo`, and `ProviderFactory` builds from config),
so these branches will need reworking rather than deleting — check what the
existing tests for that file actually mock before removing anything.

## AISL-5 — Transform AI bypasses the governed client ✅

> **Verified 2026-08-09** (worktree `aisl-5`, base `14e3a54b` — current main).
> Zero `GoogleGenerativeAI` in all three files; `callLLM` with
> `transform_generation` / `transform_revision` / `transform_schema_align`;
> `tenantId` threaded at three route sites; the hardcoded `gemini-1.5-pro` is
> gone. `fenceUntrusted` count unchanged at 4/4/4 per file, verified against the
> pre-change files rather than by eye.
>
> AC5: the five endpoints' response shapes are unchanged, proven by a **new**
> `tests/integration/api.ai.transform.test.ts` the dev wrote — main had no
> integration coverage for these routes at all, so "the existing route tests
> pass unmodified" was unsatisfiable as written and the dev did the better
> thing. 14 integration tests pass across the two AI files.
>
> *(Reviewer correction: an earlier version of this note claimed that file was
> "byte-identical to main". That was wrong — `git diff` reports no change for an
> **untracked** file, and I read the empty output as "unmodified" instead of
> "new". The file was also missed by the AISL-5 commit as a result and landed in
> a follow-up. Check `git status`, not `git diff`, before concluding a file is
> unchanged.)*
>
> Reviewer-run gates on merged main: type-check 0, strict-zones 6/6, lint clean,
> `test:fast` **259 files / 2848 tests**, and the two AI integration files
> **14/14** against the Docker Postgres.
>
> **AC3 was wrong and the dev caught it.** It required an `ai_usage` row from
> "each of the five transform endpoints". `/debug` and `/auto-fix` route to
> `TransformDebugger` — 85 lines of deterministic static methods, no model call,
> and outside this ticket's footprint. The dev implemented the three LLM-backed
> endpoints and explicitly refused to fabricate usage for the other two, which
> was correct: fabricated rows would have corrupted AISL-10's per-operation
> economics before that ticket was even written. Finding and AC3 corrected.

**Priority: P1** · Size: M · Files: `server/lib/ai/transformGenerator.ts`, `server/lib/ai/transformRevision.ts`, `server/lib/transforms/schemaAlign.ts`

### Finding

All three files behind `/api/ai/transform/*` construct their own Gemini client.
`getModel()` in `server/lib/ai/transformGenerator.ts`:

```ts
const getModel = (systemPrompt: string) => {
  const apiKey = process.env.GEMINI_API_KEY ?? "";
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    return genAI.getGenerativeModel({
      model: "gemini-1.5-pro",
      systemInstruction: { role: "system", parts: [{ text: systemPrompt }] }
    });
```

`transformRevision.ts` and `schemaAlign.ts` do the same thing at
`new GoogleGenerativeAI(apiKey)` in their own module-level helpers.

Three consequences:

1. **Corrected 2026-08-09:** three of the five transform endpoints —
   `/generate`, `/revise`, `/schema-align` — consume tokens that never reach
   `ai_usage` and are never counted against `AI_TENANT_MONTHLY_TOKEN_BUDGET`.
   A tenant can burn unlimited tokens on those three. `/debug` and `/auto-fix`
   are **not** affected: they route to `TransformDebugger`
   (`server/lib/transforms/debugger.ts`), 85 lines of deterministic static
   methods with no model call at all, and they are outside this ticket's file
   footprint. The original wording said "five endpoints", which overstated the
   scope by two.
2. No retry on 429 — a rate-limited transform generation fails outright where
   the governed path would back off and succeed.
3. `transformGenerator.ts` hardcodes **`gemini-1.5-pro`**, a different model
   from every other call site's `gemini-2.0-flash` and from `GEMINI_MODEL`.
   Nothing selected it deliberately and nothing reports that it is in use.

The routes already have `hybridAuth`, `requireBuilder`, and `aiRateLimit`, so
request-count limiting works — it is only the token accounting and budget that
are missing.

### Preferred fix

Mirror the pattern already used by the hardened ops pipeline in
`server/routes/ai/workflowEdit.routes.ts` — it is the donor:

```ts
const client = new AIProviderClient(resolveAiProviderConfig({ maxTokens: 8192, tenantId }));
```

For each of the three files:

1. Replace the module-level `getModel()` helper with an `AIProviderClient`
   constructed from `resolveAiProviderConfig({ tenantId })`.
2. Move what is currently passed as `systemInstruction` into the
   `systemMessage` argument of `callLLM(prompt, taskType, systemMessage)` —
   that parameter exists precisely for this.
3. Pass the `TaskType` added by AISL-4: `transform_generation`,
   `transform_revision`, `transform_schema_align` respectively.
4. Thread `tenantId` from the route. `api.ai.transform.routes.ts` already has
   `hybridAuth`, so `(req as AuthRequest).tenantId` is available — pass it down
   through each exported function's signature.
5. Delete the hardcoded `gemini-1.5-pro`; the model now comes from config.
6. Keep every `fenceUntrusted(...)` call exactly where it is.

Do not change the Zod response schemas (`transformResponseSchema` and
siblings), the prompts, or the route response shapes.

### Ties

- **Depends on AISL-4** (needs the three new `TaskType` values).
- Parallel-safe with AISL-6, AISL-7, AISL-8 — no shared files.
- Load: `add-api-endpoint` skill, `run-tests` skill.
- Donor pattern to copy: `server/routes/ai/workflowEdit.routes.ts` around the
  `new AIProviderClient(resolveAiProviderConfig(...))` call.
- File footprint: `server/lib/ai/transformGenerator.ts`,
  `server/lib/ai/transformRevision.ts`, `server/lib/transforms/schemaAlign.ts`,
  `server/routes/api.ai.transform.routes.ts`, plus their tests. **No overlap
  with any other Phase 2 ticket.**

### Acceptance criteria

1. None of the three files contains `new GoogleGenerativeAI` — grep proves
   zero occurrences.
2. Each calls `AIProviderClient.callLLM` with its assigned `TaskType`.
3. **Corrected 2026-08-09** (originally said "each of the five endpoints", which
   was wrong — see the Finding). `tenantId` is threaded from
   `api.ai.transform.routes.ts` to all three modules, and a request to each of
   the **three LLM-backed** endpoints — `/generate`, `/revise`, `/schema-align`
   — produces an `ai_usage` row with the correct `tenant_id`, `task_type`, and
   non-zero token counts. `/debug` and `/auto-fix` must write **no** row: they
   never call a model, and fabricating usage for them would corrupt AISL-10's
   per-operation economics.
4. Every `fenceUntrusted(...)` call present before the change is present after
   it, wrapping the same value.
5. The response shape of all five `/api/ai/transform/*` endpoints is unchanged
   — the existing route tests pass without modification.
6. No hardcoded model ID remains in any of the three files.
7. New tests assert 2 and 3 (mock `AIProviderClient`; assert the `taskType`
   argument and that a usage row is written).
8. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast`
   green; the transform-related integration tests green.

---

## AISL-6 — Personalization AI bypasses the governed client ✅

> **Verified 2026-08-09** (worktree `aisl-6`, base `21733c8d`; the only diff to
> main was a docs-only commit, so no drift and no overlap). Zero
> `GoogleGenerativeAI`; `callLLM(prompt, 'personalization')` via a per-call
> client from `resolveAiProviderConfig({ tenantId })`; all seven `fenceUntrusted`
> sites preserved.
>
> The three real early returns are intact and untouched —
> `allowAdaptivePrompts` (line 27), `allowAIClarification` (line 91),
> `targetLanguage === 'en'` (line 161) — and the integration test asserts each
> writes **no** `ai_usage` row. `tenantId` is typed `string` (required) rather
> than optional here, which is right: every personalization route is behind
> `hybridAuth`, so a missing tenant is a bug, not a case to tolerate.
>
> Reviewer-run gates on merged main: type-check 0, strict-zones 6/6, lint clean,
> `test:fast` **259 files / 2848 tests**, AI integration **14/14**.
>
> **This ticket was paused mid-flight** on a contradiction in its own AC4, which
> named `allowDynamicHelp` / `allowDynamicTone` — columns on
> `workflow_personalization_settings`, not runtime guards. The dev stopped and
> reported instead of inventing a gate to satisfy the criterion. Correcting it
> surfaced AISL-12; had the dev improvised, that defect would still be hidden.

**Priority: P1** · Size: M · File: `server/lib/ai/personalization.ts`

### Finding

`PersonalizationService` in `server/lib/ai/personalization.ts` builds its own
Gemini client in the constructor and calls it through a private helper:

```ts
this.genAI = new GoogleGenerativeAI(apiKey ?? "");
const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
this.model = this.genAI.getGenerativeModel({ model });
```

```ts
private async generateText(prompt: string): Promise<string> {
    if (!this.model) {
        throw new Error("Personalization AI is unavailable");
    }

    const result = await this.model.generateContent(prompt);
    return result.response.text().trim();
}
```

Five endpoints run through this — `/api/ai/personalize/{block,help,clarify,followup,translate}`
— and none of their token usage is budgeted or recorded. Because
personalization fires during **runtime interview sessions**, this is the
highest-volume uncounted path in the app: it can run several times per question
per respondent, and the `ai_usage` ledger shows none of it.

The service is instantiated once at module load
(`export const personalizationService = new PersonalizationService()`), so it
captures the provider config at import time and has no tenant context at all.

### Preferred fix

The module-level singleton is the obstacle: a tenant-scoped budget needs a
per-request tenant, and a module singleton cannot have one.

1. Keep the exported singleton for call-site compatibility, but change
   `generateText` to take a `tenantId` and construct its `AIProviderClient`
   per call from `resolveAiProviderConfig({ tenantId })`. Constructing the
   client is cheap — `ProviderFactory.createProvider` is a constructor call, no
   network — so per-call construction is correct here and avoids a wider
   refactor of how the singleton is wired.
2. Add `tenantId` to each public method's signature
   (`rewriteBlockText`, and the four siblings) and thread it from
   `api.ai.personalization.routes.ts`, which already has `hybridAuth` and a
   `getUserContext` middleware.
3. Use `TaskType` `personalization` for all five (they are the same kind of
   work at the same size; separate task types would fragment the reporting in
   AISL-10 for no benefit).
4. Keep the existing early returns exactly as they are — they skip the model
   call entirely and must keep doing so. **Corrected 2026-08-09** (the original
   wording named `allowDynamicHelp` / `allowDynamicTone`, which are columns on
   `workflow_personalization_settings`, not runtime guards; see AISL-12). The
   three real ones are:
   - `rewriteBlockText`: `if (!context.userSettings.allowAdaptivePrompts) return originalText;`
   - `generateClarification`: `if (!context.userSettings.allowAIClarification) { return null; }`
   - `translateText`: `if (targetLanguage === 'en') { return text; }`

   Note `generateHelpText` and `generateFollowUp` have **no** pre-call gate and
   always reach the model. That is the current behavior — do not add a gate
   here; it is AISL-12's job.
5. Keep every `fenceUntrusted(...)` call.

### Ties

- **Depends on AISL-4** (needs the `personalization` `TaskType`).
- Parallel-safe with AISL-5, AISL-7, AISL-8 — no shared files.
- Load: `add-api-endpoint` skill, `run-tests` skill.
- Donor pattern: same as AISL-5 —
  `server/routes/ai/workflowEdit.routes.ts`.
- Note: `workflow_personalization_settings` (in `shared/schema/ai.ts`) gates
  whether these calls happen at all. Do not change that gating.
- File footprint: `server/lib/ai/personalization.ts`,
  `server/routes/api.ai.personalization.routes.ts`,
  `tests/integration/api.ai.personalization.test.ts`. **No overlap with any
  other Phase 2 ticket.**

### Acceptance criteria

1. `server/lib/ai/personalization.ts` contains no `new GoogleGenerativeAI` —
   grep proves zero occurrences.
2. All five public methods accept a `tenantId` and pass it through to
   `resolveAiProviderConfig`.
3. Each of the five `/api/ai/personalize/*` endpoints produces an `ai_usage`
   row with the correct `tenant_id` and `task_type: 'personalization'`.
4. The three existing early returns still skip the model and produce **no**
   `ai_usage` row: `allowAdaptivePrompts === false` in `rewriteBlockText`
   returns the original text; `allowAIClarification === false` in
   `generateClarification` returns `null`; `translateText` with
   `targetLanguage === 'en'` returns the input unchanged. No new gate is added
   (see AISL-12).
5. Every `fenceUntrusted(...)` call present before the change is present after.
6. `tests/integration/api.ai.personalization.test.ts` passes without changes to
   its assertions about response shape.
7. New tests assert 3 and 4.
8. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast`
   green; `api.ai.personalization` integration test green.

---

## AISL-7 — Document-assist AI bypasses the governed client ✅

> **Verified 2026-08-09** (worktree `aisl-7`, base `21733c8d`; the intervening
> main commits touched only AISL-5/6/8 files and the board, so no overlap).
> Zero `GoogleGenerativeAI`; all four AI methods take `tenantId` and route
> through `callLLM` with `document_analysis` / `document_mapping`; `tenantId`
> threaded at four route call sites.
>
> Degraded mode preserved correctly and non-obviously: `resolveAiProviderConfig`
> *throws* when no key is configured, so `createAIClient` catches it, returns
> `null`, and keeps the original warning text — the deterministic path still
> serves `/analyze` with no provider present.
>
> Reviewer-run gates on merged main: type-check 0, strict-zones 6/6, lint clean,
> `test:fast` **2848 tests**, and all three AI integration suites **20/20**.
>
> **Two ticket errors, both mine, both caught by the dev.** AC3 assumed a 1:1
> endpoint↔method mapping; `/extract-text` is a deterministic parse and
> `suggestCleanupActions` has no endpoint at all. The dev left extraction
> uncharged and covered cleanup directly rather than inventing an AI call to
> satisfy the criterion. Mapping table now in AC3.
>
> **Accepted scope expansion — a real security fix.** `suggestCleanupActions`
> (main lines 173–188) built a prompt from document text with **no**
> `fenceUntrusted`. The dev added one. All four pre-existing fences are present
> with identical wrapped values; this is a fifth. That also falsifies the
> audit's claim that fencing coverage was complete — corrected in the Phase 2
> preamble.
>
> **Live proof, per the GH-167 tie:** the dev booted the app and drove the
> onboarding wizard through `document_analysis`. Completion was blocked by a
> **429 quota error from the configured Gemini account** — see the O-17 note in
> the Phase 2 gate below.

**Priority: P1** · Size: M · File: `server/lib/ai/DocumentAIAssistService.ts`

### Finding

`DocumentAIAssistService` in `server/lib/ai/DocumentAIAssistService.ts` builds
its own Gemini client in the constructor:

```ts
this.genAI = new GoogleGenerativeAI(apiKey);
const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
this.model = this.genAI.getGenerativeModel({ model });
```

with a documented degraded mode when the key is absent:

```ts
logger.warn("GEMINI_API_KEY not found. AI Assist Service will run in degraded mode (deterministic only).");
```

It backs four endpoints — `/api/ai/doc/{analyze,extract-text,suggest-mappings,suggest-improvements}`
— across `analyzeTemplate`, `suggestMappings`, `suggestImprovements`, and
`suggestCleanupActions`. None of that usage is budgeted or recorded.

This is the most cost-relevant path to instrument: document analysis sends
extracted template text (`fenceUntrusted(text.substring(0, 2000))` and full
variable lists) and is the operation whose per-unit cost the repo owner most
wants to know (see AISL-10).

The degraded-mode design is good and must survive: `analyzeTemplate` runs
deterministic extraction first and only then augments with AI, so the endpoint
still works with no AI provider configured.

### Preferred fix

1. Replace the constructor-held `genAI`/`model` with an `AIProviderClient`
   constructed per call from `resolveAiProviderConfig({ tenantId })`, same
   shape as AISL-6.
2. Thread `tenantId` from `ai.doc.routes.ts` into the four public methods.
3. Task types: `document_analysis` for `analyzeTemplate` and
   `suggestCleanupActions`; `document_mapping` for `suggestMappings` and
   `suggestImprovements`.
4. **Preserve degraded mode.** `resolveAiProviderConfig` *throws* when no
   provider key is configured — the current code instead sets `model = null`
   and falls back to deterministic-only. Wrap the client construction so that a
   missing key still yields degraded mode rather than a 500. Mirror the
   existing `logger.warn` message so the operational signal is unchanged.
5. Keep every `fenceUntrusted(...)` call — this file has four of them.

### Ties

- **Depends on AISL-4** (needs `document_analysis`, `document_mapping`).
- Parallel-safe with AISL-5, AISL-6, AISL-8 — no shared files.
- Load: `add-api-endpoint` skill, `run-tests` skill.
- Related: **AISL-10** consumes the `task_type` values this ticket starts
  writing; the per-operation cost report is only meaningful once this lands.
- **New consumer since the audit (GH-167, commit `3f5f6b35`):** the document
  onboarding wizard calls `/api/ai/doc/analyze` and
  `/api/ai/doc/suggest-improvements` from the client before
  `DocumentOnboardingService` runs. It does not import
  `documentAIAssistService`, so this ticket's file footprint is unchanged — but
  the wizard breaks if those two endpoints change shape. Exercise it as part of
  the live check (`client/src/pages/onboarding/`).
- File footprint: `server/lib/ai/DocumentAIAssistService.ts`,
  `server/routes/ai.doc.routes.ts`,
  `tests/integration/api.ai.doc.test.ts`. **No overlap with any other Phase 2
  ticket.**

### Acceptance criteria

1. `DocumentAIAssistService.ts` contains no `new GoogleGenerativeAI` — grep
   proves zero occurrences.
2. The four public methods accept a `tenantId` and route through
   `AIProviderClient.callLLM` with the task types assigned above.
3. **Corrected 2026-08-09** — the original text said "each of the four
   `/api/ai/doc/*` endpoints", which wrongly assumed a 1:1 endpoint↔method
   mapping. The real mapping is:

   | Endpoint | Method | Calls a model? |
   |---|---|---|
   | `/analyze` | `analyzeTemplate` | yes → `document_analysis` |
   | `/extract-text` | `extractTextContent` | **no — deterministic parse** |
   | `/suggest-mappings` | `suggestMappings` | yes → `document_mapping` |
   | `/suggest-improvements` | `suggestImprovements` | yes → `document_mapping` |
   | *(no endpoint)* | `suggestCleanupActions` | yes → `document_analysis` |

   So: the three LLM-backed endpoints each produce an `ai_usage` row with the
   correct `tenant_id` and `task_type`; `/extract-text` produces **none**; and
   `suggestCleanupActions` is covered directly rather than through a route.
4. **With no provider key configured**, `analyzeTemplate` still returns its
   deterministic results, logs the existing degraded-mode warning, and does
   **not** throw or return 500. A test proves this.
5. Every `fenceUntrusted(...)` call present before the change is present after.
6. `tests/integration/api.ai.doc.test.ts` passes without changes to its
   response-shape assertions.
7. New tests assert 3 and 4.
8. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast`
   green; `api.ai.doc` integration test green.

---

## AISL-8 — Sentiment AI bypasses the governed client ✅

> **Verified 2026-08-09** (worktree `aisl-8`, base `21733c8d`, docs-only diff to
> main). Zero `GoogleGenerativeAI` in `geminiService.ts`;
> `callLLM(..., 'sentiment_analysis')` via `resolveAiProviderConfig({ tenantId })`;
> `fenceUntrusted(text)` preserved; the mock-only `catch` that rebuilt the model
> is gone. `AiController` threads `authReq.tenantId`, matching the six sibling
> methods.
>
> Reviewer-run gates on merged main: type-check 0, strict-zones 6/6, lint clean,
> `test:fast` **259 files / 2848 tests**.
>
> **One accepted scope expansion, called out by the reviewer rather than the
> ticket.** The availability guard widened from `!process.env.GEMINI_API_KEY` to
> `!process.env.GEMINI_API_KEY && !process.env.AI_API_KEY`. That is three
> characters beyond the letter of the ticket and it is correct: now that
> sentiment runs on the governed client, an OpenAI- or Anthropic-only deployment
> can serve it, and the old guard would have returned 503 on a perfectly working
> configuration. Accepted.
>
> `GeminiService` retains other members, so the file was kept rather than
> deleted — AC1's alternative branch.

**Priority: P2** · Size: S · File: `server/services/geminiService.ts`

### Finding

`GeminiService` in `server/services/geminiService.ts` is a whole service class
whose only live consumer is one method. `AiController.analyzeSentiment` is its
sole caller:

```ts
const result = await geminiService.analyzeSentiment(text);
```

and `analyzeSentiment` builds its own model, twice, with a fallback path:

```ts
const model = genAI.getGenerativeModel({
  model: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
  systemInstruction: { role: "system", parts: [{ text: systemPrompt }] }
});
result = await model.generateContent(`Text: "${fenceUntrusted(text)}"`);
} catch (e) {
  // Fallback if genAI model creation fails (e.g. in some mock setups)
  const prompt = `${systemPrompt}\n\nText: "${fenceUntrusted(text)}"`;
  result = await fallbackModel.generateContent(prompt);
}
```

`POST /api/ai/sentiment` is the only endpoint affected. It is the smallest of
the four bypass domains, hence P2 — but it is also the cleanest to convert, and
leaving it behind means `grep "new GoogleGenerativeAI" server/` never reaches
zero, which is the check that makes this initiative verifiable.

Note the duplicated-model dance in the `catch` exists purely to survive test
mocks, and should disappear entirely once the call goes through
`AIProviderClient` (which is mocked at a different seam).

### Preferred fix

1. Convert `analyzeSentiment` to `AIProviderClient.callLLM(prompt, 'sentiment_analysis', systemPrompt)`,
   constructed from `resolveAiProviderConfig({ tenantId })`.
2. Thread `tenantId` from `AiController.analyzeSentiment` — the controller
   already reads `authReq.tenantId` for its six other methods, so follow that
   existing line exactly.
3. Delete the `catch` fallback that re-creates the model; it exists only for
   mock setups that no longer apply.
4. Keep the `fenceUntrusted(text)` call and the `sentimentResponseSchema`
   validation, including the existing behavior of returning a neutral fallback
   object when parsing fails.
5. If, after conversion, `GeminiService` has no remaining members, **delete the
   file and its export** rather than leaving an empty class. Check for other
   importers first (`grep -rn "geminiService" server/ client/`).

### Ties

- **Depends on AISL-4** (needs the `sentiment_analysis` `TaskType`).
- Parallel-safe with AISL-5, AISL-6, AISL-7 — no shared files.
- **Closes out the Phase 2 gate check** (`grep "new GoogleGenerativeAI" server/`
  returning only `server/services/ai/providers/GeminiProvider.ts`).
- Load: `add-api-endpoint` skill, `run-tests` skill.
- File footprint: `server/services/geminiService.ts`,
  `server/controllers/AiController.ts` (`analyzeSentiment` only),
  `tests/unit/services/`. **No overlap with any other Phase 2 ticket.**

### Acceptance criteria

1. `server/services/geminiService.ts` contains no `new GoogleGenerativeAI`, or
   the file is deleted along with all its imports.
2. `POST /api/ai/sentiment` routes through `AIProviderClient.callLLM` with
   `task_type: 'sentiment_analysis'` and produces an `ai_usage` row carrying
   the caller's `tenant_id`.
3. The endpoint's response shape is unchanged, including the neutral fallback
   returned when the model's JSON fails schema validation. A test covers the
   fallback.
4. `fenceUntrusted(text)` is still applied to the input.
5. `grep -rn "new GoogleGenerativeAI" server/` returns **exactly one** match:
   `server/services/ai/providers/GeminiProvider.ts`.
6. New/updated tests assert 2 and 3.
7. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast`
   green.

---

## Phase 2 Gate — ✅ PASSED 2026-08-09

- [x] AISL-5..8 all ✅ with dated verification notes
- [x] **`grep -rn "new GoogleGenerativeAI" server/` returns exactly one file** —
      `GeminiProvider.ts` (2 matches, both legitimate). **The second AI stack no
      longer exists.**
- [x] `npm run type-check` → `Found 0 errors`
- [x] `npm run lint` → clean at `--max-warnings 0`
- [x] `npm run check:strict-zones` → 6 zones / 11 files, ALL PASSED
- [x] `npm run test:fast` → **2848 passed**, up from the 2837 Phase 1 baseline
- [x] Integration green for all three AI files
      (`api.ai.doc`, `api.ai.transform`, `api.ai.personalization`) — **20/20**
- [x] Live proof: AISL-7's dev booted the app and drove the onboarding wizard to
      `document_analysis` (see below)
- [x] Reviewer has committed each passed ticket + this gate

### What this phase actually achieved

`AI_PROVIDER` now means something. Before Phase 2, setting it moved the governed
stack and silently left `/api/ai/transform/*`, `/api/ai/doc/*`,
`/api/ai/personalize/*` and `/api/ai/sentiment` on Gemini regardless. Every LLM
call in the app now flows through `AIProviderClient` and therefore through the
tenant budget, the `ai_usage` ledger, retry/backoff, and cost telemetry.
**The provider decision is unblocked.**

### O-17: strong new evidence

AISL-7's live verification was blocked by a **429 quota error from the configured
Gemini account**, not by a code fault. Combined with the earlier finding that
prod's `GEMINI_MODEL=gemini-2.0-flash` is a valid, registered model, O-17 is now
narrowed to a **vendor quota/billing problem, not a misconfiguration**. The model
name is right; the account is capped. This wants an operational fix (billing or
key), not a code change — and AISL-10 will make the same signal visible as data
rather than as a blocked wizard.

### Three ticket errors in one phase — the pattern

AISL-5 AC3, AISL-6 AC4, and AISL-7 AC3 were all wrong the same way: acceptance
criteria written from the **endpoint list** rather than from reading what each
handler actually calls. Two assumed a 1:1 endpoint↔method mapping that does not
hold (`/debug`, `/auto-fix`, `/extract-text` are all deterministic); one named
DB column names as if they were runtime guards. Every one was caught by a dev
who stopped and asked instead of improvising, and one of those escalations
surfaced AISL-12. **When writing a ticket that asserts "endpoint X does Y", open
the handler and follow the call.**

---

# Phase 3 — Cost visibility and control

With every call flowing through one client, the budget and the ledger finally
describe the whole system. These three tickets make them accurate and useful.

## AISL-9 — Budget on dollars, not raw token count ✅

> **Verified 2026-08-09** (worktree `aisl-9`, base `b0353a2d` — current main).
> All 8 criteria met. `getCostUsdSince` mirrors `getTokenUsageSince` exactly
> (same `COALESCE(...,0)` → returns 0 for a tenant with no rows); three
> cents-based `envInt` limits at $50 hard / $45 throttle / $40 warn; the hard
> ceiling throws with the **unchanged** user-facing message and code; throttle
> and warn are log-only and correctly mutually exclusive via `else if`; the
> token budget still runs afterward as a secondary ceiling.
>
> Reviewer-run gates on merged main: type-check 0, strict-zones 6/6, lint clean,
> `test:fast` **260 files / 2853 tests**, `test:unit:db` **16 files / 147 tests**.
>
> **Three files outside the stated footprint — all legitimate, and the ticket's
> Ties should have predicted them.** (a) `vitest.config.ts` had to register the
> new DB test in `dbUnitTests`, which is mandatory in this repo for a unit-db
> file to run in the right project. (b/c) `transformGovernance.test.ts` (AISL-5)
> and `GeminiService.test.ts` (AISL-8) each needed a two-line
> `getCostUsdSince` spy — adding a repo call inside `callLLM` breaks every test
> that mocks the repo with only the old methods, and without the stub they hit a
> real database. No assertions were altered in either.
>
> **Reviewer fix applied:** the cost-triggered throw carried `usedTokens` and the
> *token* budget in its `details`, so an operator debugging a BUDGET_EXCEEDED
> would have been sent to a token count that was under limit. Both branches now
> carry `basis: 'cost' | 'tokens'` in the log line and the error details, so the
> two `ai_budget_exceeded` events are distinguishable at a glance.
>
> **On the red `test:fast`:** the dev reported 3 failures plus an unhandled
> `IntegrationHub` error and dismissed them as "pre-existing flaky tests in the
> baseline". The conclusion was right, the reasoning was not — main was fully
> green at `b0353a2d`, so the baseline is not red. It is the documented
> order-dependent flake, and a reviewer rerun of the same worktree came back
> **259 files / 2851 tests, zero failures**. Filed as AISL-B11: three
> consecutive devs have now hit this and each had to judge whether red meant red.

**Priority: P1** · Size: M · Files: `server/repositories/AiUsageRepository.ts`, `server/services/ai/AIProviderClient.ts`

### Finding

The budget sums input and output tokens as one undifferentiated number.
`getTokenUsageSince()` in `server/repositories/AiUsageRepository.ts`:

```ts
total: sql<string>`COALESCE(SUM(${aiUsage.inputTokens} + ${aiUsage.outputTokens}), 0)`,
```

compared in `enforceBudget` against `LIMITS.AI_TENANT_MONTHLY_TOKEN_BUDGET`
(20,000,000 tokens over a 30-day rolling window).

Output tokens cost **3–10× input** across every model in `MODEL_CONFIGS` — for
`gemini-2.0-flash`, $0.10 vs $0.40 per 1M. So a tenant doing output-heavy
workflow generation gets the same allowance as one doing cheap classification,
and the budget under-prices the expensive tenant by up to 4×.

`cost_usd` is already computed and stored on every row
(`ModelRegistry.estimateCost` → `aiUsageRepo.recordUsage`) and is simply never
read back.

There is also no gradation: the tenant goes from working to
`BUDGET_EXCEEDED` with no warning. `LIMITS` has one threshold and no
warn/throttle tiers.

### Preferred fix

1. Add `getCostUsdSince(tenantId, since, tx?)` to `AiUsageRepository`,
   mirroring `getTokenUsageSince` exactly but summing `cost_usd`. Keep the
   token method — AISL-10 reports on both.
2. Add three limits to `shared/limits.ts` alongside the existing AI block,
   following the `envInt` convention already used there (a cents-based
   `envInt` avoids float env parsing):
   - `AI_TENANT_BUDGET_USD_CENTS` (hard limit)
   - `AI_TENANT_BUDGET_WARN_CENTS` (log a warning, do not block)
   - `AI_TENANT_BUDGET_THROTTLE_CENTS` (between warn and hard)
3. Rework `enforceBudget` to compare against dollars: emit
   `event: 'ai_budget_warning'` at the warn threshold,
   `event: 'ai_budget_throttled'` at the throttle threshold, and throw the
   existing `AIError('...', 'BUDGET_EXCEEDED', ...)` at the hard limit. The
   thrown error's message and code must not change — the client surfaces it.
4. **Throttle behavior is the repo owner's call and is not specified here.**
   Ship the throttle tier as *log-only* in this ticket, with the enforcement
   point clearly marked. Do not invent a queueing or degradation policy.
5. Keep `AI_TENANT_MONTHLY_TOKEN_BUDGET` in place and still enforced as a
   secondary ceiling — removing it in the same ticket that adds a new
   accounting basis makes a regression impossible to attribute.

### Ties

- **Depends on AISL-2** (touches `enforceBudget`) and on **all of Phase 2** —
  a dollar budget computed over a ledger that is missing most of the traffic is
  worse than the token one, because it looks authoritative.
- Load: `add-api-endpoint` skill (repository pattern), `run-tests` skill.
- Uses DB-backed tests → **cannot run concurrently with another DB suite.** If
  dispatched alongside AISL-10, sequence the test runs.
- File footprint: `server/repositories/AiUsageRepository.ts`,
  `server/services/ai/AIProviderClient.ts`, `shared/limits.ts`,
  `tests/unit/services/ai/AIProviderClient.test.ts`, unit-db repository tests.
  Collides with **AISL-10** (`AiUsageRepository.ts`).

### Acceptance criteria

1. `AiUsageRepository.getCostUsdSince()` exists and returns the summed
   `cost_usd` for a tenant over a window; returns `0` for a tenant with no rows.
2. `shared/limits.ts` defines the three new cents-based limits with `envInt`
   defaults and env-var overrides.
3. `enforceBudget` logs `ai_budget_warning` at/above the warn threshold and
   allows the call.
4. `enforceBudget` logs `ai_budget_throttled` at/above the throttle threshold
   and allows the call (log-only in this ticket).
5. `enforceBudget` throws `AIError` with code `BUDGET_EXCEEDED` and the
   existing user-facing message at/above the hard limit.
6. The token budget is still enforced as a secondary ceiling — a tenant over
   the token limit but under the dollar limit is still blocked.
7. New unit-db tests assert 1, and unit tests assert 3, 4, 5, and 6 by seeding
   usage rows at each threshold.
8. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast` and
   `npm run test:unit` green.

---

## AISL-10 — No per-operation unit economics 🔲

**Priority: P1** · Size: S · File: `server/repositories/AiUsageRepository.ts`

### Finding

`ai_usage` records `task_type`, `provider`, `model`, both token counts, and
`cost_usd` per call, indexed on `(tenant_id, created_at)` — everything needed
to answer "what does one document analysis cost us?" — and **nothing reads it
back**. `AiUsageRepository` has exactly two methods:

```ts
async recordUsage(entry: InsertAiUsage, tx?: DbTransaction): Promise<AiUsage>
async getTokenUsageSince(tenantId: string, since: Date, tx?: DbTransaction): Promise<number>
```

The admin surface reports AI *feedback* stats
(`/api/admin/ai-settings/feedback/{stats,recent}`) but no AI *cost* stats.

Without this, every model- or provider-selection decision is made on list
prices instead of measured cost, and the escalation-ladder question (AISL-B2)
cannot be evaluated at all.

### Preferred fix

1. Add `getUsageBreakdownSince(since, opts?)` to `AiUsageRepository`, grouping
   by `task_type`, `provider`, and `model`, returning per-group: call count,
   summed input tokens, summed output tokens, summed `cost_usd`, and mean
   `cost_usd` per call. Accept an optional `tenantId` filter — omitted means
   all tenants (admin view).
2. Expose it at `GET /api/admin/ai-settings/usage` behind `hybridAuth` +
   `isAdmin`, mirroring the existing
   `/api/admin/ai-settings/feedback/stats` handler in
   `server/routes/admin.aiSettings.routes.ts` — same file, same middleware
   chain, same response envelope. That handler is the donor pattern; copy its
   shape rather than inventing one.
3. Accept a `days` query param (default 30, validated with Zod, capped at 365)
   to set the window.

No client UI in this ticket — the endpoint is the deliverable. A dashboard, if
wanted, is a separate ticket.

### Ties

- **Depends on all of Phase 2** — the numbers are misleading until every
  domain writes to the ledger. Explicitly: do not dispatch this before the
  Phase 2 gate passes.
- **Feeds AISL-B2** (model tiering) — that backlog item is unevaluable without
  this data.
- Load: `add-api-endpoint` skill (route → service → repository, Zod validation,
  `classifyRouteError`), `run-tests` skill.
- Uses DB-backed tests → sequence against **AISL-9** rather than running both
  DB suites at once.
- File footprint: `server/repositories/AiUsageRepository.ts`,
  `server/routes/admin.aiSettings.routes.ts`, tests. Collides with **AISL-9**
  (`AiUsageRepository.ts`).

### Acceptance criteria

1. `AiUsageRepository.getUsageBreakdownSince()` returns per-`(task_type,
   provider, model)` rows with count, input tokens, output tokens, total
   `cost_usd`, and mean `cost_usd` per call.
2. Passing a `tenantId` scopes the result to that tenant; omitting it returns
   all tenants.
3. `GET /api/admin/ai-settings/usage` returns that breakdown, requires
   `hybridAuth` + `isAdmin`, and returns 403 for a non-admin authenticated user.
4. `?days=N` sets the window; a non-numeric or out-of-range `days` returns 400
   with validation details; omitting it defaults to 30.
5. A tenant with no usage rows yields an empty array, not an error.
6. New unit-db tests assert 1, 2, and 5; a route test asserts 3 and 4.
7. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast` and
   `npm run test:unit` green.

---

## AISL-11 — System prompt is not a stable cacheable prefix ✅

> **Verified 2026-08-09** (worktree `aisl-11`, base `b0353a2d` — current main).
> All 7 criteria met, two files touched, nothing outside scope.
> `buildWorkflowVocabulary()` now leads and the three placeholders trail it as a
> `Role: / Reading level: / Tone:` block; every guideline line is preserved
> verbatim; all three placeholders remain, exactly once each;
> `tests/unit/shared/aiVocabulary.test.ts` is untouched and passes.
>
> Reviewer-run gates on merged main: type-check 0, strict-zones 6/6, lint clean,
> `test:fast` **260 files / 2853 tests**.
>
> One necessary consequence, accepted: the opening sentence changed from
> *"You are an expert {{interviewerRole}} helping to…"* to *"You are an expert
> helping to…"*, because an inline placeholder cannot move to the end without
> rewording the sentence containing it. The instruction content is equivalent
> and the change is minimal. Placing role/tone/reading-level last is also
> neutral-to-favorable for instruction following.
>
> **This ticket does not enable caching anywhere** — it only makes the prefix
> cacheable. Turning it on is AISL-B3, still blocked on the provider decision.

**Priority: P2** · Size: S · File: `server/routes/ai/workflowEdit.routes.ts`

### Finding

Provider prompt caching keys on an exact byte-prefix match, and ezBuildr's
system prompt is *almost* a perfect candidate: `DEFAULT_SYSTEM_PROMPT` plus
`buildWorkflowVocabulary()` is large, generated at module load from the
platform's own Zod schemas, and identical for every request.

Three per-request substitutions break it. In
`server/routes/ai/workflowEdit.routes.ts`:

```ts
const readingLevel = preferences?.readingLevel ?? "standard";
const interviewerRole = preferences?.interviewerRole ?? "workflow designer";
...
  .replace(/{{interviewerRole}}/g, interviewerRole)
  .replace(/{{readingLevel}}/g, readingLevel)
  .replace(/{{tone}}/g, tone);
```

Because the placeholders sit **inside** the prompt body, every distinct
preference combination produces a distinct prefix. The vocabulary catalog — by
far the largest and most stable part — sits after them and is re-billed for
each combination instead of being shared across all tenants.

The volatile per-request content is already correctly downstream (the
`fenceUntrusted(workflowContext)` and `fenceUntrusted(userMessage)` blocks are
in the user turn), so this is the only thing standing between the current
prompt and a single shared cacheable prefix.

This ticket is **structural only** — it does not enable caching on any
provider. Enabling it is AISL-B3, which is blocked on the provider decision.

### Preferred fix

Restructure `DEFAULT_SYSTEM_PROMPT` in `server/services/AiSettingsService.ts`
so the stable content leads and the personalized content trails:

1. Move `${buildWorkflowVocabulary()}` and the fixed guideline list to the
   **top** of the template.
2. Move the three `{{...}}` placeholder lines to the **end**, as a short
   trailing block.
3. Leave the substitution code in `workflowEdit.routes.ts` unchanged — it is
   a `String.replace` on placeholder tokens and does not care where they sit.
4. Update the admin warning in `admin.aiSettings.routes.ts` only if its
   placeholder list changes (it should not).

Do not change the *wording* of any guideline, and do not remove the
placeholders — an admin-supplied custom prompt may rely on them, and
`admin.aiSettings.routes.ts` already warns when they are absent.

### Ties

- **Enables AISL-B3** (provider prompt caching) — that backlog item is blocked
  on the provider decision, this one is not.
- Load: `run-tests` skill.
- Related: `tests/unit/shared/aiVocabulary.test.ts` covers the generated
  catalog; check it still passes unchanged.
- File footprint: `server/services/AiSettingsService.ts`,
  `tests/unit/`. Minimal overlap — safe to dispatch alongside AISL-9/10.

### Acceptance criteria

1. In `DEFAULT_SYSTEM_PROMPT`, all three `{{...}}` placeholders appear **after**
   the full output of `buildWorkflowVocabulary()`.
2. The set of placeholders is unchanged: `{{interviewerRole}}`,
   `{{readingLevel}}`, `{{tone}}` all still present exactly once each.
3. Substitution in `workflowEdit.routes.ts` still replaces all three; the
   fully-rendered prompt contains no residual `{{` sequence.
4. The rendered prompt still contains every guideline line and the complete
   vocabulary catalog — no content dropped in the reordering.
5. A new test renders the prompt with a preferences object and asserts 2, 3,
   and that the index of the first placeholder is greater than the index of the
   vocabulary catalog's last line.
6. `tests/unit/shared/aiVocabulary.test.ts` passes unchanged.
7. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast`
   green.

---

## Phase 3 Gate

- [ ] AISL-9..11 all ✅ with dated verification notes
- [ ] `npm run type-check` → `Found 0 errors`
- [ ] `npm run lint` → clean
- [ ] `npm run test:fast` and `npm run test:unit` green
- [ ] **Live proof:** with the dev server up, exercise one endpoint from each
      domain, then `GET /api/admin/ai-settings/usage` and confirm the breakdown
      shows distinct `task_type` rows with non-zero `cost_usd`. Screenshot or
      response body attached.
- [ ] Reviewer has committed each passed ticket + this gate

---

## AISL-12 — Every `workflow_personalization_settings` toggle is dead 🔲

**Priority: P1 (bug)** · Size: M · File: `server/lib/ai/personalization.ts`

### Finding

`workflow_personalization_settings` in `shared/schema/ai.ts` defines three
per-workflow AI opt-outs, all defaulting to on:

```ts
allowDynamicPrompts: boolean("allow_dynamic_prompts").default(true).notNull(),
allowDynamicHelp: boolean("allow_dynamic_help").default(true).notNull(),
allowDynamicTone: boolean("allow_dynamic_tone").default(true).notNull(),
```

**Corrected 2026-08-09 — the mechanism is more specific than "nothing reads
them", and it changes the cost of each option.** The row *is* loaded, on every
personalization request carrying a `workflowId`, by the `getUserContext`
middleware in `server/routes/api.ai.personalization.routes.ts`:

```ts
const [ws] = await db
    .select()
    .from(workflowPersonalizationSettings)
    .where(eq(workflowPersonalizationSettings.workflowId, workflowId))
    .limit(1);
workflowSettings = ws;
```

It is then placed on the context, and the field is declared on the type
(`server/lib/ai/personalization.ts`):

```ts
interface PersonalizationContext {
    userSettings: UserPersonalizationSettings;
    workflowSettings?: WorkflowPersonalizationSettings;   // populated, never read
    ...
}
```

Every `PersonalizationService` method receives it and **not one reads it**. The
guards that do fire read a different object — `context.userSettings`, from
`user_personalization_settings`. So the value travels DB → query → context →
method parameter → discarded.

**And nothing writes the table.** `POST /api/ai/personalize/settings` writes
`user_personalization_settings` only; there is no workflow-level write endpoint
and no builder UI for it. So even wired up, the toggles are currently
unsettable and every row would sit at its `true` default.

Consequence: a tenant who turns off dynamic help or dynamic tone **for a
workflow** still gets dynamic help and dynamic tone. The setting is persisted,
surfaced, and ignored. `generateHelpText` and `generateFollowUp` have no
pre-call gate at all, so there is no code path where `allowDynamicHelp` could
take effect even accidentally.

This is the O-10 failure mode from CLAUDE.md convention 8 — a setting that
exists, defaults to on, and gates nothing, so every "off" is unreachable. It was
found while working AISL-6, whose acceptance criteria had inherited the same
confusion between the settings-table column names and the runtime guard names.

Also worth deciding as part of this: whether `enabled` and `defaultTone` /
`defaultReadingLevel` / `defaultVerbosity` on the same table are live, or dead
in the same way.

### Preferred fix

**Decision recorded 2026-08-09 by the repo owner: option (a) — honor the
settings in the service.** Dropping the columns was rejected: it would need a
`DROP COLUMN` migration against a database production shares (see LU-B1) plus
changes to the portability disclosure, `entityGraph`, and four docs, to delete
something that costs nothing once honored — and per-workflow AI opt-out is a
plausible near-term compliance requirement for legal intake work, which a
*user*-level preference structurally cannot express.

**Scope is the read side only.** The value already reaches the service — the
middleware populates `context.workflowSettings` and every method receives it.
Consult it; do not add a query, an endpoint, or UI.

1. In `PersonalizationService`, read `context.workflowSettings` alongside
   `context.userSettings`:
   - `rewriteBlockText` → also gated by `allowDynamicPrompts`
   - `generateHelpText` → gated by `allowDynamicHelp` (it currently has **no**
     gate; this adds its first one)
   - tone application → gated by `allowDynamicTone`
2. **The merge must be restrictive: a workflow setting may only *disable*,
   never re-enable.** `userSettings.allowAdaptivePrompts === false` must stay
   off no matter what the workflow row says. An AI opt-out a workflow can
   silently override is worse than none.
3. `context.workflowSettings` is optional (`?`). Absent row = no additional
   restriction — treat it as all-permissive, matching today's behavior.
4. A disabled path must return early **without** calling the model, exactly like
   the existing `allowAdaptivePrompts` guard, so it produces no `ai_usage` row.

Behavior is unchanged for every existing caller: all three columns default to
`true`, and nothing writes the table today (that write path is AISL-B10). This
ticket makes the setting *mean* something; giving users a way to set it is a
separate, later piece of work.

Do **not** add a migration, a settings endpoint, or builder UI here.

### Ties

- **Sequence after AISL-6** — both edit `server/lib/ai/personalization.ts`;
  dispatching them together guarantees a collision.
- AISL-6 corrected its AC4 to describe the three *real* early returns; this
  ticket owns the missing ones.
- Load: `add-api-endpoint` skill; `db-schema-change` skill **only if** option
  (b) is chosen.
- Related: CLAUDE.md convention 8 and `tests/unit/client/store.deadSetters.test.ts`
  document the same class of defect on the client side.
- File footprint: `server/lib/ai/personalization.ts`,
  `server/routes/api.ai.personalization.routes.ts`, `shared/schema/ai.ts`
  (option b only), tests.

### Acceptance criteria

1. `allowDynamicHelp = false` on the workflow row makes `generateHelpText`
   return without calling the model and **without** producing an `ai_usage` row.
2. Same for `allowDynamicPrompts` on `rewriteBlockText` and `allowDynamicTone`
   on tone application.
3. The merge is restrictive: with `userSettings.allowAdaptivePrompts = false`
   and `workflowSettings.allowDynamicPrompts = true`, the model is **not**
   called. A workflow row can never re-enable what the user disabled.
4. With `context.workflowSettings` undefined, behavior is byte-identical to
   today for all five endpoints.
5. With all three columns at their `true` default, behavior is byte-identical to
   today — a test proves this, since that is the state of every existing row.
6. Tests cover 1–5, including at least one asserting no `ai_usage` row is
   written on a disabled path.
7. `enabled`, `defaultTone`, `defaultReadingLevel`, and `defaultVerbosity` on the
   same table have been checked for the same read-and-discard defect, and the
   result is recorded in this ticket even where fixing them is out of scope.
8. No migration, no new endpoint, no UI (see AISL-B10).
9. `npm run type-check` 0 errors; `npm run lint` clean; `npm run test:fast`
   green.

---

# Backlog / observations

Not phase-gated. Not dispatchable as written. Promote to a ticket only with the
repo owner's agreement.

**AISL-B1 — Structured outputs would delete the JSON-parsing subsystem.**
`needs-initiative`, Size L, escalated. Every AI response currently runs through
`stripMarkdownCodeBlocks` → `JSON.parse` → Zod validate → truncation detection
(`isResponseTruncated`: ends-with-brace, balanced-delimiter count, re-parse) →
`INVALID_RESPONSE` / `RESPONSE_TRUNCATED` error paths and their troubleshooting
hints. Both Anthropic (`output_config.format` with `json_schema`) and OpenAI
support schema-constrained output; Gemini has `responseSchema`. ezBuildr already
has Zod schemas for every response shape (`AIGeneratedWorkflowSchema`,
`AIConnectLogicResponseSchema`, `aiModelResponseSchema`) that would feed the
constraint directly. This is a subtraction — it removes a whole class of runtime
failure — but it is provider-coupled and should not be attempted before the
provider decision, and it is too large for one ticket.

**AISL-B2 — Model tiering / escalation ladder.** `needs-initiative`, blocked on
AISL-10. `TaskType` is already the natural routing key and `TASK_MAX_TOKENS`
already varies output caps per task, so routing *model* by task is a small
change to an existing structure. Two cautions recorded at audit: (a)
`IterativeQualityImprover` is already an escalation loop (3 iterations / 25¢
cap) and a second escalation axis multiplies against it — design them together;
(b) the current cheap tier is `gemini-2.0-flash` at $0.10/$0.40, so the savings
are much smaller for workflow generation than for the document path. ezBuildr
has a better escalation trigger than self-reported model confidence:
`WorkflowQualityValidator` produces a deterministic score with a breakdown.

**AISL-B3 — Enable provider prompt caching.** `needs-initiative`, blocked on the
provider decision; AISL-11 is its prerequisite and is not blocked. Cache reads
run ~0.1× input price and ezBuildr's system prompt is a large stable prefix, so
this is likely the largest single cost lever available. Implementation differs
sharply by provider (Anthropic `cache_control` breakpoints; Gemini explicit
`CachedContent` with a TTL and a token minimum; OpenAI automatic prefix
caching), which is why it cannot be specified until the provider is chosen.

**AISL-B4 — Three duplicated definitions in the AI layer.** `enhancement`,
Size S. (a) `VALID_STEP_TYPES` and `TYPE_ALIASES` exist verbatim in both
`server/services/ai/types.ts` and `server/services/ai/AIServiceUtils.ts`;
(b) truncation detection is duplicated between `AIServiceUtils.isResponseTruncated`
and `BaseAIProvider.isResponseTruncated`; (c) env→config resolution is
duplicated between `providerConfig.resolveAiProviderConfig` and
`AIService.createAIServiceFromEnv`. Each pair agrees today by discipline alone.
The step-type copy is the dangerous one given `add-step-type` already lists ~10
places to touch. Deliberately not bundled into Phase 1 — it would collide with
AISL-3 and AISL-4 for no functional gain.

**AISL-B5 — `__qualityScore` side channel.** `enhancement`, Size S.
`WorkflowGenerationService.generateWorkflow` attaches quality metadata to the
returned object via `(validated as any).__qualityScore = qualityScore` and the
caller `delete`s it. A return type would express this properly. Cosmetic; two
`eslint-disable` lines ride on it.

**AISL-B6 — Retry loop has no wall-clock deadline and no circuit breaker.**
`enhancement`. `AIProviderClient.callLLM` allows 6 attempts with exponential
backoff capped at 60s per wait, with no total time budget — a request can stay
open for several minutes. There is also no breaker, so a provider outage means
every tenant pays full retry cost on every call. Not urgent while the provider
is stable; revisit if an outage bites.

**AISL-B7 — `WorkflowOptimizationService` is not an AI service.**
`informational`. It lives in `server/services/ai/`, is exported from
`ai/index.ts`, and is served at `/api/ai/workflows/optimize/*`, but makes **no
LLM call at all** — `analyze()` and `applyFixes()` are pure rule-based analysis.
Nothing is broken. Recorded because it will mislead the next person auditing AI
cost or deciding which endpoints need budget coverage. Do not "fix" by adding
an LLM call.

**AISL-B11 — The `IntegrationHub` flake is eroding the `test:fast` gate.**
`needs-initiative`, Size S. Three consecutive AISL devs (6, 7, 9) hit failures in
`client/src/components/builder/integrations/IntegrationHub.tsx` tests —
variously described as a "mock race" and as
`TypeError: Cannot read properties of undefined (reading 'find')` — that clear on
a rerun or in isolation. Main itself is green, so this is the documented
order-dependent flake, surfaced whenever a new test file shifts scheduling.

**Why it is worth fixing rather than tolerating:** every dev now has to *judge*
whether a red gate means red, and one of them will eventually judge wrong in the
other direction. AISL-9's dev called it "pre-existing failures in the baseline",
which is a reasonable-sounding but false description that would justify shipping
red indefinitely. A gate that requires interpretation is not a gate. Fix the
mock's setup/teardown so it is order-independent.

**AISL-B10 — No way to set a workflow's personalization toggles.**
`needs-initiative`, Size M. AISL-12 makes `allowDynamicPrompts` /
`allowDynamicHelp` / `allowDynamicTone` *mean* something, but nothing writes
`workflow_personalization_settings` — there is no workflow-level settings
endpoint and no builder UI, so every row sits at its `true` default and the
toggles are unsettable. Completing the feature needs a write endpoint mirroring
`POST /api/ai/personalize/settings` (which handles the *user* table) plus a
builder surface, most naturally in the workflow settings tab.

**Deliberately parked, not descoped.** The expected trigger is a compliance
requirement rather than a preference: for legal intake work, "do not let AI
rewrite the wording on this form" is a guarantee a tenant admin needs to make
about a *workflow*, which a per-user preference structurally cannot express.
Promote when that requirement actually lands — building the UI on speculation is
what produced the half-wired state AISL-12 is fixing. The read path will already
be correct and tested by then.

**AISL-B9 — Anonymous public-link runs still call AI untenanted.** `enhancement`,
Size S. Found during AISL-2 review. `runs.routes.ts` now reads `authReq.tenantId`
for both branches, but on the anonymous public-link path there is no
authenticated user, so `tenantId` is `undefined` and a `randomize` run still
reaches the model unbudgeted. AISL-2's criteria are met as written and the new
`ai_client_untenanted` warn makes the remaining case visible, which is what that
warn is for. The fix is to resolve the tenant from the *workflow* rather than the
request on that path — out of AISL-2's stated scope, so not folded in.

**AISL-B8 — Per-user / per-org system prompt scoping.** `product-decision`,
originally ICW-15. `ai_settings.scope` already has the column
(`'global' | 'org' | 'user'`) and an index, but `AiSettingsService` implements
only the global override and says so in a comment. Whether tenants should be
able to override the system prompt is the repo owner's call, not an
implementation gap.

---

## Escalations for the repo owner

Raised during ticket generation per the skill's Stage 2 rule, before dispatch:

1. **AISL-B1 (structured outputs) is Size L and provider-coupled** — it would
   delete a real subsystem and remove a class of runtime failure, but it should
   not be attempted before the provider decision, and it does not fit in one
   ticket. Parked rather than ticketed. Say the word and it becomes its own
   initiative.
2. **AISL-B2 (model tiering) is the idea from the ChatGPT thread** and is
   deliberately *not* ticketed — it is unevaluable until AISL-10 produces real
   per-operation costs, and the current cheap tier is already near the bottom
   of the price curve. Revisit after Phase 3 with data.
3. **AISL-9 ships the throttle tier as log-only.** What "throttled" should
   actually *do* — queue, degrade to a cheaper model, hard-fail early — is a
   product decision. The enforcement point is marked in the code; the policy is
   yours.
4. **These tickets do not pick a provider.** They make the layer switchable.
   The provider choice is a separate decision and is best made after Phase 3,
   on measured cost rather than list prices.
