# Intake Questionnaire — variable mapping

`template.docx` is an internal intake summary memo (not client-signed), using
each workflow alias directly as its tag name.

| Workflow alias | Question | Required | Used in `template.docx` as |
|---|---|---|---|
| `client_full_name` | Full legal name | yes | `{{client_full_name}}` |
| `client_email` | Email | yes | `{{client_email}}` |
| `client_phone` | Phone | no | `{{client_phone \| default:"Not provided"}}` |
| `client_pronoun` | Pronouns | no | `{{client_pronoun \| pronounSubject}}`, `{{client_pronoun \| pronounObject}}`, `{{client_pronoun \| pronounPossessive}}` |
| `matter_type` | Matter type | yes | `{{matter_type}}` |
| `matter_summary` | Matter summary | yes | `{{matter_summary}}` |
| `co_clients_count` | Additional individuals involved | no | `{{co_clients_count \| default:"0"}}`, `{{co_clients_count \| default:"0" \| plural:"individual":"individuals"}}`, `{{co_clients_count \| default:"0" \| isAre}}` |
| `referral_source` | How did you hear about us? | no | `{{referral_source \| default:"Not provided"}}` |
| `urgent_deadline` | Upcoming deadline or court date? | yes | `{{#urgent_deadline}}...{{/urgent_deadline}}` (section, S6-style mid-sentence conditional) |
| `urgent_deadline_date` | Deadline date | no (visible only when `urgent_deadline` is true) | `{{urgent_deadline_date \| longdate}}`, inside the `urgent_deadline` section |
| `intake_date` | Date of intake call | yes | `{{intake_date \| longdate}}` |

## `intakeConfig` — using the existing field, not the removed pipeline

`workflow.json.settings.intakeConfig` is set to
`{ "allowPrefill": true, "allowedPrefillKeys": ["client_full_name", "client_email"] }`.
This is the **existing, still-live** `workflows.intakeConfig` column
(`shared/types/intake.ts`), read by `RunService.createRun` /
`filterPrefillValues` on the ordinary `/api/runs/*` path — it decides which
caller-supplied values may seed a run when one is started with prefill data.

This template does **not** reintroduce the removed `/intake/*` portal or
`intakeStateMachine` (both deleted, O-12 and LIST2-10 respectively). It only
demonstrates the one field of `IntakeConfig` that is still read at runtime, in
a workflow-authoring context, with no new route or mechanism added. See
`templates/curated/README.md` for the full scope note.

## Zero/blank behavior demonstrated

`co_clients_count`, `client_phone`, `referral_source` and `urgent_deadline_date`
are all left unanswered in one of the two sample runs used by
`tests/unit/services/document/curatedTemplates.test.ts`, proving the filters
render blank/default text rather than throwing (rule 2/4 of the grammar
rules) and that the `urgent_deadline` section disappears cleanly when false.
