import { BlockContext, ExternalSendResult } from "@shared/types/blocks";

export interface DestinationAdapter {
    send(config: Record<string, unknown>, payload: unknown, headers: Record<string, string>, context: BlockContext): Promise<ExternalSendResult>;
}
