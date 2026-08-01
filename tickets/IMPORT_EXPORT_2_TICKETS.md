# Portability Round 2 — remaining rulings

Source: senior audit of the shipped portability engine, **2026-07-29**.
Round 2 grade at audit time: **D+**. Round 1
(`tickets/IMPORT_EXPORT_TICKETS.md`, IEX-1..14) built the engine; this file was
the follow-up audit of what it actually did on realistic data.

**🏁 Round 2 is complete and pushed** (`be22f778`, 2026-07-31). IEX2-1 through
IEX2-15 and IEX2-17 are all closed, and were removed from this file on
2026-08-01 per the convention that `tickets/` holds open work only. The audit
summary, the scope and method, every finding with its `file:line` evidence, the
preferred fixes and the dated verification notes are all in git history:

```bash
git log -p -- tickets/IMPORT_EXPORT_2_TICKETS.md
```

Baselines at close: `test:fast` 155 files / 2053 tests, portability unit-db 74
tests across 7 files, portability integration 25 tests across 3 files.

Two items remain, and **neither is a dispatchable ticket** — both are standing
rulings, kept here so they are not silently forgotten.

- Status legend: 🔲 Open · 🔄 In progress · ✅ Done · ⏸️ Deferred

---

## IEX2-16 — Minimal export/import UI ⏸️ DEFERRED — do not dispatch

> **Ruling (final, 2026-07-29):** *"dont worry about UI yet"* — **supersedes**
> the earlier *"ok go with that"* ruling that pulled this forward into Phase D.
> The UI is **out of scope for round 2**. Fix the engine first; revisit
> reachability once Phases A–C are committed and the round-trip actually works
> on real data.

Note the precondition in that ruling has now been met: Phases A–C are committed
and the round trip works on real data. Reopening is still a scoping decision
rather than something automatic — it needs a fresh audit and a rewritten
ticket, because the original evidence predates round 2's changes.

## D-7 — Replace adm-zip on the read side ✅ RULED — its own initiative

> **Ruling (2026-07-29):** *"deal, lets do that"* — a separate initiative,
> sequenced immediately before Phase 3. It is **not** a ticket in this file.

IEX2-10 shipped the buffering fixes this codebase controls. The library swap
still waits: adm-zip has no per-entry read stream and builds archives in memory
to write them, so a genuinely streaming implementation means changing the
library, not the call sites. Track it as its own initiative when picked up.
