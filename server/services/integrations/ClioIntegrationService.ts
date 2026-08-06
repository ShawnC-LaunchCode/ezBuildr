import { logger } from '../../logger';
import {
  markConnectionUsed,
  resolveConnection,
} from '../connections';
import { safeFetch } from '../../utils/safeFetch';
import type { ClioContactResult, ClioDocumentResult, ResolvedConnection } from '@shared/types';

import { LegalIntegrationError, providerFailureMessage } from './errors';

type IntegrationHttpClient = (url: string, init?: RequestInit) => Promise<Response>;

interface ClioContactInput {
  type: 'Person' | 'Company';
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
}

interface ClioDocumentInput {
  matterId: number;
  fileName: string;
  contentType: string;
  contentBase64: string;
}

interface ClioDependencies {
  resolve: (projectId: string, connectionId: string) => Promise<ResolvedConnection>;
  request: IntegrationHttpClient;
  markUsed: (connectionId: string) => Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readClioData(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    throw new LegalIntegrationError(
      'Clio returned an unexpected response. Try again or contact support.',
      502,
      'clio_invalid_response',
    );
  }
  return payload.data;
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

export class ClioIntegrationService {
  private readonly dependencies: ClioDependencies;

  constructor(dependencies: Partial<ClioDependencies> = {}) {
    this.dependencies = {
      resolve: dependencies.resolve ?? resolveConnection,
      request: dependencies.request ?? safeFetch,
      markUsed: dependencies.markUsed ?? markConnectionUsed,
    };
  }

  async createContact(
    projectId: string,
    connectionId: string,
    input: ClioContactInput,
  ): Promise<ClioContactResult> {
    const resolved = await this.resolveClioConnection(projectId, connectionId);
    const response = await this.dependencies.request(
      `${resolved.connection.baseUrl}/api/v4/contacts.json`,
      {
        method: 'POST',
        headers: this.authenticatedJsonHeaders(resolved.accessToken),
        body: JSON.stringify({ data: this.buildContactPayload(input) }),
        signal: AbortSignal.timeout(resolved.connection.timeoutMs),
      },
    );

    const payload = await this.readProviderResponse(response, connectionId, 'create contact');
    const data = readClioData(payload);
    const id = getNumber(data.id);
    const name = getString(data.name);
    if (id === undefined || name === undefined) {
      throw new LegalIntegrationError(
        'Clio returned an incomplete contact. Try again or contact support.',
        502,
        'clio_invalid_response',
      );
    }
    await this.dependencies.markUsed(connectionId);
    return {
      id,
      name,
      primaryEmailAddress: getString(data.primary_email_address),
    };
  }

  async fileMatterDocument(
    projectId: string,
    connectionId: string,
    input: ClioDocumentInput,
  ): Promise<ClioDocumentResult> {
    const resolved = await this.resolveClioConnection(projectId, connectionId);
    const fileBytes = Buffer.from(input.contentBase64, 'base64');
    if (fileBytes.length === 0 || fileBytes.length > 5 * 1024 * 1024) {
      throw new LegalIntegrationError(
        'Clio documents must be between 1 byte and 5 MB.',
        400,
        'clio_invalid_document',
      );
    }

    const form = new FormData();
    form.append('data', new Blob([JSON.stringify({
      name: input.fileName,
      parent: { id: input.matterId, type: 'Matter' },
    })], { type: 'application/json' }));
    form.append('file', new Blob([fileBytes], { type: input.contentType }), input.fileName);

    const response = await this.dependencies.request(
      `${resolved.connection.baseUrl}/api/v4/documents.json`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${resolved.accessToken}` },
        body: form,
        signal: AbortSignal.timeout(resolved.connection.timeoutMs),
      },
    );

    const payload = await this.readProviderResponse(response, connectionId, 'file matter document');
    const data = readClioData(payload);
    const id = getNumber(data.id);
    const name = getString(data.name);
    if (id === undefined || name === undefined) {
      throw new LegalIntegrationError(
        'Clio returned an incomplete document. Try again or contact support.',
        502,
        'clio_invalid_response',
      );
    }
    await this.dependencies.markUsed(connectionId);
    return { id, name, matterId: input.matterId };
  }

  private async resolveClioConnection(
    projectId: string,
    connectionId: string,
  ): Promise<ResolvedConnection> {
    const resolved = await this.dependencies.resolve(projectId, connectionId);
    if (resolved.connection.authConfig.provider !== 'clio') {
      throw new LegalIntegrationError('Clio integration not found.', 404, 'clio_not_found');
    }
    if (!resolved.connection.baseUrl || !resolved.accessToken) {
      throw new LegalIntegrationError(
        'Finish Clio authorization before using this integration.',
        409,
        'clio_authorization_required',
      );
    }
    return resolved;
  }

  private authenticatedJsonHeaders(accessToken: string | undefined): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  private buildContactPayload(input: ClioContactInput): Record<string, unknown> {
    const payload: Record<string, unknown> = { type: input.type };
    if (input.type === 'Person') {
      payload.first_name = input.firstName;
      payload.last_name = input.lastName;
    } else {
      payload.name = input.name;
    }
    if (input.email) {
      payload.email_addresses = [{
        name: 'Work',
        address: input.email,
        default_email: true,
      }];
    }
    if (input.phone) {
      payload.phone_numbers = [{
        name: 'Work',
        number: input.phone,
        default_number: true,
      }];
    }
    return payload;
  }

  private async readProviderResponse(
    response: Response,
    connectionId: string,
    operation: string,
  ): Promise<unknown> {
    if (!response.ok) {
      logger.warn({
        provider: 'clio',
        connectionId,
        operation,
        status: response.status,
        requestId: response.headers.get('x-request-id'),
      }, 'Clio integration request failed');
      throw new LegalIntegrationError(
        providerFailureMessage('Clio', response.status),
        response.status === 429 ? 503 : 502,
        'clio_request_failed',
        response.status === 429 || response.status >= 500,
      );
    }
    try {
      return await response.json() as unknown;
    } catch {
      throw new LegalIntegrationError(
        'Clio returned an unreadable response. Try again or contact support.',
        502,
        'clio_invalid_response',
      );
    }
  }
}

export const clioIntegrationService = new ClioIntegrationService();
