import { ApiBlock, ApiTransformBlock, BlockPhase } from "@/lib/vault-api";

export function mapTransformToBlock(
    transformBlocks: ApiTransformBlock[],
    sectionId: string
): ApiBlock[] {
    return transformBlocks
        .filter((tb) => tb.sectionId === sectionId)
        .map((tb) => ({
            id: tb.id,
            workflowId: tb.workflowId,
            sectionId: tb.sectionId ?? null,
            type: "js",
            phase: tb.phase as BlockPhase,
            config: {
                name: tb.name,
                language: tb.language,
                code: tb.code,
                inputKeys: tb.inputKeys,
                outputKey: tb.outputKey,
                timeoutMs: tb.timeoutMs,
            },
            enabled: tb.enabled,
            order: tb.order,
            createdAt: tb.createdAt,
            updatedAt: tb.updatedAt,
        }));
}
