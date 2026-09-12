import { adminAccessLog, type AdminAccessLogRow, type InsertAdminAccessLog } from "@shared/schema";

import { BaseRepository, type DbTransaction } from "./BaseRepository";

/**
 * RLS-6 / A4: the audit trail for the admin console's cross-tenant read
 * path (`server/db/adminDb.ts`). Writes go through the NORMAL pool (not
 * `adminDb`) — `admin_access_log` carries no `tenant_id` and has no RLS
 * policy, so recording an admin action needs no bypass.
 */
export class AdminAccessLogRepository extends BaseRepository<
  typeof adminAccessLog,
  AdminAccessLogRow,
  InsertAdminAccessLog
> {
  constructor() {
    super(adminAccessLog);
  }

  /** Record one admin cross-tenant read. */
  async record(entry: InsertAdminAccessLog, tx?: DbTransaction): Promise<AdminAccessLogRow> {
    return this.create(entry, tx);
  }
}

export const adminAccessLogRepository = new AdminAccessLogRepository();
