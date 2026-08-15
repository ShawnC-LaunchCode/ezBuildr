# Retainer Agreement — variable mapping

`template.docx` uses each workflow alias directly as its tag name (identity
mapping, same convention as the NDA and Intake templates).

| Workflow alias | Question | Required | Used in `template.docx` as |
|---|---|---|---|
| `client_name` | Client legal name | yes | `{{client_name}}` |
| `client_pronoun` | Client's pronouns | no | `{{client_pronoun \| pronounSubject \| capitalize}}`, `{{client_pronoun \| pronounVerb:"acknowledges"}}`, `{{client_pronoun \| pronounPossessive}}` |
| `firm_name` | Firm name | yes | `{{firm_name}}` |
| `matter_description` | Matter description | yes | `{{matter_description}}` |
| `engagement_date` | Engagement (signing) date | yes | `{{engagement_date \| longdate}}`, and as the left-hand value of `{{engagement_date \| addBusinessDays:response_deadline_days:"MMMM D, YYYY"}}` (the third, quoted colon-arg is `addBusinessDays`'s own format argument — no `\| longdate` chain needed) |
| `hourly_rate` | Hourly rate | yes | `{{hourly_rate \| usd}}` |
| `retainer_fee` | Initial retainer fee | yes | `{{retainer_fee \| usd}}` |
| `response_deadline_days` | Business days to remit the retainer | yes | `{{response_deadline_days}}`, and as the day-count argument to `addBusinessDays` above |
| `additional_attorneys_count` | Additional attorneys staffed | yes | `{{additional_attorneys_count}}`, `{{additional_attorneys_count \| plural:"attorney":"attorneys"}}`, `{{additional_attorneys_count \| isAre}}`, `{{additional_attorneys_count \| hasHave}}` |

## The business-day deadline (AC4 proof)

`workflow.json.settings.businessDayCalendar` is `"us-federal"`, so
`{{engagement_date | addBusinessDays:response_deadline_days:"MMMM D, YYYY"}}`
resolves against real US federal holidays, not just weekends.

The sample run used by `tests/unit/services/document/curatedTemplates.test.ts`
sets:

- `engagement_date` = `2026-09-04` (Friday)
- `response_deadline_days` = `2`

**Hand-checked result: `2026-09-09` (Wednesday), rendered as "September 9, 2026".**

Walking the calendar by hand, under the `us-federal` calendar:

| Date | Day | Business day? |
|---|---|---|
| 2026-09-04 | Fri | — (start date, not counted) |
| 2026-09-05 | Sat | No — weekend |
| 2026-09-06 | Sun | No — weekend |
| 2026-09-07 | Mon | No — **Labor Day**, the first Monday of September, a US federal holiday |
| 2026-09-08 | Tue | Yes — 1st business day added |
| 2026-09-09 | Wed | Yes — 2nd business day added → **deadline** |

So the 2-business-day deadline lands on 2026-09-09, having skipped the weekend
of Sep 5–6 *and* the Labor Day holiday on Sep 7. This was also confirmed
programmatically against the production `addBusinessDaysForCalendar` helper
(`server/utils/formatters.ts`) before writing the test assertion:

```
Start: Fri Sep 04 2026
Result (+2 business days, us-federal): Wed Sep 09 2026
```

The test also renders the **same tag with `businessDayCalendar` set to
`"weekends-only"`** and asserts a *different* date (`2026-09-08`, which does
not skip Labor Day) — a discriminating assertion that the calendar setting,
not the arithmetic, drives the holiday skip. This is the "real DOCX with a
business-day deadline across a federal holiday" proof that was still
outstanding on the BIZ board per this ticket file's "Already done" section.
