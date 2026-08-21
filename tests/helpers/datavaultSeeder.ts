import { randomUUID } from 'crypto';

import { eq } from 'drizzle-orm';

import * as schema from '@shared/schema';

import { getDb } from '../../server/db';
// RLS-5: this is a FIXTURE builder — the world a test is exercised in, not the
// application under test. Under RLS_RESTRICTED the app's pool is a genuine
// non-owner, so seeding through it is rejected by `users`/`datavault_*`
// policies and the suite fails for harness reasons. Callers can still pass an
// explicit `dbInstance` (e.g. a transaction) and that wins.
import { getOwnerDb } from './ownerDb';
import type { DbTransaction } from '../../server/repositories/BaseRepository';

type DBInstance = NonNullable<ReturnType<typeof getDb>>;

export interface DatavaultSeededColumn {
  id: string;
  name: string;
  slug: string;
  type: string;
}

export interface SeedDatavaultResult {
  tenantId: string;
  userId: string;
  databaseId: string;
  tableId: string;
  columns: {
    status: DatavaultSeededColumn;
    description: DatavaultSeededColumn;
    amount: DatavaultSeededColumn;
    eventDate: DatavaultSeededColumn;
    notes: DatavaultSeededColumn;
  };
  rowCount: number;
  valueCount: number;
  durationMs: number;
  cleanup: () => Promise<void>;
}

export interface SeedLargeDatavaultOptions {
  dbInstance?: DBInstance | DbTransaction;
  rowCount?: number; // default: 25000 (produces ~116k-125k values across 5 columns)
  batchSize?: number; // default: 2500 rows per insert batch
}

const STATUS_VALUES = [
  'ACTIVE',
  'PENDING',
  'SUSPENDED',
  'ARCHIVED',
  'COMPLETED',
  'IN_REVIEW',
  'PROCESSING',
  'FAILED',
] as const;

const DESCRIPTION_TEMPLATES = [
  'Standard customer support ticket for routine account inquiry and configuration review.',
  'Urgent quarterly financial audit review and compliance verification required before deadline.',
  'Special VIP account exception granted for enterprise partnership expansion program.',
  'Automated background batch processing sync completed with external partner webhook.',
  'High priority escalation regarding payment gateway timeout and retry threshold exceeded.',
  'Regular scheduled maintenance task for inventory rebalancing and catalog caching.',
  'Security anomaly flagged during multi-region login attempt; awaiting verification.',
  'Data migration export validation check passed with zero integrity anomalies detected.',
] as const;

/**
 * Reusable seeding helper for DataVault performance tests.
 * Generates a realistic dataset with >= 100k values across 5 distinct column types:
 * - short text (status)
 * - long text (description)
 * - number (amount)
 * - date (eventDate)
 * - nullable text (notes - ~1/3 of cells absent, for is_empty testing)
 *
 * Uses chunked bulk inserts to achieve high throughput (~1-4 seconds for 100k+ values).
 */
export async function seedLargeDatavaultTable(
  options?: SeedLargeDatavaultOptions
): Promise<SeedDatavaultResult> {
  const database = options?.dbInstance ?? getOwnerDb();
  if (!database) {
    throw new Error('Database instance is required for seedLargeDatavaultTable');
  }

  const rowCount = options?.rowCount ?? 25000;
  const batchSize = options?.batchSize ?? 2500;
  const startTime = Date.now();

  const tenantId = randomUUID();
  const userId = randomUUID();
  const projectId = randomUUID();
  const dbId = randomUUID();
  const tableId = randomUUID();

  // 1. Create Tenant, User, Project, DataVault Database, and DataVault Table
  await database.insert(schema.tenants).values({
    id: tenantId,
    name: `Perf Test Tenant ${tenantId.slice(0, 8)}`,
    plan: 'enterprise',
  });

  await database.insert(schema.users).values({
    id: userId,
    tenantId,
    email: `perf-${Date.now()}-${randomUUID().slice(0, 6)}@example.com`,
    firstName: 'Perf',
    lastName: 'Tester',
    fullName: 'Perf Tester',
    role: 'admin',
    tenantRole: 'owner',
    authProvider: 'local',
    defaultMode: 'easy',
  });

  await database.insert(schema.projects).values({
    id: projectId,
    tenantId,
    name: 'DataVault Perf Project',
    title: 'DataVault Perf Project',
    description: 'Project for DataVault filter performance measurements',
    createdBy: userId,
    creatorId: userId,
    ownerId: userId,
  });

  await database.insert(schema.datavaultDatabases).values({
    id: dbId,
    tenantId,
    name: 'Performance Test DB',
    description: 'Database for performance benchmarking',
    scopeType: 'account',
  });

  await database.insert(schema.datavaultTables).values({
    id: tableId,
    databaseId: dbId,
    tenantId,
    name: 'Large Filter Benchmark Table',
    slug: `filter-benchmark-${randomUUID().slice(0, 8)}`,
    description: 'Benchmarking table with 100k+ values across multiple data types',
    ownerUserId: userId,
  });

  // 2. Define Columns: short text, long text, number, date, nullable notes
  const statusColId = randomUUID();
  const descColId = randomUUID();
  const amountColId = randomUUID();
  const dateColId = randomUUID();
  const notesColId = randomUUID();

  await database.insert(schema.datavaultColumns).values([
    {
      id: statusColId,
      tableId,
      name: 'Status',
      slug: 'status',
      type: 'text',
      orderIndex: 0,
      required: true,
    },
    {
      id: descColId,
      tableId,
      name: 'Description',
      slug: 'description',
      type: 'text',
      orderIndex: 1,
      required: false,
    },
    {
      id: amountColId,
      tableId,
      name: 'Amount',
      slug: 'amount',
      type: 'number',
      orderIndex: 2,
      required: true,
    },
    {
      id: dateColId,
      tableId,
      name: 'Event Date',
      slug: 'event_date',
      type: 'date',
      orderIndex: 3,
      required: true,
    },
    {
      id: notesColId,
      tableId,
      name: 'Notes',
      slug: 'notes',
      type: 'text',
      orderIndex: 4,
      required: false,
    },
  ]);

  // 3. Bulk Insert Rows and Values in Chunks
  let totalValuesInserted = 0;
  const baseTimestamp = new Date('2024-01-01T00:00:00Z').getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  for (let offset = 0; offset < rowCount; offset += batchSize) {
    const currentBatchSize = Math.min(batchSize, rowCount - offset);
    const rowBatch: Array<typeof schema.datavaultRows.$inferInsert> = [];
    const valueBatch: Array<typeof schema.datavaultValues.$inferInsert> = [];

    for (let i = 0; i < currentBatchSize; i++) {
      const globalIndex = offset + i;
      const rowId = randomUUID();

      rowBatch.push({
        id: rowId,
        tableId,
        createdBy: userId,
        updatedBy: userId,
      });

      // Status (equality testing)
      const statusValue = STATUS_VALUES[globalIndex % STATUS_VALUES.length];
      valueBatch.push({
        id: randomUUID(),
        rowId,
        columnId: statusColId,
        value: statusValue,
      });

      // Description (contains / LIKE '%x%' testing)
      const template = DESCRIPTION_TEMPLATES[globalIndex % DESCRIPTION_TEMPLATES.length];
      const descValue = `${template} [Record Ref: REF-${(100000 + globalIndex).toString(16).toUpperCase()}]`;
      valueBatch.push({
        id: randomUUID(),
        rowId,
        columnId: descColId,
        value: descValue,
      });

      // Amount (numeric comparisons)
      // Produces values from 10.00 to 50000.00
      const amountValue = Number((((globalIndex * 37) % 50000) + 10.5).toFixed(2));
      valueBatch.push({
        id: randomUUID(),
        rowId,
        columnId: amountColId,
        value: amountValue,
      });

      // Event Date (date comparisons)
      // Dates spread between 2024-01-01 and 2026-12-31
      const dateOffsetDays = globalIndex % 1000;
      const dateIso = new Date(baseTimestamp + dateOffsetDays * dayMs)
        .toISOString()
        .split('T')[0];
      valueBatch.push({
        id: randomUUID(),
        rowId,
        columnId: dateColId,
        value: dateIso,
      });

      // Notes (is_empty testing: ~33% empty, ~67% filled).
      // Empty cells are represented by omitting the value row entirely. Do NOT seed
      // `''` here: DVH-1 made `validateAndCoerceValue` coerce blank strings to SQL
      // NULL before storage, so a `""` cell is a shape the application can no longer
      // produce, and seeding one would measure data that cannot exist.
      if (globalIndex % 3 === 0) {
        // omit the value row — this is what an empty cell looks like
      } else {
        valueBatch.push({
          id: randomUUID(),
          rowId,
          columnId: notesColId,
          value: `Additional note details for row ${globalIndex}`,
        });
      }
    }

    // Insert batch of rows
    await database.insert(schema.datavaultRows).values(rowBatch);

    // Insert batch of values in sub-chunks of 2,500
    const valueSubBatchSize = 2500;
    for (let vOffset = 0; vOffset < valueBatch.length; vOffset += valueSubBatchSize) {
      const chunk = valueBatch.slice(vOffset, vOffset + valueSubBatchSize);
      await database.insert(schema.datavaultValues).values(chunk);
      totalValuesInserted += chunk.length;
    }
  }

  const durationMs = Date.now() - startTime;

  const cleanup = async (): Promise<void> => {
    try {
      await database.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
    } catch {
      // Best effort cleanup
    }
  };

  return {
    tenantId,
    userId,
    databaseId: dbId,
    tableId,
    columns: {
      status: { id: statusColId, name: 'Status', slug: 'status', type: 'text' },
      description: { id: descColId, name: 'Description', slug: 'description', type: 'text' },
      amount: { id: amountColId, name: 'Amount', slug: 'amount', type: 'number' },
      eventDate: { id: dateColId, name: 'Event Date', slug: 'event_date', type: 'date' },
      notes: { id: notesColId, name: 'Notes', slug: 'notes', type: 'text' },
    },
    rowCount,
    valueCount: totalValuesInserted,
    durationMs,
    cleanup,
  };
}

export interface SeedWideDatavaultOptions {
  dbInstance?: DBInstance | DbTransaction;
  columnCount?: number; // default: 50
  rowCount?: number; // default: 1000
  batchSize?: number; // default: 500 rows per batch
}

export interface SeedWideDatavaultResult {
  tenantId: string;
  userId: string;
  databaseId: string;
  tableId: string;
  columns: DatavaultSeededColumn[];
  rowCount: number;
  valueCount: number;
  durationMs: number;
  cleanup: () => Promise<void>;
}

/**
 * Seeding helper for wide DataVault tables (>= 50 columns) to benchmark
 * column-narrowed row retrieval vs un-narrowed full row retrieval.
 */
export async function seedWideDatavaultTable(
  options?: SeedWideDatavaultOptions
): Promise<SeedWideDatavaultResult> {
  const database = options?.dbInstance ?? getOwnerDb();
  if (!database) {
    throw new Error('Database instance is required for seedWideDatavaultTable');
  }

  const columnCount = options?.columnCount ?? 50;
  const rowCount = options?.rowCount ?? 1000;
  const batchSize = options?.batchSize ?? 500;
  const startTime = Date.now();

  const tenantId = randomUUID();
  const userId = randomUUID();
  const projectId = randomUUID();
  const dbId = randomUUID();
  const tableId = randomUUID();

  // 1. Tenant, User, Project, Database, Table
  await database.insert(schema.tenants).values({
    id: tenantId,
    name: `Wide Perf Tenant ${tenantId.slice(0, 8)}`,
    plan: 'enterprise',
  });

  await database.insert(schema.users).values({
    id: userId,
    tenantId,
    email: `wide-perf-${Date.now()}-${randomUUID().slice(0, 6)}@example.com`,
    firstName: 'Wide',
    lastName: 'Tester',
    fullName: 'Wide Tester',
    role: 'admin',
    tenantRole: 'owner',
    authProvider: 'local',
    defaultMode: 'easy',
  });

  await database.insert(schema.projects).values({
    id: projectId,
    tenantId,
    name: 'DataVault Wide Table Perf Project',
    title: 'DataVault Wide Table Perf Project',
    description: 'Project for DataVault wide table performance measurements',
    createdBy: userId,
    creatorId: userId,
    ownerId: userId,
  });

  await database.insert(schema.datavaultDatabases).values({
    id: dbId,
    tenantId,
    name: 'Wide Benchmark DB',
    description: 'Database for wide table benchmarking',
    scopeType: 'account',
  });

  await database.insert(schema.datavaultTables).values({
    id: tableId,
    databaseId: dbId,
    tenantId,
    name: 'Wide Benchmark Table',
    slug: `wide-table-${randomUUID().slice(0, 8)}`,
    description: `Benchmarking table with ${columnCount} columns and ${rowCount} rows`,
    ownerUserId: userId,
  });

  // 2. Define `columnCount` columns (e.g. 50 columns)
  const columns: DatavaultSeededColumn[] = [];
  const columnInserts: Array<typeof schema.datavaultColumns.$inferInsert> = [];

  for (let c = 0; c < columnCount; c++) {
    const colId = randomUUID();
    const colName = `Field ${c + 1}`;
    const colSlug = `field_${c + 1}`;
    const colType = c % 5 === 2 ? 'number' : c % 5 === 3 ? 'date' : 'text';

    columns.push({
      id: colId,
      name: colName,
      slug: colSlug,
      type: colType,
    });

    columnInserts.push({
      id: colId,
      tableId,
      name: colName,
      slug: colSlug,
      type: colType,
      orderIndex: c,
      required: false,
    });
  }

  // Insert columns in chunks of 50
  for (let cOffset = 0; cOffset < columnInserts.length; cOffset += 50) {
    await database.insert(schema.datavaultColumns).values(columnInserts.slice(cOffset, cOffset + 50));
  }

  // 3. Bulk Insert Rows and Values
  let totalValuesInserted = 0;
  const baseTimestamp = new Date('2024-01-01T00:00:00Z').getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  for (let offset = 0; offset < rowCount; offset += batchSize) {
    const currentBatchSize = Math.min(batchSize, rowCount - offset);
    const rowBatch: Array<typeof schema.datavaultRows.$inferInsert> = [];
    const valueBatch: Array<typeof schema.datavaultValues.$inferInsert> = [];

    for (let i = 0; i < currentBatchSize; i++) {
      const globalIndex = offset + i;
      const rowId = randomUUID();

      rowBatch.push({
        id: rowId,
        tableId,
        createdBy: userId,
        updatedBy: userId,
      });

      for (let c = 0; c < columns.length; c++) {
        const col = columns[c];
        let val: unknown;
        if (col.type === 'number') {
          val = Number((((globalIndex * 17 + c * 31) % 10000) + 1.25).toFixed(2));
        } else if (col.type === 'date') {
          val = new Date(baseTimestamp + ((globalIndex + c * 7) % 1000) * dayMs)
            .toISOString()
            .split('T')[0];
        } else {
          val = `Value for row ${globalIndex} column ${col.slug} with standard payload metadata and details`;
        }

        valueBatch.push({
          id: randomUUID(),
          rowId,
          columnId: col.id,
          value: val,
        });
      }
    }

    // Insert batch of rows
    await database.insert(schema.datavaultRows).values(rowBatch);

    // Insert batch of values in sub-chunks of 2,500
    const valueSubBatchSize = 2500;
    for (let vOffset = 0; vOffset < valueBatch.length; vOffset += valueSubBatchSize) {
      const chunk = valueBatch.slice(vOffset, vOffset + valueSubBatchSize);
      await database.insert(schema.datavaultValues).values(chunk);
      totalValuesInserted += chunk.length;
    }
  }

  const durationMs = Date.now() - startTime;

  const cleanup = async (): Promise<void> => {
    try {
      await database.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
    } catch {
      // Best effort cleanup
    }
  };

  return {
    tenantId,
    userId,
    databaseId: dbId,
    tableId,
    columns,
    rowCount,
    valueCount: totalValuesInserted,
    durationMs,
    cleanup,
  };
}
