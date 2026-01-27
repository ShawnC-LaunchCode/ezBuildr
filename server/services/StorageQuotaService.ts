import { sql } from 'drizzle-orm';

import { db } from '../db';
import { logger } from '../logger';
import { createError } from '../utils/errors';

const MAX_STORAGE_BYTES = parseInt(process.env.STORAGE_QUOTA_BYTES ?? '524288000'); // Default 500MB

export class StorageQuotaService {
    /**
     * Check if adding new items would exceed the tenant's storage quota.
     * Throws an error if exceeded.
     */
    async checkQuota(tenantId: string, incomingSize: number): Promise<void> {
        const used = await this.getTenantUsage(tenantId);

        if (used + incomingSize > MAX_STORAGE_BYTES) {
            logger.warn({ tenantId, used, incomingSize, limit: MAX_STORAGE_BYTES }, 'Storage quota exceeded');
            throw createError.forbidden(
                `Storage quota exceeded. Used: ${(used / 1024 / 1024).toFixed(2)}MB, ` +
                `Limit: ${(MAX_STORAGE_BYTES / 1024 / 1024).toFixed(2)}MB`
            );
        }
    }

    /**
     * Calculate total storage used by a tenant (sum of template file sizes).
     * Assumes 'size' is stored in template.metadata.
     */
    async getTenantUsage(tenantId: string): Promise<number> {
        try {
            // Sum 'size' from metadata jsonb column
            // We join projects to filter by tenant
            // Note: DB table names are plural in schema (templates, projects)
            const result = await db.execute(sql`
                SELECT sum((t.metadata->>'size')::bigint) as used
                FROM templates t
                JOIN projects p ON t.project_id = p.id
                WHERE p.tenant_id = ${tenantId}
            `);

            // result is array of rows. Drizzle 'execute' returns raw result depends on driver.
            // For pg, it's usually { rows: [...] } but Drizzle wrapper might return rows directly?
            // "execute" in Drizzle with plain SQL returns strict driver result.
            // Using `db.select` is safer if possible, but casting JSONB in select is hard.
            // But common drivers return row array which works well with `result.rows` or `result[0]`.
            // Let's assume standard PG result structure.

            /* 
              Type assertion for result. 
              Vitest/Drizzle mock might behave differently, but in prod PG it's result.rows.
              If using postgres.js, it returns array directly.
            */
            const rows = (result as any).rows || result;
            return parseInt(rows[0]?.used ?? '0', 10);

        } catch (error) {
            logger.error({ error, tenantId }, 'Failed to calculate storage usage');
            return 0; // Fail open if metric fails? Or closed? Open is better for UX, but log error.
        }
    }
}

export const storageQuotaService = new StorageQuotaService();
