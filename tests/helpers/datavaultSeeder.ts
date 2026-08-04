import { randomUUID } from 'crypto';

import { eq } from 'drizzle-orm';

import * as schema from '@shared/schema';

import { getDb } from '../../server/db';
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
  const database = options?.dbInstance ?? getDb();
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
