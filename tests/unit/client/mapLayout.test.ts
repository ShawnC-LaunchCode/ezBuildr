import { describe, expect, it } from "vitest";

import { computeMapLayout } from "@/components/builder/map/mapLayout";
import { buildWorkflowMap } from "@shared/workflowMap";

import {
  linearThreeSections,
  workflowWithFinalDocuments,
} from "../../fixtures/workflowMap";

describe("computeMapLayout (MAP-4)", () => {
  it("stacks the spine (sections + terminal) top-to-bottom in order", () => {
    const { nodes, edges } = buildWorkflowMap(linearThreeSections());
    const positions = computeMapLayout(nodes, edges);

    const ySectionA = positions["section-a"].y;
    const ySectionB = positions["section-b"].y;
    const ySectionC = positions["section-c"].y;
    const yTerminal = positions.__complete__.y;

    expect(ySectionA).toBeLessThan(ySectionB);
    expect(ySectionB).toBeLessThan(ySectionC);
    expect(ySectionC).toBeLessThan(yTerminal);

    // The spine shares one x coordinate — it's a vertical line, not a grid.
    expect(positions["section-a"].x).toBe(positions["section-b"].x);
    expect(positions["section-b"].x).toBe(positions["section-c"].x);
  });

  it("places a final_documents node beside the section whose sequential edge leads to it, not on the spine", () => {
    const { nodes, edges } = buildWorkflowMap(workflowWithFinalDocuments());
    const positions = computeMapLayout(nodes, edges);

    const sectionPosition = positions["section-a"];
    const docPosition = positions["step-doc"];

    expect(docPosition.x).not.toBe(sectionPosition.x);
    expect(docPosition.y).toBe(sectionPosition.y);
  });

  it("is a pure function of its inputs — the same graph always yields the same positions", () => {
    const { nodes, edges } = buildWorkflowMap(linearThreeSections());
    expect(computeMapLayout(nodes, edges)).toEqual(computeMapLayout(nodes, edges));
  });
});
