import { execSync } from 'child_process';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '@shared/schema';
import { getOwnerDb } from '../helpers/ownerDb';
import { setupIntegrationTest, type IntegrationTestContext } from '../helpers/integrationTestHelper';
import { canonicalizeStepDefinition } from '../../scripts/canonicalizeStepTypes';
import { CANONICAL_STEP_TYPES } from '../../shared/types/stepConfigs';
import { stepTypeEnum } from '../../shared/schema/workflow';
import { validateCanonicalStepConfig } from '../../shared/validation/stepConfigSchemas';

describe.sequential('STB-19 canonicalizeStepTypes', () => {
  let ctx: IntegrationTestContext;
  let workflowId: string;
  let pageId: string;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: 'STB-19 canonicalization',
      createProject: true,
      userRole: 'admin',
      tenantRole: 'owner',
    });

    const [workflow] = await getOwnerDb()
      .insert(schema.workflows)
      .values({
        title: 'STB-19 test',
        projectId: ctx.projectId,
      })
      .returning();
    workflowId = workflow.id;

    const [page] = await getOwnerDb()
      .insert(schema.pages)
      .values({
        title: 'STB-19 test page',
        workflowId,
        order: 1,
      })
      .returning();
    pageId = page.id;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  describe('Pure canonicalizer', () => {
    it('canonicalizes retired types with explicit mappings', () => {
      const step = {
        type: 'short_text',
        config: {
          variant: 'short',
          unknownKey: 'should be removed',
        }
      };
      const result = canonicalizeStepDefinition(step);
      expect(result.canonicalType).toBe('text');
      expect(result.canonicalConfig).not.toHaveProperty('unknownKey');
      expect(result.removedKeys).toContain('unknownKey');
    });

    // AC1: every retired type converts, and the result is accepted by the same
    // strict boundary that STB-17 enforces on writes. Added by the reviewer
    // (2026-09-02) after two review rounds each shipped a retired type that
    // could not convert at all -- the per-family tests passed while the family
    // nobody wrote a fixture for threw. Driving this off the enum means a type
    // cannot be missed by omission.
    const RETIRED_TYPE_FIXTURES: Record<string, unknown> = {
      short_text: { placeholder: 'hi' },
      long_text: { rows: 4 },
      yes_no: { yesLabel: 'Yep', noLabel: 'Nope' },
      true_false: { trueLabel: 'T', falseLabel: 'F' },
      date: { minDate: '2020-01-01' },
      time: { format: '24h' },
      datetime: { minDate: '2020-01-01' },
      datetime_unified: { kind: 'datetime' },
      currency: { currency: 'USD' },
      number_advanced: { mode: 'number' },
      multiple_choice: { options: [{ id: 'a', label: 'A' }], minSelections: 1, maxSelections: 2 },
      radio: { options: [{ id: 'a', label: 'A' }] },
      phone_advanced: {},
      email_advanced: {},
      scale_advanced: { min: 1, max: 5, step: 1, display: 'slider' },
      website_advanced: {},
      address_advanced: { requireStreet: true },
      display_advanced: { markdown: 'hello' },
      final: {},
    };

    it('AC1: every retired enum type converts to a canonically valid config', () => {
      const canonical = new Set<string>(CANONICAL_STEP_TYPES);
      const retired = stepTypeEnum.enumValues.filter((type) => !canonical.has(type));

      // Fail loudly if a retired type has no fixture, rather than skipping it.
      expect(Object.keys(RETIRED_TYPE_FIXTURES).sort()).toEqual([...retired].sort());

      for (const type of retired) {
        const result = canonicalizeStepDefinition({ type, config: RETIRED_TYPE_FIXTURES[type] });

        expect(canonical.has(result.canonicalType), `${type} produced non-canonical ${result.canonicalType}`).toBe(true);

        const check = validateCanonicalStepConfig(result.canonicalType, result.canonicalConfig);
        expect(check.success, `${type} -> ${result.canonicalType} failed the strict boundary: ${JSON.stringify(check.error?.issues)}`).toBe(true);
      }
    });

    it('AC8: validation asserted at each List depth', () => {
      const step = {
        type: 'list',
        config: {
          fields: [
            {
              kind: 'list',
              id: 'list-1',
              alias: 'l1',
              title: 'Nested List 1',
              order: 0,
              list: {
                fields: [
                  {
                    kind: 'list',
                    id: 'list-2',
                    alias: 'l2',
                    title: 'Nested List 2',
                    order: 0,
                    list: {
                      fields: [
                        {
                          kind: 'question',
                          id: 'field-3',
                          alias: 'q3',
                          type: 'short_text',
                          title: 'Inner Q',
                          order: 0,
                          config: {}
                        }
                      ]
                    }
                  }
                ]
              }
            }
          ]
        }
      };
      // Validation should succeed at all depths up to the cap
      const result = canonicalizeStepDefinition(step);
      expect(result.canonicalType).toBe('list');
      // The innermost question was converted to text
      const l1 = result.canonicalConfig.fields[0];
      const l2 = l1.list.fields[0];
      const q3 = l2.list.fields[0];
      expect(q3.type).toBe('text');
      expect(q3.config.variant).toBe('short');
    });

    it('AC9: read-resolution unchanged per family, including allowMultiple: true + display: radio', () => {
      const step = {
        type: 'multiple_choice',
        config: {
          display: 'radio',
          allowMultiple: true,
          options: [{ id: 'opt1', label: 'Option 1' }]
        }
      };
      const result = canonicalizeStepDefinition(step);
      expect(result.canonicalType).toBe('choice');
      // A legacy multiple_choice with allowMultiple: true and display: radio should be mapped to multiple
      expect(result.canonicalConfig.display).toBe('multiple');
      // A regular radio should be mapped to radio
      const step2 = {
        type: 'radio',
        config: {
          display: 'radio',
          options: [{ id: 'opt1', label: 'Option 1' }]
        }
      };
      const result2 = canonicalizeStepDefinition(step2);
      expect(result2.canonicalConfig.display).toBe('radio');
    });

    it('canonicalizes nested lists', () => {
      const step = {
        type: 'list',
        config: {
          fields: [
            {
              kind: 'question',
              id: 'field-1',
              alias: 'q1',
              type: 'yes_no',
              title: 'Sub Q',
              order: 1,
              config: { yesLabel: 'Yep', noLabel: 'Nope', unknownKey: 'delete me' }
            }
          ]
        }
      };
      const result = canonicalizeStepDefinition(step);
      expect(result.canonicalType).toBe('list');
      expect(result.canonicalConfig.fields[0].type).toBe('boolean');
      expect(result.canonicalConfig.fields[0].config.trueLabel).toBe('Yep');
      expect(result.removedKeys).toContain('q1.config.unknownKey');
    });

    it('canonicalizes nested lists at depth 2', () => {
      const step = {
        type: 'list',
        config: {
          fields: [
            {
              kind: 'list',
              id: 'list-1',
              alias: 'l1',
              title: 'Nested List',
              order: 0,
              list: {
                buttonLabel: 'Add L2',
                fields: [
                  {
                    kind: 'question',
                    id: 'field-2',
                    alias: 'q2',
                    type: 'yes_no',
                    title: 'Inner Q',
                    order: 1,
                    config: { yesLabel: 'Yep', noLabel: 'Nope', unknownKey: 'delete me' }
                  }
                ]
              }
            }
          ]
        }
      };
      const result = canonicalizeStepDefinition(step);
      expect(result.canonicalType).toBe('list');
      const innerField = result.canonicalConfig.fields[0].list.fields[0];
      expect(innerField.type).toBe('boolean');
      expect(innerField.config.trueLabel).toBe('Yep');
      expect(result.removedKeys).toContain('l1.list.q2.config.unknownKey');
    });
  });

  describe('CLI orchestrator', () => {
    let step1Id: string;

    beforeAll(async () => {
      const [step1] = await getOwnerDb().insert(schema.steps).values({
        workflowId,
        pageId,
        type: 'short_text' as any,
        title: 'Q1',
        alias: 'q1',
        order: 1,
        config: { variant: 'short', oldStuff: true },
      }).returning();
      step1Id = step1.id;

      await getOwnerDb().insert(schema.steps).values({
        workflowId,
        pageId,
        type: 'list' as any,
        title: 'Q2',
        alias: 'q2',
        order: 2,
        config: {
          fields: [
            {
              kind: 'question',
              id: nanoid(),
              alias: 'subQ',
              type: 'true_false',
              title: 'Sub Q',
              order: 1,
              config: { badKey: 123 }
            }
          ]
        }
      });
    });

    it('runs dry-run by default without writing to DB', async () => {
      const out = execSync(`npx tsx scripts/canonicalizeStepTypes.ts --workflow-id ${workflowId}`, { encoding: 'utf-8', env: process.env });
      expect(out).toContain('DRY-RUN mode');
      expect(out).toContain('Total rows processed:');
      
      const rows = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.id, step1Id));
      expect(rows[0].type).toBe('short_text');
      expect((rows[0].config as any).oldStuff).toBe(true);
    });

    it('refuses to apply without a database-url', () => {
      let failed = false;
      try {
        execSync(`npx tsx scripts/canonicalizeStepTypes.ts --apply --workflow-id ${workflowId}`, { encoding: 'utf-8', env: process.env });
      } catch (err: any) {
        failed = true;
        expect(err.stderr.toString()).toContain('--apply requires an explicit --database-url argument');
      }
      expect(failed).toBe(true);
    });

    it('updates rows in --apply mode transactionally', async () => {
      const dbUrl = process.env.DATABASE_URL || '';
      const out = execSync(`npx tsx scripts/canonicalizeStepTypes.ts --apply --workflow-id ${workflowId} --database-url "${dbUrl}"`, { encoding: 'utf-8', env: process.env });
      expect(out).toContain('APPLY mode');
      expect(out).toContain('Transaction committed successfully.');
      
      const rows = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.id, step1Id));
      expect(rows[0].type).toBe('text');
      expect((rows[0].config as any).oldStuff).toBeUndefined();
    });

    it('is idempotent on second --apply', () => {
      const dbUrl = process.env.DATABASE_URL || '';
      const out = execSync(`npx tsx scripts/canonicalizeStepTypes.ts --apply --workflow-id ${workflowId} --database-url "${dbUrl}"`, { encoding: 'utf-8', env: process.env });
      expect(out).toContain('Rows changed:         0');
    });

    it('rolls back whole transaction on conversion error', async () => {
      const [goodStep] = await getOwnerDb().insert(schema.steps).values({
        workflowId,
        pageId,
        type: 'short_text' as any,
        title: 'Good',
        alias: 'good',
        order: 3,
        config: { variant: 'short', unknownKey: 'remove me' },
      }).returning();

      const [badStep] = await getOwnerDb().insert(schema.steps).values({
        workflowId,
        pageId,
        type: 'number' as any,
        title: 'Bad',
        alias: 'bad',
        order: 4,
        config: { mode: 'invalid_mode_that_causes_crash' },
      }).returning();

      let failed = false;
      const dbUrl = process.env.DATABASE_URL || '';
      try {
        execSync(`npx tsx scripts/canonicalizeStepTypes.ts --apply --workflow-id ${workflowId} --database-url "${dbUrl}"`, { encoding: 'utf-8', env: process.env });
      } catch (err: any) {
        failed = true;
        expect(err.stderr.toString()).toContain('Aborting without writes.');
      }
      expect(failed).toBe(true);

      const rows = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.id, badStep.id));
      expect((rows[0].config as any).mode).toBe('invalid_mode_that_causes_crash');
      
      const goodRows = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.id, goodStep.id));
      expect((goodRows[0].config as any).unknownKey).toBe('remove me');

      await getOwnerDb().delete(schema.steps).where(eq(schema.steps.id, badStep.id));
      await getOwnerDb().delete(schema.steps).where(eq(schema.steps.id, goodStep.id));
    });
  });
});
