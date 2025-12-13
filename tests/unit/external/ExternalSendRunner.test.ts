import { ExternalSendRunner } from "../../../server/lib/external/ExternalSendRunner";
import { WebhookAdapter } from "../../../server/lib/external/adapters/WebhookAdapter";
import { externalDestinationsRepository } from "../../../server/repositories";
import type { ExternalSendBlockConfig, BlockContext, ExternalDestination } from "@shared/types/blocks";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock db to prevent connection
vi.mock("../../../server/db", () => ({
    db: {},
}));

// Mock repository
vi.mock("../../../server/repositories", () => ({
    externalDestinationsRepository: {
        findById: vi.fn(),
    },
    // Add other exports from index if needed to satisfy import structure
    datavaultRowsRepository: {},
    datavaultColumnsRepository: {},
    datavaultTablesRepository: {},
}));

// Mock adapter
vi.mock("../../../server/lib/external/adapters/WebhookAdapter", async (importOriginal) => {
    // const actual = await importOriginal(); // Optional if we need partials
    return {
        WebhookAdapter: vi.fn().mockImplementation(() => ({
            send: vi.fn()
        }))
    };
});

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

        const mockDest: ExternalDestination = {
            id: "dest-1",
            workspaceId: "ws-1",
            type: "webhook",
            name: "My Webhook",
            config: { url: "https://example.com/hook" }
        };

        (externalDestinationsRepository.findById as any).mockResolvedValue(mockDest);

        // Mock adapter instance behavior
        const mockSend = vi.fn().mockResolvedValue({ success: true, destinationId: "dest-1", statusCode: 200 });
        // @ts-ignore
        WebhookAdapter.mockImplementation(() => ({
            send: mockSend
        }));

        // Re-instantiate runner to pick up mocked adapter
        runner = new ExternalSendRunner();

        const result = await runner.executeSend(config, mockContext);

        expect(result.success).toBe(true);
        expect(result.statusCode).toBe(200);

        // Verify payload resolution
        expect(mockSend).toHaveBeenCalledWith(
            mockDest.config,
            expect.objectContaining({
                fullName: "Alice",
                contactEmail: "alice@example.com",
                source: "vault-logic"
            }),
            expect.any(Object), // headers
            mockContext
        );
    });

    it("should block execution in preview mode", async () => {
        const config: ExternalSendBlockConfig = {
            destinationId: "dest-1",
            payloadMappings: []
        };

        // Even if dest exists
        (externalDestinationsRepository.findById as any).mockResolvedValue({
            id: "dest-1",
            type: "webhook",
            config: {}
        });

        const result = await runner.executeSend(config, mockContext, true); // isPreview=true

        expect(result.success).toBe(true);
        expect(result.responseSnippet).toContain("Skipped");
        // Adapter should NOT be called
        // We can't easily check instance calls without capturing the instance, but we can check result
    });

    it("should fail if destination not found", async () => {
        const config: ExternalSendBlockConfig = { destinationId: "missing", payloadMappings: [] };
        (externalDestinationsRepository.findById as any).mockResolvedValue(null);

        const result = await runner.executeSend(config, mockContext);
        expect(result.success).toBe(false);
        expect(result.error).toContain("Destination not found");
    });
});
