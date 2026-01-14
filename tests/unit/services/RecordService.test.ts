import { describe, it, expect, beforeEach, vi } from 'vitest';

import { RecordService } from '../../../server/services/RecordService';

describe('RecordService', () => {
  let service: RecordService;
  let mockRecordRepo: any;
  let mockCollectionRepo: any;
  let mockFieldRepo: any;

  const mockTenantId = '550e8400-e29b-41d4-a716-446655440000';
  const mockCollectionId = '660e8400-e29b-41d4-a716-446655440001';
  const mockRecordId = '770e8400-e29b-41d4-a716-446655440002';
  const mockUserId = '880e8400-e29b-41d4-a716-446655440003';

  beforeEach(() => {
    vi.clearAllMocks();

    mockRecordRepo = {
      findById: vi.fn(),
      findByCollectionId: vi.fn(),
      findByTenantId: vi.fn(),
      findByFilters: vi.fn(),
      countByCollectionId: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    mockCollectionRepo = {
      findById: vi.fn(),
    };

    mockFieldRepo = {
      findByCollectionId: vi.fn(),
    };

    service = new RecordService(mockRecordRepo, mockCollectionRepo, mockFieldRepo);
  });

  describe('createRecord', () => {
    it('should create record with valid data', async () => {
      const fields = [
        {
          id: 'field-1',
          collectionId: mockCollectionId,
          name: 'Email',
          slug: 'email',
          type: 'text' as const,
          isRequired: true,
          options: null,
          defaultValue: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const insertData = {
        tenantId: mockTenantId,
        collectionId: mockCollectionId,
        data: { email: 'test@example.com' },
      };

      const createdRecord = {
        id: mockRecordId,
        ...insertData,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: mockUserId,
        updatedBy: mockUserId,
      };

      mockCollectionRepo.findById.mockResolvedValue({ id: mockCollectionId });
      mockFieldRepo.findByCollectionId.mockResolvedValue(fields);
      mockRecordRepo.create.mockResolvedValue(createdRecord);

      const result = await service.createRecord(insertData, mockUserId);

      expect(result).toEqual(createdRecord);
      expect(mockRecordRepo.create).toHaveBeenCalledWith(
        {
          ...insertData,
          createdBy: mockUserId,
          updatedBy: mockUserId,
        },
        undefined
      );
    });

    it('should throw error if required field is missing', async () => {
      const fields = [
        {
          id: 'field-1',
          collectionId: mockCollectionId,
          name: 'Email',
          slug: 'email',
          type: 'text' as const,
          isRequired: true,
          options: null,
          defaultValue: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const insertData = {
        tenantId: mockTenantId,
        collectionId: mockCollectionId,
        data: {}, // Missing required 'email' field
      };

      mockCollectionRepo.findById.mockResolvedValue({ id: mockCollectionId });
      mockFieldRepo.findByCollectionId.mockResolvedValue(fields);

      await expect(service.createRecord(insertData, mockUserId)).rejects.toThrow(
        "Required field 'Email' (email) is missing"
      );
    });

    it('should apply default values to missing fields', async () => {
      const fields = [
        {
          id: 'field-1',
          collectionId: mockCollectionId,
          name: 'Active',
          slug: 'active',
          type: 'boolean' as const,
          isRequired: false,
          options: null,
          defaultValue: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const insertData = {
        tenantId: mockTenantId,
        collectionId: mockCollectionId,
        data: {}, // No data, should get default value
      };

      const createdRecord = {
        id: mockRecordId,
        tenantId: mockTenantId,
        collectionId: mockCollectionId,
        data: { active: true }, // Default applied
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: mockUserId,
        updatedBy: mockUserId,
      };

      mockCollectionRepo.findById.mockResolvedValue({ id: mockCollectionId });
      mockFieldRepo.findByCollectionId.mockResolvedValue(fields);
      mockRecordRepo.create.mockResolvedValue(createdRecord);

      const result = await service.createRecord(insertData, mockUserId);

      expect(result.data).toEqual({ active: true });
    });

    it('should throw error for unknown field', async () => {
      const fields = [
        {
          id: 'field-1',
          collectionId: mockCollectionId,
          name: 'Email',
          slug: 'email',
          type: 'text' as const,
          isRequired: false,
          options: null,
          defaultValue: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const insertData = {
        tenantId: mockTenantId,
        collectionId: mockCollectionId,
        data: { unknownField: 'value' },
      };

      mockCollectionRepo.findById.mockResolvedValue({ id: mockCollectionId });
      mockFieldRepo.findByCollectionId.mockResolvedValue(fields);

      await expect(service.createRecord(insertData, mockUserId)).rejects.toThrow(
        "Unknown field 'unknownField' - field does not exist in collection"
      );
    });

    it('should validate field type (text)', async () => {
      const fields = [
        {
          id: 'field-1',
          collectionId: mockCollectionId,
          name: 'Email',
          slug: 'email',
          type: 'text' as const,
          isRequired: true,
          options: null,
          defaultValue: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const insertData = {
        tenantId: mockTenantId,
        collectionId: mockCollectionId,
        data: { email: 123 }, // Invalid: should be string
      };

      mockCollectionRepo.findById.mockResolvedValue({ id: mockCollectionId });
      mockFieldRepo.findByCollectionId.mockResolvedValue(fields);

      await expect(service.createRecord(insertData, mockUserId)).rejects.toThrow(
        "Field 'Email' must be a string"
      );
    });

    it('should validate field type (number)', async () => {
      const fields = [
        {
          id: 'field-1',
          collectionId: mockCollectionId,
          name: 'Age',
          slug: 'age',
          type: 'number' as const,
          isRequired: true,
          options: null,
          defaultValue: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const insertData = {
        tenantId: mockTenantId,
        collectionId: mockCollectionId,
        data: { age: 'not a number' }, // Invalid
      };

      mockCollectionRepo.findById.mockResolvedValue({ id: mockCollectionId });
      mockFieldRepo.findByCollectionId.mockResolvedValue(fields);

      await expect(service.createRecord(insertData, mockUserId)).rejects.toThrow(
        "Field 'Age' must be a valid number"
      );
    });

    it('should validate select field options', async () => {
      const fields = [
        {
          id: 'field-1',
          collectionId: mockCollectionId,
          name: 'Status',
          slug: 'status',
          type: 'select' as const,
          isRequired: true,
          options: ['Draft', 'Published', 'Archived'],
          defaultValue: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const insertData = {
        tenantId: mockTenantId,
        collectionId: mockCollectionId,
        data: { status: 'InvalidStatus' }, // Not in options
      };

      mockCollectionRepo.findById.mockResolvedValue({ id: mockCollectionId });
      mockFieldRepo.findByCollectionId.mockResolvedValue(fields);

      await expect(service.createRecord(insertData, mockUserId)).rejects.toThrow(
        "Field 'Status' value 'InvalidStatus' is not a valid option"
      );
    });

    it('should validate multi-select field options', async () => {
      const fields = [
        {
          id: 'field-1',
          collectionId: mockCollectionId,
          name: 'Tags',
          slug: 'tags',
          type: 'multi_select' as const,
          isRequired: true,
          options: ['Tag1', 'Tag2', 'Tag3'],
          defaultValue: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const insertData = {
        tenantId: mockTenantId,
        collectionId: mockCollectionId,
        data: { tags: ['Tag1', 'InvalidTag'] }, // InvalidTag not in options
      };

      mockCollectionRepo.findById.mockResolvedValue({ id: mockCollectionId });
      mockFieldRepo.findByCollectionId.mockResolvedValue(fields);

      await expect(service.createRecord(insertData, mockUserId)).rejects.toThrow(
        "Field 'Tags' value 'InvalidTag' is not a valid option"
      );
    });

    it('should allow null for non-required fields', async () => {
      const fields = [
        {
          id: 'field-1',
          collectionId: mockCollectionId,
          name: 'Optional Field',
          slug: 'optional',
          type: 'text' as const,
          isRequired: false,
          options: null,
          defaultValue: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const insertData = {
        tenantId: mockTenantId,
        collectionId: mockCollectionId,
        data: { optional: null },
      };

      const createdRecord = {
        id: mockRecordId,
        ...insertData,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: mockUserId,
        updatedBy: mockUserId,
      };

      mockCollectionRepo.findById.mockResolvedValue({ id: mockCollectionId });
      mockFieldRepo.findByCollectionId.mockResolvedValue(fields);
      mockRecordRepo.create.mockResolvedValue(createdRecord);

      const result = await service.createRecord(insertData, mockUserId);

      expect(result).toBeDefined();
    });
  });

  describe('verifyRecordOwnership', () => {
    it('should return record if tenant owns it', async () => {
      const record = {
        id: mockRecordId,
        tenantId: mockTenantId,
        collectionId: mockCollectionId,
        data: { email: 'test@example.com' },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: mockUserId,
        updatedBy: null,
      };

      mockRecordRepo.findById.mockResolvedValue(record);

      const result = await service.verifyRecordOwnership(mockRecordId, mockTenantId);

      expect(result).toEqual(record);
    });

    it('should throw error if record not found', async () => {
      mockRecordRepo.findById.mockResolvedValue(undefined);

      await expect(
        service.verifyRecordOwnership(mockRecordId, mockTenantId)
      ).rejects.toThrow('Record not found');
    });

    it('should throw error if tenant does not own record', async () => {
      const record = {
        id: mockRecordId,
        tenantId: 'different-tenant-id',
        collectionId: mockCollectionId,
        data: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: mockUserId,
        updatedBy: null,
      };

      mockRecordRepo.findById.mockResolvedValue(record);

      await expect(
        service.verifyRecordOwnership(mockRecordId, mockTenantId)
      ).rejects.toThrow('Access denied - record belongs to different tenant');
    });
  });

  describe('updateRecord', () => {
    it('should update record with valid data', async () => {
      const record = {
        id: mockRecordId,
        tenantId: mockTenantId,
        collectionId: mockCollectionId,
        data: { email: 'old@example.com' },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: mockUserId,
        updatedBy: null,
      };

      const fields = [
        {
          id: 'field-1',
          collectionId: mockCollectionId,
          name: 'Email',
          slug: 'email',
          type: 'text' as const,
          isRequired: true,
          options: null,
          defaultValue: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const updatedRecord = {
        ...record,
        data: { email: 'new@example.com' },
        updatedAt: new Date(),
        updatedBy: mockUserId,
      };

      mockRecordRepo.findById.mockResolvedValue(record);
      mockFieldRepo.findByCollectionId.mockResolvedValue(fields);
      mockRecordRepo.update.mockResolvedValue(updatedRecord);

      const result = await service.updateRecord(
        mockRecordId,
        mockTenantId,
        { email: 'new@example.com' },
        mockUserId
      );

      expect((result.data as any).email).toBe('new@example.com');
    });

    it('should merge updates with existing data', async () => {
      const record = {
        id: mockRecordId,
        tenantId: mockTenantId,
        collectionId: mockCollectionId,
        data: { email: 'test@example.com', name: 'John' },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: mockUserId,
        updatedBy: null,
      };

      const fields = [
        {
          id: 'field-1',
          collectionId: mockCollectionId,
          name: 'Email',
          slug: 'email',
          type: 'text' as const,
          isRequired: true,
          options: null,
          defaultValue: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'field-2',
          collectionId: mockCollectionId,
          name: 'Name',
          slug: 'name',
          type: 'text' as const,
          isRequired: false,
          options: null,
          defaultValue: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const updatedRecord = {
        ...record,
        data: { email: 'new@example.com', name: 'John' },
      };

      mockRecordRepo.findById.mockResolvedValue(record);
      mockFieldRepo.findByCollectionId.mockResolvedValue(fields);
      mockRecordRepo.update.mockResolvedValue(updatedRecord);

      const result = await service.updateRecord(
        mockRecordId,
        mockTenantId,
        { email: 'new@example.com' }, // Only updating email
        mockUserId
      );

      expect(result.data).toEqual({ email: 'new@example.com', name: 'John' });
    });
  });

  describe('listRecords', () => {
    it('should list records in collection with pagination', async () => {
      const collection = {
        id: mockCollectionId,
        tenantId: mockTenantId,
        name: 'Test',
        slug: 'test',
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const records = [
        {
          id: 'record-1',
          tenantId: mockTenantId,
          collectionId: mockCollectionId,
          data: { email: 'test1@example.com' },
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: mockUserId,
          updatedBy: null,
        },
      ];

      mockCollectionRepo.findById.mockResolvedValue(collection);
      mockRecordRepo.findByCollectionId.mockResolvedValue(records);

      const result = await service.listRecords(
        mockCollectionId,
        mockTenantId,
        { limit: 10, offset: 0 }
      );

      expect(result).toHaveLength(1);
      expect(mockRecordRepo.findByCollectionId).toHaveBeenCalledWith(
        mockCollectionId,
        { limit: 10, offset: 0 },
        undefined
      );
    });

    it('should throw error if collection does not belong to tenant', async () => {
      const collection = {
        id: mockCollectionId,
        tenantId: 'different-tenant',
        name: 'Test',
        slug: 'test',
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCollectionRepo.findById.mockResolvedValue(collection);

      await expect(
        service.listRecords(mockCollectionId, mockTenantId)
      ).rejects.toThrow('Collection not found or access denied');
    });
  });

  describe('bulkCreateRecords', () => {
    it('should create multiple records', async () => {
      const collection = {
        id: mockCollectionId,
        tenantId: mockTenantId,
        name: 'Test',
        slug: 'test',
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const fields = [
        {
          id: 'field-1',
          collectionId: mockCollectionId,
          name: 'Email',
          slug: 'email',
          type: 'text' as const,
          isRequired: true,
          options: null,
          defaultValue: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const recordsData = [
        { email: 'test1@example.com' },
        { email: 'test2@example.com' },
      ];

      const createdRecords = recordsData.map((data, index) => ({
        id: `record-${index}`,
        tenantId: mockTenantId,
        collectionId: mockCollectionId,
        data,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: mockUserId,
        updatedBy: mockUserId,
      }));

      mockCollectionRepo.findById.mockResolvedValue(collection);
      mockFieldRepo.findByCollectionId.mockResolvedValue(fields);
      mockRecordRepo.create
        .mockResolvedValueOnce(createdRecords[0])
        .mockResolvedValueOnce(createdRecords[1]);

      const result = await service.bulkCreateRecords(
        mockCollectionId,
        mockTenantId,
        recordsData,
        mockUserId
      );

      expect(result).toHaveLength(2);
      expect(mockRecordRepo.create).toHaveBeenCalledTimes(2);
    });
  });
});
