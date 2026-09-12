import { vi } from 'vitest';

/**
 * Mock Factory for Repositories
 *
 * Provides factory functions to create mock implementations of repositories
 * with customizable behavior per-test.
 *
 * Usage:
 * ```typescript
 * import { mockWorkflowRepository } from '../mocks/repositories';
 *
 * it('should create workflow', async () => {
 *   const mockRepo = mockWorkflowRepository({
 *     create: vi.fn().mockResolvedValue({ id: '123', title: 'Test' }),
 *   });
 *
 *   const service = new WorkflowService(mockRepo);
 *   const workflow = await service.createWorkflow({...});
 *
 *   expect(mockRepo.create).toHaveBeenCalled();
 * });
 * ```
 */

/**
 * Mock Workflow Repository
 */
export function mockWorkflowRepository(overrides = {}) {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByProjectId: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    delete: vi.fn(),
    findAll: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

/**
 * Mock Page Repository
 */
export function mockPageRepository(overrides = {}) {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByWorkflowId: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    delete: vi.fn(),
    reorder: vi.fn(),
    ...overrides,
  };
}

/**
 * Mock Step Repository
 */
export function mockStepRepository(overrides = {}) {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByPageId: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    delete: vi.fn(),
    reorder: vi.fn(),
    validateAlias: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

/**
 * Mock Run Repository
 */
export function mockRunRepository(overrides = {}) {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByToken: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findByWorkflowId: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

/**
 * Mock Project Repository
 */
export function mockProjectRepository(overrides = {}) {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByTenantId: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
}

/**
 * Mock User Repository
 */
export function mockUserRepository(overrides = {}) {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByEmail: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findByTenantId: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

/**
 * Mock DataVault Tables Repository
 */
export function mockDatavaultTablesRepository(overrides = {}) {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByDatabaseId: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    updateColumns: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
}

/**
 * Mock DataVault Rows Repository
 */
export function mockDatavaultRowsRepository(overrides = {}) {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByTableId: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    delete: vi.fn(),
    bulkCreate: vi.fn(),
    ...overrides,
  };
}
