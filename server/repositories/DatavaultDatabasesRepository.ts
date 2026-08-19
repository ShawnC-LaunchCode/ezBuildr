import { eq, and, desc, sql, or, inArray, getTableColumns, isNull } from 'drizzle-orm';

import {
  datavaultDatabases,
  datavaultTables,
  workflowDataSources,
  projects,
  workflows,
  projectAccess,
  workflowAccess,
  organizations,
  datavaultDatabaseAccess,
  teamMembers,
} from '../../shared/schema';
import { db } from '../db';
import { getAccessibleOwnershipFilter } from '../utils/ownershipAccess';

import type { DbTransaction } from './BaseRepository';
import type { DatavaultDatabase, InsertDatavaultDatabase, DatavaultScopeType } from '../../shared/schema';

export class DatavaultDatabasesRepository {

  /**
   * Find all databases for a tenant (Legacy - admin only)
   */
  async findByTenantId(tenantId: string, tx?: DbTransaction): Promise<DatavaultDatabase[]> {
    const conn = tx ?? db;
    return conn
      .select()
      .from(datavaultDatabases)
      .where(eq(datavaultDatabases.tenantId, tenantId))
      .orderBy(desc(datavaultDatabases.updatedAt));
  }

  /**
   * Find databases visible to user (Account scope OR Project scope with access OR Workflow scope with access)
   */
  async findByTenantAndUser(tenantId: string, userId: string, tx?: DbTransaction): Promise<DatavaultDatabase[]> {
    const conn = tx ?? db;
    // Get user's org memberships for org-owned database access
    // RLS-2b (reviewer fix): thread `tx` — see DatavaultTablesRepository. A
    // pool query inside the caller's transaction deadlocks the size-1 test pool.
    const { orgIds } = await getAccessibleOwnershipFilter(userId, tx);

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

    const sharedDatabaseIds = db
      .select({ id: datavaultDatabaseAccess.databaseId })
      .from(datavaultDatabaseAccess)
      .where(
        or(
          and(
            eq(datavaultDatabaseAccess.principalType, "user"),
            eq(datavaultDatabaseAccess.principalId, userId)
          ),
          and(
            eq(datavaultDatabaseAccess.principalType, "team"),
            inArray(
              datavaultDatabaseAccess.principalId,
              db
                .select({ teamId: sql<string>`${teamMembers.teamId}::text` })
                .from(teamMembers)
                .where(eq(teamMembers.userId, userId))
            )
          )
        )
      );

    const scopeConditions = [
      // Legacy account databases without owner fields remain tenant-wide.
      and(eq(datavaultDatabases.scopeType, 'account'), isNull(datavaultDatabases.ownerType)),

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

      // Explicit sharing through DataVault database ACL
      inArray(datavaultDatabases.id, sharedDatabaseIds),
    ];

    // Add org-owned condition if user is member of any orgs
    if (orgIds.length > 0) {
      scopeConditions.push(
        and(eq(datavaultDatabases.ownerType, 'org'), inArray(datavaultDatabases.ownerUuid, orgIds))
      );
    }

    // Join with organizations to get owner name
    const results = await conn
      .select({
        ...getTableColumns(datavaultDatabases),
        ownerName: organizations.name,
      })
      .from(datavaultDatabases)
      .leftJoin(
        organizations,
        and(
          eq(datavaultDatabases.ownerType, 'org'),
          eq(datavaultDatabases.ownerUuid, sql`${organizations.id}::text`)
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
    return results as any;
  }

  /**
   * Find databases by scope
   */
  async findByScope(
    tenantId: string,
    scopeType: DatavaultScopeType,
    scopeId?: string,
    tx?: DbTransaction
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

    const conn = tx ?? db;
    return conn
      .select()
      .from(datavaultDatabases)
      .where(and(...conditions))
      .orderBy(desc(datavaultDatabases.updatedAt));
  }

  /**
   * Find database by ID
   */
  async findById(id: string, tx?: DbTransaction): Promise<DatavaultDatabase | null> {
    const database = tx ?? db;
    const results = await database
      .select()
      .from(datavaultDatabases)
      .where(eq(datavaultDatabases.id, id))
      .limit(1);

    return results[0] ?? null;
  }

  /**
   * Find database by ID with table count
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async findByIdWithStats(id: string, tx?: DbTransaction) {
    const database = await this.findById(id, tx);
    if (!database) { return null; }

    const conn = tx ?? db;
    const tableCount = await conn
      .select({ count: sql<number>`count(*)::int` })
      .from(datavaultTables)
      .where(eq(datavaultTables.databaseId, id));

    return {
      ...database,
      tableCount: Number(tableCount[0]?.count ?? 0),
    };
  }

  /**
   * Create a new database
   */
  async create(data: InsertDatavaultDatabase, tx?: DbTransaction): Promise<DatavaultDatabase> {
    const conn = tx ?? db;
    const results = await conn
      .insert(datavaultDatabases)
      .values(data)
      .returning();

    if (results[0] == null) {throw new Error("Failed to create database");}
    return results[0];
  }

  /**
   * Update database
   */
  async update(
    id: string,
    data: Partial<Omit<DatavaultDatabase, 'id' | 'createdAt'>>,
    tx?: DbTransaction
  ): Promise<DatavaultDatabase | null> {
    const conn = tx ?? db;
    const results = await conn
      .update(datavaultDatabases)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(datavaultDatabases.id, id))
      .returning();

    return results[0] ?? null;
  }

  /**
   * Delete database (tables will have database_id set to null via ON DELETE SET NULL)
   */
  async delete(id: string, tx?: DbTransaction): Promise<boolean> {
    const conn = tx ?? db;
    const results = await conn
      .delete(datavaultDatabases)
      .where(eq(datavaultDatabases.id, id))
      .returning();

    return results.length > 0;
  }

  /**
   * Check if database exists and belongs to tenant
   */
  async existsForTenant(id: string, tenantId: string, tx?: DbTransaction): Promise<boolean> {
    const conn = tx ?? db;
    const results = await conn
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
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async getTablesInDatabase(databaseId: string, tx?: DbTransaction) {
    const conn = tx ?? db;
    return conn
      .select()
      .from(datavaultTables)
      .where(eq(datavaultTables.databaseId, databaseId))
      .orderBy(datavaultTables.name);
  }

  /**
   * Count tables in database
   */
  async countTables(databaseId: string, tx?: DbTransaction): Promise<number> {
    const conn = tx ?? db;
    const result = await conn
      .select({ count: sql<number>`count(*)::int` })
      .from(datavaultTables)
      .where(eq(datavaultTables.databaseId, databaseId));

    return Number(result[0]?.count ?? 0);
  }
  /**
   * Find data sources linked to a workflow
   */
  async findByWorkflowId(workflowId: string, tx?: DbTransaction): Promise<DatavaultDatabase[]> {
    const conn = tx ?? db;
    return conn
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
  async linkToWorkflow(workflowId: string, dataSourceId: string, tx?: DbTransaction): Promise<void> {
    const conn = tx ?? db;
    await conn
      .insert(workflowDataSources)
      .values({ workflowId, dataSourceId })
      .onConflictDoNothing();
  }

  /**
   * Unlink a data source from a workflow
   */
  async unlinkFromWorkflow(workflowId: string, dataSourceId: string, tx?: DbTransaction): Promise<void> {
    const conn = tx ?? db;
    await conn
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
