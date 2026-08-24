// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invalidate: vi.fn(),
  sectionList: vi.fn(),
  sectionCreate: vi.fn(),
  sectionUpdate: vi.fn(),
  sectionDelete: vi.fn(),
  pageReorder: vi.fn(),
  versionRestore: vi.fn(),
  emit: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({
    invalidateQueries: mocks.invalidate,
    cancelQueries: vi.fn(),
    getQueryData: vi.fn(),
    setQueryData: vi.fn(),
  }),
}));

vi.mock("@/lib/vault-api", () => ({
  sectionAPI: {
    list: mocks.sectionList,
    create: mocks.sectionCreate,
    update: mocks.sectionUpdate,
    delete: mocks.sectionDelete,
  },
  pageAPI: { reorder: mocks.pageReorder },
  versionAPI: { restore: mocks.versionRestore },
}));

vi.mock("@/lib/devpanelBus", () => ({
  DevPanelBus: { emitWorkflowUpdate: mocks.emit },
}));

import { useReorderPages } from "../../../client/src/hooks/api/usePages";
import {
  useCreateSection,
  useDeleteSection,
  useSections,
  useUpdateSection,
} from "../../../client/src/hooks/api/useSections";
import { useRestoreVersion } from "../../../client/src/hooks/api/useVersions";

interface QueryConfig {
  queryKey: readonly string[];
  enabled: boolean;
  queryFn: () => Promise<unknown>;
}

interface MutationConfig<TVariables> {
  mutationFn: (variables: TVariables) => Promise<unknown>;
  onSuccess?: (data: unknown, variables: TVariables) => Promise<void>;
  onSettled?: (data: unknown, error: unknown, variables: TVariables) => Promise<void>;
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) { mock.mockReset(); }
  mocks.invalidate.mockResolvedValue(undefined);
  mocks.sectionList.mockResolvedValue([]);
  mocks.sectionCreate.mockResolvedValue({ id: "section-1" });
  mocks.sectionUpdate.mockResolvedValue({ id: "section-1" });
  mocks.sectionDelete.mockResolvedValue(undefined);
  mocks.pageReorder.mockResolvedValue({ message: "ok", affectedSkipRules: [] });
  mocks.versionRestore.mockResolvedValue(undefined);
});

describe("Section query hooks", () => {
  it("uses an active workflow-scoped query key", async () => {
    const config = useSections("workflow-1") as unknown as QueryConfig;
    expect(config.queryKey).toEqual(["sections", "workflow-1"]);
    expect(config.enabled).toBe(true);
    await config.queryFn();
    expect(mocks.sectionList).toHaveBeenCalledWith("workflow-1");

    const disabled = useSections(undefined) as unknown as QueryConfig;
    expect(disabled.enabled).toBe(false);
  });

  it("creates with the exact payload and invalidates Sections plus Pages", async () => {
    type Variables = { workflowId: string; title: string; pageIds: string[] };
    const config = useCreateSection() as unknown as MutationConfig<Variables>;
    const variables = { workflowId: "workflow-1", title: "Assets", pageIds: ["page-1"] };
    await config.mutationFn(variables);
    await config.onSuccess?.({}, variables);

    expect(mocks.sectionCreate).toHaveBeenCalledWith("workflow-1", { title: "Assets", pageIds: ["page-1"] });
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["sections", "workflow-1"] });
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["pages", "workflow-1"] });
    expect(mocks.emit).toHaveBeenCalledOnce();
  });

  it("updates with editable fields only and invalidates Sections only", async () => {
    type Variables = { id: string; workflowId: string; title: string; description: string | null };
    const config = useUpdateSection() as unknown as MutationConfig<Variables>;
    const variables = { id: "section-1", workflowId: "workflow-1", title: "Assets", description: null };
    await config.mutationFn(variables);
    await config.onSuccess?.({}, variables);

    expect(mocks.sectionUpdate).toHaveBeenCalledWith("section-1", { title: "Assets", description: null });
    expect(mocks.invalidate).toHaveBeenCalledTimes(1);
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["sections", "workflow-1"] });
    expect(mocks.emit).toHaveBeenCalledOnce();
  });

  it("deletes and invalidates Sections plus Pages", async () => {
    type Variables = { id: string; workflowId: string };
    const config = useDeleteSection() as unknown as MutationConfig<Variables>;
    const variables = { id: "section-1", workflowId: "workflow-1" };
    await config.mutationFn(variables);
    await config.onSuccess?.({}, variables);

    expect(mocks.sectionDelete).toHaveBeenCalledWith("section-1");
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["sections", "workflow-1"] });
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["pages", "workflow-1"] });
    expect(mocks.emit).toHaveBeenCalledOnce();
  });

  it("invalidates Sections after a reorder authorizes empty-Section deletion", async () => {
    type Variables = {
      workflowId: string;
      pages: Array<{ id: string; order: number; sectionId: string | null }>;
      deleteEmptySectionIds?: string[];
    };
    const config = useReorderPages() as unknown as MutationConfig<Variables>;
    const variables = {
      workflowId: "workflow-1",
      pages: [{ id: "page-1", order: 1, sectionId: null }],
      deleteEmptySectionIds: ["section-1"],
    };
    await config.onSettled?.({}, null, variables);

    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["pages", "workflow-1"] });
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["sections", "workflow-1"] });
  });

  it("invalidates Sections when a version restore replaces the graph", async () => {
    type Variables = { workflowId: string; versionId: string };
    const config = useRestoreVersion() as unknown as MutationConfig<Variables>;
    const variables = { workflowId: "workflow-1", versionId: "version-1" };
    await config.onSuccess?.({}, variables);

    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["sections", "workflow-1"] });
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["pages", "workflow-1"] });
  });
});
