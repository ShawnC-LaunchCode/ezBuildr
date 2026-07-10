import type { AccessRole, DatavaultTableRole } from "@shared/schema";

import { db } from "../db";
import {
  datavaultDatabaseAccessRepository,
  datavaultDatabasesRepository,
  datavaultTableAccessRepository,
  datavaultTablePermissionsRepository,
  datavaultTablesRepository,
  teamMemberRepository,
  type DbTransaction,
} from "../repositories";
import { canManageOrg, isOrgMember } from "../utils/ownershipAccess";

import { aclService } from "./AclService";

export class DatavaultAclService {
  private databaseAccessRepo: typeof datavaultDatabaseAccessRepository;
  private tableAccessRepo: typeof datavaultTableAccessRepository;
  private tablePermissionsRepo: typeof datavaultTablePermissionsRepository;
  private databasesRepo: typeof datavaultDatabasesRepository;
  private tablesRepo: typeof datavaultTablesRepository;
  private teamMemberRepo: typeof teamMemberRepository;

  // eslint-disable-next-line max-params
  constructor(
    databaseAccessRepo?: typeof datavaultDatabaseAccessRepository,
    tableAccessRepo?: typeof datavaultTableAccessRepository,
    tablePermissionsRepo?: typeof datavaultTablePermissionsRepository,
    databasesRepo?: typeof datavaultDatabasesRepository,
    tablesRepo?: typeof datavaultTablesRepository,
    teamMemberRepoInstance?: typeof teamMemberRepository
  ) {
    this.databaseAccessRepo = databaseAccessRepo ?? datavaultDatabaseAccessRepository;
    this.tableAccessRepo = tableAccessRepo ?? datavaultTableAccessRepository;
    this.tablePermissionsRepo = tablePermissionsRepo ?? datavaultTablePermissionsRepository;
    this.databasesRepo = databasesRepo ?? datavaultDatabasesRepository;
    this.tablesRepo = tablesRepo ?? datavaultTablesRepository;
    this.teamMemberRepo = teamMemberRepoInstance ?? teamMemberRepository;
  }

  private getHighestRole(role1: AccessRole, role2: AccessRole): AccessRole {
    const rolePrecedence: Record<AccessRole, number> = {
      owner: 4,
      edit: 3,
      view: 2,
      none: 1,
    };
    return rolePrecedence[role1] > rolePrecedence[role2] ? role1 : role2;
  }

  private hasMinimumRole(userRole: AccessRole, minRole: Exclude<AccessRole, "none">): boolean {
    const rolePrecedence: Record<AccessRole, number> = {
      owner: 4,
      edit: 3,
      view: 2,
      none: 1,
    };
    return rolePrecedence[userRole] >= rolePrecedence[minRole];
  }

  private legacyTableRoleToAccessRole(role: DatavaultTableRole): AccessRole {
    switch (role) {
      case "owner":
        return "owner";
      case "write":
        return "edit";
      case "read":
        return "view";
    }
  }

  private async getUserTeamIds(userId: string, tx?: DbTransaction): Promise<string[]> {
    const memberships = await this.teamMemberRepo.findByUserId(userId, tx);
    return memberships.map((membership) => membership.teamId);
  }

  private async isUserInTenant(userId: string, tenantId: string): Promise<boolean> {
    const user = await db.query.users.findFirst({
      where: (users, { and, eq }) => and(eq(users.id, userId), eq(users.tenantId, tenantId)),
      columns: { id: true },
    });
    return user !== undefined;
  }

  async resolveRoleForDatabase(
    userId: string,
    databaseId: string,
    tx?: DbTransaction
  ): Promise<AccessRole> {
    const database = await this.databasesRepo.findById(databaseId, tx);
    if (!database) {
      return "none";
    }

    let highestRole: AccessRole = "none";

    if (database.ownerType === "user" && database.ownerUuid === userId) {
      highestRole = "owner";
    }

    if (database.ownerType === "org" && database.ownerUuid) {
      if (await canManageOrg(userId, database.ownerUuid)) {
        highestRole = this.getHighestRole(highestRole, "owner");
      } else if (await isOrgMember(userId, database.ownerUuid)) {
        highestRole = this.getHighestRole(highestRole, "view");
      }
    }

    if (!database.ownerType && database.scopeType === "account" && await this.isUserInTenant(userId, database.tenantId)) {
      highestRole = this.getHighestRole(highestRole, "owner");
    }

    if (database.scopeType === "project" && database.scopeId) {
      const projectRole = await aclService.resolveRoleForProject(userId, database.scopeId, tx);
      highestRole = this.getHighestRole(highestRole, projectRole);
    }

    if (database.scopeType === "workflow" && database.scopeId) {
      const workflowRole = await aclService.resolveRoleForWorkflow(userId, database.scopeId, tx);
      highestRole = this.getHighestRole(highestRole, workflowRole);
    }

    const userAcl = await this.databaseAccessRepo.findByDatabaseAndUser(databaseId, userId, tx);
    if (userAcl) {
      highestRole = this.getHighestRole(highestRole, userAcl.role as AccessRole);
    }

    const teamIds = await this.getUserTeamIds(userId, tx);
    if (teamIds.length > 0) {
      const teamAcls = await this.databaseAccessRepo.findByDatabaseAndTeams(databaseId, teamIds, tx);
      for (const acl of teamAcls) {
        highestRole = this.getHighestRole(highestRole, acl.role as AccessRole);
      }
    }

    return highestRole;
  }

  async resolveRoleForTable(
    userId: string,
    tableId: string,
    tx?: DbTransaction
  ): Promise<AccessRole> {
    const table = await this.tablesRepo.findById(tableId, tx);
    if (!table) {
      return "none";
    }

    let highestRole: AccessRole = "none";

    if (table.ownerUserId === userId || (table.ownerType === "user" && table.ownerUuid === userId)) {
      highestRole = "owner";
    }

    if (table.ownerType === "org" && table.ownerUuid) {
      if (await canManageOrg(userId, table.ownerUuid)) {
        highestRole = this.getHighestRole(highestRole, "owner");
      } else if (await isOrgMember(userId, table.ownerUuid)) {
        highestRole = this.getHighestRole(highestRole, "view");
      }
    }

    if (table.databaseId) {
      const databaseRole = await this.resolveRoleForDatabase(userId, table.databaseId, tx);
      highestRole = this.getHighestRole(highestRole, databaseRole);
    }

    const legacyPermission = await this.tablePermissionsRepo.findByTableAndUser(tableId, userId, tx);
    if (legacyPermission) {
      highestRole = this.getHighestRole(highestRole, this.legacyTableRoleToAccessRole(legacyPermission.role));
    }

    const userAcl = await this.tableAccessRepo.findByTableAndUser(tableId, userId, tx);
    if (userAcl) {
      highestRole = this.getHighestRole(highestRole, userAcl.role as AccessRole);
    }

    const teamIds = await this.getUserTeamIds(userId, tx);
    if (teamIds.length > 0) {
      const teamAcls = await this.tableAccessRepo.findByTableAndTeams(tableId, teamIds, tx);
      for (const acl of teamAcls) {
        highestRole = this.getHighestRole(highestRole, acl.role as AccessRole);
      }
    }

    return highestRole;
  }

  async hasDatabaseRole(
    userId: string,
    databaseId: string,
    minRole: Exclude<AccessRole, "none">,
    tx?: DbTransaction
  ): Promise<boolean> {
    const userRole = await this.resolveRoleForDatabase(userId, databaseId, tx);
    return this.hasMinimumRole(userRole, minRole);
  }

  async hasTableRole(
    userId: string,
    tableId: string,
    minRole: Exclude<AccessRole, "none">,
    tx?: DbTransaction
  ): Promise<boolean> {
    const userRole = await this.resolveRoleForTable(userId, tableId, tx);
    return this.hasMinimumRole(userRole, minRole);
  }
}

export const datavaultAclService = new DatavaultAclService();
