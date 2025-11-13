import { db } from '../db';
import { tenants, tenantDomains, type TenantDomain } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { createLogger } from '../logger';
import type { TenantBranding } from '@shared/types/branding';

const logger = createLogger({ module: 'BrandingService' });

/**
 * Stage 17: BrandingService
 *
 * Service layer for managing tenant branding and custom domains.
 * Handles CRUD operations for tenant branding configuration and domain mapping.
 */
export class BrandingService {
  /**
   * Get tenant branding configuration
   */
  async getBrandingByTenantId(tenantId: string): Promise<TenantBranding | null> {
    try {
      const [tenant] = await db
        .select({ branding: tenants.branding })
        .from(tenants)
        .where(eq(tenants.id, tenantId));

      if (!tenant) {
        logger.warn({ tenantId }, 'Tenant not found');
        return null;
      }

      // Parse and return branding (default to null if not set)
      const branding = tenant.branding as TenantBranding | null;
      return branding || null;
    } catch (error) {
      logger.error({ error, tenantId }, 'Failed to get tenant branding');
      throw error;
    }
  }

  /**
   * Update tenant branding configuration (partial update)
   */
  async updateBranding(
    tenantId: string,
    partialBranding: Partial<TenantBranding>
  ): Promise<TenantBranding> {
    try {
      // Get current branding
      const currentBranding = await this.getBrandingByTenantId(tenantId);

      // Merge with new values
      const updatedBranding: TenantBranding = {
        ...currentBranding,
        ...partialBranding,
      };

      // Update tenant
      const [updatedTenant] = await db
        .update(tenants)
        .set({
          branding: updatedBranding,
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, tenantId))
        .returning({ branding: tenants.branding });

      if (!updatedTenant) {
        throw new Error('Tenant not found');
      }

      logger.info({ tenantId, branding: updatedBranding }, 'Tenant branding updated');
      return updatedTenant.branding as TenantBranding;
    } catch (error) {
      logger.error({ error, tenantId, partialBranding }, 'Failed to update tenant branding');
      throw error;
    }
  }

  /**
   * Get tenant branding by custom domain
   */
  async getBrandingForDomain(domain: string): Promise<{
    tenantId: string;
    branding: TenantBranding | null;
  } | null> {
    try {
      // Look up domain
      const [domainRecord] = await db
        .select({
          tenantId: tenantDomains.tenantId,
        })
        .from(tenantDomains)
        .where(eq(tenantDomains.domain, domain));

      if (!domainRecord) {
        logger.debug({ domain }, 'Domain not found');
        return null;
      }

      // Get branding for tenant
      const branding = await this.getBrandingByTenantId(domainRecord.tenantId);

      return {
        tenantId: domainRecord.tenantId,
        branding,
      };
    } catch (error) {
      logger.error({ error, domain }, 'Failed to get branding for domain');
      throw error;
    }
  }

  /**
   * Get all domains for a tenant
   */
  async getDomainsByTenantId(tenantId: string): Promise<TenantDomain[]> {
    try {
      const domains = await db
        .select()
        .from(tenantDomains)
        .where(eq(tenantDomains.tenantId, tenantId));

      logger.debug({ tenantId, count: domains.length }, 'Retrieved tenant domains');
      return domains;
    } catch (error) {
      logger.error({ error, tenantId }, 'Failed to get tenant domains');
      throw error;
    }
  }

  /**
   * Add a custom domain to a tenant
   */
  async addDomain(tenantId: string, domain: string): Promise<TenantDomain> {
    try {
      const [newDomain] = await db
        .insert(tenantDomains)
        .values({
          tenantId,
          domain: domain.toLowerCase(), // Normalize to lowercase
        })
        .returning();

      logger.info({ tenantId, domain }, 'Domain added to tenant');
      return newDomain;
    } catch (error: any) {
      // Check for unique constraint violation
      if (error?.code === '23505') {
        logger.warn({ tenantId, domain }, 'Domain already exists');
        throw new Error('Domain already exists');
      }

      logger.error({ error, tenantId, domain }, 'Failed to add domain to tenant');
      throw error;
    }
  }

  /**
   * Remove a custom domain from a tenant
   */
  async removeDomain(tenantId: string, domainId: string): Promise<boolean> {
    try {
      // Verify domain belongs to tenant before deleting
      const [domain] = await db
        .select()
        .from(tenantDomains)
        .where(eq(tenantDomains.id, domainId));

      if (!domain) {
        logger.warn({ domainId }, 'Domain not found');
        return false;
      }

      if (domain.tenantId !== tenantId) {
        logger.warn({ tenantId, domainId, actualTenantId: domain.tenantId }, 'Domain does not belong to tenant');
        throw new Error('Domain does not belong to this tenant');
      }

      // Delete domain
      await db
        .delete(tenantDomains)
        .where(eq(tenantDomains.id, domainId));

      logger.info({ tenantId, domainId }, 'Domain removed from tenant');
      return true;
    } catch (error) {
      logger.error({ error, tenantId, domainId }, 'Failed to remove domain from tenant');
      throw error;
    }
  }

  /**
   * Check if a domain is available (not already assigned to another tenant)
   */
  async isDomainAvailable(domain: string): Promise<boolean> {
    try {
      const [existing] = await db
        .select({ id: tenantDomains.id })
        .from(tenantDomains)
        .where(eq(tenantDomains.domain, domain.toLowerCase()));

      return !existing;
    } catch (error) {
      logger.error({ error, domain }, 'Failed to check domain availability');
      throw error;
    }
  }
}

export const brandingService = new BrandingService();
