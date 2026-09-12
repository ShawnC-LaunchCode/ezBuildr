import { it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { steps } from '@shared/schema';
import type { ExportWarning } from '../../../server/services/portability/bundleFormat';
import { db } from '../../../server/db';
import { exportService } from '../../../server/services/portability/ExportService';
import { describeWithDb } from '../../helpers/dbTestHelper';
import { TestFactory } from '../../helpers/testFactory';
import {
  previewBundle, applyBundle, seedWorkflow, seedDatavault, seedTemplate
} from '../../helpers/bundleTestHelper';

/**
 * IEX3-2. Ids embedded in `steps.config` are remapped best-effort by
 * `remapJsonIds` and an unmapped one used to pass through in silence — an
 * import that reported `201` with zero warnings while the imported dropdown
 * still pointed at the source instance's DataVault table. These assert the
 * import now says so, and stays quiet when the reference genuinely resolved.
 */
describeWithDb('ImportService - config entity references', () => {
  let tf: TestFactory;
  let userId: string;
  let tenantId: string;
  let projectId: string;

  beforeEach(async () => {
    tf = new TestFactory();
    const t = await tf.createTenant();
    userId = t.user.id;
    tenantId = t.tenant.id;
    projectId = t.project.id;
  });

  /**
   * A choice config bound to a DataVault table column.
   *
   * STB-18: ImportService now validates `steps.config` against the
   * canonical `ChoiceAdvancedConfigSchema` (`display`/`alias`, `options`
   * non-empty), not the pre-canonical `allowMultiple`/`options: []` vocabulary
   * this fixture used before.
   *
   * The dynamic source lives in `options`, not the retired top-level
   * `dynamicOptions`: `ChoiceCardEditor` writes `options: { type: 'list' | ... }`,
   * and `VariableNormalizer` records that `dynamicOptions` "is never written by
   * current saves". Reference detection is unaffected -- `REF_KEY_TO_ENTITY` in
   * `shared/types/stepConfigRefs.ts` matches on key NAMES wherever they appear,
   * so the reported path simply becomes `config.options.*`.
   */
  function tableColumnChoice(ids: { databaseId: string; tableId: string; columnId: string }) {
    return {
      display: 'dropdown',
      options: {
        type: 'table_column',
        dataSourceId: ids.databaseId,
        tableId: ids.tableId,
        columnId: ids.columnId,
      },
    };
  }

  async function exportWorkflow(workflowId: string): Promise<Buffer> {
    return exportService.export({ scope: 'workflow', id: workflowId }, userId);
  }

  // `ExportWarning` is a discriminated union and only some branches carry
  // `column`/`missingId`, so narrow with flatMap rather than filter+map.
  function danglingRefs(warnings: ExportWarning[]): string[] {
    return warnings.flatMap(w => (w.type === 'dangling_reference' ? [w.missingId] : []));
  }

  function danglingColumns(warnings: ExportWarning[], entity?: string): string[] {
    return warnings.flatMap(w =>
      w.type === 'dangling_reference' && (entity === undefined || w.entity === entity)
        ? [w.column]
        : []
    );
  }

  it('AC 1: reports a choice bound to a DataVault table that is not in the bundle', async () => {
    const { workflowId, pageId } = await seedWorkflow({ projectId, userId });
    // Ids whose targets do not exist — the user deleted the table this dropdown
    // was wired to. Nothing can make these travel, so the import must report
    // them.
    //
    // This was a real-but-unattached database until IEX3-B5, which taught the
    // export to follow references embedded in config. That fixture now travels,
    // which is the better outcome and made the warning correctly stop firing.
    // The contract under test is unchanged: an embedded reference the import
    // cannot resolve is reported, never swallowed.
    const vault = {
      databaseId: randomUUID(),
      tableId: randomUUID(),
      columnId: randomUUID(),
    };

    await db.insert(steps).values({
      workflowId, pageId, type: 'choice', title: 'Home state',
      alias: 'home_state', order: 1, config: tableColumnChoice(vault),
    });

    const bundle = await exportWorkflow(workflowId);

    const preview = await previewBundle(bundle, userId);
    expect(preview.canProceed).toBe(true);
    expect(danglingRefs(preview.warnings)).toEqual(
      expect.arrayContaining([vault.databaseId, vault.tableId, vault.columnId])
    );

    const applied = await applyBundle(bundle, userId);
    expect(danglingRefs(applied.warnings)).toEqual(
      expect.arrayContaining([vault.databaseId, vault.tableId, vault.columnId])
    );
    expect(danglingColumns(applied.warnings, 'steps')).toEqual(expect.arrayContaining([
      'config.options.dataSourceId',
      'config.options.tableId',
      'config.options.columnId',
    ]));
  });

  it('AC 2: reports the same binding nested one and two levels deep inside a List', async () => {
    const { workflowId, pageId } = await seedWorkflow({ projectId, userId });
    // Unresolvable by construction, for the reason given in AC 1.
    const shallow = {
      databaseId: randomUUID(), tableId: randomUUID(), columnId: randomUUID(),
    };
    const deep = {
      databaseId: randomUUID(), tableId: randomUUID(), columnId: randomUUID(),
    };

    await db.insert(steps).values({
      workflowId, pageId, type: 'list', title: 'Beneficiaries',
      alias: 'beneficiaries', order: 1,
      config: {
        fields: [
          {
            kind: 'question', id: randomUUID(), alias: 'state', type: 'choice',
            title: 'State', order: 0, config: tableColumnChoice(shallow),
          },
          {
            kind: 'list', id: randomUUID(), alias: 'addresses',
            title: 'Addresses', order: 1,
            list: {
              fields: [
                {
                  kind: 'question', id: randomUUID(), alias: 'country', type: 'choice',
                  title: 'Country', order: 0, config: tableColumnChoice(deep),
                },
              ],
            },
          },
        ],
      },
    });

    const bundle = await exportWorkflow(workflowId);
    const applied = await applyBundle(bundle, userId);
    const reported = danglingRefs(applied.warnings);

    expect(reported).toEqual(expect.arrayContaining([shallow.tableId, deep.tableId]));

    expect(danglingColumns(applied.warnings)).toEqual(expect.arrayContaining([
      'config.fields[0].config.options.tableId',
      'config.fields[1].list.fields[0].config.options.tableId',
    ]));
  });

  it('AC 3: reports a final_documents step whose template is not in the bundle', async () => {
    const { workflowId, pageId } = await seedWorkflow({ projectId, userId });
    // A template that exists in the project but is never attached to the
    // workflow, so IEX3-1's reference collection does not pull it in.
    const orphan = await seedTemplate({
      projectId, userId, attachToWorkflowId: null, name: 'Unattached Letter'
    });

    await db.insert(steps).values({
      workflowId, pageId, type: 'final_documents', title: 'Your documents',
      alias: 'final_docs', order: 1,
      config: {
        markdownHeader: 'Documents',
        documents: [{ id: randomUUID(), documentId: orphan.templateId, alias: 'contract' }],
      },
    });

    const bundle = await exportWorkflow(workflowId);
    const applied = await applyBundle(bundle, userId);

    const warning = applied.warnings.find(
      w => w.type === 'dangling_reference' && w.missingId === orphan.templateId
    );
    expect(warning).toBeDefined();
    expect(warning && 'column' in warning ? warning.column : '')
      .toBe('config.documents[0].documentId');
  });

  it('AC 4: rewrites the ids and stays silent when the referenced entities travel', async () => {
    const { workflowId, pageId } = await seedWorkflow({ projectId, userId });
    // Attached this time, so IEX3-1 carries the database with the workflow.
    const vault = await seedDatavault({
      tenantId, userId, scopeType: 'project', scopeId: projectId,
      attachToWorkflowId: workflowId
    });

    await db.insert(steps).values({
      workflowId, pageId, type: 'choice', title: 'Home state',
      alias: 'home_state', order: 1, config: tableColumnChoice(vault),
    });

    const bundle = await exportWorkflow(workflowId);
    const applied = await applyBundle(bundle, userId);

    expect(danglingRefs(applied.warnings)).not.toEqual(
      expect.arrayContaining([vault.databaseId, vault.tableId, vault.columnId])
    );

    const imported = await db.select().from(steps).where(eq(steps.workflowId, applied.rootId));
    const choice = imported.find(s => s.type === 'choice');
    expect(choice).toBeDefined();
    const dynamicSource = (choice!.config as {
      options: { dataSourceId: string; tableId: string; columnId: string };
    }).options;

    // Remapped, not carried over: the imported copy must point at its own rows.
    expect(dynamicSource.dataSourceId).not.toBe(vault.databaseId);
    expect(dynamicSource.tableId).not.toBe(vault.tableId);
    expect(dynamicSource.columnId).not.toBe(vault.columnId);
    expect(dynamicSource.dataSourceId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('AC 5: never warns about locally-scoped ids in a config', async () => {
    const { workflowId, pageId } = await seedWorkflow({ projectId, userId });

    await db.insert(steps).values({
      workflowId, pageId, type: 'choice', title: 'Colour',
      alias: 'colour', order: 1,
      config: {
        display: 'radio',
        // Every id here is UUID-shaped and local to the config.
        options: [
          { id: randomUUID(), label: 'Red', alias: 'red' },
          { id: randomUUID(), label: 'Blue', alias: 'blue' },
        ],
      },
    });

    const applied = await applyBundle(await exportWorkflow(workflowId), userId);
    expect(applied.warnings.filter(w => w.type === 'dangling_reference')).toEqual([]);
  });
});
