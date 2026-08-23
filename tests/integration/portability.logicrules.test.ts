/**
 * LU-6c AC2/AC3 — portability round-trip for a workflow carrying a logic
 * rule. `entityGraph.ts` already exports `logic_rules` by its reshaped
 * columns (`conditionStepId`/`when`/...), and `remapJsonIds.ts` already
 * rewrites any step-id references embedded inside `when` — both landed in
 * LU-6a — but nothing exercised that path with an actual rule before this.
 * `tests/helpers/bundleTestHelper.ts`'s `seedWorkflow` fixture has no logic
 * rule, and neither `portability.import.test.ts` nor
 * `portability.roundtrip.test.ts` reference `logicRules` at all, so this was
 * a real, unexercised gap in a subsystem Decision #4 specifically named.
 */
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '@shared/schema';
import type { Condition, ConditionExpression } from '@shared/types/conditions';

import { exportService } from '../../server/services/portability/ExportService';
import { importService } from '../../server/services/portability/ImportService';
import { setupIntegrationTest, type IntegrationTestContext } from '../helpers/integrationTestHelper';
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";
// RLS-5 recipe step 3: direct service calls get no middleware, so the tenant
// context is entered per test body — a hook entry does not propagate.
import { enterTenantContextForTests } from "../../server/utils/rlsContext";

describe('Portability round trip — logic rules (LU-6c)', () => {
  let ctx: IntegrationTestContext;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({ tenantName: 'Logic Rule Portability Tenant', createProject: true });
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it("preserves a rule's `when` ConditionExpression and remaps conditionStepId/targetStepId across export/import", async () => {

    enterTenantContextForTests(ctx.tenantId);
    if (ctx.projectId === undefined) {
      throw new Error('Integration test project was not created');
    }

    const [workflow] = await getOwnerDb().insert(schema.workflows).values({
      title: `Portability Logic Rule Source ${randomUUID().slice(0, 8)}`,
      name: 'Portability Logic Rule Source',
      projectId: ctx.projectId,
      creatorId: ctx.userId,
      ownerId: ctx.userId,
      ownerType: 'user',
      ownerUuid: ctx.userId,
    }).returning();

    const [page] = await getOwnerDb().insert(schema.pages).values({
      workflowId: workflow.id,
      title: 'Page One',
      order: 0,
    }).returning();

    const [controllerStep] = await getOwnerDb().insert(schema.steps).values({
      workflowId: workflow.id,
      pageId: page.id,
      type: 'yes_no',
      title: 'Has pets?',
      alias: 'has_pets',
      order: 0,
    }).returning();

    const [targetStep] = await getOwnerDb().insert(schema.steps).values({
      workflowId: workflow.id,
      pageId: page.id,
      type: 'short_text',
      title: 'Pet name',
      alias: 'pet_name',
      order: 1,
    }).returning();

    // The `when` payload's own operand deliberately references the step by
    // its raw id (not alias) — the harder case for `remapJsonIds`, since an
    // alias-keyed reference would stay valid without any remapping at all
    // (see LogicRuleService/O-7 for why an id can appear here).
    const when: ConditionExpression = {
      type: 'group',
      id: 'portability-group',
      operator: 'AND',
      conditions: [
        {
          type: 'condition',
          id: 'portability-condition',
          variable: controllerStep.id,
          operator: 'is_true',
          valueType: 'constant',
        },
      ],
    };

    await getOwnerDb().insert(schema.logicRules).values({
      workflowId: workflow.id,
      conditionStepId: controllerStep.id,
      when,
      targetType: 'step',
      targetStepId: targetStep.id,
      action: 'show',
      order: 1,
    });

    const { tmpPath } = await exportService.exportToFile({ scope: 'workflow', id: workflow.id }, ctx.userId);
    try {
      const result = await importService.apply(tmpPath, ctx.userId, { targetProjectId: ctx.projectId });

      const newSteps = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.workflowId, result.rootId));
      const newController = newSteps.find((step) => step.alias === 'has_pets');
      const newTarget = newSteps.find((step) => step.alias === 'pet_name');
      expect(newController).toBeDefined();
      expect(newTarget).toBeDefined();
      // A real import: the new steps get fresh ids, not the source ones.
      expect(newController!.id).not.toBe(controllerStep.id);
      expect(newTarget!.id).not.toBe(targetStep.id);

      const newRules = await getOwnerDb().select().from(schema.logicRules).where(eq(schema.logicRules.workflowId, result.rootId));
      expect(newRules).toHaveLength(1);
      const [rule] = newRules;

      // FK columns are remapped onto the freshly-inserted steps.
      expect(rule.conditionStepId).toBe(newController!.id);
      expect(rule.targetStepId).toBe(newTarget!.id);
      expect(rule.action).toBe('show');
      expect(rule.targetType).toBe('step');

      // The `when` payload's own embedded step-id reference is remapped too
      // — proving `remapJsonIds` actually walked into the jsonb rather than
      // the FK columns alone happening to look right.
      const whenGroup = rule.when as ConditionExpression;
      const leaf = whenGroup?.conditions[0] as Condition;
      expect(leaf.variable).toBe(newController!.id);
      expect(leaf.operator).toBe('is_true');
    } finally {
      await fs.rm(tmpPath, { force: true });
    }
  });
});
