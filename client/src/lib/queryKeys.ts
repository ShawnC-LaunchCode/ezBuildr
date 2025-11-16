/**
 * Centralized TanStack Query key factory
 * Ensures consistent cache invalidation and query patterns across the application
 *
 * Usage:
 * - Use these keys in useQuery and useMutation hooks
 * - Invalidate queries using queryClient.invalidateQueries(queryKeys.surveys.all())
 */

export const queryKeys = {
  all: () => ['queries'] as const,

  // Projects
  projects: {
    all: () => ['projects'] as const,
    list: () => [...queryKeys.projects.all(), 'list'] as const,
    detail: (id: string) => [...queryKeys.projects.all(), 'detail', id] as const,
    workflows: (id: string) => [...queryKeys.projects.all(), id, 'workflows'] as const,
  },

  // Workflows
  workflows: {
    all: () => ['workflows'] as const,
    list: () => [...queryKeys.workflows.all(), 'list'] as const,
    detail: (id: string) => [...queryKeys.workflows.all(), 'detail', id] as const,
    sections: (id: string) => [...queryKeys.workflows.all(), id, 'sections'] as const,
    variables: (id: string) => [...queryKeys.workflows.all(), id, 'variables'] as const,
    steps: (id: string) => [...queryKeys.workflows.all(), id, 'steps'] as const,
  },

  // Templates
  templates: {
    all: () => ['templates'] as const,
    list: () => [...queryKeys.templates.all(), 'list'] as const,
    detail: (id: string) => [...queryKeys.templates.all(), 'detail', id] as const,
    shared: () => [...queryKeys.templates.all(), 'shared'] as const,
  },

  // User
  user: {
    all: () => ['user'] as const,
    detail: () => [...queryKeys.user.all(), 'detail'] as const,
    preferences: () => [...queryKeys.user.all(), 'preferences'] as const,
  },

  // Admin
  admin: {
    all: () => ['admin'] as const,
    users: () => [...queryKeys.admin.all(), 'users'] as const,
    userDetail: (id: string) => [...queryKeys.admin.all(), 'users', id] as const,
  },
} as const;
