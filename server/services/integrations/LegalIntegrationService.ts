import crypto from 'crypto';

import type {
  ClioSetupResponse,
  LegalIntegrationSummary,
  StripeSetupResponse,
} from '@shared/types';

import type { Connection, CreateConnectionInput } from '@shared/types/connections';

import {
  createConnection,
  deleteConnection,
  initiateOAuth2Flow,
  listConnections,
} from '../connections';
import { EsignProviderFactory } from '../esign';
import {
  createSecret,
  deleteSecret,
  type CreateSecretInput,
  type SecretMetadata,
} from '../secrets';

import { LegalIntegrationError } from './errors';

type ClioRegion = 'us' | 'eu' | 'ca' | 'au';

interface ClioSetupInput {
  name: string;
  clientId: string;
  clientSecret: string;
  region: ClioRegion;
}

interface StripeSetupInput {
  name: string;
  secretKey: string;
  webhookSecret: string;
}

interface LegalIntegrationDependencies {
  listConnections: typeof listConnections;
  createConnection: (input: CreateConnectionInput) => Promise<Connection>;
  deleteConnection: typeof deleteConnection;
  createSecret: (input: CreateSecretInput) => Promise<SecretMetadata>;
  deleteSecret: typeof deleteSecret;
  initiateOAuth: typeof initiateOAuth2Flow;
  listEsignProviders: () => string[];
  randomSuffix: () => string;
}

const CLIO_CAPABILITIES = ['Create contacts', 'File documents to matters'];
const STRIPE_CAPABILITIES = ['Create PaymentIntents', 'Confirm payment webhooks'];
const DOCUSIGN_CAPABILITIES = ['Send envelopes', 'Track signature lifecycle', 'Store signed PDFs'];

const CLIO_REGION_BASE_URLS: Record<ClioRegion, string> = {
  us: 'https://app.clio.com',
  eu: 'https://eu.app.clio.com',
  ca: 'https://ca.app.clio.com',
  au: 'https://au.app.clio.com',
};

function providerOf(connection: Connection): unknown {
  return connection.authConfig.provider;
}

export class LegalIntegrationService {
  private readonly dependencies: LegalIntegrationDependencies;

  constructor(dependencies: Partial<LegalIntegrationDependencies> = {}) {
    this.dependencies = {
      listConnections: dependencies.listConnections ?? listConnections,
      createConnection: dependencies.createConnection ?? createConnection,
      deleteConnection: dependencies.deleteConnection ?? deleteConnection,
      createSecret: dependencies.createSecret ?? createSecret,
      deleteSecret: dependencies.deleteSecret ?? deleteSecret,
      initiateOAuth: dependencies.initiateOAuth ?? initiateOAuth2Flow,
      listEsignProviders: dependencies.listEsignProviders
        ?? (() => EsignProviderFactory.getAllProviders()),
      randomSuffix: dependencies.randomSuffix
        ?? (() => crypto.randomUUID().replace(/-/g, '').slice(0, 8)),
    };
  }

  async list(projectId: string): Promise<LegalIntegrationSummary[]> {
    const connections = await this.dependencies.listConnections(projectId);
    const clio = connections.find((connection) => providerOf(connection) === 'clio');
    const stripe = connections.find((connection) => providerOf(connection) === 'stripe');
    const docusignAvailable = this.dependencies.listEsignProviders().includes('docusign');

    return [
      clio ? this.toClioSummary(clio) : {
        provider: 'clio',
        name: 'Clio Manage',
        status: 'not_configured',
        capabilities: CLIO_CAPABILITIES,
      },
      stripe ? this.toStripeSummary(stripe) : {
        provider: 'stripe',
        name: 'Stripe Payments',
        status: 'not_configured',
        capabilities: STRIPE_CAPABILITIES,
      },
      {
        provider: 'docusign',
        name: 'DocuSign',
        status: docusignAvailable ? 'configured' : 'unavailable',
        capabilities: DOCUSIGN_CAPABILITIES,
      },
    ];
  }

  async setupClio(
    projectId: string,
    input: ClioSetupInput,
    applicationBaseUrl: string,
  ): Promise<ClioSetupResponse> {
    await this.assertProviderAvailable(projectId, 'clio', 'Clio');
    const baseUrl = CLIO_REGION_BASE_URLS[input.region];
    const suffix = this.dependencies.randomSuffix();
    const createdSecrets: SecretMetadata[] = [];
    let connection: Connection | undefined;

    try {
      const clientIdSecret = await this.dependencies.createSecret({
        projectId,
        key: `clio-client-id-${suffix}`,
        valuePlain: input.clientId,
        type: 'oauth2',
        metadata: { provider: 'clio', credential: 'client_id' },
      });
      createdSecrets.push(clientIdSecret);
      const clientSecretSecret = await this.dependencies.createSecret({
        projectId,
        key: `clio-client-secret-${suffix}`,
        valuePlain: input.clientSecret,
        type: 'oauth2',
        metadata: { provider: 'clio', credential: 'client_secret' },
      });
      createdSecrets.push(clientSecretSecret);

      const redirectUri = `${applicationBaseUrl}/api/connections/oauth/callback`;
      connection = await this.dependencies.createConnection({
        projectId,
        name: input.name,
        type: 'oauth2_3leg',
        baseUrl,
        authConfig: {
          provider: 'clio',
          region: input.region,
          authUrl: `${baseUrl}/oauth/authorize`,
          tokenUrl: `${baseUrl}/oauth/token`,
          clientIdRef: clientIdSecret.key,
          clientSecretRef: clientSecretSecret.key,
          redirectUri,
        },
        secretRefs: {
          clientId: clientIdSecret.key,
          clientSecret: clientSecretSecret.key,
        },
      });
      const authorization = await this.dependencies.initiateOAuth(
        projectId,
        connection.id,
        applicationBaseUrl,
      );
      return {
        integration: this.toClioSummary(connection),
        authorizationUrl: authorization.authorizationUrl,
      };
    } catch (error: unknown) {
      await this.cleanupFailedSetup(projectId, connection, createdSecrets);
      throw error;
    }
  }

  async setupStripe(projectId: string, input: StripeSetupInput): Promise<StripeSetupResponse> {
    await this.assertProviderAvailable(projectId, 'stripe', 'Stripe');
    const suffix = this.dependencies.randomSuffix();
    const createdSecrets: SecretMetadata[] = [];
    let connection: Connection | undefined;

    try {
      const secretKey = await this.dependencies.createSecret({
        projectId,
        key: `stripe-secret-key-${suffix}`,
        valuePlain: input.secretKey,
        type: 'api_key',
        metadata: { provider: 'stripe', credential: 'secret_key' },
      });
      createdSecrets.push(secretKey);
      const webhookSecret = await this.dependencies.createSecret({
        projectId,
        key: `stripe-webhook-secret-${suffix}`,
        valuePlain: input.webhookSecret,
        type: 'api_key',
        metadata: { provider: 'stripe', credential: 'webhook_secret' },
      });
      createdSecrets.push(webhookSecret);

      connection = await this.dependencies.createConnection({
        projectId,
        name: input.name,
        type: 'bearer',
        baseUrl: 'https://api.stripe.com',
        authConfig: { provider: 'stripe', tokenRef: 'secretKey' },
        secretRefs: {
          secretKey: secretKey.key,
          webhookSecret: webhookSecret.key,
        },
      });
      return { integration: this.toStripeSummary(connection) };
    } catch (error: unknown) {
      await this.cleanupFailedSetup(projectId, connection, createdSecrets);
      throw error;
    }
  }

  async authorizeClio(
    projectId: string,
    connectionId: string,
    applicationBaseUrl: string,
  ): Promise<ClioSetupResponse> {
    const connection = (await this.dependencies.listConnections(projectId))
      .find((candidate) => candidate.id === connectionId && providerOf(candidate) === 'clio');
    if (!connection) {
      throw new LegalIntegrationError('Clio integration not found.', 404, 'clio_not_found');
    }
    const authorization = await this.dependencies.initiateOAuth(
      projectId,
      connectionId,
      applicationBaseUrl,
    );
    return {
      integration: this.toClioSummary(connection),
      authorizationUrl: authorization.authorizationUrl,
    };
  }

  private async assertProviderAvailable(
    projectId: string,
    provider: 'clio' | 'stripe',
    displayName: string,
  ): Promise<void> {
    const connections = await this.dependencies.listConnections(projectId);
    if (connections.some((connection) => providerOf(connection) === provider)) {
      throw new LegalIntegrationError(
        `${displayName} is already configured for this project.`,
        409,
        `${provider}_already_configured`,
      );
    }
  }

  private async cleanupFailedSetup(
    projectId: string,
    connection: Connection | undefined,
    createdSecrets: SecretMetadata[],
  ): Promise<void> {
    if (connection) {
      await this.dependencies.deleteConnection(projectId, connection.id).catch(() => undefined);
    }
    await Promise.all(createdSecrets.map(async (secret) => {
      await this.dependencies.deleteSecret(projectId, secret.id).catch(() => false);
    }));
  }

  private toClioSummary(connection: Connection): LegalIntegrationSummary {
    return {
      id: connection.id,
      provider: 'clio',
      name: connection.name,
      status: connection.oauthState?.accessToken ? 'connected' : 'needs_authorization',
      capabilities: CLIO_CAPABILITIES,
      lastTestedAt: connection.lastTestedAt?.toISOString(),
    };
  }

  private toStripeSummary(connection: Connection): LegalIntegrationSummary {
    return {
      id: connection.id,
      provider: 'stripe',
      name: connection.name,
      status: 'configured',
      capabilities: STRIPE_CAPABILITIES,
      lastTestedAt: connection.lastTestedAt?.toISOString(),
      webhookPath: `/api/integrations/stripe/webhook/${connection.id}`,
    };
  }
}

export const legalIntegrationService = new LegalIntegrationService();
