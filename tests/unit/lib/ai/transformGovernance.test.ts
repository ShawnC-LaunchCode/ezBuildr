import { beforeEach, describe, expect, it, vi } from "vitest";

import { generateTransforms } from "../../../../server/lib/ai/transformGenerator";
import { reviseTransforms } from "../../../../server/lib/ai/transformRevision";
import { alignSchema } from "../../../../server/lib/transforms/schemaAlign";
import { aiUsageRepository } from "../../../../server/repositories/AiUsageRepository";
import { ProviderFactory } from "../../../../server/services/ai/providers/ProviderFactory";

import type { AiUsage } from "../../../../shared/schema/ai";
import type { AiUsageRepository } from "../../../../server/repositories/AiUsageRepository";
import type { IAIProvider } from "../../../../server/services/ai/providers/types";
import type { TaskType } from "../../../../server/services/ai/types";
import type { MockInstance } from "vitest";

describe("transform AI governance (AISL-5)", () => {
  const generateResponse = vi.fn<IAIProvider["generateResponse"]>();
  let recordUsage: MockInstance<AiUsageRepository["recordUsage"]>;
  let getTokenUsageSince: MockInstance<AiUsageRepository["getTokenUsageSince"]>;

  beforeEach(() => {
    vi.spyOn(ProviderFactory, "createProvider").mockReturnValue({
      generateResponse,
    } as unknown as IAIProvider);
    getTokenUsageSince = vi.spyOn(aiUsageRepository, "getTokenUsageSince")
      .mockResolvedValue(0);
    vi.spyOn(aiUsageRepository, "getCostUsdSince")
      .mockResolvedValue(0);
    recordUsage = vi.spyOn(aiUsageRepository, "recordUsage")
      .mockResolvedValue({} as AiUsage);
  });

  const cases: Array<{
    taskType: TaskType;
    responseText: string;
    invoke: (tenantId: string) => Promise<unknown>;
  }> = [
    {
      taskType: "transform_generation",
      responseText: JSON.stringify({ transforms: [] }),
      invoke: (tenantId) => generateTransforms({
        workflowContext: { workflow: "untrusted" },
        description: "Generate transforms",
        currentTransforms: [],
      }, tenantId),
    },
    {
      taskType: "transform_revision",
      responseText: JSON.stringify({ transforms: [], diff: {}, explanation: [] }),
      invoke: (tenantId) => reviseTransforms({
        workflowContext: { workflow: "untrusted" },
        userRequest: "Revise transforms",
        currentTransforms: [],
      }, tenantId),
    },
    {
      taskType: "transform_schema_align",
      responseText: JSON.stringify({ issues: [], missingTransforms: [] }),
      invoke: (tenantId) => alignSchema({
        transforms: [],
        documents: [{ document: "untrusted" }],
        workflowVariables: [{ variable: "untrusted" }],
      }, tenantId),
    },
  ];

  it.each(cases)("records $taskType usage for the requesting tenant", async ({
    taskType,
    responseText,
    invoke,
  }) => {
    const tenantId = `tenant-${taskType}`;
    generateResponse.mockResolvedValue({
      text: responseText,
      usage: { inputTokens: 120, outputTokens: 30 },
    });

    await invoke(tenantId);

    expect(generateResponse).toHaveBeenCalledWith(
      expect.stringContaining("<<<UNTRUSTED_INPUT"),
      taskType,
      expect.any(String),
    );
    expect(getTokenUsageSince).toHaveBeenCalledWith(tenantId, expect.any(Date));
    expect(recordUsage).toHaveBeenCalledWith(expect.objectContaining({
      tenantId,
      taskType,
      inputTokens: 120,
      outputTokens: 30,
    }));
  });
});
