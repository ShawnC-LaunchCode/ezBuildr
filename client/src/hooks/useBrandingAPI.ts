import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import type {
  TenantBranding,
  TenantDomain,
  GetBrandingResponse,
  UpdateBrandingRequest,
  UpdateBrandingResponse,
  GetDomainsResponse,
  CreateDomainRequest,
  CreateDomainResponse,
  DeleteDomainResponse,
} from '@shared/types/branding';

/**
 * Stage 17: Branding API Hooks
 *
 * React Query hooks for managing tenant branding and custom domains.
 */

// =====================================================================
// BRANDING HOOKS
// =====================================================================

/**
 * Fetch tenant branding configuration
 */
export function useTenantBranding(tenantId: string | undefined) {
  return useQuery({
    queryKey: ['tenants', tenantId, 'branding'],
    queryFn: async (): Promise<TenantBranding | null> => {
      if (!tenantId) {throw new Error('Tenant ID is required');}

      const response = await fetch(`/api/tenants/${tenantId}/branding`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch tenant branding');
      }

      const data: GetBrandingResponse = await response.json();
      return data.branding;
    },
    enabled: !!tenantId,
  });
}

/**
 * Update tenant branding configuration
 */
export function useUpdateTenantBranding(tenantId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (branding: Partial<TenantBranding>): Promise<TenantBranding> => {
      const response = await fetch(`/api/tenants/${tenantId}/branding`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(branding),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update branding');
      }

      const data: UpdateBrandingResponse = await response.json();
      return data.branding;
    },
    onSuccess: () => {
      // Invalidate branding query to refetch
      queryClient.invalidateQueries({ queryKey: ['tenants', tenantId, 'branding'] });
    },
  });
}

// =====================================================================
// DOMAIN HOOKS
// =====================================================================

/**
 * Fetch tenant domains
 */
export function useTenantDomains(tenantId: string | undefined) {
  return useQuery({
    queryKey: ['tenants', tenantId, 'domains'],
    queryFn: async (): Promise<TenantDomain[]> => {
      if (!tenantId) {throw new Error('Tenant ID is required');}

      const response = await fetch(`/api/tenants/${tenantId}/domains`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch tenant domains');
      }

      const data: GetDomainsResponse = await response.json();
      return data.domains;
    },
    enabled: !!tenantId,
  });
}

/**
 * Add a custom domain to a tenant
 */
export function useAddTenantDomain(tenantId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (domain: string): Promise<TenantDomain> => {
      const response = await fetch(`/api/tenants/${tenantId}/domains`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ domain } as CreateDomainRequest),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to add domain');
      }

      const data: CreateDomainResponse = await response.json();
      return data.domain;
    },
    onSuccess: () => {
      // Invalidate domains query to refetch
      queryClient.invalidateQueries({ queryKey: ['tenants', tenantId, 'domains'] });
    },
  });
}

/**
 * Remove a custom domain from a tenant
 */
export function useRemoveTenantDomain(tenantId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (domainId: string): Promise<void> => {
      const response = await fetch(`/api/tenants/${tenantId}/domains/${domainId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to remove domain');
      }
    },
    onSuccess: () => {
      // Invalidate domains query to refetch
      queryClient.invalidateQueries({ queryKey: ['tenants', tenantId, 'domains'] });
    },
  });
}
