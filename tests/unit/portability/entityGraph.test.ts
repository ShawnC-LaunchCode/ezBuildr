import { describe, it, expect } from 'vitest';
import { ENTITY_GRAPH, EXCLUDED_TABLES } from '../../../server/services/portability/entityGraph';

describe('Entity Graph Portability', () => {
  it('templates and template_versions declare fileRef as blobRefs', () => {
    const templates = ENTITY_GRAPH.find(e => e.name === 'templates');
    const templateVersions = ENTITY_GRAPH.find(e => e.name === 'template_versions');

    expect(templates?.blobRefs).toContain('fileRef');
    expect(templateVersions?.blobRefs).toContain('fileRef');
  });

  it('all sensitive tables are excluded', () => {
    const sensitiveTables = [
      'datavault_api_tokens', 'refresh_tokens', 'user_credentials',
      'mfa_secrets', 'mfa_backup_codes', 'trusted_devices', 'portal_tokens', 'api_keys',
      'oauth_access_tokens', 'oauth_auth_codes', 'invalidated_tokens', 'sessions',
      'password_reset_tokens', 'email_verification_tokens', 'login_attempts', 'account_locks'
    ];

    for (const table of sensitiveTables) {
      expect(EXCLUDED_TABLES).toHaveProperty(table);
      expect(EXCLUDED_TABLES[table].length).toBeGreaterThan(0);
    }
  });

  it('no sensitive column names are exported in any fields array', () => {
    const sensitiveColumns = [
      'value', 'valueEnc', 'authConfig', 'oauthState', 
      'tokenHash', 'secret', 'passwordHash'
    ];

    for (const entity of ENTITY_GRAPH) {
      for (const col of sensitiveColumns) {
        if (entity.name === 'datavault_values' && col === 'value') {
          continue;
        }
        expect(entity.fields).not.toContain(col);
      }
    }
  });
});


