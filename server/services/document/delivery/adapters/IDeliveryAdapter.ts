import type { RunDocumentDelivery, WorkflowRun } from '@shared/schema';

export interface GeneratedDocumentItem {
  fileName: string;
  storageKey: string;
  mimeType?: string | null;
  fileSize?: number | null;
  fileUrl: string;
}

export interface DeliveryAdapterContext {
  delivery: RunDocumentDelivery;
  documents: GeneratedDocumentItem[];
  stepValues: Record<string, unknown>;
  workflowRun: WorkflowRun;
}

export interface DeliveryAdapterResult {
  success: boolean;
  responseCode?: number;
  durationMs?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface DeliveryAdapter {
  deliver(context: DeliveryAdapterContext): Promise<DeliveryAdapterResult>;
}
