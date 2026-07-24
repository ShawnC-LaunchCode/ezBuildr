/* eslint-disable max-lines -- API client module necessarily defines all endpoint wrappers in one file */
/**
 * Vault-Logic API Client
 * Handles all API calls to the workflow backend
 */
import { getRunToken } from './runTokens';

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

interface ApiErrorResponse {
  message?: string;
  error?: string;
  errors?: string[];
}

interface RefreshTokenResponse {
  token?: string;
}

// Global Access Token (Memory Only)
export interface ApiUser {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  role?: string;
  tenantRole?: string | null;
  tenantId?: string | null;
  isAdmin?: boolean;
  profileImageUrl?: string | null;
  authProvider?: string | null;
  defaultMode?: string | null;
}

let globalAccessToken: string | null = null;
export function setAccessToken(token: string | null): void {
  globalAccessToken = token;
}
export function getAccessToken(): string | null {
  return globalAccessToken;
}

/**
 * Centralized utility to extract the best available authentication token from the environment.
 * Useful for ad-hoc requests (like Google Places) that don't pass through fetchAPI.
 */
export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (typeof window === 'undefined') {
    if (globalAccessToken) {
      headers["Authorization"] = `Bearer ${globalAccessToken}`;
    }
    return headers;
  }

  // 1. Check for token in query params or hash (preview/iframe)
  // Only trust URL tokens on run or preview routes to prevent token confusion
  const path = window.location.pathname;
  if (path.startsWith('/run/') || path.startsWith('/preview/')) {
    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const urlToken = urlParams.get('token') ?? hashParams.get('token');
    if (urlToken) {
      headers["Authorization"] = `Bearer ${urlToken}`;
      return headers;
    }
  }

  // 2. Check for Run ID in URL path to find a run-specific token
  const pathParts = window.location.pathname.split('/');
  for (const part of pathParts) {
    // Check localStorage which the store persists to anyway
    const localToken = getRunToken(part);
    if (localToken) {
      headers["Authorization"] = `Bearer ${localToken}`;
      return headers;
    }
  }

  // 3. Fallback to global access token
  if (globalAccessToken) {
    headers["Authorization"] = `Bearer ${globalAccessToken}`;
  }

  return headers;
}
// eslint-disable-next-line complexity, sonarjs/cognitive-complexity -- core fetch wrapper handles auth refresh, token injection, and error handling in a single flow
export async function fetchAPI<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  // Check if we have a run token in localStorage for this run
  // Extract runId from endpoint (e.g., /api/runs/:runId/values)
  const runIdMatch = endpoint.match(/\/api\/runs\/([^/]+)/);
  let runToken: string | null = null;
  if (runIdMatch) {
    const runId = runIdMatch[1];
    runToken = getRunToken(runId);
  }
  // IMPORTANT: Only send run tokens for run-specific endpoints
  // Builder endpoints (workflows, sections, steps, etc.) should use session auth (cookies)
  // Preview/run endpoints use bearer tokens for anonymous access
  const isRunEndpoint = endpoint.startsWith('/api/runs/');
  /* eslint-disable @typescript-eslint/naming-convention -- HTTP headers use PascalCase/hyphenated names */
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  /* eslint-enable @typescript-eslint/naming-convention */
  // Only add bearer token for run endpoints
  if (runToken && isRunEndpoint) {
    headers["Authorization"] = `Bearer ${runToken}`;
  } else if (globalAccessToken) {
    // Inject standard Access Token for all other authenticated requests
    headers["Authorization"] = `Bearer ${globalAccessToken}`;
  }
  // Initial request
  let response = await fetch(url, {
    ...options,
    headers,
    credentials: "include", // Include cookies for auth
  });
  // Handle 401 (Unauthorized) - Attempt Refresh
  if (response.status === 401 && !isRunEndpoint && !endpoint.includes('/api/auth/login')) {
    // Try to refresh token
    try {
      const refreshRes = await fetch(`${API_BASE}/api/auth/refresh-token`, { method: 'POST', credentials: 'include' });
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json() as RefreshTokenResponse;
        if (refreshData.token !== undefined && refreshData.token !== null) {
          setAccessToken(refreshData.token);
          headers["Authorization"] = `Bearer ${refreshData.token}`;
        }
        // Retry original request
        response = await fetch(url, {
          ...options,
          headers, // Updated with new token if available
          credentials: "include",
        });
      }
    } catch (err) {
      // Refresh failed, proceed to throw error
    }
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText })) as ApiErrorResponse;
    throw new Error(error.message ?? error.error ?? `HTTP ${response.status}`);
  }
  // Check for auto-revert header and dispatch event
  if (response.headers.get('X-Workflow-Auto-Reverted') === 'true') {
    // Dispatch custom event that can be caught by components
    window.dispatchEvent(new CustomEvent('workflow-auto-reverted'));
  }
  // Handle 204 No Content - don't try to parse JSON from empty response
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}
/**
 * Creates an API client that includes a Bearer token for authentication
 * Used for preview mode where runs are accessed via runToken instead of session
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- complex generic return
export function apiWithToken(runToken: string) {
  return {
    get: <T>(endpoint: string) =>
      fetch(`${API_BASE}${endpoint}`, {
        method: "GET",
        /* eslint-disable @typescript-eslint/naming-convention -- HTTP headers */
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${runToken}`,
        },
        /* eslint-enable @typescript-eslint/naming-convention */
      }).then(async (res) => {
        if (!res.ok) {
          const error = await res.json().catch(() => ({ message: res.statusText })) as ApiErrorResponse;
          const errorMsg = error.message ?? error.errors?.[0] ?? `HTTP ${res.status}`;
          throw new Error(errorMsg);
        }
        return res.json() as Promise<T>;
      }),
    post: <T, B = unknown>(endpoint: string, body?: B) =>
      fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        /* eslint-disable @typescript-eslint/naming-convention -- HTTP headers */
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${runToken}`,
        },
        /* eslint-enable @typescript-eslint/naming-convention */
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }).then(async (res) => {
        if (!res.ok) {
          const error = await res.json().catch(() => ({ message: res.statusText })) as ApiErrorResponse;
          const errorMsg = error.message ?? error.errors?.[0] ?? `HTTP ${res.status}`;
          throw new Error(errorMsg);
        }
        return res.json() as Promise<T>;
      }),
    put: <T, B = unknown>(endpoint: string, body?: B) =>
      fetch(`${API_BASE}${endpoint}`, {
        method: "PUT",
        /* eslint-disable @typescript-eslint/naming-convention -- HTTP headers */
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${runToken}`,
        },
        /* eslint-enable @typescript-eslint/naming-convention */
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }).then(async (res) => {
        if (!res.ok) {
          const error = await res.json().catch(() => ({ message: res.statusText })) as ApiErrorResponse;
          const errorMsg = error.message ?? error.errors?.[0] ?? `HTTP ${res.status}`;
          throw new Error(errorMsg);
        }
        return res.json() as Promise<T>;
      }),
  };
}
// ============================================================================
// Projects
// ============================================================================
export interface ApiProject {
  id: string;
  title: string;
  name?: string | null;
  description: string | null;
  creatorId: string;
  status: "active" | "archived";
  ownerType?: 'user' | 'org' | null;
  ownerUuid?: string | null;
  ownerName?: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface ApiProjectWithWorkflows extends ApiProject {
  workflows: ApiWorkflow[];
}
export interface ApiProjectAccess {
  id: string;
  projectId: string;
  principalType: 'user' | 'team';
  principalId: string;
  role: 'view' | 'edit' | 'owner';
  createdAt: string | null;
}
export type AccessRole = 'view' | 'edit' | 'owner';
export type EffectiveAccessRole = AccessRole | 'none';
export type AccessPrincipalType = 'user' | 'team';

export interface ApiAccessResponse<TEntry> {
  success: boolean;
  data: TEntry[];
  currentUserRole: EffectiveAccessRole;
}
export interface ApiAssetCopyOptions {
  name?: string;
  targetOwnerType?: 'user' | 'org';
  targetOwnerUuid?: string;
  targetProjectId?: string | null;
  includeRelatedDatavault?: boolean;
  includeDatavaultData?: boolean;
  clearAccess?: boolean;
}
export interface ApiAssetCopyResult {
  project?: ApiProject;
  workflow?: ApiWorkflow;
  workflows?: ApiWorkflow[];
  copiedDatabases: number;
  copiedTables: number;
  copiedRows: number;
}
export const projectAPI = {
  list: async (activeOnly?: boolean): Promise<ApiProject[]> => {
    const query = activeOnly ? '?active=true' : '';
    const response = await fetchAPI<ApiProject[] | { items: ApiProject[], nextCursor: string | null, hasMore: boolean }>(`/api/projects${query}`);
    // Handle both paginated and non-paginated responses
    if (Array.isArray(response)) {
      return response;
    }
    return response.items ?? [];
  },
  get: (id: string) => fetchAPI<ApiProjectWithWorkflows>(`/api/projects/${id}`),
  listForOrganization: (orgId: string, activeOnly = true) => {
    const query = activeOnly ? '?active=true' : '?active=false';
    return fetchAPI<ApiProject[]>(`/api/organizations/${orgId}/projects${query}`);
  },
  create: (data: { title?: string; name?: string; description?: string; ownerType?: 'user' | 'org'; ownerUuid?: string }) =>
    fetchAPI<ApiProject>("/api/projects", {
      method: "POST",
      body: JSON.stringify({
        ...data,
        title: data.title ?? data.name,
        name: data.name ?? data.title,
      }),
    }),
  update: (id: string, data: Partial<Omit<ApiProject, 'id' | 'creatorId' | 'createdAt' | 'updatedAt'>>) =>
    fetchAPI<ApiProject>(`/api/projects/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  archive: (id: string) =>
    fetchAPI<ApiProject>(`/api/projects/${id}/archive`, {
      method: "PUT",
    }),
  unarchive: (id: string) =>
    fetchAPI<ApiProject>(`/api/projects/${id}/unarchive`, {
      method: "PUT",
    }),
  delete: (id: string) =>
    fetchAPI<void>(`/api/projects/${id}`, {
      method: "DELETE",
    }),
  getWorkflows: async (projectId: string) => {
    const response = await fetchAPI<ApiWorkflow[] | { items: ApiWorkflow[], nextCursor: string | null, hasMore: boolean }>(
      `/api/projects/${projectId}/workflows`
    );
    if (Array.isArray(response)) {
      return response;
    }
    return response.items ?? [];
  },
  getAccess: (projectId: string) =>
    fetchAPI<ApiAccessResponse<ApiProjectAccess>>(`/api/projects/${projectId}/access`)
      .then((response) => response.data ?? []),
  getAccessDetails: (projectId: string) =>
    fetchAPI<ApiAccessResponse<ApiProjectAccess>>(`/api/projects/${projectId}/access`),
  grantAccess: (
    projectId: string,
    entries: Array<{ principalType: AccessPrincipalType; principalId: string; role: AccessRole }>
  ) =>
    fetchAPI<{ success: boolean; data: ApiProjectAccess[] }>(`/api/projects/${projectId}/access`, {
      method: "PUT",
      body: JSON.stringify({ entries }),
    }).then((response) => response.data ?? []),
  revokeAccess: (
    projectId: string,
    entries: Array<{ principalType: AccessPrincipalType; principalId: string }>
  ) =>
    fetchAPI<{ success: boolean; message: string }>(`/api/projects/${projectId}/access`, {
      method: "DELETE",
      body: JSON.stringify({ entries }),
    }),
  transfer: (id: string, targetOwnerType: 'user' | 'org', targetOwnerUuid: string) =>
    fetchAPI<{ success: boolean; data: ApiProject }>(`/api/projects/${id}/transfer`, {
      method: "POST",
      body: JSON.stringify({ targetOwnerType, targetOwnerUuid }),
    }).then((response) => response.data),
  copy: (id: string, options: ApiAssetCopyOptions) =>
    fetchAPI<{ success: boolean; data: ApiAssetCopyResult }>(`/api/projects/${id}/copy`, {
      method: "POST",
      body: JSON.stringify(options),
    }).then((response) => response.data),
};
// ============================================================================
// Workflows
// ============================================================================
export interface ApiWorkflow {
  id: string;
  title: string;
  description: string | null;
  slug?: string; // Stage 12
  isPublic?: boolean; // Stage 17
  publicLink?: string | null; // Stage 17
  creatorId: string;
  projectId: string | null;
  status: "draft" | "active" | "archived";
  ownerType?: 'user' | 'org' | null;
  ownerUuid?: string | null;
  ownerName?: string | null;
  createdAt: string;
  updatedAt: string;
  modeOverride?: 'easy' | 'advanced' | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- intake config is an opaque JSON object from the server
  intakeConfig?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- settings is an opaque JSON object from the server
  settings?: any;
  /* eslint-disable @typescript-eslint/naming-convention -- keys match database column naming convention */
  accessSettings?: {
    allow_portal: boolean;
    allow_resume: boolean;
    allow_redownload: boolean;
  };
  /* eslint-enable @typescript-eslint/naming-convention */
}
export interface ApiWorkflowAccess {
  id: string;
  workflowId: string;
  principalType: AccessPrincipalType;
  principalId: string;
  role: AccessRole;
  createdAt: string | null;
}
export const workflowAPI = {
  list: () => fetchAPI<ApiWorkflow[]>("/api/workflows"),
  listUnfiled: () => fetchAPI<ApiWorkflow[]>("/api/workflows/unfiled"),
  get: (id: string) => fetchAPI<ApiWorkflow>(`/api/workflows/${id}`),
  create: (data: { title: string; description?: string; projectId?: string | null; ownerType?: 'user' | 'org'; ownerUuid?: string }) =>
    fetchAPI<ApiWorkflow>("/api/workflows", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<ApiWorkflow>) =>
    fetchAPI<ApiWorkflow>(`/api/workflows/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  moveToProject: (id: string, projectId: string | null) =>
    fetchAPI<ApiWorkflow>(`/api/workflows/${id}/move`, {
      method: "PUT",
      body: JSON.stringify({ projectId }),
    }),
  delete: (id: string) =>
    fetchAPI<void>(`/api/workflows/${id}`, {
      method: "DELETE",
    }),
  getPublicLink: (id: string) =>
    fetchAPI<{ publicUrl: string }>(`/api/workflows/${id}/public-link`),
  getAccessDetails: (workflowId: string) =>
    fetchAPI<ApiAccessResponse<ApiWorkflowAccess>>(`/api/workflows/${workflowId}/access`),
  grantAccess: (
    workflowId: string,
    entries: Array<{ principalType: AccessPrincipalType; principalId: string; role: AccessRole }>
  ) =>
    fetchAPI<{ success: boolean; data: ApiWorkflowAccess[] }>(`/api/workflows/${workflowId}/access`, {
      method: "PUT",
      body: JSON.stringify({ entries }),
    }).then((response) => response.data ?? []),
  revokeAccess: (
    workflowId: string,
    entries: Array<{ principalType: AccessPrincipalType; principalId: string }>
  ) =>
    fetchAPI<{ success: boolean; message: string }>(`/api/workflows/${workflowId}/access`, {
      method: "DELETE",
      body: JSON.stringify({ entries }),
    }),
  transfer: (id: string, targetOwnerType: 'user' | 'org', targetOwnerUuid: string) =>
    fetchAPI<{ success: boolean; data: ApiWorkflow }>(`/api/workflows/${id}/transfer`, {
      method: "POST",
      body: JSON.stringify({ targetOwnerType, targetOwnerUuid }),
    }).then((response) => response.data),
  copy: (id: string, options: ApiAssetCopyOptions) =>
    fetchAPI<{ success: boolean; data: ApiAssetCopyResult }>(`/api/workflows/${id}/copy`, {
      method: "POST",
      body: JSON.stringify(options),
    }).then((response) => response.data),
};
// ============================================================================
// Workflow Versions
// ============================================================================
export interface ApiWorkflowVersion {
  id: string;
  workflowId: string;
  versionNumber: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- graph JSON is an opaque serialized workflow graph
  graphJson: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- definition is an opaque serialized workflow definition
  definition: any;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  isPublished: boolean;
  isDraft: boolean;
  publishedAt: string | null;
  pinned: boolean; // Computed field
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration metadata has varying structure
  migrationInfo?: any; // Metadata including AI generation info
}
export interface ApiVersionDiff {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- diff entries have varying structure
  sections: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- diff entries have varying structure
  steps: any[];
  summary: {
    sectionsAdded: number;
    sectionsRemoved: number;
    stepsAdded: number;
    stepsRemoved: number;
    stepsModified: number;
  };
}
export const versionAPI = {
  list: async (workflowId: string) => {
    const response = await fetchAPI<{ success: boolean; data: ApiWorkflowVersion[] }>(
      `/api/workflows/${workflowId}/versions`
    );
    return response.data ?? [];
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- graphJson is an opaque serialized workflow graph
  publish: (workflowId: string, data: { graphJson: any; notes?: string; force?: boolean }) =>
    fetchAPI<{ success: boolean; data: ApiWorkflowVersion }>(`/api/workflows/${workflowId}/publish`, {
      method: 'POST',
      body: JSON.stringify(data),
    }).then(res => res.data),
  rollback: (workflowId: string, toVersionId: string, notes?: string) =>
    fetchAPI<{ success: boolean; message: string }>(`/api/workflows/${workflowId}/rollback`, {
      method: "POST",
      body: JSON.stringify({ toVersionId, notes }),
    }),
  diff: (versionId: string, otherVersionId: string) =>
    fetchAPI<{ success: boolean; data: ApiVersionDiff }>(`/api/workflowVersions/${versionId}/diff/${otherVersionId}`).then(res => res.data),
  restore: (workflowId: string, versionId: string) =>
    fetchAPI<{ success: boolean; message: string }>(`/api/workflows/${workflowId}/rollback`, {
      method: "POST",
      body: JSON.stringify({ toVersionId: versionId }),
    }),
  export: (workflowId: string) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- export format is an opaque JSON structure
    fetchAPI<any>(`/api/workflows/${workflowId}/export`),
};
// ============================================================================
// Workflow Snapshots
// ============================================================================
export interface ApiSnapshot {
  id: string;
  workflowId: string;
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- snapshot values are heterogeneous step values
  values: Record<string, any>;  // Simple key-value pairs (alias -> value)
  versionHash?: string;  // Hash of workflow structure at snapshot creation
  createdAt: string;
  updatedAt: string;
}
export const snapshotAPI = {
  list: (workflowId: string) =>
    fetchAPI<ApiSnapshot[]>(`/api/workflows/${workflowId}/snapshots`),
  get: (workflowId: string, snapshotId: string) =>
    fetchAPI<ApiSnapshot>(`/api/workflows/${workflowId}/snapshots/${snapshotId}`),
  create: (workflowId: string, name: string) =>
    fetchAPI<ApiSnapshot>(`/api/workflows/${workflowId}/snapshots`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  rename: (workflowId: string, snapshotId: string, name: string) =>
    fetchAPI<ApiSnapshot>(`/api/workflows/${workflowId}/snapshots/${snapshotId}`, {
      method: "PUT",
      body: JSON.stringify({ name }),
    }),
  delete: (workflowId: string, snapshotId: string) =>
    fetchAPI<void>(`/api/workflows/${workflowId}/snapshots/${snapshotId}`, {
      method: "DELETE",
    }),
  saveFromRun: (workflowId: string, snapshotId: string, runId: string) =>
    fetchAPI<ApiSnapshot>(`/api/workflows/${workflowId}/snapshots/${snapshotId}/save-from-run`, {
      method: "POST",
      body: JSON.stringify({ runId }),
    }),
  getValues: (workflowId: string, snapshotId: string) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- snapshot values are heterogeneous step values
    fetchAPI<Record<string, any>>(`/api/workflows/${workflowId}/snapshots/${snapshotId}/values`),
  validate: (workflowId: string, snapshotId: string) =>
    fetchAPI<{ isValid: boolean; outdatedSteps: string[] }>(`/api/workflows/${workflowId}/snapshots/${snapshotId}/validate`),
};
// ============================================================================
// Workflow Variables (Step Aliases)
// ============================================================================
export interface ApiWorkflowVariable {
  key: string;           // canonical step ID
  alias?: string | null; // human-friendly variable name
  label: string;         // step title
  type: string;          // step type
  sectionId: string;
  sectionTitle: string;  // section title for grouping
  stepId: string;
}
export const variableAPI = {
  list: (workflowId: string) =>
    fetchAPI<ApiWorkflowVariable[]>(`/api/workflows/${workflowId}/variables`),
};
// ============================================================================
// Auth
// ============================================================================
export const authAPI = {
  getToken: () => fetchAPI<{ token: string; expiresIn: string }>("/api/auth/token"),
  login: (data: { email?: string; password?: string; token?: string }) => fetchAPI<{ message: string; token: string; user: ApiUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(data)
  }),
  register: (data: { email: string; password?: string; firstName?: string; lastName?: string; orgName?: string }) => fetchAPI<{ message: string; token: string; user: ApiUser }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(data)
  }),
  logout: () => fetchAPI<{ message: string }>("/api/auth/logout", {
    method: "POST"
  }),
  forgotPassword: (email: string) => fetchAPI<{ message: string }>("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email })
  }),
  resetPassword: (data: { token: string; password: string }) => fetchAPI<{ message: string }>("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token: data.token, newPassword: data.password })
  }),
  verifyEmail: (token: string) => fetchAPI<{ message: string }>("/api/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token })
  }),
  verifyMfaLogin: (mfaPendingToken: string, token: string, backupCode?: string) => fetchAPI<{ message: string; token: string; user: ApiUser }>("/api/auth/mfa/verify-login", {
    method: "POST",
    body: JSON.stringify({ mfaPendingToken, token, backupCode }),
  }),
  setupMfa: () => fetchAPI<{ message: string; qrCodeDataUrl: string; backupCodes: string[] }>("/api/auth/mfa/setup", {
    method: "POST"
  }),
  verifyMfa: (token: string) => fetchAPI<{ message: string }>("/api/auth/mfa/verify", {
    method: "POST",
    body: JSON.stringify({ token })
  }),
  disableMfa: (password: string) => fetchAPI<{ message: string }>("/api/auth/mfa/disable", {
    method: "POST",
    body: JSON.stringify({ password })
  }),
  getMfaStatus: () => fetchAPI<{ mfaEnabled: boolean; backupCodesRemaining: number }>("/api/auth/mfa/status"),
  regenerateBackupCodes: () => fetchAPI<{ message: string; backupCodes: string[] }>("/api/auth/mfa/backup-codes/regenerate", {
    method: "POST"
  }),
};
// ============================================================================
// Delete impact (ICW2-13) — answers + distinct runs a step/section delete
// would permanently destroy via the step_values cascade. Shared shape
// returned by both GET .../steps/:id/delete-impact and .../sections/:id/delete-impact.
// ============================================================================
export interface ApiDeleteImpact {
  answerCount: number;
  runCount: number;
}

// ============================================================================
// Sections
// ============================================================================
export interface ApiSection {
  id: string;
  workflowId: string;
  title: string;
  description: string | null;
  order: number;
  visibleIf?: unknown; // Condition expression for visibility
  skipIf?: unknown; // Condition expression for skip logic
  config?: unknown;
  createdAt: string;
}
export const sectionAPI = {
  list: (workflowId: string) =>
    fetchAPI<ApiSection[]>(`/api/workflows/${workflowId}/sections`),
  get: (workflowId: string, sectionId: string) =>
    fetchAPI<ApiSection>(`/api/workflows/${workflowId}/sections/${sectionId}`),
  create: (workflowId: string, data: { title: string; description?: string; order: number }) =>
    fetchAPI<ApiSection>(`/api/workflows/${workflowId}/sections`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<ApiSection>) =>
    fetchAPI<ApiSection>(`/api/sections/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  reorder: (workflowId: string, sections: Array<{ id: string; order: number }>) =>
    fetchAPI<void>(`/api/workflows/${workflowId}/sections/reorder`, {
      method: "PUT",
      body: JSON.stringify({ sections }),
    }),
  delete: (id: string) =>
    fetchAPI<void>(`/api/sections/${id}`, {
      method: "DELETE",
      body: JSON.stringify({}), // Some servers require body for DELETE
    }),
  getDeleteImpact: (id: string) =>
    fetchAPI<ApiDeleteImpact>(`/api/sections/${id}/delete-impact`),
  duplicate: (id: string) =>
    fetchAPI<ApiSection>(`/api/sections/${id}/duplicate`, {
      method: "POST",
    }),
};
// ============================================================================
// Logic Rules
// ============================================================================
export interface ApiLogicRule {
  id: string;
  workflowId: string;
  conditionStepAlias: string;
  operator: string;
  conditionValue: unknown;
  targetType: 'section' | 'step';
  targetAlias: string;
  action: 'show' | 'hide' | 'require' | 'make_optional' | 'skip_to';
  description?: string;
}
export const logicRuleAPI = {
  list: (workflowId: string) =>
    fetchAPI<ApiLogicRule[]>(`/api/workflows/${workflowId}/logic-rules`),
};
// ============================================================================
// Steps
// ============================================================================
export type StepType =
  // Input Types
  | "short_text"
  | "long_text"
  | "text" // Alias for short_text
  | "number"
  | "currency"
  | "scale"
  | "email"
  | "phone"
  | "website"
  | "address"
  | "date"
  | "time"
  | "date_time"
  | "datetime"
  | "datetime_unified"
  // Choice Types
  | "multiple_choice"
  | "radio"
  | "yes_no"
  | "boolean" // Alias for yes_no
  | "choice" // Generic alias
  // Advanced Types
  | "file_upload"
  | "signature"
  | "signature_block"
  | "multi_field"
  | "phone_advanced"
  | "email_advanced"
  | "number_advanced"
  | "scale_advanced"
  | "website_advanced"
  | "address_advanced"
  // Display/Logic Types
  | "display"
  | "js_question"
  | "computed"
  | "final"
  | "display_advanced"
  | "final_documents"
  | "loop_group"
  | "repeater"
  | "true_false";
export interface ApiStep {
  id: string;
  workflowId: string;
  sectionId: string;
  type: StepType;
  title: string;
  description: string | null;
  required: boolean;
  alias: string | null; // Optional variable name for logic/blocks
  visibleIf?: unknown; // Condition expression for visibility
  order: number;
  isVirtual?: boolean;
  defaultValue?: unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- repeater config is an opaque JSON structure
  repeaterConfig?: Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- step config varies by step type
  config: Record<string, any> | null; // Step-specific configuration (JSON)
  createdAt: string;
  updatedAt?: string;
}
export const stepAPI = {
  list: (sectionId: string) =>
    fetchAPI<ApiStep[]>(`/api/sections/${sectionId}/steps`),
  listByWorkflow: (workflowId: string) =>
    fetchAPI<ApiStep[]>(`/api/workflows/${workflowId}/steps`),
  get: (id: string) =>
    fetchAPI<ApiStep>(`/api/steps/${id}`),
  create: (sectionId: string, data: Omit<ApiStep, "id" | "createdAt" | "sectionId" | "workflowId">) =>
    fetchAPI<ApiStep>(`/api/sections/${sectionId}/steps`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<ApiStep>) =>
    fetchAPI<ApiStep>(`/api/steps/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  reorder: (sectionId: string, steps: Array<{ id: string; order: number }>) =>
    fetchAPI<void>(`/api/sections/${sectionId}/steps/reorder`, {
      method: "PUT",
      body: JSON.stringify({ steps }),
    }),
  delete: (id: string) =>
    fetchAPI<void>(`/api/steps/${id}`, {
      method: "DELETE",
    }),
  getDeleteImpact: (id: string) =>
    fetchAPI<ApiDeleteImpact>(`/api/steps/${id}/delete-impact`),
  duplicate: (id: string) =>
    fetchAPI<ApiStep>(`/api/steps/${id}/duplicate`, {
      method: "POST",
    }),
};
// ============================================================================
// Blocks
// ============================================================================
export type BlockType = "prefill" | "validate" | "branch" | "js" | "query" | "read_table" | "list_tools" | "write" | "external_send" | "create_record" | "update_record" | "find_record" | "delete_record";
export type BlockPhase = "onRunStart" | "onSectionEnter" | "onSectionSubmit" | "onNext" | "onRunComplete";
export interface ApiBlock {
  id: string;
  workflowId: string;
  sectionId: string | null;
  type: BlockType;
  phase: BlockPhase;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- block config varies by block type
  config: Record<string, any> | null; // JSON - type-specific config
  enabled: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}
export const blockAPI = {
  list: (workflowId: string, phase?: BlockPhase) => {
    const params = phase ? `?phase=${phase}` : "";
    return fetchAPI<{ success: boolean; data: ApiBlock[] }>(`/api/workflows/${workflowId}/blocks${params}`)
      .then(res => res.data);
  },
  get: (id: string) =>
    fetchAPI<{ success: boolean; data: ApiBlock }>(`/api/blocks/${id}`)
      .then(res => res.data),
  create: (workflowId: string, data: Omit<ApiBlock, "id" | "createdAt" | "updatedAt" | "workflowId">) =>
    fetchAPI<{ success: boolean; data: ApiBlock }>(`/api/workflows/${workflowId}/blocks`, {
      method: "POST",
      body: JSON.stringify(data),
    }).then(res => res.data),
  update: (id: string, data: Partial<Omit<ApiBlock, "id" | "createdAt" | "updatedAt" | "workflowId">>) =>
    fetchAPI<{ success: boolean; data: ApiBlock }>(`/api/blocks/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }).then(res => res.data),
  reorder: (workflowId: string, blocks: Array<{ id: string; order: number }>) =>
    fetchAPI<{ success: boolean }>(`/api/workflows/${workflowId}/blocks/reorder`, {
      method: "PUT",
      body: JSON.stringify({ blocks }),
    }),
  delete: (id: string) =>
    fetchAPI<{ success: boolean }>(`/api/blocks/${id}`, {
      method: "DELETE",
    }),
  createListToolsFromChoice: (workflowId: string, stepId: string, data: {
    sourceListVar: string;
    transformConfig?: unknown;
    sectionId: string;
  }) =>
    fetchAPI<{ success: boolean; data: { block: ApiBlock; outputVar: string; message: string } }>(
      `/api/workflows/${workflowId}/steps/${stepId}/create-list-tools`,
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    ).then(res => res.data),
};
// ============================================================================
// Transform Blocks (JavaScript/Python code execution)
// ============================================================================
export type TransformBlockLanguage = "javascript" | "python";
export interface ApiTransformBlock {
  id: string;
  workflowId: string;
  sectionId?: string | null;
  name: string;
  language: TransformBlockLanguage;
  phase: "onRunStart" | "onSectionEnter" | "onSectionSubmit" | "onNext" | "onRunComplete";
  code: string;
  inputKeys: string[];
  outputKey: string;
  enabled: boolean;
  order: number;
  timeoutMs?: number;
  createdAt: string;
  updatedAt: string;
}
export const transformBlockAPI = {
  list: (workflowId: string) =>
    fetchAPI<{ success: boolean; data: ApiTransformBlock[] }>(`/api/workflows/${workflowId}/transform-blocks`)
      .then(res => res.data),
  get: (id: string) =>
    fetchAPI<{ success: boolean; data: ApiTransformBlock }>(`/api/transform-blocks/${id}`)
      .then(res => res.data),
  create: (workflowId: string, data: Omit<ApiTransformBlock, "id" | "createdAt" | "updatedAt" | "workflowId">) =>
    fetchAPI<{ success: boolean; data: ApiTransformBlock }>(`/api/workflows/${workflowId}/transform-blocks`, {
      method: "POST",
      body: JSON.stringify(data),
    }).then(res => res.data),
  update: (id: string, data: Partial<Omit<ApiTransformBlock, "id" | "createdAt" | "updatedAt" | "workflowId">>) =>
    fetchAPI<{ success: boolean; data: ApiTransformBlock }>(`/api/transform-blocks/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }).then(res => res.data),
  delete: (id: string) =>
    fetchAPI<{ success: boolean }>(`/api/transform-blocks/${id}`, {
      method: "DELETE",
    }),
  test: (id: string, testData: Record<string, unknown>) =>
    fetchAPI<{ success: boolean; output: unknown; error?: string }>(`/api/transform-blocks/${id}/test`, {
      method: "POST",
      body: JSON.stringify({ testData }),
    }),
};
// ============================================================================
// Runs
// ============================================================================
export interface ApiRun {
  id: string;
  workflowId: string;
  workflowVersionId: string | null;
  currentSectionId?: string | null;
  participantId: string | null;
  completed: boolean;
  completedAt: string | null;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
}
export interface ApiStepValue {
  id: string;
  runId: string;
  stepId: string;
  value: unknown;
  createdAt: string;
  updatedAt: string;
}
export interface ApiRunRuntime {
  contractVersion: 1;
  run: {
    id: string;
    workflowId: string;
    workflowVersionId: string;
    currentSectionId: string | null;
    completed: boolean;
    generationStatus: string | null;
  };
  workflow: Pick<ApiWorkflow, 'id' | 'title' | 'description' | 'projectId' | 'intakeConfig' | 'settings'>;
  sections: ApiSection[];
  steps: ApiStep[];
  logicRules: Array<{
    id: string;
    workflowId: string;
    conditionStepId: string;
    operator: string;
    conditionValue: unknown;
    targetType: 'section' | 'step';
    targetStepId: string | null;
    targetSectionId: string | null;
    action: string;
    logicalOperator: string | null;
    order: number;
    createdAt: string | null;
    updatedAt: string | null;
  }>;
  values: ApiStepValue[];
}
// Note: This is for visual workflow runs (Stage 7+)
export const runAPI = {
  create: (
    workflowId: string,
    data: {
      participantId?: string;
      metadata?: unknown;
      snapshotId?: string;  // Load from snapshot
      randomize?: boolean;  // Generate random data
      initialValues?: Record<string, unknown>;
    },
    queryParams?: Record<string, string>
  ) => {
    const qs = queryParams ? new URLSearchParams(queryParams).toString() : "";
    const params = qs ? `?${qs}` : "";
    return fetchAPI<{ success: boolean; data: { runId: string; runToken: string; currentSectionId?: string } }>(`/api/workflows/${workflowId}/runs${params}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  list: (workflowId: string) =>
    fetchAPI<ApiRun[]>(`/api/workflows/${workflowId}/runs`),
  get: (id: string) =>
    fetchAPI<{ success: boolean; data: ApiRun }>(`/api/runs/${id}`).then(res => res.data),
  getWithValues: (id: string) =>
    fetchAPI<{ success: boolean; data: ApiRun & { values: ApiStepValue[] } }>(`/api/runs/${id}/values`).then(res => res.data),
  getRuntime: (id: string) =>
    fetchAPI<{ success: boolean; data: ApiRunRuntime }>(`/api/runs/${id}/runtime`).then(res => res.data),
  getDocuments: (id: string) =>
    fetchAPI<{ success: boolean; documents: unknown[] }>(`/api/runs/${id}/documents`).then(res => res.documents),
  upsertValue: (runId: string, stepId: string, value: unknown) =>
    fetchAPI<{ message: string }>(`/api/runs/${runId}/values`, {
      method: "POST",
      body: JSON.stringify({ stepId, value }),
    }),
  submitSection: (runId: string, sectionId: string, values: Array<{ stepId: string; value: unknown }>) =>
    fetchAPI<{ success: boolean; errors?: string[]; fieldErrors?: Record<string, string[]> }>(`/api/runs/${runId}/sections/${sectionId}/submit`, {
      method: "POST",
      body: JSON.stringify({ values }),
    }),
  next: (runId: string, currentSectionId: string) =>
    fetchAPI<{ success: boolean; data: { nextSectionId?: string } }>(`/api/runs/${runId}/next`, {
      method: "POST",
      body: JSON.stringify({ currentSectionId }),
    }).then(res => res.data),
  complete: (runId: string) =>
    fetchAPI<{ success: boolean; data: ApiRun }>(`/api/runs/${runId}/complete`, {
      method: "PUT",
    }).then(res => res.data),
};
// ============================================================================
// Document Runs (Stage 8: Run History UI + Debug Traces)
// ============================================================================
export interface TraceEntry {
  nodeId: string;
  type: string;
  condition?: string;
  conditionResult?: boolean;
  status: 'executed' | 'skipped';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- trace output deltas have varying structure
  outputsDelta?: Record<string, any>;
  error?: string;
  timestamp: string;
}
export interface PaginatedResponse<T> {
  items: T[];
  nextCursor?: string;
}
// ============================================================================
// Account & Mode Preferences
// ============================================================================
export type Mode = 'easy' | 'advanced';
export type ModeSource = 'user' | 'workflow';
export interface AccountPreferences {
  defaultMode: Mode;
}
export interface WorkflowModeResponse {
  mode: Mode;
  source: ModeSource;
}
export const accountAPI = {
  getPreferences: () =>
    fetchAPI<{ success: boolean; data: AccountPreferences }>("/api/account/preferences")
      .then(res => res.data),
  updatePreferences: (preferences: AccountPreferences) =>
    fetchAPI<{ success: boolean; data: AccountPreferences }>("/api/account/preferences", {
      method: "PUT",
      body: JSON.stringify(preferences),
    }).then(res => res.data),
};
export const workflowModeAPI = {
  getMode: (workflowId: string) =>
    fetchAPI<{ success: boolean; data: WorkflowModeResponse }>(`/api/workflows/${workflowId}/mode`)
      .then(res => res.data),
  setMode: (workflowId: string, modeOverride: Mode | null) =>
    fetchAPI<{ success: boolean; data: ApiWorkflow }>(`/api/workflows/${workflowId}/mode`, {
      method: "PUT",
      body: JSON.stringify({ modeOverride }),
    }).then(res => res.data),
};
// ============================================================================
// Branding & Tenant Customization (Stage 17)
// ============================================================================
export interface TenantBranding {
  logoUrl?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  darkModeEnabled?: boolean | null;
  intakeHeaderText?: string | null;
  emailSenderName?: string | null;
  emailSenderAddress?: string | null;
}
export interface TenantDomain {
  id: string;
  tenantId: string;
  domain: string;
  createdAt: string;
  updatedAt: string;
}
export interface GetBrandingResponse {
  branding: TenantBranding | null;
}
export interface UpdateBrandingRequest {
  branding?: Partial<TenantBranding>;
}
export interface UpdateBrandingResponse {
  message: string;
  branding: TenantBranding;
}
export interface GetDomainsResponse {
  domains: TenantDomain[];
  total: number;
}
export interface CreateDomainRequest {
  domain: string;
}
export interface CreateDomainResponse {
  message: string;
  domain: TenantDomain;
}
export interface DeleteDomainResponse {
  message: string;
}
export const brandingAPI = {
  /**
   * Get tenant branding configuration
   */
  getBranding: (tenantId: string) =>
    fetchAPI<GetBrandingResponse>(`/api/tenants/${tenantId}/branding`),
  /**
   * Update tenant branding configuration
   */
  updateBranding: (tenantId: string, branding: Partial<TenantBranding>) =>
    fetchAPI<UpdateBrandingResponse>(`/api/tenants/${tenantId}/branding`, {
      method: "PATCH",
      body: JSON.stringify(branding),
    }),
  /**
   * Get tenant branding by domain (public endpoint, no auth required)
   */
  getBrandingByDomain: (domain: string) =>
    fetchAPI<{ tenantId: string; branding: TenantBranding | null }>(
      `/api/branding/by-domain?domain=${encodeURIComponent(domain)}`
    ),
  /**
   * Get all custom domains for a tenant
   */
  getDomains: (tenantId: string) =>
    fetchAPI<GetDomainsResponse>(`/api/tenants/${tenantId}/domains`),
  /**
   * Add a custom domain to a tenant
   */
  addDomain: (tenantId: string, domain: string) =>
    fetchAPI<CreateDomainResponse>(`/api/tenants/${tenantId}/domains`, {
      method: "POST",
      body: JSON.stringify({ domain }),
    }),
  /**
   * Remove a custom domain from a tenant
   */
  removeDomain: (tenantId: string, domainId: string) =>
    fetchAPI<DeleteDomainResponse>(`/api/tenants/${tenantId}/domains/${domainId}`, {
      method: "DELETE",
    }),
};
// =====================================================================
// EMAIL TEMPLATE METADATA API
// =====================================================================
export interface EmailTemplateMetadata {
  id: string;
  templateKey: string;
  name: string;
  description?: string | null;
  subjectPreview?: string | null;
  brandingTokens?: Record<string, boolean> | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface GetEmailTemplatesResponse {
  templates: EmailTemplateMetadata[];
  total: number;
}
export interface GetEmailTemplateResponse {
  template: EmailTemplateMetadata;
}
export interface UpdateEmailTemplateMetadataRequest {
  name?: string;
  description?: string | null;
  subjectPreview?: string | null;
  brandingTokens?: Record<string, boolean> | null;
}
export interface UpdateEmailTemplateMetadataResponse {
  message: string;
  template: EmailTemplateMetadata;
}
export const emailTemplateAPI = {
  /**
   * Get all email template metadata
   */
  listTemplates: () =>
    fetchAPI<GetEmailTemplatesResponse>("/api/email-templates"),
  /**
   * Get a specific email template metadata
   */
  getTemplate: (templateId: string) =>
    fetchAPI<GetEmailTemplateResponse>(`/api/email-templates/${templateId}`),
  /**
   * Update email template metadata
   */
  updateTemplateMetadata: (
    templateId: string,
    metadata: UpdateEmailTemplateMetadataRequest
  ) =>
    fetchAPI<UpdateEmailTemplateMetadataResponse>(
      `/api/email-templates/${templateId}/metadata`,
      {
        method: "PATCH",
        body: JSON.stringify(metadata),
      }
    ),
  /**
   * Get templates that use a specific branding token
   */
  getTemplatesByToken: (tokenKey: string) =>
    fetchAPI<{ templates: EmailTemplateMetadata[]; total: number; tokenKey: string }>(
      `/api/email-templates/token/${tokenKey}`
    ),
};
// ============================================================================
// Collections / Datastore API (Stage 19)
// ============================================================================
export interface ApiCollection {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface ApiCollectionWithStats extends ApiCollection {
  fieldCount: number;
  recordCount: number;
}
export interface ApiCollectionField {
  id: string;
  collectionId: string;
  name: string;
  slug: string;
  type: 'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'file' | 'select' | 'multi_select' | 'json';
  isRequired: boolean;
  options: unknown[] | null;
  defaultValue: unknown;
  createdAt: string;
  updatedAt: string;
}
export interface ApiCollectionRecord {
  id: string;
  tenantId: string;
  collectionId: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}
export interface ApiCollectionWithFields extends ApiCollection {
  fields: ApiCollectionField[];
}
export interface ListRecordsResponse {
  records: ApiCollectionRecord[];
  count?: number;
}
export const collectionsAPI = {
  // Collections
  list: (tenantId: string, withStats?: boolean) => {
    const query = withStats ? '?stats=true' : '';
    return fetchAPI<ApiCollectionWithStats[]>(`/api/tenants/${tenantId}/collections${query}`);
  },
  get: (tenantId: string, collectionId: string, withFields?: boolean) => {
    const query = withFields ? '?fields=true' : '';
    return fetchAPI<ApiCollectionWithFields>(`/api/tenants/${tenantId}/collections/${collectionId}${query}`);
  },
  getBySlug: (tenantId: string, slug: string) =>
    fetchAPI<ApiCollection>(`/api/tenants/${tenantId}/collections/slug/${slug}`),
  create: (tenantId: string, data: { name: string; slug?: string; description?: string | null }) =>
    fetchAPI<ApiCollection>(`/api/tenants/${tenantId}/collections`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (tenantId: string, collectionId: string, data: Partial<Pick<ApiCollection, 'name' | 'slug' | 'description'>>) =>
    fetchAPI<ApiCollection>(`/api/tenants/${tenantId}/collections/${collectionId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (tenantId: string, collectionId: string) =>
    fetchAPI<void>(`/api/tenants/${tenantId}/collections/${collectionId}`, {
      method: 'DELETE',
    }),
  // Fields
  listFields: (tenantId: string, collectionId: string) =>
    fetchAPI<ApiCollectionField[]>(`/api/tenants/${tenantId}/collections/${collectionId}/fields`),
  createField: (tenantId: string, collectionId: string, data: Omit<ApiCollectionField, 'id' | 'collectionId' | 'createdAt' | 'updatedAt'>) =>
    fetchAPI<ApiCollectionField>(`/api/tenants/${tenantId}/collections/${collectionId}/fields`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  createFieldsBulk: (tenantId: string, collectionId: string, fields: Array<Omit<ApiCollectionField, 'id' | 'collectionId' | 'createdAt' | 'updatedAt'>>) =>
    fetchAPI<ApiCollectionField[]>(`/api/tenants/${tenantId}/collections/${collectionId}/fields/bulk`, {
      method: 'POST',
      body: JSON.stringify({ fields }),
    }),
  getField: (tenantId: string, collectionId: string, fieldId: string) =>
    fetchAPI<ApiCollectionField>(`/api/tenants/${tenantId}/collections/${collectionId}/fields/${fieldId}`),
  updateField: (tenantId: string, collectionId: string, fieldId: string, data: Partial<Pick<ApiCollectionField, 'name' | 'slug' | 'isRequired' | 'options' | 'defaultValue'>>) =>
    fetchAPI<ApiCollectionField>(`/api/tenants/${tenantId}/collections/${collectionId}/fields/${fieldId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteField: (tenantId: string, collectionId: string, fieldId: string) =>
    fetchAPI<void>(`/api/tenants/${tenantId}/collections/${collectionId}/fields/${fieldId}`, {
      method: 'DELETE',
    }),
  // Records
  listRecords: (tenantId: string, collectionId: string, params?: { limit?: number; offset?: number; orderBy?: 'created_at' | 'updated_at'; order?: 'asc' | 'desc'; includeCount?: boolean }) => {
    const queryParams = new URLSearchParams();
    if (params?.limit !== undefined && params.limit !== null) { queryParams.set('limit', params.limit.toString()); }
    if (params?.offset !== undefined && params.offset !== null) { queryParams.set('offset', params.offset.toString()); }
    if (params?.orderBy) { queryParams.set('orderBy', params.orderBy); }
    if (params?.order) { queryParams.set('order', params.order); }
    if (params?.includeCount) { queryParams.set('includeCount', 'true'); }
    const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return fetchAPI<ApiCollectionRecord[] | ListRecordsResponse>(`/api/tenants/${tenantId}/collections/${collectionId}/records${query}`);
  },
  createRecord: (tenantId: string, collectionId: string, data: Record<string, unknown>) =>
    fetchAPI<ApiCollectionRecord>(`/api/tenants/${tenantId}/collections/${collectionId}/records`, {
      method: 'POST',
      body: JSON.stringify({ data }),
    }),
  createRecordsBulk: (tenantId: string, collectionId: string, records: Array<Record<string, unknown>>) =>
    fetchAPI<ApiCollectionRecord[]>(`/api/tenants/${tenantId}/collections/${collectionId}/records/bulk`, {
      method: 'POST',
      body: JSON.stringify({ records }),
    }),
  queryRecords: (tenantId: string, collectionId: string, filters: Record<string, unknown>) =>
    fetchAPI<ApiCollectionRecord[]>(`/api/tenants/${tenantId}/collections/${collectionId}/records/query`, {
      method: 'POST',
      body: JSON.stringify({ filters }),
    }),
  getRecord: (tenantId: string, collectionId: string, recordId: string) =>
    fetchAPI<ApiCollectionRecord>(`/api/tenants/${tenantId}/collections/${collectionId}/records/${recordId}`),
  updateRecord: (tenantId: string, collectionId: string, recordId: string, data: Record<string, unknown>) =>
    fetchAPI<ApiCollectionRecord>(`/api/tenants/${tenantId}/collections/${collectionId}/records/${recordId}`, {
      method: 'PATCH',
      body: JSON.stringify({ data }),
    }),
  deleteRecord: (tenantId: string, collectionId: string, recordId: string) =>
    fetchAPI<void>(`/api/tenants/${tenantId}/collections/${collectionId}/records/${recordId}`, {
      method: 'DELETE',
    }),
  countRecords: (tenantId: string, collectionId: string) =>
    fetchAPI<{ count: number }>(`/api/tenants/${tenantId}/collections/${collectionId}/records/count`),
};
// ============================================================================
// Data Sources
// ============================================================================
export interface ApiDataSource {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  type: "native" | "native_table" | "postgres" | "google_sheets" | "airtable" | "external";
  config: unknown;
  scopeType: "account" | "project" | "workflow";
  scopeId?: string;
  createdAt: string;
  updatedAt: string;
}
export const dataSourceAPI = {
  list: () =>
    fetchAPI<ApiDataSource[]>(`/api/data-sources`),
  listForWorkflow: (workflowId: string) =>
    fetchAPI<ApiDataSource[]>(`/api/data-sources/workflow/${workflowId}`),
  get: (id: string) =>
    fetchAPI<ApiDataSource>(`/api/data-sources/${id}`),
  getTables: (id: string) =>
    fetchAPI<{ name: string; type: string }[]>(`/api/data-sources/${id}/tables`),
  create: (data: Partial<ApiDataSource>) =>
    fetchAPI<ApiDataSource>(`/api/data-sources`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<ApiDataSource>) =>
    fetchAPI<ApiDataSource>(`/api/data-sources/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchAPI<void>(`/api/data-sources/${id}`, {
      method: "DELETE",
    }),
  linkToWorkflow: (id: string, workflowId: string) =>
    fetchAPI<{ success: boolean }>(`/api/data-sources/${id}/link`, {
      method: "POST",
      body: JSON.stringify({ workflowId }),
    }),
  unlinkFromWorkflow: (id: string, workflowId: string) =>
    fetchAPI<void>(`/api/data-sources/${id}/link/${workflowId}`, {
      method: "DELETE",
    }),
};
// ============================================================================
// AI Services
// ============================================================================
export interface AIStepData {
  key: string;
  type: string;
  label?: string;
  choices?: string[];
  options?: string[];
  description?: string;
}
export const aiAPI = {
  suggestValues: (steps: AIStepData[], mode: 'full' | 'partial' = 'full') =>
    fetchAPI<{ success: boolean; data: Record<string, unknown> }>(`/api/ai/suggest-values`, {
      method: "POST",
      body: JSON.stringify({ steps, mode }),
    }).then(res => res.data),
};
// ============================================================================
// Templates
// ============================================================================
export interface ApiTemplate {
  id: string;
  creatorId: string;
  name: string;
  description: string | null;
  content: unknown; // JSON
  tags: string[];
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface TestTemplateRequest {
  outputType: 'docx' | 'pdf' | 'both';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- sample data is dynamic
  sampleData: Record<string, any>;
}

export interface ApiTemplateTestResult {
  ok: boolean;
  status: 'success' | 'error';
  durationMs?: number;
  docxUrl?: string;
  pdfUrl?: string;
  errors?: Array<{
    code: string;
    message: string;
    details?: unknown;
  }>;
}

export const templateAPI = {
  list: () =>
    fetchAPI<ApiTemplate[]>(`/api/templates`),
  get: (id: string) =>
    fetchAPI<ApiTemplate>(`/api/templates/${id}`),
  update: (id: string, data: Partial<ApiTemplate>) =>
    fetchAPI<ApiTemplate>(`/api/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchAPI<void>(`/api/templates/${id}`, {
      method: 'DELETE',
    }),
  getPlaceholders: (id: string) =>
    fetchAPI<{ templateId: string; placeholders: ApiPlaceholderInfo[] }>(
      `/api/templates/${id}/placeholders`
    ),
  test: (workflowId: string, templateId: string, request: TestTemplateRequest) =>
    fetchAPI<ApiTemplateTestResult>(`/api/workflows/${workflowId}/templates/${templateId}/test`, {
      method: 'POST',
      body: JSON.stringify(request),
    }),
};
// ============================================================================
// Blueprints (Workflow Templates) FE-15
// ============================================================================
export interface ApiBlueprint {
  id: string;
  name: string;
  description: string | null;
  creatorId: string;
  isPublic: boolean;
  metadata?: unknown;
  createdAt: string;
  updatedAt: string;
  tags?: string[]; // Derived from metadata potentially
}
export const blueprintAPI = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- activeOnly reserved for future filter support
  list: (activeOnly?: boolean) => fetchAPI<{ data: ApiBlueprint[] }>('/api/blueprints').then(res => res.data),
  create: (data: { name: string; description?: string; sourceWorkflowId: string; isPublic?: boolean; metadata?: unknown }) =>
    fetchAPI<{ data: ApiBlueprint }>('/api/blueprints', {
      method: 'POST',
      body: JSON.stringify(data)
    }).then(res => res.data),
  instantiate: (id: string, data: { projectId: string; name?: string }) =>
    fetchAPI<{ data: { workflowId: string; versionId: string } }>(`/api/blueprints/${id}/instantiate`, {
      method: 'POST',
      body: JSON.stringify(data)
    }).then(res => res.data),
};
// ============================================================================
// Exports
// ============================================================================
export const workflowExportAPI = {
  // Triggers browser download
  downloadExport: async (workflowId: string, format: 'json' | 'csv') => {
    // We use a hidden link for file downloads to handle the stream/headers correctly.
    // Auth uses the in-memory access token (with cookie fallback), consistent with fetchAPI/apiRequest.
    const url = `/api/workflows/${workflowId}/export?format=${format}`;
    const token = getAccessToken();
    // eslint-disable-next-line @typescript-eslint/naming-convention -- HTTP header
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await fetch(url, {
      headers,
      credentials: 'include',
    });
    if (!response.ok) { throw new Error('Export failed'); }
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `workflow-${workflowId}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
};
// ============================================================================
// Workflow Analytics (Stage 15: FE-16 Usage Insights)
// ============================================================================
export interface ApiAnalyticsHealth {
  totalRuns: number;
  completedRuns: number;
  completionRate: number;
  avgTimeMs: number;
  errorRate: number;
}
export interface ApiDropoffStep {
  stepId: string;
  stepTitle: string;
  views: number;
  dropoffs: number;
  dropoffRate: number;
}
export interface ApiBlockHeatmap {
  [blockId: string]: {
    executions: number;
    errors: number;
    avgDurationMs: number;
  };
}
export interface ApiBranchingNode {
  id: string;
  type: string;
  label: string;
  stats: {
    visits: number;
    exits: number;
  };
}
export interface ApiBranchingEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  count: number;
  percentage: number;
}
export interface ApiBranchingGraph {
  nodes: ApiBranchingNode[];
  edges: ApiBranchingEdge[];
}
export interface ApiTimelineEvent {
  id: string;
  type: string;
  timestamp: string;
  blockId?: string;
  payload?: unknown;
}
export const analyticsAPI = {
  getHealth: (workflowId: string, versionId?: string, window: '1d' | '7d' | '30d' = '30d') => {
    const params = new URLSearchParams();
    if (versionId) {
      params.append("versionId", versionId);
    }
    if (window) {
      params.append("window", window);
    }
    return fetchAPI<{ success: boolean; data: ApiAnalyticsHealth }>(
      `/api/workflow-analytics/${workflowId}/health?${params.toString()}`
    ).then((res) => res.data);
  },
  getDropoff: (workflowId: string, versionId: string) => {
    return fetchAPI<{ success: boolean; data: ApiDropoffStep[] }>(
      `/api/workflow-analytics/${workflowId}/dropoff?versionId=${versionId}`
    ).then((res) => res.data);
  },
  getHeatmap: (workflowId: string, versionId: string) => {
    return fetchAPI<{ success: boolean; data: ApiBlockHeatmap }>(
      `/api/workflow-analytics/${workflowId}/heatmap?versionId=${versionId}`
    ).then((res) => res.data);
  },
  getBranching: (workflowId: string, versionId: string) => {
    return fetchAPI<{ success: boolean; data: ApiBranchingGraph }>(
      `/api/workflow-analytics/${workflowId}/branching?versionId=${versionId}`
    ).then((res) => res.data);
  },
  getRunTimeline: (runId: string) => {
    return fetchAPI<{ success: boolean; data: ApiTimelineEvent[] }>(
      `/api/workflow-analytics/run/${runId}/timeline`
    ).then((res) => res.data);
  },
};
export interface ApiPlaceholderInfo {
  name: string;
  type: string;
  example: string;
}
