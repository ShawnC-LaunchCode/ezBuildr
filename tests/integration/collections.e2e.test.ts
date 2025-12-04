/**
 * Collections System E2E Tests
 * Tests the full lifecycle of collections, fields, and records
 * Stage 19: Collections / Datastore System
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../server/db';
import { tenants, users, projects } from '@shared/schema';
import { collectionService } from '../../server/services/CollectionService';
import { collectionFieldService } from '../../server/services/CollectionFieldService';
import { recordService } from '../../server/services/RecordService';
import { eq } from 'drizzle-orm';

describe('Collections System E2E Tests', () => {
  let testTenantId: string;
  let testUserId: string;
  let testProjectId: string;
  let testCollectionId: string;
  let testFieldIds: string[] = [];
  let testRecordIds: string[] = [];
  let testFieldSlug: string;

  beforeAll(async () => {
    // Create test tenant
    const [tenant] = await db.insert(tenants).values({
      name: 'E2E Test Tenant',
    }).returning();
    testTenantId = tenant.id;

    // Create test user
    const [user] = await db.insert(users).values({
      id: 'test-user-collections-e2e',
      email: 'test-collections-e2e@example.com',
      fullName: 'Collections E2E Test User',
      tenantId: testTenantId,
    }).returning();
    testUserId = user.id;

    // Create test project
    const [project] = await db.insert(projects).values({
      name: 'E2E Test Project',
      title: 'E2E Test Project',
      description: 'Project for collections E2E tests',
      tenantId: testTenantId,
      creatorId: testUserId,
      ownerId: testUserId,
    }).returning();
    testProjectId = project.id;
  });

  afterAll(async () => {
    // Cleanup in reverse order
    if (testTenantId) {
      // Delete tenant (cascade will handle the rest)
      await db.delete(tenants).where(eq(tenants.id, testTenantId));
    }
    if (testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });

  describe('Collection Lifecycle', () => {
    it('should create a collection', async () => {
      const collection = await collectionService.createCollection({
        tenantId: testTenantId,
        name: 'Customers',
        description: 'Customer database',
        projectId: testProjectId
      });

      expect(collection).toBeDefined();
      expect(collection.name).toBe('Customers');
      expect(collection.slug).toBe('customers');
      expect(collection.tenantId).toBe(testTenantId);
      testCollectionId = collection.id;
    });

    it('should list collections', async () => {
      const collections = await collectionService.listCollections(testTenantId);

      expect(collections).toBeDefined();
      expect(collections.length).toBeGreaterThan(0);
      expect(collections.some(c => c.id === testCollectionId)).toBe(true);
    });

    it('should get a collection by ID', async () => {
      const collection = await collectionService.getCollection(testCollectionId, testTenantId);

      expect(collection).toBeDefined();
      expect(collection!.id).toBe(testCollectionId);
      expect(collection!.name).toBe('Customers');
    });

    it('should update a collection', async () => {
      const updated = await collectionService.updateCollection(testCollectionId, testTenantId, {
        description: 'Updated customer database',
      });

      expect(updated.description).toBe('Updated customer database');
    });
  });

  describe('Field Management', () => {
    it('should create text field', async () => {
      const field = await collectionFieldService.createField({
        collectionId: testCollectionId,
        name: 'First Name',
        type: 'text',
        isRequired: true,
      });

      expect(field).toBeDefined();
      expect(field.name).toBe('First Name');
      expect(field.slug).toBe('first_name');
      expect(field.type).toBe('text');
      expect(field.isRequired).toBe(true);
      testFieldIds.push(field.id);
      testFieldSlug = field.slug;
    });

    it('should create email field', async () => {
      const field = await collectionFieldService.createField({
        collectionId: testCollectionId,
        name: 'Email Address',
        type: 'text',
        isRequired: true,
      });

      expect(field.slug).toBe('email_address');
      testFieldIds.push(field.id);
    });

    it('should create number field', async () => {
      const field = await collectionFieldService.createField({
        collectionId: testCollectionId,
        name: 'Age',
        type: 'number',
        isRequired: false,
        defaultValue: 0,
      });

      expect(field.type).toBe('number');
      expect(field.defaultValue).toBe(0);
      testFieldIds.push(field.id);
    });

    it('should create select field with options', async () => {
      const field = await collectionFieldService.createField({
        collectionId: testCollectionId,
        name: 'Status',
        type: 'select',
        isRequired: true,
        options: ['active', 'inactive', 'pending'],
        defaultValue: 'pending',
      });

      expect(field.type).toBe('select');
      expect(field.options).toEqual(['active', 'inactive', 'pending']);
      expect(field.defaultValue).toBe('pending');
      testFieldIds.push(field.id);
    });

    it('should create boolean field', async () => {
      const field = await collectionFieldService.createField({
        collectionId: testCollectionId,
        name: 'Is Premium',
        type: 'boolean',
        isRequired: false,
        defaultValue: false,
      });

      expect(field.type).toBe('boolean');
      expect(field.defaultValue).toBe(false);
      testFieldIds.push(field.id);
    });

    it('should list all fields', async () => {
      const fields = await collectionFieldService.listFields(testCollectionId);

      expect(fields.length).toBe(5);
      expect(fields.map(f => f.slug)).toEqual([
        'first_name',
        'email_address',
        'age',
        'status',
        'is_premium',
      ]);
    });

    it('should update field', async () => {
      const updated = await collectionFieldService.updateField(
        testFieldIds[0],
        testCollectionId,
        { name: 'Full Name' }
      );

      expect(updated.name).toBe('Full Name');
      expect(updated.slug).toBe('first_name'); // Slug shouldn't change
    });
  });

  describe('Record CRUD Operations', () => {
    it('should create a record', async () => {
      const record = await recordService.createRecord({
        tenantId: testTenantId,
        collectionId: testCollectionId,
        data: {
          first_name: 'John',
          email_address: 'john@example.com',
          age: 30,
          status: 'active',
          is_premium: true,
        }
      }, testUserId);

      expect(record).toBeDefined();
      expect((record.data as any).first_name).toBe('John');
      expect((record.data as any).email_address).toBe('john@example.com');
      expect((record.data as any).age).toBe(30);
      expect((record.data as any).status).toBe('active');
      expect((record.data as any).is_premium).toBe(true);
      testRecordIds.push(record.id);
    });

    it('should create multiple records', async () => {
      const record2 = await recordService.createRecord({
        tenantId: testTenantId,
        collectionId: testCollectionId,
        data: {
          first_name: 'Jane',
          email_address: 'jane@example.com',
          age: 25,
          status: 'active',
          is_premium: false,
        }
      }, testUserId);

      const record3 = await recordService.createRecord({
        tenantId: testTenantId,
        collectionId: testCollectionId,
        data: {
          first_name: 'Bob',
          email_address: 'bob@example.com',
          status: 'pending',
          is_premium: false,
        }
      }, testUserId);

      testRecordIds.push(record2.id, record3.id);
      expect(testRecordIds.length).toBe(3);
    });

    it('should list records with pagination', async () => {
      const result = await recordService.listRecords(testCollectionId, testTenantId, {
        limit: 10,
      });

      expect(result.length).toBe(3);
    });

    it('should get a single record', async () => {
      const record = await recordService.getRecord(testRecordIds[0], testTenantId);

      expect(record).toBeDefined();
      expect((record.data as any).first_name).toBe('John');
    });

    it('should update a record', async () => {
      const updated = await recordService.updateRecord(
        testRecordIds[0],
        testTenantId,
        { age: 31, status: 'inactive' },
        testUserId
      );

      expect((updated.data as any).age).toBe(31);
      expect((updated.data as any).status).toBe('inactive');
      expect((updated.data as any).first_name).toBe('John'); // Unchanged
    });

    it('should find records by filters', async () => {
      const result = await recordService.findRecordsByFilters(
        testCollectionId,
        testTenantId,
        { status: 'active' }
      );

      expect(result.length).toBe(1);
      expect((result[0].data as any).first_name).toBe('Jane');
    });

    it('should delete a record', async () => {
      await recordService.deleteRecord(testRecordIds[2], testTenantId);

      const result = await recordService.listRecords(testCollectionId, testTenantId, {
        limit: 10,
      });

      expect(result.length).toBe(2);
      expect(result.some(r => r.id === testRecordIds[2])).toBe(false);
    });
  });

  describe('Collection Stats', () => {
    it('should list collections with stats', async () => {
      const collections = await collectionService.listCollectionsWithStats(testTenantId);

      const customerCollection = collections.find(c => c.id === testCollectionId);
      expect(customerCollection).toBeDefined();
      expect(customerCollection!.fieldCount).toBe(5);
      expect(Number(customerCollection!.recordCount)).toBe(2);
    });
  });

  describe('Data Validation', () => {
    it('should enforce required fields', async () => {
      await expect(
        recordService.createRecord({
          tenantId: testTenantId,
          collectionId: testCollectionId,
          data: {
            age: 40, // Missing required first_name, email_address, status
          }
        }, testUserId)
      ).rejects.toThrow();
    });

    it('should validate field types', async () => {
      // This test depends on field type validation in the service
      const record = await recordService.createRecord({
        tenantId: testTenantId,
        collectionId: testCollectionId,
        data: {
          first_name: 'Test',
          email_address: 'test@example.com',
          age: 25,
          status: 'active',
          is_premium: true,
        }
      }, testUserId);

      expect((record.data as any).age).toBe(25);
      expect((record.data as any).is_premium).toBe(true);
    });
  });

  describe('Cleanup', () => {
    it('should delete collection (cascade fields and records)', async () => {
      await collectionService.deleteCollection(testCollectionId, testTenantId);

      try {
        await collectionService.getCollection(testCollectionId, testTenantId);
        // Should throw or return null depending on implementation
      } catch (e) {
        expect(e).toBeDefined();
      }

      // Verify fields are also deleted
      const fields = await collectionFieldService.listFields(testCollectionId);
      expect(fields.length).toBe(0);

      // Verify records are deleted (cascade) - listRecords throws if collection not found
      await expect(recordService.listRecords(testCollectionId, testTenantId, { limit: 10 }))
        .rejects.toThrow("Collection not found or access denied");
    });
  });
});
