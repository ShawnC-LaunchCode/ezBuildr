/**
 * Regression cover for the "a new project never shows up" defect.
 *
 * `users.id` is a varchar, and Google sign-in writes the numeric Google `sub`
 * into it (`server/googleAuth.ts`), so it is a UUID only for locally-registered
 * accounts. Both list queries used to gate their user-owned branch on a
 * UUID-shape test, and the legacy fallback requires `owner_type IS NULL`, which
 * newly created rows never satisfy — so for a Google user, `POST /api/projects`
 * returned 201 and the project was then invisible in every list.
 */

import { eq } from 'drizzle-orm';
import { it, expect, beforeEach, afterEach, describe } from 'vitest';

import * as schema from '../../../shared/schema';
import { db } from '../../../server/db';
import { projectRepository } from '../../../server/repositories/ProjectRepository';
import { workflowRepository } from '../../../server/repositories/WorkflowRepository';
import { describeWithDb } from '../../helpers/dbTestHelper';
import { TestFactory } from '../../helpers/testFactory';

/** A real Google `sub` is a ~21-digit decimal string — emphatically not a UUID. */
const GOOGLE_SUB = '110248495987748172246';

describeWithDb('ProjectRepository ownership listing', () => {
  let tenantId: string;
  const createdUserIds: string[] = [];

  beforeEach(async () => {
    const factory = new TestFactory(db);
    const { tenant } = await factory.createTenant();
    tenantId = tenant.id;
  });

  afterEach(async () => {
    for (const userId of createdUserIds.splice(0)) {
      // Projects and workflows cascade from the user rows.
      await db.delete(schema.users).where(eq(schema.users.id, userId));
    }
  });

  async function createUserWithProject(userId: string): Promise<{ projectId: string }> {
    await db.insert(schema.users).values({
      id: userId,
      tenantId,
      email: `owner-${userId}@example.com`,
      firstName: 'Test',
      lastName: 'Owner',
      role: 'admin',
      tenantRole: 'owner',
    });
    createdUserIds.push(userId);

    const [project] = await db.insert(schema.projects).values({
      tenantId,
      title: `Project for ${userId}`,
      name: `Project for ${userId}`,
      creatorId: userId,
      createdBy: userId,
      ownerId: userId,
      // The shape POST /api/projects actually writes.
      ownerType: 'user',
      ownerUuid: userId,
      status: 'active',
    }).returning();

    return { projectId: project.id };
  }

  describe.each([
    ['a Google sign-in id (non-UUID)', GOOGLE_SUB],
    ['a locally-registered id (UUID)', crypto.randomUUID()],
  ])('for %s', (_label, userId) => {
    it('returns a project the user just created', async () => {
      const { projectId } = await createUserWithProject(userId);

      const all = await projectRepository.findByCreatorId(userId, { limit: 20 });
      const active = await projectRepository.findActiveByCreatorId(userId, { limit: 20 });

      expect(all.map((project) => project.id)).toContain(projectId);
      expect(active.map((project) => project.id)).toContain(projectId);
    });

    it('returns the project exactly once, not duplicated across ownership branches', async () => {
      const { projectId } = await createUserWithProject(userId);

      const all = await projectRepository.findByCreatorId(userId, { limit: 20 });

      expect(all.filter((project) => project.id === projectId)).toHaveLength(1);
    });

    it('returns a workflow the user just created', async () => {
      const userAlreadyExists = createdUserIds.includes(userId);
      if (!userAlreadyExists) {
        await createUserWithProject(userId);
      }

      const workflow = await workflowRepository.create({
        title: 'Owned workflow',
        creatorId: userId,
        ownerId: userId,
        ownerType: 'user',
        ownerUuid: userId,
        status: 'draft',
      } as typeof schema.workflows.$inferInsert);

      const byCreator = await workflowRepository.findByCreatorId(userId);
      const byAccess = await workflowRepository.findByUserAccess(userId);
      const unfiled = await workflowRepository.findUnfiledByCreatorId(userId);

      expect(byCreator.map((w) => w.id)).toContain(workflow.id);
      expect(byAccess.map((w) => w.id)).toContain(workflow.id);
      expect(unfiled.map((w) => w.id)).toContain(workflow.id);
      expect(byCreator.filter((w) => w.id === workflow.id)).toHaveLength(1);
    });
  });

  it('reports how many workflows each project contains', async () => {
    const { projectId } = await createUserWithProject(GOOGLE_SUB);

    for (const title of ['One', 'Two', 'Three']) {
      await workflowRepository.create({
        title,
        projectId,
        creatorId: GOOGLE_SUB,
        ownerId: GOOGLE_SUB,
        ownerType: 'user',
        ownerUuid: GOOGLE_SUB,
        status: 'draft',
      } as typeof schema.workflows.$inferInsert);
    }

    const listed = await projectRepository.findByCreatorId(GOOGLE_SUB, { limit: 20 });
    const project = listed.find((candidate) => candidate.id === projectId);

    // The dashboard has always rendered this count; the list endpoints never
    // returned it, so every project read "0 workflows".
    expect(project?.workflowCount).toBe(3);
  });
});
