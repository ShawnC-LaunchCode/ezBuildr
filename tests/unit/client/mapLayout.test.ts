import { describe, expect, it } from "vitest";

import { computeMapLayout } from "@/components/builder/map/mapLayout";
import { buildWorkflowMap } from "@shared/workflowMap";

import {
  linearThreePages,
  workflowWithFinalDocuments,
} from "../../fixtures/workflowMap";

describe("computeMapLayout (MAP-4)", () => {
  it("stacks the spine (pages + terminal) top-to-bottom in order", () => {
    const { nodes, edges } = buildWorkflowMap(linearThreePages());
    const positions = computeMapLayout(nodes, edges);

    const yPageA = positions["page-a"].y;
    const yPageB = positions["page-b"].y;
    const yPageC = positions["page-c"].y;
    const yTerminal = positions.__complete__.y;

    expect(yPageA).toBeLessThan(yPageB);
    expect(yPageB).toBeLessThan(yPageC);
    expect(yPageC).toBeLessThan(yTerminal);

    // The spine shares one x coordinate — it's a vertical line, not a grid.
    expect(positions["page-a"].x).toBe(positions["page-b"].x);
    expect(positions["page-b"].x).toBe(positions["page-c"].x);
  });

  it("places a final_documents node beside the page whose sequential edge leads to it, not on the spine", () => {
    const { nodes, edges } = buildWorkflowMap(workflowWithFinalDocuments());
    const positions = computeMapLayout(nodes, edges);

    const pagePosition = positions["page-a"];
    const docPosition = positions["step-doc"];

    expect(docPosition.x).not.toBe(pagePosition.x);
    expect(docPosition.y).toBe(pagePosition.y);
  });

  it("is a pure function of its inputs — the same graph always yields the same positions", () => {
    const { nodes, edges } = buildWorkflowMap(linearThreePages());
    expect(computeMapLayout(nodes, edges)).toEqual(computeMapLayout(nodes, edges));
  });
});
