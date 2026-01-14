import { eq, and, desc, sql, or, inArray, getTableColumns } from 'drizzle-orm';

import { datavaultDatabases, datavaultTables, workflowDataSources, projects, workflows, projectAccess, workflowAccess, organizations } from '../../shared/schema';
import { db } from '../db';
import { getAccessibleOwnershipFilter } from '../utils/ownershipAccess';

import type { DbTransaction } from './BaseRepository';
import type { DatavaultDatabase, InsertDatavaultDatabase, DatavaultScopeType } from '../../shared/schema';

export class DatavaultDatabasesRepository {

  /**
   * Find all databases for a tenant (Legacy - admin only)
   */
  async findByTenantId(tenantId: string): Promise<DatavaultDatabase[]> {
    return db
      .select()
      .from(datavaultDatabases)
      .where(eq(datavaultDatabases.tenantId, tenantId))
      .orderBy(desc(datavaultDatabases.updatedAt));
  }

  /**
   * Find databases visible to user (Account scope OR Project scope with access OR Workflow scope with access)
   */
  async findByTenantAndUser(tenantId: string, userId: string): Promise<DatavaultDatabase[]> {
    // Get user's org memberships for org-owned database access
    const { orgIds } = await getAccessibleOwnershipFilter(userId);

    // 1. Get projects user has access to
    const sharedProjectIds = db
      .select({ id: projectAccess.projectId })
      .from(projectAccess)
      .where(eq(projectAccess.principalId, userId));

    // 2. Get workflows user has access to
    const sharedWorkflowIds = db
      .select({ id: workflowAccess.workflowId })
      .from(workflowAccess)
      .where(eq(workflowAccess.principalId, userId));

    const scopeConditions = [
      // Account Scope: Visible to everyone in tenant
      eq(datavaultDatabases.scopeType, 'account'),

      // Project Scope: User owns project OR has shared access
      and(
        eq(datavaultDatabases.scopeType, 'project'),
        or(
          inArray(
            datavaultDatabases.scopeId,
            db.select({ id: projects.id }).from(projects).where(
              or(
                eq(projects.ownerId, userId), // Legacy
                eq(projects.createdBy, userId), // Legacy
                and(eq(projects.ownerType, 'user'), eq(projects.ownerUuid, userId)), // New model
                ...(orgIds.length > 0 ? [and(eq(projects.ownerType, 'org'), inArray(projects.ownerUuid, orgIds))] : [])
              )
            )
          ),
          inArray(datavaultDatabases.scopeId, sharedProjectIds)
        )
      ),

      // Workflow Scope: User created/owns workflow OR has shared access
      and(
        eq(datavaultDatabases.scopeType, 'workflow'),
        or(
          inArray(
            datavaultDatabases.scopeId,
            db.select({ id: workflows.id }).from(workflows).where(
              or(
                eq(workflows.creatorId, userId), // Legacy
                eq(workflows.ownerId, userId), // Legacy
                and(eq(workflows.ownerType, 'user'), eq(workflows.ownerUuid, userId)), // New model
                ...(orgIds.length > 0 ? [and(eq(workflows.ownerType, 'org'), inArray(workflows.ownerUuid, orgIds))] : [])
              )
            )
          ),
          inArray(datavaultDatabases.scopeId, sharedWorkflowIds)
        )
      ),

      // Direct ownership: User-owned
      and(eq(datavaultDatabases.ownerType, 'user'), eq(datavaultDatabases.ownerUuid, userId)),
    ];

    // Add org-owned condition if user is member of any orgs
    if (orgIds.length > 0) {
      scopeConditions.push(
        and(eq(datavaultDatabases.ownerType, 'org'), inArray(datavaultDatabases.ownerUuid, orgIds))
      );
    }

    // Join with organizations to get owner name
    const results = await db
      .select({
        ...getTableColumns(datavaultDatabases),
        ownerName: organizations.name,
      })
      .from(datavaultDatabases)
      .leftJoin(
        organizations,
        and(
          eq(datavaultDatabases.ownerType, 'org'),
          eq(datavaultDatabases.ownerUuid, organizations.id)
        )
      )
      .where(
        and(
          eq(datavaultDatabases.tenantId, tenantId),
          or(...scopeConditions)
        )
      )
      .orderBy(desc(datavaultDatabases.updatedAt));

    // Results already have all database columns + ownerName at top level
    return results as any;
  }

  /**
   * Find databases by scope
   */
  async findByScope(
    tenantId: string,
    scopeType: DatavaultScopeType,
    scopeId?: string
  ): Promise<DatavaultDatabase[]> {
    const conditions = [eq(datavaultDatabases.tenantId, tenantId)];

    if (scopeType === 'account') {
      conditions.push(eq(datavaultDatabases.scopeType, 'account'));
    } else {
      conditions.push(
        eq(datavaultDatabases.scopeType, scopeType),
        eq(datavaultDatabases.scopeId, scopeId!)
      );
    }

    return db
      .select()
      .from(datavaultDatabases)
      .where(and(...conditions))
      .orderBy(desc(datavaultDatabases.updatedAt));
  }

  /**
   * Find database by ID
   */
  async findById(id: string, tx?: DbTransaction): Promise<DatavaultDatabase | null> {
    const database = tx || db;
    const results = await database
      .select()
      .from(datavaultDatabases)
      .where(eq(datavaultDatabases.id, id))
      .limit(1);

    return results[0] || null;
  }

  /**
   * Find database by ID with table count
   */
  async findByIdWithStats(id: string) {
    const database = await this.findById(id);
    if (!database) {return null;}

    const tableCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(datavaultTables)
      .where(eq(datavaultTables.databaseId, id));

    return {
      ...database,
      tableCount: Number(tableCount[0]?.count || 0),
    };
  }

  /**
   * Create a new database
   */
  async create(data: InsertDatavaultDatabase): Promise<DatavaultDatabase> {
    const results = await db
      .insert(datavaultDatabases)
      .values(data)
      .returning();

    return results[0];
  }

  /**
   * Update database
   */
  async update(
    id: string,
    data: Partial<Omit<DatavaultDatabase, 'id' | 'createdAt'>>
  ): Promise<DatavaultDatabase | null> {
    const results = await db
      .update(datavaultDatabases)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(datavaultDatabases.id, id))
      .returning();

    return results[0] || null;
  }

  /**
   * Delete database (tables will have database_id set to null via ON DELETE SET NULL)
   */
  async delete(id: string): Promise<boolean> {
    const results = await db
      .delete(datavaultDatabases)
      .where(eq(datavaultDatabases.id, id))
      .returning();

    return results.length > 0;
  }

  /**
   * Check if database exists and belongs to tenant
   */
  async existsForTenant(id: string, tenantId: string): Promise<boolean> {
    const results = await db
      .select({ id: datavaultDatabases.id })
      .from(datavaultDatabases)
      .where(
        and(
          eq(datavaultDatabases.id, id),
          eq(datavaultDatabases.tenantId, tenantId)
        )
      )
      .limit(1);

    return results.length > 0;
  }

  /**
   * Get tables in a database
   */
  async getTablesInDatabase(databaseId: string) {
    return db
      .select()
      .from(datavaultTables)
      .where(eq(datavaultTables.databaseId, databaseId))
      .orderBy(datavaultTables.name);
  }

  /**
   * Count tables in database
   */
  async countTables(databaseId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(datavaultTables)
      .where(eq(datavaultTables.databaseId, databaseId));

    return Number(result[0]?.count || 0);
  }
  /**
   * Find data sources linked to a workflow
   */
  async findByWorkflowId(workflowId: string): Promise<DatavaultDatabase[]> {
    return db
      .select({
        id: datavaultDatabases.id,
        tenantId: datavaultDatabases.tenantId,
        name: datavaultDatabases.name,
        description: datavaultDatabases.description,
        type: datavaultDatabases.type,
        config: datavaultDatabases.config,
        scopeType: datavaultDatabases.scopeType,
        scopeId: datavaultDatabases.scopeId,
        ownerType: datavaultDatabases.ownerType,
        ownerUuid: datavaultDatabases.ownerUuid,
        createdAt: datavaultDatabases.createdAt,
        updatedAt: datavaultDatabases.updatedAt,
      })
      .from(datavaultDatabases)
      .innerJoin(workflowDataSources, eq(workflowDataSources.dataSourceId, datavaultDatabases.id))
      .where(eq(workflowDataSources.workflowId, workflowId))
      .orderBy(desc(datavaultDatabases.updatedAt));
  }

  /**
   * Link a data source to a workflow
   */
  async linkToWorkflow(workflowId: string, dataSourceId: string): Promise<void> {
    await db
      .insert(workflowDataSources)
      .values({ workflowId, dataSourceId })
      .onConflictDoNothing();
  }

  /**
   * Unlink a data source from a workflow
   */
  async unlinkFromWorkflow(workflowId: string, dataSourceId: string): Promise<void> {
    await db
      .delete(workflowDataSources)
      .where(
        and(
          eq(workflowDataSources.workflowId, workflowId),
          eq(workflowDataSources.dataSourceId, dataSourceId)
        )
      );
  }
}

export const datavaultDatabasesRepository = new DatavaultDatabasesRepository();
