import { afterEach, describe, expect, it, vi } from "vitest";

import { FetchApiError, fetchAPI } from "@/lib/vault-api";

describe("fetchAPI status-bearing errors", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retains both HTTP status and the server's exact named Section message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify({ message: 'Section "Assets" cannot be empty' }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    ));

    const rejection = fetchAPI("/api/workflows/workflow-1/pages/reorder", {
      method: "PUT",
      body: JSON.stringify({ pages: [] }),
    });

    await expect(rejection).rejects.toMatchObject({
      name: "FetchApiError",
      status: 409,
      message: 'Section "Assets" cannot be empty',
    });
    await rejection.catch((error: unknown) => {
      expect(error).toBeInstanceOf(FetchApiError);
    });
  });
});
