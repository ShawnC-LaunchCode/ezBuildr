# AI Service Layer (AISL) — retired 2026-08-10

Audited 2026-08-09 at grade **B−** and parted into AISL-1..12 across three
phases. **All twelve tickets closed and all three phase gates passed.** Eleven
backlog entries are parked below.

Full ticket text, acceptance criteria and per-ticket verification notes:
`git log -p -- tickets/AI_SERVICE_LAYER_TICKETS.md`.

`test:fast` **2823 → 2861** across the initiative. Pushed to `origin/main` at
`286d527a`.

## Why it existed

ezBuildr had **two AI stacks**. The governed one (`server/services/ai/`) funnelled
every call through `AIProviderClient` — per-tenant token budget, `ai_usage`
ledger, retry/backoff, cost telemetry — behind a three-provider abstraction. A
second set of call sites constructed `new GoogleGenerativeAI(...)` directly and
got none of it, while ignoring `AI_PROVIDER` entirely. By endpoint count the
ungoverned stack was the *majority* of the AI surface: all of
`/api/ai/transform/*`, `/api/ai/doc/*`, `/api/ai/personalize/*`, and
`/api/ai/sentiment`.

The consequence that made it urgent: **the repo owner was evaluating a production
provider switch and it was impossible.** Setting `AI_PROVIDER=openai` would have
moved the governed half and silently left the rest on Gemini — and the governed
half would have hard-failed on context-window validation, because `ModelRegistry`
had never heard of any current OpenAI model.

## What it delivered

- **Every LLM call flows through `AIProviderClient`.**
  `grep -rn "new GoogleGenerativeAI" server/` matches only `GeminiProvider.ts`.
- **`AI_PROVIDER` means what it says.** The provider decision is unblocked.
- **Budgets denominated in dollars**, with warn and throttle tiers, token cap
  retained as a secondary ceiling.
- **`GET /api/admin/ai-settings/usage`** — per-`(task_type, provider, model)`
  count, tokens, total and mean `cost_usd`. Replaces list-price guesswork with
  measurement.
- **Two live bugs fixed in passing:** an unfenced prompt in
  `suggestCleanupActions`, and every `workflow_personalization_settings` toggle
  being read and discarded.

---

## Closed — do not re-file

| ID | What | Commit |
|---|---|---|
| AISL-1 | `ModelRegistry.isRegistered()` + boot warning for unregistered models; refreshed `MODEL_CONFIGS`; retained vendor-deprecated models the code still selects | `8384f7de` |
| AISL-2 | Threaded `tenantId` into random-fill runs; `ai_client_untenanted` warn when a keyed client has no tenant | `50e514ac` |
| AISL-3 | Dropped `temperature` from the Anthropic payload (400s on current models); defaults → `claude-sonnet-5`; `@anthropic-ai/sdk` 0.68 → 0.116 | `180962c6` |
| AISL-4 | `TaskType` derived from an exported `TASK_TYPES` const; seven new task types + `TASK_MAX_TOKENS` entries | `d6a80122` |
| — | Phase 1 gate: boot no longer reports "configured and ready" for an unregistered model | `21733c8d` |
| AISL-5 | Transform generation/revision/schema-align → governed client; removed hardcoded `gemini-1.5-pro` | `e6ab43e1` |
| — | Transform integration suite the AISL-5 commit missed | `0acecc49` |
| AISL-6 | Personalization (5 endpoints) → governed client; per-call client carries the tenant | `331b87c3` |
| AISL-7 | Document-assist → governed client; degraded mode preserved; **fenced the previously unfenced `suggestCleanupActions` prompt** | `b0353a2d` |
| AISL-8 | Sentiment → governed client; availability guard widened to accept `AI_API_KEY` | `0f5b183e` |
| AISL-9 | `getCostUsdSince`; dollar budget with warn/throttle tiers; `basis: 'cost' \| 'tokens'` on both `ai_budget_exceeded` paths | `7d56d0a8` |
| AISL-10 | `getUsageBreakdownSince` + `GET /api/admin/ai-settings/usage` with Zod-validated `days` | `286d527a` |
| AISL-11 | Reordered `DEFAULT_SYSTEM_PROMPT` so the vocabulary leads and placeholders trail — makes the prefix cacheable | `8486f9bc` |
| AISL-12 | Honors `workflow_personalization_settings`; restrictive merge (a workflow may only disable) | `c28b3722` |

Ticket-text corrections (three wrong acceptance criteria, all caught by devs):
`7bbc8892`, `14e3a54b`.

---

## Parked entries

**AISL-B1 — Structured outputs would delete the JSON-parsing subsystem.**
`needs-initiative`, Size L. Every AI response runs through
`stripMarkdownCodeBlocks` → `JSON.parse` → Zod → truncation detection
(`isResponseTruncated`) → `INVALID_RESPONSE`/`RESPONSE_TRUNCATED` paths and
their troubleshooting hints. Anthropic (`output_config.format` + `json_schema`),
OpenAI, and Gemini (`responseSchema`) all support schema-constrained output, and
ezBuildr already has Zod schemas for every response shape
(`AIGeneratedWorkflowSchema`, `AIConnectLogicResponseSchema`,
`aiModelResponseSchema`) that would feed the constraint directly. This is a
*subtraction* — it removes a class of runtime failure — but it is provider-coupled
and too large for one ticket. Do not start before the provider decision.

**AISL-B2 — Model tiering / escalation ladder.** `needs-initiative`. Route
*model* by `TaskType`, which is already the natural key (`TASK_MAX_TOKENS`
already varies output caps by it). Three constraints recorded at audit and
after:
- `IterativeQualityImprover` is *already* an escalation loop (3 iterations /
  25¢ cap). A second escalation axis multiplies against it — design together.
- The current cheap tier is `gemini-2.0-flash` at $0.10/$0.40, already near the
  price floor, so savings are far smaller for workflow generation than for the
  document path.
- **Conflicts with AISL-B3** — see below.
ezBuildr has a better escalation trigger than self-reported model confidence:
`WorkflowQualityValidator` produces a deterministic score with a breakdown.
Unevaluable until `GET /api/admin/ai-settings/usage` has accumulated real data.

**AISL-B3 — Enable provider prompt caching.** `needs-initiative`, blocked on the
provider decision. AISL-11 already did the free half (made the prefix cacheable);
this is the provider-specific enablement: `cache_control` breakpoints for
Anthropic, `CachedContent` for Gemini, nothing for OpenAI (automatic prefix
caching).

**Measured 2026-08-09 — the value is smaller than the audit claimed.** Actual
rendered prompt sizes:

| Prompt | Size |
|---|---|
| AI-edit system prompt (`DEFAULT_SYSTEM_PROMPT` + vocabulary) | 4,671 chars ≈ **1,168 tokens** |
| Workflow-generation `systemMessage` | 5,673 chars ≈ **1,419 tokens** |
| Logic-generation `systemMessage` | 567 chars ≈ **142 tokens** |

Anthropic's minimum cacheable prefix is per-model and **fails silently** below
it (`cache_creation_input_tokens: 0`, no error): Opus 5 = 512 ✅; Opus 4.8 /
Sonnet 5 / Sonnet 4.6 = 1,024 ✅ (barely); Opus 4.7 = 2,048 ❌; Opus 4.6 and
**Haiku 4.5 = 4,096** ❌. The logic prompt at 142 tokens caches **nowhere**.

Economics: cache read ~0.1× input, write 1.25× (5-min TTL), break-even at two
requests. Saving ≈1,050 tokens/request → ~$0.0001 on `gemini-2.0-flash`
(~9,500 requests per $1), ~$0.003 on Sonnet 5 (~320/$1), ~$0.005 on Opus 5
(~190/$1).

⚠️ **B3 and B2 conflict.** Tiering pushes cheap operations down to a small model,
but Haiku 4.5's floor is 4,096 tokens — exactly the operations you would tier
down are the ones that stop caching. You cannot have both on the same call.

**The audit's claim that this was "the largest single cost lever" was wrong, and
was made before measuring.** The real drivers are (1) output tokens, priced 3–10×
input, with `TASK_MAX_TOKENS` allowing 8,000–8,192 for generation/revision;
(2) `IterativeQualityImprover`'s up-to-3 passes; (3) variable input —
`fenceUntrusted(workflowContext)` is capped at 8,000 chars ≈ 2,000 tokens,
*larger than the prefix it sits behind*. To cut AI spend, tune the quality loop
and output caps first; caching third.

Revisit when: the deployment moves to Sonnet 5 / Opus 5 **and** AI-edit volume
reaches hundreds of calls/day; or the generated vocabulary grows past ~2,000
tokens (it grows automatically as step types and ops are added); or a large
fixed instruction block is introduced. Verify `@google/generative-ai`
(pinned 0.24.1) actually exposes `CachedContent` before writing the ticket.

**AISL-B4 — Three duplicated definitions in the AI layer.** `enhancement`,
Size S. Re-verified 2026-08-10, all three still present:
(a) `VALID_STEP_TYPES` and `TYPE_ALIASES` verbatim in both
`server/services/ai/types.ts` and `server/services/ai/AIServiceUtils.ts`;
(b) truncation detection duplicated between `AIServiceUtils.isResponseTruncated`
and `BaseAIProvider.isResponseTruncated`; (c) default-model resolution duplicated
between `providerConfig.DEFAULT_MODELS` and `AIService.getDefaultModel`. Each
pair agrees by discipline alone. The step-type copy is the dangerous one, given
`add-step-type` already lists ~10 places to touch.

**AISL-B5 — `__qualityScore` side channel.** `enhancement`, Size S.
`WorkflowGenerationService.generateWorkflow` attaches quality metadata via
`(validated as any).__qualityScore` and the caller `delete`s it. A return type
would express this properly; two `eslint-disable` lines ride on it. Cosmetic.

**AISL-B6 — Retry loop has no wall-clock deadline and no circuit breaker.**
`enhancement`. `AIProviderClient.callLLM` allows 6 attempts with exponential
backoff capped at 60s per wait and no total budget, so a request can stay open
for minutes. No breaker either, so a provider outage costs every tenant full
retry cost on every call. Not urgent while the provider is stable.

**AISL-B7 — `WorkflowOptimizationService` is not an AI service.**
`informational`. Re-verified 2026-08-10: zero LLM calls. It lives in
`server/services/ai/`, is exported from `ai/index.ts`, and is served at
`/api/ai/workflows/optimize/*`, but `analyze()` and `applyFixes()` are pure
rule-based analysis. Nothing is broken. Recorded because it will mislead the next
person auditing AI cost or deciding which endpoints need budget coverage. **Do
not "fix" by adding an LLM call.**

**AISL-B8 — Per-user / per-org system prompt scoping.** `product-decision`,
originally ICW-15. `ai_settings.scope` has the column (`'global' | 'org' |
'user'`) and an index, but `AiSettingsService` implements only the global
override and says so in a comment. Whether tenants should be able to override the
system prompt is a product call, not an implementation gap.

**AISL-B9 — Anonymous public-link runs still call AI untenanted.**
`enhancement`, Size S. `runs.routes.ts` reads `authReq.tenantId` for both
branches, but the anonymous public-link path has no authenticated user, so a
`randomize` run still reaches the model unbudgeted. AISL-2's criteria were met as
written, and the `ai_client_untenanted` warn makes the case visible. The fix is
resolving the tenant from the *workflow* rather than the request on that path.

**AISL-B10 — No way to set a workflow's personalization toggles.**
`needs-initiative`, Size M. AISL-12 made `allowDynamicPrompts` /
`allowDynamicHelp` / `allowDynamicTone` mean something, but nothing writes
`workflow_personalization_settings` — no workflow-level settings endpoint, no
builder UI — so every row sits at its `true` default and the toggles are
unsettable. Needs a write endpoint mirroring `POST /api/ai/personalize/settings`
(which handles the *user* table) plus a builder surface.

**Also dead, and to be decided together:** `enabled`, `defaultTone`,
`defaultReadingLevel`, `defaultVerbosity` on the same table are read-and-discarded
in the identical way (confirmed by AISL-12 AC7). Wiring three of seven columns and
leaving four inert is the state this entry exists to stop becoming permanent.

**Deliberately parked, not descoped.** The expected trigger is a compliance
requirement, not a preference: for legal intake work, "do not let AI rewrite the
wording on this form" is a guarantee a tenant admin needs to make about a
*workflow*, which a per-user preference structurally cannot express. Building the
UI on speculation is what produced the half-wired state AISL-12 fixed.

**AISL-B11 — The `IntegrationHub` flake is eroding the `test:fast` gate.**
`needs-initiative`, Size S — **dispatch-ready, just needs an owner.** Three
consecutive AISL devs (6, 7, 9) hit failures in
`client/src/components/builder/integrations/IntegrationHub.tsx` tests, variously a
"mock race" and `TypeError: Cannot read properties of undefined (reading 'find')`,
that clear on rerun or in isolation. `main` is green, so this is the documented
order-dependent flake, surfaced whenever a new test file shifts scheduling. Worth
fixing rather than tolerating: every dev now has to *judge* whether a red gate
means red, and AISL-9's called it "pre-existing failures in the baseline" — a
reasonable-sounding but false description that would justify shipping red
indefinitely. **A gate that requires interpretation is not a gate.** Fix the
mock's setup/teardown so it is order-independent.

**AISL-B12 — "AI Auto-Fill" is not AI, and its values are type-shaped but not
semantically shaped.** `enhancement`, Size M. **Owner request, filed 2026-09-03.**
Asked for: preview auto-fill should answer the question it is actually looking at —
a question labelled "Client full name" should get `Jane Doe`, not `banana cherry`;
"Employer" should get a company; "Matter description" should get a sentence about a
matter. Today it gets a word salad drawn from a fixed 20-word list.

Two separate facts underlie the request, and both need to be understood before
anyone estimates this:

1. **The AI path is inert.** `isAIRandomAvailable()`
   (`client/src/lib/randomizer/aiRandomFill.ts`) is `return false;` with the
   comment *"For now, we'll return false as AI integration is optional"*, so
   `generateAIRandomValues` always takes its synthetic branch. The endpoint the
   other branch would call, `POST /api/ai/random-fill`, **does not exist** —
   `grep -rn "random-fill" server/` is empty. `FeatureFlag.AI_AUTOFILL`
   (`client/src/lib/featureFlags/definitions.ts`) is defined, defaulted `false`,
   and **read by nothing**. The Preview toolbar's menu is nevertheless labelled
   *"AI Randomizer"* with a *"Generating…"* spinner state
   (`client/src/components/preview/DevToolbar.tsx`). So `requestAIRandomValues`
   and `sanitizeAIValue` are ~200 lines of unreachable code, and the visible
   feature is 100% `generateRandomValueForBlock`
   (`client/src/lib/randomizer/randomFill.ts`).

2. **The synthetic generator dispatches on `step.type` only — never on the
   label.** `generateTextValue` reads `config.variant` to pick short vs long and
   then returns `randomShortText()`, which joins 1–3 words from a hardcoded list
   (`'apple', 'banana', 'cherry', …`). `step.title` is passed nowhere. The one
   place a name is produced today is `generateMultiFieldValue`'s
   `layout === 'first_last'` branch, and that is keyed off config, not language.
   Note the sibling module `client/src/lib/sampleData.ts` (template preview) has
   the *same* limitation and its fallback is ``` `Sample ${label}` ``` — it at least
   echoes the label.

**Preferred shape (not yet a ticket, and deliberately not one).** The cheap 80%
is a label-classification layer in front of the existing synthetic generators:
match `step.title`/`alias` against a small ordered pattern table (name, first
name, last name, company, job title, city, description, …) and pick a faker-style
generator per class, falling back to today's behavior on no match. That is
deterministic, offline, testable, and needs no model call. The expensive 20% is
the real AI path — one batched call over the page's `{alias, type, label, config}`
list, which the dead `AIRandomRequest` payload already describes correctly. If
that path is built, it must go through the AI service layer
(`callLLM`/`TaskType`/`ai_usage`), not a bespoke route, or it re-creates the
second AI stack AISL-1..12 spent an initiative deleting.

**Stale-evidence warnings for whoever promotes this.**
`sanitizeAIValue`'s `switch` and `generateRandomValueForBlock`'s if-chain still
branch on **retired** step types — `short_text`, `long_text`, `yes_no`,
`true_false`, `radio`, `multiple_choice`, `time`, `date`, `currency` — which
STB-21 (migration `0042`) removed from `stepTypeEnum`. Those branches are dead for
stored steps. Meanwhile the canonical types `list`, `file_upload`,
`signature_block`, `multi_field` (in `sanitizeAIValue`) and `computed` fall through
to `randomShortText()` / `undefined`. Any work here should re-derive the type table
from `shared/schema/workflow.ts` rather than editing what is there.

**Next step:** owner ruling on scope — label-classification only (Size M, no model
call, shippable alone), or label-classification *plus* wiring the real AI path
through the AI service layer (Size L, needs its own file). Whichever is chosen,
delete or honestly relabel the inert AI branch, the unused `AI_AUTOFILL` flag and
the "AI Randomizer" menu label in the same change — a feature that names a
capability it does not have is worse than one that does not claim it.

---

## Lessons that cost the most to learn

**1. A registry describes the deployment, not the vendor.** `ModelRegistry`'s
contract is *"models this deployment might call"*, not *"models the vendor
currently sells"*. AISL-1 took three revisions; rev 2 deleted `gemini-2.0-flash`
and `gemini-1.5-pro` as vendor-deprecated while **seven files still selected
them**, which would have put the live production model into the "unregistered"
warn path on every boot and cut `gemini-1.5-pro`'s ceiling from 2M to 1M,
rejecting large transform prompts. Caused by the reviewer's own send-back wording
("remove any entry you cannot confirm"). Guarded now by a regression test.

**2. Deliverables that are external *data* need a different review than
deliverables that are behavior.** A dev can honestly self-grade A with green gates
while the facts it wrote down are wrong — a passing suite that asserts fabricated
prices looks identical to one asserting correct ones. Verify data against an
authoritative source yourself, or record explicitly that you could not. The
OpenAI and Gemini figures in `MODEL_CONFIGS` are dev-sourced and **were not
independently verified**; re-check at the provider decision.

**3. Write acceptance criteria from the handler, not the endpoint list.** Three
tickets shipped with wrong criteria, all the same shape: AISL-5 AC3 and AISL-7
AC3 assumed a 1:1 endpoint↔method mapping that does not hold
(`/debug`, `/auto-fix`, `/extract-text` are all deterministic and call no model);
AISL-6 AC4 named `workflow_personalization_settings` **column names** as if they
were runtime guards. Every one was caught by a dev who stopped and asked instead
of improvising — and the AISL-6 escalation is what surfaced AISL-12. Had any dev
guessed, the reviewer would have approved a green diff fabricating `ai_usage`
rows for endpoints that never call a model, corrupting AISL-10's economics before
AISL-10 existed.

**4. Phase gates catch what per-ticket gates structurally cannot.** The Phase 1
gate found that `server/index.ts` read `aiConfig.error` only in the
*not-configured* branch, so AISL-1's unregistered-model case (which returns
`configured: true` **with** an error) logged a warning and then immediately logged
"AI Service configured and ready", discarding the error. Every AISL-1 criterion
passed; the defect existed only in the composition with a file no ticket touched.

**5. `git diff` is empty for an untracked file.** The reviewer told the repo owner
that AISL-5's integration test was "byte-identical to main" on the strength of an
empty `git diff`. It was a **new** file, and the AISL-5 commit shipped without it.
**Check `git status`, not `git diff`, before concluding a file is unchanged.**

**6. Verify the gate, not the gate report.** Three consecutive turn-ins carried
unreliable gate evidence: AISL-9 cited a 2799 baseline (actual 2853) and
dismissed a red run as "pre-existing"; AISL-12 pasted one passing file as
`test:fast` proof and left five `*.out` scratch files while claiming none;
AISL-10 reported `test:fast` as *5 files / 22 tests* (real suite: 261 files /
2861 tests) and reported no integration run at all despite delivering a **new**
integration file — which had therefore never been executed when graded A. All
three were sound code. **A written test is not a run test.**

**7. Measure before calling something the biggest lever.** See AISL-B3.
