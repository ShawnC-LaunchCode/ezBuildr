
import { WorkflowDiff, QualityScore } from "@shared/types/ai";

export interface Message {
    role: 'user' | 'assistant';
    content: string;
    diff?: WorkflowDiff;
    timestamp: number;
    status?: 'pending' | 'applied' | 'discarded';
    qualityScore?: QualityScore;
}

export interface OperationMeta {
    aiProvider?: string;
    aiModel?: string;
    requestDescription?: string;
}

export interface UploadedFile {
    name: string;
    content: string;
}

export interface ExtractTextResponse {
    text?: string;
    message?: string;
}
