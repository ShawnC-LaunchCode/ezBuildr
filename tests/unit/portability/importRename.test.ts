import { it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { workflows, projects } from '@shared/schema';
import { db } from '../../../server/db';
import { exportService } from '../../../server/services/portability/ExportService';
import { describeWithDb } from '../../helpers/dbTestHelper';
import { TestFactory } from '../../helpers/testFactory';
import { applyBundle, seedWorkflow } from '../../helpers/bundleTestHelper';

/**
 * IEX3-8. `applyOptionsSchema` has allowed `name` since round 2 and
 * `ImportService.apply` never read it, so the import screen's "Rename" field
 * posted a value the service dropped on the floor: the user typed a new name,
 * confirmed, and got the original title back.
 *
 * Caught reviewing IEX3-5 rather than by a test, because the ticket's criterion
 * was "apply sends only allowlisted fields" — which passed while the field it
 * sent did nothing.
 */
describeWithDb('ImportService - renaming the imported root', () => {
  let tf: TestFactory;
  let userId: string;
  let projectId: string;

  beforeEach(async () => {
    tf = new TestFactory();
    const t = await tf.createTenant();
    userId = t.user.id;
    projectId = t.project.id;
  });

  it('renames the workflow root when a name is supplied', async () => {
    const { workflowId } = await seedWorkflow({ projectId, userId, title: 'Original Intake' });
    const bundle = await exportService.export({ scope: 'workflow', id: workflowId }, userId);

    const applied = await applyBundle(bundle, userId, {
      targetProjectId: projectId,
      name: 'Renamed Baseline',
    });

    const [imported] = await db.select().from(workflows).where(eq(workflows.id, applied.rootId));
    expect(imported.title).toBe('Renamed Baseline');
    // `name` shadows `title` throughout this schema; leaving it stale is how a
    // renamed workflow shows its old label in half the surfaces.
    expect(imported.name).toBe('Renamed Baseline');

    // The source is untouched — this is a copy, not a move.
    const [source] = await db.select().from(workflows).where(eq(workflows.id, workflowId));
    expect(source.title).toBe('Original Intake');
  });

  it('keeps the original title when no name is supplied', async () => {
    const { workflowId } = await seedWorkflow({ projectId, userId, title: 'Untouched Intake' });
    const bundle = await exportService.export({ scope: 'workflow', id: workflowId }, userId);

    const applied = await applyBundle(bundle, userId, { targetProjectId: projectId });

    const [imported] = await db.select().from(workflows).where(eq(workflows.id, applied.rootId));
    // Re-imported into the same project, so the uniqueness pass owns the title
    // and may append a suffix — the stem is what must survive.
    expect(imported.title.startsWith('Untouched Intake')).toBe(true);
  });

  it('treats a blank name as no rename rather than writing an empty title', async () => {
    const { workflowId } = await seedWorkflow({ projectId, userId, title: 'Blank Name Intake' });
    const bundle = await exportService.export({ scope: 'workflow', id: workflowId }, userId);

    const applied = await applyBundle(bundle, userId, {
      targetProjectId: projectId,
      name: '   ',
    });

    const [imported] = await db.select().from(workflows).where(eq(workflows.id, applied.rootId));
    expect(imported.title.startsWith('Blank Name Intake')).toBe(true);
    expect(imported.title.trim()).not.toBe('');
  });

  it('still uniquifies a requested name that already exists', async () => {
    const { workflowId } = await seedWorkflow({ projectId, userId, title: 'Source Intake' });
    await seedWorkflow({ projectId, userId, title: 'Taken Name' });
    const bundle = await exportService.export({ scope: 'workflow', id: workflowId }, userId);

    const applied = await applyBundle(bundle, userId, {
      targetProjectId: projectId,
      name: 'Taken Name',
    });

    const [imported] = await db.select().from(workflows).where(eq(workflows.id, applied.rootId));
    // Renaming must not become a way around the uniqueness pass.
    expect(imported.title).toBe('Taken Name (2)');
  });

  it('renames only the root of a project bundle, not every workflow in it', async () => {
    await seedWorkflow({ projectId, userId, title: 'Child One' });
    await seedWorkflow({ projectId, userId, title: 'Child Two' });
    const bundle = await exportService.export({ scope: 'project', id: projectId }, userId);

    const applied = await applyBundle(bundle, userId, { name: 'Renamed Project' });

    const [importedProject] = await db.select().from(projects).where(eq(projects.id, applied.rootId));
    expect(importedProject.title).toBe('Renamed Project');

    // The workflows inside keep their own names. Renaming all of them to the
    // project's title is not what "rename this import" means.
    const importedWorkflows = await db.select().from(workflows)
      .where(eq(workflows.projectId, applied.rootId));
    expect(importedWorkflows.map(w => w.title).sort()).toEqual(['Child One', 'Child Two']);
  });
});
