import { describe, it, expect, beforeEach, vi } from 'vitest';

import { CollectionFieldService } from '../../../server/services/CollectionFieldService';

describe('CollectionFieldService', () => {
  let service: CollectionFieldService;
  let mockFieldRepo: any;
  let mockCollectionRepo: any;

  const mockCollectionId = '550e8400-e29b-41d4-a716-446655440000';
  const mockFieldId = '660e8400-e29b-41d4-a716-446655440001';

  beforeEach(() => {
    vi.clearAllMocks();

    mockFieldRepo = {
      findById: vi.fn(),
      findByCollectionId: vi.fn(),
      findByCollectionAndSlug: vi.fn(),
      slugExists: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    mockCollectionRepo = {
      findById: vi.fn(),
    };

    service = new CollectionFieldService(mockFieldRepo, mockCollectionRepo);
  });

  describe('createField', () => {
    it('should create text field with generated slug', async () => {
      const insertData = {
        collectionId: mockCollectionId,
        name: 'Email Address',
        type: 'text' as const,
        slug: 'email_address',
        isRequired: true,
      };

      const createdField = {
        id: mockFieldId,
        ...insertData,
        slug: 'email_address',
        options: null,
        defaultValue: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCollectionRepo.findById.mockResolvedValue({ id: mockCollectionId });
      mockFieldRepo.slugExists.mockResolvedValue(false);
      mockFieldRepo.create.mockResolvedValue(createdField);

      const result = await service.createField(insertData);

      expect(result).toEqual(createdField);
      expect(result.slug).toBe('email_address');
    });

    it('should create select field with options', async () => {
      const insertData = {
        collectionId: mockCollectionId,
        name: 'Status',
        type: 'select' as const,
        slug: 'status',
        isRequired: false,
        options: ['Draft', 'Published', 'Archived'],
      };

      const createdField = {
        id: mockFieldId,
        ...insertData,
        slug: 'status',
        defaultValue: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCollectionRepo.findById.mockResolvedValue({ id: mockCollectionId });
      mockFieldRepo.slugExists.mockResolvedValue(false);
      mockFieldRepo.create.mockResolvedValue(createdField);

      const result = await service.createField(insertData);

      expect(result.options).toEqual(['Draft', 'Published', 'Archived']);
    });

    it('should throw error if select field missing options', async () => {
      const insertData = {
        collectionId: mockCollectionId,
        name: 'Status',
        type: 'select' as const,
        slug: 'status',
        isRequired: false,
      };

      mockCollectionRepo.findById.mockResolvedValue({ id: mockCollectionId });

      await expect(service.createField(insertData)).rejects.toThrow(
        "Field type 'select' requires options array"
      );
    });

    it('should throw error if options is not an array', async () => {
      const insertData = {
        collectionId: mockCollectionId,
        name: 'Status',
        type: 'select' as const,
        slug: 'status',
        isRequired: false,
        options: 'invalid' as any,
      };

      mockCollectionRepo.findById.mockResolvedValue({ id: mockCollectionId });

      await expect(service.createField(insertData)).rejects.toThrow(
        'Options must be an array'
      );
    });

    it('should throw error if options array is empty', async () => {
      const insertData = {
        collectionId: mockCollectionId,
        name: 'Status',
        type: 'select' as const,
        slug: 'status',
        isRequired: false,
        options: [],
      };

      mockCollectionRepo.findById.mockResolvedValue({ id: mockCollectionId });

      await expect(service.createField(insertData)).rejects.toThrow(
        'Options array cannot be empty for select/multi-select fields'
      );
    });

    it('should create field with default value', async () => {
      const insertData = {
        collectionId: mockCollectionId,
        name: 'Active',
        type: 'boolean' as const,
        slug: 'active',
        isRequired: false,
        defaultValue: true,
      };

      const createdField = {
        id: mockFieldId,
        ...insertData,
        slug: 'active',
        options: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCollectionRepo.findById.mockResolvedValue({ id: mockCollectionId });
      mockFieldRepo.slugExists.mockResolvedValue(false);
      mockFieldRepo.create.mockResolvedValue(createdField);

      const result = await service.createField(insertData);

      expect(result.defaultValue).toBe(true);
    });

    it('should throw error if default value type mismatch', async () => {
      const insertData = {
        collectionId: mockCollectionId,
        name: 'Age',
        type: 'number' as const,
        slug: 'age',
        isRequired: false,
        defaultValue: 'not a number' as any,
      };

      mockCollectionRepo.findById.mockResolvedValue({ id: mockCollectionId });

      await expect(service.createField(insertData)).rejects.toThrow(
        "Default value for 'number' field must be a number"
      );
    });

    it('should ensure unique slug by appending counter', async () => {
      const insertData = {
        collectionId: mockCollectionId,
        name: 'Email',
        type: 'text' as const,
        slug: 'email',
        isRequired: true,
      };

      const createdField = {
        id: mockFieldId,
        ...insertData,
        slug: 'email_1',
        options: null,
        defaultValue: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCollectionRepo.findById.mockResolvedValue({ id: mockCollectionId });
      mockFieldRepo.slugExists
        .mockResolvedValueOnce(true) // 'email' exists
        .mockResolvedValueOnce(false); // 'email_1' available

      mockFieldRepo.create.mockResolvedValue(createdField);

      const result = await service.createField(insertData);

      expect(result.slug).toBe('email_1');
      expect(mockFieldRepo.slugExists).toHaveBeenCalledTimes(2);
    });

    it('should throw error if collection does not exist', async () => {
      const insertData = {
        collectionId: mockCollectionId,
        name: 'Email',
        type: 'text' as const,
        slug: 'email',
        isRequired: true,
      };

      mockCollectionRepo.findById.mockResolvedValue(undefined);

      await expect(service.createField(insertData)).rejects.toThrow(
        'Collection not found'
      );
    });
  });

  describe('verifyFieldOwnership', () => {
    it('should return field if it belongs to collection', async () => {
      const field = {
        id: mockFieldId,
        collectionId: mockCollectionId,
        name: 'Email',
        slug: 'email',
        type: 'text' as const,
        isRequired: true,
        options: null,
        defaultValue: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockFieldRepo.findById.mockResolvedValue(field);

      const result = await service.verifyFieldOwnership(mockFieldId, mockCollectionId);

      expect(result).toEqual(field);
    });

    it('should throw error if field not found', async () => {
      mockFieldRepo.findById.mockResolvedValue(undefined);

      await expect(
        service.verifyFieldOwnership(mockFieldId, mockCollectionId)
      ).rejects.toThrow('Field not found');
    });

    it('should throw error if field belongs to different collection', async () => {
      const field = {
        id: mockFieldId,
        collectionId: 'different-collection-id',
        name: 'Email',
        slug: 'email',
        type: 'text' as const,
        isRequired: true,
        options: null,
        defaultValue: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockFieldRepo.findById.mockResolvedValue(field);

      await expect(
        service.verifyFieldOwnership(mockFieldId, mockCollectionId)
      ).rejects.toThrow('Access denied - field belongs to different collection');
    });
  });

  describe('updateField', () => {
    it('should update field and regenerate slug if name changed', async () => {
      const field = {
        id: mockFieldId,
        collectionId: mockCollectionId,
        name: 'Old Name',
        slug: 'old_name',
        type: 'text' as const,
        isRequired: true,
        options: null,
        defaultValue: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedField = {
        ...field,
        name: 'New Name',
        slug: 'new_name',
      };

      mockFieldRepo.findById.mockResolvedValue(field);
      mockFieldRepo.slugExists.mockResolvedValue(false);
      mockFieldRepo.update.mockResolvedValue(updatedField);

      const result = await service.updateField(
        mockFieldId,
        mockCollectionId,
        { name: 'New Name' }
      );

      expect(result).toEqual(updatedField);
    });

    it('should verify field ownership before updating', async () => {
      const field = {
        id: mockFieldId,
        collectionId: 'different-collection',
        name: 'Email',
        slug: 'email',
        type: 'text' as const,
        isRequired: true,
        options: null,
        defaultValue: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockFieldRepo.findById.mockResolvedValue(field);

      await expect(
        service.updateField(mockFieldId, mockCollectionId, { name: 'New Name' })
      ).rejects.toThrow('Access denied - field belongs to different collection');
    });
  });

  describe('deleteField', () => {
    it('should delete field after verifying ownership', async () => {
      const field = {
        id: mockFieldId,
        collectionId: mockCollectionId,
        name: 'Email',
        slug: 'email',
        type: 'text' as const,
        isRequired: true,
        options: null,
        defaultValue: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockFieldRepo.findById.mockResolvedValue(field);
      mockFieldRepo.delete.mockResolvedValue(undefined);

      await service.deleteField(mockFieldId, mockCollectionId);

      expect(mockFieldRepo.delete).toHaveBeenCalledWith(mockFieldId, undefined);
    });
  });

  describe('bulkCreateFields', () => {
    it('should create multiple fields', async () => {
      const fieldsData = [
        { name: 'Email', slug: 'email', collectionId: mockCollectionId, type: 'text' as const, isRequired: true },
        { name: 'Age', slug: 'age', collectionId: mockCollectionId, type: 'number' as const, isRequired: false },
      ];

      const createdFields = fieldsData.map((data, index) => ({
        id: `field-${index}`,
        ...data,
        slug: data.name.toLowerCase(),
        options: null,
        defaultValue: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      mockCollectionRepo.findById.mockResolvedValue({ id: mockCollectionId });
      mockFieldRepo.slugExists.mockResolvedValue(false);
      mockFieldRepo.create
        .mockResolvedValueOnce(createdFields[0])
        .mockResolvedValueOnce(createdFields[1]);

      const result = await service.bulkCreateFields(mockCollectionId, fieldsData);

      expect(result).toHaveLength(2);
      expect(mockFieldRepo.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('slug generation', () => {
    it('should use underscores instead of dashes for field slugs', async () => {
      const insertData = {
        collectionId: mockCollectionId,
        name: 'Email Address',
        type: 'text' as const,
        slug: 'email_address',
        isRequired: true,
      };

      const createdField = {
        id: mockFieldId,
        ...insertData,
        slug: 'email_address',
        options: null,
        defaultValue: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCollectionRepo.findById.mockResolvedValue({ id: mockCollectionId });
      mockFieldRepo.slugExists.mockResolvedValue(false);
      mockFieldRepo.create.mockResolvedValue(createdField);

      const result = await service.createField(insertData);

      expect(result.slug).toBe('email_address');
    });
  });

  describe('default value validation', () => {
    const testCases = [
      { type: 'text' as const, validValue: 'test', invalidValue: 123 },
      { type: 'number' as const, validValue: 42, invalidValue: 'not a number' },
      { type: 'boolean' as const, validValue: true, invalidValue: 'yes' },
      { type: 'date' as const, validValue: '2025-01-01', invalidValue: 'not a date' },
      { type: 'select' as const, validValue: 'option1', invalidValue: 123 },
      { type: 'multi_select' as const, validValue: ['option1'], invalidValue: 'not an array' },
    ];

    testCases.forEach(({ type, validValue, invalidValue }) => {
      it(`should validate ${type} default value`, async () => {
        const validData = {
          collectionId: mockCollectionId,
          name: 'Test Field',
          slug: 'test_field',
          type,
          isRequired: false,
          defaultValue: validValue,
          ...(type === 'select' || type === 'multi_select' ? { options: ['option1', 'option2'] } : {}),
        };

        mockCollectionRepo.findById.mockResolvedValue({ id: mockCollectionId });
        mockFieldRepo.slugExists.mockResolvedValue(false);
        mockFieldRepo.create.mockResolvedValue({ ...validData, id: mockFieldId } as any);

        await expect(service.createField(validData)).resolves.toBeDefined();

        // Test invalid value
        const invalidData = {
          ...validData,
          defaultValue: invalidValue,
        };

        await expect(service.createField(invalidData)).rejects.toThrow();
      });
    });
  });
});
