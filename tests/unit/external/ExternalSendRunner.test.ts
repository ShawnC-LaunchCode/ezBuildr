import { ExternalSendRunner } from "../../../server/lib/external/ExternalSendRunner";
import { externalDestinationService } from "../../../server/services/ExternalDestinationService";
import type { ExternalSendBlockConfig, BlockContext } from "@shared/types/blocks";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock db to prevent connection
vi.mock("../../../server/db", () => ({
    db: {},
}));

// Mock ExternalDestinationService
vi.mock("../../../server/services/ExternalDestinationService", () => ({
    externalDestinationService: {
        getDestination: vi.fn(),
    },
}));

// Mock global fetch
global.fetch = vi.fn();

describe("ExternalSendRunner", () => {
    let runner: ExternalSendRunner;
    const mockContext: BlockContext = {
        workflowId: "wf-1",
        runId: "run-1",
        phase: "onNext",
        sectionId: "sec-1",
        data: {
            user: {
                name: "Alice",
                email: "alice@example.com"
            },
            env: "staging"
        }
    };

    beforeEach(() => {
        // Reset singleton instance or create new one if possible. 
        // The class exports a singleton but we can instantiate strictly for testing if exported class
        runner = new ExternalSendRunner();
        vi.clearAllMocks();
    });

    it("should resolve destination and execute send", async () => {
        const config: ExternalSendBlockConfig = {
            destinationId: "dest-1",
            payloadMappings: [
                { key: "fullName", value: "{{ user.name }}" },
                { key: "contactEmail", value: "{{ user.email }}" },
                { key: "source", value: "vault-logic" }
            ]
        };

        const mockDest = {
            id: "dest-1",
            workspaceId: "ws-1",
            type: "webhook",
            name: "My Webhook",
            config: { url: "https://example.com/hook", method: "POST" }
        };

        (externalDestinationService.getDestination as any).mockResolvedValue(mockDest);

        // Mock fetch response
        (global.fetch as any).mockResolvedValue({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ success: true })
        });

        const result = await runner.execute(config, mockContext, "tenant-1", "live");

        expect(result.success).toBe(true);
        expect(result.statusCode).toBe(200);
        expect(global.fetch).toHaveBeenCalledWith(
            "https://example.com/hook",
            expect.objectContaining({
                method: "POST",
                headers: expect.objectContaining({
                    "Content-Type": "application/json"
                })
            })
        );
    });

    it("should block execution in preview mode", async () => {
        const config: ExternalSendBlockConfig = {
            destinationId: "dest-1",
            payloadMappings: []
        };

        // Even if dest exists
        (externalDestinationService.getDestination as any).mockResolvedValue({
            id: "dest-1",
            type: "webhook",
            name: "Test",
            config: { url: "https://example.com", method: "POST" }
        });

        const result = await runner.execute(config, mockContext, "tenant-1", "preview");

        expect(result.success).toBe(true);
        expect(result.simulated).toBe(true);
        // Adapter should NOT be called
        // We can't easily check instance calls without capturing the instance, but we can check result
    });

    it("should fail if destination not found", async () => {
        const config: ExternalSendBlockConfig = { destinationId: "missing", payloadMappings: [] };
        (externalDestinationService.getDestination as any).mockResolvedValue(null);

        const result = await runner.execute(config, mockContext, "tenant-1", "live");
        expect(result.success).toBe(false);
        expect(result.error).toContain("Destination not found");
    });
});
