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

  // IEX-9: refs drives foreign-key remapping on import. A ref column that is not
  // also exported is silently unremappable, so the two lists must stay in step.
  it('every refs column is also declared in that entity fields list', () => {
    for (const entity of ENTITY_GRAPH) {
      for (const col of entity.refs ?? []) {
        expect(
          entity.fields,
          `${entity.name}.refs declares "${col}", which is missing from its fields allowlist`
        ).toContain(col);
      }
    }
  });

  // IEX-13: `scopes` and the parent walk are two independent mechanisms deciding
  // what lands in a bundle, and when they disagree the export silently omits
  // whole subtrees (a project bundle used to carry workflow rows but none of
  // their sections/steps/logic/hooks). Reachability from a scope's root is the
  // source of truth; `scopes` must agree with it in both directions.
  describe('scopes agree with parent-chain reachability', () => {
    const ROOT_OF_SCOPE: Record<string, string> = {
      project: 'projects',
      workflow: 'workflows',
      database: 'datavault_databases',
    };

    // datavault_databases has no FK parent — it attaches by (scopeType, scopeId),
    // so ExportService special-cases it and it is legitimately reachable from
    // every root scope.
    const PARENTLESS_ATTACHED = 'datavault_databases';

    function reachableFrom(scope: string): Set<string> {
      const reached = new Set<string>([ROOT_OF_SCOPE[scope], PARENTLESS_ATTACHED]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const entity of ENTITY_GRAPH) {
          if (entity.parent != null && reached.has(entity.parent.name) && !reached.has(entity.name)) {
            reached.add(entity.name);
            grew = true;
          }
        }
      }
      return reached;
    }

    for (const scope of Object.keys(ROOT_OF_SCOPE)) {
      it(`every entity reachable from the '${scope}' root declares that scope`, () => {
        const reachable = reachableFrom(scope);
        for (const name of reachable) {
          const entity = ENTITY_GRAPH.find(e => e.name === name);
          expect(entity, `${name} is reachable in '${scope}' but missing from ENTITY_GRAPH`).toBeDefined();
          expect(
            entity!.scopes,
            `${name} is reachable from the '${scope}' root but does not declare that scope, so a ${scope} export silently omits it`
          ).toContain(scope);
        }
      });

      it(`no entity declares '${scope}' without being reachable from its root`, () => {
        const reachable = reachableFrom(scope);
        for (const entity of ENTITY_GRAPH) {
          if ((entity.scopes as string[]).includes(scope)) {
            expect(
              reachable,
              `${entity.name} declares scope '${scope}' but is not reachable from '${ROOT_OF_SCOPE[scope]}', so ExportService cannot bound its selection`
            ).toContain(entity.name);
          }
        }
      });
    }
  });

  // IEX-9: jsonRefs are passed through remapJsonIds on import for the same reason.
  it('every jsonRefs column is also declared in that entity fields list', () => {
    for (const entity of ENTITY_GRAPH) {
      for (const col of entity.jsonRefs ?? []) {
        expect(
          entity.fields,
          `${entity.name}.jsonRefs declares "${col}", which is missing from its fields allowlist`
        ).toContain(col);
      }
    }
  });
});


