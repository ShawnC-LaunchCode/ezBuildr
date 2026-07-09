# Skill Trigger Eval Harness

Measures and optimizes the `description:` frontmatter of the project skills in
`.claude/skills/` — the description is the only thing Claude sees when deciding
whether to consult a skill, so its wording directly controls trigger accuracy.

Origin: a copy of the Anthropic `skill-creator` plugin's optimization scripts
(`scripts/`), patched for Windows, plus this repo's trigger eval sets (`evals/`).
The current skill descriptions were selected by this harness on July 9, 2026 —
**don't casually reword them**; re-measure instead.

## What it does

For a given skill, `run_loop.py`:

1. Splits the eval set (60% train / 40% holdout).
2. For each query, launches a real `claude -p` session with the description
   registered as an available command, and detects whether Claude consults it.
3. Asks Claude to rewrite the description based on the failures, re-evaluates,
   and iterates (keeping the best by **holdout** score to avoid overfitting).

## Running it

```bash
cd tools/skill-trigger-eval
python -m scripts.run_loop \
  --eval-set evals/db-schema-change.json \
  --skill-path ../../.claude/skills/db-schema-change \
  --model claude-fable-5 \
  --max-iterations 3 --runs-per-query 2 --num-workers 6 \
  --report none --results-dir ./results --verbose
```

The output JSON's `best_description` is what you paste into the SKILL.md
frontmatter **if it beat iteration 1** (iteration 1 = the current description;
sometimes the incumbent wins — keep it then). Quote the YAML value if the text
contains `: ` sequences.

Eval sets are `[{"query", "should_trigger"}, ...]`. Negatives should be
near-misses (e.g. "add a step to the CI pipeline" for add-step-type), not
obviously irrelevant queries.

## Gotchas (all learned the hard way)

- **Quota**: each run is ~150-250 `claude -p` calls and can exhaust a
  subscription's usage window in minutes. Run ONE skill per quota window.
  A refused call prints "out of extra usage"; the patched `run_eval.py` raises
  on this instead of silently recording "didn't trigger" (which once produced a
  convincing-looking 0% recall).
- **Windows**: upstream `run_eval.py` used `select.select()` on a pipe, which
  only works on sockets on Windows (WinError 10038). This copy uses a
  watchdog-timer + blocking reads. Keep that patch if you refresh from upstream.
- **Stray files**: the harness registers each test description as a temp
  command file in the nearest `.claude/commands/` (it may resolve to
  `~/.claude/commands/`). If a run crashes, delete leftover
  `*-skill-<8 hex>.md` files there.
- **Interpreting scores**: absolute trigger rates run low because one-shot
  `claude -p` sessions under-consult skills vs. real multi-turn sessions.
  Treat scores as *relative* comparisons between descriptions only.
- **Model**: pass the model your sessions actually run, so the measured
  triggering matches reality.
