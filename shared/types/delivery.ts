/**
 * Document Delivery Types
 * Configurable delivery destinations, payloads, and audit records.
 */

export type DeliveryDestinationType = 'email' | 'webhook' | 'cloud_storage';

export type DeliveryStatus = 'pending' | 'processing' | 'delivered' | 'failed' | 'retry';

export interface EmailDeliveryConfig {
  to: string;
  subject?: string;
  body?: string;
  attachDocuments?: boolean;
  recipientName?: string;
}

export interface WebhookDeliveryConfig {
  url: string;
  headers?: Record<string, string>;
  secret?: string;
  includeDocumentUrls?: boolean;
  includeDocumentBase64?: boolean;
}

export interface CloudStorageDeliveryConfig {
  bucket: string;
  region?: string;
  endpoint?: string;
  pathPrefix?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export interface DestinationConfigMap {
  email: EmailDeliveryConfig;
  webhook: WebhookDeliveryConfig;
  cloudStorage: CloudStorageDeliveryConfig;
}

export interface EmailDestination {
  id: string;
  type: 'email';
  name?: string;
  enabled?: boolean;
  config: EmailDeliveryConfig;
}

export interface WebhookDestination {
  id: string;
  type: 'webhook';
  name?: string;
  enabled?: boolean;
  config: WebhookDeliveryConfig;
}

export interface CloudStorageDestination {
  id: string;
  type: 'cloud_storage';
  name?: string;
  enabled?: boolean;
  config: CloudStorageDeliveryConfig;
}

export type DeliveryDestination =
  | EmailDestination
  | WebhookDestination
  | CloudStorageDestination;

export interface DeliveryAuditLogEntry {
  timestamp: string;
  attempt: number;
  status: DeliveryStatus;
  durationMs?: number;
  responseCode?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface DocumentDeliveryRecord {
  id: string;
  runId: string;
  workflowId: string;
  tenantId: string | null;
  destinationType: DeliveryDestinationType;
  destinationConfig: EmailDeliveryConfig | WebhookDeliveryConfig | CloudStorageDeliveryConfig;
  status: DeliveryStatus;
  attempts: number;
  maxAttempts: number;
  lastAttemptAt: Date | null;
  nextAttemptAt: Date | null;
  deliveredAt: Date | null;
  lastError: string | null;
  auditLog: DeliveryAuditLogEntry[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
