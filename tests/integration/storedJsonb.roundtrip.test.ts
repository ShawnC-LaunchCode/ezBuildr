import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import * as schema from '@shared/schema';

// Fixtures and reads run on the owner connection: this suite proves what the
// driver + drizzle column mapping hands back, not what a tenant may see.
import { getOwnerDb } from '../helpers/ownerDb';
import { TestFactory } from '../helpers/testFactory';

/**
 * Round-trips through the real driver and drizzle -- the path the bug lived on.
 * A jsonb string that is also valid JSON ("12345", "true") used to read back
 * as a number or boolean (2026-09-15). Each column below can hold a bare string.
 */
describe('jsonb columns read back the strings they stored', () => {
  it('a question default that looks like JSON stays a string', async () => {
    const factory = new TestFactory();
    const { project, user } = await factory.createTenant();
    const { workflow } = await factory.createWorkflow(project.id, user.id);
    const page = await factory.createPage(workflow.id);
    const step = await factory.createStep(page.id, { defaultValue: '12345' });

    const [row] = await getOwnerDb()
      .select({ defaultValue: schema.steps.defaultValue })
      .from(schema.steps)
      .where(eq(schema.steps.id, step.id));
    expect(row.defaultValue).toBe('12345');
  });

  it('DataVault text cells that look like JSON stay strings', async () => {
    const factory = new TestFactory();
    const { tenant, project, user } = await factory.createTenant();
    const database = await factory.createDatabase(project.id, tenant.id, user.id);
    const table = await factory.createTable(database.id, user.id, { tenantId: tenant.id });
    const [code] = await getOwnerDb().insert(schema.datavaultColumns)
      .values({ tableId: table.id, name: 'Code', slug: 'code', type: 'text' }).returning();
    const [flag] = await getOwnerDb().insert(schema.datavaultColumns)
      .values({ tableId: table.id, name: 'Flag', slug: 'flag', type: 'text' }).returning();
    const [dvRow] = await getOwnerDb().insert(schema.datavaultRows)
      .values({ tableId: table.id, createdBy: user.id }).returning();
    await getOwnerDb().insert(schema.datavaultValues).values([
      { rowId: dvRow.id, columnId: code.id, value: '12345' },
      { rowId: dvRow.id, columnId: flag.id, value: 'true' },
    ]);

    const cells = await getOwnerDb()
      .select({ columnId: schema.datavaultValues.columnId, value: schema.datavaultValues.value })
      .from(schema.datavaultValues)
      .where(eq(schema.datavaultValues.rowId, dvRow.id));
    const byColumn = new Map(cells.map((cell) => [cell.columnId, cell.value]));
    expect(byColumn.get(code.id)).toBe('12345');
    expect(byColumn.get(flag.id)).toBe('true');
  });

  it('a collection field default that looks like JSON stays a string', async () => {
    const factory = new TestFactory();
    const { tenant, user } = await factory.createTenant();
    const collection = await factory.createCollection(tenant.id, user.id);
    const [field] = await getOwnerDb().insert(schema.collectionFields)
      .values({ collectionId: collection.id, name: 'Flag', slug: 'flag', type: 'text', defaultValue: 'true' })
      .returning();

    const [row] = await getOwnerDb()
      .select({ defaultValue: schema.collectionFields.defaultValue })
      .from(schema.collectionFields)
      .where(eq(schema.collectionFields.id, field.id));
    expect(row.defaultValue).toBe('true');
  });
});
