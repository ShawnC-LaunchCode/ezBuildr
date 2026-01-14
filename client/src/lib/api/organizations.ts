import { fetchAPI } from '../vault-api';

export interface Organization {
  id: string;
  name: string;
  description?: string | null;
  slug?: string | null;
  createdByUserId?: string | null;
  createdAt?: Date | null;
  role?: 'admin' | 'member'; // User's role in this org
}

export interface OrganizationMember {
  userId: string;
  email: string;
  fullName: string | null;
  role: 'admin' | 'member';
  createdAt: Date | null;
}

export interface OrganizationInvite {
  inviteId: string;
  orgId: string;
  orgName: string;
  invitedEmail: string;
  invitedByEmail: string;
  invitedByName: string | null;
  createdAt: Date | null;
  expiresAt: Date | null;
  token: string;
}

export interface CreateOrganizationInput {
  name: string;
  description?: string;
  slug?: string;
}

export interface UpdateOrganizationInput {
  name?: string;
  description?: string;
  slug?: string;
}

export interface CreateInviteInput {
  email: string;
}

// Get all organizations for current user
export async function getOrganizations(): Promise<Organization[]> {
  return fetchAPI<Organization[]>('/api/organizations');
}

// Get organization by ID
export async function getOrganizationById(orgId: string): Promise<Organization> {
  return fetchAPI<Organization>(`/api/organizations/${orgId}`);
}

// Create organization
export async function createOrganization(data: CreateOrganizationInput): Promise<Organization> {
  return fetchAPI<Organization>('/api/organizations', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// Update organization (admin only)
export async function updateOrganization(orgId: string, data: UpdateOrganizationInput): Promise<Organization> {
  return fetchAPI<Organization>(`/api/organizations/${orgId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// Get organization members
export async function getOrganizationMembers(orgId: string): Promise<OrganizationMember[]> {
  return fetchAPI<OrganizationMember[]>(`/api/organizations/${orgId}/members`);
}

// Promote member to admin (admin only)
export async function promoteMember(orgId: string, userId: string): Promise<void> {
  await fetchAPI<void>(`/api/organizations/${orgId}/members/${userId}/promote`, {
    method: 'POST',
  });
}

// Demote admin to member (admin only)
export async function demoteMember(orgId: string, userId: string): Promise<void> {
  await fetchAPI<void>(`/api/organizations/${orgId}/members/${userId}/demote`, {
    method: 'POST',
  });
}

// Remove member (admin only)
export async function removeMember(orgId: string, userId: string): Promise<void> {
  await fetchAPI<void>(`/api/organizations/${orgId}/members/${userId}`, {
    method: 'DELETE',
  });
}

// Leave organization
export async function leaveOrganization(orgId: string): Promise<void> {
  await fetchAPI<void>(`/api/organizations/${orgId}/leave`, {
    method: 'POST',
  });
}

// Create invite (admin only)
export async function createInvite(orgId: string, data: CreateInviteInput): Promise<{ inviteId: string }> {
  return fetchAPI<{ inviteId: string }>(`/api/organizations/${orgId}/invites`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// Get organization invites (admin only)
export async function getOrganizationInvites(orgId: string): Promise<OrganizationInvite[]> {
  return fetchAPI<OrganizationInvite[]>(`/api/organizations/${orgId}/invites`);
}

// Revoke invite (admin only)
export async function revokeInvite(orgId: string, inviteId: string): Promise<void> {
  await fetchAPI<void>(`/api/organizations/${orgId}/invites/${inviteId}`, {
    method: 'DELETE',
  });
}

// Get pending invites for current user
export async function getPendingInvites(): Promise<OrganizationInvite[]> {
  return fetchAPI<OrganizationInvite[]>('/api/me/invites');
}

// Accept invite
export async function acceptInvite(token: string): Promise<{ orgId: string; orgName: string }> {
  return fetchAPI<{ orgId: string; orgName: string }>(`/api/invites/${token}/accept`, {
    method: 'POST',
  });
}

// Delete organization
export async function deleteOrganization(orgId: string): Promise<void> {
  await fetchAPI<void>(`/api/organizations/${orgId}`, {
    method: 'DELETE',
  });
}
