// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { sectionAPI } from "../../../client/src/lib/vault-api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sectionAPI", () => {
  it("uses the strict workflow and Section endpoint contracts", async () => {
    const responses = [
      new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }),
      new Response(JSON.stringify({ id: "section-1" }), { status: 201, headers: { "Content-Type": "application/json" } }),
      new Response(JSON.stringify({ id: "section-1" }), { status: 200, headers: { "Content-Type": "application/json" } }),
      new Response(null, { status: 204 }),
    ];
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(responses.shift()));
    vi.stubGlobal("fetch", fetchMock);

    await sectionAPI.list("workflow-1");
    await sectionAPI.create("workflow-1", { title: "Assets", pageIds: ["page-1"] });
    await sectionAPI.update("section-1", { title: "Property" });
    await sectionAPI.delete("section-1");

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/workflows/workflow-1/sections", expect.objectContaining({
      credentials: "include",
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/workflows/workflow-1/sections", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ title: "Assets", pageIds: ["page-1"] }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/sections/section-1", expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({ title: "Property" }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/sections/section-1", expect.objectContaining({
      method: "DELETE",
    }));
  });
});
