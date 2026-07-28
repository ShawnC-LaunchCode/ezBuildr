import { it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../../../server/db';
import { createTestFactory, TestFactory } from '../../helpers/testFactory';
import { describeWithDb } from '../../helpers/dbTestHelper';
import { exportService } from '../../../server/services/portability/ExportService';
import { BundleReader } from '../../../server/services/portability/bundleReader';
import { secrets, externalConnections } from '../../../shared/schema';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describeWithDb('ExportService - Secrets and Connections', () => {
  let factory: ReturnType<typeof createTestFactory>;
  let testUserId: string;
  let testTenantId: string;
  let testProjectId: string;

  beforeEach(async () => {
    factory = createTestFactory();
    await db.transaction(async (tx: unknown) => {
      const txFactory = new TestFactory(tx as ConstructorParameters<typeof TestFactory>[0]);
      
      const { tenant, user, project } = await txFactory.createTenant();
      testTenantId = tenant.id;
      testUserId = user.id;
      testProjectId = project.id;

      // Plant a secret
      await (tx as any).insert(secrets).values({
        projectId: testProjectId,
        key: 'TEST_SECRET',
        value: 'sentinel_plaintext',
        valueEnc: 'sentinel_ciphertext',
        type: 'api_key',
        environment: 'production'
      });

      // Plant a connection
      await (tx as any).insert(externalConnections).values({
        tenantId: testTenantId,
        projectId: testProjectId,
        name: 'TEST_CONNECTION',
        type: 'api_key',
        baseUrl: 'https://api.example.com',
        authConfig: { token: 'sentinel_auth_config' },
        oauthState: { state: 'sentinel_oauth_state' },
        enabled: true
      });
    });
  });

  afterEach(async () => {
    await factory.cleanup({ tenantIds: [testTenantId] });
  });

  async function loadBundle(buffer: Buffer) {
    const tmpPath = path.join(os.tmpdir(), `test_bundle_secrets_${Date.now()}_${Math.random()}.ezb`);
    await fs.promises.writeFile(tmpPath, buffer);
    const reader = new BundleReader(tmpPath);
    await reader.open();
    return { reader, tmpPath };
  }

  it('exports secrets without value or valueEnc, and connections without authConfig or oauthState', async () => {
    const buffer = await exportService.export({ scope: 'project', id: testProjectId }, testUserId);
    const { reader, tmpPath } = await loadBundle(buffer);
    
    // Assert requiresReentry manifest field
    const requiresReentry = reader.manifest.requiresReentry;
    expect(requiresReentry).toBeDefined();
    expect(requiresReentry?.length).toBe(2);

    // Pin the whole entry, not a few fields: `requiresReentry` is a versioned
    // part of the bundle format that IEX-8 reads, so an added or dropped field
    // should fail here rather than surface as a surprise on the import side.
    const secretReentry = requiresReentry?.find(r => r.type === 'secret');
    expect(secretReentry).toEqual({
      type: 'secret',
      entity: 'secrets',
      projectId: testProjectId,
      key: 'TEST_SECRET',
      environment: 'production',
      secretType: 'api_key',
    });

    const connReentry = requiresReentry?.find(r => r.type === 'connection');
    expect(connReentry).toEqual({
      type: 'connection',
      entity: 'connections',
      projectId: testProjectId,
      connectionId: expect.any(String),
      connectionName: 'TEST_CONNECTION',
    });

    // Read the raw jsonl streams to assert omitted fields
    const readStreamToString = async (stream: AsyncIterable<unknown>) => {
      let result = '';
      for await (const row of stream) {
        result += `${JSON.stringify(row)}\n`;
      }
      return result;
    };

    const secretsStr = await readStreamToString(reader.readEntityStream('secrets'));
    expect(secretsStr).toContain('TEST_SECRET');
    expect(secretsStr).toContain('api_key');
    expect(secretsStr).not.toContain('sentinel_plaintext');
    expect(secretsStr).not.toContain('sentinel_ciphertext');
    expect(secretsStr).not.toContain('"value"');
    expect(secretsStr).not.toContain('"valueEnc"');

    const connsStr = await readStreamToString(reader.readEntityStream('connections'));
    expect(connsStr).toContain('TEST_CONNECTION');
    expect(connsStr).toContain('https://api.example.com');
    expect(connsStr).not.toContain('sentinel_auth_config');
    expect(connsStr).not.toContain('sentinel_oauth_state');
    expect(connsStr).not.toContain('"authConfig"');
    expect(connsStr).not.toContain('"oauthState"');

    await fs.promises.rm(tmpPath);
  });
});
