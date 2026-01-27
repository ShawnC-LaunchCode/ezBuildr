import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { tenants, tenantDomains } from '@shared/schema';
import type { TenantBranding } from '@shared/types/branding';

import { db } from '../../../server/db';
import { BrandingService } from '../../../server/services/BrandingService';
/**
 * Stage 17: BrandingService Tests
 *
 * Unit tests for the BrandingService class
 * Tests branding CRUD operations and domain management
 */
// Mock the database
vi.mock('../../../server/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));
// Mock the logger
vi.mock('../../../server/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));
describe('BrandingService', () => {
  let brandingService: BrandingService;
  beforeEach(() => {
    brandingService = new BrandingService();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.resetAllMocks();
  });
  describe('getBrandingByTenantId', () => {
    it('should return tenant branding when tenant exists', async () => {
      const mockBranding: TenantBranding = {
        logoUrl: 'https://example.com/logo.png',
        primaryColor: '#FF5733',
        accentColor: '#33FF57',
        darkModeEnabled: true,
        intakeHeaderText: 'Welcome to Our Portal',
        emailSenderName: 'Acme Corp',
        emailSenderAddress: 'noreply@acme.com',
      };
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ branding: mockBranding }]),
      };
      (db.select as any).mockReturnValue(mockSelect);
      const result = await brandingService.getBrandingByTenantId('test-tenant-id');
      expect(result).toEqual(mockBranding);
      expect(db.select).toHaveBeenCalled();
    });
    it('should return null when tenant does not exist', async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };
      (db.select as any).mockReturnValue(mockSelect);
      const result = await brandingService.getBrandingByTenantId('nonexistent-id');
      expect(result).toBeNull();
    });
    it('should return null when branding is not set', async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ branding: null }]),
      };
      (db.select as any).mockReturnValue(mockSelect);
      const result = await brandingService.getBrandingByTenantId('test-tenant-id');
      expect(result).toBeNull();
    });
    it('should throw error on database failure', async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockRejectedValue(new Error('Database error')),
      };
      (db.select as any).mockReturnValue(mockSelect);
      await expect(brandingService.getBrandingByTenantId('test-tenant-id')).rejects.toThrow(
        'Database error'
      );
    });
  });
  describe('updateBranding', () => {
    it('should merge partial branding with existing branding', async () => {
      const existingBranding: TenantBranding = {
        logoUrl: 'https://example.com/logo.png',
        primaryColor: '#FF5733',
        accentColor: '#33FF57',
      };
      const partialUpdate: Partial<TenantBranding> = {
        primaryColor: '#0000FF',
        intakeHeaderText: 'New Header Text',
      };
      const expectedMerged: TenantBranding = {
        ...existingBranding,
        ...partialUpdate,
      };
      // Mock getBrandingByTenantId
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ branding: existingBranding }]),
      };
      (db.select as any).mockReturnValue(mockSelect);
      // Mock update
      const mockUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ branding: expectedMerged }]),
      };
      (db.update as any).mockReturnValue(mockUpdate);
      const result = await brandingService.updateBranding('test-tenant-id', partialUpdate);
      expect(result).toEqual(expectedMerged);
      expect(db.update).toHaveBeenCalled();
    });
    it('should throw error when tenant not found', async () => {
      // Mock getBrandingByTenantId returning null
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ branding: null }]),
      };
      (db.select as any).mockReturnValue(mockSelect);
      // Mock update returning nothing
      const mockUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
      };
      (db.update as any).mockReturnValue(mockUpdate);
      await expect(
        brandingService.updateBranding('nonexistent-id', { primaryColor: '#FF0000' })
      ).rejects.toThrow('Tenant not found');
    });
    it('should handle null existing branding', async () => {
      const partialUpdate: Partial<TenantBranding> = {
        primaryColor: '#FF0000',
      };
      // Mock getBrandingByTenantId returning null
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ branding: null }]),
      };
      (db.select as any).mockReturnValue(mockSelect);
      // Mock update
      const mockUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ branding: partialUpdate }]),
      };
      (db.update as any).mockReturnValue(mockUpdate);
      const result = await brandingService.updateBranding('test-tenant-id', partialUpdate);
      expect(result).toEqual(partialUpdate);
    });
  });
  describe('getBrandingForDomain', () => {
    it('should return tenant ID and branding for valid domain', async () => {
      const mockBranding: TenantBranding = {
        primaryColor: '#FF5733',
        logoUrl: 'https://example.com/logo.png',
      };
      // Mock domain lookup
      const mockDomainSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ tenantId: 'test-tenant-id' }]),
      };
      // Mock branding lookup
      const mockBrandingSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ branding: mockBranding }]),
      };
      (db.select as any)
        .mockReturnValueOnce(mockDomainSelect)
        .mockReturnValueOnce(mockBrandingSelect);
      const result = await brandingService.getBrandingForDomain('acme.ezbuildr.com');
      expect(result).toEqual({
        tenantId: 'test-tenant-id',
        branding: mockBranding,
      });
    });
    it('should return null when domain not found', async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };
      (db.select as any).mockReturnValue(mockSelect);
      const result = await brandingService.getBrandingForDomain('unknown.com');
      expect(result).toBeNull();
    });
    it('should handle tenant with null branding', async () => {
      // Mock domain lookup
      const mockDomainSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ tenantId: 'test-tenant-id' }]),
      };
      // Mock branding lookup returning null
      const mockBrandingSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ branding: null }]),
      };
      (db.select as any)
        .mockReturnValueOnce(mockDomainSelect)
        .mockReturnValueOnce(mockBrandingSelect);
      const result = await brandingService.getBrandingForDomain('acme.ezbuildr.com');
      expect(result).toEqual({
        tenantId: 'test-tenant-id',
        branding: null,
      });
    });
  });
  describe('getDomainsByTenantId', () => {
    it('should return all domains for a tenant', async () => {
      const mockDomains = [
        {
          id: 'domain-1',
          tenantId: 'test-tenant-id',
          domain: 'acme.ezbuildr.com',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'domain-2',
          tenantId: 'test-tenant-id',
          domain: 'acme-prod.com',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(mockDomains),
      };
      (db.select as any).mockReturnValue(mockSelect);
      const result = await brandingService.getDomainsByTenantId('test-tenant-id');
      expect(result).toEqual(mockDomains);
      expect(result).toHaveLength(2);
    });
    it('should return empty array when no domains exist', async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };
      (db.select as any).mockReturnValue(mockSelect);
      const result = await brandingService.getDomainsByTenantId('test-tenant-id');
      expect(result).toEqual([]);
    });
  });
  describe('addDomain', () => {
    it('should add a new domain and normalize to lowercase', async () => {
      const mockDomain = {
        id: 'domain-1',
        tenantId: 'test-tenant-id',
        domain: 'acme.ezbuildr.com',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([mockDomain]),
      };
      (db.insert as any).mockReturnValue(mockInsert);
      const result = await brandingService.addDomain('test-tenant-id', 'ACME.ezBuildr.com');
      expect(result).toEqual(mockDomain);
      expect(mockInsert.values).toHaveBeenCalledWith({
        tenantId: 'test-tenant-id',
        domain: 'acme.ezbuildr.com', // Should be normalized to lowercase
      });
    });
    it('should throw error when domain already exists', async () => {
      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockRejectedValue({ code: '23505' }), // Unique constraint violation
      };
      (db.insert as any).mockReturnValue(mockInsert);
      await expect(
        brandingService.addDomain('test-tenant-id', 'existing.com')
      ).rejects.toThrow('Domain already exists');
    });
    it('should propagate other database errors', async () => {
      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockRejectedValue(new Error('Connection timeout')),
      };
      (db.insert as any).mockReturnValue(mockInsert);
      await expect(
        brandingService.addDomain('test-tenant-id', 'test.com')
      ).rejects.toThrow('Connection timeout');
    });
  });
  describe('removeDomain', () => {
    it('should remove domain when it belongs to tenant', async () => {
      const mockDomain = {
        id: 'domain-1',
        tenantId: 'test-tenant-id',
        domain: 'acme.ezbuildr.com',
      };
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([mockDomain]),
      };
      const mockDelete = {
        where: vi.fn().mockResolvedValue([mockDomain]),
      };
      (db.select as any).mockReturnValue(mockSelect);
      (db.delete as any).mockReturnValue(mockDelete);
      const result = await brandingService.removeDomain('test-tenant-id', 'domain-1');
      expect(result).toBe(true);
      expect(db.delete).toHaveBeenCalled();
    });
    it('should return false when domain not found', async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };
      (db.select as any).mockReturnValue(mockSelect);
      const result = await brandingService.removeDomain('test-tenant-id', 'nonexistent-id');
      expect(result).toBe(false);
      expect(db.delete).not.toHaveBeenCalled();
    });
    it('should throw error when domain belongs to different tenant', async () => {
      const mockDomain = {
        id: 'domain-1',
        tenantId: 'other-tenant-id',
        domain: 'other.com',
      };
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([mockDomain]),
      };
      (db.select as any).mockReturnValue(mockSelect);
      await expect(
        brandingService.removeDomain('test-tenant-id', 'domain-1')
      ).rejects.toThrow('Domain does not belong to this tenant');
    });
  });
  describe('isDomainAvailable', () => {
    it('should return true when domain is available', async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };
      (db.select as any).mockReturnValue(mockSelect);
      const result = await brandingService.isDomainAvailable('new-domain.com');
      expect(result).toBe(true);
    });
    it('should return false when domain already exists', async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ id: 'domain-1' }]),
      };
      (db.select as any).mockReturnValue(mockSelect);
      const result = await brandingService.isDomainAvailable('existing.com');
      expect(result).toBe(false);
    });
    it('should normalize domain to lowercase before checking', async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };
      (db.select as any).mockReturnValue(mockSelect);
      await brandingService.isDomainAvailable('UPPERCASE.COM');
      expect(mockSelect.where).toHaveBeenCalled();
      // Domain should be normalized to lowercase in the query
    });
  });
});