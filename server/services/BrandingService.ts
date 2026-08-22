import crypto from 'crypto';
import dns from 'dns/promises';

import { and, eq } from 'drizzle-orm';

import { tenants, tenantDomains } from '@shared/schema';
import { resolveBranding } from '@shared/types/branding';
import type {
  ResolvedBranding,
  TenantBranding,
  WorkflowBrandingSettings,
} from '@shared/types/branding';

import { db } from '../db';
import { createLogger } from '../logger';
import { type DbTransaction } from '../repositories';
import { withCurrentTenant, withVerifiedIdentifier } from '../utils/rlsContext';

import { workflowTenantResolver } from './WorkflowTenantResolver';

type TenantDomain = typeof tenantDomains.$inferSelect;

const logger = createLogger({ module: 'BrandingService' });

/**
 * Stage 17: BrandingService
 *
 * Service layer for managing tenant branding and custom domains.
 * Handles CRUD operations for tenant branding configuration and domain mapping.
 */
export class BrandingService {
  /**
   * Run `fn` inside a tenant-scoped transaction opened at this service
   * boundary (RLS-4 precondition 4). If the caller already handed us a
   * transaction, reuse it — never open a nested one, which would deadlock
   * the size-1 test pool while the caller's own transaction still holds the
   * only connection (measured via `VersionService.serializeWorkflowInTx`,
   * see the comment at `WorkflowService.getWorkflowWithDetails`'s branding
   * call site). Otherwise open exactly one via `withCurrentTenant`, which
   * reads the tenant already populated in the request's async context
   * (`hybridAuth`, or `runTokenAuth`/`RunAuthResolver` for the anonymous
   * participant path) and sets the transaction-local `app.current_tenant_id`
   * GUC for the `workflows` read inside `fn`.
   */
  private async withTx<T>(
    tx: DbTransaction | undefined,
    fn: (tx: DbTransaction) => Promise<T>
  ): Promise<T> {
    if (tx) {
      return fn(tx);
    }
    return withCurrentTenant(fn);
  }

  /**
   * Get tenant branding configuration
   */
  async getBrandingByTenantId(tenantId: string, tx?: DbTransaction): Promise<TenantBranding | null> {
    try {
      const [tenant] = await (tx ?? db)
        .select({ branding: tenants.branding })
        .from(tenants)
        .where(eq(tenants.id, tenantId));

      if (tenant === undefined) {
        logger.warn({ tenantId }, 'Tenant not found');
        return null;
      }

      // Parse and return branding (default to null if not set)
      const branding = tenant.branding as TenantBranding | null;
      return branding ?? null;
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

      if (updatedTenant === undefined) {
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
   * Resolve the branding a participant should see for one workflow (GH-158).
   *
   * This is the only entry point participant surfaces should use. It resolves
   * the workflow's tenant via the shared `WorkflowTenantResolver` and merges
   * tenant branding under the workflow's own branding settings.
   *
   * Never throws: this runs on the anonymous participant read path, so a
   * branding lookup failure degrades to the product default rather than
   * breaking the run.
   *
   * `tx` (RLS-4 precondition 4): pass the caller's own open transaction when
   * one exists (e.g. `WorkflowService.getWorkflowWithDetails` nested inside
   * `VersionService.serializeWorkflowInTx`) so this reuses it instead of
   * opening a second one. Leave it undefined for the ordinary top-level
   * case — `withTx` then opens its own short transaction against the
   * ambient tenant, which is what makes the `workflows` read (RLS-covered,
   * ownership-derived) succeed under FORCE instead of silently returning
   * zero rows and falling back to default branding.
   */
  async resolveForWorkflow(
    workflowId: string,
    workflowSettings: unknown,
    tx?: DbTransaction
  ): Promise<ResolvedBranding> {
    const workflowBranding = this.parseWorkflowBranding(workflowSettings);

    try {
      return await this.withTx(tx, async (scopedTx) => {
        const tenantId = await this.resolveTenantIdForWorkflow(workflowId, scopedTx);
        const tenantBranding = tenantId !== null ? await this.getBrandingByTenantId(tenantId, scopedTx) : null;
        return resolveBranding(tenantBranding, workflowBranding);
      });
    } catch (error) {
      logger.error({ error, workflowId }, 'Failed to resolve workflow branding; using workflow-only branding');
      return resolveBranding(null, workflowBranding);
    }
  }

  /**
   * Read the branding keys out of the `workflows.settings` blob.
   *
   * Rows written before GH-158 added write-time validation may hold anything,
   * so this parses leniently and lets `resolveBranding()` drop what it cannot
   * use.
   */
  private parseWorkflowBranding(settings: unknown): WorkflowBrandingSettings | null {
    if (typeof settings !== 'object' || settings === null) {
      return null;
    }
    return settings as WorkflowBrandingSettings;
  }

  /**
   * Resolve a workflow's tenant: its project's tenant first, falling back to
   * the creator's tenant for unfiled workflows.
   */
  /**
   * Resolve the tenant whose branding applies to this workflow.
   *
   * Delegates to {@link WorkflowTenantResolver} — this used to be a private
   * copy that resolved only `project -> creator` and ignored
   * `ownerType`/`ownerUuid`, so a transferred workflow rendered the original
   * creator's branding rather than the new owner's.
   */
  private async resolveTenantIdForWorkflow(workflowId: string, tx?: DbTransaction): Promise<string | null> {
    return workflowTenantResolver.resolveForWorkflowId(workflowId, tx);
  }

  /**
   * Get tenant branding by custom domain
   */
  async getBrandingForDomain(domain: string): Promise<{
    tenantId: string;
    branding: TenantBranding | null;
  } | null> {
    try {
      // Look up domain — only *verified* domains resolve branding, so a tenant
      // cannot influence branding for a domain it has not proven ownership of
      // (SEC-026). Unverified/squatted domains behave as if unregistered.
      // TENANT BOOTSTRAP: an unauthenticated visitor arrived on this hostname
      // and resolving its tenant is the whole point of the call, so there is no
      // ambient tenant to scope with. Migration 0035 adds a USING-only clause
      // matching `domain` — and repeating the `verified` requirement, so the
      // SEC-026 rule below is now enforced by the database as well as here.
      const [domainRecord] = await withVerifiedIdentifier(
        'app.current_branding_domain',
        domain.toLowerCase(),
        (tx) => tx
          .select({
            tenantId: tenantDomains.tenantId,
          })
          .from(tenantDomains)
          .where(and(eq(tenantDomains.domain, domain.toLowerCase()), eq(tenantDomains.verified, true)))
      );

      if (domainRecord === undefined) {
        logger.debug({ domain }, 'Domain not found or not verified');
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
      const domains = await withCurrentTenant((tx) => tx
        .select()
        .from(tenantDomains)
        .where(eq(tenantDomains.tenantId, tenantId)));

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
      const verificationToken = crypto.randomBytes(16).toString('hex');

      const [newDomain] = await withCurrentTenant((tx) => tx
        .insert(tenantDomains)
        .values({
          tenantId,
          domain: domain.toLowerCase(), // Normalize to lowercase
          verified: false,
          verificationToken,
        })
        .returning());

      // `.returning()` is typed as an array, so the destructured row widens to
      // `| undefined` under the strict-zone check this module is now pulled
      // into. An insert that returns no row is a driver-level failure, not a
      // normal outcome, so fail loudly rather than returning a bad shape.
      // Explicit `=== undefined` (the pattern already used above in this file):
      // ESLint types this from the non-strict config and rejects a truthiness
      // check as always-true, while the strict zone types it as `| undefined`.
      if (newDomain === undefined) {
        throw new Error('Failed to add domain');
      }

      logger.info({ tenantId, domain }, 'Domain added to tenant');
      return newDomain;
    } catch (error: unknown) {
      // Check for unique constraint violation
      if (error instanceof Error && 'code' in error && (error as { code: string }).code === '23505') {
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
      const [domain] = await withCurrentTenant((tx) => tx
        .select()
        .from(tenantDomains)
        .where(eq(tenantDomains.id, domainId)));

      if (domain === undefined) {
        logger.warn({ domainId }, 'Domain not found');
        return false;
      }

      if (domain.tenantId !== tenantId) {
        logger.warn({ tenantId, domainId, actualTenantId: domain.tenantId }, 'Domain does not belong to tenant');
        throw new Error('Domain does not belong to this tenant');
      }

      // Delete domain
      await withCurrentTenant((tx) => tx
        .delete(tenantDomains)
        .where(eq(tenantDomains.id, domainId)));

      logger.info({ tenantId, domainId }, 'Domain removed from tenant');
      return true;
    } catch (error) {
      logger.error({ error, tenantId, domainId }, 'Failed to remove domain from tenant');
      throw error;
    }
  }

  /**
   * The DNS TXT challenge a tenant must publish to prove ownership of a domain.
   * A dedicated `_ezbuildr-challenge` subdomain avoids clobbering the apex's
   * other TXT records. Single source of truth for both the instructions shown
   * on domain creation and the verification lookup.
   */
  buildDomainChallenge(domain: string, verificationToken: string): { host: string; value: string } {
    return {
      host: `_ezbuildr-challenge.${domain.toLowerCase()}`,
      value: `ezbuildr-verification=${verificationToken}`,
    };
  }

  /**
   * Verify domain ownership by resolving the DNS TXT challenge. On success the
   * domain is marked `verified` and begins resolving branding (SEC-026).
   */
  async verifyDomain(
    tenantId: string,
    domainId: string
  ): Promise<{ verified: boolean; reason?: string }> {
    const [domain] = await withCurrentTenant((tx) => tx
      .select()
      .from(tenantDomains)
      .where(eq(tenantDomains.id, domainId)));

    if (domain === undefined) {
      throw new Error('Domain not found');
    }
    if (domain.tenantId !== tenantId) {
      logger.warn({ tenantId, domainId, actualTenantId: domain.tenantId }, 'Domain does not belong to tenant');
      throw new Error('Domain does not belong to this tenant');
    }
    if (domain.verified === true) {
      return { verified: true };
    }
    if (domain.verificationToken === null || domain.verificationToken === undefined) {
      return { verified: false, reason: 'No verification token issued for this domain' };
    }

    const challenge = this.buildDomainChallenge(domain.domain, domain.verificationToken);

    let records: string[][];
    try {
      records = await dns.resolveTxt(challenge.host);
    } catch (error) {
      logger.debug({ domainId, host: challenge.host, error }, 'DNS TXT lookup failed during domain verification');
      return { verified: false, reason: `No TXT record found at ${challenge.host}` };
    }

    // A single TXT record can be split into multiple strings; join before comparing.
    const found = records.some((chunks) => chunks.join('').trim() === challenge.value);
    if (!found) {
      return { verified: false, reason: 'TXT record found but did not match the expected verification value' };
    }

    await withCurrentTenant((tx) => tx
      .update(tenantDomains)
      .set({ verified: true, updatedAt: new Date() })
      .where(eq(tenantDomains.id, domainId)));

    logger.info({ tenantId, domainId, domain: domain.domain }, 'Domain ownership verified');
    return { verified: true };
  }

  /**
   * Check if a domain is available (not already assigned to another tenant)
   */
  async isDomainAvailable(domain: string): Promise<boolean> {
    try {
      // Tenant-scoped, which makes this an advisory check within the caller's
      // own tenant rather than the global one it reads as. That is deliberate:
      // `tenant_domains.domain` carries a global UNIQUE constraint
      // (`tenant_domains_domain_unique`), so the authoritative answer comes
      // from the INSERT in `addDomain`, whose 23505 the route maps to the same
      // 409 this pre-check produces. Scoping it also closes a TOCTOU race the
      // pre-check always had — two tenants claiming one domain concurrently
      // both saw "available" — and stops a cross-tenant read whose only
      // possible output was "someone else has this".
      const [existing] = await withCurrentTenant((tx) => tx
        .select({ id: tenantDomains.id })
        .from(tenantDomains)
        .where(eq(tenantDomains.domain, domain.toLowerCase())));

      return existing === undefined;
    } catch (error) {
      logger.error({ error, domain }, 'Failed to check domain availability');
      throw error;
    }
  }
}

export const brandingService = new BrandingService();
