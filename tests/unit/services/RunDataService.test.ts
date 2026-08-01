import { describe, expect, it } from "vitest";

import { RunDataService, toAliasKeyed } from "../../../server/services/workflow-runs/RunDataService";

describe("RunDataService", () => {
  const steps = [
    { id: "step-name", alias: "clientName", type: "short_text" as const, sectionId: "section-1", isVirtual: false },
    { id: "step-age", alias: null, type: "number" as const, sectionId: "section-1", isVirtual: false },
  ];

  it("keeps step-id data canonical while deriving an alias-keyed document view", () => {
    const service = new RunDataService();
    const data = {
      "step-name": "Ada",
      "step-age": 37,
      computedTotal: 42,
    };

    const result = service.fromStepIdData(data, steps);

    expect(result.byStepId).toEqual(data);
    expect(result.byAlias).toEqual({
      clientName: "Ada",
      "step-age": 37,
      computedTotal: 42,
    });
  });

  it("maps known step ids to aliases and passes transform outputs through", () => {
    expect(toAliasKeyed({ "step-name": "Ada", computedTotal: 42 }, steps)).toEqual({
      clientName: "Ada",
      computedTotal: 42,
    });
  });
});
