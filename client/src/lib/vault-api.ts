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
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    credentials: "include", // Include cookies for auth
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
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
  createdAt: string;
}

export const sectionAPI = {
  list: (workflowId: string) =>
    fetchAPI<ApiSection[]>(`/api/workflows/${workflowId}/sections`),

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

export type StepType = "short_text" | "long_text" | "multiple_choice" | "radio" | "yes_no" | "date_time" | "file_upload";

export interface ApiStep {
  id: string;
  sectionId: string;
  type: StepType;
  title: string;
  description: string | null;
  required: boolean;
  options: any; // JSON - for choice types
  alias: string | null; // Optional variable name for logic/blocks
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
  name: string;
  language: TransformBlockLanguage;
  code: string;
  inputKeys: string[];
  outputKey: string;
  enabled: boolean;
  order: number;
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

export const runAPI = {
  create: (workflowId: string, data: { participantId?: string; metadata?: any }, queryParams?: Record<string, string>) => {
    const params = queryParams ? `?${new URLSearchParams(queryParams)}` : "";
    return fetchAPI<ApiRun>(`/api/workflows/${workflowId}/runs${params}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  get: (id: string) =>
    fetchAPI<ApiRun>(`/api/runs/${id}`),

  getWithValues: (id: string) =>
    fetchAPI<ApiRun & { values: ApiStepValue[] }>(`/api/runs/${id}/values`),

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
    fetchAPI<ApiRun>(`/api/runs/${runId}/complete`, {
      method: "PUT",
    }),

  list: (workflowId: string) =>
    fetchAPI<ApiRun[]>(`/api/workflows/${workflowId}/runs`),
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
