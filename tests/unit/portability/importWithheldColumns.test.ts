import { it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { secrets, externalConnections } from '@shared/schema';
import { db } from '../../../server/db';
import { ENTITY_GRAPH } from '../../../server/services/portability/entityGraph';
import { exportService } from '../../../server/services/portability/ExportService';
import { describeWithDb } from '../../helpers/dbTestHelper';
import { TestFactory } from '../../helpers/testFactory';
import { applyBundle, previewBundle, seedWorkflow } from '../../helpers/bundleTestHelper';

/**
 * IEX3-7. `secrets.valueEnc` is NOT NULL and is deliberately absent from the
 * export field list — withholding secret material is the whole point. The
 * import simply omitted the column, so Postgres rejected the insert with 23502
 * and **no project bundle containing a secret could be imported at all**.
 *
 * Found by driving the import UI against a realistic project bundle; invisible
 * to every existing test because no portability fixture had ever created a
 * secret.
 */
describeWithDb('ImportService - deliberately withheld NOT NULL columns', () => {
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

  it('declares valueEnc as withheld and never exports it', () => {
    const desc = ENTITY_GRAPH.find(e => e.name === 'secrets');
    expect(desc?.withheldColumns).toContain('valueEnc');
    // The guarantee that makes the placeholder necessary in the first place.
    expect(desc?.fields).not.toContain('valueEnc');
    expect(desc?.fields).not.toContain('value');
  });

  it('imports a project bundle containing secrets and a connection', async () => {
    await seedWorkflow({ projectId, userId });
    await db.insert(secrets).values([
      { projectId, key: 'STRIPE_API_KEY', valueEnc: 'enc:real-material', type: 'api_key', environment: 'production' },
      { projectId, key: 'CRM_TOKEN', valueEnc: 'enc:real-material', type: 'bearer', environment: 'staging' },
    ]);
    await db.insert(externalConnections).values({
      tenantId, projectId, name: 'Billing API', type: 'api_key', baseUrl: 'https://api.example.com',
    });

    const bundle = await exportService.export({ scope: 'project', id: projectId }, userId);

    const preview = await previewBundle(bundle, userId);
    expect(preview.canProceed).toBe(true);
    // The manifest must name what it withheld, or the placeholder below is a
    // silent data loss rather than a documented one.
    expect(preview.requiresReentry.map(r => (r.type === 'secret' ? r.key : r.connectionName)))
      .toEqual(expect.arrayContaining(['STRIPE_API_KEY', 'CRM_TOKEN', 'Billing API']));

    const applied = await applyBundle(bundle, userId);
    expect(applied.entityCounts.secrets).toBe(2);
    expect(applied.entityCounts.connections).toBe(1);

    const imported = await db.select().from(secrets)
      .where(eq(secrets.projectId, applied.rootId));
    expect(imported).toHaveLength(2);

    for (const secret of imported) {
      // Fails closed: present so the row is writable, empty so nothing can
      // mistake it for usable material, and never the source's ciphertext.
      expect(secret.valueEnc).toBe('');
      expect(secret.value).toBeNull();
      expect(secret.valueEnc).not.toContain('enc:real-material');
    }
    // Key, type and environment survive — that is what makes the re-entry
    // checklist actionable.
    expect(imported.map(s => s.key).sort()).toEqual(['CRM_TOKEN', 'STRIPE_API_KEY']);
    expect(imported.find(s => s.key === 'CRM_TOKEN')?.environment).toBe('staging');
  });
});
