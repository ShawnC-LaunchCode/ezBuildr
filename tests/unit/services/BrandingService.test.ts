import dns from 'dns/promises';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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
// RLS-5: every read/write in BrandingService now runs inside a tenant-scoped
// transaction opened by `rlsContext`, which reaches for a REAL pool and throws
// "Database not initialized" in a unit test. These tests exercise the branding
// business logic, not the transaction — that is proven against a real database
// under `RLS_RESTRICTED=true`. So the wrappers are replaced with pass-throughs
// that hand the callback the SAME mocked `db` the assertions below already
// drive, which is why none of them needed changing.
//
// Deliberately spreads `importOriginal` rather than returning a bare object:
// this module also exports `getCurrentTenantId`, `setCurrentTenantId` and
// friends, and a partial mock would silently make them undefined.
vi.mock('../../../server/utils/rlsContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../server/utils/rlsContext')>();
  const { db } = await import('../../../server/db');
  return {
    ...actual,
    withCurrentTenant: <T,>(fn: (tx: unknown) => Promise<T>) => fn(db),
    withTenant: <T,>(_tenantId: string, fn: (tx: unknown) => Promise<T>) => fn(db),
    withVerifiedIdentifier: <T,>(_guc: string, _value: string, fn: (tx: unknown) => Promise<T>) => fn(db),
  };
});

vi.mock('../../../server/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock DNS resolution for domain verification
vi.mock('dns/promises', () => ({
  default: { resolveTxt: vi.fn() },
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

      vi.mocked(db.select).mockReturnValue(mockSelect as unknown as ReturnType<typeof db.select>);

      const result = await brandingService.getBrandingByTenantId('test-tenant-id');

      expect(result).toEqual(mockBranding);
      expect(db.select).toHaveBeenCalled();
    });

    it('should return null when tenant does not exist', async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };

      vi.mocked(db.select).mockReturnValue(mockSelect as unknown as ReturnType<typeof db.select>);

      const result = await brandingService.getBrandingByTenantId('nonexistent-id');

      expect(result).toBeNull();
    });

    it('should return null when branding is not set', async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ branding: null }]),
      };

      vi.mocked(db.select).mockReturnValue(mockSelect as unknown as ReturnType<typeof db.select>);

      const result = await brandingService.getBrandingByTenantId('test-tenant-id');

      expect(result).toBeNull();
    });

    it('should throw error on database failure', async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockRejectedValue(new Error('Database error')),
      };

      vi.mocked(db.select).mockReturnValue(mockSelect as unknown as ReturnType<typeof db.select>);

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
      vi.mocked(db.select).mockReturnValue(mockSelect as unknown as ReturnType<typeof db.select>);

      // Mock update
      const mockUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ branding: expectedMerged }]),
      };
      vi.mocked(db.update).mockReturnValue(mockUpdate as unknown as ReturnType<typeof db.update>);

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
      vi.mocked(db.select).mockReturnValue(mockSelect as unknown as ReturnType<typeof db.select>);

      // Mock update returning nothing
      const mockUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
      };
      vi.mocked(db.update).mockReturnValue(mockUpdate as unknown as ReturnType<typeof db.update>);

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
      vi.mocked(db.select).mockReturnValue(mockSelect as unknown as ReturnType<typeof db.select>);

      // Mock update
      const mockUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ branding: partialUpdate }]),
      };
      vi.mocked(db.update).mockReturnValue(mockUpdate as unknown as ReturnType<typeof db.update>);

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

      vi.mocked(db.select)
        .mockReturnValueOnce(mockDomainSelect as unknown as ReturnType<typeof db.select>)
        .mockReturnValueOnce(mockBrandingSelect as unknown as ReturnType<typeof db.select>);

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

      vi.mocked(db.select).mockReturnValue(mockSelect as unknown as ReturnType<typeof db.select>);

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

      vi.mocked(db.select)
        .mockReturnValueOnce(mockDomainSelect as unknown as ReturnType<typeof db.select>)
        .mockReturnValueOnce(mockBrandingSelect as unknown as ReturnType<typeof db.select>);

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

      vi.mocked(db.select).mockReturnValue(mockSelect as unknown as ReturnType<typeof db.select>);

      const result = await brandingService.getDomainsByTenantId('test-tenant-id');

      expect(result).toEqual(mockDomains);
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no domains exist', async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };

      vi.mocked(db.select).mockReturnValue(mockSelect as unknown as ReturnType<typeof db.select>);

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

      vi.mocked(db.insert).mockReturnValue(mockInsert as unknown as ReturnType<typeof db.insert>);

      const result = await brandingService.addDomain('test-tenant-id', 'ACME.ezBuildr.com');

      expect(result).toEqual(mockDomain);
      expect(mockInsert.values).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'test-tenant-id',
          domain: 'acme.ezbuildr.com', // Should be normalized to lowercase
          verified: false,
          verificationToken: expect.any(String) as unknown,
        })
      );
    });

    it('should throw error when domain already exists', async () => {
      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockRejectedValue(Object.assign(new Error('Unique constraint'), { code: '23505' })), // Unique constraint violation
      };

      vi.mocked(db.insert).mockReturnValue(mockInsert as unknown as ReturnType<typeof db.insert>);

      await expect(
        brandingService.addDomain('test-tenant-id', 'existing.com')
      ).rejects.toThrow('Domain already exists');
    });

    it('should propagate other database errors', async () => {
      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockRejectedValue(new Error('Connection timeout')),
      };

      vi.mocked(db.insert).mockReturnValue(mockInsert as unknown as ReturnType<typeof db.insert>);

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

      vi.mocked(db.select).mockReturnValue(mockSelect as unknown as ReturnType<typeof db.select>);
      vi.mocked(db.delete).mockReturnValue(mockDelete as unknown as ReturnType<typeof db.delete>);

      const result = await brandingService.removeDomain('test-tenant-id', 'domain-1');

      expect(result).toBe(true);
      expect(db.delete).toHaveBeenCalled();
    });

    it('should return false when domain not found', async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };

      vi.mocked(db.select).mockReturnValue(mockSelect as unknown as ReturnType<typeof db.select>);

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

      vi.mocked(db.select).mockReturnValue(mockSelect as unknown as ReturnType<typeof db.select>);

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

      vi.mocked(db.select).mockReturnValue(mockSelect as unknown as ReturnType<typeof db.select>);

      const result = await brandingService.isDomainAvailable('new-domain.com');

      expect(result).toBe(true);
    });

    it('should return false when domain already exists', async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ id: 'domain-1' }]),
      };

      vi.mocked(db.select).mockReturnValue(mockSelect as unknown as ReturnType<typeof db.select>);

      const result = await brandingService.isDomainAvailable('existing.com');

      expect(result).toBe(false);
    });

    it('should normalize domain to lowercase before checking', async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };

      vi.mocked(db.select).mockReturnValue(mockSelect as unknown as ReturnType<typeof db.select>);

      await brandingService.isDomainAvailable('UPPERCASE.COM');

      expect(mockSelect.where).toHaveBeenCalled();
      // Domain should be normalized to lowercase in the query
    });
  });

  describe('buildDomainChallenge', () => {
    it('builds a dedicated-subdomain TXT challenge with a prefixed value', () => {
      const challenge = brandingService.buildDomainChallenge('ACME.com', 'tok123');
      expect(challenge).toEqual({
        host: '_ezbuildr-challenge.acme.com',
        value: 'ezbuildr-verification=tok123',
      });
    });
  });

  describe('verifyDomain', () => {
    const domainRow = {
      id: 'domain-1',
      tenantId: 'test-tenant-id',
      domain: 'acme.com',
      verified: false,
      verificationToken: 'tok123',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    function mockDomainLookup(row: unknown): void {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(row === undefined ? [] : [row]),
      };
      vi.mocked(db.select).mockReturnValue(mockSelect as unknown as ReturnType<typeof db.select>);
    }

    it('throws when the domain does not exist', async () => {
      mockDomainLookup(undefined);
      await expect(brandingService.verifyDomain('test-tenant-id', 'missing')).rejects.toThrow(
        'Domain not found'
      );
    });

    it('throws when the domain belongs to another tenant', async () => {
      mockDomainLookup({ ...domainRow, tenantId: 'other-tenant' });
      await expect(brandingService.verifyDomain('test-tenant-id', 'domain-1')).rejects.toThrow(
        'Domain does not belong to this tenant'
      );
    });

    it('short-circuits to verified without a DNS lookup when already verified', async () => {
      mockDomainLookup({ ...domainRow, verified: true });
      const result = await brandingService.verifyDomain('test-tenant-id', 'domain-1');
      expect(result).toEqual({ verified: true });
      expect(dns.resolveTxt).not.toHaveBeenCalled();
    });

    it('marks the domain verified when the TXT record matches', async () => {
      mockDomainLookup(domainRow);
      vi.mocked(dns.resolveTxt).mockResolvedValue([['ezbuildr-verification=tok123']]);
      const mockUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };
      vi.mocked(db.update).mockReturnValue(mockUpdate as unknown as ReturnType<typeof db.update>);

      const result = await brandingService.verifyDomain('test-tenant-id', 'domain-1');

      expect(result).toEqual({ verified: true });
      expect(dns.resolveTxt).toHaveBeenCalledWith('_ezbuildr-challenge.acme.com');
      expect(mockUpdate.set).toHaveBeenCalledWith(expect.objectContaining({ verified: true }));
    });

    it('fails (without marking verified) when the TXT record is absent', async () => {
      mockDomainLookup(domainRow);
      vi.mocked(dns.resolveTxt).mockRejectedValue(new Error('ENOTFOUND'));

      const result = await brandingService.verifyDomain('test-tenant-id', 'domain-1');

      expect(result.verified).toBe(false);
      expect(result.reason).toContain('_ezbuildr-challenge.acme.com');
      expect(db.update).not.toHaveBeenCalled();
    });

    it('fails when the TXT record exists but does not match the token', async () => {
      mockDomainLookup(domainRow);
      vi.mocked(dns.resolveTxt).mockResolvedValue([['ezbuildr-verification=WRONG']]);

      const result = await brandingService.verifyDomain('test-tenant-id', 'domain-1');

      expect(result.verified).toBe(false);
      expect(db.update).not.toHaveBeenCalled();
    });
  });
});