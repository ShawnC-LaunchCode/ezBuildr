import { BlockContext, ExternalSendResult } from "@shared/types/blocks";

export interface DestinationAdapter {
    send(config: Record<string, any>, payload: any, headers: Record<string, string>, context: BlockContext): Promise<ExternalSendResult>;
}
