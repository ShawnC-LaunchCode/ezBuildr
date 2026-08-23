import { z } from 'zod';
import { stepTypeEnum } from '@shared/schema/workflow';

/**
 * Validates `templates/curated/<slug>/workflow.json` (TM-1).
 *
 * That file is hand-authored content (LD-2), deliberately mirroring the real
 * `pages`/`steps` schema closely enough to be a faithful spec — but it is
 * never type-checked against anything, so a typo'd step `type` or a renamed
 * field would sail through silently. This schema is the first thing that
 * actually reads the file structurally; `.strict()` at every object level
 * turns an unknown field into a build failure instead of a value nobody
 * reads, and the `type` enum is the live `stepTypeEnum` (not a hand-copied
 * list), so a step type retired from the schema retires here too.
 *
 * Deliberately does **not** validate `config`/`visibleIf`/`settings` payload
 * shapes beyond "present" — those are per-step-type and per-filter shapes
 * (`ConditionExpression`, `businessDaySettingsSchema`, choice option lists,
 * ...) that already have their own validators elsewhere; duplicating them
 * here would be a second, divergent definition of shapes this repo already
 * owns once.
 */
const curatedStepSchema = z
  .object({
    alias: z.string().min(1, 'alias must not be empty'),
    type: z.enum(stepTypeEnum.enumValues),
    title: z.string().min(1, 'title must not be empty'),
    required: z.boolean().optional(),
    config: z.unknown().optional(),
    visibleIf: z.unknown().optional(),
  })
  .strict();

const curatedPageSchema = z
  .object({
    title: z.string().min(1, 'title must not be empty'),
    steps: z.array(curatedStepSchema).min(1, 'a page needs at least one step'),
  })
  .strict();

export const curatedWorkflowSchema = z
  .object({
    title: z.string().min(1, 'title must not be empty'),
    description: z.string().optional(),
    settings: z.record(z.unknown()).optional(),
    pages: z.array(curatedPageSchema).min(1, 'a workflow needs at least one page'),
  })
  .strict();

export type CuratedStep = z.infer<typeof curatedStepSchema>;
export type CuratedPage = z.infer<typeof curatedPageSchema>;
export type CuratedWorkflow = z.infer<typeof curatedWorkflowSchema>;

/**
 * Parses and validates one curated `workflow.json`, throwing a build-failing
 * error that names both the file and the offending field(s) (AC5) — the
 * generator's caller lets this propagate rather than catching it, so a
 * malformed file fails `npm run build` outright rather than degrading to an
 * empty or partial bundle.
 */
export function parseCuratedWorkflow(filePath: string, raw: string): CuratedWorkflow {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid curated template at ${filePath}: not valid JSON (${message})`);
  }

  const result = curatedWorkflowSchema.safeParse(json);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid curated template at ${filePath}:\n${issues}`);
  }
  return result.data;
}
