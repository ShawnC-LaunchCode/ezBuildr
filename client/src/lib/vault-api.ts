/**
 * Vault-Logic API Client
 * Handles all API calls to the workflow backend
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

async function fetchAPI<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  // Check if we have a run token in localStorage for this run
  // Extract runId from endpoint (e.g., /api/runs/:runId/values)
  const runIdMatch = endpoint.match(/\/api\/runs\/([^\/]+)/);
  let runToken: string | null = null;
  if (runIdMatch) {
    const runId = runIdMatch[1];
    runToken = localStorage.getItem(`run_token_${runId}`);
  }

  // IMPORTANT: Only send run tokens for run-specific endpoints
  // Builder endpoints (workflows, sections, steps, etc.) should use session auth (cookies)
  // Preview/run endpoints use bearer tokens for anonymous access
  const isRunEndpoint = endpoint.startsWith('/api/runs/');

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  // Only add bearer token for run endpoints
  if (runToken && isRunEndpoint) {
    headers["Authorization"] = `Bearer ${runToken}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "include", // Include cookies for auth
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  // Check for auto-revert header and dispatch event
  if (response.headers.get('X-Workflow-Auto-Reverted') === 'true') {
    // Dispatch custom event that can be caught by components
    window.dispatchEvent(new CustomEvent('workflow-auto-reverted'));
  }

  return response.json();
}

/**
 * Creates an API client that includes a Bearer token for authentication
 * Used for preview mode where runs are accessed via runToken instead of session
 */
export function apiWithToken(runToken: string) {
  return {
    get: <T>(endpoint: string) =>
      fetch(`${API_BASE}${endpoint}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${runToken}`,
        },
      }).then(async (res) => {
        if (!res.ok) {
          const error = await res.json().catch(() => ({ message: res.statusText }));
          // Handle both error.message and error.errors array formats
          const errorMsg = error.message || (error.errors && error.errors[0]) || `HTTP ${res.status}`;
          throw new Error(errorMsg);
        }
        return res.json() as Promise<T>;
      }),

    post: <T>(endpoint: string, body?: any) =>
      fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${runToken}`,
        },
        body: body ? JSON.stringify(body) : undefined,
      }).then(async (res) => {
        if (!res.ok) {
          const error = await res.json().catch(() => ({ message: res.statusText }));
          // Handle both error.message and error.errors array formats
          const errorMsg = error.message || (error.errors && error.errors[0]) || `HTTP ${res.status}`;
          throw new Error(errorMsg);
        }
        return res.json() as Promise<T>;
      }),

    put: <T>(endpoint: string, body?: any) =>
      fetch(`${API_BASE}${endpoint}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${runToken}`,
        },
        body: body ? JSON.stringify(body) : undefined,
      }).then(async (res) => {
        if (!res.ok) {
          const error = await res.json().catch(() => ({ message: res.statusText }));
          // Handle both error.message and error.errors array formats
          const errorMsg = error.message || (error.errors && error.errors[0]) || `HTTP ${res.status}`;
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
  description: string | null;
  creatorId: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface ApiProjectWithWorkflows extends ApiProject {
  workflows: ApiWorkflow[];
}

export const projectAPI = {
  list: (activeOnly?: boolean) => {
    const query = activeOnly ? '?active=true' : '';
    return fetchAPI<ApiProject[]>(`/api/projects${query}`);
  },

  get: (id: string) => fetchAPI<ApiProjectWithWorkflows>(`/api/projects/${id}`),

  create: (data: { title: string; description?: string }) =>
    fetchAPI<ApiProject>("/api/projects", {
      method: "POST",
      body: JSON.stringify(data),
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

  getWorkflows: (projectId: string) =>
    fetchAPI<ApiWorkflow[]>(`/api/projects/${projectId}/workflows`),
};

// ============================================================================
// Workflows
// ============================================================================

export interface ApiWorkflow {
  id: string;
  title: string;
  description: string | null;
  creatorId: string;
  projectId: string | null;
  status: "draft" | "active" | "archived";
  createdAt: string;
  updatedAt: string;
}

export const workflowAPI = {
  list: () => fetchAPI<ApiWorkflow[]>("/api/workflows"),

  listUnfiled: () => fetchAPI<ApiWorkflow[]>("/api/workflows/unfiled"),

  get: (id: string) => fetchAPI<ApiWorkflow>(`/api/workflows/${id}`),

  create: (data: { title: string; description?: string; projectId?: string | null }) =>
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
// Sections
// ============================================================================

export interface ApiSection {
  id: string;
  workflowId: string;
  title: string;
  description: string | null;
  order: number;
  visibleIf?: any | null; // Condition expression for visibility
  skipIf?: any | null; // Condition expression for skip logic
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
    }),
};

// ============================================================================
// Steps
// ============================================================================

export type StepType = "short_text" | "long_text" | "multiple_choice" | "radio" | "yes_no" | "date_time" | "file_upload" | "js_question";

export interface ApiStep {
  id: string;
  sectionId: string;
  type: StepType;
  title: string;
  description: string | null;
  required: boolean;
  options: any; // JSON - for choice types
  alias: string | null; // Optional variable name for logic/blocks
  visibleIf?: any | null; // Condition expression for visibility
  order: number;
  createdAt: string;
}

export const stepAPI = {
  list: (sectionId: string) =>
    fetchAPI<ApiStep[]>(`/api/sections/${sectionId}/steps`),

  get: (id: string) =>
    fetchAPI<ApiStep>(`/api/steps/${id}`),

  create: (sectionId: string, data: Omit<ApiStep, "id" | "createdAt" | "sectionId">) =>
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
};

// ============================================================================
// Blocks
// ============================================================================

export type BlockType = "prefill" | "validate" | "branch" | "js";
export type BlockPhase = "onRunStart" | "onSectionEnter" | "onSectionSubmit" | "onNext" | "onRunComplete";

export interface ApiBlock {
  id: string;
  workflowId: string;
  sectionId: string | null;
  type: BlockType;
  phase: BlockPhase;
  config: any; // JSON - type-specific config
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

  test: (id: string, testData: Record<string, any>) =>
    fetchAPI<{ success: boolean; output: any; error?: string }>(`/api/transform-blocks/${id}/test`, {
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
  participantId: string | null;
  completed: boolean;
  completedAt: string | null;
  metadata: any;
  createdAt: string;
  updatedAt: string;
}

export interface ApiStepValue {
  id: string;
  runId: string;
  stepId: string;
  value: any;
  createdAt: string;
  updatedAt: string;
}

// Note: This is for visual workflow runs (Stage 7+)
export const runAPI = {
  create: (workflowId: string, data: { participantId?: string; metadata?: any }, queryParams?: Record<string, string>) => {
    const params = queryParams ? `?${new URLSearchParams(queryParams)}` : "";
    return fetchAPI<{ success: boolean; data: { runId: string; runToken: string } }>(`/api/workflows/${workflowId}/runs${params}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  get: (id: string) =>
    fetchAPI<{ success: boolean; data: ApiRun }>(`/api/runs/${id}`).then(res => res.data),

  getWithValues: (id: string) =>
    fetchAPI<{ success: boolean; data: ApiRun & { values: ApiStepValue[] } }>(`/api/runs/${id}/values`).then(res => res.data),

  upsertValue: (runId: string, stepId: string, value: any) =>
    fetchAPI<{ message: string }>(`/api/runs/${runId}/values`, {
      method: "POST",
      body: JSON.stringify({ stepId, value }),
    }),

  submitSection: (runId: string, sectionId: string, values: Array<{ stepId: string; value: any }>) =>
    fetchAPI<{ success: boolean; errors?: string[] }>(`/api/runs/${runId}/sections/${sectionId}/submit`, {
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

  list: (workflowId: string) =>
    fetchAPI<ApiRun[]>(`/api/workflows/${workflowId}/runs`),
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
  outputsDelta?: Record<string, any>;
  error?: string;
  timestamp: string;
}

export interface DocumentRun {
  id: string;
  workflowVersionId: string;
  inputJson?: Record<string, any>;
  outputRefs?: Record<string, any>;
  trace?: TraceEntry[];
  status: 'pending' | 'success' | 'error';
  error?: string | null;
  durationMs?: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  // Relations
  workflowVersion?: {
    id: string;
    name: string;
    workflow: {
      id: string;
      name: string;
      projectId: string;
    };
  };
  createdByUser?: {
    id: string;
    email: string;
    fullName?: string;
  };
}

export interface RunLogEntry {
  id: string;
  runId: string;
  nodeId: string | null;
  level: 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, any> | null;
  createdAt: string;
}

export interface ListRunsParams {
  cursor?: string;
  limit?: number;
  workflowId?: string;
  projectId?: string;
  status?: 'pending' | 'success' | 'error';
  from?: string;
  to?: string;
  q?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor?: string;
}

export interface CompareRunsResponse {
  runA: {
    id: string;
    status: string;
    durationMs?: number;
    inputs?: Record<string, any>;
    outputs?: Record<string, any>;
    trace?: TraceEntry[];
    error?: string | null;
    createdAt: string;
  };
  runB: {
    id: string;
    status: string;
    durationMs?: number;
    inputs?: Record<string, any>;
    outputs?: Record<string, any>;
    trace?: TraceEntry[];
    error?: string | null;
    createdAt: string;
  };
  summaryDiff: {
    inputsChangedKeys: string[];
    outputsChangedKeys: string[];
    statusMatch: boolean;
    durationDiff: number;
  };
}

// Stage 8: Document runs API (for template/document generation workflows)
export const documentRunsAPI = {
  /**
   * List document runs with filters and pagination
   */
  list: (params: ListRunsParams = {}) => {
    const queryParams = new URLSearchParams();
    if (params.cursor) queryParams.set('cursor', params.cursor);
    if (params.limit) queryParams.set('limit', params.limit.toString());
    if (params.workflowId) queryParams.set('workflowId', params.workflowId);
    if (params.projectId) queryParams.set('projectId', params.projectId);
    if (params.status) queryParams.set('status', params.status);
    if (params.from) queryParams.set('from', params.from);
    if (params.to) queryParams.set('to', params.to);
    if (params.q) queryParams.set('q', params.q);

    const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return fetchAPI<PaginatedResponse<DocumentRun>>(`/runs${query}`);
  },

  /**
   * Get a single run by ID (includes trace, logs, etc.)
   */
  get: (id: string) =>
    fetchAPI<DocumentRun>(`/runs/${id}`),

  /**
   * Get logs for a run
   */
  getLogs: (id: string, params: { cursor?: string; limit?: number } = {}) => {
    const queryParams = new URLSearchParams();
    if (params.cursor) queryParams.set('cursor', params.cursor);
    if (params.limit) queryParams.set('limit', params.limit.toString());

    const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return fetchAPI<PaginatedResponse<RunLogEntry>>(`/runs/${id}/logs${query}`);
  },

  /**
   * Download run output (DOCX or PDF)
   */
  downloadUrl: (id: string, type: 'docx' | 'pdf' = 'docx') => {
    const queryParams = new URLSearchParams({ type });
    return `${API_BASE}/runs/${id}/download?${queryParams.toString()}`;
  },

  /**
   * Re-run a workflow with same or override inputs
   */
  rerun: (id: string, data: {
    overrideInputJson?: Record<string, any>;
    versionId?: string;
    options?: { debug?: boolean };
  } = {}) =>
    fetchAPI<{ runId: string; status: string; durationMs?: number }>(`/runs/${id}/rerun`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * Export runs to CSV
   */
  exportCsvUrl: (params: Omit<ListRunsParams, 'cursor' | 'limit'> = {}) => {
    const queryParams = new URLSearchParams();
    if (params.workflowId) queryParams.set('workflowId', params.workflowId);
    if (params.projectId) queryParams.set('projectId', params.projectId);
    if (params.status) queryParams.set('status', params.status);
    if (params.from) queryParams.set('from', params.from);
    if (params.to) queryParams.set('to', params.to);
    if (params.q) queryParams.set('q', params.q);

    const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return `${API_BASE}/runs/export.csv${query}`;
  },

  /**
   * Compare two runs
   */
  compare: (runA: string, runB: string) => {
    const queryParams = new URLSearchParams({ runA, runB });
    return fetchAPI<CompareRunsResponse>(`/runs/compare?${queryParams.toString()}`);
  },
};

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
  options: any[] | null;
  defaultValue: any | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiCollectionRecord {
  id: string;
  tenantId: string;
  collectionId: string;
  data: Record<string, any>;
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
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.offset) queryParams.set('offset', params.offset.toString());
    if (params?.orderBy) queryParams.set('orderBy', params.orderBy);
    if (params?.order) queryParams.set('order', params.order);
    if (params?.includeCount) queryParams.set('includeCount', 'true');

    const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return fetchAPI<ApiCollectionRecord[] | ListRecordsResponse>(`/api/tenants/${tenantId}/collections/${collectionId}/records${query}`);
  },

  createRecord: (tenantId: string, collectionId: string, data: Record<string, any>) =>
    fetchAPI<ApiCollectionRecord>(`/api/tenants/${tenantId}/collections/${collectionId}/records`, {
      method: 'POST',
      body: JSON.stringify({ data }),
    }),

  createRecordsBulk: (tenantId: string, collectionId: string, records: Array<Record<string, any>>) =>
    fetchAPI<ApiCollectionRecord[]>(`/api/tenants/${tenantId}/collections/${collectionId}/records/bulk`, {
      method: 'POST',
      body: JSON.stringify({ records }),
    }),

  queryRecords: (tenantId: string, collectionId: string, filters: Record<string, any>) =>
    fetchAPI<ApiCollectionRecord[]>(`/api/tenants/${tenantId}/collections/${collectionId}/records/query`, {
      method: 'POST',
      body: JSON.stringify({ filters }),
    }),

  getRecord: (tenantId: string, collectionId: string, recordId: string) =>
    fetchAPI<ApiCollectionRecord>(`/api/tenants/${tenantId}/collections/${collectionId}/records/${recordId}`),

  updateRecord: (tenantId: string, collectionId: string, recordId: string, data: Record<string, any>) =>
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
