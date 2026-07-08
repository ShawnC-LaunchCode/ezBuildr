// @ts-nocheck
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import type { UseMutationResult } from '@tanstack/react-query';

import * as api from '../lib/api/organizations';

import type { UpdateOrganizationInput, CreateInviteInput } from '../lib/api/organizations';

// ============================================================================
// Query Keys
// ============================================================================

export const organizationKeys = {
  all: ['organizations'] as const,
  lists: () => [...organizationKeys.all, 'list'] as const,
  list: () => [...organizationKeys.lists()] as const,
  details: () => [...organizationKeys.all, 'detail'] as const,
  detail: (id: string) => [...organizationKeys.details(), id] as const,
  members: (orgId: string) => [...organizationKeys.detail(orgId), 'members'] as const,
  invites: (orgId: string) => [...organizationKeys.detail(orgId), 'invites'] as const,
  pendingInvites: () => [...organizationKeys.all, 'pending-invites'] as const,
};

// ============================================================================
// Organization Queries
// ============================================================================

export function useOrganizations(): ReturnType<typeof useQuery> {
  return useQuery({
    queryKey: organizationKeys.list(),
    queryFn: api.getOrganizations,
  });
}

export function useOrganization(orgId: string | undefined): ReturnType<typeof useQuery> {
  return useQuery({
    queryKey: orgId ? organizationKeys.detail(orgId) : ['organizations', 'null'],
    queryFn: () => {
      if (!orgId) {
        throw new Error('Organization ID is required');
      }
      return api.getOrganizationById(orgId);
    },
    enabled: !!orgId,
  });
}

export function useOrganizationMembers(orgId: string | undefined): ReturnType<typeof useQuery> {
  return useQuery({
    queryKey: orgId ? organizationKeys.members(orgId) : ['organizations', 'null', 'members'],
    queryFn: () => {
      if (!orgId) {
        throw new Error('Organization ID is required');
      }
      return api.getOrganizationMembers(orgId);
    },
    enabled: !!orgId,
  });
}

export function useOrganizationInvites(orgId: string | undefined): ReturnType<typeof useQuery> {
  return useQuery({
    queryKey: orgId ? organizationKeys.invites(orgId) : ['organizations', 'null', 'invites'],
    queryFn: () => {
      if (!orgId) {
        throw new Error('Organization ID is required');
      }
      return api.getOrganizationInvites(orgId);
    },
    enabled: !!orgId,
  });
}

export function usePendingInvites(): ReturnType<typeof useQuery> {
  return useQuery({
    queryKey: organizationKeys.pendingInvites(),
    queryFn: api.getPendingInvites,
  });
}

// ============================================================================
// Organization Mutations
// ============================================================================

export function useCreateOrganization(): ReturnType<typeof useMutation> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.createOrganization,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: organizationKeys.lists() });
    },
  });
}

export function useUpdateOrganization(orgId: string): ReturnType<typeof useMutation> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateOrganizationInput) => api.updateOrganization(orgId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: organizationKeys.detail(orgId) });
      void queryClient.invalidateQueries({ queryKey: organizationKeys.lists() });
    },
  });
}

export function usePromoteMember(orgId: string): ReturnType<typeof useMutation> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => api.promoteMember(orgId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: organizationKeys.members(orgId) });
    },
  });
}

export function useDemoteMember(orgId: string): ReturnType<typeof useMutation> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => api.demoteMember(orgId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: organizationKeys.members(orgId) });
    },
  });
}

export function useRemoveMember(orgId: string): ReturnType<typeof useMutation> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => api.removeMember(orgId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: organizationKeys.members(orgId) });
    },
  });
}

export function useLeaveOrganization(): ReturnType<typeof useMutation> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orgId: string) => api.leaveOrganization(orgId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: organizationKeys.lists() });
    },
  });
}

export function useCreateInvite(orgId: string): ReturnType<typeof useMutation> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateInviteInput) => api.createInvite(orgId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: organizationKeys.invites(orgId) });
    },
  });
}

export function useRevokeInvite(orgId: string): ReturnType<typeof useMutation> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (inviteId: string) => api.revokeInvite(orgId, inviteId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: organizationKeys.invites(orgId) });
    },
  });
}

export function useAcceptInvite(): UseMutationResult<{ orgId: string; orgName: string }, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (token: string) => api.acceptInvite(token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: organizationKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: organizationKeys.pendingInvites() });
    },
  });
}

export function useDeleteOrganization(orgId: string): ReturnType<typeof useMutation> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.deleteOrganization(orgId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: organizationKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: organizationKeys.detail(orgId) });
    },
  });
}
