import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import type { TenantBranding, TenantDomain, GetBrandingResponse, UpdateBrandingResponse, GetDomainsResponse, CreateDomainRequest, CreateDomainResponse } from '@shared/types/branding';

async function readJson<T>(response: Response): Promise<T> {
  const data: unknown = await response.json();
  return data as T;
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  const error: unknown = await response.json();
  return typeof error === 'object'
    && error !== null
    && 'message' in error
    && typeof error.message === 'string'
    ? error.message
    : fallback;
}

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
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useTenantBranding(tenantId: string | undefined) {
  return useQuery({
    queryKey: ['tenants', tenantId, 'branding'],
    queryFn: async (): Promise<TenantBranding | null> => {
      if (!tenantId) {
        throw new Error('Tenant ID is required');
      }

      const response = await fetch(`/api/tenants/${tenantId}/branding`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch tenant branding');
      }

      const data = await readJson<GetBrandingResponse>(response);
      return data.branding;
    },
    enabled: !!tenantId,
  });
}

/**
 * Update tenant branding configuration
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
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
        throw new Error(await readErrorMessage(response, 'Failed to update branding'));
      }

      const data = await readJson<UpdateBrandingResponse>(response);
      return data.branding;
    },
    onSuccess: () => {
      // Invalidate branding query to refetch
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
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
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useTenantDomains(tenantId: string | undefined) {
  return useQuery({
    queryKey: ['tenants', tenantId, 'domains'],
    queryFn: async (): Promise<TenantDomain[]> => {
      if (!tenantId) {
        throw new Error('Tenant ID is required');
      }

      const response = await fetch(`/api/tenants/${tenantId}/domains`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch tenant domains');
      }

      const data = await readJson<GetDomainsResponse>(response);
      return data.domains;
    },
    enabled: !!tenantId,
  });
}

/**
 * Add a custom domain to a tenant
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
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
        throw new Error(await readErrorMessage(response, 'Failed to add domain'));
      }

      const data = await readJson<CreateDomainResponse>(response);
      return data.domain;
    },
    onSuccess: () => {
      // Invalidate domains query to refetch
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: ['tenants', tenantId, 'domains'] });
    },
  });
}

/**
 * Remove a custom domain from a tenant
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useRemoveTenantDomain(tenantId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (domainId: string): Promise<void> => {
      const response = await fetch(`/api/tenants/${tenantId}/domains/${domainId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to remove domain'));
      }
    },
    onSuccess: () => {
      // Invalidate domains query to refetch
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: ['tenants', tenantId, 'domains'] });
    },
  });
}
