/**
 * Production DocuSign e-signature provider.
 *
 * Uses DocuSign's OAuth JWT grant and REST API directly. Keeping the HTTP
 * boundary injectable makes the provider testable without credentials while
 * the default path still uses the repository's SSRF-hardened request helper.
 */

import * as crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import jwt from 'jsonwebtoken';

import { logger } from '../../logger';
import { resolveBindingToString } from '../document/MappingInterpreter';
import { safeFetch } from '../../utils/safeFetch';
import {
  type IEsignProvider,
  type CreateEnvelopeRequest,
  type CreateEnvelopeResponse,
  type EnvelopeStatusResponse,
  type SignatureEvent,
  EsignConfigError,
  EsignApiError,
} from './EsignProvider';

export interface DocusignConfig {
  integrationKey: string;
  userId: string;
  accountId: string;
  privateKey: string;
  basePath: string;
  oauthBasePath: string;
  webhookSecret?: string;
}

export type DocusignHttpRequest = (url: string, init?: RequestInit) => Promise<Response>;

interface DocusignEnvelopeResponse {
  envelopeId?: string;
  status?: string;
  statusDateTime?: string;
  completedDateTime?: string;
}

interface DocusignRecipientViewResponse {
  url?: string;
}

interface DocusignTextTab {
  documentId: string;
  pageNumber: string;
  tabLabel: string;
  value: string;
  locked: string;
}

interface DocusignSignHereTab {
  documentId: string;
  pageNumber: string;
  xPosition: string;
  yPosition: string;
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function normalizePrivateKey(value: string): string {
  // Railway and similar secret stores commonly persist PEM newlines escaped.
  return value.includes('\\n') ? value.replace(/\\n/g, '\n') : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

export class DocusignProvider implements IEsignProvider {
  readonly name = 'docusign';

  private readonly config: DocusignConfig;
  private readonly httpRequest: DocusignHttpRequest;
  private accessToken?: string;
  private tokenExpiry?: Date;

  constructor(config: DocusignConfig, httpRequest: DocusignHttpRequest = safeFetch) {
    this.validateConfig(config);
    this.config = {
      ...config,
      privateKey: normalizePrivateKey(config.privateKey),
      basePath: normalizeBaseUrl(config.basePath),
      oauthBasePath: normalizeBaseUrl(config.oauthBasePath),
    };
    this.httpRequest = httpRequest;
  }

  private validateConfig(config: DocusignConfig): void {
    const required: Array<keyof DocusignConfig> = [
      'integrationKey',
      'userId',
      'accountId',
      'privateKey',
      'basePath',
      'oauthBasePath',
    ];
    const missing = required.filter((key) => !config[key]);
    if (missing.length > 0) {
      throw new EsignConfigError(
        `Missing required DocuSign configuration: ${missing.join(', ')}`,
        'docusign'
      );
    }

    for (const [name, value] of [
      ['basePath', config.basePath],
      ['oauthBasePath', config.oauthBasePath],
    ] as const) {
      let parsed: URL;
      try {
        parsed = new URL(value);
      } catch {
        throw new EsignConfigError(`Invalid DocuSign ${name}`, 'docusign');
      }
      if (parsed.protocol !== 'https:' && process.env.NODE_ENV !== 'test') {
        throw new EsignConfigError(`DocuSign ${name} must use HTTPS`, 'docusign');
      }
    }
  }

  private async getAccessToken(): Promise<string> {
    // Refresh one minute early so a token cannot expire during envelope work.
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry.getTime() > Date.now() + 60_000) {
      return this.accessToken;
    }
    await this.refreshAccessToken();
    if (!this.accessToken) {
      throw new EsignApiError('Failed to obtain DocuSign access token', 'docusign');
    }
    return this.accessToken;
  }

  private async refreshAccessToken(): Promise<void> {
    const oauthHost = new URL(this.config.oauthBasePath).host;
    const assertion = jwt.sign({ scope: 'signature impersonation' }, this.config.privateKey, {
      algorithm: 'RS256',
      issuer: this.config.integrationKey,
      subject: this.config.userId,
      audience: oauthHost,
      expiresIn: '1h',
    });
    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    });
    const response = await this.httpRequest(`${this.config.oauthBasePath}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const tokenBody = await this.readJson<unknown>(response);
    const token = isRecord(tokenBody) ? tokenBody : {};
    const accessToken = readString(token, 'access_token');
    const expiresInValue = token.expires_in;
    const expiresIn = typeof expiresInValue === 'number' ? expiresInValue : undefined;
    if (!response.ok || !accessToken) {
      const description = readString(token, 'error_description')
        ?? readString(token, 'error')
        ?? `HTTP ${response.status}`;
      throw new EsignApiError(`DocuSign JWT grant failed: ${description}`, 'docusign');
    }

    const lifetimeSeconds = Math.max(60, expiresIn ?? 3600);
    this.accessToken = accessToken;
    this.tokenExpiry = new Date(Date.now() + lifetimeSeconds * 1000);
  }

  async createEnvelope(request: CreateEnvelopeRequest): Promise<CreateEnvelopeResponse> {
    if (request.preview) {
      return {
        envelopeId: `preview_${Date.now()}`,
        signingUrl: '/preview/signature-simulation',
        status: 'created',
        metadata: { preview: true },
      };
    }

    if (!request.signer.email) {
      throw new EsignConfigError('DocuSign signer email is required', 'docusign');
    }
    if (!request.returnUrl) {
      throw new EsignConfigError('DocuSign embedded signing return URL is required', 'docusign');
    }

    try {
      const token = await this.getAccessToken();
      const envelopeDefinition = await this.buildEnvelopeDefinition(request);
      const envelopeResponse = await this.apiJson<DocusignEnvelopeResponse>(
        `/v2.1/accounts/${encodeURIComponent(this.config.accountId)}/envelopes`,
        token,
        { method: 'POST', body: JSON.stringify(envelopeDefinition) }
      );
      if (!envelopeResponse.envelopeId) {
        throw new EsignApiError('DocuSign envelope response did not include an envelopeId', 'docusign');
      }

      const signerName = request.signer.name == null || request.signer.name.trim() === ''
        ? request.signer.role
        : request.signer.name;
      const clientUserId = request.signer.signerId ?? `${request.runId}:${request.stepId}`;
      const view = await this.apiJson<DocusignRecipientViewResponse>(
        `/v2.1/accounts/${encodeURIComponent(this.config.accountId)}/envelopes/${encodeURIComponent(envelopeResponse.envelopeId)}/views/recipient`,
        token,
        {
          method: 'POST',
          body: JSON.stringify({
            authenticationMethod: 'none',
            clientUserId,
            email: request.signer.email,
            returnUrl: request.returnUrl,
            userName: signerName,
          }),
        }
      );
      if (!view.url) {
        throw new EsignApiError('DocuSign recipient view response did not include a URL', 'docusign');
      }
      const initialStatus = this.mapDocusignStatus(envelopeResponse.status ?? 'sent');

      return {
        envelopeId: envelopeResponse.envelopeId,
        signingUrl: view.url,
        status: initialStatus === 'expired' ? 'created' : initialStatus,
        metadata: {
          statusDateTime: envelopeResponse.statusDateTime,
          signerRole: request.signer.role,
        },
      };
    } catch (error: unknown) {
      if (error instanceof EsignApiError || error instanceof EsignConfigError) {
        throw error;
      }
      throw new EsignApiError(
        `Failed to create DocuSign envelope: ${error instanceof Error ? error.message : String(error)}`,
        'docusign'
      );
    }
  }

  private async buildEnvelopeDefinition(request: CreateEnvelopeRequest): Promise<Record<string, unknown>> {
    if (request.documents.length === 0) {
      throw new EsignConfigError('At least one document is required for DocuSign', 'docusign');
    }

    const documents = await Promise.all(request.documents.map(async (document, index) => {
      const file = await fs.readFile(document.filePath);
      const namedExtension = path.extname(document.name).slice(1);
      const pathExtension = path.extname(document.filePath).slice(1);
      const extension = namedExtension !== '' ? namedExtension : pathExtension !== '' ? pathExtension : 'pdf';
      return {
        documentBase64: file.toString('base64'),
        documentId: String(index + 1),
        fileExtension: extension,
        name: document.name,
      };
    }));

    const signerName = request.signer.name == null || request.signer.name.trim() === ''
      ? request.signer.role
      : request.signer.name;
    const clientUserId = request.signer.signerId ?? `${request.runId}:${request.stepId}`;
    return {
      emailSubject: request.message == null || request.message.trim() === ''
        ? 'Please sign this document'
        : request.message,
      documents,
      recipients: {
        signers: [{
          clientUserId,
          email: request.signer.email,
          name: signerName,
          recipientId: '1',
          roleName: request.signer.role,
          routingOrder: String(request.signer.routingOrder || 1),
          tabs: this.buildTabs(request.documents, request.variableData),
        }],
      },
      customFields: {
        textCustomFields: [
          { name: 'ezbuildrRunId', required: 'false', show: 'false', value: request.runId },
          { name: 'ezbuildrStepId', required: 'false', show: 'false', value: request.stepId },
        ],
      },
      status: 'sent',
      ...(request.expiresInDays
        ? {
          notification: {
            expirations: {
              expireAfter: String(request.expiresInDays),
              expireEnabled: 'true',
            },
          },
        }
        : {}),
    };
  }

  private buildTabs(
    documents: CreateEnvelopeRequest['documents'],
    variableData: Record<string, unknown>
  ): { signHereTabs: DocusignSignHereTab[]; textTabs: DocusignTextTab[] } {
    const signHereTabs: DocusignSignHereTab[] = [];
    const textTabs: DocusignTextTab[] = [];

    documents.forEach((document, index) => {
      const documentId = String(index + 1);
      signHereTabs.push({
        documentId,
        pageNumber: '1',
        xPosition: '100',
        yPosition: '200',
      });
      for (const [tabLabel, mapping] of Object.entries(document.mapping ?? {})) {
        textTabs.push({
          documentId,
          pageNumber: '1',
          tabLabel,
          value: resolveBindingToString(mapping, variableData),
          locked: 'true',
        });
      }
    });

    return { signHereTabs, textTabs };
  }

  async getEnvelopeStatus(envelopeId: string): Promise<EnvelopeStatusResponse> {
    try {
      const token = await this.getAccessToken();
      const envelope = await this.apiJson<DocusignEnvelopeResponse>(
        `/v2.1/accounts/${encodeURIComponent(this.config.accountId)}/envelopes/${encodeURIComponent(envelopeId)}`,
        token
      );
      return {
        envelopeId,
        status: this.mapDocusignStatus(envelope.status ?? 'created'),
        completedAt: envelope.completedDateTime ? new Date(envelope.completedDateTime) : undefined,
        metadata: envelope as Record<string, unknown>,
      };
    } catch (error: unknown) {
      if (error instanceof EsignApiError) { throw error; }
      throw new EsignApiError(
        `Failed to get DocuSign envelope status: ${error instanceof Error ? error.message : String(error)}`,
        'docusign'
      );
    }
  }

  async voidEnvelope(envelopeId: string, reason = 'Voided by ezBuildr'): Promise<void> {
    try {
      const token = await this.getAccessToken();
      await this.apiJson<Record<string, unknown>>(
        `/v2.1/accounts/${encodeURIComponent(this.config.accountId)}/envelopes/${encodeURIComponent(envelopeId)}`,
        token,
        { method: 'PUT', body: JSON.stringify({ status: 'voided', voidedReason: reason }) }
      );
    } catch (error: unknown) {
      if (error instanceof EsignApiError) { throw error; }
      throw new EsignApiError(
        `Failed to void DocuSign envelope: ${error instanceof Error ? error.message : String(error)}`,
        'docusign'
      );
    }
  }

  async downloadSignedDocuments(envelopeId: string): Promise<Buffer[]> {
    try {
      const token = await this.getAccessToken();
      const response = await this.httpRequest(
        `${this.config.basePath}/v2.1/accounts/${encodeURIComponent(this.config.accountId)}/envelopes/${encodeURIComponent(envelopeId)}/documents/combined`,
        { method: 'GET', headers: { authorization: `Bearer ${token}` } }
      );
      if (!response.ok) {
        throw new EsignApiError(`DocuSign signed-document download failed: HTTP ${response.status}`, 'docusign');
      }
      return [Buffer.from(await response.arrayBuffer())];
    } catch (error: unknown) {
      if (error instanceof EsignApiError) { throw error; }
      throw new EsignApiError(
        `Failed to download DocuSign documents: ${error instanceof Error ? error.message : String(error)}`,
        'docusign'
      );
    }
  }

  async verifyWebhookSignature(payload: unknown, signature: string): Promise<boolean> {
    if (!this.config.webhookSecret) {
      logger.error('[DocuSign] Webhook secret is not configured; rejecting webhook');
      return false;
    }
    if (!signature) {
      return false;
    }

    try {
      const rawPayload = Buffer.isBuffer(payload)
        ? payload
        : Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload));
      const expected = crypto
        .createHmac('sha256', this.config.webhookSecret)
        .update(rawPayload)
        .digest();
      const received = Buffer.from(signature, 'base64');
      return received.length === expected.length && crypto.timingSafeEqual(received, expected);
    } catch (error: unknown) {
      logger.error({ error }, '[DocuSign] Error verifying webhook signature');
      return false;
    }
  }

  async parseWebhookEvent(payload: unknown): Promise<SignatureEvent> {
    if (!isRecord(payload)) {
      throw new EsignApiError('Invalid DocuSign webhook payload', 'docusign');
    }
    const data = isRecord(payload.data) ? payload.data : undefined;
    const event = readString(payload, 'event') ?? (data ? readString(data, 'event') : undefined);
    const envelopeId = readString(payload, 'envelopeId') ?? (data ? readString(data, 'envelopeId') : undefined);
    if (!event || !envelopeId) {
      throw new EsignApiError('Invalid DocuSign webhook payload', 'docusign');
    }

    const eventTypeMap: Record<string, SignatureEvent['type']> = {
      'envelope-sent': 'sent',
      'recipient-delivered': 'viewed',
      'recipient-completed': 'signed',
      'envelope-completed': 'completed',
      'envelope-declined': 'declined',
      'envelope-voided': 'voided',
    };
    const generatedDateTime = readString(payload, 'generatedDateTime');
    return {
      type: eventTypeMap[event] ?? 'sent',
      envelopeId,
      timestamp: generatedDateTime ? new Date(generatedDateTime) : new Date(),
      data: payload,
    };
  }

  private mapDocusignStatus(status: string): EnvelopeStatusResponse['status'] {
    const normalized = status.toLowerCase();
    const known: EnvelopeStatusResponse['status'][] = [
      'created', 'sent', 'delivered', 'signed', 'completed', 'declined', 'voided', 'expired',
    ];
    return known.includes(normalized as EnvelopeStatusResponse['status'])
      ? normalized as EnvelopeStatusResponse['status']
      : 'created';
  }

  private async apiJson<T>(pathName: string, token: string, init: RequestInit = {}): Promise<T> {
    const response = await this.httpRequest(`${this.config.basePath}${pathName}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        ...init.headers,
      },
    });
    const body = await this.readJson<T>(response);
    if (!response.ok) {
      throw new EsignApiError(`DocuSign API request failed: HTTP ${response.status}`, 'docusign', body);
    }
    return body;
  }

  private async readJson<T>(response: Response): Promise<T> {
    const text = await response.text();
    if (text === '') {
      return {} as T;
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new EsignApiError('DocuSign returned an invalid JSON response', 'docusign');
    }
  }
}

export function createDocusignProvider(): DocusignProvider | null {
  const config: Partial<DocusignConfig> = {
    integrationKey: process.env.DOCUSIGN_INTEGRATION_KEY,
    userId: process.env.DOCUSIGN_USER_ID,
    accountId: process.env.DOCUSIGN_ACCOUNT_ID,
    privateKey: process.env.DOCUSIGN_PRIVATE_KEY,
    basePath: process.env.DOCUSIGN_BASE_PATH ?? 'https://demo.docusign.net/restapi',
    oauthBasePath: process.env.DOCUSIGN_OAUTH_BASE_PATH ?? 'https://account-d.docusign.com',
    webhookSecret: process.env.DOCUSIGN_WEBHOOK_SECRET,
  };
  if (!config.integrationKey || !config.userId || !config.accountId || !config.privateKey) {
    logger.warn('[DocuSign] Provider not configured - missing environment variables');
    return null;
  }
  return new DocusignProvider(config as DocusignConfig);
}
