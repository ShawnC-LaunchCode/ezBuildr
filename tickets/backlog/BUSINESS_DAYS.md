# Business-day date math (BIZ) — retired 2026-08-12

**2 of 2 tickets closed.** Template authors can express business-day deadlines
(`addBusinessDays`, `nextBusinessDay`, `businessDaysBetween`, `addWeekdays`) against a
workflow-level calendar: `weekends-only` (the default, so existing workflows are
unaffected) or `us-federal`, with federal holidays computed algorithmically including
Saturday→Friday and Sunday→Monday observation and Juneteenth gated to 2021+.

Original ticket file: `tickets/BUSINESS_DAYS_TICKETS.md`. Recover full detail with:

```bash
git log -p -- tickets/BUSINESS_DAYS_TICKETS.md
```

## Settled ruling — do not re-litigate

**The calendar is configuration, not a filter argument** (repo owner, 2026-08-11). The
reviewer's counter-proposal was accepted over passing the calendar per call site. It lives
in the existing `workflows.settings` JSON blob — **no migration, no schema change** — and is
validated in three places that all delegate to one rule: `z.enum` at the workflow route,
`resolveBusinessDayCalendar` at the dynamic JSON boundary, and (BIZ-2) a
`superRefine` on the import path that reuses the same function so messages cannot drift.

Two implementation decisions worth preserving, both deliberate:

- **The render-time throw stays.** `resolveBusinessDayCalendar` throws on an unrecognised
  value rather than defaulting silently. Substituting a calendar would put a wrong date on a
  legal deadline, which is worse than a loud failure. BIZ-2's job was to move *where* it
  fires (import time), not to soften it.
- **The 16-file footprint is intentional.** The setting threads routes →
  `RunLifecycleService` → `FinalBlockRenderer` → `RenderCore` → `createDocxHelpers`, which
  builds per-render calendar-bound wrappers. This exists specifically to avoid global
  mutable state — **do not "simplify" it into a singleton.**

Perf was measured and is a non-issue: a 10-year `businessDaysBetween` span costs 59ms on
`us-federal`, 1ms on `weekends-only`. No memoization needed.

## Parked entries

## BIZ-O1 — the other import-side jsonb blobs are unvalidated · `enhancement`

BIZ-2 added a declarative `fieldSchemas` hook to the portability entity graph so a jsonb
column's *contents* can be validated on import, and used it for `workflows.settings`. It is
the only jsonb column that got one.

Still accepted with nothing but drizzle-zod's shape check: `sections.config`,
`steps.config`, `blocks.config`, `workflow_versions.graphJson`. Whether any of them carries
a value that throws downstream at render or run time — the exact failure BIZ-2 fixed for
`settings` — **was not audited**.

**Next step:** for each of those columns, find the code that reads it and check whether any
unrecognised value raises rather than defaulting. Where one does, add a `fieldSchemas` entry
that delegates to the same resolver the runtime uses. Nothing is known to be broken here;
this is a "the same class of bug may exist next door" observation, not a reported defect.

## Closed — do not re-file

| Ticket | Outcome | Commit |
|---|---|---|
| BIZ-1 — business-day arithmetic with a configurable holiday calendar | ✅ four filters, two calendars, algorithmic federal holidays with observation rules | `c7410d12` → `a246a876` |
| BIZ-2 — validate `workflows.settings` on portability import | ✅ `fieldSchemas` on the entity graph; one line in `ImportService.getZodSchema` covers preview *and* apply; 400 not 500 | `611ef23e` → `1ff20d4e` |

**Also resolved by this initiative, filed elsewhere:** **TPL-O7** ("business-day / holiday
date math", parked as `product-decision` in the Template Language backlog pending a ruling
on the holiday calendar) is **answered and shipped** by BIZ-1. Its index entry has been
marked resolved — do not re-promote it.

**Gate fully satisfied**, including the live item: on 2026-08-12 a real run on a workflow
with `businessDayCalendar = 'us-federal'` rendered `{{ startDate | addBusinessDays:1 }}`
from Thursday 2026-07-02 as **`07/06/2026`** — Monday, skipping the Friday July 3 observed
holiday and the weekend. The assertion was made *discriminating*: the weekends-only answer
for the same input is `07/03/2026`, and the probe required the render to match the federal
answer **and not** the weekends-only one, which is what proves the setting actually threads
through the render chain rather than that the arithmetic is right in isolation. Closed in
`2085bb29`.
